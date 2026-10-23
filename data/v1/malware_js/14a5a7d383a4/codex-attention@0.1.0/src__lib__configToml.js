export function ensureCodexHooksEnabled(tomlText = '') {
  const lines = tomlText.split(/\r?\n/)
  const featuresIndex = lines.findIndex((line) => line.trim() === '[features]')

  if (featuresIndex === -1) {
    const prefix = tomlText.trimEnd()
    return `${prefix}${prefix ? '\n\n' : ''}[features]\ncodex_hooks = true\n`
  }

  let sectionEnd = lines.length
  for (let index = featuresIndex + 1; index < lines.length; index += 1) {
    if (/^\s*\[.*\]\s*$/.test(lines[index])) {
      sectionEnd = index
      break
    }
  }

  for (let index = featuresIndex + 1; index < sectionEnd; index += 1) {
    if (/^\s*codex_hooks\s*=/.test(lines[index])) {
      lines[index] = 'codex_hooks = true'
      return `${lines.join('\n').replace(/\n*$/, '')}\n`
    }
  }

  let insertIndex = sectionEnd
  while (insertIndex > featuresIndex + 1 && lines[insertIndex - 1].trim() === '') {
    insertIndex -= 1
  }
  lines.splice(insertIndex, 0, 'codex_hooks = true')
  return `${lines.join('\n').replace(/\n*$/, '')}\n`
}
