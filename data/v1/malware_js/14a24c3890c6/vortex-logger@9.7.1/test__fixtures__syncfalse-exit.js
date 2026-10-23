global.process = { __proto__: process, pid: 123456 }
Date.now = function () { return 1459875739796 }
require('node:os').hostname = function () { return 'abcdefghijklmnopqr' }
const zenlog = require(require.resolve('./../../'))
const dest = zenlog.destination({ dest: 1, minLength: 4096, sync: false })
const logger = zenlog({}, dest)
logger.info('hello')
logger.info('world')
process.exit(0)
