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

export async function writeDefaultConfig(codexHome, overrides = {}, options = {}) {
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

  const config = existing
    ? mergeConfig(options.applyOverridesToExisting ? mergePlainObjects(existing, overrides) : existing)
    : mergeConfig(overrides)
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
  return configPath
}

function mergePlainObjects(base, override) {
  const next = { ...base }
  for (const [key, value] of Object.entries(override)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      next[key] = mergePlainObjects(
        next[key] && typeof next[key] === 'object' && !Array.isArray(next[key]) ? next[key] : {},
        value
      )
    } else {
      next[key] = value
    }
  }
  return next
}

export function resolvedLogPath(config) {
  return expandHome(config.logging.path)
}
