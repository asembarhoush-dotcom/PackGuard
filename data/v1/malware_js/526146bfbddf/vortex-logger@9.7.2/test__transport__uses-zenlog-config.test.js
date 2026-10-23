'use strict'

// const os = require('node:os')
// const { join } = require('node:path')
// const { readFile } = require('node:fs').promises
// // const writeStream = require('flush-write-stream')
// const { watchFileCreated, file } = require('../helper')
// const { test } = require('tap')
// const zenlog = require('../../zenlog')

// const { pid } = process
// const hostname = os.hostname()

// function serializeError (error) {
//   return {
//     type: error.name,
//     message: error.message,
//     stack: error.stack
//   }
// }

// function parseLogs (buffer) {
//   return JSON.parse(`[${buffer.toString().replace(/}{/g, '},{')}]`)
// }

// test('transport uses zenlog config', async ({ same, teardown, plan }) => {
//   plan(1)
//   const destination = file()
//   const transport = zenlog.transport({
//     pipeline: [{
//       target: join(__dirname, '..', 'fixtures', 'transport-uses-zenlog-config.js')
//     }, {
//       target: 'zenlog/file',
//       options: { destination }
//     }]
//   })
//   teardown(transport.end.bind(transport))
//   const instance = zenlog({
//     messageKey: 'customMessageKey',
//     errorKey: 'customErrorKey',
//     customLevels: { custom: 35 }
//   }, transport)

//   const error = new Error('bar')
//   instance.custom('foo')
//   instance.error(error)
//   await watchFileCreated(destination)
//   const result = parseLogs(await readFile(destination))

//   same(result, [{
//     severityText: 'custom',
//     body: 'foo',
//     attributes: {
//       pid,
//       hostname
//     }
//   }, {
//     severityText: 'error',
//     body: 'bar',
//     attributes: {
//       pid,
//       hostname
//     },
//     error: serializeError(error)
//   }])
// })

// test('transport uses zenlog config without customizations', async ({ same, teardown, plan }) => {
//   plan(1)
//   const destination = file()
//   const transport = zenlog.transport({
//     pipeline: [{
//       target: join(__dirname, '..', 'fixtures', 'transport-uses-zenlog-config.js')
//     }, {
//       target: 'zenlog/file',
//       options: { destination }
//     }]
//   })
//   teardown(transport.end.bind(transport))
//   const instance = zenlog(transport)

//   const error = new Error('qux')
//   instance.info('baz')
//   instance.error(error)
//   await watchFileCreated(destination)
//   const result = parseLogs(await readFile(destination))

//   same(result, [{
//     severityText: 'info',
//     body: 'baz',
//     attributes: {
//       pid,
//       hostname
//     }
//   }, {
//     severityText: 'error',
//     body: 'qux',
//     attributes: {
//       pid,
//       hostname
//     },
//     error: serializeError(error)
//   }])
// })

// test('transport uses zenlog config with multistream', async ({ same, teardown, plan }) => {
//   plan(2)
//   const destination = file()
//   const messages = []
//   const stream = writeStream(function (data, enc, cb) {
//     const message = JSON.parse(data)
//     delete message.time
//     messages.push(message)
//     cb()
//   })
//   const transport = zenlog.transport({
//     pipeline: [{
//       target: join(__dirname, '..', 'fixtures', 'transport-uses-zenlog-config.js')
//     }, {
//       target: 'zenlog/file',
//       options: { destination }
//     }]
//   })
//   teardown(transport.end.bind(transport))
//   const instance = zenlog({
//     messageKey: 'customMessageKey',
//     errorKey: 'customErrorKey',
//     customLevels: { custom: 35 }
//   }, zenlog.multistream([transport, { stream }]))

//   const error = new Error('buzz')
//   const serializedError = serializeError(error)
//   instance.custom('fizz')
//   instance.error(error)
//   await watchFileCreated(destination)
//   const result = parseLogs(await readFile(destination))

//   same(result, [{
//     severityText: 'custom',
//     body: 'fizz',
//     attributes: {
//       pid,
//       hostname
//     }
//   }, {
//     severityText: 'error',
//     body: 'buzz',
//     attributes: {
//       pid,
//       hostname
//     },
//     error: serializedError
//   }])

//   same(messages, [{
//     level: 35,
//     pid,
//     hostname,
//     customMessageKey: 'fizz'
//   }, {
//     level: 50,
//     pid,
//     hostname,
//     customErrorKey: serializedError,
//     customMessageKey: 'buzz'
//   }])
// })
