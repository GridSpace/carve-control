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
            setTimeout(() => {
                analyze(dbop, dbargs, dbdata);
            }, 50);
        });
    }
};

function analyze(dbop, dbargs, dbdata) {
    if (dbop !== 'get') {
        return;
    }
    const key = dbargs[0] || '';
    if (key.indexOf('.nc') < 0 && key.indexOf('.gcode') < 0) {
        return;
    }
    const lines = dbdata.data
        .split('\n')
        .map(l => l.trim())
        .map(l => l.replace(/\t/g, ''))
        .map(l => l.replace(/\s+/g, ' '))
        .map(l => l.split(';')[0].trim())
        .filter(l => l);
    log({ analyze: lines.slice(0,100) });
}

logger.quiet(true);
