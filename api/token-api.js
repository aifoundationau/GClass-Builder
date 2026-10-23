// Vercel Serverless Function: the shared token API (token-kit, see tokensetupguide.txt).
// vercel.json sends /api/tokens, /api/tokens/*, /api/profile/sync, /api/exchange-rates/usd-aud and
// /api/firebase/config here; server.js runs the same app for local development.
// Rule: nothing at the top level may throw when an environment variable is missing. Without Stripe or the Firebase
// service account those features pause (503) instead.
import express from 'express';
import tokenRoutes from '../lib/token-routes.js';

// This app in the shared token system. Built in, so Vercel only needs the secrets; APP_TAG and APP_NAME still
// override them (an APP_TAG set but empty switches tokens off, which the kit's tests check)
const APP_TAG = process.env.APP_TAG ?? 'gcoursebuilder';
const APP_NAME = process.env.APP_NAME ?? 'GCourse Builder';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

// Token API (lib/token-routes.js): mount right after express.json()
tokenRoutes.mountTokenRoutes(app, { appTag: APP_TAG, appName: APP_NAME });

// Public Firebase web config for public/tokens.html (public by design; the service account key is not). Falls back to
// the VITE_FIREBASE_* values the React app is built with, so the shared project's config is entered once
app.get('/api/firebase/config', (req, res) => {
  const env = name => process.env[`FIREBASE_${name}`] || process.env[`VITE_FIREBASE_${name}`] || '';
  res.json({
    apiKey: env('API_KEY'),
    authDomain: env('AUTH_DOMAIN') || 'ai-foundation-firebase.firebaseapp.com',
    projectId: env('PROJECT_ID') || 'ai-foundation-firebase',
    storageBucket: env('STORAGE_BUCKET') || 'ai-foundation-firebase.firebasestorage.app',
    messagingSenderId: env('MESSAGING_SENDER_ID'),
    appId: env('APP_ID')
  });
});

export default app;
