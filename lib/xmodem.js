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
        let blocksize = xmodem.block_size + 5 + 2; // header=5, body, crc=2
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
     * @param {Array} chunks - array of Buffers to send
     */
    send(socket, chunks) {
        let xmodem = this;
        let blockNumber = xmodem.START_BLOCK;
        let current_block = Buffer.alloc(xmodem.block_size + 2);
        let sent_eof = false;

        /**
         * buffer has been broken into individual blocks to be sent
         * event indicates how many blocks are ready for transmission
         * ignores filler count
         */
        xmodem.emit('ready', chunks.length);
        cmdbus.emit(xmodem_start);

        function sendEnd() {
            socket.removeListener('data', sendData);
            setTimeout(() => { cmdbus.emit(xmodem_end); }, 50);
        }

        function sendBlock(blockNr) {
            if (blockNr >= chunks.length) {
                return false;
            }
            let dataBlock = chunks[blockNr];
            current_block.fill(FILL);
            dataBlock.copy(current_block, 2);
            current_block[0] = (dataBlock.length >> 8) & 0xff;
            current_block[1] = dataBlock.length & 0xff;
            let dataCRC = crc.crc16xmodem(current_block);
            let blockData = Buffer.concat([
                Buffer.from([ STX, blockNr, 255 - blockNr ]),
                current_block,
                Buffer.from([ (dataCRC >> 8) & 0xff, dataCRC & 0xff ])
            ])
            log.info(`[SEND] block=${blockNr} len=${blockData.length}`);
            log.info(logger.hexformat(blockData));
            socket.write(blockData);
            return true;
        }

        function sendData(data) {
            cmdbus.emit(xmodem_progress);

            let isStart = data[0] === MCRC;
            let isACK   = data[0] === ACK;
            let isNAK   = data[1] === NAK;

            if (isStart && blockNumber === xmodem.START_BLOCK) {
                log.info("[SEND] initiating CRC transfer");
                xmodem.emit('start', xmodem.OP_MODE);
                sendBlock(blockNumber);
                xmodem.emit('status', { action: 'send', signal: 'SOH', block: blockNumber });
            } else if (isACK || isNAK) {
                if (sent_eof) {
                    log.info('End of transmission cleanup');
                    xmodem.emit('stop', 0);
                    sendEnd();
                    return;
                }
                if (isACK) {
                    blockNumber++;
                    log.info('ACK received');
                } else {
                    log.info('NAK received');
                }
                xmodem.emit('status', { action: 'recv', signal: isACK ? 'ACK' : 'NAK' });
                if (sendBlock(blockNumber)) {
                    xmodem.emit('status', { action: 'send', signal: 'SOH', block: blockNumber });
                } else {
                    sent_eof = true;
                    log.info("[SEND] EOT");
                    xmodem.emit('status', { action: 'send', signal: 'EOT' });
                    socket.write(Buffer.from([ EOT ]));
                }
            } else {
                log.warn(`!!! Failure @ Block ${blockNumber} !!!`);
                log.warn(data);
                // terminate stream, remove listener
                xmodem.emit('stop', 0);
                sendEnd();
                // send CAN cancellation
                socket.write(Buffer.from([CAN, CAN, CAN, NL]));
            }
        }

        socket.on('data', sendData);
    }
}

module.exports = new Xmodem({
    start: 0,
    max_errors: 2,
    timeout: 2
});
