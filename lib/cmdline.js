/**
 * command line utility for testing and debugging
 */

const readline = require('readline');
const carvera = require('./carvera');
const cmdbus = require('./cmdbus');
const status = require('./c-status');
const xmodem = require('./xmodem');
const net = require('net');

const { inspect, debug, log } = require('./logger');
const { carvera_status } = cmdbus.consts();

let started;

cmdbus.on(carvera_status, status => {
    mod.status = status;
});

function isConnected() {
    if (carvera.connected) {
        return true;
    } else {
        log('not connected to carvera');
    }
}

function start() {
    if (started) {
        return;
    }

    started = true;

    log('starting command line listener');

    readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false
    }).on('line', (line) => {
        let conn = mod.sock;
        const cmd = line.split(' ');
        switch (cmd[0]) {
            case 'connect':
                carvera.start();
                break;
            case 'info':
                if (isConnected()) {
                    carvera.send("time\n");
                    carvera.send("version\n");
                    carvera.send("help\n");
                    carvera.send("ls -e -f\n");
                    carvera.send("?");
                }
                break;
            case 'ls':
                if (isConnected()) {
                    if (cmd[1]) {
                        carvera.ls(cmd[1]);
                    } else {
                        carvera.ls('/');
                    }
                }
                break;
            case 'disconnect':
            case 'bye':
            case 'end':
                carvera.stop();
                break;
            case 'updown':
                const rnd = Buffer.alloc(128*4);
                for (let i=0; i<rnd.length; i++) {
                    rnd[i] = (Math.random() * 255) | 0;
                }
                carvera.upload("/sd/gcodes/random", rnd, md5i => {
                    setTimeout(() => {
                        carvera.download("/sd/gcodes/random", (out, md5o) => {
                            log({ md5i, md5o });
                            log({ rnd, out });
                            log({ compare: Buffer.compare(rnd, out) })
                        });
                    }, 1000);
                });
                break;
            case 'download':
                if (isConnected()) {
                    const file = cmd[1] || '/sd/gcodes/test.gcode';
                    log('...downloading', file);
                    carvera.download(file, output => {
                        log({ downloaded: output.toString() });
                    });
                }
                break;
            case 'upload':
                if (isConnected()) {
                    log('...uploading sample');
                    carvera.upload(
                        "/sd/gcodes/sample.gcode",
                        new TextEncoder().encode("time\r\nversion\r\nG90\r\n")
                    );
                }
                break;
            case 'status':
                log('status', mod.status);
                break;
            case '':
                if (isConnected()) {
                    carvera.send('\n');
                }
                break;
            default:
                if (isConnected()) {
                    carvera.send(`${cmd.join(' ')}\n`);
                }
                break;
        }
    }).once('close', () => {
        log('stdin closd');
    });
}

const mod = module.exports = {
    start
};
