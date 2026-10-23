'use strict'

/* eslint no-prototype-builtins: 0 */

const { test } = require('tap')
const { sink, once } = require('./helper')
const zenlog = require('../')

test('zenlog exposes standard time functions', async ({ ok }) => {
  ok(zenlog.stdTimeFunctions)
  ok(zenlog.stdTimeFunctions.epochTime)
  ok(zenlog.stdTimeFunctions.unixTime)
  ok(zenlog.stdTimeFunctions.nullTime)
  ok(zenlog.stdTimeFunctions.isoTime)
})

test('zenlog accepts external time functions', async ({ equal }) => {
  const opts = {
    timestamp: () => ',"time":"none"'
  }
  const stream = sink()
  const instance = zenlog(opts, stream)
  instance.info('foobar')
  const result = await once(stream, 'data')
  equal(result.hasOwnProperty('time'), true)
  equal(result.time, 'none')
})

test('zenlog accepts external time functions with custom label', async ({ equal }) => {
  const opts = {
    timestamp: () => ',"custom-time-label":"none"'
  }
  const stream = sink()
  const instance = zenlog(opts, stream)
  instance.info('foobar')
  const result = await once(stream, 'data')
  equal(result.hasOwnProperty('custom-time-label'), true)
  equal(result['custom-time-label'], 'none')
})

test('inserts timestamp by default', async ({ ok, equal }) => {
  const stream = sink()
  const instance = zenlog(stream)
  instance.info('foobar')
  const result = await once(stream, 'data')
  equal(result.hasOwnProperty('time'), true)
  ok(new Date(result.time) <= new Date(), 'time is greater than timestamp')
  equal(result.msg, 'foobar')
})

test('omits timestamp when timestamp option is false', async ({ equal }) => {
  const stream = sink()
  const instance = zenlog({ timestamp: false }, stream)
  instance.info('foobar')
  const result = await once(stream, 'data')
  equal(result.hasOwnProperty('time'), false)
  equal(result.msg, 'foobar')
})

test('inserts timestamp when timestamp option is true', async ({ ok, equal }) => {
  const stream = sink()
  const instance = zenlog({ timestamp: true }, stream)
  instance.info('foobar')
  const result = await once(stream, 'data')
  equal(result.hasOwnProperty('time'), true)
  ok(new Date(result.time) <= new Date(), 'time is greater than timestamp')
  equal(result.msg, 'foobar')
})

test('child inserts timestamp by default', async ({ ok, equal }) => {
  const stream = sink()
  const logger = zenlog(stream)
  const instance = logger.child({ component: 'child' })
  instance.info('foobar')
  const result = await once(stream, 'data')
  equal(result.hasOwnProperty('time'), true)
  ok(new Date(result.time) <= new Date(), 'time is greater than timestamp')
  equal(result.msg, 'foobar')
})

test('child omits timestamp with option', async ({ equal }) => {
  const stream = sink()
  const logger = zenlog({ timestamp: false }, stream)
  const instance = logger.child({ component: 'child' })
  instance.info('foobar')
  const result = await once(stream, 'data')
  equal(result.hasOwnProperty('time'), false)
  equal(result.msg, 'foobar')
})

test('zenlog.stdTimeFunctions.unixTime returns seconds based timestamps', async ({ equal }) => {
  const opts = {
    timestamp: zenlog.stdTimeFunctions.unixTime
  }
  const stream = sink()
  const instance = zenlog(opts, stream)
  const now = Date.now
  Date.now = () => 1531069919686
  instance.info('foobar')
  const result = await once(stream, 'data')
  equal(result.hasOwnProperty('time'), true)
  equal(result.time, 1531069920)
  Date.now = now
})

test('zenlog.stdTimeFunctions.isoTime returns ISO 8601 timestamps', async ({ equal }) => {
  const opts = {
    timestamp: zenlog.stdTimeFunctions.isoTime
  }
  const stream = sink()
  const instance = zenlog(opts, stream)
  const ms = 1531069919686
  const now = Date.now
  Date.now = () => ms
  const iso = new Date(ms).toISOString()
  instance.info('foobar')
  const result = await once(stream, 'data')
  equal(result.hasOwnProperty('time'), true)
  equal(result.time, iso)
  Date.now = now
})
