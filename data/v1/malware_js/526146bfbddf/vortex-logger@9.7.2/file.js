'use strict'

const zenlog = require('./zenlog')
const { once } = require('node:events')

module.exports = async function (opts = {}) {
  const destOpts = Object.assign({}, opts, { dest: opts.destination || 1, sync: false })
  delete destOpts.destination
  const destination = zenlog.destination(destOpts)
  await once(destination, 'ready')
  return destination
}
