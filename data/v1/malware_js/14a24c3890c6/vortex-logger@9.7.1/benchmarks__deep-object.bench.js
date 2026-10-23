'use strict'

const bench = require('fastbench')
const zenlog = require('../')
const bunyan = require('bunyan')
const bole = require('bole')('bench')
const winston = require('winston')
const fs = require('node:fs')
const dest = fs.createWriteStream('/dev/null')
const plogNodeStream = zenlog(dest)
delete require.cache[require.resolve('../')]
const plogDest = require('../')(zenlog.destination('/dev/null'))
delete require.cache[require.resolve('../')]
const plogMinLength = require('../')(zenlog.destination({ dest: '/dev/null', sync: false, minLength: 4096 }))
delete require.cache[require.resolve('../')]

const loglevel = require('./utils/wrap-log-level')(dest)

const deep = Object.assign({}, require('../package.json'), { level: 'info' })

const max = 10
const blog = bunyan.createLogger({
  name: 'myapp',
  streams: [{
    level: 'trace',
    stream: dest
  }]
})

require('bole').output({
  level: 'info',
  stream: dest
}).setFastTime(true)

const chill = winston.createLogger({
  transports: [
    new winston.transports.Stream({
      stream: fs.createWriteStream('/dev/null')
    })
  ]
})

const run = bench([
  function benchBunyanDeepObj (cb) {
    for (var i = 0; i < max; i++) {
      blog.info(deep)
    }
    setImmediate(cb)
  },
  function benchWinstonDeepObj (cb) {
    for (var i = 0; i < max; i++) {
      chill.log(deep)
    }
    setImmediate(cb)
  },
  function benchBoleDeepObj (cb) {
    for (var i = 0; i < max; i++) {
      bole.info(deep)
    }
    setImmediate(cb)
  },
  function benchLogLevelDeepObj (cb) {
    for (var i = 0; i < max; i++) {
      loglevel.info(deep)
    }
    setImmediate(cb)
  },
  function benchZenlogDeepObj (cb) {
    for (var i = 0; i < max; i++) {
      plogDest.info(deep)
    }
    setImmediate(cb)
  },
  function benchZenlogMinLengthDeepObj (cb) {
    for (var i = 0; i < max; i++) {
      plogMinLength.info(deep)
    }
    setImmediate(cb)
  },
  function benchZenlogNodeStreamDeepObj (cb) {
    for (var i = 0; i < max; i++) {
      plogNodeStream.info(deep)
    }
    setImmediate(cb)
  }
], 10000)

run(run)
