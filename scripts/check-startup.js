// Starts the server with NO environment variables, the way Vercel does before any are set, and reports whether it
// survives. Run it before every push: STARTUP FAILED means the live site would answer 500 FUNCTION_INVOCATION_FAILED.
// Usage: node scripts/check-startup.js [entry file, default server.js]
const os = require('os');
const path = require('path');

const entry = path.resolve(process.argv[2] || 'server.js');
for (const key of Object.keys(process.env)) {
    if (/^(FIREBASE_|STRIPE_|APP_|TOKEN_)/.test(key)) delete process.env[key];
}
process.env.PORT = '0';
process.chdir(os.tmpdir()); // no .env file here, so dotenv loads nothing

try {
    require(entry);
} catch (e) {
    console.error('STARTUP FAILED:', e.message);
    process.exit(1);
}
setTimeout(() => {
    console.log('STARTUP OK');
    process.exit(0);
}, 3000);
