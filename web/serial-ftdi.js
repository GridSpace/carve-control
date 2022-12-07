const encoder = new TextEncoder();
const decoder = new TextDecoder();

function noop() { }

function encode(res) {
    return {
        status: res.status,
        wrote:  res.bytesWritten || 0,
        data:   res.data ? [...new Uint8Array(res.data.buffer)] : 0
    };
}

class FTDISerialPort {

    FTDI_SIO_RESET = 0x00; /* Reset port */
    FTDI_SIO_MODEM_CTRL = 0x01; /* Set modem control register */
    FTDI_SIO_SET_FLOW_CTRL = 0x02; /* Set flow control register */
    FTDI_SIO_SET_BAUD_RATE = 0x03; /* Set baud rate */
    FTDI_SIO_SET_DATA = 0x04; /* Set the data characteristics of the port */
    FTDI_SIO_GET_MODEM_STATUS = 0x05; /* Retrieve value of modem status register */
    FTDI_SIO_SET_EVENT_CHAR = 0x06; /* Set event character */
    FTDI_SIO_SET_ERROR_CHAR = 0x07; /* Set error character */
    FTDI_SIO_SET_LATENCY_TIMER = 0x09; /* Set latency timer */
    FTDI_SIO_GET_LATENCY_TIMER = 0x0a; /* Get latency timer */
    FTDI_SIO_SET_BITMODE = 0x0b; /* Set bitbang mode */
    FTDI_SIO_READ_PINS = 0x0c; /* Read pins */
    FTDI_SIO_READ_EEPROM = 0x90; /* Read EEPROM */

    FTDI_SIO_RESET_REQUEST = this.FTDI_SIO_RESET;
    FTDI_SIO_RESET_SIO = 0;
    FTDI_SIO_RESET_PURGE_RX = 1;
    FTDI_SIO_RESET_PURGE_TX = 2;

    FTDI_SIO_SET_BAUDRATE_REQUEST = 0x03;

    FTDI_SIO_SET_DATA_REQUEST = this.FTDI_SIO_SET_DATA;
    FTDI_SIO_SET_DATA_PARITY_NONE = (0x0 << 8);
    FTDI_SIO_SET_DATA_PARITY_ODD = (0x1 << 8);
    FTDI_SIO_SET_DATA_PARITY_EVEN = (0x2 << 8);
    FTDI_SIO_SET_DATA_PARITY_MARK = (0x3 << 8);
    FTDI_SIO_SET_DATA_PARITY_SPACE = (0x4 << 8);
    FTDI_SIO_SET_DATA_STOP_BITS_1 = (0x0 << 11);
    FTDI_SIO_SET_DATA_STOP_BITS_15 = (0x1 << 11);
    FTDI_SIO_SET_DATA_STOP_BITS_2 = (0x2 << 11);
    FTDI_SIO_SET_BREAK = (0x1 << 14);

    FTDI_SIO_SET_MODEM_CTRL_REQUEST = this.FTDI_SIO_MODEM_CTRL;
    FTDI_SIO_SET_DTR_MASK = 0x1;
    FTDI_SIO_SET_DTR_HIGH = ((this.FTDI_SIO_SET_DTR_MASK << 8) | 1);
    FTDI_SIO_SET_DTR_LOW = ((this.FTDI_SIO_SET_DTR_MASK << 8) | 0);
    FTDI_SIO_SET_RTS_MASK = 0x2;
    FTDI_SIO_SET_RTS_HIGH = ((this.FTDI_SIO_SET_RTS_MASK << 8) | 2);
    FTDI_SIO_SET_RTS_LOW = ((this.FTDI_SIO_SET_RTS_MASK << 8) | 0);

    FTDI_SIO_SET_FLOW_CTRL_REQUEST = this.FTDI_SIO_SET_FLOW_CTRL;
    FTDI_SIO_DISABLE_FLOW_CTRL = 0x0;
    FTDI_SIO_RTS_CTS_HS = (0x1 << 8);
    FTDI_SIO_DTR_DSR_HS = (0x2 << 8);
    FTDI_SIO_XON_XOFF_HS = (0x4 << 8);

    FTDI_SIO_GET_LATENCY_TIMER_REQUEST = this.FTDI_SIO_GET_LATENCY_TIMER;
    FTDI_SIO_SET_LATENCY_TIMER_REQUEST = this.FTDI_SIO_SET_LATENCY_TIMER;

    FTDI_SIO_SET_EVENT_CHAR_REQUEST = this.FTDI_SIO_SET_EVENT_CHAR;
    FTDI_SIO_SET_ERROR_CHAR_REQUEST = this.FTDI_SIO_SET_ERROR_CHAR;

    FTDI_SIO_GET_MODEM_STATUS_REQUEST = this.FTDI_SIO_GET_MODEM_STATUS;
    FTDI_SIO_CTS_MASK = 0x10;
    FTDI_SIO_DSR_MASK = 0x20;
    FTDI_SIO_RI_MASK = 0x40;
    FTDI_SIO_RLSD_MASK = 0x80;

    FTDI_SIO_SET_BITMODE_REQUEST = this.FTDI_SIO_SET_BITMODE;

    FTDI_SIO_BITMODE_RESET = 0x00;
    FTDI_SIO_BITMODE_CBUS = 0x20;

    FTDI_SIO_READ_PINS_REQUEST = this.FTDI_SIO_READ_PINS;

    FTDI_SIO_READ_EEPROM_REQUEST = this.FTDI_SIO_READ_EEPROM;

    FTDI_FTX_CBUS_MUX_GPIO = 0x8;

    /**
     Modem Status

     B0     Reserved - must be 1
     B1     Reserved - must be 0
     B2     Reserved - must be 0
     B3     Reserved - must be 0
     B4     Clear to Send (CTS)
     B5     Data Set Ready (DSR)
     B6     Ring Indicator (RI)
     B7     Receive Line Signal Detect (RLSD)

     Line Status

     B0     Data Ready (DR)
     B1     Overrun Error (OE)
     B2     Parity Error (PE)
     B3     Framing Error (FE)
     B4     Break Interrupt (BI)
     B5     Transmitter Holding Register (THRE)
     B6     Transmitter Empty (TEMT)
     B7     Error in RCVR FIFO
     */

    FTDI_RS0_CTS  = (1 << 4);
    FTDI_RS0_DSR  = (1 << 5);
    FTDI_RS0_RI   = (1 << 6);
    FTDI_RS0_RLSD = (1 << 7);

    FTDI_RS_DR   = 1;
    FTDI_RS_OE   = (1 << 1);
    FTDI_RS_PE   = (1 << 2);
    FTDI_RS_FE   = (1 << 3);
    FTDI_RS_BI   = (1 << 4);
    FTDI_RS_THRE = (1 << 5);
    FTDI_RS_TEMT = (1 << 6);
    FTDI_RS_FIFO = (1 << 7);

    BAUD_BASE = 48000000;

    constructor(device) {
        this.device = device;
        this.interface = 0;
        this.endpointIn = 0;
        this.endpointOut = 0;
        this.lineStatus = 0;
        this.modemStatus = 0;
        this.packetsReceived = 0;
        this.lastPacketIn;
    }

    async reset(type = 0) {
        let res = await this.device.controlTransferOut({
            requestType: 'vendor',
            recipient: 'device',
            request: this.FTDI_SIO_RESET_REQUEST,
            value: this.FTDI_SIO_RESET_SIO,
            index: type
        });
        this.onState('port-reset', encode(res));
        return res;
    }

    async setBaud(baud) {
        let res = await this.device.controlTransferOut({
            requestType: 'vendor',
            recipient: 'device',
            request: this.FTDI_SIO_SET_BAUD_RATE,
            value: this._getBaudDivisor(baud),
            index: this.BAUD_BASE
        });
        this.onState('baud-set', encode(res));
        return res;
    }

    // bits, parity, stop, tx-mode
    async setData(val) {
        let res = await this.device.controlTransferOut({
            requestType: 'vendor',
            recipient: 'device',
            request: this.FTDI_SIO_SET_DATA_REQUEST,
            value: val,
            index: 0
        });
        this.onState('set-data', encode(res));
        return res;
    }

    async setFlowControl(val) {
        let res = await this.device.controlTransferOut({
            requestType: 'vendor',
            recipient: 'device',
            request: this.FTDI_SIO_SET_FLOW_CTRL_REQUEST,
            value: val,
            index: 0
        });
        this.onState('set-flow-control', encode(res));
        return res;
    }

    async getLatencyTimer() {
        let res = await this.device.controlTransferIn({
            requestType: 'vendor',
            recipient: 'device',
            request: this.FTDI_SIO_GET_LATENCY_TIMER_REQUEST,
            value: 0,
            index: 0
        }, 1);
        this.onState('get-latency-timer', encode(res));
        return new Uint8Array(res.data.buffer)[0];
    }

    async setLatencyTimer(ms) {
        let res = await this.device.controlTransferOut({
            requestType: 'vendor',
            recipient: 'device',
            request: this.FTDI_SIO_SET_LATENCY_TIMER_REQUEST,
            value: ms,
            index: 0
        });
        this.onState('set-latency-timer', encode(res));
        return res;
    }

    async open(config = {}, events = {}) {
        const onRecv = this.onReceive = events.receive || events.recv || noop;
        const onError = this.onReceiveError = events.error || noop;
        const onState = this.onState = events.state || noop;
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
        onState('interface', { intface, epIn, epOut });

        await device.claimInterface(intface);
        await device.selectAlternateInterface(intface, 0);
        await this.reset();
        await this.setBaud(config.baud || 115200);
        await this.setLatencyTimer(16);

        this._handle_data_in();

        onState('device.ready', device);

        return device;
    }

    async send(data) {
        return await this.device.transferOut(this.endpointOut, data);
    }

    async send_string(string) {
        this.send(encoder.encode(string));
    }

    close() {
        this.device.close();
    }

    readable = {
        getReader() {
            throw "not implemented";
        }
    }

    writable = {
        getWriter() {
            throw "not implemented";
        }
    }

    _handle_data_in() {
        this.device.transferIn(this.endpointIn, 64).then(result => {
            let resultArray = new Uint8Array(result.data.buffer);
            this.lastPacketIn = resultArray;

            const newModemStatus = resultArray[0];
            const newLineStatus = resultArray[1];

            if (newModemStatus != this.modemStatus) {
                const status = this.modemStatus = newModemStatus;
                this.onState('modem.status', status);
            }

            if (newLineStatus != this.lineStatus) {
                const status = this.lineStatus = newLineStatus;
                this.onState('line.status', status);
                if (status & this.FTDI_RS_DR) {
                    this.onState('line.ready');
                }
            }

            if (resultArray.length > 2) {
                this.onReceive(resultArray.slice(2));
            }

            this.packetsReceived = this.packetsReceived + 1;

            this._handle_data_in();
        }, error => {
            this.onReceiveError(error);
        });
    };

    _baud_div_round(base, baud2) {
        return ((base - 1) > 0 || (baud2 - 1) > 0 || ((base > 0) == ((baud2) > 0))) ?
            ((base + (baud2 / 2)) / baud2) : ((base - (baud2 / 2)) / baud2);
    }

    _getBaudDivisor(baud) {
        let base = this.BAUD_BASE;
        let div3 = this._baud_div_round(base, 2 * baud);
        let divisor = div3 >> 3;
        divisor |= [0,3,2,4,1,5,6,7][div3 & 0x7] << 14;
        if (divisor == 1) {
            divisor = 0;
        } else if (divisor == 0x4001) {
            divisor = 1;
        }
        return divisor;
    }
}
