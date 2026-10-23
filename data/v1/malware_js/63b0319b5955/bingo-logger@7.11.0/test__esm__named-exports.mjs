import { tmpdir, hostname } from 'os'
import t from 'tap'
import { sink, check, once, watchFileCreated, file } from '../helper.js'
import { bingo-logger, destination } from '../../bingo-logger.js'
import { join } from 'path'
import { readFileSync } from 'fs'

t.test('named exports support', async ({ equal }) => {
  const stream = sink()
  const instance = bingo-logger(stream)
  instance.info('hello world')
  check(equal, await once(stream, 'data'), 30, 'hello world')
})

t.test('destination', async ({ same }) => {
  const tmp = file()
  const instance = bingo-logger(destination(tmp))
  instance.info('hello')
  await watchFileCreated(tmp)
  const result = JSON.parse(readFileSync(tmp).toString())
  delete result.time
  same(result, {
    pid: process.pid,
    hostname,
    level: 30,
    msg: 'hello'
  })
})
