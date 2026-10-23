import fs from 'node:fs/promises'
import path from 'node:path'
import { resolveCodexHome, expandHome } from '../lib/codexHome.js'
import { readAttentionConfig } from '../lib/configFile.js'
import { readRecentLogs, formatLogEntry, formatLogHeader } from '../lib/log.js'
import { dim, green, red, bold, yellow } from '../lib/cliColors.js'

export async function logCommand(args = []) {
  const codexHome = resolveCodexHome()
  const config = await readAttentionConfig(codexHome)
  const logPath = config.logging.path

  if (args.includes('--clear')) {
    return clearLog(logPath)
  }

  const asJson = args.includes('--json')
  const sessionFilter = readFlagValue(args, '--session')
  const countFlag = readFlagValue(args, '-n')
  const count = countFlag ? Number(countFlag) : 20

  const entries = await readRecentLogs(logPath, count * 2) // read extra for filtering

  let filtered = entries
  if (sessionFilter) {
    filtered = entries.filter((e) => e.session && e.session.includes(sessionFilter))
  }
  filtered = filtered.slice(-count)

  if (filtered.length === 0) {
    console.log(dim('No log entries found.'))
    console.log(dim(`Log path: ${expandHome(logPath)}`))
    return
  }

  if (asJson) {
    for (const entry of filtered) {
      console.log(JSON.stringify(entry))
    }
    return
  }

  console.log(bold('codex-attention log'))
  console.log(dim(`  ${expandHome(logPath)}`))
  console.log()
  console.log(dim(formatLogHeader()))
  console.log(dim('─'.repeat(80)))
  for (const entry of filtered) {
    const line = formatLogEntry(entry)
    if (entry.notified) {
      console.log(green(line))
    } else if (entry.error) {
      console.log(red(line))
    } else if (entry.throttled) {
      console.log(yellow(line))
    } else {
      console.log(dim(line))
    }
  }
  console.log(dim(`\n${filtered.length} entries shown`))
}

async function clearLog(logPath) {
  const resolved = expandHome(logPath)
  try {
    await fs.mkdir(path.dirname(resolved), { recursive: true })
    await fs.writeFile(resolved, '', 'utf8')
    console.log(green('✓ Log cleared'))
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log(dim('Log file does not exist.'))
    } else {
      throw error
    }
  }
}

function readFlagValue(args, flagName) {
  const index = args.indexOf(flagName)
  return index === -1 ? null : args[index + 1]
}
