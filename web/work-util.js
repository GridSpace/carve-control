/* serial communications worker */

const exports = self.shared = {};
const encoder = new TextEncoder();
const decoder = new TextDecoder();

importScripts('serial.js');
importScripts('work-bundle.js');

const { logger, md5 } = exports;
const { log, debug } = logger;

const node_inf = { };

function send(message) {
    postMessage(message);
}

this.onmessage = (message) => {
    const { data } = message;
    // log({ work_util_msg: data });
    if (data.md5) {
        send({ md5: md5(data.md5) });
    }
};

logger.quiet(true);
