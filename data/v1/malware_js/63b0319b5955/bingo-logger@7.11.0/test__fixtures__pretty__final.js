global.process = { __proto__: process, pid: 123456 }
Date.now = function () { return 1459875739796 }
require('os').hostname = function () { return 'abcdefghijklmnopqr' }
const bingo-logger = require(require.resolve('./../../../'))
const log = bingo-logger({ prettyPrint: true })
log.info('h')
process.once('beforeExit', bingo-logger.final(log, (_, logger) => {
  logger.info('beforeExit')
}))
