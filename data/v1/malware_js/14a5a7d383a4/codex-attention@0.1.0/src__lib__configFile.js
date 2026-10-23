import fs from 'node:fs/promises'
import path from 'node:path'
import { expandHome } from './codexHome.js'

export const DEFAULT_CONFIG = {
  enabled: true,
  events: {
    permissionRequest: true,
    stop: true
  },
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

export function mergeConfig(userConfig = {}) {
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

export async function readAttentionConfig(codexHome) {
  const configPath = path.join(codexHome, 'codex-attention.json')
  try {
    const raw = await fs.readFile(configPath, 'utf8')
    return mergeConfig(JSON.parse(raw))
  } catch (error) {
    if (error.code === 'ENOENT') return mergeConfig()
    throw new Error(`Invalid codex-attention config at ${configPath}: ${error.message}`)
  }
}

export async function writeDefaultConfig(codexHome, overrides = {}) {
  const configPath = path.join(codexHome, 'codex-attention.json')
  await fs.mkdir(codexHome, { recursive: true })

  let existing = null
  try {
    existing = JSON.parse(await fs.readFile(configPath, 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new Error(`Invalid codex-attention config at ${configPath}: ${error.message}`)
    }
  }

  const config = existing ? mergeConfig(existing) : mergeConfig(overrides)
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
  return configPath
}

export function resolvedLogPath(config) {
  return expandHome(config.logging.path)
}
