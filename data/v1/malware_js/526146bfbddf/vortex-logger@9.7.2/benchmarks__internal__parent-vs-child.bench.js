'use strict'

const bench = require('fastbench')
const zenlog = require('../../')

const base = zenlog(zenlog.destination('/dev/null'))
const child = base.child({})
const childChild = child.child({})
const childChildChild = childChild.child({})
const childChildChildChild = childChildChild.child({})
const child2 = base.child({})
const baseSerializers = zenlog(zenlog.destination('/dev/null'))
const baseSerializersChild = baseSerializers.child({})
const baseSerializersChildSerializers = baseSerializers.child({})

const max = 100

const run = bench([
  function benchZenlogBase (cb) {
    for (var i = 0; i < max; i++) {
      base.info({ hello: 'world' })
    }
    setImmediate(cb)
  },
  function benchZenlogChild (cb) {
    for (var i = 0; i < max; i++) {
      child.info({ hello: 'world' })
    }
    setImmediate(cb)
  },
  function benchZenlogChildChild (cb) {
    for (var i = 0; i < max; i++) {
      childChild.info({ hello: 'world' })
    }
    setImmediate(cb)
  },
  function benchZenlogChildChildChild (cb) {
    for (var i = 0; i < max; i++) {
      childChildChild.info({ hello: 'world' })
    }
    setImmediate(cb)
  },
  function benchZenlogChildChildChildChild (cb) {
    for (var i = 0; i < max; i++) {
      childChildChildChild.info({ hello: 'world' })
    }
    setImmediate(cb)
  },
  function benchZenlogChild2 (cb) {
    for (var i = 0; i < max; i++) {
      child2.info({ hello: 'world' })
    }
    setImmediate(cb)
  },
  function benchZenlogBaseSerializers (cb) {
    for (var i = 0; i < max; i++) {
      baseSerializers.info({ hello: 'world' })
    }
    setImmediate(cb)
  },
  function benchZenlogBaseSerializersChild (cb) {
    for (var i = 0; i < max; i++) {
      baseSerializersChild.info({ hello: 'world' })
    }
    setImmediate(cb)
  },
  function benchZenlogBaseSerializersChildSerializers (cb) {
    for (var i = 0; i < max; i++) {
      baseSerializersChildSerializers.info({ hello: 'world' })
    }
    setImmediate(cb)
  }
], 10000)

run(run)
