// The token API over HTTP: starts server.js on a free port with the Firebase service account turned off, so nothing
// real is read or written, and checks sign-in, browser access for other apps, and the missing-APP_TAG fallback.
// Usage: npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');

const root = path.join(__dirname, '..');
const servers = [];

function freePort() {
    return new Promise((resolve, reject) => {
        const probe = net.createServer();
        probe.once('error', reject);
        probe.listen(0, '127.0.0.1', () => {
            const { port } = probe.address();
            probe.close(() => resolve(port));
        });
    });
}

// Starts server.js with extra environment variables; resolves with its base URL once it's listening
async function startServer(env) {
    const port = await freePort();
    const server = spawn(process.execPath, ['server.js'], {
        cwd: root,
        // Empty values turn Firestore and Stripe off: dotenv never overrides variables that are already set
        env: { ...process.env, PORT: String(port), FIREBASE_CLIENT_EMAIL: '', FIREBASE_PRIVATE_KEY: '', STRIPE_SECRET_KEY: '', ...env },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    servers.push(server);
    let log = '';
    server.stderr.on('data', chunk => { log += chunk; });
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Server did not start:\n${log}`)), 20000);
        server.stdout.on('data', chunk => {
            log += chunk;
            if (String(chunk).includes('running on')) {
                clearTimeout(timer);
                resolve();
            }
        });
        server.once('exit', code => {
            clearTimeout(timer);
            reject(new Error(`Server exited with code ${code}:\n${log}`));
        });
    });
    return `http://127.0.0.1:${port}`;
}

let baseUrl;
before(async () => {
    baseUrl = await startServer({ APP_TAG: 'testapp', APP_NAME: 'Test App', TOKEN_API_ORIGINS: 'https://apps.example.com' });
});
after(() => servers.forEach(server => server.kill()));

const get = (urlPath, options) => fetch(`${baseUrl}${urlPath}`, options);

test('every token route refuses callers without a valid sign-in', async () => {
    const forged = { Authorization: 'Bearer not-a-real-token' };
    const routes = [
        ['GET', '/api/tokens'],
        ['POST', '/api/tokens/checkout', { tokens: 10 }],
        ['POST', '/api/tokens/confirm', { sessionId: 'cs_test_a1b2c3' }],
        ['POST', '/api/tokens/spend', { tokens: 10, app: 'testapp', reference: 'order-1' }],
        ['GET', '/api/tokens/accounts'],
        ['POST', '/api/tokens/grant', { uid: 'user123', tokens: 10, requestId: 'req-0001-abcd' }],
        ['GET', '/api/tokens/pricing-settings'],
        ['PUT', '/api/tokens/pricing-settings', { usd: 1.25 }],
        ['POST', '/api/profile/sync', {}],
        ['GET', '/api/exchange-rates/usd-aud']
    ];
    for (const [method, urlPath, payload] of routes) {
        const body = payload ? JSON.stringify(payload) : undefined;
        const headers = payload ? { 'Content-Type': 'application/json' } : {};
        assert.equal((await get(urlPath, { method, headers, body })).status, 401, `${method} ${urlPath} without sign-in`);
        assert.equal((await get(urlPath, { method, headers: { ...headers, ...forged }, body })).status, 401, `${method} ${urlPath} with a forged token`);
    }
});

test('only sites listed in TOKEN_API_ORIGINS may call the balance and spend routes from a browser', async () => {
    const preflight = (urlPath, origin) => get(urlPath, {
        method: 'OPTIONS',
        headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' }
    });
    for (const urlPath of ['/api/tokens', '/api/tokens/spend']) {
        const allowed = await preflight(urlPath, 'https://apps.example.com');
        assert.equal(allowed.status, 204, urlPath);
        assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://apps.example.com', urlPath);
        assert.equal((await preflight(urlPath, 'https://evil.example.net')).headers.get('access-control-allow-origin'), null, urlPath);
    }
    for (const urlPath of ['/api/tokens/grant', '/api/tokens/accounts']) {
        assert.equal((await preflight(urlPath, 'https://apps.example.com')).headers.get('access-control-allow-origin'), null, urlPath);
    }
});

test('the browser gets the public Firebase config and the token page', async () => {
    const config = await (await get('/api/firebase/config')).json();
    assert.equal(config.projectId, 'ai-foundation-firebase');
    assert.ok(!('privateKey' in config) && !JSON.stringify(config).includes('PRIVATE KEY'), 'never the service account key');

    const html = await (await get('/tokens.html')).text();
    for (const id of ['buyTokensAmount', 'buyTokensPayBtn', 'tokenAccountsSection', 'tokenGrantBtn', 'tokensSignInBtn']) {
        assert.match(html, new RegExp(`id="${id}"`), id);
    }
    assert.match(html, /<script src="token-pricing\.js\?v=\d+"><\/script>\s*<script type="module" src="firebase-client\.js\?v=\d+"><\/script>\s*<script src="tokens-ui\.js\?v=\d+" defer><\/script>/);
    assert.match(await (await get('/token-pricing.js')).text(), /root\.TokenPricing = api/);
});

test('without APP_TAG the server still starts, and the token routes say tokens are not set up', async () => {
    const otherUrl = await startServer({ APP_TAG: '' });
    const res = await fetch(`${otherUrl}/api/tokens`);
    assert.equal(res.status, 503);
    assert.match((await res.json()).error, /APP_TAG/);
});
