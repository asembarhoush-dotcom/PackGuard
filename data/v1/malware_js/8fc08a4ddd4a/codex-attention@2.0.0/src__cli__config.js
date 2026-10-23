import fs from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { resolveCodexHome } from '../lib/codexHome.js'
import { readAttentionConfig, DEFAULT_CONFIG, mergeConfig } from '../lib/configFile.js'
import { dim, green, bold, red, yellow } from '../lib/cliColors.js'

const PRESETS = {
  minimal: {
    events: { permissionRequest: true, stop: false },
    behavior: { notifyOnQuestionOnlyForStop: true, cooldownSeconds: 0 }
  },
  balanced: {
    events: { permissionRequest: true, stop: true },
    behavior: { notifyOnQuestionOnlyForStop: false, cooldownSeconds: 3 }
  },
  verbose: {
    events: { permissionRequest: true, stop: true },
    behavior: { notifyOnQuestionOnlyForStop: false, cooldownSeconds: 0 }
  }
}

export async function config(args = []) {
  const sub = args[0]
  if (sub === 'show') return configShow()
  if (sub === 'set') return configSet(args.slice(1))
  if (sub === 'preset') return configPreset(args.slice(1))
  if (sub === 'reset') return configReset()
  if (sub === 'edit') return configEdit()
  if (sub === 'path') return configPath()
  configUsage()
}

async function configShow() {
  const codexHome = resolveCodexHome()
  const config = await readAttentionConfig(codexHome)
  console.log(bold('codex-attention config'))
  console.log(dim(`  path: ${codexHome}/codex-attention.json`))
  console.log()
  printConfig(config, DEFAULT_CONFIG)
}

function printConfig(config, defaults, prefix = '') {
  for (const [key, value] of Object.entries(config)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      console.log(`${dim('─')} ${bold(fullKey)}`)
      printConfig(value, defaults[key] || {}, fullKey)
    } else {
      const defaultVal = defaults[key]
      const isDefault = JSON.stringify(value) === JSON.stringify(defaultVal)
      const displayValue = Array.isArray(value) ? JSON.stringify(value) : String(value)
      if (isDefault) {
        console.log(`  ${dim(fullKey)} = ${dim(displayValue)}`)
      } else {
        console.log(`  ${green(fullKey)} = ${bold(displayValue)}`)
      }
    }
  }
}

async function configSet(args) {
  if (args.length < 2) {
    console.error(red('Usage: codex-attention config set <key> <value>'))
    console.error(dim('  Example: codex-attention config set notifier.sound Glass'))
    console.error(dim('  Example: codex-attention config set behavior.cooldownSeconds 5'))
    process.exitCode = 1
    return
  }

  const codexHome = resolveCodexHome()
  const configPath = `${codexHome}/codex-attention.json`
  const [key, ...rest] = args
  const rawValue = rest.join(' ')

  // Parse value
  let value
  if (rawValue === 'true') value = true
  else if (rawValue === 'false') value = false
  else if (/^-?\d+$/.test(rawValue)) value = Number(rawValue)
  else if (/^-?\d+\.\d+$/.test(rawValue)) value = Number(rawValue)
  else value = rawValue

  // Validate key exists in defaults
  const parts = key.split('.')
  let target = DEFAULT_CONFIG
  for (const part of parts) {
    if (target && typeof target === 'object' && part in target) {
      target = target[part]
    } else {
      console.log(yellow(`⚠ Unknown config key: ${key}`))
      console.log(dim('  This key is not in the default config. Setting it anyway.'))
      break
    }
  }

  const config = await readRawConfig(configPath)

  // Set nested key
  let obj = config
  for (let i = 0; i < parts.length - 1; i++) {
    if (!obj[parts[i]] || typeof obj[parts[i]] !== 'object') {
      obj[parts[i]] = {}
    }
    obj = obj[parts[i]]
  }
  obj[parts[parts.length - 1]] = value

  await fs.mkdir(codexHome, { recursive: true })
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
  console.log(green(`✓ Set ${key} = ${JSON.stringify(value)}`))
}

async function configPreset(args) {
  const name = args[0]
  if (!name || !PRESETS[name]) {
    console.error(red('Usage: codex-attention config preset <minimal|balanced|verbose>'))
    process.exitCode = 1
    return
  }

  const codexHome = resolveCodexHome()
  const configPath = `${codexHome}/codex-attention.json`
  const existing = await readRawConfig(configPath)
  const next = mergeConfig(deepMerge(existing, PRESETS[name]))

  await fs.mkdir(codexHome, { recursive: true })
  await fs.writeFile(configPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  console.log(green(`✓ Applied ${name} preset`))
}

async function configReset() {
  const codexHome = resolveCodexHome()
  const configPath = `${codexHome}/codex-attention.json`

  // Back up existing
  try {
    await fs.copyFile(configPath, `${configPath}.bak.${Date.now()}`)
    console.log(dim(`  Backed up existing config`))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  await fs.mkdir(codexHome, { recursive: true })
  await fs.writeFile(configPath, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, 'utf8')
  console.log(green('✓ Config reset to defaults'))
  console.log(dim(`  ${configPath}`))
}

async function configEdit() {
  const codexHome = resolveCodexHome()
  const configPath = `${codexHome}/codex-attention.json`
  const editor = process.env.EDITOR || process.env.VISUAL || 'nano'
  await fs.mkdir(codexHome, { recursive: true })
  try {
    await fs.access(configPath)
  } catch {
    await fs.writeFile(configPath, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, 'utf8')
  }
  console.log(dim(`Opening ${configPath} in ${editor}…`))
  const result = spawnSync(editor, [configPath], { stdio: 'inherit' })
  if (result.status !== 0) {
    console.error(red(`Editor exited with code ${result.status}`))
    process.exitCode = 1
  }
}

async function configPath() {
  const codexHome = resolveCodexHome()
  console.log(`${codexHome}/codex-attention.json`)
}

function configUsage() {
  console.log(`Usage: codex-attention config <subcommand>

Subcommands:
  show    Display current configuration (overrides highlighted)
  set     Set a config value: config set <key> <value>
  preset  Apply a preset: minimal, balanced, or verbose
  reset   Restore config to defaults
  edit    Open config in $EDITOR
  path    Print config file path`)
}

async function readRawConfig(configPath) {
  try {
    return JSON.parse(await fs.readFile(configPath, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return {}
    throw error
  }
}

function deepMerge(base, override) {
  const next = { ...base }
  for (const [key, value] of Object.entries(override)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      next[key] = deepMerge(next[key] && typeof next[key] === 'object' ? next[key] : {}, value)
    } else {
      next[key] = value
    }
  }
  return next
}
