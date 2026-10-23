'use strict'
Object.freeze(console)
const test = require('tape')
const zenlog = require('../browser')

test('silent level', ({ end, fail, pass }) => {
  zenlog({
    level: 'silent',
    browser: { }
  })
  end()
})
