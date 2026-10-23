export const MANAGED_HOOK_NAME = 'codex-attention'

export function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`
}

export function hookCommand({ nodePath, hookPath }) {
  return `${shellQuote(nodePath)} ${shellQuote(hookPath)}`
}

export function buildManagedHookEntry({ nodePath, hookPath, matcher = '*' }) {
  return {
    matcher,
    hooks: [
      {
        type: 'command',
        command: hookCommand({ nodePath, hookPath }),
        name: MANAGED_HOOK_NAME
      }
    ]
  }
}

export function isManagedHook(hook, hookPath = '') {
  const command = String(hook.command || '')
  return hook.name === MANAGED_HOOK_NAME ||
    command.includes('codex-attention-hook.cjs') ||
    Boolean(hookPath && command.includes(hookPath))
}

export function entryHasManagedHook(entry, hookPath = '') {
  return (entry.hooks || []).some((hook) => isManagedHook(hook, hookPath))
}

export function mergeHooksJson(existing = {}, { nodePath, hookPath }) {
  const next = structuredClone(existing)
  next.hooks ||= {}

  for (const eventName of ['PermissionRequest', 'Stop']) {
    next.hooks[eventName] ||= []
    if (!next.hooks[eventName].some((entry) => entryHasManagedHook(entry, hookPath))) {
      next.hooks[eventName].push(buildManagedHookEntry({ nodePath, hookPath }))
    }
  }

  return next
}

export function removeManagedHooks(existing = {}, hookPath = '') {
  const next = structuredClone(existing)
  if (!next.hooks) return next

  for (const [eventName, entries] of Object.entries(next.hooks)) {
    next.hooks[eventName] = entries
      .map((entry) => ({
        ...entry,
        hooks: (entry.hooks || []).filter((hook) => !isManagedHook(hook, hookPath))
      }))
      .filter((entry) => entry.hooks.length > 0)

    if (next.hooks[eventName].length === 0) {
      delete next.hooks[eventName]
    }
  }

  return next
}
