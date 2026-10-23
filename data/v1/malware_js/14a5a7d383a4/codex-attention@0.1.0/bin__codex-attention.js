#!/usr/bin/env node

import { doctor } from '../src/cli/doctor.js'
import { install } from '../src/cli/install.js'
import { uninstall } from '../src/cli/uninstall.js'

const [command, ...args] = process.argv.slice(2)

function usage() {
  console.log(`Usage:
  codex-attention install [--yes|--install-deps|--no-install-deps] [--activate-bundle-id <id>]
  codex-attention doctor [--send-test]
  codex-attention uninstall

Commands:
  install    Install Codex hooks, default config, and approved notification dependency
  doctor     Validate installation and notification dependency
  uninstall  Remove installed hook entries and hook script`)
}

try {
  if (command === 'install') {
    await install(args)
  } else if (command === 'doctor') {
    await doctor(args)
  } else if (command === 'uninstall') {
    await uninstall(args)
  } else {
    usage()
    process.exit(command ? 1 : 0)
  }
} catch (error) {
  console.error(`codex-attention: ${error.message}`)
  process.exit(1)
}
