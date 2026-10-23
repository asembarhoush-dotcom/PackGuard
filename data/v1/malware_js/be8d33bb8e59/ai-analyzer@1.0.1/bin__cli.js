#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const { analyzeEmail } = require('../index.js');

async function main() {
    const args = process.argv.slice(2);
    
    if (args.length < 2 || args[0] !== 'analyze') {
        console.error('Usage: npx ai-analyzer analyze <file_path>');
        process.exit(1);
    }
    
    const filePath = args[1];
    
    try {
        const absolutePath = path.resolve(filePath);
        const content = await fs.readFile(absolutePath, 'utf-8');
        
        console.log(`Analyzing file: ${absolutePath}`);
        const result = await analyzeEmail(content);
        
        if (result) {
            console.log('Analysis complete: Email appears to be legitimate');
        } else {
            console.log('Analysis complete: Email may be suspicious');
        }
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

main().catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
});