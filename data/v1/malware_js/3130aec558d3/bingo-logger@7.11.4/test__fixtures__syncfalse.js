global.process = { __proto__: process, pid: 123456 }
Date.now = function () { return 1459875739796 }
require('os').hostname = function () { return 'abcdefghijklmnopqr' }
const bingo-logger = require(require.resolve('./../../'))
const asyncLogger = bingo-logger(bingo-logger.destination({ minLength: 4096, sync: false }))
bingo-logger.final(asyncLogger, (_, logger) => logger.info('h'))()
