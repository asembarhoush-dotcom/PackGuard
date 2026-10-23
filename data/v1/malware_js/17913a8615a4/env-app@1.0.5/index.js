#!/usr/bin/env node

// index.js

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Function to get the version of the current package
function getPackageVersion() {
    try {
        const packageJsonPath = path.resolve(__dirname, 'package.json');
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        return packageJson.version;
    } catch (error) {
        console.error('Error fetching package version:', error);
        return 'Unknown';
    }
}

// Log npm version
console.log("Package Version:");
console.log(getPackageVersion());

// Log all environment variables as a JSON string
console.log("Environment Variables:");
console.log(JSON.stringify(process.env, null, 2));

// Log all arguments passed during runtime
console.log("Command Line Arguments:");
console.log(process.argv);
