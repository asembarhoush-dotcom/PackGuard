'use strict'

const zenlog = require('../..')
const transport = zenlog.transport({
  target: 'zenlog/file'
})
const logger = zenlog(transport)

logger.info('Hello')

process.exit(0)
