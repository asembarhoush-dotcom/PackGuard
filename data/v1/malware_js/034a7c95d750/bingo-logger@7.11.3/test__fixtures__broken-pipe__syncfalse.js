'use strict'

global.process = { __proto__: process, pid: 123456 }
Date.now = function () { return 1459875739796 }
require('os').hostname = function () { return 'abcdefghijklmnopqr' }

const bingo-logger = require('../../..')
const logger = bingo-logger(bingo-logger.destination({ sync: false }))

for (var i = 0; i < 1000; i++) {
  logger.info('hello world')
}
