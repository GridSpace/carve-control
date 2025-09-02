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
let lastData = Date.now() + 1500;
let termChar = 10;
let waitStatus = 0;
let waitNL = false;
let refresh = 1000;
let proxies = 0;
let sendQ = [];

function start(opt = {}) {
    if (started) {
        return;
    }

    if (!(target || opt.socket)) {
        log('missing carvera target');
        return;
    }

    started = true;

    // opt.socket is the serial interface
    const carvera = socket = opt.socket || net.createConnection({ host: target.ip, port: target.port }, () => {
        connected = true;
        cmdbus.emit(carvera_connect, target);
    });

    // disable nagle
    if (false && socket.setNoDelay) {
        log('DISABLE NAGLE');
        socket.setNoDelay(true);
    }

    const byline = opt.byline || false;
    let linebuf = [];

    carvera
        .on('data', data => {
            lastData = Date.now();
            if (waitNL && data.indexOf(10 /* NL */) >= 0) {
                // prevents '?' during long ops like maybe md5sum
                waitNL = false;
                // log({ wait_nl_off: data.toString() });
            }
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
            if (waitStatus && data.indexOf(60 /* < */) >= 0) {
                waitStatus = 0;
            }
            flushQ();
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

    // synth the connect message when using serial
    if (opt.socket) {
        connected = true;
        cmdbus.emit(carvera_connect, { host: "serial", ip: "0", port: "0" });
    }
}

function stop() {
    if (started) {
        socket.end();
        started = false;
    }
}

function flushQ() {
    while (sendQ.length && waitStatus === 0) {
        log('flush', { waitStatus, data: sendQ[0].length });
        send(sendQ.shift());
    }
}

function pause(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function send(data) {
    if (!connected) {
        cmdbus.emit(carvera_error, "carvera not connected");
        // log({ send_not_connected: data.toString() });
        return;
    }
    lastData = Date.now();
    if (typeof(data) === 'string') {
        if (xmitting) {
            log('cannot send -- busy xmitting', data);
            return;
        }
        data = Buffer.from(data);
    }
    // queue up any outbound data between "?" request and "<...>" response
    if (data.length === 1 && data[0] === 63 /* ? */) {
        waitStatus++;
    } else if (waitStatus) {
        log('queue', { waitStatus, data: data.length });
        sendQ.push(data);
        return;
    } else if (data.indexOf(10) > 0 && data[0] !== 36 /* $ */ && data[0] !== 77 /* M */) {
        // log({ wait_nl_on: data.toString() });
        waitNL = true;
    }
    cmdbus.emit(carvera_send, data);
    return socket._write_(data);
}

function ls(path) {
    if (xmitting) {
        cmdbus.emit(carvera_error, "cannot ls: busy xmit");
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
        cmdbus.emit(carvera_error, "cannot rm: busy xmit");
        return;
    }
    if (path.indexOf('/sd/gcodes/') !== 0) {
        cmdbus.emit(carvera_error, `invalid rm path: ${path}`);
    } else {
        send(`rm ${path}\n`);
    }
}

function md5sum(path) {
    if (xmitting) {
        cmdbus.emit(carvera_error, "cannot md5sum: busy xmit");
        return;
    }
    send(`md5sum ${path}\n`);
}

async function download(path, receiver, md5match) {
    if (xmitting) {
        cmdbus.emit(carvera_error, "cannot download: busy xmit");
        return;
    }
    const split = path.toLowerCase().split('.');
    if (split.length < 2) {
        cmdbus.emit(carvera_error, "cannot download: no file extension");
        return;
    }
    // prevent binary downloads
    const ext = split.pop();
    if (["nc","gcode","default","txt"].indexOf(ext) < 0) {
        cmdbus.emit(carvera_error, `cannot download: invalid file extension "${ext}"`);
        return;
    }
    send(`download ${path}\n`);
    set_xmit(true)
    // start fails if xmodem sends too soon after download request
    await pause(150);
    xmodem.receive(socket, info => {
        const { data, md5, error } = info;
        if (data) {
            cmdbus.emit(carvera_download, path);
        }
        receiver(data ? data.toString() : undefined, md5, error);
        set_xmit(false);
    }, md5match);
}

async function upload(path, buffer, callback) {
    if (xmitting) {
        cmdbus.emit(carvera_error, "cannot upload: busy xmit");
        return;
    }
    if (path.indexOf('/sd/gcodes/') !== 0) {
        cmdbus.emit(carvera_error, `invalid upload path: ${path}`);
        return;
    }
    // special case firmware uploads
    if (path === 'FIRMWARE') {
        path = "/sd/firmware.bin";
    }
    // do not allow spaces in file names
    path = path.replace(/ /g, '_');
    const md5sum = md5(buffer);
    // first block of xmodem send is padded md5sum of body
    const output = [ Buffer.from(md5sum) ];
    for (let i=0; i<buffer.length; i += 8192) {
        output.push(buffer.subarray(i, Math.min(buffer.length, i + 8192)));
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
    // start fails if xmodem sends too soon after download request
    await pause(50);
    xmodem.send(socket, output);
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
    set refresh(v) { refresh = v || 1000 },
    set proxies(v) { proxies = v || 0 },
    start,
    stop,
    send,
    ls,
    rm,
    upload,
    download
};

setInterval(() => {
    if (proxies === 0 && mod.connected && !waitNL && !xmitting && Date.now() - lastData >= refresh) {
        send('?');
    }
}, 50);

cmdbus.on(carvera_found, found => target = found);
