global.process = { __proto__: process, pid: 123456 }
Date.now = function () { return 1459875739796 }
require('os').hostname = function () { return 'abcdefghijklmnopqr' }
const bingo-logger = require(require.resolve('./../../../'))
const log = bingo-logger({ prettyPrint: true }).child({ foo: 123 })
log.info('before')
log.setBindings({ foo: 456, bar: 789 })
log.info('after')
