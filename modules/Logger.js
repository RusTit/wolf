'use strict';

const config = require("config");
const log4js = require('log4js');
log4js.configure(config.get('log4js'));

module.exports = (loggerName) => {
    return log4js.getLogger(loggerName);
};
