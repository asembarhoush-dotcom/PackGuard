'use strict'

const bench = require('fastbench')
const zenlog = require('../../zenlog')
const fs = require('node:fs')
const dest = fs.createWriteStream('/dev/null')
const plog = zenlog(dest)
delete require.cache[require.resolve('../../')]
const plogDest = require('../../zenlog')(zenlog.destination('/dev/null'))
delete require.cache[require.resolve('../../')]
const plogAsync = require('../../zenlog')(zenlog.destination({ dest: '/dev/null', sync: false }))
const deep = require('../../package.json')
deep.deep = JSON.parse(JSON.stringify(deep))
deep.deep.deep = JSON.parse(JSON.stringify(deep))
const longStr = JSON.stringify(deep)

const max = 10

const run = bench([
  function benchZenlogLongString (cb) {
    for (var i = 0; i < max; i++) {
      plog.info(longStr)
    }
    setImmediate(cb)
  },
  function benchZenlogDestLongString (cb) {
    for (var i = 0; i < max; i++) {
      plogDest.info(longStr)
    }
    setImmediate(cb)
  },
  function benchZenlogAsyncLongString (cb) {
    for (var i = 0; i < max; i++) {
      plogAsync.info(longStr)
    }
    setImmediate(cb)
  },
  function benchZenlogDeepObj (cb) {
    for (var i = 0; i < max; i++) {
      plog.info(deep)
    }
    setImmediate(cb)
  },
  function benchZenlogDestDeepObj (cb) {
    for (var i = 0; i < max; i++) {
      plogDest.info(deep)
    }
    setImmediate(cb)
  },
  function benchZenlogAsyncDeepObj (cb) {
    for (var i = 0; i < max; i++) {
      plogAsync.info(deep)
    }
    setImmediate(cb)
  },
  function benchZenlogInterpolateDeep (cb) {
    for (var i = 0; i < max; i++) {
      plog.info('hello %j', deep)
    }
    setImmediate(cb)
  },
  function benchZenlogDestInterpolateDeep (cb) {
    for (var i = 0; i < max; i++) {
      plogDest.info('hello %j', deep)
    }
    setImmediate(cb)
  },
  function benchZenlogAsyncInterpolateDeep (cb) {
    for (var i = 0; i < max; i++) {
      plogAsync.info('hello %j', deep)
    }
    setImmediate(cb)
  }
], 1000)

run(run)
