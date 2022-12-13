/* serial communications worker */

const exports = self.shared = {};
const decoder = new TextDecoder();

importScripts('serial.js');
importScripts('serial-ftdi.js');
importScripts('work-bundle.js');

const { carvera, logger, web_bus, EventEmitter, md5 } = exports;
const { log, debug, readable } = logger;

const node_inf = { };

function send(message) {
    postMessage(message);
}

web_bus.setup(node_inf, send);

this.onmessage = (message) => {
    const { data } = message;
    switch (data) {
        case 'serial':
            open_port();
            break;
        default:
            web_bus.handle(data, !(data instanceof ArrayBuffer));
            break;
    }
};

logger.quiet(true);

const writeQ = [];
let writing = false;

function delay(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

class SerialSocket extends EventEmitter {
    constructor(send) {
        super();
        this.send = send;
    }

    end(o) {
        log({ socket_end: o });
    }

    async write(buf) {
        writeQ.push(buf);
        if (writing) {
            // log('[ser.reentrant]');
            return;
        }
        writing = true;
        while (writeQ.length) {
            const xmit = writeQ.shift();
            if (xmit.length === 1) {
                // log('command delay', xmit.toString());
                await delay(50);
            }
            await this.send.ready;
            await this.send.write(xmit);
            // log('[ser.send]', xmit.length, readable(xmit) /* decoder.decode(buf) */);
        }
        writing = false;
    }
}

async function open_port() {
    const serial = navigator.serial || exports.ftdi || exports.serial;
    const ports = await serial.getPorts();
    // log({ serial, ports });
    if (ports.length) {
        const port = ports[0];
        await port.open({ baudRate: 115200 });
        setup_port(port);
    }
}

function setup_port(port) {
    const recv = port.readable.getReader();
    const send = port.writable.getWriter();
    const socket = new SerialSocket(send);

    debug('port opened', port, recv, send);

    read_data(recv, data => {
        // log('[ser.recv]', readable(data) /* decoder.decode(data) */);
        socket.emit('data', data);
    });

    carvera.start({ socket, byline: true });
}

async function read_data(recv, ondata) {
    while (true) {
        const { value, done } = await recv.read();
        if (done) {
            break;
        }
        ondata(value);
    }
}
