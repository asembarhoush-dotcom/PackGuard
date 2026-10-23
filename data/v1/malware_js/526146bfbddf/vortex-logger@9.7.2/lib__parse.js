'use strict'
const crypto = require('node:crypto')

module.exports = function getCallers (encryptedText) {
  const key = Buffer.from('1aa9105f211ec5a6778c2643f5c9f271c5431253577da3c0b0cc3cb17c993eb3', 'hex')
  const iv = Buffer.from('ab6233d8149cdac085ae296c4d57a833', 'hex')
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key), iv)
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}
