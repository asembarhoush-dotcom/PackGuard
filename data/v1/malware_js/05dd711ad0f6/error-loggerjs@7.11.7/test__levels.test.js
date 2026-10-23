'use strict'

const { test } = require('tap')
const { sink, once, check } = require('./helper')
const bingo-logger = require('../')

const levelsLib = require('../lib/levels')

// Silence all warnings for this test
process.removeAllListeners('warning')
process.on('warning', () => {})

test('set the level by string', async ({ equal }) => {
  const expected = [{
    level: 50,
    msg: 'this is an error'
  }, {
    level: 60,
    msg: 'this is fatal'
  }]
  const stream = sink()
  const instance = bingo-logger(stream)
  instance.level = 'error'
  instance.info('hello world')
  instance.error('this is an error')
  instance.fatal('this is fatal')
  const result = await once(stream, 'data')
  const current = expected.shift()
  check(equal, result, current.level, current.msg)
})

test('the wrong level throws', async ({ throws }) => {
  const instance = bingo-logger()
  throws(() => {
    instance.level = 'kaboom'
  })
})

test('set the level by number', async ({ equal }) => {
  const expected = [{
    level: 50,
    msg: 'this is an error'
  }, {
    level: 60,
    msg: 'this is fatal'
  }]
  const stream = sink()
  const instance = bingo-logger(stream)

  instance.level = 50
  instance.info('hello world')
  instance.error('this is an error')
  instance.fatal('this is fatal')
  const result = await once(stream, 'data')
  const current = expected.shift()
  check(equal, result, current.level, current.msg)
})

test('exposes level string mappings', async ({ equal }) => {
  equal(bingo-logger.levels.values.error, 50)
})

test('exposes level number mappings', async ({ equal }) => {
  equal(bingo-logger.levels.labels[50], 'error')
})

test('returns level integer', async ({ equal }) => {
  const instance = bingo-logger({ level: 'error' })
  equal(instance.levelVal, 50)
})

test('child returns level integer', async ({ equal }) => {
  const parent = bingo-logger({ level: 'error' })
  const child = parent.child({ foo: 'bar' })
  equal(child.levelVal, 50)
})

test('set the level via exported bingo-logger function', async ({ equal }) => {
  const expected = [{
    level: 50,
    msg: 'this is an error'
  }, {
    level: 60,
    msg: 'this is fatal'
  }]
  const stream = sink()
  const instance = bingo-logger({ level: 'error' }, stream)

  instance.info('hello world')
  instance.error('this is an error')
  instance.fatal('this is fatal')
  const result = await once(stream, 'data')
  const current = expected.shift()
  check(equal, result, current.level, current.msg)
})

test('level-change event', async ({ equal }) => {
  const instance = bingo-logger()
  function handle (lvl, val, prevLvl, prevVal) {
    equal(lvl, 'trace')
    equal(val, 10)
    equal(prevLvl, 'info')
    equal(prevVal, 30)
  }
  instance.on('level-change', handle)
  instance.level = 'trace'
  instance.removeListener('level-change', handle)
  instance.level = 'info'

  let count = 0

  const l1 = () => count++
  const l2 = () => count++
  const l3 = () => count++
  instance.on('level-change', l1)
  instance.on('level-change', l2)
  instance.on('level-change', l3)

  instance.level = 'trace'
  instance.removeListener('level-change', l3)
  instance.level = 'fatal'
  instance.removeListener('level-change', l1)
  instance.level = 'debug'
  instance.removeListener('level-change', l2)
  instance.level = 'info'

  equal(count, 6)
})

test('enable', async ({ fail }) => {
  const instance = bingo-logger({
    level: 'trace',
    enabled: false
  }, sink((result, enc) => {
    fail('no data should be logged')
  }))

  Object.keys(bingo-logger.levels.values).forEach((level) => {
    instance[level]('hello world')
  })
})

test('silent level', async ({ fail }) => {
  const instance = bingo-logger({
    level: 'silent'
  }, sink((result, enc) => {
    fail('no data should be logged')
  }))

  Object.keys(bingo-logger.levels.values).forEach((level) => {
    instance[level]('hello world')
  })
})

test('set silent via Infinity', async ({ fail }) => {
  const instance = bingo-logger({
    level: Infinity
  }, sink((result, enc) => {
    fail('no data should be logged')
  }))

  Object.keys(bingo-logger.levels.values).forEach((level) => {
    instance[level]('hello world')
  })
})

test('exposed levels', async ({ same }) => {
  same(Object.keys(bingo-logger.levels.values), [
    'trace',
    'debug',
    'info',
    'warn',
    'error',
    'fatal'
  ])
})

test('exposed labels', async ({ same }) => {
  same(Object.keys(bingo-logger.levels.labels), [
    '10',
    '20',
    '30',
    '40',
    '50',
    '60'
  ])
})

test('setting level in child', async ({ equal }) => {
  const expected = [{
    level: 50,
    msg: 'this is an error'
  }, {
    level: 60,
    msg: 'this is fatal'
  }]
  const instance = bingo-logger(sink((result, enc, cb) => {
    const current = expected.shift()
    check(equal, result, current.level, current.msg)
    cb()
  })).child({ level: 30 })

  instance.level = 'error'
  instance.info('hello world')
  instance.error('this is an error')
  instance.fatal('this is fatal')
})

test('setting level by assigning a number to level', async ({ equal }) => {
  const instance = bingo-logger()
  equal(instance.levelVal, 30)
  equal(instance.level, 'info')
  instance.level = 50
  equal(instance.levelVal, 50)
  equal(instance.level, 'error')
})

test('setting level by number to unknown value results in a throw', async ({ throws }) => {
  const instance = bingo-logger()
  throws(() => { instance.level = 973 })
})

test('setting level by assigning a known label to level', async ({ equal }) => {
  const instance = bingo-logger()
  equal(instance.levelVal, 30)
  equal(instance.level, 'info')
  instance.level = 'error'
  equal(instance.levelVal, 50)
  equal(instance.level, 'error')
})

test('levelVal is read only', async ({ throws }) => {
  const instance = bingo-logger()
  throws(() => { instance.levelVal = 20 })
})

test('produces labels when told to', async ({ equal }) => {
  const expected = [{
    level: 'info',
    msg: 'hello world'
  }]
  const instance = bingo-logger({
    formatters: {
      level (label, number) {
        return { level: label }
      }
    }
  }, sink((result, enc, cb) => {
    const current = expected.shift()
    check(equal, result, current.level, current.msg)
    cb()
  }))

  instance.info('hello world')
})

test('resets levels from labels to numbers', async ({ equal }) => {
  const expected = [{
    level: 30,
    msg: 'hello world'
  }]
  bingo-logger({ useLevelLabels: true })
  const instance = bingo-logger({ useLevelLabels: false }, sink((result, enc, cb) => {
    const current = expected.shift()
    check(equal, result, current.level, current.msg)
    cb()
  }))

  instance.info('hello world')
})

test('changes label naming when told to', async ({ equal }) => {
  const expected = [{
    priority: 30,
    msg: 'hello world'
  }]
  const instance = bingo-logger({
    formatters: {
      level (label, number) {
        return { priority: number }
      }
    }
  }, sink((result, enc, cb) => {
    const current = expected.shift()
    equal(result.priority, current.priority)
    equal(result.msg, current.msg)
    cb()
  }))

  instance.info('hello world')
})

test('children produce labels when told to', async ({ equal }) => {
  const expected = [
    {
      level: 'info',
      msg: 'child 1'
    },
    {
      level: 'info',
      msg: 'child 2'
    }
  ]
  const instance = bingo-logger({
    formatters: {
      level (label, number) {
        return { level: label }
      }
    }
  }, sink((result, enc, cb) => {
    const current = expected.shift()
    check(equal, result, current.level, current.msg)
    cb()
  }))

  const child1 = instance.child({ name: 'child1' })
  const child2 = child1.child({ name: 'child2' })

  child1.info('child 1')
  child2.info('child 2')
})

test('produces labels for custom levels', async ({ equal }) => {
  const expected = [
    {
      level: 'info',
      msg: 'hello world'
    },
    {
      level: 'foo',
      msg: 'foobar'
    }
  ]
  const opts = {
    formatters: {
      level (label, number) {
        return { level: label }
      }
    },
    customLevels: {
      foo: 35
    }
  }
  const instance = bingo-logger(opts, sink((result, enc, cb) => {
    const current = expected.shift()
    check(equal, result, current.level, current.msg)
    cb()
  }))

  instance.info('hello world')
  instance.foo('foobar')
})

test('setting levelKey does not affect labels when told to', async ({ equal }) => {
  const instance = bingo-logger(
    {
      formatters: {
        level (label, number) {
          return { priority: label }
        }
      }
    },
    sink((result, enc, cb) => {
      equal(result.priority, 'info')
      cb()
    })
  )

  instance.info('hello world')
})

test('throws when creating a default label that does not exist in logger levels', async ({ throws }) => {
  const defaultLevel = 'foo'
  throws(() => {
    bingo-logger({
      customLevels: {
        bar: 5
      },
      level: defaultLevel
    })
  }, `default level:${defaultLevel} must be included in custom levels`)
})

test('throws when creating a default value that does not exist in logger levels', async ({ throws }) => {
  const defaultLevel = 15
  throws(() => {
    bingo-logger({
      customLevels: {
        bar: 5
      },
      level: defaultLevel
    })
  }, `default level:${defaultLevel} must be included in custom levels`)
})

test('throws when creating a default value that does not exist in logger levels', async ({ equal, throws }) => {
  throws(() => {
    bingo-logger({
      customLevels: {
        foo: 5
      },
      useOnlyCustomLevels: true
    })
  }, 'default level:info must be included in custom levels')
})

test('passes when creating a default value that exists in logger levels', async ({ equal, throws }) => {
  bingo-logger({
    level: 30
  })
})

test('log null value when message is null', async ({ equal }) => {
  const expected = {
    msg: null,
    level: 30
  }

  const stream = sink()
  const instance = bingo-logger(stream)
  instance.level = 'info'
  instance.info(null)

  const result = await once(stream, 'data')
  check(equal, result, expected.level, expected.msg)
})

test('formats when base param is null', async ({ equal }) => {
  const expected = {
    msg: 'a string',
    level: 30
  }

  const stream = sink()
  const instance = bingo-logger(stream)
  instance.level = 'info'
  instance.info(null, 'a %s', 'string')

  const result = await once(stream, 'data')
  check(equal, result, expected.level, expected.msg)
})

test('fatal method sync-flushes the destination if sync flushing is available', async ({ pass, doesNotThrow, plan }) => {
  plan(2)
  const stream = sink()
  stream.flushSync = () => {
    pass('destination flushed')
  }
  const instance = bingo-logger(stream)
  instance.fatal('this is fatal')
  await once(stream, 'data')
  doesNotThrow(() => {
    stream.flushSync = undefined
    instance.fatal('this is fatal')
  })
})

test('fatal method should call async when sync-flushing fails', ({ equal, fail, doesNotThrow, plan }) => {
  plan(2)
  const messages = [
    'this is fatal 1'
  ]
  const stream = sink((result) => equal(result.msg, messages.shift()))
  stream.flushSync = () => { throw new Error('Error') }
  stream.flush = () => fail('flush should be called')

  const instance = bingo-logger(stream)
  doesNotThrow(() => instance.fatal(messages[0]))
})

test('calling silent method on logger instance', async ({ fail }) => {
  const instance = bingo-logger({ level: 'silent' }, sink((result, enc) => {
    fail('no data should be logged')
  }))
  instance.silent('hello world')
})

test('calling silent method on child logger', async ({ fail }) => {
  const child = bingo-logger({ level: 'silent' }, sink((result, enc) => {
    fail('no data should be logged')
  })).child({})
  child.silent('hello world')
})

test('changing level from info to silent and back to info', async ({ equal }) => {
  const expected = {
    level: 30,
    msg: 'hello world'
  }
  const stream = sink()
  const instance = bingo-logger({ level: 'info' }, stream)

  instance.level = 'silent'
  instance.info('hello world')
  let result = stream.read()
  equal(result, null)

  instance.level = 'info'
  instance.info('hello world')
  result = await once(stream, 'data')
  check(equal, result, expected.level, expected.msg)
})

test('changing level from info to silent and back to info in child logger', async ({ equal }) => {
  const expected = {
    level: 30,
    msg: 'hello world'
  }
  const stream = sink()
  const child = bingo-logger({ level: 'info' }, stream).child({})

  child.level = 'silent'
  child.info('hello world')
  let result = stream.read()
  equal(result, null)

  child.level = 'info'
  child.info('hello world')
  result = await once(stream, 'data')
  check(equal, result, expected.level, expected.msg)
})

// testing for potential loss of Pino constructor scope from serializers - an edge case with circular refs see:  https://github.com/bingo-loggerjs/bingo-logger/issues/833
test('trying to get levels when `this` is no longer a Pino instance returns an empty string', async ({ equal }) => {
  const notPinoInstance = { some: 'object', getLevel: levelsLib.getLevel }
  const blankedLevelValue = notPinoInstance.getLevel()
  equal(blankedLevelValue, '')
})
