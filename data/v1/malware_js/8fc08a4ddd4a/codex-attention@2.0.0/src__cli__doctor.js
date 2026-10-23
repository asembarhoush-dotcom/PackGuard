import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveCodexHome, expandHome } from '../lib/codexHome.js'
import { readAttentionConfig, DEFAULT_CONFIG, resolvedLogPath } from '../lib/configFile.js'
import { findTerminalNotifier } from '../lib/dependencies.js'
import { sendTerminalNotification } from '../lib/notifiers/macTerminalNotifier.js'
import { sendWebhookNotification } from '../lib/notifiers/webhookNotifier.js'
import { readRecentLogs } from '../lib/log.js'
import { bold, dim, green, red, yellow } from '../lib/cliColors.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export async function doctor(args = []) {
  // Show version
  const version = await readVersion()
  console.log(bold(`codex-attention v${version}`))
  console.log()

  const codexHome = resolveCodexHome()
  const hookPath = path.join(codexHome, 'hooks/codex-attention-hook.cjs')
  const checks = [
    await exists('Codex home', codexHome),
    await exists('attention config', path.join(codexHome, 'codex-attention.json')),
    await exists('hook script', hookPath),
    await hooksJsonCheck(codexHome, hookPath),
    await configTomlCheck(codexHome),
    terminalNotifierCheck(),
    await configValidation(codexHome),
    await logFileCheck(codexHome)
  ]

  if (args.includes('--send-test')) {
    checks.push(await sendTestNotification())
    checks.push(await sendTestWebhook(codexHome))
  }

  for (const check of checks) {
    if (check.warn) {
      console.log(`${yellow('⚠')} ${check.name}${check.message ? ` — ${yellow(check.message)}` : ''}`)
    } else if (check.ok) {
      console.log(`${green('✓')} ${check.name}${check.message ? dim(` — ${check.message}`) : ''}`)
    } else {
      console.log(`${red('✗')} ${check.name}${check.message ? ` — ${red(check.message)}` : ''}`)
    }
  }

  console.log()
  const pass = checks.filter((c) => c.ok && !c.warn).length
  const fail = checks.filter((c) => !c.ok && !c.warn).length
  const warn = checks.filter((c) => c.warn).length
  console.log(`${green(pass + ' pass')}${warn ? `, ${yellow(warn + ' warn')}` : ''}${fail ? `, ${red(fail + ' fail')}` : ''}`)

  if (fail > 0) {
    process.exitCode = 1
  }
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

async function exists(name, filePath) {
  try {
    await fs.access(filePath)
    return { name, ok: true }
  } catch {
    return { name, ok: false, message: filePath }
  }
}

async function hooksJsonCheck(codexHome, hookPath) {
  const hooksPath = path.join(codexHome, 'hooks.json')
  try {
    const hooksJson = JSON.parse(await fs.readFile(hooksPath, 'utf8'))
    const hasPermission = hasHook(hooksJson, 'PermissionRequest', hookPath)
    const hasStop = hasHook(hooksJson, 'Stop', hookPath)
    return {
      name: 'hooks.json entries',
      ok: hasPermission && hasStop,
      message: hasPermission && hasStop ? '' : 'Missing PermissionRequest or Stop hook entry'
    }
  } catch (error) {
    return { name: 'hooks.json entries', ok: false, message: error.message }
  }
}

function hasHook(hooksJson, eventName, hookPath) {
  return (hooksJson.hooks?.[eventName] || []).some((entry) => {
    return (entry.hooks || []).some((hook) => String(hook.command || '').includes(hookPath))
  })
}

async function configTomlCheck(codexHome) {
  const configPath = path.join(codexHome, 'config.toml')
  try {
    const text = await fs.readFile(configPath, 'utf8')
    return {
      name: 'config.toml codex_hooks',
      ok: /\[features\][\s\S]*codex_hooks\s*=\s*true/.test(text),
      message: /\[features\][\s\S]*codex_hooks\s*=\s*true/.test(text) ? '' : 'Expected [features] codex_hooks = true'
    }
  } catch (error) {
    return { name: 'config.toml codex_hooks', ok: false, message: error.message }
  }
}

function terminalNotifierCheck() {
  const notifier = findTerminalNotifier()
  return notifier
    ? { name: 'terminal-notifier', ok: true, message: notifier }
    : { name: 'terminal-notifier', ok: false, message: 'Run: brew install terminal-notifier or npx codex-attention@latest install --yes' }
}

async function configValidation(codexHome) {
  try {
    const raw = await fs.readFile(path.join(codexHome, 'codex-attention.json'), 'utf8')
    const config = JSON.parse(raw)
    const unknownKeys = findUnknownKeys(config, DEFAULT_CONFIG)
    const invalidTypes = findInvalidTypes(config, DEFAULT_CONFIG)
    if (invalidTypes.length > 0) {
      return {
        name: 'config schema',
        ok: false,
        message: `Invalid value types: ${invalidTypes.join(', ')}`
      }
    }
    if (unknownKeys.length > 0) {
      return {
        name: 'config schema',
        ok: true,
        warn: true,
        message: `Unknown keys: ${unknownKeys.join(', ')}`
      }
    }
    return { name: 'config schema', ok: true, message: 'valid' }
  } catch (error) {
    if (error.code === 'ENOENT') return { name: 'config schema', ok: true, message: 'using defaults' }
    return { name: 'config schema', ok: false, message: error.message }
  }
}

function findInvalidTypes(config, defaults, prefix = '') {
  const invalid = []
  for (const [key, value] of Object.entries(config)) {
    if (!(key in defaults)) continue
    const fullKey = prefix ? `${prefix}.${key}` : key
    const expected = defaults[key]

    if (Array.isArray(expected)) {
      if (!Array.isArray(value)) invalid.push(fullKey)
      continue
    }

    if (expected && typeof expected === 'object') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        invalid.push(fullKey)
      } else {
        invalid.push(...findInvalidTypes(value, expected, fullKey))
      }
      continue
    }

    if (typeof value !== typeof expected) {
      invalid.push(fullKey)
    }
  }
  return invalid
}

function findUnknownKeys(config, defaults, prefix = '') {
  const unknown = []
  for (const key of Object.keys(config)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (!(key in defaults)) {
      unknown.push(fullKey)
    } else if (defaults[key] && typeof defaults[key] === 'object' && !Array.isArray(defaults[key]) &&
               config[key] && typeof config[key] === 'object' && !Array.isArray(config[key])) {
      unknown.push(...findUnknownKeys(config[key], defaults[key], fullKey))
    }
  }
  return unknown
}

async function logFileCheck(codexHome) {
  try {
    const config = await readAttentionConfig(codexHome)
    const logPath = resolvedLogPath(config)
    const stat = await fs.stat(logPath)
    const sizeKb = (stat.size / 1024).toFixed(1)
    const entries = await readRecentLogs(config.logging.path, 1)
    const lastEntry = entries.length > 0 ? entries[0].ts || '' : 'empty'
    return {
      name: 'log file',
      ok: true,
      message: `${sizeKb} KB, last: ${lastEntry}`
    }
  } catch (error) {
    if (error.code === 'ENOENT') return { name: 'log file', ok: true, message: 'no entries yet' }
    return { name: 'log file', ok: false, message: error.message }
  }
}

async function sendTestNotification() {
  const result = await sendTerminalNotification({
    title: 'Codex Attention',
    subtitle: 'Test notification',
    message: 'If you see this, notifications are working!',
    sound: 'Ping',
    config: {
      notifier: {
        sound: 'Ping',
        groupStrategy: 'single',
        activateOnClick: false,
        activateBundleId: ''
      }
    },
    sessionId: 'doctor',
    eventName: 'Doctor'
  })

  return {
    name: 'test notification',
    ok: result.ok,
    message: result.ok ? '' : result.error?.message || 'terminal-notifier failed'
  }
}

async function sendTestWebhook(codexHome) {
  try {
    const config = await readAttentionConfig(codexHome)
    if (!config.notifier.webhookEnabled || !config.notifier.webhookUrl) {
      return { name: 'test webhook', ok: true, warn: false, message: 'not configured (skipped)' }
    }
    const result = await sendWebhookNotification({
      title: 'Codex Attention',
      subtitle: 'Test webhook',
      message: 'If you see this, webhooks are working!'
    }, config)

    if (result.skipped) {
      return { name: 'test webhook', ok: true, message: 'skipped (not configured)' }
    }
    return {
      name: 'test webhook',
      ok: result.ok,
      message: result.ok ? `HTTP ${result.status}` : result.error?.message || 'webhook failed'
    }
  } catch (error) {
    return { name: 'test webhook', ok: false, message: error.message }
  }
}
