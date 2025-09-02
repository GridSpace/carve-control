const crc = require('crc');
const events = require('events');
const logger = require('./logger');
const cmdbus = require('./cmdbus');

const { xmodem_start, xmodem_end, xmodem_progress } = cmdbus.consts();

const log = {
    info: function () { logger.debug('[xm.info]', ...arguments) },
    warn: function () { logger.log('[xm.warn]', ...arguments) },
    error: function () { logger.log('[xm.errr]', ...arguments) },
    debug: function () { logger.log('[xm.dbug]', ...arguments) }
};

const NL = 0x0a; // newline
const SOH = 0x01;
const STX = 0x02;
const EOT = 0x04;
const ACK = 0x06;
const NAK = 0x15;
const SYN = 0x16;
const CAN = 0x18;
const FILL = 0x1A;
const MCRC = 0x43; // 'C'

let receive_interval_timer = false;

class Xmodem extends events.EventEmitter {
    constructor(opt = {}) {
        super();
        this.VERSION = require('../package.json').version;
        this.MAX_TIMEOUTS = 5;
        this.MAX_ERRORS = opt.max_errors || 10;
        this.CRC_ATTEMPTS = 3;
        this.OP_MODE = 'crc';
        this.START_BLOCK = opt.start ?? 0;
        this.timeout_seconds = opt.timeout || 10;
        this.block_size = opt.length || 8192;
    }

    /**
     * Receive a file using XMODEM protocol
     * @param {socket} socket - net.Socket() or Serialport socket for transport
     * @param {function} callback - function to received the output buffer
     * @param {string} md5match - optional early termination on md5 match
     */
    receive(socket, callback, md5match) {
        if (!callback) {
            throw 'receive callback required';
        }

        let xmodem = this;
        let index = xmodem.START_BLOCK;
        let blocksize = xmodem.block_size + 5 + 2; // header=5, crc=2
        let nak_tick = xmodem.MAX_ERRORS;
        let crc_tick = xmodem.CRC_ATTEMPTS;
        let transfer_initiated = false;
        let tryCounter = 0;
        let filedata;
        let buffer;
        let md5;

        cmdbus.emit(xmodem_start, 1);
        socket.write(Buffer.from([MCRC])); // send 'C'

        function cancelReceive() {
            socket.write(Buffer.from([SYN, SYN, SYN]));
        }

        function receiveEnd() {
            socket.removeListener('data', receiveData);
            cmdbus.emit(xmodem_end);
        };

        function receiveData(data) {
            cmdbus.emit(xmodem_progress);
            buffer = buffer ? Buffer.concat([buffer, data]) : data;

            // log.debug({ blocksize, data: data.length, buffer: buffer.length });
            // console.log(logger.hexformat(data));

            if (buffer[0] === EOT) {
                socket.write(Buffer.from([ ACK ]));
                callback({ data: filedata, md5 });
                receiveEnd();
                return;
            }

            if (buffer[0] === SYN) {
                log.warn('remote side canceled');
                return;
            }

            if (index > 0 && buffer.length < blocksize) {
                return;
            }

            // can check for crc over 32 bytes of data
            if (index === 0 && buffer.length < 64) {
                return;
            }

            // check for valid start of block which gives size, etc
            let startOK = buffer[0] === STX;
            let blockOK = startOK && (buffer[1] === index && buffer[2] === 255 - buffer[1]);
            let messageSize = blockOK ? (buffer[3] << 8) | (buffer[4]) : 0;

            // log.debug({ index, messageSize, buffer: buffer.length });

            if (startOK && blockOK && messageSize < buffer.length) {
                let message = buffer.slice(5, 5 + messageSize);

                if (index === 0 && !md5) {
                    md5 = message.toString();
                    // log.debug({ md5 });
                }

                if (index === 0 && md5match) {
                    if (md5 === md5match) {
                        // log.debug({ match: md5 });
                        callback({ md5 });
                        cancelReceive();
                        receiveEnd();
                        return;
                    } else {
                        // mismatch
                        log.warn('md5 mismatch', { md5, md5match });
                        md5match = undefined;
                    }
                }

                if (buffer.length < blocksize) {
                    // log.debug('not enough data yet', { index, blen: buffer.length, blocksize });
                    return;
                }

                let crcVal = (buffer[blocksize - 2] << 8) | (buffer[blocksize - 1]);
                let crcCalc = crc.crc16xmodem(buffer.slice(3, blocksize - 2));
                let crcString = crcCalc.toString(16);

                if (crcVal !== crcCalc) {
                    log.debug({ crcVal, crcCalc, crcString });
                    socket.write(Buffer.from([ NAK ]));
                    buffer = undefined;
                    return;
                }

                if (index++ > 0) {
                    filedata = filedata ? Buffer.concat([ filedata, message ]) : message;
                }

                buffer = buffer.slice(blocksize);
                socket.write(Buffer.from([ ACK ]));
            }
        };

        socket.on('data', receiveData);
    }

    /**
     * Send a file using XMODEM protocol
     * @param {socket} socket - net.Socket() or Serialport socket for transport
     * @param {buffer} dataBuffer - Buffer() to be sent
     */
    send(socket, dataBuffer) {
        let blockNumber = this.START_BLOCK;
        let packagedBuffer = new Array();
        let current_block = Buffer.alloc(this.block_size);
        let sent_eof = false;
        let xmodem = this;

        // add filler
        for (let i = 0; i < this.START_BLOCK; i++) {
            packagedBuffer.push("");
        }

        while (dataBuffer.length > 0) {
            for (let i = 0; i < this.block_size; i++) {
                current_block[i] = dataBuffer[i] === undefined ? FILL : dataBuffer[i];
            }
            dataBuffer = dataBuffer.slice(this.block_size);
            packagedBuffer.push(current_block);
            current_block = Buffer.alloc(this.block_size);
        }

        /**
         * buffer has been broken into individual blocks to be sent
         * event indicates how many blocks are ready for transmission
         * ignores filler count
         */
        xmodem.emit('ready', packagedBuffer.length - 1);
        cmdbus.emit(xmodem_start);

        const sendEnd = () => {
            socket.removeListener('data', sendData);
            // give time for trailing messages to appear
            setTimeout(() => {
                cmdbus.emit(xmodem_end);
            }, 50);
        };

        const sendData = (data) => {
            cmdbus.emit(xmodem_progress);
            /*
             * beginning of the transmission
             * receiver initiates the transfer by either calling
             * checksum mode or CRC mode.
             */
            if (data[0] === MCRC && blockNumber === xmodem.START_BLOCK) {
                log.info("[SEND] initiating CRC transfer");
                xmodem.OP_MODE = 'crc';
                if (packagedBuffer.length > blockNumber) {
                    /* start event with transmission mode: 'crc' or 'normal' */
                    xmodem.emit('start', xmodem.OP_MODE);
                    sendBlock(socket, blockNumber, packagedBuffer[blockNumber], xmodem.OP_MODE);
                    xmodem.emit('status', {
                        action: 'send',
                        signal: 'SOH',
                        block: blockNumber
                    });
                    blockNumber++;
                }
            } else if (data[0] === NAK && blockNumber === xmodem.START_BLOCK) {
                log.info("[SEND] initiating NAK (normal) transfer");
                xmodem.OP_MODE = 'normal';
                if (packagedBuffer.length > blockNumber) {
                    xmodem.emit('start', xmodem.OP_MODE);
                    sendBlock(socket, blockNumber, packagedBuffer[blockNumber], xmodem.OP_MODE);
                    xmodem.emit('status', {
                        action: 'send',
                        signal: 'SOH',
                        block: blockNumber
                    });
                    blockNumber++;
                }
            }
            /*  handle data transmission packets */
            else if (data[0] === ACK && blockNumber > xmodem.START_BLOCK) {
                log.info('ACK received');
                xmodem.emit('status', {
                    action: 'recv',
                    signal: 'ACK'
                });
                if (packagedBuffer.length > blockNumber) {
                    sendBlock(socket, blockNumber, packagedBuffer[blockNumber], xmodem.OP_MODE);
                    xmodem.emit('status', {
                        action: 'send',
                        signal: 'SOH',
                        block: blockNumber
                    });
                    blockNumber++;
                } else if (packagedBuffer.length === blockNumber) {
                    /* end of transmission */
                    if (sent_eof === false) {
                        sent_eof = true;
                        log.info("[SEND] EOT");
                        xmodem.emit('status', {
                            action: 'send',
                            signal: 'EOT'
                        });
                        socket.write(Buffer.from([EOT]));
                    } else {
                        log.info('End of transmission cleanup');
                        xmodem.emit('stop', 0);
                        sendEnd();
                    }
                }
            } else if (data[0] === NAK && blockNumber > xmodem.START_BLOCK) {
                if (blockNumber === packagedBuffer.length && sent_eof) {
                    log.info('[SEND] Resend EOT');
                    xmodem.emit('status', {
                        action: 'send',
                        signal: 'EOT'
                    });
                    socket.write(Buffer.from([EOT]));
                } else {
                    log.info('[SEND] Packet corruption, resending previous block');
                    xmodem.emit('status', {
                        action: 'recv',
                        signal: 'NAK'
                    });
                    blockNumber--;
                    if (packagedBuffer.length > blockNumber) {
                        sendBlock(socket, blockNumber, packagedBuffer[blockNumber], xmodem.OP_MODE);
                        xmodem.emit('status', {
                            action: 'send',
                            signal: 'SOH',
                            block: blockNumber
                        });
                        blockNumber++;
                    }
                }
            } else {
                log.warn("!!! Unexpected Data !!!");
                log.warn(data);
                log.warn(`!!! block ${blockNumber} !!!`);
                // terminate stream, remove listener
                xmodem.emit('stop', 0);
                sendEnd();
                // send CAN cancellation
                socket.write(Buffer.from([CAN, CAN, CAN, NL]));
            }
        };

        socket.on('data', sendData);
    }

}

/* Carvera specific protocol modifications */
module.exports = new Xmodem({
    start: 0,
    max_errors: 2,
    timeout: 2
});

/**
 * Internal helper function for scoped intervals
 */
function setIntervalX(callback, delay, repetitions) {
    let x = 0;
    let intervalID = setInterval(function () {
        if (++x === repetitions) {
            clearInterval(intervalID);
            receive_interval_timer = false;
        }
        callback();
    }, delay);
    return intervalID;
}

function sendBlock(socket, blockNr, blockData, mode) {
    let crcCalc = 0;
    let sendBuffer = Buffer.concat([Buffer.from([SOH]),
    Buffer.from([blockNr]),
    Buffer.from([(0xFF - blockNr)]),
        blockData
    ]);
    log.info('SENDBLOCK! Data length: ' + blockData.length);
    log.info(sendBuffer);
    if (mode === 'crc') {
        let crcString = crc.crc16xmodem(blockData).toString(16);
        // avoid odd string buffer lengths
        if (crcString.length % 2 == 1) {
            crcString = '0'.concat(crcString);
        }
        // CRC must be 2 bytes of length
        if (crcString.length === 2) {
            crcString = '00'.concat(crcString);
        }
        sendBuffer = Buffer.concat([sendBuffer, Buffer.from(crcString, "hex")]);
    } else {
        // count only the blockData into the checksum
        for (let i = 3; i < sendBuffer.length; i++) {
            crcCalc = crcCalc + sendBuffer.readUInt8(i);
        }
        crcCalc = crcCalc % 256;
        crcCalc = crcCalc.toString(16);
        if ((crcCalc.length % 2) != 0) {
            // add padding for the string to be even
            crcCalc = "0" + crcCalc;
        }
        sendBuffer = Buffer.concat([sendBuffer, Buffer.from(crcCalc, "hex")]);
    }
    log.info(`[SEND] buffer with length ${sendBuffer.length}`);
    socket.write(sendBuffer);
}

function receiveBlock(socket, blockNr, blockData, block_size, mode, callback) {
    let cmd = blockData[0];
    let block = parseInt(blockData[1]);
    let block_check = parseInt(blockData[2]);
    let current_block;
    let checksum_length = mode === 'crc' ? 2 : 1;

    if (cmd === SOH) {
        if ((block + block_check) === 0xFF) {
            if (block === (blockNr % 0x100)) {
                current_block = blockData.slice(3, blockData.length - checksum_length);
            } else {
                log.error(`[RECV] ERROR: sync got block ${block} wanted ${blockNr}`);
                return;
            }
        } else {
            log.error('[RECV] ERROR: block integrity check failed');
            socket.write(Buffer.from([NAK]));
            return;
        }

        if (current_block.length === block_size) {
            if (callback(current_block) === true) {
                socket.write(Buffer.from([ACK]));
            } else {
                socket.write(Buffer.from([SYN, SYN, SYN]));
            }
        } else {
            log.error(`[RECV] ERROR: size mismatch got ${current_block.length} wanted ${block_size}`);
            socket.write(Buffer.from([NAK]));
            return;
        }
    } else {
        log.error('[RECV] ERROR on command');
        return;
    }
}
