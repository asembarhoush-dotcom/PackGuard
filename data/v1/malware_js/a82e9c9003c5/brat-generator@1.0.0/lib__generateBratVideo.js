'use strict'

const { renderCanvas } = require('./core')
const { writeFileSync, mkdtempSync, rmSync, readFileSync } = require('fs')
const path = require('path')
const os = require('os')
const { execFile } = require('child_process')
const { promisify } = require('util')
const execFileAsync = promisify(execFile)

let ffmpegPath
try {
  ffmpegPath = require('ffmpeg-static')
} catch {
  ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg'
}

function tokenize(text) {
  return text.split(' ').filter(Boolean)
}

/**
 * Generates an animated "brat style" video (mp4 or gif), revealing the
 * text word by word, matching the classic brat generator effect.
 *
 * @param {object} opts
 * @param {string} opts.text - Text to render (required).
 * @param {'black'|'white'|'green'} [opts.theme='white']
 * @param {0|1|2|3} [opts.blur=0]
 * @param {'mp4'|'gif'} [opts.format='mp4']
 * @param {number} [opts.frameDuration=0.35] - Seconds per revealed word.
 * @param {number} [opts.holdDuration=1.2] - Seconds to hold the final frame.
 * @param {number} [opts.maxWordPerLayer=1] - Words revealed per frame step.
 * @param {number|number[]} [opts.maxWordBeforeReset=0] - Reset the reveal
 *        after N words (0 = never reset). Can be an array for custom batches.
 * @returns {Promise<{buffer: Buffer, format: string, mimeType: string}>}
 */
async function generateBratVideo({
  text = 'Type Something',
  theme = 'white',
  blur = 0,
  format = 'mp4',
  frameDuration = 0.35,
  holdDuration = 1.2,
  maxWordPerLayer = 1,
  maxWordBeforeReset = 0
} = {}) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('The "text" parameter is required and cannot be empty.')
  }

  const blurAmount = [0, 1, 2, 3].includes(Number(blur)) ? Number(blur) : 0
  const step = Math.max(1, Number(maxWordPerLayer) || 1)
  const resetSchedule = Array.isArray(maxWordBeforeReset)
    ? maxWordBeforeReset.map(n => Math.max(0, n))
    : [Math.max(0, Number(maxWordBeforeReset) || 0)]
  const getResetAt = batchIndex => resetSchedule[batchIndex % resetSchedule.length]

  const tokens = tokenize(text)
  if (!tokens.length) throw new Error('Text is empty after tokenizing.')

  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'brat-'))

  try {
    const partialTexts = []
    let batchStart = 0
    let batchIndex = 0
    while (batchStart < tokens.length) {
      const resetAt = getResetAt(batchIndex)
      const batchEnd = resetAt > 0 ? Math.min(batchStart + resetAt, tokens.length) : tokens.length
      for (let i = batchStart + step; i < batchEnd; i += step) {
        partialTexts.push(tokens.slice(batchStart, i).join(' '))
      }
      partialTexts.push(tokens.slice(batchStart, batchEnd).join(' '))
      batchStart = batchEnd
      batchIndex++
    }

    const framePaths = []
    for (let i = 0; i < partialTexts.length; i++) {
      const canvas = renderCanvas(partialTexts[i], theme, blurAmount)
      const buffer = await canvas.encode('png')
      const framePath = path.join(tmpDir, `frame-${String(i + 1).padStart(4, '0')}.png`)
      writeFileSync(framePath, buffer)
      framePaths.push(framePath)
    }

    const durations = framePaths.map((_, i) => (i === framePaths.length - 1 ? holdDuration : frameDuration))

    const manifestLines = []
    for (let i = 0; i < framePaths.length; i++) {
      manifestLines.push(`file '${framePaths[i].replace(/'/g, "'\\''")}'`)
      manifestLines.push(`duration ${durations[i]}`)
    }
    manifestLines.push(`file '${framePaths[framePaths.length - 1].replace(/'/g, "'\\''")}'`)
    const concatPath = path.join(tmpDir, 'concat.txt')
    writeFileSync(concatPath, manifestLines.join('\n'))

    const ext = format === 'gif' ? 'gif' : 'mp4'
    const outPath = path.join(tmpDir, `brat-out.${ext}`)

    if (ext === 'gif') {
      await execFileAsync(ffmpegPath, [
        '-y',
        '-f', 'concat', '-safe', '0', '-i', concatPath,
        '-vf', 'fps=10,scale=1000:1000:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=64[p];[s1][p]paletteuse=dither=bayer',
        '-loop', '0',
        outPath
      ])
    } else {
      await execFileAsync(ffmpegPath, [
        '-y',
        '-f', 'concat', '-safe', '0', '-i', concatPath,
        '-vf', 'scale=1000:1000',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '18',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        outPath
      ])
    }

    const outBuffer = readFileSync(outPath)
    return { buffer: outBuffer, format: ext, mimeType: ext === 'gif' ? 'image/gif' : 'video/mp4' }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

module.exports = { generateBratVideo }
