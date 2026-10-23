'use strict'

const bench = require('fastbench')
const zenlog = require('../')
const bunyan = require('bunyan')
const fs = require('node:fs')
const dest = fs.createWriteStream('/dev/null')
const plogNodeStream = zenlog(dest).child({ a: 'property' }).child({ sub: 'child' })
delete require.cache[require.resolve('../')]
const plogDest = require('../')(zenlog.destination('/dev/null')).child({ a: 'property' }).child({ sub: 'child' })
delete require.cache[require.resolve('../')]
const plogMinLength = require('../')(zenlog.destination({ dest: '/dev/null', sync: false, minLength: 4096 }))
  .child({ a: 'property' })
  .child({ sub: 'child' })

const max = 10
const blog = bunyan.createLogger({
  name: 'myapp',
  streams: [{
    level: 'trace',
    stream: dest
  }]
}).child({ a: 'property' }).child({ sub: 'child' })

const run = bench([
  function benchBunyanChildChild (cb) {
    for (var i = 0; i < max; i++) {
      blog.info({ hello: 'world' })
    }
    setImmediate(cb)
  },
  function benchZenlogChildChild (cb) {
    for (var i = 0; i < max; i++) {
      plogDest.info({ hello: 'world' })
    }
    setImmediate(cb)
  },
  function benchZenlogMinLengthChildChild (cb) {
    for (var i = 0; i < max; i++) {
      plogMinLength.info({ hello: 'world' })
    }
    setImmediate(cb)
  },
  function benchZenlogNodeStreamChildChild (cb) {
    for (var i = 0; i < max; i++) {
      plogNodeStream.info({ hello: 'world' })
    }
    setImmediate(cb)
  }
], 10000)

run(run)
