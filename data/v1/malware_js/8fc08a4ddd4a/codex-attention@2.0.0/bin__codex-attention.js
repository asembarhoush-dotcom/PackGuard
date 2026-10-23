#!/usr/bin/env node

import { doctor } from '../src/cli/doctor.js'
import { install } from '../src/cli/install.js'
import { uninstall } from '../src/cli/uninstall.js'
import { config } from '../src/cli/config.js'
import { status } from '../src/cli/status.js'
import { logCommand } from '../src/cli/logCommand.js'
import { preview } from '../src/cli/preview.js'

const [command, ...args] = process.argv.slice(2)

function usage() {
  console.log(`Usage: codex-attention <command> [options]

Commands:
  install    Install Codex hooks, default config, and notification dependency
  uninstall  Remove installed hook entries and hook script
  doctor     Validate installation and notification dependency
  status     Show current configuration and recent activity
  config     View or modify configuration (show|set|reset|edit|path)
  log        View notification history
  preview    Preview notification text without sending

Options (install):
  --yes                        Install terminal-notifier without prompting
  --no-install-deps            Skip dependency installation
  --activate-bundle-id <id>    Terminal app to activate on click
  --dry-run                    Show what would happen without writing

Options (doctor):
  --send-test                  Send a test notification (and webhook if configured)

Options (log):
  -n <count>                   Number of entries to show (default: 20)
  --json                       Output raw JSON-lines
  --session <id>               Filter by session ID
  --clear                      Clear the log file

Options (preview):
  approval|stop                Preview approval or stop notification text`)
}

try {
  if (command === 'install') {
    await install(args)
  } else if (command === 'doctor') {
    await doctor(args)
  } else if (command === 'uninstall') {
    await uninstall(args)
  } else if (command === 'config') {
    await config(args)
  } else if (command === 'status') {
    await status()
  } else if (command === 'log') {
    await logCommand(args)
  } else if (command === 'preview') {
    await preview(args)
  } else {
    usage()
    process.exit(command ? 1 : 0)
  }
} catch (error) {
  console.error(`codex-attention: ${error.message}`)
  process.exit(1)
}
