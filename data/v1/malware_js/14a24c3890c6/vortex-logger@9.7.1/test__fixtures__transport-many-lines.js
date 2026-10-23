'use strict'

const zenlog = require('../..')
const transport = zenlog.transport({
  targets: [{
    level: 'info',
    target: 'zenlog/file',
    options: {
      destination: process.argv[2]
    }
  }]
})
const logger = zenlog(transport)

const toWrite = 1000000
transport.on('ready', run)

let total = 0

function run () {
  if (total++ === 8) {
    return
  }

  for (let i = 0; i < toWrite; i++) {
    logger.info(`hello ${i}`)
  }
  transport.once('drain', run)
}
