// Tokens: the shared balance (users/{uid}.token_balance), its ledger, profiles, purchases, grants and spending (lib/token-balances.js).
// Usage: npm test. The store is given a fake Firestore that applies commits all-or-nothing and checks preconditions like
// the real one, so nothing real is read or written.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTokenStore, LEDGER, CHECKOUTS } = require('../lib/token-balances');

const NOW = Date.parse('2026-10-23T08:00:00.000Z');
const UID = 'user123';
const APP_TAG = 'testapp';
const PARTITION_KEY = { tag: APP_TAG, businessId: APP_TAG, businessName: 'Test App', source: APP_TAG };

function fakeFirestore() {
    const docs = new Map(); // path -> { data, updateTime }
    const clone = value => JSON.parse(JSON.stringify(value));
    let version = 0;
    return {
        docs,
        available: true,
        beforeCommit: null, // runs once before the next commit, e.g. another app changing a balance
        set(path, data) {
            docs.set(path, { data: clone(data), updateTime: `v${++version}` });
        },
        get(path) {
            return docs.has(path) ? docs.get(path).data : undefined;
        },
        async readDocument(collection, id) {
            if (!this.available) return { ok: false };
            const doc = docs.get(`${collection}/${id}`);
            return doc ? { ok: true, data: clone(doc.data), updateTime: doc.updateTime } : { ok: true, data: null };
        },
        async listDocuments(collection) {
            if (!this.available) return null;
            return [...docs.entries()]
                .filter(([path]) => path.startsWith(`${collection}/`) && !path.slice(collection.length + 1).includes('/'))
                .map(([path, doc]) => ({ id: path.slice(collection.length + 1), fields: clone(doc.data) }));
        },
        async commitWrites(writes) {
            if (this.beforeCommit) {
                const hook = this.beforeCommit;
                this.beforeCommit = null;
                hook();
            }
            if (!this.available) return { success: false, error: 'Authentication unavailable' };
            for (const w of writes) {
                const existing = docs.get(w.path);
                if (w.mustNotExist && existing) return { success: false, error: 'ALREADY_EXISTS' };
                if (w.mustExist && !existing) return { success: false, error: 'NOT_FOUND' };
                if (w.updateTime && (!existing || existing.updateTime !== w.updateTime)) return { success: false, error: 'FAILED_PRECONDITION' };
            }
            for (const w of writes) {
                const existing = docs.get(w.path);
                const doc = w.replace || !existing ? {} : clone(existing.data);
                Object.assign(doc, clone(w.data || {}));
                for (const [field, by] of Object.entries(w.increment || {})) doc[field] = (Number(doc[field]) || 0) + by;
                for (const [field, values] of Object.entries(w.arrayUnion || {})) {
                    doc[field] = [...(doc[field] || []), ...values.filter(v => !(doc[field] || []).includes(v))];
                }
                for (const [field, values] of Object.entries(w.arrayRemove || {})) {
                    doc[field] = (doc[field] || []).filter(v => !values.includes(v));
                }
                this.set(w.path, doc);
            }
            return { success: true };
        }
    };
}

// A store with one profile, as another app (the LMS) left it: 40 tokens already
function setup({ balance = 40 } = {}) {
    const firebase = fakeFirestore();
    firebase.set(`users/${UID}`, { uid: UID, displayName: 'Sam Supporter', email: 'sam@example.com', role: 'supporter', tag: 'lms', token_balance: balance });
    return { firebase, store: createTokenStore({ appTag: APP_TAG, appName: 'Test App', firebase, now: () => NOW }) };
}

// A paid Stripe Checkout Session for 300 tokens, created 10 minutes ago
function checkout(overrides = {}) {
    return {
        id: 'cs_test_a1b2c3',
        payment_status: 'paid',
        status: 'complete',
        created: NOW / 1000 - 600,
        amount_total: 4290,
        currency: 'aud',
        metadata: { ...PARTITION_KEY, kind: 'tokens', uid: UID, tokens: '300' },
        ...overrides
    };
}

// ---------- Balance ----------

test('the balance is token_balance on the shared profile; no profile means 0; null when Firestore is unreachable', async () => {
    const { firebase, store } = setup();
    assert.deepEqual(await store.getBalance(UID), { exists: true, balance: 40 });
    assert.deepEqual(await store.getBalance('nobody'), { exists: false, balance: 0 });
    firebase.available = false;
    assert.equal(await store.getBalance(UID), null);
});

// ---------- Buying ----------

test('a paid checkout adds to the shared balance, records a ledger entry, and leaves the rest of the profile alone', async () => {
    const { firebase, store } = setup();
    await store.addPendingCheckout(UID, 'cs_test_a1b2c3');
    assert.deepEqual(await store.getPendingCheckouts(UID), ['cs_test_a1b2c3']);

    assert.deepEqual(await store.settleCheckout(checkout()), { uid: UID, tokens: 300, status: 'credited' });
    assert.deepEqual(await store.getBalance(UID), { exists: true, balance: 340 });
    assert.deepEqual(await store.getPendingCheckouts(UID), []);

    const profile = firebase.get(`users/${UID}`);
    assert.deepEqual({ name: profile.displayName, role: profile.role, tag: profile.tag }, { name: 'Sam Supporter', role: 'supporter', tag: 'lms' });
    assert.equal(profile.token_balance_updated_at, '2026-10-23T08:00:00.000Z');

    assert.deepEqual(firebase.get(`${LEDGER}/purchase_cs_test_a1b2c3`), {
        ...PARTITION_KEY,
        kind: 'purchase',
        reference: 'cs_test_a1b2c3',
        amount: 42.9,
        currency: 'aud',
        description: 'Bought 300 tokens',
        uid: UID,
        change: 300,
        createdAt: '2026-10-23T08:00:00.000Z'
    });
    assert.equal(LEDGER, 'token_ledger');
    assert.equal(CHECKOUTS, 'token_checkouts');
    assert.ok(firebase.get(`${CHECKOUTS}/${APP_TAG}_${UID}`), 'pending checkouts are kept per app and user');
});

test('confirming the same payment twice at once, or again later, never credits it twice', async () => {
    const { store } = setup();
    const results = await Promise.all([store.settleCheckout(checkout()), store.settleCheckout(checkout())]);
    assert.deepEqual(results.map(r => r.status).sort(), ['already-credited', 'credited']);
    assert.equal((await store.settleCheckout(checkout())).status, 'already-credited');
    assert.equal((await store.getBalance(UID)).balance, 340);
});

test('a payment for an account with no profile is not credited, and no profile is created', async () => {
    const { firebase, store } = setup();
    const session = checkout({ metadata: { ...checkout().metadata, uid: 'noProfile' } });
    await assert.rejects(store.settleCheckout(session), /no profile/);
    assert.equal(firebase.get('users/noProfile'), undefined);
    assert.equal(firebase.get(`${LEDGER}/purchase_cs_test_a1b2c3`), undefined);
});

test('unpaid checkouts stay pending; expired or week-old ones are dropped without crediting', async () => {
    const { store } = setup();
    for (const id of ['cs_test_open', 'cs_test_expired', 'cs_test_old']) await store.addPendingCheckout(UID, id);

    assert.equal((await store.settleCheckout(checkout({ id: 'cs_test_open', payment_status: 'unpaid', status: 'open' }))).status, 'pending');
    assert.equal((await store.settleCheckout(checkout({ id: 'cs_test_expired', payment_status: 'unpaid', status: 'expired' }))).status, 'expired');
    const eightDaysAgo = NOW / 1000 - 8 * 24 * 60 * 60;
    assert.equal((await store.settleCheckout(checkout({ id: 'cs_test_old', payment_status: 'unpaid', status: 'complete', created: eightDaysAgo }))).status, 'expired');

    assert.deepEqual(await store.getPendingCheckouts(UID), ['cs_test_open']);
    assert.equal((await store.getBalance(UID)).balance, 40);
});

test('only token checkouts with a valid user and amount are credited', async () => {
    const { store } = setup();
    const bad = [
        checkout({ metadata: { ...checkout().metadata, kind: undefined } }),
        checkout({ metadata: { ...checkout().metadata, kind: 'donation' } }),
        checkout({ metadata: { ...checkout().metadata, tokens: '5' } }),
        checkout({ metadata: { ...checkout().metadata, tokens: '1000000001' } }),
        checkout({ metadata: { ...checkout().metadata, uid: '../other' } }),
        checkout({ metadata: undefined }),
        checkout({ id: 'pi_not_a_checkout' })
    ];
    for (const session of bad) {
        await assert.rejects(store.settleCheckout(session), JSON.stringify(session.metadata));
    }
    assert.equal((await store.getBalance(UID)).balance, 40);
});

test('when Firestore is down the payment is not credited, and it can be credited later', async () => {
    const { firebase, store } = setup();
    await store.addPendingCheckout(UID, 'cs_test_a1b2c3');
    firebase.available = false;
    await assert.rejects(store.settleCheckout(checkout()), /Could not add tokens/);
    firebase.available = true;
    assert.deepEqual(await store.getPendingCheckouts(UID), ['cs_test_a1b2c3']);
    assert.equal((await store.settleCheckout(checkout())).status, 'credited');
    assert.equal((await store.getBalance(UID)).balance, 340);
});

// ---------- SuperAdmin grants ----------

test('the SuperAdmin adds tokens to an account, recorded in the ledger; the same request is never added twice', async () => {
    const { firebase, store } = setup();
    const grant = { uid: UID, tokens: 50, requestId: 'req-0001-abcd', grantedBy: 'support@aifoundation.net.au', note: 'Welcome bonus' };
    assert.deepEqual(await store.grantTokens(grant), { granted: true, alreadyGranted: false });
    assert.deepEqual(await store.grantTokens(grant), { granted: false, alreadyGranted: true });
    assert.equal((await store.getBalance(UID)).balance, 90);

    const entry = firebase.get(`${LEDGER}/grant_req-0001-abcd`);
    assert.deepEqual({ kind: entry.kind, change: entry.change, grantedBy: entry.grantedBy, description: entry.description, tag: entry.tag },
        { kind: 'grant', change: 50, grantedBy: 'support@aifoundation.net.au', description: 'Welcome bonus', tag: APP_TAG });
});

test('grants need a whole number of tokens, a request ID and an existing profile', async () => {
    const { store } = setup();
    for (const tokens of [0, -10, 1.5, 'abc', undefined]) {
        await assert.rejects(store.grantTokens({ uid: UID, tokens, requestId: 'req-0002-abcd' }), /Invalid number of tokens/, String(tokens));
    }
    await assert.rejects(store.grantTokens({ uid: UID, tokens: 10, requestId: 'x' }), /Invalid request ID/);
    await assert.rejects(store.grantTokens({ uid: 'noProfile', tokens: 10, requestId: 'req-0003-abcd' }), /no profile/);
    assert.equal((await store.getBalance(UID)).balance, 40);
});

// ---------- Spending ----------

test('spending takes tokens off the shared balance; the same app reference never takes them twice', async () => {
    const { firebase, store } = setup({ balance: 100 });
    const spend = { uid: UID, tokens: 30, app: 'lms', reference: 'order-1', description: 'Course: AI Basics' };
    assert.deepEqual(await store.spendTokens(spend), { status: 'spent', balance: 70 });
    assert.deepEqual(await store.spendTokens(spend), { status: 'already-spent', balance: 70 });
    assert.equal((await store.getBalance(UID)).balance, 70);

    const entry = firebase.get(`${LEDGER}/spend_lms_order-1`);
    assert.deepEqual({ kind: entry.kind, change: entry.change, app: entry.app, reference: entry.reference, description: entry.description },
        { kind: 'spend', change: -30, app: 'lms', reference: 'order-1', description: 'Course: AI Basics' });
});

test('spending more than the balance takes nothing', async () => {
    const { firebase, store } = setup({ balance: 20 });
    assert.deepEqual(await store.spendTokens({ uid: UID, tokens: 30, app: 'lms', reference: 'order-2' }), { status: 'insufficient', balance: 20 });
    assert.equal((await store.getBalance(UID)).balance, 20);
    assert.equal(firebase.get(`${LEDGER}/spend_lms_order-2`), undefined);
});

test('a balance change between reading and saving is not lost: the spend reads again and retries', async () => {
    const { firebase, store } = setup({ balance: 100 });
    // Another app adds 5 tokens just before this spend is saved
    firebase.beforeCommit = () => firebase.set(`users/${UID}`, { ...firebase.get(`users/${UID}`), token_balance: 105 });
    assert.deepEqual(await store.spendTokens({ uid: UID, tokens: 30, app: 'pt', reference: 'session-9' }), { status: 'spent', balance: 75 });
    assert.equal((await store.getBalance(UID)).balance, 75);
});

test('two spends at once can never take more than the balance', async () => {
    const { store } = setup({ balance: 100 });
    const results = await Promise.all([
        store.spendTokens({ uid: UID, tokens: 60, app: 'lms', reference: 'order-a' }),
        store.spendTokens({ uid: UID, tokens: 60, app: 'lms', reference: 'order-b' })
    ]);
    assert.deepEqual(results.map(r => r.status).sort(), ['insufficient', 'spent']);
    assert.equal((await store.getBalance(UID)).balance, 40);
});

test('spends need a valid amount, app and reference, and an existing, reachable profile', async () => {
    const { firebase, store } = setup({ balance: 100 });
    const ok = { uid: UID, tokens: 10, app: 'lms', reference: 'order-3' };
    await assert.rejects(store.spendTokens({ ...ok, tokens: 0 }), /Invalid number of tokens/);
    await assert.rejects(store.spendTokens({ ...ok, app: 'LMS App' }), /Invalid app/);
    await assert.rejects(store.spendTokens({ ...ok, reference: 'has space' }), /Invalid reference/);
    await assert.rejects(store.spendTokens({ ...ok, uid: 'noProfile' }), /no profile/);
    firebase.available = false;
    await assert.rejects(store.spendTokens(ok), /can't be reached/);
    firebase.available = true;
    assert.equal((await store.getBalance(UID)).balance, 100);
});

// ---------- Token Accounts ----------

test('Token Accounts lists every profile with its balance, by name; null when Firestore is unreachable', async () => {
    const { firebase, store } = setup();
    firebase.set('users/zed1', { email: 'Zed@Example.com', tenantTag: 'rto-ai' });
    firebase.set('users/amy1', { displayName: 'Amy Admin', email: 'amy@example.com', tag: 'aifoundation', token_balance: 5 });
    firebase.set(`${LEDGER}/grant_x`, { uid: UID }); // other collections are not accounts
    assert.deepEqual(await store.listAccounts(), [
        { uid: 'amy1', name: 'Amy Admin', email: 'amy@example.com', app: 'aifoundation', balance: 5 },
        { uid: UID, name: 'Sam Supporter', email: 'sam@example.com', app: 'lms', balance: 40 },
        { uid: 'zed1', name: '', email: 'zed@example.com', app: 'rto-ai', balance: 0 }
    ]);
    firebase.available = false;
    assert.equal(await store.listAccounts(), null);
});

test('user and checkout IDs are checked before anything is read or written', async () => {
    const { store } = setup();
    await assert.rejects(store.getBalance(''), /Invalid user ID/);
    await assert.rejects(store.getBalance('a/b'), /Invalid user ID/);
    await assert.rejects(store.addPendingCheckout(UID, 'pi_123'), /Invalid checkout session ID/);
    await assert.rejects(store.addPendingCheckout(UID, 'cs_test/../x'), /Invalid checkout session ID/);
});

// ---------- Shared profile ----------

test('first sign-in creates the shared profile with 0 tokens; later sign-ins keep the balance and role', async () => {
    const { firebase, store } = setup();
    assert.equal(await store.ensureProfile({ uid: 'newUser1', email: 'new@example.com', name: 'New Person', picture: '' }), true);
    const created = firebase.get('users/newUser1');
    assert.deepEqual(
        { balance: created.token_balance, role: created.role, apps: created.apps, tag: created.tag, email: created.email, isSuperAdmin: created.isSuperAdmin },
        { balance: 0, role: 'supporter', apps: [APP_TAG], tag: APP_TAG, email: 'new@example.com', isSuperAdmin: false }
    );

    // The existing LMS profile: balance, role and tag untouched; this app is added to apps
    assert.equal(await store.ensureProfile({ uid: UID, email: 'sam@example.com', name: 'Sam Supporter' }), true);
    const existing = firebase.get(`users/${UID}`);
    assert.deepEqual({ balance: existing.token_balance, role: existing.role, tag: existing.tag, apps: existing.apps },
        { balance: 40, role: 'supporter', tag: 'lms', apps: [APP_TAG] });
    assert.equal(existing.lastLoginAt, '2026-10-23T08:00:00.000Z');

    firebase.available = false;
    assert.equal(await store.ensureProfile({ uid: 'newUser2', email: 'x@example.com' }), false);
});

test('the app tag must be lower case letters, numbers, - or _', () => {
    const firebase = fakeFirestore();
    for (const appTag of ['', 'My App', 'UPPER', '-start', undefined]) {
        assert.throws(() => createTokenStore({ appTag, firebase }), /Invalid app tag/, String(appTag));
    }
    assert.ok(createTokenStore({ appTag: 'my-app_2', firebase }));
});
