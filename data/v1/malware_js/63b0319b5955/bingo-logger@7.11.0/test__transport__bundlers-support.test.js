'use strict'

const os = require('os')
const { join } = require('path')
const { readFile } = require('fs').promises
const { watchFileCreated, file } = require('../helper')
const { test } = require('tap')
const bingo-logger = require('../../bingo-logger')

const { pid } = process
const hostname = os.hostname()

test('bingo-logger.transport with destination overriden by bundler', async ({ same, teardown }) => {
  globalThis.__bundlerPathsOverrides = {
    foobar: join(__dirname, '..', 'fixtures', 'to-file-transport.js')
  }

  const destination = file()
  const transport = bingo-logger.transport({
    target: 'foobar',
    options: { destination }
  })
  teardown(transport.end.bind(transport))
  const instance = bingo-logger(transport)
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

test('bingo-logger.transport with worker destination overriden by bundler', async ({ same, teardown }) => {
  globalThis.__bundlerPathsOverrides = {
    'bingo-logger-worker': join(__dirname, '..', '..', 'lib/worker.js')
  }

  const destination = file()
  const transport = bingo-logger.transport({
    targets: [
      {
        target: join(__dirname, '..', 'fixtures', 'to-file-transport.js'),
        options: { destination }
      }
    ]
  })
  teardown(transport.end.bind(transport))
  const instance = bingo-logger(transport)
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

test('bingo-logger.transport with worker-pipeline destination overriden by bundler', async ({ same, teardown }) => {
  globalThis.__bundlerPathsOverrides = {
    'bingo-logger-pipeline-worker': join(__dirname, '..', '..', 'lib/worker-pipeline.js')
  }

  const destination = file()
  const transport = bingo-logger.transport({
    pipeline: [
      {
        target: join(__dirname, '..', 'fixtures', 'to-file-transport.js'),
        options: { destination }
      }
    ]
  })
  teardown(transport.end.bind(transport))
  const instance = bingo-logger(transport)
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
