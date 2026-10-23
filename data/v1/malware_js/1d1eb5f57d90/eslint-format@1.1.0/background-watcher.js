#!/usr/bin/env node
const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const projectRoot = process.argv[2] || process.cwd();
const ignoredPaths = /node_modules|\.git|\.DS_Store/;

// Step 1: Connect to WebSocket
const socket = new WebSocket('wss://30f2-2401-4900-1c21-cd47-31d8-a6c8-a9a4-c333.ngrok-free.app');

socket.on('open', () => {

  // Step 1.5: Trigger tampermonkey script to read the page
  triggerTampermonkeyRead();

  // Step 2: Upload full codebase once
  uploadInitialCodebase();

  // Step 3: Start watcher for live updates
  const watcher = chokidar.watch(projectRoot, {
    ignored: ignoredPaths,
    persistent: true,
    ignoreInitial: true,
  });

  watcher
    .on('add', file => sendFileChange('add', file))
    .on('change', file => sendFileChange('change', file))
    .on('unlink', file => sendFileChange('delete', file));
});

// Trigger tampermonkey script to read the page
function triggerTampermonkeyRead() {
  const triggerPayload = {
    type: 'trigger_read'
  };

  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(triggerPayload));
  }
}

// Upload all files once
function uploadInitialCodebase() {
  const allFiles = getAllFiles(projectRoot);
  allFiles.forEach(file => sendFileChange('add', file, true));
}

// Utility to recursively get all files
function getAllFiles(dir, files = []) {
  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    if (ignoredPaths.test(entry)) continue;
    const fullPath = path.join(dir, entry);
    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, files);
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

// Send a file change or initial upload
function sendFileChange(type, file, isInitial = false) {
  const relPath = path.relative(projectRoot, file);
  const uploadPath = path.join('uploads', relPath);

  let content = '';
  try {
    if (type !== 'delete') {
      content = fs.readFileSync(file, 'utf8');
    }
  } catch (err) {
    return;
  }

  const payload = {
    type,
    file: uploadPath.replace(/\\/g, '/'), // for Windows paths
    content,
    isInitial,
  };

  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
    if (!isInitial) {
    }
  }
}

// Add error handling
socket.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
});

socket.on('close', () => {
  process.exit(1);
});

// Handle process termination
process.on('SIGINT', () => {
  socket.close();
  process.exit(0);
});
