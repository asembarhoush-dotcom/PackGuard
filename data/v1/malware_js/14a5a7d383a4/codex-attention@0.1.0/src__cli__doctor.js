import fs from 'node:fs/promises'
import path from 'node:path'
import { resolveCodexHome } from '../lib/codexHome.js'
import { findTerminalNotifier } from '../lib/dependencies.js'
import { sendTerminalNotification } from '../lib/notifiers/macTerminalNotifier.js'

export async function doctor(args = []) {
  const codexHome = resolveCodexHome()
  const hookPath = path.join(codexHome, 'hooks/codex-attention-hook.cjs')
  const checks = [
    await exists('Codex home', codexHome),
    await exists('attention config', path.join(codexHome, 'codex-attention.json')),
    await exists('hook script', hookPath),
    await hooksJsonCheck(codexHome, hookPath),
    await configTomlCheck(codexHome),
    terminalNotifierCheck()
  ]

  if (args.includes('--send-test')) {
    checks.push(await sendTestNotification())
  }

  for (const check of checks) {
    console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.name}${check.message ? ` - ${check.message}` : ''}`)
  }

  if (checks.some((check) => !check.ok)) {
    process.exitCode = 1
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
      message: 'Expected [features] codex_hooks = true'
    }
  } catch (error) {
    return { name: 'config.toml codex_hooks', ok: false, message: error.message }
  }
}

function terminalNotifierCheck() {
  const notifier = findTerminalNotifier()
  return notifier
    ? { name: 'terminal-notifier', ok: true, message: notifier }
    : { name: 'terminal-notifier', ok: false, message: 'Run: brew install terminal-notifier or codex-attention install --yes' }
}

async function sendTestNotification() {
  const result = await sendTerminalNotification({
    title: 'Codex Attention',
    message: 'Test notification',
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
