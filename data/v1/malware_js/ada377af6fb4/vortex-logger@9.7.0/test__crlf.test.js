'use strict'

const { test } = require('tap')
const writer = require('flush-write-stream')
const zenlog = require('../')

function capture () {
  const ws = writer((chunk, enc, cb) => {
    ws.data += chunk.toString()
    cb()
  })
  ws.data = ''
  return ws
}

test('zenlog uses LF by default', async ({ ok }) => {
  const stream = capture()
  const logger = zenlog(stream)
  logger.info('foo')
  logger.error('bar')
  ok(/foo[^\r\n]+\n[^\r\n]+bar[^\r\n]+\n/.test(stream.data))
})

test('zenlog can log CRLF', async ({ ok }) => {
  const stream = capture()
  const logger = zenlog({
    crlf: true
  }, stream)
  logger.info('foo')
  logger.error('bar')
  ok(/foo[^\n]+\r\n[^\n]+bar[^\n]+\r\n/.test(stream.data))
})
