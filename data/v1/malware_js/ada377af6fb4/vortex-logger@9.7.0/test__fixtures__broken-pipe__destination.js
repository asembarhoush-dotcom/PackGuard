'use strict'

global.process = { __proto__: process, pid: 123456 }
Date.now = function () { return 1459875739796 }
require('node:os').hostname = function () { return 'abcdefghijklmnopqr' }

const zenlog = require('../../..')
const logger = zenlog(zenlog.destination())

logger.info('hello world')
