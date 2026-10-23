import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertMacOS, ensureTerminalNotifier } from '../lib/dependencies.js'
import { resolveCodexHome } from '../lib/codexHome.js'
import { writeDefaultConfig } from '../lib/configFile.js'
import { ensureCodexHooksEnabled } from '../lib/configToml.js'
import { mergeHooksJson } from '../lib/hooksJson.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = path.resolve(__dirname, '../..')

export async function install(args = []) {
  assertMacOS()
  const dependency = await ensureTerminalNotifier({ args })

  const codexHome = resolveCodexHome()
  const hooksDir = path.join(codexHome, 'hooks')
  const hookPath = path.join(hooksDir, 'codex-attention-hook.cjs')
  const sourceHook = path.join(PACKAGE_ROOT, 'src/hook/codex-attention-hook.cjs')
  const hooksPath = path.join(codexHome, 'hooks.json')
  const existingHooks = await readJsonIfExists(hooksPath)

  await fs.mkdir(hooksDir, { recursive: true })
  await fs.copyFile(sourceHook, hookPath)
  await fs.chmod(hookPath, 0o755)

  const activateBundleId = readFlagValue(args, '--activate-bundle-id') || detectTerminalBundleId()
  await writeDefaultConfig(codexHome, {
    notifier: {
      activateBundleId,
      activateOnClick: Boolean(activateBundleId)
    }
  })

  await patchHooksJson(hooksPath, existingHooks, { nodePath: process.execPath, hookPath })
  await patchConfigToml(codexHome)

  if (dependency.skipped) {
    console.log(dependency.message)
  }

  console.log(`Installed Codex Attention in ${codexHome}`)
  console.log('Restart Codex, then run: codex-attention doctor --send-test')
}

async function patchHooksJson(hooksPath, existingHooks, hookSpec) {
  const next = mergeHooksJson(existingHooks, hookSpec)
  await backupIfExists(hooksPath)
  await fs.writeFile(hooksPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
}

async function patchConfigToml(codexHome) {
  const configPath = path.join(codexHome, 'config.toml')
  let existing = ''
  try {
    existing = await fs.readFile(configPath, 'utf8')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  await backupIfExists(configPath)
  await fs.writeFile(configPath, ensureCodexHooksEnabled(existing), 'utf8')
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return {}
    throw new Error(`Invalid JSON in ${filePath}: ${error.message}`)
  }
}

async function backupIfExists(filePath) {
  try {
    await fs.copyFile(filePath, `${filePath}.bak.${Date.now()}`)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

function readFlagValue(args, flagName) {
  const index = args.indexOf(flagName)
  return index === -1 ? null : args[index + 1]
}

function detectTerminalBundleId(env = process.env) {
  if (env.TERM_PROGRAM === 'iTerm.app') return 'com.googlecode.iterm2'
  if (env.TERM_PROGRAM === 'Apple_Terminal') return 'com.apple.Terminal'
  return ''
}
