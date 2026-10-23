/* global test */
const zenlog = require('../../zenlog')

test('transport should work in jest', function () {
  zenlog({
    transport: {
      target: 'pino-pretty'
    }
  })
})
