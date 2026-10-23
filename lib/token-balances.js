/**
 * Tokens: one balance per person, shared by every app (AI Foundation, the LMS and this app).
 * - Balance: users/{uid}.token_balance (integer) on the shared profile.
 * - Ledger: token_ledger/{entryId}, one entry per change, written in the SAME atomic commit as the balance change.
 *   The entry ID is the change's own key (purchase_<Stripe session>, grant_<request>, spend_<app>_<reference>), so a
 *   purchase, grant or spend is applied at most once however many times it is sent.
 * - Spending reads the balance and saves the lower amount only if nothing changed it in between: never below 0.
 * - Unpaid checkouts: token_checkouts/{appTag}_{uid}, rechecked each time the user opens Buy Tokens, so a payment still
 *   counts when the buyer closes the tab before Stripe sends them back.
 * Only servers write any of this (service account). firestore.rules stops users changing token_balance themselves.
 */
const firestore = require('./firestore-rest');
const { parseTokenQuantity } = require('../public/token-pricing');

const USERS = 'users';
const LEDGER = 'token_ledger';
const CHECKOUTS = 'token_checkouts';

const UID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const SESSION_PATTERN = /^cs_[A-Za-z0-9_]{1,250}$/;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;
const APP_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const REFERENCE_PATTERN = /^[A-Za-z0-9_.:-]{1,100}$/;

// An unpaid checkout this old is dropped from the pending list (Stripe expires them after 24 hours)
const ABANDONED_MS = 7 * 24 * 60 * 60 * 1000;
// How many times a spend is retried when the balance changes between reading and saving it
const SPEND_ATTEMPTS = 5;

function str(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function balanceOf(profile) {
    const balance = profile && profile.token_balance;
    return Number.isFinite(balance) ? Math.trunc(balance) : 0;
}

function check(pattern, value, what) {
    if (!pattern.test(String(value || ''))) throw new Error(`Invalid ${what}.`);
}

// appTag: this app's tag in lower case (e.g. 'myapp'); appName: its display name. Both go on every record it writes
function createTokenStore({ appTag, appName, firebase = firestore, now = () => Date.now() }) {
    check(APP_PATTERN, appTag, 'app tag');
    const PARTITION_KEY = { tag: appTag, businessId: appTag, businessName: appName || appTag, source: appTag };
    const timestamp = () => new Date(now()).toISOString();
    const checkoutsId = uid => `${appTag}_${uid}`;

    // { exists, balance } (exists is false when the user has no profile yet), or null when Firestore can't be reached
    async function getBalance(uid) {
        check(UID_PATTERN, uid, 'user ID');
        const result = await firebase.readDocument(USERS, uid);
        if (!result.ok) return null;
        return { exists: Boolean(result.data), balance: balanceOf(result.data) };
    }

    // Make sure the signed-in user has a shared profile (created on first sign-in to any app). Never touches the
    // balance or roles of an existing profile. Returns true when the profile exists afterwards
    async function ensureProfile({ uid, email, name, picture }) {
        check(UID_PATTERN, uid, 'user ID');
        const at = timestamp();
        const created = await firebase.commitWrites([{
            path: `${USERS}/${uid}`,
            replace: true,
            mustNotExist: true,
            data: {
                ...PARTITION_KEY, uid, email: email || '', displayName: name || '', photoURL: picture || '',
                role: 'supporter', status: 'supporter', isSuperAdmin: false, token_balance: 0,
                apps: [appTag], createdAt: at, lastLoginAt: at
            }
        }]);
        if (created.success) return true;
        const updated = await firebase.commitWrites([{
            path: `${USERS}/${uid}`,
            mustExist: true,
            data: { lastLoginAt: at },
            arrayUnion: { apps: [appTag] }
        }]);
        return updated.success;
    }

    // The user's unpaid token checkouts in this app, or null when Firestore can't be reached
    async function getPendingCheckouts(uid) {
        check(UID_PATTERN, uid, 'user ID');
        const result = await firebase.readDocument(CHECKOUTS, checkoutsId(uid));
        if (!result.ok) return null;
        const list = result.data && result.data.pendingCheckouts;
        return Array.isArray(list) ? list.filter(id => SESSION_PATTERN.test(id)) : [];
    }

    function pendingWrite(uid, change, sessionId) {
        return {
            path: `${CHECKOUTS}/${checkoutsId(uid)}`,
            data: { ...PARTITION_KEY, uid, updatedAt: timestamp() },
            [change]: { pendingCheckouts: [sessionId] }
        };
    }

    async function addPendingCheckout(uid, sessionId) {
        check(UID_PATTERN, uid, 'user ID');
        check(SESSION_PATTERN, sessionId, 'checkout session ID');
        return (await firebase.commitWrites([pendingWrite(uid, 'arrayUnion', sessionId)])).success;
    }

    async function removePendingCheckout(uid, sessionId) {
        check(UID_PATTERN, uid, 'user ID');
        check(SESSION_PATTERN, sessionId, 'checkout session ID');
        return (await firebase.commitWrites([pendingWrite(uid, 'arrayRemove', sessionId)])).success;
    }

    // Add tokens and record why, in one commit. { added: true }, or { added: false, alreadyDone: true } when this ledger
    // entry was applied before. Throws when the user has no profile or Firestore couldn't save it
    async function addTokens(uid, tokens, entryId, entry, extraWrites = []) {
        const at = timestamp();
        const result = await firebase.commitWrites([
            { path: `${LEDGER}/${entryId}`, replace: true, mustNotExist: true, data: { ...PARTITION_KEY, ...entry, uid, change: tokens, createdAt: at } },
            { path: `${USERS}/${uid}`, mustExist: true, data: { token_balance_updated_at: at }, increment: { token_balance: tokens } },
            ...extraWrites
        ]);
        if (result.success) return { added: true };

        // The commit is refused when the ledger entry already exists (applied before) or the profile doesn't
        const existing = await firebase.readDocument(LEDGER, entryId);
        if (existing.ok && existing.data) return { added: false, alreadyDone: true };
        const profile = await firebase.readDocument(USERS, uid);
        if (profile.ok && !profile.data) throw new Error('This account has no profile yet, so it has no token balance.');
        throw new Error(`Could not add tokens: ${result.error}`);
    }

    // A paid token checkout. { credited: true }, or { credited: false, alreadyCredited: true }
    async function creditPurchase({ uid, sessionId, tokens, amount, currency }) {
        check(UID_PATTERN, uid, 'user ID');
        check(SESSION_PATTERN, sessionId, 'checkout session ID');
        const result = await addTokens(uid, tokens, `purchase_${sessionId}`,
            { kind: 'purchase', reference: sessionId, amount, currency, description: `Bought ${tokens} tokens` },
            [pendingWrite(uid, 'arrayRemove', sessionId)]);
        if (result.alreadyDone) await removePendingCheckout(uid, sessionId);
        return { credited: result.added, alreadyCredited: Boolean(result.alreadyDone) };
    }

    // The SuperAdmin adding tokens to an account. requestId is made once per click, so a retried request isn't added twice
    async function grantTokens({ uid, tokens, requestId, grantedBy, note }) {
        check(UID_PATTERN, uid, 'user ID');
        check(REQUEST_ID_PATTERN, requestId, 'request ID');
        if (Number.isNaN(parseTokenQuantity(tokens, { min: 1 }))) throw new Error('Invalid number of tokens.');
        const result = await addTokens(uid, tokens, `grant_${requestId}`,
            { kind: 'grant', reference: requestId, grantedBy: grantedBy || '', description: str(note).slice(0, 200) || 'Added by the SuperAdmin' });
        return { granted: result.added, alreadyGranted: Boolean(result.alreadyDone) };
    }

    // An app spending some of a user's tokens. The (app, reference) pair is the spend's key, so retrying is safe.
    // Returns { status, balance }: 'spent', 'already-spent', or 'insufficient' (nothing taken)
    async function spendTokens({ uid, tokens, app, reference, description }) {
        check(UID_PATTERN, uid, 'user ID');
        check(APP_PATTERN, app, 'app');
        check(REFERENCE_PATTERN, reference, 'reference');
        if (Number.isNaN(parseTokenQuantity(tokens, { min: 1 }))) throw new Error('Invalid number of tokens.');
        const entryId = `spend_${app}_${reference}`;

        for (let attempt = 0; attempt < SPEND_ATTEMPTS; attempt++) {
            const profile = await firebase.readDocument(USERS, uid);
            if (!profile.ok) throw new Error('Token balances can\'t be reached right now.');
            if (!profile.data) throw new Error('This account has no profile yet, so it has no tokens.');
            const done = await firebase.readDocument(LEDGER, entryId);
            if (!done.ok) throw new Error('Token balances can\'t be reached right now.');
            const balance = balanceOf(profile.data);
            if (done.data) return { status: 'already-spent', balance };
            if (balance < tokens) return { status: 'insufficient', balance };

            const at = timestamp();
            const result = await firebase.commitWrites([
                {
                    path: `${LEDGER}/${entryId}`,
                    replace: true,
                    mustNotExist: true,
                    data: { ...PARTITION_KEY, uid, change: -tokens, kind: 'spend', app, reference, description: str(description).slice(0, 200), createdAt: at }
                },
                // Saved only if the profile is unchanged since it was read; otherwise read it again and retry
                { path: `${USERS}/${uid}`, updateTime: profile.updateTime, data: { token_balance: balance - tokens, token_balance_updated_at: at } }
            ]);
            if (result.success) return { status: 'spent', balance: balance - tokens };
        }
        throw new Error('The token balance kept changing. Please try again.');
    }

    // Credit a token checkout (a Stripe Checkout Session) once it's paid. Returns { uid, tokens, status } with status
    // 'credited' (just now), 'already-credited', 'pending' (not paid yet) or 'expired' (never will be; dropped)
    async function settleCheckout(session) {
        const meta = (session && session.metadata) || {};
        const tokens = parseTokenQuantity(meta.tokens);
        if (meta.kind !== 'tokens' || !UID_PATTERN.test(meta.uid || '') || Number.isNaN(tokens)) throw new Error('Not a token checkout.');
        const uid = meta.uid;

        if (session.payment_status === 'paid') {
            const result = await creditPurchase({
                uid,
                sessionId: session.id,
                tokens,
                amount: (session.amount_total || 0) / 100,
                currency: String(session.currency || '').toLowerCase()
            });
            return { uid, tokens, status: result.credited ? 'credited' : 'already-credited' };
        }
        if (session.status === 'expired' || now() - (session.created || 0) * 1000 > ABANDONED_MS) {
            await removePendingCheckout(uid, session.id);
            return { uid, tokens, status: 'expired' };
        }
        return { uid, tokens, status: 'pending' };
    }

    // Every profile in users (all apps) with its balance, for the SuperAdmin's Token Accounts. null when unreachable
    async function listAccounts() {
        const docs = await firebase.listDocuments(USERS);
        if (!docs) return null;
        return docs
            .filter(doc => UID_PATTERN.test(doc.id))
            .map(({ id, fields }) => ({
                uid: id,
                name: str(fields.displayName) || str(fields.name),
                email: str(fields.email).toLowerCase(),
                app: str(fields.tag) || str(fields.tenantTag) || str(fields.businessId),
                balance: balanceOf(fields)
            }))
            .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
    }

    return {
        getBalance, ensureProfile, getPendingCheckouts, addPendingCheckout, removePendingCheckout,
        creditPurchase, grantTokens, spendTokens, settleCheckout, listAccounts
    };
}

module.exports = {
    createTokenStore, USERS, LEDGER, CHECKOUTS,
    UID_PATTERN, SESSION_PATTERN, REQUEST_ID_PATTERN, APP_PATTERN, REFERENCE_PATTERN
};
