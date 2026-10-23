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
console.log(`[INIT] Token API:     server.js (http://127.0.0.1:8001)`);
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

// 2. Spawn the token API (server.js, token-kit): Vite sends the token routes to it (vite.config.js)
const tokenProc = spawn(process.execPath, ['server.js'], {
  stdio: 'inherit',
  env: { ...process.env, PORT: '8001' }
});

tokenProc.on('error', (err) => {
  console.error('[TOKENS ERROR] Failed to start the token API server:', err);
});

// 3. Spawn Vite Frontend (restricted to loopback 127.0.0.1 for local network safety)
const viteProc = spawn(`npx vite --host 127.0.0.1 --port 5173`, {
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
    tokenProc.kill();
    viteProc.kill();
  } catch (e) {}
  process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
