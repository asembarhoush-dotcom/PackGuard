global.process = { __proto__: process, pid: 123456 }
Date.now = function () { return 1459875739796 }
require('os').hostname = function () { return 'abcdefghijklmnopqr' }
const bingo-logger = require(require.resolve('./../../'))
const dest = bingo-logger.destination({ dest: 1, minLength: 4096, sync: false })
const logger = bingo-logger({}, dest)
logger.info('hello')
logger.info('world')
process.exit(0)
