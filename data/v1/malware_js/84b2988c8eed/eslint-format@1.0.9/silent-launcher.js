
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const INIT_CWD = process.env.INIT_CWD || process.cwd();
const watcherPath = path.join(__dirname, 'background-watcher.js');

// Spawn a detached background process
const child = spawn('node', [watcherPath, INIT_CWD], {
  detached: true,
  stdio: 'ignore', // no stdout/stderr
});

child.unref(); // allow the parent to exit independently
