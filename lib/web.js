/**
 * provides a web interface to provided services and statuses
 */

const fs = require('fs').promises;
const status = require('./c-status');
const config = require('./config');
const marked = require('marked');
const web_bus = require('./web-bus');
const node_inf = { nextID: 0 };
const node_wss = {};

const { debug, log } = require('./logger');

let started = false;

function app_handler(req, res, next) {
    if (req.url === "/favicon.ico") {
        req.url = "/cc-icon.ico";
    }
    if (req.url.indexOf('.md') > 0) {
        fs.readFile(`web/${req.url}`).then(data => {
            let md = marked.parse(data.toString());
            res.setHeader("Content-Type", "text/html");
            res.end(md);
        });
    } else {
        next();
    }
}

function send(message) {
    for (let ws of Object.values(node_wss)) {
        ws.state.send(message);
    }
}

web_bus.setup(node_inf, send);

async function start() {
    if (started) {
        return;
    }

    started = true;

    function wss_upgrade(req, socket, head) {
        // todo: validate req.url or socket.destroy()
        wss.handleUpgrade(req, socket, head, ws => {
            const key = node_inf.nextID++;
            const send = (obj) => ws.send(JSON.stringify(obj));
            const state = ws.state = { key, send };
            node_wss[key] = ws;
            const { connect, found, status } = node_inf;
            if (found) {
                send({ found });
            }
            if (status) {
                send({ status });
            }
            send({ connected: node_inf.connected || false });
            return wss.emit('connection', ws, req);
        });
    }


    const ServeStatic = require('serve-static');
    const Compression = require('compression');
    const WebSocket = require('ws');
    const connect = require('connect');

    const chain = connect()
        .use(Compression())
        .use(app_handler)
        .use(new ServeStatic("web", {}));

    const wss = new WebSocket.Server({ noServer: true })
        .on('connection', ws => {
            // debug('wss up', ws.state.key);
            ws.on('message', message => {
                web_bus.handle(message)
            });
            ws.on('close', () => {
                // debug('wss down', ws.state.key);
                delete node_wss[ws.state.key];
            });
        })

    if (config.webport) {
        log('starting web server on', config.webport);

        require('http').createServer(chain)
            .listen(parseInt(config.webport))
            .on('upgrade', wss_upgrade);
    }

    if (config.websport) {
        log('starting secure web server on', config.websport);

        const fs = require('fs').promises;

        require('https').createServer({
                key: await fs.readFile(config.webskey),
                cert: await fs.readFile(config.webscert)
            }, chain)
            .listen(config.websport)
            .on('upgrade', wss_upgrade);
    }
}

const mod = module.exports = {
    get started() { return started },
    start
};
