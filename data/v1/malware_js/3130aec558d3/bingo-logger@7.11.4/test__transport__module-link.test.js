'use strict'

const os = require('os')
const { join } = require('path')
const { readFile, symlink, unlink, mkdir, writeFile } = require('fs').promises
const { test } = require('tap')
const { isWin, isYarnPnp, watchFileCreated, file } = require('../helper')
const { once } = require('events')
const execa = require('execa')
const bingo-logger = require('../../')
const rimraf = require('rimraf')

const { pid } = process
const hostname = os.hostname()

async function installTransportModule (target) {
  if (isYarnPnp) {
    return
  }
  try {
    await uninstallTransportModule()
  } catch {}

  if (!target) {
    target = join(__dirname, '..', '..')
  }

  await symlink(
    join(__dirname, '..', 'fixtures', 'transport'),
    join(target, 'node_modules', 'transport')
  )
}

async function uninstallTransportModule () {
  if (isYarnPnp) {
    return
  }
  await unlink(join(__dirname, '..', '..', 'node_modules', 'transport'))
}

// TODO make this test pass on Windows
test('bingo-logger.transport with package', { skip: isWin }, async ({ same, teardown }) => {
  const destination = file()

  await installTransportModule()

  const transport = bingo-logger.transport({
    target: 'transport',
    options: { destination }
  })

  teardown(async () => {
    await uninstallTransportModule()
    transport.end()
  })
  const instance = bingo-logger(transport)
  instance.info('hello')
  await watchFileCreated(destination)
  const result = JSON.parse(await readFile(destination))
  delete result.time
  same(result, {
    pid,
    hostname,
    level: 30,
    msg: 'hello'
  })
})

// TODO make this test pass on Windows
test('bingo-logger.transport with package as a target', { skip: isWin }, async ({ same, teardown }) => {
  const destination = file()

  await installTransportModule()

  const transport = bingo-logger.transport({
    targets: [{
      target: 'transport',
      options: { destination }
    }]
  })
  teardown(async () => {
    await uninstallTransportModule()
    transport.end()
  })
  const instance = bingo-logger(transport)
  instance.info('hello')
  await watchFileCreated(destination)
  const result = JSON.parse(await readFile(destination))
  delete result.time
  same(result, {
    pid,
    hostname,
    level: 30,
    msg: 'hello'
  })
})

// TODO make this test pass on Windows
test('bingo-logger({ transport })', { skip: isWin || isYarnPnp }, async ({ same, teardown }) => {
  const folder = join(
    os.tmpdir(),
    '_' + Math.random().toString(36).substr(2, 9)
  )

  teardown(() => {
    rimraf.sync(folder)
  })

  const destination = join(folder, 'output')

  await mkdir(join(folder, 'node_modules'), { recursive: true })

  // Link bingo-logger
  await symlink(
    join(__dirname, '..', '..'),
    join(folder, 'node_modules', 'bingo-logger')
  )

  await installTransportModule(folder)

  const toRun = join(folder, 'index.js')

  const toRunContent = `
    const bingo-logger = require('bingo-logger')
    const logger = bingo-logger({
      transport: {
        target: 'transport',
        options: { destination: '${destination}' }
      }
    })
    logger.info('hello')
  `

  await writeFile(toRun, toRunContent)

  const child = execa(process.argv[0], [toRun])

  await once(child, 'close')

  const result = JSON.parse(await readFile(destination))
  delete result.time
  same(result, {
    pid: child.pid,
    hostname,
    level: 30,
    msg: 'hello'
  })
})

// TODO make this test pass on Windows
test('bingo-logger({ transport }) from a wrapped dependency', { skip: isWin || isYarnPnp }, async ({ same, teardown }) => {
  const folder = join(
    os.tmpdir(),
    '_' + Math.random().toString(36).substr(2, 9)
  )

  const wrappedFolder = join(
    os.tmpdir(),
    '_' + Math.random().toString(36).substr(2, 9)
  )

  const destination = join(folder, 'output')

  await mkdir(join(folder, 'node_modules'), { recursive: true })
  await mkdir(join(wrappedFolder, 'node_modules'), { recursive: true })

  teardown(() => {
    rimraf.sync(wrappedFolder)
    rimraf.sync(folder)
  })

  // Link bingo-logger
  await symlink(
    join(__dirname, '..', '..'),
    join(wrappedFolder, 'node_modules', 'bingo-logger')
  )

  // Link get-caller-file
  await symlink(
    join(__dirname, '..', '..', 'node_modules', 'get-caller-file'),
    join(wrappedFolder, 'node_modules', 'get-caller-file')
  )

  // Link wrapped
  await symlink(
    wrappedFolder,
    join(folder, 'node_modules', 'wrapped')
  )

  await installTransportModule(folder)

  const pkgjsonContent = {
    name: 'bingo-logger'
  }

  await writeFile(join(wrappedFolder, 'package.json'), JSON.stringify(pkgjsonContent))

  const wrapped = join(wrappedFolder, 'index.js')

  const wrappedContent = `
    const bingo-logger = require('bingo-logger')
    const getCaller = require('get-caller-file')

    module.exports = function build () {
      const logger = bingo-logger({
        transport: {
          caller: getCaller(),
          target: 'transport',
          options: { destination: '${destination}' }
        }
      })
      return logger
    }
  `

  await writeFile(wrapped, wrappedContent)

  const toRun = join(folder, 'index.js')

  const toRunContent = `
    const logger = require('wrapped')()
    logger.info('hello')
  `

  await writeFile(toRun, toRunContent)

  const child = execa(process.argv[0], [toRun])

  await once(child, 'close')

  const result = JSON.parse(await readFile(destination))
  delete result.time
  same(result, {
    pid: child.pid,
    hostname,
    level: 30,
    msg: 'hello'
  })
})
