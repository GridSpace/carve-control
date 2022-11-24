const netinfo = require('./netinfo');
const cmdbus = require('./cmdbus');
const dgram = require('dgram');

const { debug, log } = require('./logger');
const { carvera_found } = cmdbus.consts();

let started = false;
let found;

const mod = module.exports = {
    get started() { return started },
    get found() { return found },
    start,
};

function start() {
    if (started) {
        return;
    }
    started = true;
    log('starting locator on', 3333);
    const udpmon = dgram.createSocket('udp4')
        .on('error', (err) => {
            udpmon.close();
        })
        .on('message', (msg, rinfo) => {
            const [ name, ip, port ] = msg.toString().split(',');
            if (ip !== netinfo.myip && !found) {
                found = { name, ip, port };
                cmdbus.emit(carvera_found, found);
            }
        })
        .on('listening', () => {
            const address = udpmon.address();
            debug(`udp listening ${address.address}:${address.port}`);
        })
        .bind(3333);
}
