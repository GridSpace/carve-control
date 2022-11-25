document.onreadystatechange = status => {
    if (document.readyState === 'complete') {
        connect_command_channel();
        bind_ui();
        bind_ports();
    }
};

const nav = navigator;
const worker = new Worker('worker.js');
const touch = nav.maxTouchPoints > 1 || (/android/i.test(nav.userAgent));
const clamp = (num, min, max) => Math.min(Math.max(num, min), max);
const LS = localStorage;
const exports = {};
const lines = [];

worker.onerror = (err) => {
    $('sys-serial').style.display = 'none';
};

const config = {
    fullscreen: false,
    status: { feed: [] },
    jog_xy: parseInt(LS.jog_xy || 10),
    jog_z: parseInt(LS.jog_z || 10),
    jog_a: parseInt(LS.jog_a || 90),
    file_data: '',
    fails: 0
};

function save_config() {
    LS.jog_xy = config.jog_xy;
    LS.jog_z = config.jog_z;
    LS.jog_a = config.jog_a;
}

function log() {
    console.log('[-]', ...arguments);
}

function debug() {
    console.log('[D]', ...arguments);
}

function $(id) {
    return document.getElementById(id);
}

function send(msg) {
    if (config.serial) {
        worker.postMessage(msg);
    } else if (config.ws) {
        config.ws.send(JSON.stringify(msg));
    } else {
        log({ no_send_channel_for: msg });
    }
}

function sendRaw(buf) {
    if (config.serial) {
        worker.postMessage(buf);
    } else if (config.ws) {
        config.ws.send(buf);
    } else {
        log({ no_send_channel_for: buf });
    }
}

function ls(path) {
    path = '/' + (path || "/sd/gcodes")
        .split('/')
        .filter(p => p)
        .join('/');
    send({ ls: path });
}

function rm(path) {
    send({ rm: path });
    setTimeout(() => {
        omode_cmd();
        ls(config.dir);
    }, 500);
}

function run(path) {
    send({ run: path });
}

function download(path) {
    send({ download: path });
}

function gcmd() {
    for (let gcmd of [...arguments]) {
        send({ gcmd });
    }
}

function upload_file(file) {
    const upload = `${config.dir || "/sd/gcodes/"}${file.name}`;
    const reader = new FileReader()
    reader.readAsArrayBuffer(file);
    reader.onloadend = (event) => {
        sendRaw(event.target.result);
        send({ upload });
        log({ upload, data: event.target.result });
        omode_cmd();
    };
}

function run_file() {
    if (config.selected_file) {
        const { dir, file } = config.selected_file;
        run(`${dir}${file}`);
    }
}

function load_file() {
    if (config.selected_file) {
        const { dir, file } = config.selected_file;
        download(`${dir}${file}`);
    }
}

function delete_file() {
    if (config.selected_file) {
        const { dir, file } = config.selected_file;
        rm(`${dir}${file}`);
    }
}

function select_file(div, dir, file) {
    if (config.selected_file) {
        config.selected_file.div.classList.remove('selected');
    }
    if (div) {
        div.classList.add('selected');
    }
    config.selected_file = div ? { div, dir, file } : undefined;
}

function upload() {
    $('upload-input').click();
}

function omode_cmd() {
    config.omode = 'cmd';
    $('output').innerText = lines.join('\n');
    $('output').scrollTop = $('output').scrollHeight;
}

function omode_file() {
    config.omode = 'file';
    $('output').innerText = config.file_data;
}

function set_feed(value, delta = 0, send = true) {
    value = clamp(parseInt(value) + delta, 50, 200);
    config.status.feed[2] = value;
    if (send) gcmd(`M220 S${value}`);
    $('f-range').value = value;
    $('f-scale').value = `${value}%`;
}

function set_spin(value, delta = 0, send = true) {
    value = clamp(parseInt(value) + delta, 50, 200);
    config.status.spin[2] = value;
    if (send) gcmd(`M223 S${value}`);
    $('s-range').value = value;
    $('s-scale').value = `${value}%`;
}

function set_laser(value, delta = 0, send = true) {
    value = clamp(parseInt(value) + delta, 10, 100);
    config.status.laser[4] = value;
    if (send) gcmd(`M325 S${value}`);
    $('l-range').value = value;
    $('l-scale').value = `${value}%`;
}

function message_handler(message) {
    // log('message', message);
    const { status, found, connected } = message;
    const { lines_in, lines_out } = message;
    const { dir, list, filedata, uploaded } = message;
    if (status) {
        const { state, mpos, wpos, feed, spin, tool, probe, laser } = status;
        config.status = status;
        $('state').innerText = state;
        $('x-world').innerText = wpos[0].toFixed(3);
        $('x-local').innerText = mpos[0].toFixed(3);
        $('y-world').innerText = wpos[1].toFixed(3);
        $('y-local').innerText = mpos[1].toFixed(3);
        $('z-world').innerText = wpos[2].toFixed(3);
        $('z-local').innerText = mpos[2].toFixed(3);
        $('a-world').innerText = mpos[3].toFixed(3);
        $('a-local').innerText = mpos[3].toFixed(3);
        $('f-world').innerText = feed[0].toFixed(0);
        $('f-local').innerText = feed[1].toFixed(0);
        $('s-value').innerText = spin[0].toFixed(0);
        $('s-vacon').innerText = `${spin[2]}%`;
        $('t-index').innerText = tool ? tool[0] : 'None';
        $('t-ofset').innerText = tool && tool[1] ? tool[1].toFixed(3) : `PV: ${probe[0].toFixed(2)}`;
        $('l-world').innerText = laser ? laser[0].toFixed(1) : '0.0';
        $('l-local').innerText = laser ? `${laser[4]}%` : '100%';
        set_feed(feed[2], 0, false);
        set_spin(spin[2], 0, false);
        set_laser(laser ? laser[4] : 100, 0, false)
    } else if (connected !== undefined) {
        $('sys-serial').disabled = connected;
    } else if (found) {
        $('name').innerText = config.found = found.name;
    } else if (dir) {
        config.dir = dir.length ? `/${dir.join('/')}/` : '/';
        const path = [ "/", ...dir ];
        $('path').innerHTML = path.map((d,i) => {
            return `<button path="/${path.slice(1,i+1).join('/')}">${d}</button>`;
        }).join('') + `<span></span><button onclick='upload()'>upload</button>`;
        for (let b of [...$('path').childNodes]) {
            if (!b.onclick) {
                b.onclick = () => {
                    ls(b.getAttribute('path'));
                };
            }
        }
    }
    if (list) {
        $('files').innerHTML = list.map(f => {
            let isDir = f.name.indexOf('/') > 0;
            let file = isDir ? f.name.replace('/','') : f.name;
            let size = isDir ? '' : comma(f.size);
            let attr = isDir ? ' class="dir"' : '';
            return `<div><label${attr}>${file}</label><label>${size}</label></div>`;
        }).join('');
        for (let div of [...$('files').childNodes]) {
            div.onclick = () => {
                let file = div.childNodes[0].innerText;
                let size = div.childNodes[1].innerText;
                if (size === '') {
                    ls(`${config.dir}${file}`);
                } else {
                    select_file(div, config.dir, file);
                    log('load', config.dir, file);
                }
            };
        }
    }
    if (filedata) {
        config.file_data = filedata;
        omode_file();
    }
    if (uploaded) {
        log({ uploaded });
        setTimeout(() => {
            ls(config.dir || "/sd/gcodes");
        }, 500);
    }
    if (lines_in) {
        lines.push(...lines_in.map(l => `<< ${l}`));
    }
    if (lines_out) {
        lines.push(...lines_out.map(l => `>> ${l}`));
    }
    while (lines.length > 50) {
        lines.shift();
    }
    if ((lines_in || lines_out) && config.omode === 'cmd') {
        omode_cmd();
    }
}

function connect_command_channel(urlroot = '') {
    const pre = { "https:": "wss:", "http:": "ws:" }[location.protocol];
    const wss = new WebSocket(`${pre}//${location.host}${urlroot}/socket`);
    wss.onopen = event => {
        // debug('wss open', event);
        config.ws = wss;
        config.connected = true;
        config.fails = 0;
    };
    wss.onmessage = event => {
        message_handler(JSON.parse(event.data));
    };
    wss.onclose = event => {
        $('sys-serial').disabled = false;
        $('sys-usb').disabled = false;
        config.ws = undefined;
        if (config.connected) {
            debug('wss close', event);
        }
        config.connected = false;
        if (config.fails++ < 5) {
            setTimeout(connect_command_channel, 1000);
        }
    }
    wss.onerror = event => {
        if (config.connected) {
            debug('wss error', event);
        }
    }
}

function bind_ui() {
    // STOP: 0x18
    // UNLOCK: $X
    // HOLD: !
    // RESUME: ~

    // config-set sd light.turn_off_min 10.0

    // set work anchor 1 0,0
    // G10 L2 P0 X-360.395 Y-234.765

    // set work anchor 1 @ 10,10
    // G10 L2 P0 X-350.395 Y-224.765

    // set work anchor 2 @ 5,5
    // G10 L2 P0 X-265.395 Y-184.765

    // run with z probe @ xy (path origin) pos @ 5,5
    // [D] [SEND:030] buffer M495 X1.425 Y0.2375 O5 F5[LF]

    // run with z probe @ xy (work origin) pos @ 5,5 and scan margin
    // [D] [SEND:050] buffer M495 X1.425 Y0.2375 C30 D34.7625 O3.575 F4.7625[LF]

    // run with z probe @ xy (work origin) pos @ 4,4
    // [D] [SEND:039] buffer M495 X1.425 Y0.2375 O2.575 F3.7625[LF]

    // run with z probe @ xy (work origin) pos @ 5,5 and scan margin (cut min xy 1,1)
    // [D] [SEND:027] buffer M495 X1 Y1 C10 D10 O4 F4[LF]

    // start job
    // [D] [SEND:028] play /sd/gcodes/cube-005.nc[LF]

    const body = document.body;

    if (touch) {
        body.classList.add('touch');
    }

    $('name').onclick = () => {
        if (config.fullscreen) {
            document.exitFullscreen().then(() => {
                config.fullscreen = false;
            }).catch(err => {
                log({err});
            });
        } else {
            body.requestFullscreen().then(() => {
                config.fullscreen = true;
            }).catch(err => {
                log({err});
            });
        }
    };

    $('sys-stop').onclick = () => { gcmd('\x18') };
    $('sys-reset').onclick = () => { gcmd('reset') };
    $('sys-unlock').onclick = () => { gcmd('$X') };

    const jog_xy = $('jog-xy');
    const jog_z = $('jog-z');
    const jog_a = $('jog-a');

    jog_xy.value = config.jog_xy;
    jog_z.value = config.jog_z;
    jog_a.value = config.jog_a;

    jog_xy.onchange = () => {
        config.jog_xy = parseInt(jog_xy.options[jog_xy.selectedIndex].value);
        save_config();
    };
    jog_z.onchange = () => {
        config.jog_z = parseInt(jog_z.options[jog_z.selectedIndex].value);
        save_config();
    };
    jog_a.onchange = () => {
        config.jog_a = parseInt(jog_a.options[jog_a.selectedIndex].value);
        save_config();
    };

    $('x-add').onclick = () => { gcmd(`G91G0X${config.jog_xy}`)  };
    $('x-sub').onclick = () => { gcmd(`G91G0X-${config.jog_xy}`) };
    $('y-add').onclick = () => { gcmd(`G91G0Y${config.jog_xy}`)  };
    $('y-sub').onclick = () => { gcmd(`G91G0Y-${config.jog_xy}`) };
    $('z-add').onclick = () => { gcmd(`G91G0Z${config.jog_z}`)   };
    $('z-sub').onclick = () => { gcmd(`G91G0Z-${config.jog_z}`)  };
    $('a-add').onclick = () => { gcmd(`G91G0A${config.jog_a}`)   };
    $('a-sub').onclick = () => { gcmd(`G91G0A-${config.jog_a}`)  };

    $('ctrl-home').onclick = () => { gcmd('$H') }
    $('ctrl-clear').onclick = () => { gcmd('M496.1') }
    $('ctrl-origin').onclick = () => { gcmd('M496.2') }
    $('ctrl-anchor1').onclick = () => { gcmd('M496.3') }
    $('ctrl-anchor2').onclick = () => { gcmd('M496.4') }

    $('x-zero').onclick = () => { gcmd('G10L20P0X0') }
    $('y-zero').onclick = () => { gcmd('G10L20P0Y0') }
    $('z-zero').onclick = () => { gcmd('G10L20P0Z0') }
    $('a-zero').onclick = () => { gcmd('G92.4A0')    }
    $('a-shrink').onclick = () => { gcmd('G92.4A0')  }

    $('tool-drop').onclick = () => { gcmd('M6T-1') };
    $('tool-empty').onclick = () => { gcmd('M493.2T-1') };
    $('tool-calibrate').onclick = () => { gcmd('M491') };

    for (let i = 0; i <= 6; i++) {
        $(`tset-${i}`).onclick = () => {
            gcmd(`M493.2T${i}`);
        };
        $(`tchg-${i}`).onclick = () => {
            gcmd(`M6T${i}`);
        };
    }

    $('file-run').onclick = run_file;
    $('file-load').onclick = load_file;
    $('file-delete').onclick = delete_file;

    $('omode-cmd').onclick = omode_cmd;
    $('omode-file').onclick = omode_file;

    $('upload-input').onchange = (ev) => {
        upload_file(event.target.files[0]);
    }

    $('upload').onclick = () => {
        $('upload-input').click();
    };

    $('files').ondrop = (ev) => {
        ev.preventDefault();
        $('files').classList.remove('dragover');
        upload_file(ev.dataTransfer.files[0]);
    };
    $('files').ondragover = (ev) => {
        ev.preventDefault();
        $('files').classList.add('dragover');
        ev.dataTransfer.dropEffect = 'copy';
    };
    $('files').ondragleave = (ev) => {
        ev.preventDefault();
        $('files').classList.remove('dragover');
    };

    $('commands').onchange = (ev) => {
        omode_cmd();
        gcmd(ev.target.value.trim());
        ev.target.value = '';
    };

    $('commands').onkeydown = (ev) => {
        if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
            lines.length = 0;
            omode_cmd();
        }
    };

    $('f-range').onchange = (ev) => {
        set_feed(ev.target.value);
    };
    $('f-add').onclick = () => {
        set_feed(config.status.feed[2] || 100, 10);
    };
    $('f-sub').onclick = () => {
        set_feed(config.status.feed[2] || 100, -10);
    };
    $('f-reset').onclick = () => {
        set_feed(100, 0);
    }
    $('vacon').onclick = () => {
        gcmd('M331');
    };
    $('vacoff').onclick = () => {
        gcmd('M332');
    };

    $('s-range').onchange = (ev) => {
        set_spin(ev.target.value);
    };
    $('s-add').onclick = () => {
        set_spin(config.status.spin[2] || 100, 10);
    };
    $('s-sub').onclick = () => {
        set_spin(config.status.spin[2] || 100, -10);
    };
    $('s-reset').onclick = () => {
        set_spin(100, 0);
    }

    $('l-range').onchange = (ev) => {
        set_laser(ev.target.value);
    };
    $('l-add').onclick = () => {
        set_laser(config.status.laser[4] || 100, 10);
    };
    $('l-sub').onclick = () => {
        set_laser(config.status.laser[4] || 100, -10);
    };
    $('l-reset').onclick = () => {
        set_laser(100, 0);
    }
    $('l-enable').onclick = () => {
        gcmd('m321');
    }
    $('l-disable').onclick = () => {
        gcmd('m322');
    }

    omode_cmd();
}

function bind_ports() {
    if (navigator.usb) {
        $('sys-serial').style.display = 'block';
    }
    $('sys-serial').onclick = bind_serial;
    $('sys-usb').onclick = () => {
        navigator.usb.requestDevice({
            filters:[{
                vendorId: 0x0403,
                productId: 0x6001
            }]
        }).then(p => {
            $('output').innerText = JSON.stringify({ p });
        }).catch(e => {
            log({ error: e });
        });
    };
}

async function bind_serial() {
    let serial = navigator.serial || exports.serial;
    let ports = await serial.getPorts();
    let port = ports && ports[0];
    if (!port) {
        port = await serial.requestPort({
            filters:[{
                usbVendorId: 0x0403,
                usbProductId: 0x6001
            }]
        });
    }
    if (port) {
        log({ port });
        worker.postMessage('serial');
        worker.onmessage = (message) => {
            message_handler(message.data);
        };
        config.serial = true;
    }
}

function comma(v) {
    if (!v) return v;
    let [lt, rt] = v.toString().split('.');
    lt = lt.toString().split('').reverse().map((v, i, a) => {
        return (i < a.length - 1 && i % 3 === 2) ? `,${v}` : v
    }).reverse().join('');
    return rt ? `${lt}.${rt}` : lt;
}
