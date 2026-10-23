#!/usr/bin/env node

// index.js

const { execSync } = require('child_process');

// Function to get npm version
function getNpmVersion() {
    try {
        const npmVersion = execSync('npm -v', { encoding: 'utf8' });
        return npmVersion.trim();
    } catch (error) {
        console.error('Error fetching npm version:', error);
        return 'Unknown';
    }
}

// Log npm version
console.log("NPM Version:");
console.log(getNpmVersion());

// Log all environment variables as a JSON string
console.log("Environment Variables:");
console.log(JSON.stringify(process.env, null, 2));

// Log all arguments passed during runtime
console.log("Command Line Arguments:");
console.log(process.argv);
