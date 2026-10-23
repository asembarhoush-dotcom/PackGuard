import fs from 'node:fs/promises'
import path from 'node:path'
import { expandHome } from './codexHome.js'

export async function appendLog(config, message) {
  if (!config.logging?.enabled) return
  const logPath = expandHome(config.logging.path)
  await fs.mkdir(path.dirname(logPath), { recursive: true })
  await fs.appendFile(logPath, `${new Date().toISOString()} ${message}\n`, 'utf8')
}
