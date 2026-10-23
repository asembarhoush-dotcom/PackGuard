'use strict'

/**
 * Brat API - Core Rendering Engine
 * -----------------------------------------------------------------------
 * Pure, self-contained canvas rendering logic. No external network calls
 * are made at runtime - the font is bundled locally inside /assets so
 * this module works fully offline (great for serverless cold starts).
 * -----------------------------------------------------------------------
 */

const { createCanvas, GlobalFonts } = require('@napi-rs/canvas')
const path = require('path')

const FONT_PATH = path.join(__dirname, '..', 'assets', 'ARIALN.ttf')
const FONT_FAMILY = 'ArialNarrow'

let fontRegistered = false

const THEMES = {
  black: { bg: '#000000', text: '#ffffff' },
  white: { bg: '#ffffff', text: '#000000' },
  green: { bg: '#8ace00', text: '#000000' }
}

function ensureFont() {
  if (fontRegistered) return
  GlobalFonts.registerFromPath(FONT_PATH, FONT_FAMILY)
  fontRegistered = true
}

function resolveTheme(theme) {
  return THEMES[theme] || THEMES.white
}

function wrapText(ctx, text, maxWidth, fontSize) {
  ctx.font = `${fontSize}px ${FONT_FAMILY}`
  const words = text.split(' ')
  const lines = []
  let current = ''

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)
  return lines
}

function fitsAt(ctx, text, fontSize, maxWidth, maxHeight, lineGap) {
  const lines = wrapText(ctx, text, maxWidth, fontSize)
  ctx.font = `${fontSize}px ${FONT_FAMILY}`
  const longestWord = Math.max(...text.split(' ').map(w => ctx.measureText(w).width))
  const totalHeight = lines.length * (fontSize + lineGap) - lineGap
  return longestWord <= maxWidth && totalHeight <= maxHeight
}

function findBestFontSize(ctx, text, maxWidth, maxHeight, lineGap) {
  let lo = 10
  let hi = 700
  let best = lo

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (fitsAt(ctx, text, mid, maxWidth, maxHeight, lineGap)) {
      best = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return best
}

/**
 * Renders a single 1000x1000 "brat style" canvas frame for the given text.
 * @param {string} text
 * @param {'black'|'white'|'green'} theme
 * @param {0|1|2|3} blurAmount
 * @returns {import('@napi-rs/canvas').Canvas}
 */
function renderCanvas(text, theme, blurAmount) {
  ensureFont()
  const selected = resolveTheme(theme)

  const size = 1000
  const padding = 80
  const lineGap = 20
  const maxWidth = size - padding * 2
  const maxHeight = size - padding * 2

  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = selected.bg
  ctx.fillRect(0, 0, size, size)

  if (!text || !text.trim()) return canvas

  const fontSize = findBestFontSize(ctx, text, maxWidth, maxHeight, lineGap)
  const lines = wrapText(ctx, text, maxWidth, fontSize)

  ctx.fillStyle = selected.text
  ctx.font = `${fontSize}px ${FONT_FAMILY}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'

  ctx.save()
  if (blurAmount > 0) ctx.filter = `blur(${blurAmount}px)`

  const totalTextHeight = lines.length * (fontSize + lineGap) - lineGap
  let y = (size - totalTextHeight) / 2
  for (const line of lines) {
    ctx.fillText(line, padding, y)
    y += fontSize + lineGap
  }

  ctx.restore()
  return canvas
}

module.exports = { THEMES, renderCanvas, ensureFont }
