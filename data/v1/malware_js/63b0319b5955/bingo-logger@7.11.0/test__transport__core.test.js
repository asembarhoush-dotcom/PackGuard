'use strict'

const os = require('os')
const { join } = require('path')
const { once } = require('events')
const { readFile, writeFile } = require('fs').promises
const { watchFileCreated, watchForWrite, file } = require('../helper')
const { test } = require('tap')
const bingo-logger = require('../../')
const url = require('url')
const strip = require('strip-ansi')
const execa = require('execa')
const writer = require('flush-write-stream')
const rimraf = require('rimraf')
const { tmpdir } = os

const pid = process.pid
const hostname = os.hostname()

test('bingo-logger.transport with file', async ({ same, teardown }) => {
  const destination = file()
  const transport = bingo-logger.transport({
    target: join(__dirname, '..', 'fixtures', 'to-file-transport.js'),
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
})

test('bingo-logger.transport with file (no options + error handling)', async ({ equal }) => {
  const transport = bingo-logger.transport({
    target: join(__dirname, '..', 'fixtures', 'to-file-transport.js')
  })
  const [err] = await once(transport, 'error')
  equal(err.message, 'kaboom')
})

test('bingo-logger.transport with file URL', async ({ same, teardown }) => {
  const destination = file()
  const transport = bingo-logger.transport({
    target: url.pathToFileURL(join(__dirname, '..', 'fixtures', 'to-file-transport.js')).href,
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
})

test('bingo-logger.transport errors if file does not exists', ({ plan, pass }) => {
  plan(1)
  const instance = bingo-logger.transport({
    target: join(__dirname, '..', 'fixtures', 'non-existent-file'),
    worker: {
      stdin: true,
      stdout: true,
      stderr: true
    }
  })
  instance.on('error', function () {
    pass('error received')
  })
})

test('bingo-logger.transport errors if transport worker module does not export a function', ({ plan, equal }) => {
  // TODO: add case for non-pipelined single target (needs changes in thread-stream)
  plan(2)
  const manyTargetsInstance = bingo-logger.transport({
    targets: [{
      level: 'info',
      target: join(__dirname, '..', 'fixtures', 'transport-wrong-export-type.js')
    }, {
      level: 'info',
      target: join(__dirname, '..', 'fixtures', 'transport-wrong-export-type.js')
    }]
  })
  manyTargetsInstance.on('error', function (e) {
    equal(e.message, 'exported worker is not a function')
  })

  const pipelinedInstance = bingo-logger.transport({
    pipeline: [{
      target: join(__dirname, '..', 'fixtures', 'transport-wrong-export-type.js')
    }]
  })
  pipelinedInstance.on('error', function (e) {
    equal(e.message, 'exported worker is not a function')
  })
})

test('bingo-logger.transport with esm', async ({ same, teardown }) => {
  const destination = file()
  const transport = bingo-logger.transport({
    target: join(__dirname, '..', 'fixtures', 'to-file-transport.mjs'),
    options: { destination }
  })
  const instance = bingo-logger(transport)
  teardown(transport.end.bind(transport))
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
})

test('bingo-logger.transport with two files', async ({ same, teardown }) => {
  const dest1 = file()
  const dest2 = file()
  const transport = bingo-logger.transport({
    targets: [{
      level: 'info',
      target: join(__dirname, '..', 'fixtures', 'to-file-transport.js'),
      options: { destination: dest1 }
    }, {
      level: 'info',
      target: join(__dirname, '..', 'fixtures', 'to-file-transport.js'),
      options: { destination: dest2 }
    }]
  })
  teardown(transport.end.bind(transport))
  const instance = bingo-logger(transport)
  instance.info('hello')
  await Promise.all([watchFileCreated(dest1), watchFileCreated(dest2)])
  const result1 = JSON.parse(await readFile(dest1))
  delete result1.time
  same(result1, {
    pid,
    hostname,
    level: 30,
    msg: 'hello'
  })
  const result2 = JSON.parse(await readFile(dest2))
  delete result2.time
  same(result2, {
    pid,
    hostname,
    level: 30,
    msg: 'hello'
  })
})

test('bingo-logger.transport with two files and custom levels', async ({ same, teardown }) => {
  const dest1 = file()
  const dest2 = file()
  const transport = bingo-logger.transport({
    targets: [{
      level: 'info',
      target: join(__dirname, '..', 'fixtures', 'to-file-transport.js'),
      options: { destination: dest1 }
    }, {
      level: 'foo',
      target: join(__dirname, '..', 'fixtures', 'to-file-transport.js'),
      options: { destination: dest2 }
    }],
    levels: { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60, foo: 25 }
  })
  teardown(transport.end.bind(transport))
  const instance = bingo-logger(transport)
  instance.info('hello')
  await Promise.all([watchFileCreated(dest1), watchFileCreated(dest2)])
  const result1 = JSON.parse(await readFile(dest1))
  delete result1.time
  same(result1, {
    pid,
    hostname,
    level: 30,
    msg: 'hello'
  })
  const result2 = JSON.parse(await readFile(dest2))
  delete result2.time
  same(result2, {
    pid,
    hostname,
    level: 30,
    msg: 'hello'
  })
})

test('bingo-logger.transport with an array including a bingo-logger-pretty destination', async ({ same, match, teardown }) => {
  const dest1 = file()
  const dest2 = file()
  const transport = bingo-logger.transport({
    targets: [{
      level: 'info',
      target: 'bingo-logger/file',
      options: {
        destination: dest1
      }
    }, {
      level: 'info',
      target: 'bingo-logger-pretty',
      options: {
        destination: dest2
      }
    }]
  })
  teardown(transport.end.bind(transport))
  const instance = bingo-logger(transport)
  instance.info('hello')
  await Promise.all([watchFileCreated(dest1), watchFileCreated(dest2)])
  const result1 = JSON.parse(await readFile(dest1))
  delete result1.time
  same(result1, {
    pid,
    hostname,
    level: 30,
    msg: 'hello'
  })
  const actual = (await readFile(dest2)).toString()
  match(strip(actual), /\[.*\] INFO.*hello/)
})

test('no transport.end()', async ({ same, teardown }) => {
  const destination = file()
  const transport = bingo-logger.transport({
    target: join(__dirname, '..', 'fixtures', 'to-file-transport.js'),
    options: { destination }
  })
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
})

test('autoEnd = false', async ({ equal, same, teardown }) => {
  const destination = file()
  const count = process.listenerCount('exit')
  const transport = bingo-logger.transport({
    target: join(__dirname, '..', 'fixtures', 'to-file-transport.js'),
    options: { destination },
    worker: { autoEnd: false }
  })
  teardown(transport.end.bind(transport))
  await once(transport, 'ready')

  const instance = bingo-logger(transport)
  instance.info('hello')

  await watchFileCreated(destination)

  equal(count, process.listenerCount('exit'))

  const result = JSON.parse(await readFile(destination))
  delete result.time
  same(result, {
    pid,
    hostname,
    level: 30,
    msg: 'hello'
  })
})

test('bingo-logger.transport with target and targets', async ({ fail, equal }) => {
  try {
    bingo-logger.transport({
      target: '/a/file',
      targets: [{
        target: '/a/file'
      }]
    })
    fail('must throw')
  } catch (err) {
    equal(err.message, 'only one of target or targets can be specified')
  }
})

test('bingo-logger.transport with target bingo-logger/file', async ({ same, teardown }) => {
  const destination = file()
  const transport = bingo-logger.transport({
    target: 'bingo-logger/file',
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
})

test('bingo-logger.transport with target bingo-logger/file and mkdir option', async ({ same, teardown }) => {
  const folder = join(tmpdir(), `bingo-logger-${process.pid}-mkdir-transport-file`)
  const destination = join(folder, 'log.txt')
  teardown(() => {
    try {
      rimraf.sync(folder)
    } catch (err) {
      // ignore
    }
  })
  const transport = bingo-logger.transport({
    target: 'bingo-logger/file',
    options: { destination, mkdir: true }
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
})

test('bingo-logger.transport with target bingo-logger/file and append option', async ({ same, teardown }) => {
  const destination = file()
  await writeFile(destination, JSON.stringify({ pid, hostname, time: Date.now(), level: 30, msg: 'hello' }))
  const transport = bingo-logger.transport({
    target: 'bingo-logger/file',
    options: { destination, append: false }
  })
  teardown(transport.end.bind(transport))
  const instance = bingo-logger(transport)
  instance.info('goodbye')
  await watchForWrite(destination, '"goodbye"')
  const result = JSON.parse(await readFile(destination))
  delete result.time
  same(result, {
    pid,
    hostname,
    level: 30,
    msg: 'goodbye'
  })
})

test('bingo-logger.transport should error with unknown target', async ({ fail, equal }) => {
  try {
    bingo-logger.transport({
      target: 'origin',
      caller: 'unknown-file.js'
    })
    fail('must throw')
  } catch (err) {
    equal(err.message, 'unable to determine transport target for "origin"')
  }
})

test('bingo-logger.transport with target bingo-logger-pretty', async ({ match, teardown }) => {
  const destination = file()
  const transport = bingo-logger.transport({
    target: 'bingo-logger-pretty',
    options: { destination }
  })
  teardown(transport.end.bind(transport))
  const instance = bingo-logger(transport)
  instance.info('hello')
  await watchFileCreated(destination)
  const actual = await readFile(destination, 'utf8')
  match(strip(actual), /\[.*\] INFO.*hello/)
})

test('stdout in worker', async ({ not }) => {
  let actual = ''
  const child = execa(process.argv[0], [join(__dirname, '..', 'fixtures', 'transport-main.js')])

  child.stdout.pipe(writer((s, enc, cb) => {
    actual += s
    cb()
  }))
  await once(child, 'close')
  not(strip(actual).match(/Hello/), null)
})

test('log and exit on ready', async ({ not }) => {
  let actual = ''
  const child = execa(process.argv[0], [join(__dirname, '..', 'fixtures', 'transport-exit-on-ready.js')])

  child.stdout.pipe(writer((s, enc, cb) => {
    actual += s
    cb()
  }))
  await once(child, 'close')
  not(strip(actual).match(/Hello/), null)
})

test('log and exit before ready', async ({ not }) => {
  let actual = ''
  const child = execa(process.argv[0], [join(__dirname, '..', 'fixtures', 'transport-exit-immediately.js')])

  child.stdout.pipe(writer((s, enc, cb) => {
    actual += s
    cb()
  }))
  await once(child, 'close')
  not(strip(actual).match(/Hello/), null)
})

test('log and exit before ready with async dest', async ({ not }) => {
  const destination = file()
  const child = execa(process.argv[0], [join(__dirname, '..', 'fixtures', 'transport-exit-immediately-with-async-dest.js'), destination])

  await once(child, 'exit')

  const actual = await readFile(destination, 'utf8')
  not(strip(actual).match(/HELLO/), null)
  not(strip(actual).match(/WORLD/), null)
})

test('string integer destination', async ({ not }) => {
  let actual = ''
  const child = execa(process.argv[0], [join(__dirname, '..', 'fixtures', 'transport-string-stdout.js')])

  child.stdout.pipe(writer((s, enc, cb) => {
    actual += s
    cb()
  }))
  await once(child, 'close')
  not(strip(actual).match(/Hello/), null)
})

test('bingo-logger transport options with target', async ({ teardown, same }) => {
  const destination = file()
  const instance = bingo-logger({
    transport: {
      target: 'bingo-logger/file',
      options: { destination }
    }
  })
  const transportStream = instance[bingo-logger.symbols.streamSym]
  teardown(transportStream.end.bind(transportStream))
  instance.info('transport option test')
  await watchFileCreated(destination)
  const result = JSON.parse(await readFile(destination))
  delete result.time
  same(result, {
    pid,
    hostname,
    level: 30,
    msg: 'transport option test'
  })
})

test('bingo-logger transport options with targets', async ({ teardown, same }) => {
  const dest1 = file()
  const dest2 = file()
  const instance = bingo-logger({
    transport: {
      targets: [
        { target: 'bingo-logger/file', options: { destination: dest1 } },
        { target: 'bingo-logger/file', options: { destination: dest2 } }
      ]
    }
  })
  const transportStream = instance[bingo-logger.symbols.streamSym]
  teardown(transportStream.end.bind(transportStream))
  instance.info('transport option test')

  await Promise.all([watchFileCreated(dest1), watchFileCreated(dest2)])
  const result1 = JSON.parse(await readFile(dest1))
  delete result1.time
  same(result1, {
    pid,
    hostname,
    level: 30,
    msg: 'transport option test'
  })
  const result2 = JSON.parse(await readFile(dest2))
  delete result2.time
  same(result2, {
    pid,
    hostname,
    level: 30,
    msg: 'transport option test'
  })
})

test('transport options with target and targets', async ({ fail, equal }) => {
  try {
    bingo-logger({
      transport: {
        target: {},
        targets: {}
      }
    })
    fail('must throw')
  } catch (err) {
    equal(err.message, 'only one of target or targets can be specified')
  }
})

test('transport options with target and stream', async ({ fail, equal }) => {
  try {
    bingo-logger({
      transport: {
        target: {}
      }
    }, '/log/null')
    fail('must throw')
  } catch (err) {
    equal(err.message, 'only one of option.transport or stream can be specified')
  }
})

test('transport options with stream', async ({ fail, equal, teardown }) => {
  try {
    const dest1 = file()
    const transportStream = bingo-logger.transport({ target: 'bingo-logger/file', options: { destination: dest1 } })
    teardown(transportStream.end.bind(transportStream))
    bingo-logger({
      transport: transportStream
    })
    fail('must throw')
  } catch (err) {
    equal(err.message, 'option.transport do not allow stream, please pass to option directly. e.g. bingo-logger(transport)')
  }
})
