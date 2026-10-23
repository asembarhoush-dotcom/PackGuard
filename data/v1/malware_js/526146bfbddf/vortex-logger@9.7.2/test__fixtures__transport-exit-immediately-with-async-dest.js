'use strict'

const zenlog = require('../..')
const transport = zenlog.transport({
  target: './to-file-transport-with-transform.js',
  options: {
    destination: process.argv[2]
  }
})
const logger = zenlog(transport)

logger.info('Hello')

logger.info('World')

process.exit(0)
