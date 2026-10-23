'use strict'

const bingo-logger = require('../..')
const transport = bingo-logger.transport({
  target: './to-file-transport-with-transform.js',
  options: {
    destination: process.argv[2]
  }
})
const logger = bingo-logger(transport)

logger.info('Hello')

logger.info('World')

process.exit(0)
