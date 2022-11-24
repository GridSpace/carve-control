const carvera = require('./carvera');
const cmdbus = require('./cmdbus');
const net = require('net');

const { debug, log } = require('./logger');
const { carvera_connect, carvera_data, carvera_end } = cmdbus.consts();

let isStarted;
let socket;

function start() {
    if (isStarted) {
        return;
    }

    isStarted = true;

    /* connection to real Carvera when client controller connects to us */
    socket = net.createServer(client => {
        log('client connected', client.address());

        /* ensure connection to Carvera as a proxy for client controller */
        const started = { carvera };
        carvera.start();
        cmdbus
        .on(carvera_connect, () => {
            client
                .on('end', () => {
                    debug('client end');
                    if (!started) {
                        // only stop() if the client connection
                        // induced a new connection instead of
                        // re-using an existing one
                        carvera.stop();
                    }
                })
                .on('data', data => {
                    carvera.send(data);
                })
                .on('error', error => {
                    debug('client error', error);
                });
        })
        .on(carvera_data, data => {
            client.write(data);
        })
        .on(carvera_end, () => {
            client.end();
        });
    }).listen(2222, () => {
        log('started proxy on', 2222);
    });
}

function stop() {
    if (isStarted) {
        isStarted = false;
        socket.close();
        socket = undefined;
    }
}

const mod = module.exports = {
    get started() { return isStarted },
    get socket() { return socket },
    start,
    stop
};
