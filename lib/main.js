/**
 * command line entry-point reads config and starts requested services
 */

const cmdbus = require('./cmdbus');
const config = require('./config');
const carvera = require('./carvera');

const { quiet, debug, log, raw } = require('./logger');
const { carvera_found } = cmdbus.consts();

const exit_fns = [];

function setup_exit_handlers() {
    let procExit = false;

    function processExit(code) {
        if (procExit) {
            return;
        }
        log('exiting...');
        procExit = true;
        for (let exit of exit_fns) {
            try {
                exit.shift()(code);
            } catch (e) {
                log({ on_exit_fail: e });
            }
        }
        setTimeout(process.exit, 500);
    }

    process
        .on('exit', processExit)
        .on('beforeExit', processExit)
        .on('SIGINT', (sig, code) => processExit(code))
        .on('SIGHUP', (sig, code) => processExit(code))
        .on('unhandledRejection', (reason, p) => {
            log({ unhandled_rejection: reason, promise: p });
        })
        .on('uncaughtException', (err) => {
            log({ uncaught_exception: err });
        });
}

async function setup_config() {
    if (config.help || config._ === 'help' || config.$ === 'help') {
        raw([
            "carvera [...options]",
            "   autocon=<0|1>   auto-connect when carvera found",
            "   carvera=<info>  set machine targte as 'name,ip,port'",
            "   cmdline=<0|1>   cmd-line input to carvera channel",
            "   locate=<0|1>    listener to locate carvera on network",
            "   proxy=<0|1>     accept connections for connected carvera",
            "   spoof=<0|1>     announce this process as a carvera machine",
            "   quiet=<0|1>     enable/disable debug logging",
            "   web=<0|1>       enable/disable web server process",
            "   webport=#       port for http server",
            "   websport=#      port for https server (requires cert gen)",
            "   webskey=<file>  file containing key.pem for https",
            "   webscert=<file> file containing cert.pem for https",
            "   help            this menu",
        ].join('\n'));
        process.exit();
    }

    if (config.locate) {
        require('./c-locate').start();
    }

    if (config.spoof) {
        require('./c-spoof').start();
    }

    if (config.proxy) {
        require('./c-proxy').start();
    }

    if (config.web) {
        // so web can pick up found event
        await require('./web').start();
    }

    if (config.cmdline) {
        require('./cmdline').start();
    }

    quiet(config.quiet || false);

    cmdbus.on(carvera_found, found => {
        log('carvera at', found);
        if (config.autocon) {
            carvera.start();
        }
    })

    if (config.carvera) {
        const [ name, ip, port ] = config.carvera.split(',');
        cmdbus.emit(carvera_found, { name, ip, port });
    }
}

setup_config();
setup_exit_handlers();
