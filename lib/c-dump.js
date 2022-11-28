/**
 * monitors the Carvera data, send events and logs them to a file
 */

const fs = require('fs').promises;
const cmdbus = require('./cmdbus');
const mark = Date.now();

const { readable, debug, log } = require('./logger');
const { carvera_connect, carvera_data, carvera_send } = cmdbus.consts();

let output;

function tstamp() {
    const diff = Date.now() - mark;
    const sec = (diff / 1000) | 0;
    const msec = diff - (sec * 1000);
    return `[${sec.toString().padStart(4,0)}.${msec.toString().padStart(3,0)}] `;
}

async function start(path) {
    log({ dump: path });
    output = (await fs.open(path, 'a')).createWriteStream();
    output.write(`---( ${new Date().toString()} )---\n`);
}

cmdbus.on(carvera_data, data => {
    output.write('<< ');
    output.write(tstamp());
    output.write(readable(data));
    output.write('\n');
});

cmdbus.on(carvera_send, data => {
    output.write('>> ');
    output.write(tstamp());
    output.write(readable(data));
    output.write('\n');
});

const mod = module.exports = { 
    start
};
