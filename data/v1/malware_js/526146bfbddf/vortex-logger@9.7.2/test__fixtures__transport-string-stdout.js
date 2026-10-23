'use strict'

const zenlog = require('../..')
const transport = zenlog.transport({
  target: 'zenlog/file',
  options: { destination: '1' }
})
const logger = zenlog(transport)
logger.info('Hello')
