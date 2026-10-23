import os from 'node:os'
import path from 'node:path'

export function resolveCodexHome(env = process.env) {
  return env.CODEX_HOME || path.join(os.homedir(), '.codex')
}

export function expandHome(input, home = os.homedir()) {
  if (!input || input === '~') return home
  if (input.startsWith('~/')) return path.join(home, input.slice(2))
  return input
}

export function shortenHome(input, home = os.homedir()) {
  if (!input) return 'unknown workspace'
  return input.startsWith(home) ? `~${input.slice(home.length)}` : input
}
