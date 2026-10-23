const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const projectRoot = process.argv[2] || process.cwd();
const ignoredPaths = /node_modules|\.git|\.DS_Store/;

// Step 1: Connect to WebSocket
const socket = new WebSocket('ws://2b5d-2401-4900-1c21-25fe-b491-13-39cb-5bcb.ngrok-free.app/');

socket.on('open', () => {
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
  } catch {
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
  }
}
