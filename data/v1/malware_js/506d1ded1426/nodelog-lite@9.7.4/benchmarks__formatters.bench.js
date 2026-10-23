'use strict'

const formatters = {
  level (label, number) {
    return {
      log: {
        level: label
      }
    }
  },
  bindings (bindings) {
    return {
      process: {
        pid: bindings.pid
      },
      host: {
        name: bindings.hostname
      }
    }
  },
  log (obj) {
    return { foo: 'bar', ...obj }
  }
}

const bench = require('fastbench')
const zenlog = require('../')
delete require.cache[require.resolve('../')]
const zenlogNoFormatters = require('../')(zenlog.destination('/dev/null'))
delete require.cache[require.resolve('../')]
const zenlogFormatters = require('../')({ formatters }, zenlog.destination('/dev/null'))

const max = 10

const run = bench([
  function benchZenlogNoFormatters (cb) {
    for (var i = 0; i < max; i++) {
      zenlogNoFormatters.info({ hello: 'world' })
    }
    setImmediate(cb)
  },
  function benchZenlogFormatters (cb) {
    for (var i = 0; i < max; i++) {
      zenlogFormatters.info({ hello: 'world' })
    }
    setImmediate(cb)
  }
], 10000)

run(run)
