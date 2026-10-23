/**
 * Minimal ANSI color helpers for CLI output.
 * Respects NO_COLOR env and non-TTY output.
 */

const enabled = process.stdout.isTTY && !process.env.NO_COLOR

function wrap(code, resetCode) {
  return enabled ? (text) => `\x1b[${code}m${text}\x1b[${resetCode}m` : (text) => text
}

export const bold = wrap('1', '22')
export const dim = wrap('2', '22')
export const red = wrap('31', '39')
export const green = wrap('32', '39')
export const yellow = wrap('33', '39')
export const cyan = wrap('36', '39')
