import fs from 'node:fs/promises'
import path from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { assertMacOS, ensureTerminalNotifier } from '../lib/dependencies.js'
import { resolveCodexHome } from '../lib/codexHome.js'
import { writeDefaultConfig } from '../lib/configFile.js'
import { ensureCodexHooksEnabled } from '../lib/configToml.js'
import { mergeHooksJson } from '../lib/hooksJson.js'
import { bold, dim, green, yellow, cyan } from '../lib/cliColors.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = path.resolve(__dirname, '../..')

const KNOWN_TERMINALS = [
  { env: 'iTerm.app', id: 'com.googlecode.iterm2', name: 'iTerm2' },
  { env: 'Apple_Terminal', id: 'com.apple.Terminal', name: 'Terminal.app' },
  { env: 'WarpTerminal', id: 'dev.warp.Warp-Stable', name: 'Warp' },
  { env: 'vscode', id: 'com.microsoft.VSCode', name: 'VS Code' },
  { env: 'Alacritty', id: 'org.alacritty', name: 'Alacritty' },
  { env: 'Hyper', id: 'co.zeit.hyper', name: 'Hyper' }
]

const MAC_SOUNDS = ['Basso', 'Blow', 'Bottle', 'Frog', 'Funk', 'Glass', 'Hero', 'Morse', 'Ping', 'Pop', 'Purr', 'Sosumi', 'Submarine', 'Tink']

export async function install(args = []) {
  assertMacOS()

  const dryRun = args.includes('--dry-run')
  const nonInteractive = args.includes('--yes') || args.includes('--no-install-deps') || !process.stdin.isTTY
  const codexHome = resolveCodexHome()
  const hooksDir = path.join(codexHome, 'hooks')
  const hookPath = path.join(hooksDir, 'codex-attention-hook.cjs')
  const sourceHook = path.join(PACKAGE_ROOT, 'src/hook/codex-attention-hook.cjs')
  const hooksPath = path.join(codexHome, 'hooks.json')
  const configTomlPath = path.join(codexHome, 'config.toml')
  const configPath = path.join(codexHome, 'codex-attention.json')

  // --- Gather preferences ---
  let activateBundleId = readFlagValue(args, '--activate-bundle-id')
  let terminalName = ''
  let enableSound = true
  let permissionSound = 'Basso'
  let stopSound = 'Ping'
  let usedInteractiveSetup = false

  if (!nonInteractive && !activateBundleId) {
    const prefs = await interactiveSetup()
    usedInteractiveSetup = true
    activateBundleId = prefs.bundleId
    terminalName = prefs.terminalName
    enableSound = prefs.enableSound
    permissionSound = prefs.permissionSound
    stopSound = prefs.stopSound
  } else if (!activateBundleId) {
    activateBundleId = detectTerminalBundleId()
  }

  // --- Dry run ---
  if (dryRun) {
    console.log(bold('codex-attention install (dry run)'))
    console.log()
    console.log('Would perform the following:')
    console.log(`  ${green('•')} Copy hook script to ${dim(hookPath)}`)
    console.log(`  ${green('•')} Write config to ${dim(configPath)}`)
    console.log(`  ${green('•')} Update hooks.json at ${dim(hooksPath)} (add PermissionRequest + Stop entries)`)
    console.log(`  ${green('•')} Enable codex_hooks in ${dim(configTomlPath)}`)
    if (activateBundleId) {
      console.log(`  ${green('•')} Terminal: ${dim(terminalName || activateBundleId)}`)
    }
    console.log(`  ${green('•')} Sounds: ${dim(enableSound ? `approval=${permissionSound}, stop=${stopSound}` : 'disabled')}`)
    console.log()
    console.log(yellow('No changes were made (dry run).'))
    return
  }

  // --- Install dependencies ---
  const dependency = await ensureTerminalNotifier({ args })

  // --- Write files ---
  const existingHooks = await readJsonIfExists(hooksPath)

  await fs.mkdir(hooksDir, { recursive: true })
  await fs.copyFile(sourceHook, hookPath)
  await fs.chmod(hookPath, 0o755)

  const configOverrides = {
    notifier: {
      activateBundleId: activateBundleId || '',
      activateOnClick: Boolean(activateBundleId),
      sound: enableSound ? 'Ping' : '',
      permissionSound: enableSound ? permissionSound : '',
      stopSound: enableSound ? stopSound : ''
    }
  }
  await writeDefaultConfig(codexHome, configOverrides, {
    applyOverridesToExisting: usedInteractiveSetup
  })

  await patchHooksJson(hooksPath, existingHooks, { nodePath: process.execPath, hookPath })
  await patchConfigToml(codexHome)

  if (dependency.skipped) {
    console.log(yellow(dependency.message))
  }

  console.log()
  console.log(green('✓') + bold(' Installed Codex Attention') + dim(` in ${codexHome}`))
  console.log()
  console.log('  Next steps:')
  console.log(`  ${dim('1.')} Close and reopen any running Codex CLI sessions so hooks reload.`)
  console.log(`  ${dim('2.')} Verify: ${green('npx codex-attention@latest doctor --send-test')}`)
}

// --- Interactive Setup ---

async function interactiveSetup() {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    console.log()
    console.log(bold('codex-attention setup'))
    console.log()

    // 1. Terminal app
    const detected = detectTerminalInfo()
    let bundleId = ''
    let terminalName = ''

    if (detected) {
      const answer = await rl.question(`  Terminal detected: ${cyan(detected.name)} (${dim(detected.id)})\n  Use this? [Y/n] `)
      if (!answer.trim() || ['y', 'yes'].includes(answer.trim().toLowerCase())) {
        bundleId = detected.id
        terminalName = detected.name
      }
    }

    if (!bundleId) {
      console.log(dim('  Known terminals:'))
      for (let i = 0; i < KNOWN_TERMINALS.length; i++) {
        console.log(dim(`    ${i + 1}. ${KNOWN_TERMINALS[i].name} (${KNOWN_TERMINALS[i].id})`))
      }
      const choice = await rl.question('  Enter number or bundle ID (leave empty to skip): ')
      const trimmed = choice.trim()
      if (trimmed) {
        const num = Number(trimmed)
        if (num >= 1 && num <= KNOWN_TERMINALS.length) {
          bundleId = KNOWN_TERMINALS[num - 1].id
          terminalName = KNOWN_TERMINALS[num - 1].name
        } else {
          bundleId = trimmed
          terminalName = trimmed
        }
      }
    }

    console.log()

    // 2. Sound preferences
    const soundAnswer = await rl.question(`  Enable notification sounds? [Y/n] `)
    const enableSound = !soundAnswer.trim() || ['y', 'yes'].includes(soundAnswer.trim().toLowerCase())

    let permissionSound = 'Basso'
    let stopSound = 'Ping'

    if (enableSound) {
      console.log(dim(`  Available sounds: ${MAC_SOUNDS.join(', ')}`))
      const permAnswer = await rl.question(`  Sound for approval requests [${cyan('Basso')}]: `)
      if (permAnswer.trim()) permissionSound = permAnswer.trim()

      const stopAnswer = await rl.question(`  Sound for turn completions [${cyan('Ping')}]: `)
      if (stopAnswer.trim()) stopSound = stopAnswer.trim()
    }

    console.log()

    return { bundleId, terminalName, enableSound, permissionSound, stopSound }
  } finally {
    rl.close()
  }
}

function detectTerminalInfo(env = process.env) {
  const termProgram = env.TERM_PROGRAM
  if (!termProgram) return null
  return KNOWN_TERMINALS.find((t) => t.env === termProgram) || null
}

function detectTerminalBundleId(env = process.env) {
  const info = detectTerminalInfo(env)
  return info ? info.id : ''
}

// --- File Operations ---

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
