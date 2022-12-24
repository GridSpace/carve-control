/**
 * Borrowed liberally from the seemingly no longer maintained BSD licensed modem.js
 * GitHub repo @ https://github.com/exsilium/xmodem.js
 */

const crc = require('crc');
const events = require('events');
const logger = require('./logger');
const cmdbus = require('./cmdbus');

const { xmodem_start, xmodem_end, xmodem_progress } = cmdbus.consts();

const log = {
    info:  function() { logger.debug('[xm.info]', ...arguments) },
    warn:  function() { logger.log('[xm.warn]', ...arguments) },
    error: function() { logger.log('[xm.errr]', ...arguments) },
    debug: function() { logger.log('[xm.dbug]', ...arguments) }
};

const SOH = 0x01;
const EOT = 0x04;
const ACK = 0x06;
const NAK = 0x15;
const SYN = 0x16;
const CAN = 0x18;
const FILLER = 0x1A;
const CRC_MODE = 0x43; // 'C'

let receive_interval_timer = false;

class Xmodem extends events.EventEmitter {
    constructor(opt = {}) {
        super();

        /**
         * xmodem.js package version.
         */
        this.VERSION = require('../package.json').version;
        /**
         * how many timeouts in a row before the sender gives up?
         */
        this.MAX_TIMEOUTS = 5;
        /**
         * how many errors on a single block before the receiver gives up?
         */
        this.MAX_ERRORS = opt.max_errors || 10;
        /**
         * how many times should receiver attempt to use CRC?
         */
        this.CRC_ATTEMPTS = 3;
        /**
         * Try to use XMODEM-CRC extension or not? Valid options: 'crc' or 'normal'
         */
        this.OP_MODE = 'crc';
        /**
         * First block number. Don't change this unless you have need for non-standard
         * implementation.
         */
        this.START_BLOCK = opt.start !== undefined ? opt.start : 1;
        /**
         * default timeout period in seconds
         */
        this.timeout_seconds = opt.timeout || 10;
        /**
         * how many bytes (excluding header & checksum) in each block? Don't change this
         * unless you have need for non-standard implementation.
         */
        this.block_size = opt.length || 128;
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
                current_block[i] = dataBuffer[i] === undefined ? FILLER : dataBuffer[i];
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
            if (data[0] === CRC_MODE && blockNumber === xmodem.START_BLOCK) {
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
                socket.write(Buffer.from([CAN,CAN,CAN]));
            }
        };

        socket.on('data', sendData);
    }

    /**
     * Receive a file using XMODEM protocol
     * @param {socket} socket - net.Socket() or Serialport socket for transport
     * @param {function} callback - function to received the output buffer
     */
    receive(socket, callback) {
        if (!callback) {
            throw 'receive callback required';
        }

        let blockNumber = this.START_BLOCK;
        let packagedBuffer = new Array();
        let nak_tick = this.MAX_ERRORS; // * this.timeout_seconds * 3;
        let crc_tick = this.CRC_ATTEMPTS;
        let transfer_initiated = false;
        let tryCounter = 0;
        let xmodem = this;

        // add filler
        for (let i = 0; i < this.START_BLOCK; i++) {
            packagedBuffer.push("");
        }

        cmdbus.emit(xmodem_start, 1);

        const recvEnd = (data, error) => {
            socket.removeListener('data', receiveData);
            // clear timer
            clearInterval(receive_interval_timer);
            receive_interval_timer = false;
            // give time for trailing messages to appear
            setTimeout(() => {
                cmdbus.emit(xmodem_end);
                callback({ data, error, done: true });
            }, 50);
        };

        // Let's try to initate transfer with XMODEM-CRC
        if (this.OP_MODE === 'crc') {
            log.info("[RECV] CRC init");
            socket.write(Buffer.from([CRC_MODE]));
            receive_interval_timer = setIntervalX(function() {
                if (transfer_initiated === false) {
                    log.info("[RECV] CRC init");
                    socket.write(Buffer.from([CRC_MODE]));
                } else {
                    clearInterval(receive_interval_timer);
                    receive_interval_timer = false;
                }
                // fail on max retry
                if (receive_interval_timer === false && transfer_initiated === false) {
                    recvEnd(undefined, "max retry");
                    // Fallback to standard XMODEM
                    // receive_interval_timer = setIntervalX(function() {
                    //     log.info("[RECV] NAK init");
                    //     socket.write(Buffer.from([NAK]));
                    //     xmodem.OP_MODE = 'normal';
                    // }, 3000, nak_tick);
                }
            }, 3000, (crc_tick - 1));
        } else {
            receive_interval_timer = setIntervalX(function() {
                log.info("[RECV] NAK init");
                socket.write(Buffer.from([NAK]));
                xmodem.OP_MODE = 'normal';
                if (receive_interval_timer === false && transfer_initiated === false) {
                    recvEnd(undefined, "timeout");
                }
            }, 3000, nak_tick);
        }

        let accum;
        let blocksize = xmodem.block_size + 5;

        const receiveData = function(data) {
            cmdbus.emit(xmodem_progress);
            if (accum) {
                accum = Buffer.concat([ accum, data ]);
            } else {
                accum = data;
            }
            if (accum.length >= blocksize) {
                data = accum.subarray(0, blocksize);
                accum = accum.slice(blocksize);
                // log.info('burp', data.length, 'remain', accum.length);
            } else if (accum.length === 1) {
                // protocol signal
                // log.info('signal');
            } else {
                // log.info('accum', blocksize, '@', accum.length);
                return;
            }
            tryCounter++;
            log.info(`[RECV] DATA ${data.toString('utf-8')}`);
            log.info(data);
            if (data[0] === NAK && blockNumber === this.START_BLOCK) {
                log.info("[RECV] NAK byte");
            } else if (data[0] === SOH && tryCounter <= xmodem.MAX_ERRORS) {
                if (transfer_initiated === false) {
                    transfer_initiated = true;
                    clearInterval(receive_interval_timer);
                    receive_interval_timer = false;
                }
                receiveBlock(socket, blockNumber, data, xmodem.block_size, xmodem.OP_MODE, function(current_block) {
                    log.info(current_block);
                    let cancel = callback({ block: current_block, index: blockNumber });
                    if (cancel) {
                        recvEnd([]);
                        return false;
                    }
                    packagedBuffer.push(current_block);
                    tryCounter = 0;
                    blockNumber++;
                    return true;
                });
            } else if (data[0] === EOT) {
                log.info("[RECV] EOT");
                socket.write(Buffer.from([ACK]));
                blockNumber--;
                for (let i = packagedBuffer[blockNumber].length - 1; i >= 0; i--) {
                    if (packagedBuffer[blockNumber][i] === FILLER) {
                        continue;
                    } else {
                        packagedBuffer[blockNumber] = packagedBuffer[blockNumber].slice(0, i + 1);
                        break;
                    }
                }
                // terminate stream, remove the data listener
                recvEnd(packagedBuffer)
            } else {
                log.warn("!!! Unexpected Data !!!");
                log.warn(data);
                log.warn(`!!! block ${blockNumber} !!!`);
                recvEnd(undefined, packagedBuffer);
                socket.write(Buffer.from([CAN,CAN,CAN]));
            }
        };

        socket.on('data', receiveData);
    }
}

/* Carvera specific protocol modifications */
module.exports = new Xmodem({
    start: 0,
    length: 129,
    max_errors: 2,
    timeout: 2
});

/**
 * Internal helper function for scoped intervals
 */
function setIntervalX(callback, delay, repetitions) {
    let x = 0;
    let intervalID = setInterval(function() {
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
                socket.write(Buffer.from([SYN,SYN,SYN]));
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
