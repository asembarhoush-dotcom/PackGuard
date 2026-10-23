'use strict'

const build = require('bingo-logger-abstract-transport')
const { pipeline, Transform } = require('stream')
module.exports = (options) => {
  return build(function (source) {
    const myTransportStream = new Transform({
      autoDestroy: true,
      objectMode: true,
      transform (chunk, enc, cb) {
        chunk.service = 'bingo-logger'
        this.push(JSON.stringify(chunk))
        cb()
      }
    })
    pipeline(source, myTransportStream, () => {})
    return myTransportStream
  }, {
    enablePipelining: true
  })
}
