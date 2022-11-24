const cmdbus = require('./cmdbus');
const logger = require('./logger');
const carvera = require('./carvera');
const web_bus = require('./web-bus');
const { EventEmitter } = require('events');

Object.assign(self.shared, {
    cmdbus,
    logger,
    carvera,
    web_bus,
    EventEmitter
});
