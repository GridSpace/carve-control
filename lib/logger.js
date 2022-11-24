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

module.exports = {
    inspect,
    readable,
    doDebug,
    quiet,
    clean,
    debug,
    log,
    raw
};
