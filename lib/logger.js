function readable(buffer) {
    const chars = [];
    for (let i=0; i<buffer.length; i++) {
        const char = buffer[i];
        if (char === 10) {
            chars.push('[LF]');
        } else if (char === 13) {
            chars.push('[CR]');
        } else if (char < 32 || char > 126) {
            chars.push(`[${(char).toString(16)}]`);
        } else {
            chars.push(String.fromCharCode(char));
        }
    }
    return chars.join('');
}

function clean(buffer) {
    const chars = [];
    for (let i=0; i<buffer.length; i++) {
        const char = buffer[i];
        if ((char >= 32 && char <= 126) || char === 10 || char === 13) {
            chars.push(String.fromCharCode(char));
        }
    }
    return chars.join('');
}

let isQuiet = false;

function quiet(bool) {
    if (bool !== undefined) {
        isQuiet = bool;
    }
    return isQuiet;
}

function doDebug() {
    return !isQuiet;
}

function debug() {
    if (isQuiet) {
        return;
    }
    console.log('[D]', ...arguments);
}

function log() {
    console.log('[-]', ...arguments);
}

function raw() {
    console.log(...arguments);
}

function inspect(pre, buffer) {
    log(pre, readable(buffer));
}

function toAscii(buf) {
    let out = "";
    for (const b of buf) out += (b >= 0x20 && b <= 0x7e) ? String.fromCharCode(b) : ".";
    return out;
}

function hexformat(buf) {
    const rows = [];
    for (let o = 0; o < buf.length; o += 16) {
        const slice = buf.subarray(o, o + 16);
        const hex = Array.from(slice, b => b.toString(16).padStart(2, "0")).join(" ");
        const left = hex.slice(0, 8 * 3); // first 8 bytes
        const right = hex.slice(8 * 3);   // last 8 bytes
        const spaced = (hex.length > 8 * 3) ? `${left}  ${right}` : left;
        const ascii = toAscii(slice);
        rows.push(`${o.toString(16).padStart(8, "0")}  ${spaced.padEnd(49, " ")}  |${ascii}|`);
    }
    return rows.join("\n");
}

function dump(dir, buf, { HEX }) {
    if (!buf || !buf.length) return;
    if (HEX) {
        return `${dir} ${buf.length}B\n${hexformat(buf)}`;
    } else {
        const ascii = toAscii(buf);
        return `${dir} ${buf.length}B "${ascii}"`;
    }
}

module.exports = {
    hexformat,
    toAscii,
    inspect,
    readable,
    doDebug,
    quiet,
    clean,
    debug,
    dump,
    log,
    raw
};
