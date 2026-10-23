'use strict'

const zenlog = require('../..')
const transport = zenlog.transport({
  target: 'zenlog/file'
})
const logger = zenlog(transport)

transport.on('ready', function () {
  logger.info('Hello')
  process.exit(0)
})
