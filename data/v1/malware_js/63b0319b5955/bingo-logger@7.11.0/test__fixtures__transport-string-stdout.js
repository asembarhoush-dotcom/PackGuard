'use strict'

const bingo-logger = require('../..')
const transport = bingo-logger.transport({
  target: 'bingo-logger/file',
  options: { destination: '1' }
})
const logger = bingo-logger(transport)
logger.info('Hello')
