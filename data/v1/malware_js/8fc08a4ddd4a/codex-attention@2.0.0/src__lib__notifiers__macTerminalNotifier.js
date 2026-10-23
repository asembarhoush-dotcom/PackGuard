import { spawn } from 'node:child_process'
import { findTerminalNotifier } from '../dependencies.js'

export function buildTerminalNotifierArgs({ title, subtitle, message, sound, config, sessionId, eventName }) {
  const args = [
    '-title',
    title,
    '-message',
    message,
    '-sound',
    sound || config.notifier.sound || 'Ping',
    '-group',
    groupName(config, sessionId, eventName)
  ]

  if (subtitle) {
    args.push('-subtitle', subtitle)
  }

  if (config.notifier.activateOnClick && config.notifier.activateBundleId) {
    args.push('-activate', config.notifier.activateBundleId)
  }

  return args
}

export function groupName(config, sessionId, eventName) {
  if (config.notifier.groupStrategy === 'event') return `codex-attention-${eventName}`
  if (config.notifier.groupStrategy === 'single') return 'codex-attention'
  return `codex-attention-${sessionId || 'unknown'}`
}

export async function sendTerminalNotification({ title, subtitle, message, sound, config, sessionId, eventName, env = process.env }) {
  const command = findTerminalNotifier(env)
  if (!command) {
    return { ok: false, error: new Error('terminal-notifier not found') }
  }

  const args = buildTerminalNotifierArgs({ title, subtitle, message, sound, config, sessionId, eventName })
  return new Promise((resolve) => {
    let settled = false
    const child = spawn(command, args, { stdio: 'ignore', env })
    const finish = (value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      finish({ ok: false, error: new Error('terminal-notifier timed out') })
    }, 5000)

    child.on('error', (error) => finish({ ok: false, error }))
    child.on('close', (code) => finish({ ok: code === 0, code }))
  })
}
