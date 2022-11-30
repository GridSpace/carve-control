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
        .map(l => l
            .split(';')[0]
            .replace(/\t/g, '')
            .replace(/\s+/g, '')
            .toUpperCase()
        )
        .filter(l => l);
    log({ analyze: lines.slice(0,100), lines: lines.length });
    const min = { X: Infinity, Y: Infinity, Z: Infinity };
    const max = { X:-Infinity, Y:-Infinity, Z:-Infinity };
    const pos = { X:0, Y:0, Z:0 };
    let moveabs = true;
    let scale = 1;
    const now = Date.now();
    for (let line of lines) {
        let cc, cv, map = {};
        for (let i=0, l=line.length; i<l; i++) {
            let ch = line.charAt(i);
            if (ch >= 'A' && ch <= 'Z') {
                if (cv && cv.length) {
                    map[cc] = parseFloat(cv);
                }
                cc = ch;
                cv = '';
            } else if ((ch >= '0' && ch <= '9') || ch === '.') {
                cv += ch;
            }
        }
        if (cv.length) {
            map[cc] = parseFloat(cv);
        }
        switch (map.G) {
            case 20: scale = 25.4; break;
            case 21: scale = 1; break;
            case 90: moveabs = true; break;
            case 91: moveabs = false; break;
        }
        if (map.X !== undefined) {
            pos.X = (moveabs ? map.X * scale : pos.X + map.X * scale);
            min.X = Math.min(min.X, pos.X);
            max.X = Math.max(max.X, pos.X);
        }
        if (map.Y !== undefined) {
            pos.Y = (moveabs ? map.Y * scale : pos.Y + map.Y * scale);
            min.Y = Math.min(min.Y, pos.Y);
            max.Y = Math.max(max.Y, pos.Y);
        }
        if (map.Z !== undefined) {
            pos.Z = (moveabs ? map.Z * scale : pos.Z + map.Z * scale);
            min.Z = Math.min(min.Z, pos.Z);
            max.Z = Math.max(max.Z, pos.Z);
        }
    }
    // log({ min, max, time: Date.now() - now });
    send({ bounds: { min,  max }});
}

logger.quiet(true);
