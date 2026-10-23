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
    permissionSound: 'Basso',
    stopSound: 'Ping',
    groupStrategy: 'session',
    activateOnClick: true,
    activateBundleId: 'com.googlecode.iterm2',
    webhookUrl: '',
    webhookFormat: 'slack',
    webhookEnabled: false,
    webhookWhen: 'always',
    webhookIdleSeconds: 120
  },
  messages: {
    permissionTitle: 'Codex · {{projectName}}',
    permissionSubtitle: 'Approval needed',
    permissionBody: '{{toolName}}: {{toolInputShort}}',
    stopTitle: 'Codex · {{projectName}}',
    stopSubtitle: 'Turn finished',
    stopBody: 'Turn finished in {{cwdShort}}',
    questionSubtitle: 'Waiting for reply',
    questionBody: '{{lastMessageShort}}'
  },
  behavior: {
    notifyOnQuestionOnlyForStop: false,
    questionDetection: 'enhanced',
    showToolInput: true,
    cooldownSeconds: 3,
    rules: []
  },
  logging: {
    enabled: true,
    path: '~/.codex/hooks/codex-attention.log',
    format: 'json',
    maxSizeBytes: 1048576
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

// --- Structured Logging ---

function appendLog(config, message, structured = null) {
  if (!config.logging || !config.logging.enabled) return
  try {
    const logPath = expandHome(config.logging.path)
    fs.mkdirSync(path.dirname(logPath), { recursive: true })

    if (config.logging.format === 'json' && structured) {
      const entry = { ts: new Date().toISOString(), ...structured }
      fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`, 'utf8')
    } else {
      fs.appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`, 'utf8')
    }

    // Simple log rotation: if file exceeds maxSizeBytes, truncate to last half
    rotateLogIfNeeded(logPath, config.logging.maxSizeBytes || 1048576)
  } catch {
    // Hooks must never block Codex because logging failed.
  }
}

function rotateLogIfNeeded(logPath, maxBytes) {
  try {
    const stat = fs.statSync(logPath)
    if (stat.size <= maxBytes) return
    const content = fs.readFileSync(logPath, 'utf8')
    const lines = content.split('\n')
    const half = Math.floor(lines.length / 2)
    fs.writeFileSync(logPath, lines.slice(half).join('\n'), 'utf8')
  } catch {
    // Ignore rotation errors
  }
}

// --- Tool Input Summarization ---

function truncate(str, maxLength = 80) {
  if (!str) return ''
  const s = String(str).trim()
  return s.length <= maxLength ? s : `${s.slice(0, maxLength - 1)}…`
}

function redactSensitive(input) {
  return String(input)
    .replace(/\b([A-Z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|PASS|AUTHORIZATION|COOKIE)[A-Z0-9_]*)\s*=\s*("[^"]*"|'[^']*'|[^\s]+)/gi, '$1=<redacted>')
    .replace(/(^|\s)(--?(?:api-key|apikey|token|secret|password|pass|auth|authorization|cookie))(\s+|=)("[^"]*"|'[^']*'|[^\s]+)/gi, '$1$2$3<redacted>')
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 <redacted>')
}

function summarizeToolInput(toolInput, maxLength = 80) {
  if (toolInput == null) return ''

  // Bash-style: { command: "npm install express" }
  if (typeof toolInput === 'object' && toolInput.command) {
    return truncate(redactSensitive(toolInput.command), maxLength)
  }

  // File-oriented tools: { path: "src/index.js" } or { file: "..." }
  if (typeof toolInput === 'object' && (toolInput.path || toolInput.file)) {
    const filePath = toolInput.path || toolInput.file
    return truncate(path.basename(String(filePath)), maxLength)
  }

  // String input — try to extract a filename
  if (typeof toolInput === 'string') {
    const firstLine = toolInput.split('\n')[0]
    const fileMatch = firstLine.match(/(?:^|\s)((?:\/|\.\/|\.\.\/)?[\w./-]+\.\w+)/)
    if (fileMatch) {
      return `modifying ${path.basename(fileMatch[1])}`
    }
    return truncate(redactSensitive(firstLine), maxLength)
  }

  // Object fallback
  if (typeof toolInput === 'object') {
    return truncate(redactSensitive(JSON.stringify(toolInput)), maxLength)
  }

  return truncate(redactSensitive(toolInput), maxLength)
}

// --- Template ---

function buildTemplateContext(payload = {}, options = {}) {
  const cwd = payload.cwd || ''
  const toolInput = payload.tool_input || payload.toolInput || null
  const lastMessage = redactSensitive(payload.last_assistant_message || '')
  const showToolInput = options.showToolInput !== false
  const toolInputText = toolInput ? redactSensitive(typeof toolInput === 'string' ? toolInput : JSON.stringify(toolInput)) : ''

  return {
    eventName: payload.hook_event_name || payload.hookEventName || 'unknown',
    sessionId: payload.session_id || payload.sessionId || '',
    cwd,
    cwdShort: shortenHome(cwd),
    toolName: payload.tool_name || payload.toolName || 'tool',
    projectName: cwd ? path.basename(cwd) : 'Codex',
    model: payload.model || '',
    toolInput: showToolInput ? truncate(toolInputText, 200) : '',
    toolInputShort: showToolInput ? summarizeToolInput(toolInput) : 'input hidden',
    lastMessage: truncate(lastMessage, 200),
    lastMessageShort: truncate(lastMessage, 80)
  }
}

function renderTemplate(template, context) {
  return String(template).replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, key) => {
    return context[key] == null ? '' : String(context[key])
  })
}

// --- Question Detection ---

const QUESTION_PHRASES = [
  /should i\b/i,
  /would you like/i,
  /do you want/i,
  /please confirm/i,
  /let me know/i,
  /please choose/i,
  /which option/i,
  /what would you prefer/i,
  /shall i\b/i,
  /can i\b/i,
  /would you prefer/i,
  /do you prefer/i,
  /is that (?:ok|okay|correct|right)\b/i,
  /does that (?:work|sound|look)/i
]

const NUMBERED_LIST_RE = /^[1-9][.)]\s/m

function looksLikeQuestion(message = '', mode = 'enhanced') {
  const text = String(message).trim()
  if (!text) return false

  if (mode === 'basic') {
    return text.endsWith('?')
  }

  // Enhanced: check all lines for ?, match question phrases, detect option lists
  const lines = text.split('\n')
  for (const line of lines) {
    if (line.trim().endsWith('?')) return true
  }

  for (const pattern of QUESTION_PHRASES) {
    if (pattern.test(text)) return true
  }

  if (NUMBERED_LIST_RE.test(text)) return true

  return false
}

// --- Notification Grouping ---

function groupName(config, sessionId, eventName) {
  if (config.notifier.groupStrategy === 'event') return `codex-attention-${eventName}`
  if (config.notifier.groupStrategy === 'single') return 'codex-attention'
  return `codex-attention-${sessionId || 'unknown'}`
}

// --- Cooldown / Debounce ---

function cooldownFilePath(codexHome) {
  return path.join(codexHome, 'hooks', '.cooldown.json')
}

function shouldThrottle(codexHome, sessionId, eventName, cooldownSeconds) {
  if (eventName === 'PermissionRequest') return false
  if (cooldownSeconds <= 0) return false
  const filePath = cooldownFilePath(codexHome)
  const key = `${sessionId || 'unknown'}:${eventName}`
  let data = {}
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    // File doesn't exist or is corrupt — start fresh
  }
  const lastTs = data[key]
  if (lastTs && Date.now() - lastTs < cooldownSeconds * 1000) return true
  // Write current timestamp and prune stale entries (older than 5 min)
  try {
    const now = Date.now()
    const cutoff = now - 5 * 60 * 1000
    const pruned = {}
    for (const [k, v] of Object.entries(data)) {
      if (v > cutoff) pruned[k] = v
    }
    pruned[key] = now
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(pruned), 'utf8')
  } catch {
    // Ignore write failures
  }
  return false
}

// --- Conditional Rules ---

function matchRule(rules, eventName, toolName) {
  if (!Array.isArray(rules) || rules.length === 0) return null
  for (const rule of rules) {
    if (rule.event && rule.event !== eventName) continue
    if (rule.toolName && rule.toolName !== toolName) continue
    return rule
  }
  return null
}

// --- Native Notification ---

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

function buildTerminalNotifierArgs({ title, subtitle, message, sound, config, sessionId, eventName }) {
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

// --- Webhook Notification ---

function sendWebhookNotification(notification, config) {
  if (!config.notifier.webhookEnabled || !config.notifier.webhookUrl) return
  if (!shouldSendWebhook(config)) return
  try {
    const payload = buildWebhookPayload(notification, config)
    const url = config.notifier.webhookUrl
    // Use child process to fire async HTTP request without blocking
    const curlArgs = [
      '-s', '-o', '/dev/null', '-w', '%{http_code}',
      '-X', 'POST',
      '-H', 'Content-Type: application/json',
      '-d', JSON.stringify(payload),
      '--max-time', '5',
      url
    ]
    const child = spawn('/usr/bin/curl', curlArgs, { detached: true, stdio: 'ignore' })
    child.unref()
  } catch {
    // Webhook failures must never block Codex
  }
}

function getMacIdleSeconds() {
  const candidates = ['/usr/sbin/ioreg', '/usr/bin/ioreg']
  for (const command of candidates) {
    if (!fs.existsSync(command)) continue
    const result = spawnSync(command, ['-c', 'IOHIDSystem'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1000
    })
    if (result.status === 0) {
      return parseMacIdleSeconds(result.stdout)
    }
  }
  return null
}

function parseMacIdleSeconds(output = '') {
  const match = String(output).match(/"HIDIdleTime"\s*=\s*(\d+)/)
  if (!match) return null
  return Math.floor(Number(match[1]) / 1000000000)
}

function shouldSendWebhook(config, idleSeconds) {
  if (!config.notifier.webhookEnabled || !config.notifier.webhookUrl) return false
  const when = config.notifier.webhookWhen || 'always'
  if (when === 'never') return false
  if (when === 'idle') {
    const observedIdleSeconds = arguments.length >= 2 ? idleSeconds : getMacIdleSeconds()
    if (!Number.isFinite(observedIdleSeconds)) return false
    const threshold = Number(config.notifier.webhookIdleSeconds ?? 120)
    return observedIdleSeconds >= threshold
  }
  return true
}

function buildWebhookPayload(notification, config) {
  const format = config.notifier.webhookFormat || 'slack'
  const title = notification.title || 'Codex'
  const subtitle = notification.subtitle || ''
  const message = notification.message || ''
  const fullText = [title, subtitle, message].filter(Boolean).join(' — ')

  if (format === 'discord') {
    return { content: fullText }
  }

  if (format === 'raw') {
    return {
      title,
      subtitle,
      message,
      event: notification.eventName,
      session: notification.sessionId,
      timestamp: new Date().toISOString()
    }
  }

  // Slack format (default)
  return {
    text: fullText,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${title}*${subtitle ? `\n${subtitle}` : ''}\n${message}`
        }
      }
    ]
  }
}

// --- Core Event Handling ---

function stopResponse(eventName) {
  return eventName === 'Stop' ? { continue: true, suppressOutput: true } : null
}

function handleHookPayload(payload, config, codexHome = '') {
  const eventName = payload.hook_event_name || payload.hookEventName || 'unknown'
  const sessionId = payload.session_id || payload.sessionId || ''
  const toolName = payload.tool_name || payload.toolName || ''
  const context = buildTemplateContext(payload, {
    showToolInput: config.behavior.showToolInput !== false
  })

  if (!config.enabled) return { shouldNotify: false, stopResponse: stopResponse(eventName) }

  // Check conditional rules first
  const rule = matchRule(config.behavior.rules, eventName, toolName)

  if (eventName === 'PermissionRequest') {
    // Rule can override global event setting
    const shouldNotify = rule && Object.hasOwn(rule, 'notify') ? rule.notify !== false : config.events.permissionRequest
    if (!shouldNotify) return { shouldNotify: false }

    const sound = (rule && rule.sound) || config.notifier.permissionSound || config.notifier.sound
    return {
      shouldNotify: true,
      title: renderTemplate(config.messages.permissionTitle, context),
      subtitle: renderTemplate(config.messages.permissionSubtitle, context),
      message: renderTemplate(config.messages.permissionBody, context),
      sound,
      eventName,
      sessionId
    }
  }

  if (eventName === 'Stop') {
    const shouldNotify = rule && Object.hasOwn(rule, 'notify') ? rule.notify !== false : config.events.stop
    if (!shouldNotify) return { shouldNotify: false, stopResponse: stopResponse(eventName) }

    const questionMode = config.behavior.questionDetection || 'enhanced'
    const isQuestion = looksLikeQuestion(payload.last_assistant_message || '', questionMode)

    if (config.behavior.notifyOnQuestionOnlyForStop && !isQuestion) {
      return { shouldNotify: false, stopResponse: stopResponse(eventName) }
    }

    const sound = (rule && rule.sound) || config.notifier.stopSound || config.notifier.sound
    return {
      shouldNotify: true,
      title: renderTemplate(config.messages.stopTitle, context),
      subtitle: renderTemplate(isQuestion ? config.messages.questionSubtitle : config.messages.stopSubtitle, context),
      message: renderTemplate(isQuestion ? config.messages.questionBody : config.messages.stopBody, context),
      sound,
      eventName,
      sessionId,
      stopResponse: stopResponse(eventName)
    }
  }

  return { shouldNotify: false }
}

// --- Entry Point ---

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
    appendLog(config, `invalid_json ${error.message}`, {
      event: 'error',
      error: `invalid_json: ${error.message}`
    })
    return
  }

  const eventName = payload.hook_event_name || payload.hookEventName || 'unknown'
  const sessionId = payload.session_id || payload.sessionId || ''
  const toolName = payload.tool_name || payload.toolName || ''

  const result = handleHookPayload(payload, config, codexHome)

  // Check cooldown throttle
  if (result.shouldNotify && shouldThrottle(codexHome, sessionId, eventName, config.behavior.cooldownSeconds || 0)) {
    appendLog(config, `event=${eventName} throttled=true`, {
      event: eventName,
      session: sessionId,
      tool: toolName,
      notified: false,
      throttled: true
    })
  } else if (result.shouldNotify) {
    const sent = sendTerminalNotification(result, config)
    if (!sent.ok) {
      appendLog(config, `terminal_notifier_failed code=${sent.code ?? ''} error=${sent.error?.message ?? ''}`, {
        event: eventName,
        session: sessionId,
        tool: toolName,
        notified: false,
        result: 'notifier_failed',
        error: sent.error?.message || `exit ${sent.code}`
      })
      playFallbackSound()
    } else {
      appendLog(config, `event=${eventName} notify=true`, {
        event: eventName,
        session: sessionId,
        tool: toolName,
        toolInput: config.behavior.showToolInput === false ? 'input hidden' : summarizeToolInput(payload.tool_input || payload.toolInput),
        notified: true,
        result: 'ok'
      })
    }

    // Fire webhook (non-blocking, best-effort)
    sendWebhookNotification(result, config)
  } else {
    appendLog(config, `event=${eventName} notify=false`, {
      event: eventName,
      session: sessionId,
      tool: toolName,
      notified: false
    })
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
      appendLog(mergeConfig(), `fatal ${error.message}`, {
        event: 'fatal',
        error: error.message
      })
      process.exit(0)
    }
  })
}

module.exports = {
  DEFAULT_CONFIG,
  buildTemplateContext,
  buildWebhookPayload,
  findTerminalNotifier,
  handleHookPayload,
  looksLikeQuestion,
  matchRule,
  mergeConfig,
  parseMacIdleSeconds,
  renderTemplate,
  redactSensitive,
  shouldSendWebhook,
  shouldThrottle,
  summarizeToolInput,
  truncate
}
