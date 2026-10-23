import { DEFAULT_CONFIG, readAttentionConfig } from '../lib/configFile.js'
import { resolveCodexHome } from '../lib/codexHome.js'
import { buildTemplateContext, looksLikeQuestion, renderTemplate } from '../lib/template.js'
import { bold, dim } from '../lib/cliColors.js'

export async function preview(args = []) {
  const kind = args[0]
  if (!['approval', 'stop'].includes(kind)) {
    previewUsage()
    process.exitCode = 1
    return
  }

  const codexHome = resolveCodexHome()
  let config = DEFAULT_CONFIG
  try {
    config = await readAttentionConfig(codexHome)
  } catch {
    config = DEFAULT_CONFIG
  }

  const cwd = readFlagValue(args, '--cwd') || process.cwd()
  const payload = kind === 'approval'
    ? {
        hook_event_name: 'PermissionRequest',
        session_id: 'preview',
        cwd,
        tool_name: readFlagValue(args, '--tool') || 'Bash',
        tool_input: { command: readFlagValue(args, '--input') || 'npm test' }
      }
    : {
        hook_event_name: 'Stop',
        session_id: 'preview',
        cwd,
        last_assistant_message: readFlagValue(args, '--message') || 'Should I continue?'
      }

  const context = buildTemplateContext(payload, {
    showToolInput: config.behavior.showToolInput !== false
  })

  let title
  let subtitle
  let message
  if (kind === 'approval') {
    title = renderTemplate(config.messages.permissionTitle, context)
    subtitle = renderTemplate(config.messages.permissionSubtitle, context)
    message = renderTemplate(config.messages.permissionBody, context)
  } else {
    const isQuestion = looksLikeQuestion(payload.last_assistant_message, config.behavior.questionDetection)
    title = renderTemplate(config.messages.stopTitle, context)
    subtitle = renderTemplate(isQuestion ? config.messages.questionSubtitle : config.messages.stopSubtitle, context)
    message = renderTemplate(isQuestion ? config.messages.questionBody : config.messages.stopBody, context)
  }

  console.log(bold('codex-attention preview'))
  console.log(dim('No notification was sent.'))
  console.log()
  console.log(title)
  if (subtitle) console.log(subtitle)
  console.log(message)
}

function readFlagValue(args, flagName) {
  const index = args.indexOf(flagName)
  return index === -1 ? null : args[index + 1]
}

function previewUsage() {
  console.log(`Usage: codex-attention preview <approval|stop> [options]

Options:
  --cwd <path>       Workspace path to show
  --tool <name>      Tool name for approval preview
  --input <text>     Tool input for approval preview
  --message <text>   Last assistant message for stop preview`)
}
