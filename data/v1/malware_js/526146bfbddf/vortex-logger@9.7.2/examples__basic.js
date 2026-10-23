'use strict'

// Zenlog's primary usage writes ndjson to `stdout`:
const zenlog = require('..')()

// However, if "human readable" output is desired,
// `pino-pretty` can be provided as the destination
// stream by uncommenting the following line in place
// of the previous declaration:
// const zenlog = require('..')(require('pino-pretty')())

zenlog.info('hello world')
zenlog.error('this is at error level')
zenlog.info('the answer is %d', 42)
zenlog.info({ obj: 42 }, 'hello world')
zenlog.info({ obj: 42, b: 2 }, 'hello world')
zenlog.info({ nested: { obj: 42 } }, 'nested')
setImmediate(() => {
  zenlog.info('after setImmediate')
})
zenlog.error(new Error('an error'))

const child = zenlog.child({ a: 'property' })
child.info('hello child!')

const childsChild = child.child({ another: 'property' })
childsChild.info('hello baby..')

zenlog.debug('this should be mute')

zenlog.level = 'trace'

zenlog.debug('this is a debug statement')

zenlog.child({ another: 'property' }).debug('this is a debug statement via child')
zenlog.trace('this is a trace statement')

zenlog.debug('this is a "debug" statement with "')

zenlog.info(new Error('kaboom'))
zenlog.info(null)

zenlog.info(new Error('kaboom'), 'with', 'a', 'message')
