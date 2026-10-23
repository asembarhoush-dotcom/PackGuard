import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline/promises'

export const TERMINAL_NOTIFIER_CANDIDATES = [
  '/opt/homebrew/bin/terminal-notifier',
  '/usr/local/bin/terminal-notifier'
]

export const BREW_CANDIDATES = [
  '/opt/homebrew/bin/brew',
  '/usr/local/bin/brew'
]

export function assertMacOS(platform = process.platform) {
  if (platform !== 'darwin') {
    throw new Error('codex-attention V1 supports macOS only.')
  }
}

export function findExecutable(name, { env = process.env, extraCandidates = [] } = {}) {
  const override = env[`CODEX_ATTENTION_${name.toUpperCase().replaceAll('-', '_')}`]
  if (override) return fs.existsSync(override) ? override : ''

  for (const dir of String(env.PATH || '').split(path.delimiter)) {
    if (!dir) continue
    const candidate = path.join(dir, name)
    if (fs.existsSync(candidate)) return candidate
  }

  return extraCandidates.find((candidate) => fs.existsSync(candidate)) || ''
}

export function findTerminalNotifier(env = process.env) {
  return findExecutable('terminal-notifier', {
    env,
    extraCandidates: TERMINAL_NOTIFIER_CANDIDATES
  })
}

export function findBrew(env = process.env) {
  return findExecutable('brew', {
    env,
    extraCandidates: BREW_CANDIDATES
  })
}

export async function ensureTerminalNotifier({ args = [], env = process.env } = {}) {
  const existing = findTerminalNotifier(env)
  if (existing) return { path: existing, installed: false }

  const noInstall = args.includes('--no-install-deps')
  const installWithoutPrompt = args.includes('--yes') || args.includes('--install-deps')
  if (noInstall) {
    return {
      path: '',
      installed: false,
      skipped: true,
      message: 'terminal-notifier is missing. Run: brew install terminal-notifier'
    }
  }

  const brew = findBrew(env)
  if (!brew) {
    throw new Error('terminal-notifier is missing and Homebrew was not found. Install Homebrew or run: brew install terminal-notifier')
  }

  if (!installWithoutPrompt) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      throw new Error('terminal-notifier is missing. Re-run with --yes to install it with Homebrew, or run: brew install terminal-notifier')
    }
    const approved = await promptYesNo('Install terminal-notifier with Homebrew now? [y/N] ')
    if (!approved) {
      throw new Error('terminal-notifier is required. Run: brew install terminal-notifier')
    }
  }

  const result = spawnSync(brew, ['install', 'terminal-notifier'], {
    stdio: 'inherit',
    env
  })
  if (result.status !== 0) {
    throw new Error('Homebrew failed to install terminal-notifier.')
  }

  const installed = findTerminalNotifier(env)
  if (!installed) {
    throw new Error('Homebrew completed but terminal-notifier was not found on PATH or known Homebrew paths.')
  }

  return { path: installed, installed: true }
}

async function promptYesNo(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = await rl.question(question)
    return ['y', 'yes'].includes(answer.trim().toLowerCase())
  } finally {
    rl.close()
  }
}
