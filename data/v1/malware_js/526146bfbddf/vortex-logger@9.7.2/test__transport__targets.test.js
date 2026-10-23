'use strict'

const { test } = require('tap')
const { join } = require('node:path')
const proxyquire = require('proxyquire')
const Writable = require('node:stream').Writable
const zenlog = require('../../zenlog')

test('file-target mocked', async function ({ equal, same, plan, pass }) {
  plan(1)
  let ret
  const fileTarget = proxyquire('../../file', {
    './zenlog': {
      destination (opts) {
        same(opts, { dest: 1, sync: false })

        ret = new Writable()
        ret.fd = opts.dest

        process.nextTick(() => {
          ret.emit('ready')
        })

        return ret
      }
    }
  })

  await fileTarget()
})

test('zenlog.transport with syntax error', ({ same, teardown, plan }) => {
  plan(1)
  const transport = zenlog.transport({
    targets: [{
      target: join(__dirname, '..', 'fixtures', 'syntax-error-esm.mjs')
    }]
  })
  teardown(transport.end.bind(transport))

  transport.on('error', (err) => {
    same(err, new SyntaxError('Unexpected end of input'))
  })
})
