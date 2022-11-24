const args = {
    webport: 8001,
    websport: 0,
    webskey: "ssl/key.pem",
    webscert: "ssl/cert.pem",
    autocon: true,
    cmdline: false,
    locate: true,
    spoof: true,
    quiet: true,
    proxy: true,
    web: true
};

function parse(v) {
    try {
        return JSON.parse(v);
    } catch (e) {
        return v;
    }
}

// process argc into args map
for (let arg of process.argv.slice(2)) {
    if (arg.indexOf('=') > 0) {
        let [ key, val ]= arg.split('=');
        args[key.replace(/^-+/,'')] = parse(val);
    } else if (arg.indexOf('-') === 0) {
        args['$'] = arg.replace(/^-+/,'');
    } else {
        args[args['$'] || '_'] = arg;
    }
}

module.exports = args;
