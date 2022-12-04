/**
 * monitors the Carvera connect, synthesizes input, output, status events
 */

const cmdbus = require('./cmdbus');
const carvera = require('./carvera');

const { doDebug, readable, clean, debug, log } = require('./logger');
const { carvera_status, carvera_connect, carvera_end } = cmdbus.consts();
const { carvera_data, carvera_send, carvera_error } = cmdbus.consts();
const { carvera_ls, carvera_md5, carvera_line_in, carvera_line_out } = cmdbus.consts();

let lastRecv;
let listDir;
let list;
let md5;

const keymap = {
    'MPos': 'mpos',  // X, Y, Z, A, B
    'WPos': 'wpos',  // X, Y, Z, A, B
    'F': 'feed',     // current, target, scale
    'S': 'spin',     // current, target, scale, ?, ?
    'T': 'tool',     // number, offset
    'L': 'laser',    // current, target, scale, ?
    'W': 'probe',    // voltage
    'P': 'play',     // lines, chars, seconds
    'A': 'setup',    // job prep state (tool change?)
    'H': 'halt',     // halt condition
};

function send_lines() {
    return !(carvera.xmitting || list);
}

cmdbus.on(carvera_connect, found => {
    log('connected to carvera', found.ip, found.port);
});

cmdbus.on(carvera_data, data => {
    let recv = readable(data);
    if (recv !== lastRecv) {
        const lt = recv.indexOf('<');
        const gt = recv.indexOf('>');
        if (lt === 0 && gt > lt) {
            // log({ rawstat: recv });
            let status = { };
            recv.substring(1,gt)
                .split('|')
                .forEach((v,i) => {
                    if (i === 0) {
                        let refresh = {
                            'Run': 200,
                            'Idle': 1000
                        }[v] || 2000;
                        carvera.refresh = refresh;
                        return status.state = v;
                    }
                    let [ key, val ] = v.split(':');
                    status[ keymap[key] ] = val.split(',').map(v => parseFloat(v));
                });
            // log(status);
            cmdbus.emit(carvera_status, status);
        } else {
            doDebug() && debug(`[RECV:${(data.length).toString().padStart(3,0)}]`, recv);
            if (send_lines()) {
                // send cleaned up line output
                let lines = clean(data).split('\n').map(l => l.trim()).filter(l => l);
                if (lines.length) {
                    cmdbus.emit(carvera_line_out, lines);
                }
            }
        }
        lastRecv = recv;
    }
    if (list) {
        const str = clean(data);
        if (str.length) {
            const files = str.trim()
                .split('\n')
                .map(v => v.trim())
                .map(v => {
                    const split = v.split(' ');
                    const [ name, size ] = split;
                    const [ md5sum, file ] = split;
                    return md5 ? { md5sum, file } : { name, size };
                })
                .filter(r => r.name !== "ud/");
            list.push(...files);
        }
    }
    if (md5 && list && list.length) {
        cmdbus.emit(carvera_md5, list[0]);
        list = md5 = undefined;
    }
    if (list && data.indexOf(4) >= 0) {
        cmdbus.emit(carvera_ls, { list, dir: listDir });
        list = undefined;
    }
});

cmdbus.on(carvera_send, data => {
    const send = readable(data);
    if (send === '?') {
        return;
    }
    doDebug() && debug(`[SEND:${(data.length).toString().padStart(3,0)}]`, send);
    const str = data.toString();
    const cmd = str.trim().split(' ');
    if (cmd[0] === 'ls') {
        list = [];
        let dir = cmd.pop();
        if (dir.charAt(0) === '-') {
            listDir = [];
        } else {
            listDir = dir.split('/').filter(v => v);
        }
    } else if (cmd[0] === 'md5sum') {
        list = [];
        md5 = true;
    } else if (send_lines()) {
        let lines = clean(data).split('\n').map(l => l.trim()).filter(l => l);
        if (lines.length) {
            cmdbus.emit(carvera_line_in, lines);
        }
    }
});

cmdbus.on(carvera_end, () => {
    debug('carvera end');
})

cmdbus.on(carvera_error, error => {
    debug('carvera error', error);
});


const mod = module.exports = { };
