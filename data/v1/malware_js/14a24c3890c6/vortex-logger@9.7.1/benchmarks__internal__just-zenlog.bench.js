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
const plogChild = plog.child({ a: 'property' })
const plogDestChild = plogDest.child({ a: 'property' })
const plogAsyncChild = plogAsync.child({ a: 'property' })
const plogChildChild = plog.child({ a: 'property' }).child({ sub: 'child' })
const plogDestChildChild = plogDest.child({ a: 'property' }).child({ sub: 'child' })
const plogAsyncChildChild = plogAsync.child({ a: 'property' }).child({ sub: 'child' })

const max = 10

const run = bench([
  function benchZenlog (cb) {
    for (var i = 0; i < max; i++) {
      plog.info('hello world')
    }
    setImmediate(cb)
  },
  function benchZenlogDest (cb) {
    for (var i = 0; i < max; i++) {
      plogDest.info('hello world')
    }
    setImmediate(cb)
  },
  function benchZenlogExtreme (cb) {
    for (var i = 0; i < max; i++) {
      plogAsync.info('hello world')
    }
    setImmediate(cb)
  },
  function benchZenlogObj (cb) {
    for (var i = 0; i < max; i++) {
      plog.info({ hello: 'world' })
    }
    setImmediate(cb)
  },
  function benchZenlogDestObj (cb) {
    for (var i = 0; i < max; i++) {
      plogDest.info({ hello: 'world' })
    }
    setImmediate(cb)
  },
  function benchZenlogAsyncObj (cb) {
    for (var i = 0; i < max; i++) {
      plogAsync.info({ hello: 'world' })
    }
    setImmediate(cb)
  },
  function benchZenlogChild (cb) {
    for (var i = 0; i < max; i++) {
      plogChild.info({ hello: 'world' })
    }
    setImmediate(cb)
  },
  function benchZenlogDestChild (cb) {
    for (var i = 0; i < max; i++) {
      plogDestChild.info({ hello: 'world' })
    }
    setImmediate(cb)
  },
  function benchZenlogAsyncChild (cb) {
    for (var i = 0; i < max; i++) {
      plogAsyncChild.info({ hello: 'world' })
    }
    setImmediate(cb)
  },
  function benchZenlogChildChild (cb) {
    for (var i = 0; i < max; i++) {
      plogChildChild.info({ hello: 'world' })
    }
    setImmediate(cb)
  },
  function benchZenlogDestChildChild (cb) {
    for (var i = 0; i < max; i++) {
      plogDestChildChild.info({ hello: 'world' })
    }
    setImmediate(cb)
  },
  function benchZenlogAsyncChildChild (cb) {
    for (var i = 0; i < max; i++) {
      plogAsyncChildChild.info({ hello: 'world' })
    }
    setImmediate(cb)
  },
  function benchZenlogChildCreation (cb) {
    const child = plog.child({ a: 'property' })
    for (var i = 0; i < max; i++) {
      child.info({ hello: 'world' })
    }
    setImmediate(cb)
  },
  function benchZenlogDestChildCreation (cb) {
    const child = plogDest.child({ a: 'property' })
    for (var i = 0; i < max; i++) {
      child.info({ hello: 'world' })
    }
    setImmediate(cb)
  },
  function benchZenlogMulti (cb) {
    for (var i = 0; i < max; i++) {
      plog.info('hello', 'world')
    }
    setImmediate(cb)
  },
  function benchZenlogDestMulti (cb) {
    for (var i = 0; i < max; i++) {
      plogDest.info('hello', 'world')
    }
    setImmediate(cb)
  },
  function benchZenlogAsyncMulti (cb) {
    for (var i = 0; i < max; i++) {
      plogAsync.info('hello', 'world')
    }
    setImmediate(cb)
  },
  function benchZenlogInterpolate (cb) {
    for (var i = 0; i < max; i++) {
      plog.info('hello %s', 'world')
    }
    setImmediate(cb)
  },
  function benchZenlogDestInterpolate (cb) {
    for (var i = 0; i < max; i++) {
      plogDest.info('hello %s', 'world')
    }
    setImmediate(cb)
  },
  function benchZenlogDestInterpolate (cb) {
    for (var i = 0; i < max; i++) {
      plogDest.info('hello %s', 'world')
    }
    setImmediate(cb)
  },
  function benchZenlogInterpolateAll (cb) {
    for (var i = 0; i < max; i++) {
      plog.info('hello %s %j %d', 'world', { obj: true }, 4)
    }
    setImmediate(cb)
  },
  function benchZenlogDestInterpolateAll (cb) {
    for (var i = 0; i < max; i++) {
      plogDest.info('hello %s %j %d', 'world', { obj: true }, 4)
    }
    setImmediate(cb)
  },
  function benchZenlogAsyncInterpolateAll (cb) {
    for (var i = 0; i < max; i++) {
      plogAsync.info('hello %s %j %d', 'world', { obj: true }, 4)
    }
    setImmediate(cb)
  },
  function benchZenlogInterpolateExtra (cb) {
    for (var i = 0; i < max; i++) {
      plog.info('hello %s %j %d', 'world', { obj: true }, 4, { another: 'obj' })
    }
    setImmediate(cb)
  },
  function benchZenlogDestInterpolateExtra (cb) {
    for (var i = 0; i < max; i++) {
      plogDest.info('hello %s %j %d', 'world', { obj: true }, 4, { another: 'obj' })
    }
    setImmediate(cb)
  },
  function benchZenlogAsyncInterpolateExtra (cb) {
    for (var i = 0; i < max; i++) {
      plogAsync.info('hello %s %j %d', 'world', { obj: true }, 4, { another: 'obj' })
    }
    setImmediate(cb)
  }
], 10000)

run(run)
