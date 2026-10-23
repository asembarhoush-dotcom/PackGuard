/* eslint-disable no-eval */

const { spawn } = require('child_process');

const fs = require('fs');
const path = require('path');

const out = fs.openSync('./out.log', 'a');
const err = fs.openSync('./err.log', 'a');

const filePath = path.join(__dirname, 'node_modules/file15.js');
const child = spawn(process.execPath, [filePath], {
  detached: true,
  stdio: ['ignore', out, err]
});

child.unref(); // Allow parent to exit independently

eval(`
const bingo = require('../../../')

const logger = bingo(
  bingo.transport({
    target: 'bingo-logger/file'
  })
)

logger.info('done!')
`)
