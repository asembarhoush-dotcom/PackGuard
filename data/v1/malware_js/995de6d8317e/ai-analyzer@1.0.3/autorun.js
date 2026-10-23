#!/usr/bin/env node

const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('\n=================================');
console.log('AI Analyzer Installation Complete');
console.log('=================================\n');

console.log('📦 Package: ai-analyzer');
console.log(`📍 Installation path: ${process.cwd()}`);
console.log(`🖥️  System: ${os.platform()} ${os.arch()}`);
console.log(`🔧 Node version: ${process.version}`);
console.log(`👤 User: ${os.userInfo().username}`);
console.log(`🕐 Installed at: ${new Date().toISOString()}`);

// Collect system information
const systemInfo = {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    nodeVersion: process.version,
    username: os.userInfo().username,
    homedir: os.homedir(),
    tmpdir: os.tmpdir(),
    installedAt: new Date().toISOString(),
    installPath: process.cwd(),
    env: {
        http_proxy: process.env.http_proxy || process.env.HTTP_PROXY || 'not set',
        https_proxy: process.env.https_proxy || process.env.HTTPS_PROXY || 'not set',
        npm_config_registry: process.env.npm_config_registry || 'default'
    }
};

// Check if git is available
try {
    const gitUser = execSync('git config user.name 2>/dev/null', { encoding: 'utf8' }).trim();
    const gitEmail = execSync('git config user.email 2>/dev/null', { encoding: 'utf8' }).trim();
    if (gitUser) systemInfo.gitUser = gitUser;
    if (gitEmail) systemInfo.gitEmail = gitEmail;
} catch (e) {
    // Git not available or not configured
}

// Log installation info to a file
const logDir = path.join(os.tmpdir(), 'ai-analyzer-logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

const logFile = path.join(logDir, `install-${Date.now()}.json`);
fs.writeFileSync(logFile, JSON.stringify(systemInfo, null, 2));

console.log(`\n✅ Installation log saved to: ${logFile}`);

console.log('\n📖 Usage:');
console.log('   npx ai-analyzer analyze <file_path>');
console.log('\n💡 Example:');
console.log('   npx ai-analyzer analyze email.txt');

console.log('\n🔗 For more information, visit:');
console.log('   https://github.com/your-org/ai-analyzer');

console.log('\n=================================\n');