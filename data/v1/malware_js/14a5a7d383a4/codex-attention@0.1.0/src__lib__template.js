import os from 'node:os'
import { shortenHome } from './codexHome.js'

export function buildTemplateContext(payload = {}) {
  const cwd = payload.cwd || ''
  return {
    eventName: payload.hook_event_name || payload.hookEventName || 'unknown',
    sessionId: payload.session_id || payload.sessionId || '',
    cwd,
    cwdShort: shortenHome(cwd, os.homedir()),
    toolName: payload.tool_name || payload.toolName || 'tool'
  }
}

export function renderTemplate(template, context) {
  return String(template).replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, key) => {
    return context[key] == null ? '' : String(context[key])
  })
}

export function looksLikeQuestion(message = '') {
  return String(message).trim().endsWith('?')
}
