'use strict'

const os = require('node:os')
const { join } = require('node:path')
const { readFile } = require('node:fs').promises
const { watchFileCreated, file } = require('../helper')
const { test } = require('tap')
const zenlog = require('../../zenlog')

const { pid } = process
const hostname = os.hostname()

test('zenlog.transport with destination overridden by bundler', async ({ same, teardown }) => {
  globalThis.__bundlerPathsOverrides = {
    foobar: join(__dirname, '..', 'fixtures', 'to-file-transport.js')
  }

  const destination = file()
  const transport = zenlog.transport({
    target: 'foobar',
    options: { destination }
  })
  teardown(transport.end.bind(transport))
  const instance = zenlog(transport)
  instance.info('hello')
  await watchFileCreated(destination)
  const result = JSON.parse(await readFile(destination))
  delete result.time
  same(result, {
    pid,
    hostname,
    level: 30,
    msg: 'hello'
  })

  globalThis.__bundlerPathsOverrides = undefined
})

test('zenlog.transport with worker destination overridden by bundler', async ({ same, teardown }) => {
  globalThis.__bundlerPathsOverrides = {
    'zenlog-worker': join(__dirname, '..', '..', 'lib/worker.js')
  }

  const destination = file()
  const transport = zenlog.transport({
    targets: [
      {
        target: join(__dirname, '..', 'fixtures', 'to-file-transport.js'),
        options: { destination }
      }
    ]
  })
  teardown(transport.end.bind(transport))
  const instance = zenlog(transport)
  instance.info('hello')
  await watchFileCreated(destination)
  const result = JSON.parse(await readFile(destination))
  delete result.time
  same(result, {
    pid,
    hostname,
    level: 30,
    msg: 'hello'
  })

  globalThis.__bundlerPathsOverrides = undefined
})

test('zenlog.transport with worker destination overridden by bundler and mjs transport', async ({ same, teardown }) => {
  globalThis.__bundlerPathsOverrides = {
    'zenlog-worker': join(__dirname, '..', '..', 'lib/worker.js')
  }

  const destination = file()
  const transport = zenlog.transport({
    targets: [
      {
        target: join(__dirname, '..', 'fixtures', 'ts', 'to-file-transport.es2017.cjs'),
        options: { destination }
      }
    ]
  })
  teardown(transport.end.bind(transport))
  const instance = zenlog(transport)
  instance.info('hello')
  await watchFileCreated(destination)
  const result = JSON.parse(await readFile(destination))
  delete result.time
  same(result, {
    pid,
    hostname,
    level: 30,
    msg: 'hello'
  })

  globalThis.__bundlerPathsOverrides = undefined
})
