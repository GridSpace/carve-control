const status = require('./c-status');
const config = require('./config');
const cmdbus = require('./cmdbus');
const carvera = require('./carvera');

const { carvera_connect, carvera_found, carvera_status, carvera_end } = cmdbus.consts();
const { carvera_ls, carvera_md5, carvera_line_in, carvera_line_out } = cmdbus.consts();
const { debug, log } = require('./logger');

let send;
let shared;
let msg_data;

function setup(state, sender) {
    shared = state;
    send = sender;
}

function handle(message, json) {
    if (json || typeof(message) === 'string') {
        // log('wss message', message, typeof(message), json);
        const msg = json ? message : JSON.parse(message);
        const { ls, rm, download, gcmd, upload, data } = msg;
        if (ls) {
            carvera.ls(ls);
        } else if (rm) {
            carvera.rm(rm);
        } else if (download) {
            carvera.download(download, (output, md5) => {
                send({ filedata: output.toString(), md5 });
            });
        } else if (gcmd) {
            carvera.send(`${gcmd}\n`);
        } else if (upload && msg_data) {
            log({ upload, msg_data: msg_data.length });
            carvera.upload(upload, msg_data, () => {
                send({ uploaded: upload });
            });
        }
        msg_data = undefined;
    } else {
        if (message instanceof ArrayBuffer) {
            // conversion for data coming from web worker
            message = new Uint8Array(message);
        }
        // log('wss message data', message, typeof(message), json);
        msg_data = message;
    }
}

cmdbus.on(carvera_connect, connect => {
    const connected = shared.connected = true;
    send({ connected });
});

cmdbus.on(carvera_end, connect => {
    const connected = shared.connected = false;
    send({ connected });
});

cmdbus.on(carvera_found, found => {
    shared.found = found;
    send({ found });
});

cmdbus.on(carvera_status, status => {
    shared.status = status;
    send({ status });
});

cmdbus.on(carvera_md5, list => {
    send({ md5: list });
});

cmdbus.on(carvera_ls, obj => {
    send(obj);
});

cmdbus.on(carvera_line_in, lines => {
    send({ lines_in: lines });
});

cmdbus.on(carvera_line_out, lines => {
    send({ lines_out: lines });
});

module.exports = {
    setup,
    handle
};
