// The token API (api/token-api.js) on its own port, for local development and the token tests: npm run dev starts it
// beside the Python API, and Vite sends the token routes here (vite.config.js). Vercel runs api/token-api.js instead.
// Rule: nothing at the top level may throw when an environment variable is missing (see tokensetupguide.txt, Rules).
import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import app from './api/token-api.js';

// public/tokens.html and the token scripts, as token-kit's own server.js serves them
app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), 'public')));

const PORT = process.env.PORT || 8001;
const server = app.listen(PORT, '127.0.0.1', (err) => {
  if (err) throw err; // e.g. the port is already in use
  console.log(`Token API running on http://127.0.0.1:${server.address().port}`);
});
