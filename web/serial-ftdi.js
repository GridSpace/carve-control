(function() {

let BAUD_BASE = 48000000,

    FTDI_RESET              = 0x00, // Reset port
    FTDI_MODEM_CTRL         = 0x01, // Set modem control register
    FTDI_SET_FLOW_CTRL      = 0x02, // Set flow control register
    FTDI_SET_BAUD_RATE      = 0x03, // Set baud rate
    FTDI_SET_DATA           = 0x04, // Set the data characteristics of the port
    FTDI_GET_MODEM_STATUS   = 0x05, // Retrieve value of modem status register
    FTDI_SET_EVENT_CHAR     = 0x06, // Set event character
    FTDI_SET_ERROR_CHAR     = 0x07, // Set error character
    FTDI_SET_LATENCY_TIMER  = 0x09, // Set latency timer
    FTDI_GET_LATENCY_TIMER  = 0x0a, // Get latency timer
    FTDI_SET_BITMODE        = 0x0b, // Set bitbang mode
    FTDI_READ_PINS          = 0x0c, // Read pins
    FTDI_READ_EEPROM        = 0x90, // Read EEPROM

    FTDI_RESET_SIO = 0,
    FTDI_RESET_PURGE_RX = 1,
    FTDI_RESET_PURGE_TX = 2,

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

    FTDI_SET_DTR_MASK   = 0x1,
    FTDI_SET_DTR_HIGH   = ((FTDI_SET_DTR_MASK << 8) | 1),
    FTDI_SET_DTR_LOW    = ((FTDI_SET_DTR_MASK << 8) | 0),
    FTDI_SET_RTS_MASK   = 0x2,
    FTDI_SET_RTS_HIGH   = ((FTDI_SET_RTS_MASK << 8) | 2),
    FTDI_SET_RTS_LOW    = ((FTDI_SET_RTS_MASK << 8) | 0),

    FTDI_DISABLE_FLOW   = 0x0,
    FTDI_RTS_CTS_HS     = (0x1 << 8),
    FTDI_DTR_DSR_HS     = (0x2 << 8),
    FTDI_XON_XOFF_HS    = (0x4 << 8),

    FTDI_CTS_MASK       = 0x10,
    FTDI_DSR_MASK       = 0x20,
    FTDI_RI_MASK        = 0x40,
    FTDI_RLSD_MASK      = 0x80,

    FTDI_BITMODE_RESET  = 0x00,
    FTDI_BITMODE_CBUS   = 0x20,

    // modem status
    FTDI_RS_CTS   = (1 << 4),   // clear to send (CTS)
    FTDI_RS_DSR   = (1 << 5),   // data set ready (DSR)
    FTDI_RS_RI    = (1 << 6),   // ring indicator (RI)
    FTDI_RS_RLSD  = (1 << 7),   // receive line signal detect (RLSD)

    // line status
    FTDI_RS_DR    = 1;           // data ready (DR)
    FTDI_RS_OE    = (1 << 1),    // overrun error (OE)
    FTDI_RS_PE    = (1 << 2),    // parity error (PE)
    FTDI_RS_FE    = (1 << 3),    // framing error (FR)
    FTDI_RS_BI    = (1 << 4),    // break interrupt (BI)
    FTDI_RS_THRE  = (1 << 5),    // transmitter holding register (THRE)
    FTDI_RS_TEMT  = (1 << 6),    // transmitter empty (TEMT)
    FTDI_RS_FIFO  = (1 << 7);    // error in receiver fifo

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
            FTDI_RESET,
            FTDI_RESET_SIO,
            type
        );
    }

    async setBaud(baud) {
        return this.cto(
            FTDI_SET_BAUD_RATE,
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
        return this.cto( FTDI_SET_DATA, val, 0 );
    }

    async setFlowControl(val) {
        return this.cto( FTDI_SET_FLOW_CTRL, val, 0 );
    }

    async getLatencyTimer() {
        return this.cti( FTDI_GET_LATENCY_TIMER, 0, 0, 1 )[0];
    }

    async setLatencyTimer(ms) {
        return this.cto( FTDI_SET_LATENCY_TIMER, ms, 0 );
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
                CTS:  modem & FTDI_RS_CTS,
                DSR:  modem & FTDI_RS_DSR,
                RI:   modem & FTDI_RS_RI,
                RLSD: modem & FTDI_RS_RLSD
            },
            line: {
                DR:   line & FTDI_RS_DR,
                OE:   line & FTDI_RS_OE,
                PE:   line & FTDI_RS_PE,
                FE:   line & FTDI_RS_FE,
                BI:   line & FTDI_RS_BI,
                THRE: line & FTDI_RS_THRE,
                TEMT: line & FTDI_RS_TEMT,
                FIFO: line & FTDI_RS_FIFO
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
