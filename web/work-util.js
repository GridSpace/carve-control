/* serial communications worker */

const exports = self.shared = {};

importScripts('storage.js');
importScripts('work-bundle.js');

const { logger, md5 } = exports;
const { log, debug } = logger;

const config = { };

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
    const { dbop, dbargs, settings } = data;
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
    if (settings) {
        config.map = settings;
        // log({ worker_settings: settings });
    }
};

// analyze gcode to find bounds
function analyze(dbop, dbargs, dbdata) {
    if (dbop !== 'get' && dbop !== 'put') {
        return;
    }
    if (dbop === 'put') {
        dbdata = dbargs[1];
    }
    if (!dbdata) {
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
    // log({ analyze: lines.slice(0,100), lines: lines.length });
    const map = { config };
    let G0_feed = map.default_seek_rate || 500;
    let G1_feed = map.default_feed_rate || 500;
    const min = { X: Infinity, Y: Infinity, Z: Infinity };
    const max = { X:-Infinity, Y:-Infinity, Z:-Infinity };
    const pos = { X:0, Y:0, Z:0 };
    const job = { axes: 3, dist: 0, time: 0, lines: lines.length };
    let scale = 1;
    let feed = G0_feed;
    let moveabs = true;
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
            } else if ((ch >= '0' && ch <= '9') || ch === '.' || ch === '-') {
                cv += ch;
            }
        }
        if (cv.length) {
            map[cc] = parseFloat(cv);
        }
        switch (map.G) {
            case 0: feed = G0_feed = map.F || G0_feed; break;
            case 1: feed = G1_feed = map.F || G1_feed; break;
            case 20: scale = 25.4; break;
            case 21: scale = 1; break;
            case 90: moveabs = true; break;
            case 91: moveabs = false; break;
        }
        const lastPos = { X: pos.X, Y: pos.Y };
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
        if (map.G === 0 || map.G === 1) {
            const dx = pos.X - lastPos.X;
            const dy = pos.Y - lastPos.Y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            job.dist += dist;
            job.time += dist * (feed / 6000);
        }
        if (map.A !== undefined) {
            // todo: add time which is max of XYZ transit and A transit
            // using the A feed/seek rate limit when all combined
            job.axes = 4;
        }
    }
    const span = { X: max.X - min.X, Y: max.Y - min.Y, Z: max.Z - min.Z };
    // log({ min, max, job, time: Date.now() - now });
    send({ bounds: { min,  max, span }, job });
}

logger.quiet(true);
