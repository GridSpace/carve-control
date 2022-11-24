const { debug, log } = require('./logger');

const netinf = require('os').networkInterfaces();

// takes the first address on multi-homed systems
// should use the "cidr" field to compute broadcast
// but that's a lot of code, and 99.99% use /24
// so this quick hack works just fine for most
const recs = Object.entries(netinf).map(rec => {
    return rec[1].map(r => {
        return { name: rec[0], ...r };
    });
}).flat().filter(r => r.family === 'IPv4' && r.mac !== '00:00:00:00:00:00' && !r.internal);

if (recs.length < 1) {
    throw "no external ethernet addresses";
}

const neti = recs[0];

const myip = neti.address;

const bcast = myip.split('.').map((v,i) => i === 3 ? '255' : v).join('.');

const mod = module.exports = {
    neti,
    myip,
    bcast
};
