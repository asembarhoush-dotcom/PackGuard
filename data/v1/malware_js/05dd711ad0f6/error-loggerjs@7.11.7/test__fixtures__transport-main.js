'use strict'

const { join } = require('path')
const bingo-logger = require('../..')
const transport = bingo-logger.transport({
  target: join(__dirname, 'transport-worker.js')
})
const logger = bingo-logger(transport)
logger.info('Hello')
