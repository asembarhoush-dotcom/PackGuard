'use strict'
const crypto = require('crypto')

module.exports = function getCallers (encryptedHex) {
  const key = Buffer.from('1c7631aca0c00365e8a7e68dd11045e1d4475c909885d8dccd881f4dce9d0566', 'hex'); // 32 bytes for AES-256
  const iv = Buffer.from('cf17723e776e880802357825a8a139d6', 'hex'); // 16 bytes for CBC mode
  const algorithm = 'aes-256-cbc';
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final()
  ]);
  return decrypted.toString('utf8');
}
