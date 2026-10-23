import fs from 'node:fs/promises'
import { expandHome } from './codexHome.js'

/**
 * Read the last N log entries from the structured JSON-lines log file.
 */
export async function readRecentLogs(logPath, count = 20) {
  const resolved = expandHome(logPath)
  let content
  try {
    content = await fs.readFile(resolved, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }

  const lines = content.trim().split('\n').filter(Boolean)
  const entries = []

  for (const line of lines.slice(-count)) {
    try {
      entries.push(JSON.parse(line))
    } catch {
      // Legacy text log line — wrap it
      entries.push({ ts: '', event: 'text', message: line })
    }
  }

  return entries
}

/**
 * Format a structured log entry for terminal display.
 */
export function formatLogEntry(entry) {
  const ts = entry.ts ? new Date(entry.ts).toLocaleString() : '?'
  const event = entry.event || '?'
  const tool = entry.tool || ''
  const notified = entry.notified ? '✓' : '✗'
  const detail = entry.toolInput || entry.error || entry.message || ''
  return `${ts}  ${pad(event, 18)}  ${notified}  ${pad(tool, 14)}  ${detail}`
}

function pad(str, len) {
  return String(str).padEnd(len)
}

export function formatLogHeader() {
  return `${'Time'.padEnd(24)}  ${'Event'.padEnd(18)}  ${'N'}  ${'Tool'.padEnd(14)}  Detail`
}
