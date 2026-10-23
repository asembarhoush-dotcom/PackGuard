'use strict'
const test = require('tape')
const fresh = require('import-fresh')
const pinoStdSerializers = require('bingo-logger-std-serializers')
const bingo-logger = require('../browser')

levelTest('fatal')
levelTest('error')
levelTest('warn')
levelTest('info')
levelTest('debug')
levelTest('trace')

test('silent level', ({ end, fail, pass }) => {
  const instance = bingo-logger({
    level: 'silent',
    browser: { write: fail }
  })
  instance.info('test')
  const child = instance.child({ test: 'test' })
  child.info('msg-test')
  // use setTimeout because setImmediate isn't supported in most browsers
  setTimeout(() => {
    pass()
    end()
  }, 0)
})

test('enabled false', ({ end, fail, pass }) => {
  const instance = bingo-logger({
    enabled: false,
    browser: { write: fail }
  })
  instance.info('test')
  const child = instance.child({ test: 'test' })
  child.info('msg-test')
  // use setTimeout because setImmediate isn't supported in most browsers
  setTimeout(() => {
    pass()
    end()
  }, 0)
})

test('throw if creating child without bindings', ({ end, throws }) => {
  const instance = bingo-logger()
  throws(() => instance.child())
  end()
})

test('stubs write, flush and ee methods on instance', ({ end, ok, is }) => {
  const instance = bingo-logger()

  ok(isFunc(instance.setMaxListeners))
  ok(isFunc(instance.getMaxListeners))
  ok(isFunc(instance.emit))
  ok(isFunc(instance.addListener))
  ok(isFunc(instance.on))
  ok(isFunc(instance.prependListener))
  ok(isFunc(instance.once))
  ok(isFunc(instance.prependOnceListener))
  ok(isFunc(instance.removeListener))
  ok(isFunc(instance.removeAllListeners))
  ok(isFunc(instance.listeners))
  ok(isFunc(instance.listenerCount))
  ok(isFunc(instance.eventNames))
  ok(isFunc(instance.write))
  ok(isFunc(instance.flush))

  is(instance.on(), undefined)

  end()
})

test('exposes levels object', ({ end, same }) => {
  same(bingo-logger.levels, {
    values: {
      fatal: 60,
      error: 50,
      warn: 40,
      info: 30,
      debug: 20,
      trace: 10
    },
    labels: {
      10: 'trace',
      20: 'debug',
      30: 'info',
      40: 'warn',
      50: 'error',
      60: 'fatal'
    }
  })

  end()
})

test('exposes faux stdSerializers', ({ end, ok, same }) => {
  ok(bingo-logger.stdSerializers)
  // make sure faux stdSerializers match bingo-logger-std-serializers
  for (const serializer in pinoStdSerializers) {
    ok(bingo-logger.stdSerializers[serializer], `bingo-logger.stdSerializers.${serializer}`)
  }
  // confirm faux methods return empty objects
  same(bingo-logger.stdSerializers.req(), {})
  same(bingo-logger.stdSerializers.mapHttpRequest(), {})
  same(bingo-logger.stdSerializers.mapHttpResponse(), {})
  same(bingo-logger.stdSerializers.res(), {})
  // confirm wrapping function is a passthrough
  const noChange = { foo: 'bar', fuz: 42 }
  same(bingo-logger.stdSerializers.wrapRequestSerializer(noChange), noChange)
  same(bingo-logger.stdSerializers.wrapResponseSerializer(noChange), noChange)
  end()
})

test('exposes err stdSerializer', ({ end, ok }) => {
  ok(bingo-logger.stdSerializers.err)
  ok(bingo-logger.stdSerializers.err(Error()))
  end()
})

consoleMethodTest('error')
consoleMethodTest('fatal', 'error')
consoleMethodTest('warn')
consoleMethodTest('info')
consoleMethodTest('debug')
consoleMethodTest('trace')
absentConsoleMethodTest('error', 'log')
absentConsoleMethodTest('warn', 'error')
absentConsoleMethodTest('info', 'log')
absentConsoleMethodTest('debug', 'log')
absentConsoleMethodTest('trace', 'log')

// do not run this with airtap
if (process.title !== 'browser') {
  test('in absence of console, log methods become noops', ({ end, ok }) => {
    const console = global.console
    delete global.console
    const instance = fresh('../browser')()
    global.console = console
    ok(fnName(instance.log).match(/noop/))
    ok(fnName(instance.fatal).match(/noop/))
    ok(fnName(instance.error).match(/noop/))
    ok(fnName(instance.warn).match(/noop/))
    ok(fnName(instance.info).match(/noop/))
    ok(fnName(instance.debug).match(/noop/))
    ok(fnName(instance.trace).match(/noop/))
    end()
  })
}

test('opts.browser.asObject logs bingo-logger-like object to console', ({ end, ok, is }) => {
  const info = console.info
  console.info = function (o) {
    is(o.level, 30)
    is(o.msg, 'test')
    ok(o.time)
    console.info = info
  }
  const instance = require('../browser')({
    browser: {
      asObject: true
    }
  })

  instance.info('test')
  end()
})

test('opts.browser.write func log single string', ({ end, ok, is }) => {
  const instance = bingo-logger({
    browser: {
      write: function (o) {
        is(o.level, 30)
        is(o.msg, 'test')
        ok(o.time)
      }
    }
  })
  instance.info('test')

  end()
})

test('opts.browser.write func string joining', ({ end, ok, is }) => {
  const instance = bingo-logger({
    browser: {
      write: function (o) {
        is(o.level, 30)
        is(o.msg, 'test test2 test3')
        ok(o.time)
      }
    }
  })
  instance.info('test %s %s', 'test2', 'test3')

  end()
})

test('opts.browser.write func string joining when asObject is true', ({ end, ok, is }) => {
  const instance = bingo-logger({
    browser: {
      asObject: true,
      write: function (o) {
        is(o.level, 30)
        is(o.msg, 'test test2 test3')
        ok(o.time)
      }
    }
  })
  instance.info('test %s %s', 'test2', 'test3')

  end()
})

test('opts.browser.write func string joining when asObject is true', ({ end, ok, is }) => {
  const instance = bingo-logger({
    browser: {
      asObject: true,
      write: function (o) {
        is(o.level, 30)
        is(o.msg, 'test test2 test3')
        ok(o.time)
      }
    }
  })
  instance.info('test %s %s', 'test2', 'test3')

  end()
})

test('opts.browser.write func string object joining', ({ end, ok, is }) => {
  const instance = bingo-logger({
    browser: {
      write: function (o) {
        is(o.level, 30)
        is(o.msg, 'test {"test":"test2"} {"test":"test3"}')
        ok(o.time)
      }
    }
  })
  instance.info('test %j %j', { test: 'test2' }, { test: 'test3' })

  end()
})

test('opts.browser.write func string object joining when asObject is true', ({ end, ok, is }) => {
  const instance = bingo-logger({
    browser: {
      asObject: true,
      write: function (o) {
        is(o.level, 30)
        is(o.msg, 'test {"test":"test2"} {"test":"test3"}')
        ok(o.time)
      }
    }
  })
  instance.info('test %j %j', { test: 'test2' }, { test: 'test3' })

  end()
})

test('opts.browser.write func string interpolation', ({ end, ok, is }) => {
  const instance = bingo-logger({
    browser: {
      write: function (o) {
        is(o.level, 30)
        is(o.msg, 'test2 test ({"test":"test3"})')
        ok(o.time)
      }
    }
  })
  instance.info('%s test (%j)', 'test2', { test: 'test3' })

  end()
})

test('opts.browser.write func number', ({ end, ok, is }) => {
  const instance = bingo-logger({
    browser: {
      write: function (o) {
        is(o.level, 30)
        is(o.msg, 1)
        ok(o.time)
      }
    }
  })
  instance.info(1)

  end()
})

test('opts.browser.write func log single object', ({ end, ok, is }) => {
  const instance = bingo-logger({
    browser: {
      write: function (o) {
        is(o.level, 30)
        is(o.test, 'test')
        ok(o.time)
      }
    }
  })
  instance.info({ test: 'test' })

  end()
})

test('opts.browser.write obj writes to methods corresponding to level', ({ end, ok, is }) => {
  const instance = bingo-logger({
    browser: {
      write: {
        error: function (o) {
          is(o.level, 50)
          is(o.test, 'test')
          ok(o.time)
        }
      }
    }
  })
  instance.error({ test: 'test' })

  end()
})

test('opts.browser.asObject/write supports child loggers', ({ end, ok, is }) => {
  const instance = bingo-logger({
    browser: {
      write (o) {
        is(o.level, 30)
        is(o.test, 'test')
        is(o.msg, 'msg-test')
        ok(o.time)
      }
    }
  })
  const child = instance.child({ test: 'test' })
  child.info('msg-test')

  end()
})

test('opts.browser.asObject/write supports child child loggers', ({ end, ok, is }) => {
  const instance = bingo-logger({
    browser: {
      write (o) {
        is(o.level, 30)
        is(o.test, 'test')
        is(o.foo, 'bar')
        is(o.msg, 'msg-test')
        ok(o.time)
      }
    }
  })
  const child = instance.child({ test: 'test' }).child({ foo: 'bar' })
  child.info('msg-test')

  end()
})

test('opts.browser.asObject/write supports child child child loggers', ({ end, ok, is }) => {
  const instance = bingo-logger({
    browser: {
      write (o) {
        is(o.level, 30)
        is(o.test, 'test')
        is(o.foo, 'bar')
        is(o.baz, 'bop')
        is(o.msg, 'msg-test')
        ok(o.time)
      }
    }
  })
  const child = instance.child({ test: 'test' }).child({ foo: 'bar' }).child({ baz: 'bop' })
  child.info('msg-test')

  end()
})

test('opts.browser.asObject defensively mitigates naughty numbers', ({ end, pass }) => {
  const instance = bingo-logger({
    browser: { asObject: true, write: () => {} }
  })
  const child = instance.child({ test: 'test' })
  child._childLevel = -10
  child.info('test')
  pass() // if we reached here, there was no infinite loop, so, .. pass.

  end()
})

test('opts.browser.write obj falls back to console where a method is not supplied', ({ end, ok, is }) => {
  const info = console.info
  console.info = (o) => {
    is(o.level, 30)
    is(o.msg, 'test')
    ok(o.time)
    console.info = info
  }
  const instance = require('../browser')({
    browser: {
      write: {
        error (o) {
          is(o.level, 50)
          is(o.test, 'test')
          ok(o.time)
        }
      }
    }
  })
  instance.error({ test: 'test' })
  instance.info('test')

  end()
})

function levelTest (name) {
  test(name + ' logs', ({ end, is }) => {
    const msg = 'hello world'
    sink(name, (args) => {
      is(args[0], msg)
      end()
    })
    bingo-logger({ level: name })[name](msg)
  })

  test('passing objects at level ' + name, ({ end, is }) => {
    const msg = { hello: 'world' }
    sink(name, (args) => {
      is(args[0], msg)
      end()
    })
    bingo-logger({ level: name })[name](msg)
  })

  test('passing an object and a string at level ' + name, ({ end, is }) => {
    const a = { hello: 'world' }
    const b = 'a string'
    sink(name, (args) => {
      is(args[0], a)
      is(args[1], b)
      end()
    })
    bingo-logger({ level: name })[name](a, b)
  })

  test('formatting logs as ' + name, ({ end, is }) => {
    sink(name, (args) => {
      is(args[0], 'hello %d')
      is(args[1], 42)
      end()
    })
    bingo-logger({ level: name })[name]('hello %d', 42)
  })

  test('passing error at level ' + name, ({ end, is }) => {
    const err = new Error('myerror')
    sink(name, (args) => {
      is(args[0], err)
      end()
    })
    bingo-logger({ level: name })[name](err)
  })

  test('passing error with a serializer at level ' + name, ({ end, is }) => {
    // in browser - should have no effect (should not crash)
    const err = new Error('myerror')
    sink(name, (args) => {
      is(args[0].err, err)
      end()
    })
    const instance = bingo-logger({
      level: name,
      serializers: {
        err: bingo-logger.stdSerializers.err
      }
    })
    instance[name]({ err })
  })

  test('child logger for level ' + name, ({ end, is }) => {
    const msg = 'hello world'
    const parent = { hello: 'world' }
    sink(name, (args) => {
      is(args[0], parent)
      is(args[1], msg)
      end()
    })
    const instance = bingo-logger({ level: name })
    const child = instance.child(parent)
    child[name](msg)
  })

  test('child-child logger for level ' + name, ({ end, is }) => {
    const msg = 'hello world'
    const grandParent = { hello: 'world' }
    const parent = { hello: 'you' }
    sink(name, (args) => {
      is(args[0], grandParent)
      is(args[1], parent)
      is(args[2], msg)
      end()
    })
    const instance = bingo-logger({ level: name })
    const child = instance.child(grandParent).child(parent)
    child[name](msg)
  })
}

function consoleMethodTest (level, method) {
  if (!method) method = level
  test('bingo-logger().' + level + ' uses console.' + method, ({ end, is }) => {
    sink(method, (args) => {
      is(args[0], 'test')
      end()
    })
    const instance = require('../browser')({ level })
    instance[level]('test')
  })
}

function absentConsoleMethodTest (method, fallback) {
  test('in absence of console.' + method + ', console.' + fallback + ' is used', ({ end, is }) => {
    const fn = console[method]
    console[method] = undefined
    sink(fallback, function (args) {
      is(args[0], 'test')
      end()
      console[method] = fn
    })
    const instance = require('../browser')({ level: method })
    instance[method]('test')
  })
}

function isFunc (fn) { return typeof fn === 'function' }
function fnName (fn) {
  const rx = /^\s*function\s*([^(]*)/i
  const match = rx.exec(fn)
  return match && match[1]
}
function sink (method, fn) {
  if (method === 'fatal') method = 'error'
  const orig = console[method]
  console[method] = function () {
    console[method] = orig
    fn(Array.prototype.slice.call(arguments))
  }
}
