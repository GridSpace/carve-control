/**
 * provides a communication bus between all modules and codifies message subjects
 */

const { EventEmitter } = require('events');

class CmdBus extends EventEmitter {
    consts() {
        return {
            carvera_xmit: "carvera.xmit",
            carvera_found: "carvera.found",
            carvera_status: "carvera.status",
            carvera_connect: "carvera.connect",
            carvera_error: "carvera.error",
            carvera_data: "carvera.data",
            carvera_send: "carvera.send",
            carvera_end: "carvera.end",
            carvera_ls: "carvera.ls",
            carvera_md5: "carvera.md5",
            carvera_upload: "carvera.upload",
            carvera_download: "carvera.download",
            carvera_line_in: "carvera.line.in",
            carvera_line_out: "carvera.line.out",
            xmodem_progress: "xmodem.progress",
            xmodem_start: "xmodem.start",
            xmodem_end: "xmodem.end"
        };
    }
};

module.exports = new CmdBus();
