/**
 * Webhook notifier for sending notifications to Slack, Discord, or custom endpoints.
 * Uses native fetch (Node 20+).
 */

export function buildWebhookPayload({ title, subtitle, message, eventName, sessionId }, format = 'slack') {
  const fullText = [title, subtitle, message].filter(Boolean).join(' — ')

  if (format === 'discord') {
    return { content: fullText }
  }

  if (format === 'raw') {
    return {
      title: title || '',
      subtitle: subtitle || '',
      message: message || '',
      event: eventName || '',
      session: sessionId || '',
      timestamp: new Date().toISOString()
    }
  }

  // Slack format (default)
  return {
    text: fullText,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${title || 'Codex'}*${subtitle ? `\n${subtitle}` : ''}\n${message || ''}`
        }
      }
    ]
  }
}

export async function sendWebhookNotification({ title, subtitle, message, eventName, sessionId }, config) {
  if (!config.notifier.webhookEnabled || !config.notifier.webhookUrl) {
    return { ok: false, skipped: true }
  }

  const format = config.notifier.webhookFormat || 'slack'
  const payload = buildWebhookPayload({ title, subtitle, message, eventName, sessionId }, format)

  try {
    const response = await fetch(config.notifier.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000)
    })

    return {
      ok: response.ok,
      status: response.status,
      error: response.ok ? null : new Error(`HTTP ${response.status}`)
    }
  } catch (error) {
    return { ok: false, error }
  }
}
