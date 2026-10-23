import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveCodexHome, expandHome } from '../lib/codexHome.js'
import { readAttentionConfig, resolvedLogPath } from '../lib/configFile.js'
import { findTerminalNotifier } from '../lib/dependencies.js'
import { readRecentLogs, formatLogEntry } from '../lib/log.js'
import { dim, green, red, bold, yellow, cyan } from '../lib/cliColors.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export async function status() {
  const version = await readVersion()
  const codexHome = resolveCodexHome()
  const config = await readAttentionConfig(codexHome)

  console.log(bold(`codex-attention v${version}`))
  console.log()

  // Key settings
  console.log(bold('Configuration'))
  console.log(`  Enabled:            ${config.enabled ? green('yes') : red('no')}`)
  console.log(`  PermissionRequest:  ${config.events.permissionRequest ? green('on') : dim('off')}`)
  console.log(`  Stop:               ${config.events.stop ? green('on') : dim('off')}`)
  console.log(`  Question detection: ${cyan(config.behavior.questionDetection)}`)
  console.log(`  Cooldown:           ${cyan(config.behavior.cooldownSeconds + 's')}`)
  console.log(`  Permission sound:   ${dim(config.notifier.permissionSound || config.notifier.sound)}`)
  console.log(`  Stop sound:         ${dim(config.notifier.stopSound || config.notifier.sound)}`)

  if (config.behavior.rules.length > 0) {
    console.log(`  Rules:              ${cyan(config.behavior.rules.length + ' active')}`)
  }

  if (config.notifier.webhookEnabled && config.notifier.webhookUrl) {
    const mode = config.notifier.webhookWhen === 'idle'
      ? `${config.notifier.webhookFormat}, idle ${config.notifier.webhookIdleSeconds}s`
      : `${config.notifier.webhookFormat}, ${config.notifier.webhookWhen}`
    console.log(`  Webhook:            ${green('enabled')} (${mode})`)
  } else {
    console.log(`  Webhook:            ${dim('off')}`)
  }

  console.log()

  // Hook health
  console.log(bold('Health'))
  const hookPath = path.join(codexHome, 'hooks/codex-attention-hook.cjs')
  const hookExists = await fileExists(hookPath)
  console.log(`  Hook script:        ${hookExists ? green('✓ installed') : red('✗ missing')}`)

  const notifier = findTerminalNotifier()
  console.log(`  terminal-notifier:  ${notifier ? green('✓ ' + notifier) : red('✗ not found')}`)

  console.log()

  // Recent activity
  console.log(bold('Recent Notifications'))
  const logPath = config.logging.path
  const entries = await readRecentLogs(logPath, 5)
  if (entries.length === 0) {
    console.log(dim('  No recent notifications'))
  } else {
    for (const entry of entries) {
      const line = formatLogEntry(entry)
      console.log(`  ${entry.notified ? green('•') : dim('•')} ${line}`)
    }
  }

  console.log()
  console.log(dim(`Config: ${codexHome}/codex-attention.json`))
  console.log(dim(`Log:    ${expandHome(logPath)}`))
}

async function readVersion() {
  try {
    const pkgPath = path.resolve(__dirname, '../../package.json')
    const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'))
    return pkg.version || 'unknown'
  } catch {
    return 'unknown'
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}
