import os from 'node:os'
import path from 'node:path'
import { shortenHome } from './codexHome.js'

/**
 * Intelligently summarize tool_input into a short human-readable string.
 * Handles common Codex tool input shapes: Bash commands, file paths, patches.
 */
export function summarizeToolInput(toolInput, { maxLength = 80 } = {}) {
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

  // String input — try to extract a filename from an apply_patch-like string
  if (typeof toolInput === 'string') {
    // Look for file paths in the first line
    const firstLine = toolInput.split('\n')[0]
    const fileMatch = firstLine.match(/(?:^|\s)((?:\/|\.\/|\.\.\/)?[\w./-]+\.\w+)/)
    if (fileMatch) {
      return `modifying ${path.basename(fileMatch[1])}`
    }
    return truncate(redactSensitive(firstLine), maxLength)
  }

  // Object fallback — JSON.stringify
  if (typeof toolInput === 'object') {
    return truncate(redactSensitive(JSON.stringify(toolInput)), maxLength)
  }

  return truncate(redactSensitive(toolInput), maxLength)
}

export function truncate(str, maxLength = 80) {
  if (!str) return ''
  const s = String(str).trim()
  return s.length <= maxLength ? s : `${s.slice(0, maxLength - 1)}…`
}

export function redactSensitive(input) {
  return String(input)
    .replace(/\b([A-Z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|PASS|AUTHORIZATION|COOKIE)[A-Z0-9_]*)\s*=\s*("[^"]*"|'[^']*'|[^\s]+)/gi, '$1=<redacted>')
    .replace(/(^|\s)(--?(?:api-key|apikey|token|secret|password|pass|auth|authorization|cookie))(\s+|=)("[^"]*"|'[^']*'|[^\s]+)/gi, '$1$2$3<redacted>')
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 <redacted>')
}

export function buildTemplateContext(payload = {}, { showToolInput = true } = {}) {
  const cwd = payload.cwd || ''
  const toolInput = payload.tool_input || payload.toolInput || null
  const lastMessage = redactSensitive(payload.last_assistant_message || '')
  const toolInputText = toolInput ? redactSensitive(typeof toolInput === 'string' ? toolInput : JSON.stringify(toolInput)) : ''

  return {
    eventName: payload.hook_event_name || payload.hookEventName || 'unknown',
    sessionId: payload.session_id || payload.sessionId || '',
    cwd,
    cwdShort: shortenHome(cwd, os.homedir()),
    toolName: payload.tool_name || payload.toolName || 'tool',
    projectName: cwd ? path.basename(cwd) : 'Codex',
    model: payload.model || '',
    toolInput: showToolInput ? truncate(toolInputText, 200) : '',
    toolInputShort: showToolInput ? summarizeToolInput(toolInput) : 'input hidden',
    lastMessage: truncate(lastMessage, 200),
    lastMessageShort: truncate(lastMessage, 80)
  }
}

export function renderTemplate(template, context) {
  return String(template).replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, key) => {
    return context[key] == null ? '' : String(context[key])
  })
}

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

export function looksLikeQuestion(message = '', mode = 'enhanced') {
  const text = String(message).trim()
  if (!text) return false

  // Basic mode: only check if the entire message ends with ?
  if (mode === 'basic') {
    return text.endsWith('?')
  }

  // Enhanced mode: check all lines for ?, match question phrases, detect option lists
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
