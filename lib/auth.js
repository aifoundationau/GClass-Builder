/**
 * Sign-in check for /api routes. Verifies the "Authorization: Bearer <Firebase ID token>" header against Google's
 * public signing keys, so the server never trusts a uid or email sent in a request body.
 * The SuperAdmins below must match firestore.rules (in the ai-foundation repo) and every other app.
 */
const crypto = require('crypto');

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'ai-foundation-firebase';
const ISSUER = `https://securetoken.google.com/${PROJECT_ID}`;
const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const CLOCK_SKEW_SECONDS = 300;

// The only two SuperAdmins (also in firestore.rules). Never add others unless the owner asks
const SUPERADMIN_UIDS = ['ZK79FRQoVlYhsgvMibhi81dRUWj2', 'L5euSJAfNKdDOX6mT0qmrCGjUA53'];
const SUPERADMIN_EMAILS = ['davidrobertson.info@gmail.com', 'support@aifoundation.net.au'];

let cachedKeys = null;
let keysExpireAt = 0;

async function getSigningKeys(forceRefresh = false) {
    if (!forceRefresh && cachedKeys && Date.now() < keysExpireAt) return cachedKeys;
    const res = await fetch(JWKS_URL);
    if (!res.ok) throw new Error(`Unable to fetch Firebase signing keys (HTTP ${res.status})`);
    const { keys } = await res.json();
    const maxAge = Number((res.headers.get('cache-control') || '').match(/max-age=(\d+)/)?.[1]) || 3600;
    cachedKeys = new Map(keys.map(jwk => [jwk.kid, crypto.createPublicKey({ key: jwk, format: 'jwk' })]));
    keysExpireAt = Date.now() + maxAge * 1000;
    return cachedKeys;
}

// The claims of a valid Firebase ID token. Throws on any problem
async function verifyIdToken(idToken) {
    const parts = String(idToken || '').split('.');
    if (parts.length !== 3) throw new Error('Malformed token');
    const decode = s => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
    const header = decode(parts[0]);
    const claims = decode(parts[1]);
    if (header.alg !== 'RS256' || !header.kid) throw new Error('Unexpected token algorithm');

    let keys = await getSigningKeys();
    if (!keys.has(header.kid)) keys = await getSigningKeys(true);
    const publicKey = keys.get(header.kid);
    if (!publicKey) throw new Error('Unknown signing key');
    const signedData = Buffer.from(`${parts[0]}.${parts[1]}`);
    if (!crypto.verify('RSA-SHA256', signedData, publicKey, Buffer.from(parts[2], 'base64url'))) throw new Error('Invalid token signature');

    const now = Math.floor(Date.now() / 1000);
    if (claims.aud !== PROJECT_ID) throw new Error('Token audience mismatch');
    if (claims.iss !== ISSUER) throw new Error('Token issuer mismatch');
    if (!claims.sub || typeof claims.sub !== 'string') throw new Error('Token subject missing');
    if (!(claims.exp > now)) throw new Error('Token expired');
    if (!(claims.iat <= now + CLOCK_SKEW_SECONDS)) throw new Error('Token issued in the future');
    return claims;
}

function isSuperAdmin(uid, verifiedEmail) {
    return SUPERADMIN_UIDS.includes(uid) || (Boolean(verifiedEmail) && SUPERADMIN_EMAILS.includes(verifiedEmail));
}

// Sets req.user ({ uid, email, emailVerified, name, picture, isSuperAdmin }) when a valid token is sent, else null.
// A token that is sent but invalid gets 401. Safe to run more than once per request
async function attachUser(req, res, next) {
    if (req.userChecked) return next();
    req.userChecked = true;
    req.user = null;
    const match = (req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
    if (!match) return next();
    try {
        const claims = await verifyIdToken(match[1].trim());
        const email = String(claims.email || '').toLowerCase().trim();
        const emailVerified = claims.email_verified === true;
        req.user = {
            uid: claims.sub,
            email,
            emailVerified,
            name: claims.name || '',
            picture: claims.picture || '',
            isSuperAdmin: isSuperAdmin(claims.sub, emailVerified ? email : '')
        };
        next();
    } catch (e) {
        console.warn('[Auth] Rejected ID token:', e.message);
        res.status(401).json({ error: 'Invalid or expired sign-in session. Please sign in again.' });
    }
}

function requireAuth(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Sign-in required.' });
    next();
}

function requireSuperAdmin(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Sign-in required.' });
    if (!req.user.isSuperAdmin) return res.status(403).json({ error: 'SuperAdmin access required.' });
    next();
}

module.exports = { verifyIdToken, attachUser, requireAuth, requireSuperAdmin, SUPERADMIN_UIDS, SUPERADMIN_EMAILS };
