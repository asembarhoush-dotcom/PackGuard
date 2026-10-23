import fs from 'node:fs/promises'
import path from 'node:path'
import { resolveCodexHome } from '../lib/codexHome.js'
import { removeManagedHooks } from '../lib/hooksJson.js'

export async function uninstall() {
  const codexHome = resolveCodexHome()
  const hooksPath = path.join(codexHome, 'hooks.json')
  const hookPath = path.join(codexHome, 'hooks/codex-attention-hook.cjs')

  try {
    const existing = JSON.parse(await fs.readFile(hooksPath, 'utf8'))
    const next = removeManagedHooks(existing, hookPath)
    await fs.copyFile(hooksPath, `${hooksPath}.bak.${Date.now()}`)
    await fs.writeFile(hooksPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  try {
    await fs.rm(hookPath)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  console.log('Removed Codex Attention hook commands and hook script.')
  console.log('Left ~/.codex/codex-attention.json and config.toml in place for safety.')
}
