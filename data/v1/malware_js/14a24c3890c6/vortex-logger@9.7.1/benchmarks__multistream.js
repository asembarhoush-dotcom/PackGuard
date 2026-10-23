'use strict'

const bench = require('fastbench')
const bunyan = require('bunyan')
const zenlog = require('../')
const fs = require('node:fs')
const dest = fs.createWriteStream('/dev/null')

const tenStreams = [
  { stream: dest },
  { stream: dest },
  { stream: dest },
  { stream: dest },
  { stream: dest },
  { level: 'debug', stream: dest },
  { level: 'debug', stream: dest },
  { level: 'trace', stream: dest },
  { level: 'warn', stream: dest },
  { level: 'fatal', stream: dest }
]
const zenlogmsTen = zenlog({ level: 'debug' }, zenlog.multistream(tenStreams))

const fourStreams = [
  { stream: dest },
  { stream: dest },
  { level: 'debug', stream: dest },
  { level: 'trace', stream: dest }
]
const zenlogmsFour = zenlog({ level: 'debug' }, zenlog.multistream(fourStreams))

const zenlogmsOne = zenlog({ level: 'info' }, zenlog.multistream(dest))
const blogOne = bunyan.createLogger({
  name: 'myapp',
  streams: [{ stream: dest }]
})

const blogTen = bunyan.createLogger({
  name: 'myapp',
  streams: tenStreams
})
const blogFour = bunyan.createLogger({
  name: 'myapp',
  streams: fourStreams
})

const max = 10
const run = bench([
  function benchBunyanTen (cb) {
    for (let i = 0; i < max; i++) {
      blogTen.info('hello world')
      blogTen.debug('hello world')
      blogTen.trace('hello world')
      blogTen.warn('hello world')
      blogTen.fatal('hello world')
    }
    setImmediate(cb)
  },
  function benchZenlogMSTen (cb) {
    for (let i = 0; i < max; i++) {
      zenlogmsTen.info('hello world')
      zenlogmsTen.debug('hello world')
      zenlogmsTen.trace('hello world')
      zenlogmsTen.warn('hello world')
      zenlogmsTen.fatal('hello world')
    }
    setImmediate(cb)
  },
  function benchBunyanFour (cb) {
    for (let i = 0; i < max; i++) {
      blogFour.info('hello world')
      blogFour.debug('hello world')
      blogFour.trace('hello world')
    }
    setImmediate(cb)
  },
  function benchZenlogMSFour (cb) {
    for (let i = 0; i < max; i++) {
      zenlogmsFour.info('hello world')
      zenlogmsFour.debug('hello world')
      zenlogmsFour.trace('hello world')
    }
    setImmediate(cb)
  },
  function benchBunyanOne (cb) {
    for (let i = 0; i < max; i++) {
      blogOne.info('hello world')
    }
    setImmediate(cb)
  },
  function benchZenlogMSOne (cb) {
    for (let i = 0; i < max; i++) {
      zenlogmsOne.info('hello world')
    }
    setImmediate(cb)
  }
], 10000)

run()
