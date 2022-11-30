/* serial communications worker */

const exports = self.shared = {};

importScripts('storage.js');
importScripts('work-bundle.js');

const { logger, md5 } = exports;
const { log, debug } = logger;

const dbase = exports.storage
    .open("cctrl", { stores:[ "cache" ] })
    .init()
    .promise("cache");

function send(message) {
    postMessage(message);
}

this.onmessage = (message) => {
    const { data } = message;
    // log({ work_util_msg: data });
    const { dbop, dbargs } = data;
    if (data.md5) {
        send({ md5: md5(data.md5) });
    }
    if (dbop && dbargs) {
        dbase[dbop](...dbargs).then(dbdata => {
            send({ dbop, dbdata });
        });
    }
};

logger.quiet(true);
