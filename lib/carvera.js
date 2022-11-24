/**
 * maintains the socket connection to the Carvera, emits events,
 * periodically polls the machine status which is important for clients,
 * but also prevent idle links being disconnected by the Carvera.
 * provides an API for other modules
 */

const net = require('net');
const md5 = require('md5');
const cmdbus = require('./cmdbus');
const xmodem = require('./xmodem');

const { debug, log } = require('./logger');
const { carvera_upload, carvera_download } = cmdbus.consts();
const { carvera_found, carvera_connect, carvera_data } = cmdbus.consts();
const { carvera_send, carvera_error, carvera_end, carvera_xmit } = cmdbus.consts();

let socket;
let target;
let started = false;
let connected = false;
let xmitting = false;
let lastData = 0;
let keepAlive = 0;
let termChar = 10;

function start(opt = {}) {
    if (started) {
        return;
    }

    if (!(target || opt.socket)) {
        log('missing carvera target');
        return;
    }

    started = true;
    keepAlive = 0;

    const carvera = socket = opt.socket || net.createConnection({ host: target.ip, port: target.port }, () => {
        connected = true;
        cmdbus.emit(carvera_connect, target);
    });

    if (opt.socket) {
        connected = true;
        cmdbus.emit(carvera_connect, { host: "serial", ip: "0", port: "0" });
    }

    const byline = opt.byline || false;
    let linebuf = [];

    carvera
        .on('data', data => {
            lastData = Date.now();
            if (byline && !xmitting) {
                let lni;
                let nlc = 0;
                while ((lni = data.indexOf(termChar)) >= 0) {
                    linebuf.push(data.subarray(0, lni + 1));
                    data = data.subarray(lni + 1);
                    nlc++;
                    termChar = 10;
                }
                if (nlc) {
                    // found new line(s)
                    let out = Buffer.concat(linebuf);
                    linebuf = data.length ? [ data ] : [];
                    // return dangling bytes to the buffer
                    data = out;
                    // log('emit', { linebuf: linebuf.length, data, nlc });
                } else {
                    // log('accu', { linebuf: linebuf.length, data, nlc });
                    linebuf.push(data);
                    // no new lines
                    return;
                }
            }
            cmdbus.emit(carvera_data, data);
        })
        .on('end', () => {
            connected = false;
            started = false;
            cmdbus.emit(carvera_end);
        })
        .on('error', error => {
            cmdbus.emit(carvera_error, error);
        });

    carvera._write_ = carvera.write;
    carvera.write = send;
}

function stop() {
    if (started) {
        socket.end();
        started = false;
    }
}

function send(data) {
    if (!connected) {
        log('unable to send. carvera not connected');
        return;
    }
    if (typeof(data) === 'string') {
        if (xmitting) {
            log('cannot send -- busy xmitting', data);
            return;
        }
        data = Buffer.from(data);
    }
    socket._write_(data);
    cmdbus.emit(carvera_send, data);
}

function ls(path) {
    if (xmitting) {
        log('cannot ls -- busy xmitting');
        return;
    }
    if (path.indexOf('/ud') >= 0 || path.charAt(0) !== '/') {
        // ls of the /ud path locks up the controller
        log('invalid ls path', path);
    } else {
        termChar = 4;
        send(`ls -e -s ${path}\n`);
    }
}

function rm(path) {
    if (xmitting) {
        log('cannot rm -- busy xmitting');
        return;
    }
    if (path.indexOf('/sd/gcodes/') !== 0) {
        log('invalid rm path', path);
    } else {
        send(`rm ${path}\n`);
    }
}

function download(path, receiver) {
    if (xmitting) {
        log('cannot download -- busy xmitting');
        return;
    }
    send(`download ${path}\n`);
    set_xmit(true)
    xmodem.receive(socket, buffers => {
        set_xmit(false)
        const bmap = buffers.map(buffer => {
            return buffer.slice(1, buffer[0] + 1)
        });
        const md5 = bmap.shift();
        const body = Buffer.concat(bmap);
        if (!(md5 && body)) {
            log({ download_error: buffers });
            return;
        }
        debug({ md5: md5.toString(), body: body.length });
        receiver(body, md5.toString());
        cmdbus.emit(carvera_download, path);
    });
}

function pad129(buffer) {
    const b129 = Buffer.alloc(129).fill(0x1a);
    b129[0] = buffer.length;
    b129.set(buffer, 1);
    return b129;
}

function upload(path, buffer, callback) {
    if (xmitting) {
        log('cannot upload -- busy xmitting');
        return;
    }
    if (path.indexOf('/sd/gcodes/') !== 0) {
        log('invalid upload path', path);
        return;
    }
    // do not allow spaces in file names
    path = path.replace(/ /g, '_');
    const md5sum = md5(buffer);
    const output = [ pad129(Buffer.from(md5sum)) ];
    for (let i=0; i<buffer.length; i+= 128) {
        output.push(pad129(buffer.subarray(i, i+128)))
    }
    xmodem.once('stop', () => {
        set_xmit(false)
        if (callback) {
            callback(md5sum)
        }
        cmdbus.emit(carvera_upload, path);
    });
    send(`upload ${path}\n`);
    set_xmit(true)
    xmodem.send(socket, Buffer.concat(output));
    return md5sum;
}

function set_xmit(bool) {
    cmdbus.emit(carvera_xmit, xmitting = bool);
}

const mod = module.exports = {
    get xmitting() { return xmitting },
    get connected() { return connected },
    get started() { return started },
    get socket() { return socket },
    start,
    stop,
    send,
    ls,
    rm,
    upload,
    download
};

setInterval(() => {
    if (mod.connected && !xmitting && Date.now() - lastData > 1500) {
        send('?');
        keepAlive++;
    }
}, 2000);

cmdbus.on(carvera_found, found => target = found);
