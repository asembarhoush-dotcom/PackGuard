#!/usr/bin/env node

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')

const DEFAULT_CONFIG = {
  enabled: true,
  events: { permissionRequest: true, stop: true },
  notifier: {
    provider: 'terminal-notifier',
    sound: 'Ping',
    groupStrategy: 'session',
    activateOnClick: true,
    activateBundleId: 'com.googlecode.iterm2'
  },
  messages: {
    permissionTitle: 'Codex needs approval',
    permissionBody: '{{toolName}} is waiting in {{cwdShort}}',
    stopTitle: 'Codex',
    stopBody: 'Turn finished in {{cwdShort}}',
    questionBody: 'Codex may be waiting for your reply in {{cwdShort}}'
  },
  behavior: {
    notifyOnQuestionOnlyForStop: false,
    questionDetection: 'basic',
    redactToolInput: true
  },
  logging: {
    enabled: true,
    path: '~/.codex/hooks/codex-attention.log'
  }
}

function mergeConfig(userConfig = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...userConfig,
    events: { ...DEFAULT_CONFIG.events, ...(userConfig.events || {}) },
    notifier: { ...DEFAULT_CONFIG.notifier, ...(userConfig.notifier || {}) },
    messages: { ...DEFAULT_CONFIG.messages, ...(userConfig.messages || {}) },
    behavior: { ...DEFAULT_CONFIG.behavior, ...(userConfig.behavior || {}) },
    logging: { ...DEFAULT_CONFIG.logging, ...(userConfig.logging || {}) }
  }
}

function resolveCodexHome(env = process.env) {
  return env.CODEX_HOME || path.join(os.homedir(), '.codex')
}

function expandHome(input) {
  if (!input || input === '~') return os.homedir()
  if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2))
  return input
}

function shortenHome(input) {
  if (!input) return 'unknown workspace'
  const home = os.homedir()
  return input.startsWith(home) ? `~${input.slice(home.length)}` : input
}

function readConfig(codexHome) {
  try {
    return mergeConfig(JSON.parse(fs.readFileSync(path.join(codexHome, 'codex-attention.json'), 'utf8')))
  } catch {
    return mergeConfig()
  }
}

function appendLog(config, message) {
  if (!config.logging || !config.logging.enabled) return
  try {
    const logPath = expandHome(config.logging.path)
    fs.mkdirSync(path.dirname(logPath), { recursive: true })
    fs.appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`, 'utf8')
  } catch {
    // Hooks must never block Codex because logging failed.
  }
}

function buildTemplateContext(payload = {}) {
  const cwd = payload.cwd || ''
  return {
    eventName: payload.hook_event_name || payload.hookEventName || 'unknown',
    sessionId: payload.session_id || payload.sessionId || '',
    cwd,
    cwdShort: shortenHome(cwd),
    toolName: payload.tool_name || payload.toolName || 'tool'
  }
}

function renderTemplate(template, context) {
  return String(template).replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, key) => {
    return context[key] == null ? '' : String(context[key])
  })
}

function looksLikeQuestion(message = '') {
  return String(message).trim().endsWith('?')
}

function groupName(config, sessionId, eventName) {
  if (config.notifier.groupStrategy === 'event') return `codex-attention-${eventName}`
  if (config.notifier.groupStrategy === 'single') return 'codex-attention'
  return `codex-attention-${sessionId || 'unknown'}`
}

function findTerminalNotifier(env = process.env) {
  if (env.CODEX_ATTENTION_TERMINAL_NOTIFIER && fs.existsSync(env.CODEX_ATTENTION_TERMINAL_NOTIFIER)) {
    return env.CODEX_ATTENTION_TERMINAL_NOTIFIER
  }
  const pathEntries = String(env.PATH || '').split(path.delimiter)
  for (const dir of pathEntries) {
    if (!dir) continue
    const candidate = path.join(dir, 'terminal-notifier')
    if (fs.existsSync(candidate)) return candidate
  }
  return ['/opt/homebrew/bin/terminal-notifier', '/usr/local/bin/terminal-notifier']
    .find((candidate) => fs.existsSync(candidate)) || ''
}

function buildTerminalNotifierArgs({ title, message, config, sessionId, eventName }) {
  const args = [
    '-title',
    title,
    '-message',
    message,
    '-sound',
    config.notifier.sound || 'Ping',
    '-group',
    groupName(config, sessionId, eventName)
  ]
  if (config.notifier.activateOnClick && config.notifier.activateBundleId) {
    args.push('-activate', config.notifier.activateBundleId)
  }
  return args
}

function sendTerminalNotification(notification, config) {
  const command = findTerminalNotifier()
  if (!command) return { ok: false, error: new Error('terminal-notifier not found') }
  const result = spawnSync(command, buildTerminalNotifierArgs({ ...notification, config }), {
    stdio: 'ignore',
    timeout: 5000
  })
  return {
    ok: result.status === 0,
    code: result.status,
    error: result.error
  }
}

function playFallbackSound(soundPath = '/System/Library/Sounds/Ping.aiff') {
  if (!fs.existsSync(soundPath)) return
  const child = spawn('/usr/bin/afplay', [soundPath], {
    detached: true,
    stdio: 'ignore'
  })
  child.unref()
}

function stopResponse(eventName) {
  return eventName === 'Stop' ? { continue: true, suppressOutput: true } : null
}

function handleHookPayload(payload, config) {
  const eventName = payload.hook_event_name || payload.hookEventName || 'unknown'
  const sessionId = payload.session_id || payload.sessionId || ''
  const context = buildTemplateContext(payload)

  if (!config.enabled) return { shouldNotify: false, stopResponse: stopResponse(eventName) }

  if (eventName === 'PermissionRequest') {
    if (!config.events.permissionRequest) return { shouldNotify: false }
    return {
      shouldNotify: true,
      title: renderTemplate(config.messages.permissionTitle, context),
      message: renderTemplate(config.messages.permissionBody, context),
      eventName,
      sessionId
    }
  }

  if (eventName === 'Stop') {
    if (!config.events.stop) return { shouldNotify: false, stopResponse: stopResponse(eventName) }
    const isQuestion = looksLikeQuestion(payload.last_assistant_message || '')
    if (config.behavior.notifyOnQuestionOnlyForStop && !isQuestion) {
      return { shouldNotify: false, stopResponse: stopResponse(eventName) }
    }
    return {
      shouldNotify: true,
      title: renderTemplate(config.messages.stopTitle, context),
      message: renderTemplate(isQuestion ? config.messages.questionBody : config.messages.stopBody, context),
      eventName,
      sessionId,
      stopResponse: stopResponse(eventName)
    }
  }

  return { shouldNotify: false }
}

function readStdin(callback) {
  let raw = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => {
    raw += chunk
  })
  process.stdin.on('end', () => callback(raw))
}

function main(raw) {
  const codexHome = resolveCodexHome()
  const config = readConfig(codexHome)

  let payload = {}
  try {
    payload = raw.trim() ? JSON.parse(raw) : {}
  } catch (error) {
    appendLog(config, `invalid_json ${error.message}`)
    return
  }

  const result = handleHookPayload(payload, config)
  appendLog(config, `event=${payload.hook_event_name || payload.hookEventName || 'unknown'} notify=${result.shouldNotify}`)

  if (result.shouldNotify) {
    const sent = sendTerminalNotification(result, config)
    if (!sent.ok) {
      appendLog(config, `terminal_notifier_failed code=${sent.code ?? ''} error=${sent.error?.message ?? ''}`)
      playFallbackSound()
    }
  }

  if (result.stopResponse) {
    process.stdout.write(`${JSON.stringify(result.stopResponse)}\n`)
  }
}

if (require.main === module) {
  readStdin((raw) => {
    try {
      main(raw)
    } catch (error) {
      appendLog(mergeConfig(), `fatal ${error.message}`)
      process.exit(0)
    }
  })
}

module.exports = {
  DEFAULT_CONFIG,
  findTerminalNotifier,
  handleHookPayload,
  mergeConfig,
  renderTemplate
}
