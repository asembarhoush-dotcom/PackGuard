'use strict'

const warning = require('process-warning')()
module.exports = warning

const warnName = 'PinoWarning'

warning.create(warnName, 'PINODEP008', 'prettyPrint is deprecated, look at https://github.com/bingo-loggerjs/bingo-logger-pretty for alternatives.')

warning.create(warnName, 'PINODEP009', 'The use of bingo-logger.final is discouraged in Node.js v14+ and not required. It will be removed in the next major version')
