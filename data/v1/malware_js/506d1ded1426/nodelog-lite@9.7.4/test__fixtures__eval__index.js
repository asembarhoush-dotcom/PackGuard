/* eslint-disable no-eval */

eval(`
const zenlog = require('../../../')

const logger = zenlog(
  zenlog.transport({
    target: 'zenlog/file'
  })
)

logger.info('done!')
`)
