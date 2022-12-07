function log() {
    console.log(`[-]`, ...arguments);
}

function debug() {
    console.log(`[D]`, ...arguments);
}

function $(id) {
    return document.getElementById(id);
}

function init() {
    $('pair').onclick = pair_port;
    $('serial').onclick = get_serial;
}

async function get_serial() {
    const ports = await navigator.usb.getDevices();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    log({ ports });
    if (!(ports && ports.length)) {
        return;
    }
    const sd = new FTDISerialPort(ports[0]);
    self.test = {
        serial: sd,
        send: string => {
            sd.send(encoder.encode(string));
        }
    };
    sd.open({
        baud: 115200
    }, {
        modem: (modem) => {
            log({ modem });
        },
        line: (line) => {
            log({ line });
        },
        recv: recv => {
            log({ recv, data: decoder.decode(recv) });
        }
    });
}

async function pair_port() {
    const usb = navigator.usb;
    const paired = await usb.getDevices() || [];
    log({ paired });
    const device = paired[0] || usb.requestDevice({
        filters:[{
            vendorId: 0x0403,
            productId: 0x6001
        }]
    });
    log({ device });
}
