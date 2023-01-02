const carvera = require('./carvera');
const cmdbus = require('./cmdbus');
const net = require('net');

const { debug, log } = require('./logger');
const { carvera_connect, carvera_data, carvera_end } = cmdbus.consts();

let induced = false;
let clients = [];
let isStarted;
let socket;

function on_connect(client) {
    if (client._connected_) {
        return;
    }
    client._connected_ = true;
    client
        .on('end', () => {
            debug('client end');
            clients = clients.filter(c => c !== client);
            carvera.proxies = clients.length;
            if (induced && clients.length === 0) {
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
}

function start() {
    if (isStarted) {
        return;
    }

    isStarted = true;

    /* connection to real Carvera when client controller connects to us */
    socket = net.createServer(client => {
        log('client connected', client.address());
        clients.push(client);
        carvera.proxies = clients.length;
        if (!carvera.started) {
            induced = true;
        }
        carvera.start();
    }).listen(2222, () => {
        log('started proxy on', 2222);
    });

    cmdbus
        .on(carvera_connect, () => {
            for (let client of clients) {
                on_connect(client);
            }
        })
        .on(carvera_data, data => {
            for (let client of clients) {
                client.write(data);
            }
        })
        .on(carvera_end, () => {
            for (let client of clients) {
                client.end();
            }
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
