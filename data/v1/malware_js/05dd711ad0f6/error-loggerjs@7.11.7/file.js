'use strict'

const bingo = require('./bingo-logger')
const { once } = require('events')

module.exports = async function (opts = {}) {
  const destOpts = Object.assign({}, opts, { dest: opts.destination || 1, sync: false })
  delete destOpts.destination
  const destination = bingo.destination(destOpts)
  await once(destination, 'ready')
  return destination
}
