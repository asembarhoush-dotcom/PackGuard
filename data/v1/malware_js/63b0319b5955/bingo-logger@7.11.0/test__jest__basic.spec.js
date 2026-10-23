/* global test */
const bingo-logger = require('../../bingo-logger')

test('transport should work in jest', function () {
  bingo-logger({
    transport: {
      target: 'bingo-logger-pretty'
    }
  })
})
