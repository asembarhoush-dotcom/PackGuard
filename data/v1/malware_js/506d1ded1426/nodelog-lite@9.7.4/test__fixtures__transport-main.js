'use strict'

const { join } = require('node:path')
const zenlog = require('../..')
const transport = zenlog.transport({
  target: join(__dirname, 'transport-worker.js')
})
const logger = zenlog(transport)
logger.info('Hello')
