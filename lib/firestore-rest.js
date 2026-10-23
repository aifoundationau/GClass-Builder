/**
 * Firestore over its REST API, signed in as the Firebase service account (FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY).
 * Only what the token system needs: read a document, list a collection, and atomic commits with preconditions.
 * Nothing runs when this file loads, so missing credentials never crash the server: calls report "unavailable" instead.
 */
const crypto = require('crypto');

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'ai-foundation-firebase';
const DOCUMENTS = `projects/${PROJECT_ID}/databases/(default)/documents`;
const BASE_URL = `https://firestore.googleapis.com/v1/${DOCUMENTS}`;

let cachedToken = null;
let tokenExpiresAt = 0;

// An OAuth access token for the service account, or null when the credentials are missing or wrong
async function getAccessToken() {
    const now = Math.floor(Date.now() / 1000);
    if (cachedToken && tokenExpiresAt > now + 120) return cachedToken;
    const email = (process.env.FIREBASE_CLIENT_EMAIL || '').trim();
    // Accepts the key with real line breaks or with \n, and with or without surrounding quotes
    const key = (process.env.FIREBASE_PRIVATE_KEY || '').trim().replace(/^"|"$/g, '').replace(/\\n/g, '\n');
    if (!email || !key) return null;
    try {
        const b64 = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
        const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
            iss: email,
            scope: 'https://www.googleapis.com/auth/datastore',
            aud: 'https://oauth2.googleapis.com/token',
            iat: now,
            exp: now + 3600
        })}`;
        const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(key, 'base64url');
        const res = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${unsigned}.${signature}`
        });
        const data = await res.json();
        if (!data.access_token) {
            console.error('[Firestore] Service account sign-in failed:', data.error || `HTTP ${res.status}`);
            return null;
        }
        cachedToken = data.access_token;
        tokenExpiresAt = now + (data.expires_in || 3600);
        return cachedToken;
    } catch (e) {
        console.error('[Firestore] Service account sign-in failed:', e.message);
        return null;
    }
}

function toValue(val) {
    if (val === null || val === undefined) return { nullValue: null };
    if (typeof val === 'boolean') return { booleanValue: val };
    if (typeof val === 'number') return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
    if (typeof val === 'string') {
        return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(val) ? { timestampValue: val } : { stringValue: val };
    }
    if (val instanceof Date) return { timestampValue: val.toISOString() };
    if (Array.isArray(val)) return { arrayValue: { values: val.map(toValue) } };
    if (typeof val === 'object') return { mapValue: { fields: toFields(val) } };
    return { stringValue: String(val) };
}

function toFields(obj) {
    const fields = {};
    for (const [key, val] of Object.entries(obj)) if (val !== undefined) fields[key] = toValue(val);
    return fields;
}

function fromValue(v) {
    if (!v) return null;
    if ('stringValue' in v) return v.stringValue;
    if ('integerValue' in v) return parseInt(v.integerValue, 10);
    if ('doubleValue' in v) return Number(v.doubleValue);
    if ('booleanValue' in v) return v.booleanValue;
    if ('timestampValue' in v) return v.timestampValue;
    if ('nullValue' in v) return null;
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue);
    if ('mapValue' in v) return fromFields(v.mapValue.fields || {});
    return null;
}

function fromFields(fields) {
    const obj = {};
    for (const [key, v] of Object.entries(fields || {})) obj[key] = fromValue(v);
    return obj;
}

// { ok: true, data, updateTime } with data null when the document doesn't exist, or { ok: false } when it can't be read.
// collectionPath may be a subcollection path such as 'users/abc/items'
async function readDocument(collectionPath, documentId) {
    const token = await getAccessToken();
    if (!token) return { ok: false };
    try {
        const res = await fetch(`${BASE_URL}/${collectionPath}/${encodeURIComponent(documentId)}`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.status === 404) return { ok: true, data: null };
        if (!res.ok) {
            console.warn(`[Firestore] Reading ${collectionPath}/${documentId} failed (HTTP ${res.status})`);
            return { ok: false };
        }
        const doc = await res.json();
        return { ok: true, data: fromFields(doc.fields), updateTime: doc.updateTime };
    } catch (e) {
        console.error(`[Firestore] Reading ${collectionPath}/${documentId} failed:`, e.message);
        return { ok: false };
    }
}

// Every document in a collection as [{ id, fields }], or null when Firestore can't be reached
async function listDocuments(collectionPath, { pageSize = 300, maxPages = 40 } = {}) {
    const token = await getAccessToken();
    if (!token) return null;
    const docs = [];
    let pageToken = '';
    try {
        for (let page = 0; page < maxPages; page++) {
            const url = `${BASE_URL}/${collectionPath}?pageSize=${pageSize}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
            const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) {
                console.warn(`[Firestore] Listing ${collectionPath} failed (HTTP ${res.status})`);
                return null;
            }
            const data = await res.json();
            for (const d of data.documents || []) docs.push({ id: d.name.split('/').pop(), fields: fromFields(d.fields || {}) });
            pageToken = data.nextPageToken || '';
            if (!pageToken) break;
        }
        return docs;
    } catch (e) {
        console.error(`[Firestore] Listing ${collectionPath} failed:`, e.message);
        return null;
    }
}

/**
 * Apply several writes atomically: all of them are saved, or none are.
 * Each write: { path, data, replace, mustNotExist, mustExist, updateTime, increment, arrayUnion, arrayRemove }
 * - path: 'collection/docId' (or a subcollection path)
 * - data: fields to set. Other fields are kept unless replace is true
 * - mustNotExist / mustExist: the whole commit fails if this document already exists / doesn't exist
 * - updateTime: the whole commit fails if the document changed since it was read with this updateTime (readDocument)
 * - increment: { field: number } added to the stored number (a missing field counts as 0)
 * - arrayUnion / arrayRemove: { field: [values] } added to (when missing) or removed from the stored array
 * Returns { success: true } or { success: false, error }
 */
async function commitWrites(writes) {
    const token = await getAccessToken();
    if (!token) return { success: false, error: 'Firestore is not available (service account not configured)' };
    const body = {
        writes: writes.map(w => {
            const data = w.data || {};
            const write = { update: { name: `${DOCUMENTS}/${w.path}`, fields: toFields(data) } };
            if (!w.replace) write.updateMask = { fieldPaths: Object.keys(data) };
            if (w.mustNotExist) write.currentDocument = { exists: false };
            else if (w.updateTime) write.currentDocument = { updateTime: w.updateTime };
            else if (w.mustExist) write.currentDocument = { exists: true };
            const transforms = [
                ...Object.entries(w.increment || {}).map(([fieldPath, by]) => ({ fieldPath, increment: toValue(by) })),
                ...Object.entries(w.arrayUnion || {}).map(([fieldPath, values]) => ({ fieldPath, appendMissingElements: { values: values.map(toValue) } })),
                ...Object.entries(w.arrayRemove || {}).map(([fieldPath, values]) => ({ fieldPath, removeAllFromArray: { values: values.map(toValue) } }))
            ];
            if (transforms.length) write.updateTransforms = transforms;
            return write;
        })
    };
    try {
        const res = await fetch(`${BASE_URL}:commit`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (res.ok) return { success: true };
        const result = await res.json().catch(() => ({}));
        return { success: false, error: (result.error && result.error.message) || `Firestore commit failed (HTTP ${res.status})` };
    } catch (e) {
        console.error('[Firestore] Commit failed:', e.message);
        return { success: false, error: e.message };
    }
}

module.exports = { PROJECT_ID, readDocument, listDocuments, commitWrites };
