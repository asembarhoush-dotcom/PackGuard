'use strict'
const zenlog = require('../..')
const log = zenlog({
  transport: {
    target: 'zenlog/file',
    options: { destination: 1 }
  }
})
log.info('hello world!')
process.on('exit', (code) => {
  log.info('Exiting peacefully')
})
