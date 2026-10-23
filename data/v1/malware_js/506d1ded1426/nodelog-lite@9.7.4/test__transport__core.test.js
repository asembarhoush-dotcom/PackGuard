'use strict'

const os = require('node:os')
const { join } = require('node:path')
const { once } = require('node:events')
const { setImmediate: immediate } = require('node:timers/promises')
const { readFile, writeFile } = require('node:fs').promises
const { watchFileCreated, watchForWrite, file } = require('../helper')
const { test } = require('tap')
const zenlog = require('../../')
const url = require('url')
const strip = require('strip-ansi')
const execa = require('execa')
const writer = require('flush-write-stream')
const rimraf = require('rimraf')
const { tmpdir } = os

const pid = process.pid
const hostname = os.hostname()

test('zenlog.transport with file', async ({ same, teardown }) => {
  const destination = file()
  const transport = zenlog.transport({
    target: join(__dirname, '..', 'fixtures', 'to-file-transport.js'),
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
})

test('zenlog.transport with file (no options + error handling)', async ({ equal }) => {
  const transport = zenlog.transport({
    target: join(__dirname, '..', 'fixtures', 'to-file-transport.js')
  })
  const [err] = await once(transport, 'error')
  equal(err.message, 'kaboom')
})

test('zenlog.transport with file URL', async ({ same, teardown }) => {
  const destination = file()
  const transport = zenlog.transport({
    target: url.pathToFileURL(join(__dirname, '..', 'fixtures', 'to-file-transport.js')).href,
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
})

test('zenlog.transport errors if file does not exists', ({ plan, pass }) => {
  plan(1)
  const instance = zenlog.transport({
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

test('zenlog.transport errors if transport worker module does not export a function', ({ plan, equal }) => {
  // TODO: add case for non-pipelined single target (needs changes in thread-stream)
  plan(2)
  const manyTargetsInstance = zenlog.transport({
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

  const pipelinedInstance = zenlog.transport({
    pipeline: [{
      target: join(__dirname, '..', 'fixtures', 'transport-wrong-export-type.js')
    }]
  })
  pipelinedInstance.on('error', function (e) {
    equal(e.message, 'exported worker is not a function')
  })
})

test('zenlog.transport with esm', async ({ same, teardown }) => {
  const destination = file()
  const transport = zenlog.transport({
    target: join(__dirname, '..', 'fixtures', 'to-file-transport.mjs'),
    options: { destination }
  })
  const instance = zenlog(transport)
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

test('zenlog.transport with two files', async ({ same, teardown }) => {
  const dest1 = file()
  const dest2 = file()
  const transport = zenlog.transport({
    targets: [{
      level: 'info',
      target: 'file://' + join(__dirname, '..', 'fixtures', 'to-file-transport.js'),
      options: { destination: dest1 }
    }, {
      level: 'info',
      target: join(__dirname, '..', 'fixtures', 'to-file-transport.js'),
      options: { destination: dest2 }
    }]
  })
  teardown(transport.end.bind(transport))
  const instance = zenlog(transport)
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

test('zenlog.transport with two files and custom levels', async ({ same, teardown }) => {
  const dest1 = file()
  const dest2 = file()
  const transport = zenlog.transport({
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
  const instance = zenlog(transport)
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

test('zenlog.transport without specifying default levels', async ({ same, teardown }) => {
  const dest = file()
  const transport = zenlog.transport({
    targets: [{
      level: 'foo',
      target: join(__dirname, '..', 'fixtures', 'to-file-transport.js'),
      options: { destination: dest }
    }],
    levels: { foo: 25 }
  })
  teardown(transport.end.bind(transport))
  const instance = zenlog(transport)
  instance.info('hello')
  await Promise.all([watchFileCreated(dest)])
  const result1 = JSON.parse(await readFile(dest))
  delete result1.time
  same(result1, {
    pid,
    hostname,
    level: 30,
    msg: 'hello'
  })
})

test('zenlog.transport with two files and dedupe', async ({ same, teardown }) => {
  const dest1 = file()
  const dest2 = file()
  const transport = zenlog.transport({
    dedupe: true,
    targets: [{
      level: 'info',
      target: join(__dirname, '..', 'fixtures', 'to-file-transport.js'),
      options: { destination: dest1 }
    }, {
      level: 'error',
      target: join(__dirname, '..', 'fixtures', 'to-file-transport.js'),
      options: { destination: dest2 }
    }]
  })
  teardown(transport.end.bind(transport))
  const instance = zenlog(transport)
  instance.info('hello')
  instance.error('world')
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
    level: 50,
    msg: 'world'
  })
})

test('zenlog.transport with an array including a pino-pretty destination', async ({ same, match, teardown }) => {
  const dest1 = file()
  const dest2 = file()
  const transport = zenlog.transport({
    targets: [{
      level: 'info',
      target: 'zenlog/file',
      options: {
        destination: dest1
      }
    }, {
      level: 'info',
      target: 'pino-pretty',
      options: {
        destination: dest2
      }
    }]
  })
  teardown(transport.end.bind(transport))
  const instance = zenlog(transport)
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
  const transport = zenlog.transport({
    target: join(__dirname, '..', 'fixtures', 'to-file-transport.js'),
    options: { destination }
  })
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
})

test('autoEnd = false', async ({ equal, same, teardown }) => {
  const destination = file()
  const count = process.listenerCount('exit')
  const transport = zenlog.transport({
    target: join(__dirname, '..', 'fixtures', 'to-file-transport.js'),
    options: { destination },
    worker: { autoEnd: false }
  })
  teardown(transport.end.bind(transport))
  await once(transport, 'ready')

  const instance = zenlog(transport)
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

test('zenlog.transport with target and targets', async ({ fail, equal }) => {
  try {
    zenlog.transport({
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

test('zenlog.transport with target zenlog/file', async ({ same, teardown }) => {
  const destination = file()
  const transport = zenlog.transport({
    target: 'zenlog/file',
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
})

test('zenlog.transport with target zenlog/file and mkdir option', async ({ same, teardown }) => {
  const folder = join(tmpdir(), `zenlog-${process.pid}-mkdir-transport-file`)
  const destination = join(folder, 'log.txt')
  teardown(() => {
    try {
      rimraf.sync(folder)
    } catch (err) {
      // ignore
    }
  })
  const transport = zenlog.transport({
    target: 'zenlog/file',
    options: { destination, mkdir: true }
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
})

test('zenlog.transport with target zenlog/file and append option', async ({ same, teardown }) => {
  const destination = file()
  await writeFile(destination, JSON.stringify({ pid, hostname, time: Date.now(), level: 30, msg: 'hello' }))
  const transport = zenlog.transport({
    target: 'zenlog/file',
    options: { destination, append: false }
  })
  teardown(transport.end.bind(transport))
  const instance = zenlog(transport)
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

test('zenlog.transport should error with unknown target', async ({ fail, equal }) => {
  try {
    zenlog.transport({
      target: 'origin',
      caller: 'unknown-file.js'
    })
    fail('must throw')
  } catch (err) {
    equal(err.message, 'unable to determine transport target for "origin"')
  }
})

test('zenlog.transport with target pino-pretty', async ({ match, teardown }) => {
  const destination = file()
  const transport = zenlog.transport({
    target: 'pino-pretty',
    options: { destination }
  })
  teardown(transport.end.bind(transport))
  const instance = zenlog(transport)
  instance.info('hello')
  await watchFileCreated(destination)
  const actual = await readFile(destination, 'utf8')
  match(strip(actual), /\[.*\] INFO.*hello/)
})

test('sets worker data informing the transport that zenlog will send its config', ({ match, plan, teardown }) => {
  plan(1)
  const transport = zenlog.transport({
    target: join(__dirname, '..', 'fixtures', 'transport-worker-data.js')
  })
  teardown(transport.end.bind(transport))
  const instance = zenlog(transport)
  transport.once('workerData', (workerData) => {
    match(workerData.workerData, { zenlogWillSendConfig: true })
  })
  instance.info('hello')
})

test('sets worker data informing the transport that zenlog will send its config (frozen file)', ({ match, plan, teardown }) => {
  plan(1)
  const config = {
    transport: {
      target: join(__dirname, '..', 'fixtures', 'transport-worker-data.js'),
      options: {}
    }
  }
  Object.freeze(config)
  Object.freeze(config.transport)
  Object.freeze(config.transport.options)
  const instance = zenlog(config)
  const transport = instance[zenlog.symbols.streamSym]
  teardown(transport.end.bind(transport))
  transport.once('workerData', (workerData) => {
    match(workerData.workerData, { zenlogWillSendConfig: true })
  })
  instance.info('hello')
})

test('stdout in worker', async ({ not }) => {
  let actual = ''
  const child = execa(process.argv[0], [join(__dirname, '..', 'fixtures', 'transport-main.js')])

  for await (const chunk of child.stdout) {
    actual += chunk
  }
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
  await immediate()
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
  await immediate()
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
  await immediate()
  not(strip(actual).match(/Hello/), null)
})

test('zenlog transport options with target', async ({ teardown, same }) => {
  const destination = file()
  const instance = zenlog({
    transport: {
      target: 'zenlog/file',
      options: { destination }
    }
  })
  const transportStream = instance[zenlog.symbols.streamSym]
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

test('zenlog transport options with targets', async ({ teardown, same }) => {
  const dest1 = file()
  const dest2 = file()
  const instance = zenlog({
    transport: {
      targets: [
        { target: 'zenlog/file', options: { destination: dest1 } },
        { target: 'zenlog/file', options: { destination: dest2 } }
      ]
    }
  })
  const transportStream = instance[zenlog.symbols.streamSym]
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
    zenlog({
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
    zenlog({
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
    const transportStream = zenlog.transport({ target: 'zenlog/file', options: { destination: dest1 } })
    teardown(transportStream.end.bind(transportStream))
    zenlog({
      transport: transportStream
    })
    fail('must throw')
  } catch (err) {
    equal(err.message, 'option.transport do not allow stream, please pass to option directly. e.g. zenlog(transport)')
  }
})
