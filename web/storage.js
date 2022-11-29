/** Copyright Stewart Allen -- All Rights Reserved */

(function() {

// https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API

let IDB, IRR, local = null;

try {
    IDB = self.indexedDB || self.mozIndexedDB || self.webkitIndexedDB || self.msIndexedDB;
    IRR = self.IDBKeyRange;
} catch (e) {
    debug("IndexedDB disabled: application may not function properly");
}

class DBStore {
    constructor(dbname, options = {}) {
        this.db = null;
        this.name = dbname;
        this.stores = options.stores || [ dbname ];
        this.version = options.version || 1;
        this.queue = [];
        this.idle = [];
        this.initCalled = false;
        this.created = {};
    }

    onIdle(fn) {
        if (this.queue.length) {
            this.idle.push(fn);
        } else {
            fn();
        }
        return this;
    }

    promise(store) {
        let db = this;
        let pc = {
            iterate: (opt = {}) => new Promise(function(resolve, reject) {
                let { lower, upper, collect } = opt;
                if (!collect) {
                    let rval = opt.map ? {} : [];
                    collect = (key, value) => {
                        if (key !== null) {
                            if (opt.map) {
                                rval[key] = value;
                            } else {
                                rval.push({key, value});
                            }
                        } else {
                            resolve(rval);
                        }
                    };
                } else {
                    resolve();
                }
                db.iterate(collect, lower, upper, true, store);
            }),

            get: (key) => new Promise(function(resolve, reject) {
                db.get(key, resolve, store);
            }),

            put: (key, value) => new Promise(function(resolve, reject) {
                db.put(key, value, resolve, store);
            }),

            remove: (key) => new Promise(function(resolve, reject) {
                db.remove(key, resolve, store);
            }),

            // wait for all outstanding transactions to complete
            wait: () => new Promise(function(resolve, reject) {
                db.onIdle(promise);
            }),

            use: (store) => {
                db.use(store);
                return pc;
            },
        };
        return pc;
    }

    keys(callback, lower, upper, store = this.current) {
        if (!this.db) {
            this.init();
            return this.queue.push(["keys", callback, lower, upper, store]);
        }
        let out = [];
        this.iterate(function(k,v) {
            if (k === null) {
                callback(out);
            } else {
                out.push(k);
            }
        }, lower, upper, true, store);
    }

    iterate(callback, lower, upper, nullterm, store = this.current) {
        if (!this.db) {
            this.init();
            return this.queue.push(["iterate", callback, lower, upper, nullterm, store]);
        }
        let range = lower && upper ? IRR.bound(lower,upper) :
                    lower ? IRR.lowerBound(lower) :
                    upper ? IRR.upperBound(upper) : undefined;
        // iterate over all db values for debugging
        this.db
            .transaction(store)
            .objectStore(store)
            .openCursor(range).onsuccess = function(event) {
                let cursor = event.target.result;
                if (cursor) {
                    callback(cursor.key, cursor.value);
                    cursor.continue();
                } else if (nullterm) {
                    callback(null);
                }
            };
    }

    deleteObjectStore() {
        if (this.initCalled) {
            throw "cannot delete ObjectStore after init() called";
        }
        this.version = Number.MAX_SAFE_INTEGER || Number.MAX_VALUE;
        return this.init(true);
    }

    use(store) {
        this.current = store;
        return this;
    }

    init(options = {}) {
        if (this.initCalled) {
            return this;
        }

        let storage = this,
            name = this.name,
            request = null;

        function fallback() {
            debug(`IndexedDB disabled: unable to initialize '${name}'`);
            local = {};
            storage.runQueue();
        }

        try {
            request = IDB.open(name, this.version);

            request.onupgradeneeded = function(event) {
                let db = storage.db = request.result;
                let current = [...db.objectStoreNames];
                let stores = storage.stores;
                // add missing stores
                for (let store of stores) {
                    if (current.indexOf(store) >= 0) {
                        continue;
                    }
                    storage.created[store] = db.createObjectStore(store);
                    storage.current = store;
                    current.push(store);
                    debug({index_added: store});
                }
                // remove obsolete stores
                for (let curr of current) {
                    if (stores.indexOf(curr) < 0) {
                        storage.db.deleteObjectStore(curr);
                        debug({index_dropped: curr});
                    }
                }
                event.target.transaction.oncomplete = function(event) {
                    storage.runQueue();
                };
            };

            request.onsuccess = function(event) {
                storage.current = storage.stores[0];
                storage.db = request.result;
                storage.runQueue();
            };

            request.onerror = function(event) {
                debug({error: event});
                fallback();
            };
        } catch (e) {
            fallback();
            return this;
        }

        this.initCalled = true;
        return this;
    }

    runQueue() {
        if (this.queue.length > 0) {
            let i = 0, q = this.queue, e;
            while (i < q.length) {
                e = q[i++];
                switch (e.shift()) {
                    case 'iterate': this.iterate(...e); break;
                    case 'keys': this.keys(...e); break;
                    case 'put': this.put(...e); break;
                    case 'get': this.get(...e); break;
                    case 'remove': this.remove(...e); break;
                    case 'clear': this.clear(...e);
                }
            }
            this.queue = [];
        }
        while (this.idle.length) {
            this.idle.shift()();
        }
    }

    put(key, value, callback, store = this.current) {
        if (local) {
            local[key] = value;
            if (callback) callback(true);
            return;
        }
        if (!this.db) {
            this.init();
            return this.queue.push(['put', key, value, callback, store]);
        }
        try {
            let req = this.db
                .transaction(store, "readwrite")
                .objectStore(store).put(value, key);
            if (callback) {
                req.onsuccess = function(event) { callback(true) };
                req.onerror = function(event) { callback(false) };
            }
        } catch (e) {
            debug(e);
            if (callback) callback(false);
        }
    }

    get(key, callback, store = this.current) {
        if (local) {
            if (callback) callback(local[key]);
            return;
        }
        if (!this.db) {
            this.init();
            return this.queue.push(['get', key, callback, store]);
        }
        try {
            let req = this.db
                .transaction(store)
                .objectStore(store).get(key);
            if (callback) {
                req.onsuccess = function(event) { callback(req.result) };
                req.onerror = function(event) { callback(null) };
            }
        } catch (e) {
            debug(e);
            if (callback) callback(null);
        }
    }

    remove(key, callback, store = this.current) {
        if (local) {
            delete local[key];
            if (callback) callback(true);
            return;
        }
        if (!this.db) {
            this.init();
            return this.queue.push(['remove', key, callback, store]);
        }
        try {
            let req = this.db
                .transaction(store, "readwrite")
                .objectStore(store).delete(key);
            if (callback) {
                req.onsuccess = function(event) { callback(true) };
                req.onerror = function(event) { callback(false) };
            }
        } catch (e) {
            debug(e);
            if (callback) callback(false);
        }
    }

    clear(key, store = this.current) {
        if (!this.db) {
            this.init();
            return this.queue.push(['clear', store]);
        }
        this.db
            .transaction(store, "readwrite")
            .objectStore(store).clear();
    }
}

exports.storage = {
    Store: DBStore,

    open: function() {
        return new DBStore(...arguments);
    },

    delete: function(dbname) {
        IDB.deleteDatabase(dbname);
    }
};

})();
