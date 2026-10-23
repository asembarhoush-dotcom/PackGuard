'use strict'
const test = require('tape')
const zenlog = require('../browser')

Date.now = () => 1599400603614

test('null timestamp', ({ end, is }) => {
  const instance = zenlog({
    timestamp: zenlog.stdTimeFunctions.nullTime,
    browser: {
      asObject: true,
      write: function (o) {
        is(o.time, undefined)
      }
    }
  })
  instance.info('hello world')
  end()
})

test('iso timestamp', ({ end, is }) => {
  const instance = zenlog({
    timestamp: zenlog.stdTimeFunctions.isoTime,
    browser: {
      asObject: true,
      write: function (o) {
        is(o.time, '2020-09-06T13:56:43.614Z')
      }
    }
  })
  instance.info('hello world')
  end()
})

test('epoch timestamp', ({ end, is }) => {
  const instance = zenlog({
    timestamp: zenlog.stdTimeFunctions.epochTime,
    browser: {
      asObject: true,
      write: function (o) {
        is(o.time, 1599400603614)
      }
    }
  })
  instance.info('hello world')
  end()
})

test('unix timestamp', ({ end, is }) => {
  const instance = zenlog({
    timestamp: zenlog.stdTimeFunctions.unixTime,
    browser: {
      asObject: true,
      write: function (o) {
        is(o.time, Math.round(1599400603614 / 1000.0))
      }
    }
  })
  instance.info('hello world')
  end()
})

test('epoch timestamp by default', ({ end, is }) => {
  const instance = zenlog({
    browser: {
      asObject: true,
      write: function (o) {
        is(o.time, 1599400603614)
      }
    }
  })
  instance.info('hello world')
  end()
})

test('not print timestamp if the option is false', ({ end, is }) => {
  const instance = zenlog({
    timestamp: false,
    browser: {
      asObject: true,
      write: function (o) {
        is(o.time, undefined)
      }
    }
  })
  instance.info('hello world')
  end()
})
