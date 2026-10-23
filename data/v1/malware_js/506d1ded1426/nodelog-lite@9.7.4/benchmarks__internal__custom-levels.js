'use strict'

const bench = require('fastbench')
const zenlog = require('../../')

const base = zenlog(zenlog.destination('/dev/null'))
const baseCl = zenlog({
  customLevels: { foo: 31 }
}, zenlog.destination('/dev/null'))
const child = base.child({})
const childCl = base.child({
  customLevels: { foo: 31 }
})
const childOfBaseCl = baseCl.child({})

const max = 100

const run = bench([
  function benchZenlogNoCustomLevel (cb) {
    for (var i = 0; i < max; i++) {
      base.info({ hello: 'world' })
    }
    setImmediate(cb)
  },
  function benchZenlogCustomLevel (cb) {
    for (var i = 0; i < max; i++) {
      baseCl.foo({ hello: 'world' })
    }
    setImmediate(cb)
  },
  function benchChildNoCustomLevel (cb) {
    for (var i = 0; i < max; i++) {
      child.info({ hello: 'world' })
    }
    setImmediate(cb)
  },
  function benchZenlogChildCustomLevel (cb) {
    for (var i = 0; i < max; i++) {
      childCl.foo({ hello: 'world' })
    }
    setImmediate(cb)
  },
  function benchZenlogChildInheritedCustomLevel (cb) {
    for (var i = 0; i < max; i++) {
      childOfBaseCl.foo({ hello: 'world' })
    }
    setImmediate(cb)
  },
  function benchZenlogChildCreation (cb) {
    const child = base.child({})
    for (var i = 0; i < max; i++) {
      child.info({ hello: 'world' })
    }
    setImmediate(cb)
  },
  function benchZenlogChildCreationCustomLevel (cb) {
    const child = base.child({
      customLevels: { foo: 31 }
    })
    for (var i = 0; i < max; i++) {
      child.foo({ hello: 'world' })
    }
    setImmediate(cb)
  }
], 10000)

run(run)
