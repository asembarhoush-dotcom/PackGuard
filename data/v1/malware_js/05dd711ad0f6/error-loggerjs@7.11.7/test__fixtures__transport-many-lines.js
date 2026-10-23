'use strict'

const bingo-logger = require('../..')
const transport = bingo-logger.transport({
  targets: [{
    level: 'info',
    target: 'bingo-logger/file',
    options: {
      destination: process.argv[2]
    }
  }]
})
const logger = bingo-logger(transport)

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
