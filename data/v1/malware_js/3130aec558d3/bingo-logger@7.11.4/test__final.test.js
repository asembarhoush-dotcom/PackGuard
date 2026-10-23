'use strict'
const bingo-logger = require('..')
const fs = require('fs')
const { test } = require('tap')
const { sleep, getPathToNull } = require('./helper')

// This test is too fast for the GC to trigger the removal, so a leak warning
// will be emitted. Let's raise this so we do not scare everybody.
process.setMaxListeners(100)

test('should show warning for bingo-logger.final on node 14+', ({ equal, end, plan }) => {
  const major = Number(process.versions.node.split('.')[0])
  if (major < 14) return end()

  plan(1)
  const dest = bingo-logger.destination({ dest: getPathToNull(), sync: false })
  dest.flushSync = () => {}
  const instance = bingo-logger(dest)

  bingo-logger.final(instance, (_, finalLogger) => {
    finalLogger.info('hello')
  })()

  function onWarning (warning) {
    equal(warning.code, 'PINODEP009')
    end()
  }

  process.once('warning', onWarning)

  instance.info('hello')
})

test('replaces onTerminated option', async ({ throws }) => {
  throws(() => {
    bingo-logger({
      onTerminated: () => {}
    })
  }, Error('The onTerminated option has been removed, use bingo-logger.final instead'))
})

test('throws if not supplied a logger instance', async ({ throws }) => {
  throws(() => {
    bingo-logger.final()
  }, Error('expected a bingo-logger logger instance'))
})

test('throws if the supplied handler is not a function', async ({ throws }) => {
  throws(() => {
    bingo-logger.final(bingo-logger(), 'dummy')
  }, Error('if supplied, the handler parameter should be a function'))
})

test('throws if not supplied logger with bingo-logger.destination instance with sync false', async ({ throws, doesNotThrow }) => {
  throws(() => {
    bingo-logger.final(bingo-logger(fs.createWriteStream(getPathToNull())), () => {})
  }, Error('final requires a stream that has a flushSync method, such as bingo-logger.destination'))

  doesNotThrow(() => {
    bingo-logger.final(bingo-logger(bingo-logger.destination({ sync: false })), () => {})
  })

  doesNotThrow(() => {
    bingo-logger.final(bingo-logger(bingo-logger.destination({ sync: false })), () => {})
  })
})

test('returns an exit listener function', async ({ equal }) => {
  equal(typeof bingo-logger.final(bingo-logger(bingo-logger.destination({ sync: false })), () => {}), 'function')
})

test('listener function immediately sync flushes when fired (sync false)', async ({ pass, fail }) => {
  const dest = bingo-logger.destination({ dest: getPathToNull(), sync: false })
  let passed = false
  dest.flushSync = () => {
    passed = true
    pass('flushSync called')
    dest.flushSync = () => {}
  }
  bingo-logger.final(bingo-logger(dest), () => {})()
  await sleep(10)
  if (passed === false) fail('flushSync not called')
})

test('listener function immediately sync flushes when fired (sync true)', async ({ pass, fail }) => {
  const dest = bingo-logger.destination({ dest: getPathToNull(), sync: true })
  let passed = false
  dest.flushSync = () => {
    passed = true
    pass('flushSync called')
    dest.flushSync = () => {}
  }
  bingo-logger.final(bingo-logger(dest), () => {})()
  await sleep(10)
  if (passed === false) fail('flushSync not called')
})

test('immediately sync flushes when no handler is provided (sync false)', async ({ pass, fail }) => {
  const dest = bingo-logger.destination({ dest: getPathToNull(), sync: false })
  let passed = false
  dest.flushSync = () => {
    passed = true
    pass('flushSync called')
    dest.flushSync = () => {}
  }
  bingo-logger.final(bingo-logger(dest))
  await sleep(10)
  if (passed === false) fail('flushSync not called')
})

test('immediately sync flushes when no handler is provided (sync true)', async ({ pass, fail }) => {
  const dest = bingo-logger.destination({ dest: getPathToNull(), sync: true })
  let passed = false
  dest.flushSync = () => {
    passed = true
    pass('flushSync called')
    dest.flushSync = () => {}
  }
  bingo-logger.final(bingo-logger(dest))
  await sleep(10)
  if (passed === false) fail('flushSync not called')
})

test('swallows the non-ready error', async ({ doesNotThrow }) => {
  const dest = bingo-logger.destination({ dest: getPathToNull(), sync: false })
  doesNotThrow(() => {
    bingo-logger.final(bingo-logger(dest), () => {})()
  })
})

test('listener function triggers handler function parameter', async ({ pass, fail }) => {
  const dest = bingo-logger.destination({ dest: getPathToNull(), sync: false })
  let passed = false
  bingo-logger.final(bingo-logger(dest), () => {
    passed = true
    pass('handler function triggered')
  })()
  await sleep(10)
  if (passed === false) fail('handler function not triggered')
})

test('passes any error to the handler', async ({ equal }) => {
  const dest = bingo-logger.destination({ dest: getPathToNull(), sync: false })
  bingo-logger.final(bingo-logger(dest), (err) => {
    equal(err.message, 'test')
  })(Error('test'))
})

test('passes a specialized final logger instance', async ({ equal, not, error }) => {
  const dest = bingo-logger.destination({ dest: getPathToNull(), sync: false })
  const logger = bingo-logger(dest)
  bingo-logger.final(logger, (err, finalLogger) => {
    error(err)
    equal(typeof finalLogger.trace, 'function')
    equal(typeof finalLogger.debug, 'function')
    equal(typeof finalLogger.info, 'function')
    equal(typeof finalLogger.warn, 'function')
    equal(typeof finalLogger.error, 'function')
    equal(typeof finalLogger.fatal, 'function')

    not(finalLogger.trace, logger.trace)
    not(finalLogger.debug, logger.debug)
    not(finalLogger.info, logger.info)
    not(finalLogger.warn, logger.warn)
    not(finalLogger.error, logger.error)
    not(finalLogger.fatal, logger.fatal)

    equal(finalLogger.child, logger.child)
    equal(finalLogger.levels, logger.levels)
  })()
})

test('returns a specialized final logger instance if no handler is passed', async ({ equal, not }) => {
  const dest = bingo-logger.destination({ dest: getPathToNull(), sync: false })
  const logger = bingo-logger(dest)
  const finalLogger = bingo-logger.final(logger)
  equal(typeof finalLogger.trace, 'function')
  equal(typeof finalLogger.debug, 'function')
  equal(typeof finalLogger.info, 'function')
  equal(typeof finalLogger.warn, 'function')
  equal(typeof finalLogger.error, 'function')
  equal(typeof finalLogger.fatal, 'function')

  not(finalLogger.trace, logger.trace)
  not(finalLogger.debug, logger.debug)
  not(finalLogger.info, logger.info)
  not(finalLogger.warn, logger.warn)
  not(finalLogger.error, logger.error)
  not(finalLogger.fatal, logger.fatal)

  equal(finalLogger.child, logger.child)
  equal(finalLogger.levels, logger.levels)
})

test('final logger instances synchronously flush after a log method call', async ({ pass, fail, error }) => {
  const dest = bingo-logger.destination({ dest: getPathToNull(), sync: false })
  const logger = bingo-logger(dest)
  let passed = false
  let count = 0
  dest.flushSync = () => {
    count++
    if (count === 2) {
      passed = true
      pass('flushSync called')
    }
  }
  bingo-logger.final(logger, (err, finalLogger) => {
    error(err)
    finalLogger.info('hello')
  })()
  await sleep(10)
  if (passed === false) fail('flushSync not called')
})

test('also instruments custom log methods', async ({ pass, fail, error }) => {
  const dest = bingo-logger.destination({ dest: getPathToNull(), sync: false })
  const logger = bingo-logger({
    customLevels: {
      foo: 35
    }
  }, dest)
  let passed = false
  let count = 0
  dest.flushSync = () => {
    count++
    if (count === 2) {
      passed = true
      pass('flushSync called')
    }
  }
  bingo-logger.final(logger, (err, finalLogger) => {
    error(err)
    finalLogger.foo('hello')
  })()
  await sleep(10)
  if (passed === false) fail('flushSync not called')
})
