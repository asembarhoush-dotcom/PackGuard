global.process = { __proto__: process, pid: 123456 }
Date.now = function () { return 1459875739796 }
require('os').hostname = function () { return 'abcdefghijklmnopqr' }
const bingo-logger = require(require.resolve('./../../'))
const logger = bingo-logger()
logger.info('hello')
logger.info('world')
process.exit(0)
