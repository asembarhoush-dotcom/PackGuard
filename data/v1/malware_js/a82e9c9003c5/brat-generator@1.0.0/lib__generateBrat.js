'use strict'

const { renderCanvas } = require('./core')

/**
 * Generates a single "brat style" PNG image.
 * @param {object} opts
 * @param {string} opts.text - Text to render (required).
 * @param {'black'|'white'|'green'} [opts.theme='white'] - Color theme.
 * @param {0|1|2|3} [opts.blur=0] - Optional blur amount.
 * @returns {Promise<Buffer>} PNG image buffer.
 */
async function generateBrat({ text = 'Type Something', theme = 'white', blur = 0 } = {}) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('The "text" parameter is required and cannot be empty.')
  }
  const blurAmount = [0, 1, 2, 3].includes(Number(blur)) ? Number(blur) : 0
  const canvas = renderCanvas(text, theme, blurAmount)
  return canvas.encode('png')
}

module.exports = { generateBrat }
