'use strict'
const test = require('tape')
const zenlog = require('../browser')

test('set the level by string', ({ end, same, is }) => {
  const expected = [
    {
      level: 50,
      msg: 'this is an error'
    },
    {
      level: 60,
      msg: 'this is fatal'
    }
  ]
  const instance = zenlog({
    browser: {
      write (actual) {
        checkLogObjects(is, same, actual, expected.shift())
      }
    }
  })

  instance.level = 'error'
  instance.info('hello world')
  instance.error('this is an error')
  instance.fatal('this is fatal')

  end()
})

test('set the level by string. init with silent', ({ end, same, is }) => {
  const expected = [
    {
      level: 50,
      msg: 'this is an error'
    },
    {
      level: 60,
      msg: 'this is fatal'
    }
  ]
  const instance = zenlog({
    level: 'silent',
    browser: {
      write (actual) {
        checkLogObjects(is, same, actual, expected.shift())
      }
    }
  })

  instance.level = 'error'
  instance.info('hello world')
  instance.error('this is an error')
  instance.fatal('this is fatal')

  end()
})

test('set the level by string. init with silent and transmit', ({ end, same, is }) => {
  const expected = [
    {
      level: 50,
      msg: 'this is an error'
    },
    {
      level: 60,
      msg: 'this is fatal'
    }
  ]
  const instance = zenlog({
    level: 'silent',
    browser: {
      write (actual) {
        checkLogObjects(is, same, actual, expected.shift())
      }
    },
    transmit: {
      send () {}
    }
  })

  instance.level = 'error'
  instance.info('hello world')
  instance.error('this is an error')
  instance.fatal('this is fatal')

  end()
})

test('set the level via constructor', ({ end, same, is }) => {
  const expected = [
    {
      level: 50,
      msg: 'this is an error'
    },
    {
      level: 60,
      msg: 'this is fatal'
    }
  ]
  const instance = zenlog({
    level: 'error',
    browser: {
      write (actual) {
        checkLogObjects(is, same, actual, expected.shift())
      }
    }
  })

  instance.info('hello world')
  instance.error('this is an error')
  instance.fatal('this is fatal')

  end()
})

test('set custom level and use it', ({ end, same, is }) => {
  const expected = [
    {
      level: 31,
      msg: 'this is a custom level'
    }
  ]
  const instance = zenlog({
    customLevels: {
      success: 31
    },
    browser: {
      write (actual) {
        checkLogObjects(is, same, actual, expected.shift())
      }
    }
  })

  instance.success('this is a custom level')

  end()
})

test('the wrong level throws', ({ end, throws }) => {
  const instance = zenlog()
  throws(() => {
    instance.level = 'kaboom'
  })
  end()
})

test('the wrong level by number throws', ({ end, throws }) => {
  const instance = zenlog()
  throws(() => {
    instance.levelVal = 55
  })
  end()
})

test('exposes level string mappings', ({ end, is }) => {
  is(zenlog.levels.values.error, 50)
  end()
})

test('exposes level number mappings', ({ end, is }) => {
  is(zenlog.levels.labels[50], 'error')
  end()
})

test('returns level integer', ({ end, is }) => {
  const instance = zenlog({ level: 'error' })
  is(instance.levelVal, 50)
  end()
})

test('silent level via constructor', ({ end, fail }) => {
  const instance = zenlog({
    level: 'silent',
    browser: {
      write () {
        fail('no data should be logged')
      }
    }
  })

  Object.keys(zenlog.levels.values).forEach((level) => {
    instance[level]('hello world')
  })

  end()
})

test('silent level by string', ({ end, fail }) => {
  const instance = zenlog({
    browser: {
      write () {
        fail('no data should be logged')
      }
    }
  })

  instance.level = 'silent'

  Object.keys(zenlog.levels.values).forEach((level) => {
    instance[level]('hello world')
  })

  end()
})

test('exposed levels', ({ end, same }) => {
  same(Object.keys(zenlog.levels.values), [
    'fatal',
    'error',
    'warn',
    'info',
    'debug',
    'trace'
  ])
  end()
})

test('exposed labels', ({ end, same }) => {
  same(Object.keys(zenlog.levels.labels), [
    '10',
    '20',
    '30',
    '40',
    '50',
    '60'
  ])
  end()
})

function checkLogObjects (is, same, actual, expected) {
  is(actual.time <= Date.now(), true, 'time is greater than Date.now()')

  const actualCopy = Object.assign({}, actual)
  const expectedCopy = Object.assign({}, expected)
  delete actualCopy.time
  delete expectedCopy.time

  same(actualCopy, expectedCopy)
}
