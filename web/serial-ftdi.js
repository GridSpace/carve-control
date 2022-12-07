(function() {

/**
 * constants and docs: linux kernel drivers and two OS/GH projects
 * https://github.com/google/web-serial-polyfill
 * https://github.com/Shaped/webusb-ftdi
 *
 * the web-serial-polyfill project is open to non-standard drivers
 * like this if an abstraction can be crafted to make them pluggable
 */

let BAUD_BASE = 48000000,

    RESET              = 0x00, // Reset port
    MODEM_CTRL         = 0x01, // Set modem control register
    SET_FLOW_CTRL      = 0x02, // Set flow control register
    SET_BAUD_RATE      = 0x03, // Set baud rate
    SET_DATA           = 0x04, // Set the data characteristics of the port
    GET_MODEM_STATUS   = 0x05, // Retrieve value of modem status register
    SET_EVENT_CHAR     = 0x06, // Set event character
    SET_ERROR_CHAR     = 0x07, // Set error character
    SET_LATENCY_TIMER  = 0x09, // Set latency timer
    GET_LATENCY_TIMER  = 0x0a, // Get latency timer
    SET_BITMODE        = 0x0b, // Set bitbang mode
    READ_PINS          = 0x0c, // Read pins
    READ_EEPROM        = 0x90, // Read EEPROM

    RESET_SIO = 0,
    RESET_PURGE_RX = 1,
    RESET_PURGE_TX = 2,

    PARITY = {
        none:  0,
        odd:   0x1 << 8,
        even:  0x2 << 8,
        mark:  0x3 << 8,
        space: 0x4 << 8
    },
    STOP = {
        [1]:  0,
        [15]: 0x1 << 11,
        [2]:  0x2 << 1
    },
    DATA_BREAK = (0x1 << 14),

    SET_DTR_MASK   = 0x1,
    SET_DTR_HIGH   = ((SET_DTR_MASK << 8) | 1),
    SET_DTR_LOW    = ((SET_DTR_MASK << 8) | 0),
    SET_RTS_MASK   = 0x2,
    SET_RTS_HIGH   = ((SET_RTS_MASK << 8) | 2),
    SET_RTS_LOW    = ((SET_RTS_MASK << 8) | 0),

    DISABLE_FLOW   = 0x0,
    RTS_CTS_HS     = (0x1 << 8),
    DTR_DSR_HS     = (0x2 << 8),
    XON_XOFF_HS    = (0x4 << 8),

    CTS_MASK       = 0x10,
    DSR_MASK       = 0x20,
    RI_MASK        = 0x40,
    RLSD_MASK      = 0x80,

    BITMODE_RESET  = 0x00,
    BITMODE_CBUS   = 0x20,

    // modem status
    RS_CTS   = (1 << 4),   // clear to send (CTS)
    RS_DSR   = (1 << 5),   // data set ready (DSR)
    RS_RI    = (1 << 6),   // ring indicator (RI)
    RS_RLSD  = (1 << 7),   // receive line signal detect (RLSD)

    // line status
    RS_DR    = 1;           // data ready (DR)
    RS_OE    = (1 << 1),    // overrun error (OE)
    RS_PE    = (1 << 2),    // parity error (PE)
    RS_FE    = (1 << 3),    // framing error (FR)
    RS_BI    = (1 << 4),    // break interrupt (BI)
    RS_THRE  = (1 << 5),    // transmitter holding register (THRE)
    RS_TEMT  = (1 << 6),    // transmitter empty (TEMT)
    RS_FIFO  = (1 << 7);    // error in receiver fifo

function noop() { }

function baud_div3(baud2) {
    const base = BAUD_BASE;
    return ((base - 1) > 0 || (baud2 - 1) > 0 || ((base > 0) == ((baud2) > 0))) ?
        ((base + (baud2 / 2)) / baud2) : ((base - (baud2 / 2)) / baud2);
}

function baud_divisor(baud) {
    const div3 = baud_div3(2 * baud);
    const divisor = (div3 >> 3) | ([0,3,2,4,1,5,6,7][div3 & 0x7] << 14);
    if (divisor == 1) {
        divisor = 0;
    } else if (divisor == 0x4001) {
        divisor = 1;
    }
    return divisor;
}

class FTDISerialPort {
    constructor(device) {
        this.device = device;
        this.interface = 0;
        this.endpointIn = 0;
        this.endpointOut = 0;
        this.modemStatus;
        this.lineStatus;
    }

    async cti(request, value, index, length) {
        // console.log('cti', request, value, index, length);
        let res = await this.device.controlTransferIn({
            requestType: 'vendor',
            recipient: 'device',
            request,
            value,
            index
        }, length);
        return new Uint8Array(res.data.buffer);
    }

    async cto(request, value, index) {
        // console.log('cto', request, value, index);
        return await this.device.controlTransferOut({
            requestType: 'vendor',
            recipient: 'device',
            request,
            value,
            index
        });
    }

    async reset(type = 0) {
        return this.cto(
            RESET,
            RESET_SIO,
            type
        );
    }

    async setBaud(baud) {
        return this.cto(
            SET_BAUD_RATE,
            baud_divisor(baud),
            BAUD_BASE
        );
    }

    // bits, parity, stop, flow control mode
    async setData(bits, parity, stop, flow) {
        const val = 0
            | (bits & 0xff)
            | (PARITY[parity.toLowerCase()] || 0)
            | (STOP[stop] || 0)
            | (flow === 'hardware' ? DATA_BREAK : 0);
        return this.cto( SET_DATA, val, 0 );
    }

    async setSignals(opt = {}) {
        const dtr = opt.dataTerminalReady;
        const rts = opt.requestToSend;
        const val = 0
            | (dtr !== undefined ? (dtr ? SET_DTR_HIGH : SET_DTR_LOW) : 0)
            | (rts !== undefined ? (rts ? SET_RTS_HIGH : SET_RTS_LOW) : 0);
        return this.cto( MODEM_CTRL, val, 0 );
    }

    async setFlowControl(val) {
        return this.cto( SET_FLOW_CTRL, val, 0 );
    }

    async getLatencyTimer() {
        return this.cti( GET_LATENCY_TIMER, 0, 0, 1 )[0];
    }

    async setLatencyTimer(ms) {
        return this.cto( SET_LATENCY_TIMER, ms, 0 );
    }

    async open(config = {}, events = {}) {
        const onModem = this.onModem = events.modem || noop;
        const onLine = this.onLine = events.line || noop;
        const onRecv = events.receive || events.recv;

        const device = this.device;

        await device.open();
        if (device.configuration === null) {
            await device.selectConfiguration(1);
        }

        let intface, epIn, epOut;
        for (let element of device.configuration.interfaces) {
            for (let elementalt of element.alternates) {
                if (elementalt.interfaceClass == 0xff) {
                    this.interface = intface = element.interfaceNumber;
                    for (let ep of elementalt.endpoints) {
                        if (ep.direction == "out") {
                            this.endpointOut = epOut = ep.endpointNumber;
                        }
                        if (ep.direction == "in") {
                            this.endpointIn = epIn = ep.endpointNumber;
                        }
                    }
                }
            }
        }

        await device.claimInterface(intface);
        await device.selectAlternateInterface(intface, 0);
        await this.reset();
        await this.setBaud(
            config.baud   || config.baudRate    || 115200);
        await this.setData(
            config.bits   || config.dataBits    || 8,
            config.parity || 'none',
            config.stop   || config.stopBits    || 1,
            config.flow   || config.flowControl || "none"
        );
        await this.setLatencyTimer(16);

        if (onRecv) {
            (async () => {
                while (true) {
                    onRecv(await this.poll());
                }
            })();
        }

        return device;
    }

    async send(data) {
        return await this.device.transferOut(this.endpointOut, data);
    }

    async poll() {
        while (true) {
            const result = await this.device.transferIn(this.endpointIn, 64);
            const resultArray = new Uint8Array(result.data.buffer);
            const newModemStatus = resultArray[0];
            const newLineStatus = resultArray[1];

            if (newModemStatus !== this.modemStatus) {
                this.modemStatus = newModemStatus;
                this.onModem(newModemStatus);
            }

            if (newLineStatus !== this.lineStatus) {
                this.lineStatus = newLineStatus;
                this.onLine(newLineStatus);
            }

            if (resultArray.length > 2) {
                return resultArray.slice(2);
            }
        }
    }

    async close() {
        return this.device.close();
    }

    get readable() {
        const port = this;
        return {
            getReader() {
                if (!port.reader) {
                    port.reader = new FTDISerialReader(port);
                }
                return port.reader;
            }
        }
    }

    get writable() {
        const port = this;
        return {
            getWriter() {
                if (!port.writer) {
                    port.writer = new FTDISerialWriter(port);
                }
                return port.writer;
            }
        }
    }

    get status() {
        const modem = this.modemStatus;
        const line = this.lineStatus;
        return {
            modem: {
                CTS:  modem & RS_CTS,
                DSR:  modem & RS_DSR,
                RI:   modem & RS_RI,
                RLSD: modem & RS_RLSD
            },
            line: {
                DR:   line & RS_DR,
                OE:   line & RS_OE,
                PE:   line & RS_PE,
                FE:   line & RS_FE,
                BI:   line & RS_BI,
                THRE: line & RS_THRE,
                TEMT: line & RS_TEMT,
                FIFO: line & RS_FIFO
            }
        };
    }
}

class FTDISerialReader {
    constructor(port) {
        this.port = port;
    }

    async read() {
        const value = await this.poll();
        return { value };
    }
}

class FTDISerialWriter {
    constructor(port) {
        this.port = port;
    }

    async ready() {
        return;
    }

    async write(data) {
        const port = this.port;
        for (let i=0, l=data.length; i<l; i++) {
            await this.ready()
            await port.send(data.slice(i, i + 64));
            i += 64;
        }
    }
}

self.FTDISerialPort = FTDISerialPort;

if (!self.exports) {
    return;
}

const ftdi = exports.ftdi = {
    devices: [],

    async getPorts() {
        return ftdi.devices.map(d => d._port);
    },

    async requestPort(options = {}) {
        const filters = options.filters || [{
            usbVendorId: 0x0403,
            usbProductId: 0x6001,
        }].map(rec => {
            if (rec.usbVendorId) {
                rec.vendorId = rec.usbVendorId;
                delete rec.usbVendorId;
            }
            if (rec.usbProductId) {
                rec.productId = rec.usbProductId;
                delete rec.usbProductId;
            }
            return rec;
        });
        try {
            const device = navigator.usb.requestDevice({ filters });
            if (!ftdi.devices.includes(device)) {
                ftdi.devices.push(device);
                device._port = new FTDISerialPort(device);
            }
            return device._port;
        } catch (err) {
            throw err;
        }
    }
}

})();
