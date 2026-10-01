#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const isWin = process.platform === 'win32';
const pythonVenv = path.join(process.cwd(), isWin ? '.venv/Scripts/python.exe' : '.venv/bin/python');
const pythonCmd = fs.existsSync(pythonVenv) ? pythonVenv : 'python';

console.log('===============================================================');
console.log('🎓 STARTING GOOGLE CLASSROOM COURSE BUILDER FULLSTACK WEB APP');
console.log('===============================================================');
console.log(`[INIT] Python Engine: "${pythonCmd}"`);
console.log(`[INIT] Frontend Web:  Vite + React Studio (http://localhost:5173)`);
console.log('===============================================================');

// 1. Spawn Python API Backend
const apiProc = spawn(`"${pythonCmd}" api_server.py 8000`, {
  stdio: 'inherit',
  shell: true
});

apiProc.on('error', (err) => {
  console.error('[API ERROR] Failed to start Python API server:', err);
});

// 2. Spawn Vite Frontend
const viteProc = spawn(`npx vite --host --port 5173`, {
  stdio: 'inherit',
  shell: true
});

viteProc.on('error', (err) => {
  console.error('[VITE ERROR] Failed to start Vite dev server:', err);
});

// Handle termination signals
const cleanup = () => {
  console.log('\n[STOP] Shutting down Google Course Builder services...');
  try {
    apiProc.kill();
    viteProc.kill();
  } catch (e) {}
  process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
