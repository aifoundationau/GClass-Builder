import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    fs: {
      // The dev server serves every file in the project folder, and host: true opens it to the
      // network. Refuse secrets, tokens, sessions, member records and the backend (Vite's own
      // defaults are the first four entries).
      deny: [
        '.env', '.env.*', '*.{crt,pem}', '**/.git/**',
        'credentials*.json', 'token*.json', 'user_session*.json', 'lms_firebase_users.json',
        '*-firebase-adminsdk-*.json', 'service-account*.json', 'serviceAccount*.json',
        '**/teacher_tokens/**', '**/.venv/**', '**/__pycache__/**', '*.py', '*.log', '*.xlsx', '*.txt', '*.spec',
      ],
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true
      }
    }
  }
});
