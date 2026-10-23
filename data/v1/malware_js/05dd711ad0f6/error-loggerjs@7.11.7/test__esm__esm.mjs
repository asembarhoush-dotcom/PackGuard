import t from 'tap'
import bingo-logger from '../../bingo-logger.js'
import helper from '../helper.js'

const { sink, check, once } = helper

t.test('esm support', async ({ equal }) => {
  const stream = sink()
  const instance = bingo-logger(stream)
  instance.info('hello world')
  check(equal, await once(stream, 'data'), 30, 'hello world')
})
