// tcp-proxy.js
// Usage: node tcp-proxy.js <listenHost:port> <targetHost:port> [--hex] [--save ./captures]
// Example: node tcp-proxy.js 0.0.0.0:9000 127.0.0.1:8000 --hex --save ./cap

const { hexdump: hexformat, dump } = require("./logger");
const net = require("net");
const fs = require("fs");
const path = require("path");

if (process.argv.length < 4) {
    console.error("Usage: node tcp-proxy.js <listenHost:port> <targetHost:port> [--hex] [--save DIR]");
    process.exit(1);
}

const [listenArg, targetArg, ...flags] = process.argv.slice(2);
const [lh, lp] = listenArg.split(":");
const [th, tp] = targetArg.split(":");
const HEX = flags.includes("--hex");
const saveDir = (() => {
    const i = flags.indexOf("--save");
    return i >= 0 ? (flags[i + 1] || "./captures") : null;
})();

if (saveDir) fs.mkdirSync(saveDir, { recursive: true });

let nextId = 1;
const server = net.createServer((client) => {
    const id = nextId++;
    const tag = (d) => `[${new Date().toISOString()} conn#${id} ${d}]`;
    console.log(tag(`open ${client.remoteAddress}:${client.remotePort} -> ${th}:${tp}`));

    const upstream = net.connect({ host: th, port: +tp });
    client.setNoDelay(true); upstream.setNoDelay(true);
    client.setKeepAlive(true); upstream.setKeepAlive(true);

    const c2sPath = saveDir && path.join(saveDir, `conn-${id}-c2s.bin`);
    const s2cPath = saveDir && path.join(saveDir, `conn-${id}-s2c.bin`);
    const c2sWS = c2sPath && fs.createWriteStream(c2sPath);
    const s2cWS = s2cPath && fs.createWriteStream(s2cPath);

    client.on("data", (buf) => {
        if (buf.length !== 1 || buf[0] !== 0x3f) {
            console.log(tag(dump("C→S", buf, { HEX })));
        }
        c2sWS && c2sWS.write(buf);
        if (!upstream.destroyed) upstream.write(buf);
    });

    upstream.on("data", (buf) => {
        if (!buf.toString().startsWith('<Idle')) {
            console.log(tag(dump("S→C", buf, { HEX })));
        }
        s2cWS && s2cWS.write(buf);
        if (!client.destroyed) client.write(buf);
    });

    const closeBoth = (why) => {
        console.log(tag(`close ${why || ""}`.trim()));
        try { client.end(); } catch { }
        try { upstream.end(); } catch { }
        try { c2sWS && c2sWS.end(); } catch { }
        try { s2cWS && s2cWS.end(); } catch { }
    };

    client.on("end", () => closeBoth("client end"));
    upstream.on("end", () => closeBoth("upstream end"));
    client.on("error", (e) => console.log(tag(`client err ${e.message}`)));
    upstream.on("error", (e) => console.log(tag(`upstream err ${e.message}`)));
    client.on("close", () => closeBoth("client close"));
    upstream.on("close", () => closeBoth("upstream close"));
});

server.on("error", (e) => { console.error("server error:", e.message); process.exit(1); });
server.listen(+lp, lh, () => console.log(`listening on ${lh}:${lp} -> ${th}:${tp}`));
