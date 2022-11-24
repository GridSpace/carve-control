const cmdbus = require('./cmdbus');
const dgram = require('dgram');

const { debug, log } = require('./logger');
const { myip, bcast } = require('./netinfo');
const { carvera_found } = cmdbus.consts();

let started = false;
let target;
let socket;

function start() {
    if (started) {
        return;
    }

    started = true;

    log('starting spoofer on', 4444);

    /* setup broadcaster to present ourselves as a Carvera machine */
    const sock = socket = dgram.createSocket('udp4')
        .on('error', (err) => {
            sock.close();
        })
        .on('message', (msg, rinfo) => {
            debug(`udp <<<< ${msg} from ${rinfo.address}:${rinfo.port}`);
        })
        .on('listening', () => {
            sock.setBroadcast(true);
            const address = sock.address();
            debug(`udp listening ${address.address}:${address.port}`);
        })
        .bind(4444);

    setInterval(() => {
        if (started) {
            const name = target ? target.name : undefined;
            const announce = name ? `PROXY ${name}` : `PROXY`;
            sock.send(`${announce},${myip},2222,0`, 3333, bcast, err => {
                if (err) debug('udp send error', err);
            });
        }
    }, 500);
}

function stop() {
    started = false;
    socket.close();
    socket = undefined;
}

const mod = module.exports = {
    get started() { return started },
    get socket() { return socket },
    start,
    stop
};

cmdbus.on(carvera_found, found => target = found);
