/**
 * The token API for an Express app. Call mountTokenRoutes(app, { appTag, appName }) right after app.use(express.json()).
 *
 *   GET  /api/tokens               signed in: balance, this visitor's token price, limits (and settles paid checkouts)
 *   POST /api/tokens/checkout      signed in: { tokens } -> { url } of a Stripe Checkout page
 *   POST /api/tokens/confirm       signed in: { sessionId } -> credits the purchase once Stripe says it's paid
 *   POST /api/tokens/spend         signed in: { tokens, app, reference, description } -> takes tokens off the balance
 *   GET  /api/tokens/accounts      SuperAdmin: every account and its balance
 *   POST /api/tokens/grant         SuperAdmin: { uid, tokens, requestId, note } -> adds tokens to an account
 *   POST /api/profile/sync         signed in: creates the shared profile on first sign-in (needed before buying)
 *   GET  /api/exchange-rates/usd-aud  SuperAdmin: today's USD to AUD rate (for price boxes in this app)
 *
 * The token price is read from AI Foundation's saved prices (system_settings/aifoundation_service_prices), so a token
 * costs the same in every app. The server works out every amount; the browser only says how many tokens.
 * Nothing here runs at load time that can fail: without APP_TAG, Stripe or Firebase keys the routes answer 503.
 */
const firestore = require('./firestore-rest');
const pricing = require('../public/token-pricing');
const tokenBalances = require('./token-balances');
const { createExchangeRates } = require('./exchange-rates');
const { attachUser, requireAuth, requireSuperAdmin } = require('./auth');

const PRICE_DOC = { collection: 'system_settings', id: 'aifoundation_service_prices' };

let stripeClient = null;
function getStripe() {
    if (!stripeClient && process.env.STRIPE_SECRET_KEY) {
        const Stripe = require('stripe');
        stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
    }
    return stripeClient;
}

// Visitor's country from Vercel's IP geolocation ('' when unknown, e.g. on localhost)
function visitorCountry(req) {
    const code = String(req.headers['x-vercel-ip-country'] || '').trim().toUpperCase();
    return /^[A-Z]{2}$/.test(code) ? code : '';
}

function sendServerError(res, err, publicMessage = 'Something went wrong. Please try again.') {
    const isCustomerFacing = err && (err.type === 'StripeCardError' || err.type === 'StripeInvalidRequestError');
    res.status(500).json({ error: isCustomerFacing ? err.message : publicMessage });
}

function mountTokenRoutes(app, { appTag, appName } = {}) {
    const configError = tokenBalances.APP_PATTERN.test(String(appTag || ''))
        ? '' : 'Tokens are not set up on this server yet (APP_TAG is missing).';
    if (configError) console.error(`[Tokens] ${configError} Set APP_TAG to this app's tag in lower case, e.g. "myapp".`);
    const tokenStore = configError ? null : tokenBalances.createTokenStore({ appTag, appName });
    const exchangeRates = createExchangeRates();

    // The owner's other apps may read and spend tokens from the browser (GET /api/tokens, POST /api/tokens/spend):
    // their sites are listed, comma separated, in TOKEN_API_ORIGINS. Without it only this site can
    const allowedOrigins = String(process.env.TOKEN_API_ORIGINS || '').split(',').map(o => o.trim().replace(/\/+$/, '')).filter(Boolean);
    app.use('/api/tokens', (req, res, next) => {
        const origin = req.headers.origin;
        if (!origin || !allowedOrigins.includes(origin) || !['/', '/spend'].includes(req.path)) return next();
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        if (req.method === 'OPTIONS') {
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
            res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
            res.setHeader('Access-Control-Max-Age', '600');
            return res.status(204).end();
        }
        next();
    });

    app.use(['/api/tokens', '/api/profile', '/api/exchange-rates'], attachUser);
    app.use(['/api/tokens', '/api/profile'], (req, res, next) => {
        if (configError) return res.status(503).json({ error: configError });
        next();
    });

    // The price of one token for this visitor (USD $1 unless the price was changed in AI Foundation's admin panel)
    async function tokenPriceFor(req) {
        const saved = await firestore.readDocument(PRICE_DOC.collection, PRICE_DOC.id);
        return pricing.tokenPrice(saved.ok && saved.data ? saved.data.prices : null, visitorCountry(req));
    }

    // Billing record for a token checkout in the shared transactions collection (best effort)
    async function recordTransaction(sessionId, fields) {
        const result = await firestore.commitWrites([{
            path: `transactions/${sessionId}`,
            data: { tag: appTag, businessId: appTag, businessName: appName || appTag, source: appTag, transactionId: sessionId, updatedAt: new Date().toISOString(), ...fields }
        }]);
        if (!result.success) console.warn(`[Tokens] Could not record transaction ${sessionId}:`, result.error);
    }

    async function syncTokenTransaction(session, status) {
        const txStatus = status === 'credited' ? 'succeeded' : (status === 'expired' ? 'failed' : null);
        if (txStatus) await recordTransaction(session.id, { status: txStatus, amount: (session.amount_total || 0) / 100, userId: session.metadata.uid });
    }

    // Check the user's unpaid checkouts with Stripe and credit any paid since (covers buyers who closed the tab)
    async function settlePendingCheckouts(uid, pendingCheckouts) {
        const stripe = getStripe();
        if (!stripe) return;
        await Promise.all(pendingCheckouts.slice(-10).map(async sessionId => {
            try {
                const session = await stripe.checkout.sessions.retrieve(sessionId);
                if (!session.metadata || session.metadata.uid !== uid) {
                    await tokenStore.removePendingCheckout(uid, sessionId);
                    return;
                }
                const result = await tokenStore.settleCheckout(session);
                await syncTokenTransaction(session, result.status);
            } catch (e) {
                // A checkout Stripe has never heard of (e.g. made with test keys) will never be paid
                if (e && e.code === 'resource_missing') await tokenStore.removePendingCheckout(uid, sessionId);
                else console.warn(`[Tokens] Could not check checkout ${sessionId}:`, e.message);
            }
        }));
    }

    // Create the shared profile on first sign-in (tokens are stored on it). Call after every sign-in
    app.post('/api/profile/sync', requireAuth, async (req, res) => {
        try {
            const ok = await tokenStore.ensureProfile(req.user);
            if (!ok) return res.status(503).json({ error: 'Your profile could not be saved right now.' });
            res.json({ success: true });
        } catch (e) {
            console.error('[Tokens] Profile sync error:', e);
            sendServerError(res, e);
        }
    });

    app.get('/api/tokens', requireAuth, async (req, res) => {
        try {
            const pending = await tokenStore.getPendingCheckouts(req.user.uid);
            if (pending && pending.length) await settlePendingCheckouts(req.user.uid, pending);
            const account = await tokenStore.getBalance(req.user.uid);
            const price = await tokenPriceFor(req);
            res.setHeader('Cache-Control', 'private, no-store');
            res.json({
                balance: account ? account.balance : null,
                hasProfile: account ? account.exists : null,
                price,
                limits: pricing.TOKEN_LIMITS,
                minPayment: pricing.MIN_CARD_PAYMENT,
                maxPayment: pricing.MAX_CARD_PAYMENT,
                canPay: Boolean(getStripe()),
                isSuperAdmin: req.user.isSuperAdmin
            });
        } catch (e) {
            console.error('[Tokens] Balance error:', e);
            sendServerError(res, e);
        }
    });

    app.post('/api/tokens/checkout', requireAuth, async (req, res) => {
        try {
            const stripe = getStripe();
            if (!stripe) return res.status(503).json({ error: 'Card payments are not set up yet. Please try again later.' });
            const tokens = pricing.parseTokenQuantity(req.body && req.body.tokens);
            if (Number.isNaN(tokens)) return res.status(400).json({ error: `Choose at least ${pricing.TOKEN_LIMITS.min} tokens.` });
            const price = await tokenPriceFor(req);
            if (!price) return res.status(409).json({ error: 'Tokens are not on sale yet. Please try again later.' });
            const total = pricing.tokenTotal(price, tokens);
            if (total.amount < pricing.MIN_CARD_PAYMENT) return res.status(400).json({ error: `The smallest card payment is ${total.currency} $0.50, so please choose more tokens.` });
            if (total.amount > pricing.MAX_CARD_PAYMENT) return res.status(400).json({ error: `One card payment can be at most ${total.currency} $999,999.99, so please choose fewer tokens.` });

            // A payment can only be credited to a profile that can be reached, so nothing is sold without one
            const account = await tokenStore.getBalance(req.user.uid);
            if (!account) return res.status(503).json({ error: 'Token balances can\'t be reached right now, so nothing was charged. Please try again shortly.' });
            if (!account.exists) return res.status(409).json({ error: 'Your account isn\'t fully set up yet, so nothing was charged. Please sign out, sign in again, and try again.' });

            const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
            // Same-site paths only ("//host" would leave the site)
            const returnPath = typeof req.body.returnPath === 'string' && /^\/(?!\/)[A-Za-z0-9._~\-/]*$/.test(req.body.returnPath) ? req.body.returnPath : '/';
            const tokensText = tokens.toLocaleString('en-AU');
            const metadata = { tag: appTag, businessId: appTag, businessName: appName || appTag, source: appTag, kind: 'tokens', uid: req.user.uid, tokens: String(tokens) };
            const session = await stripe.checkout.sessions.create({
                mode: 'payment',
                line_items: [{
                    price_data: {
                        currency: total.currency.toLowerCase(),
                        product_data: { name: `${tokensText} tokens` },
                        unit_amount: Math.round(total.amount * 100)
                    },
                    quantity: 1
                }],
                customer_email: req.user.email || undefined,
                client_reference_id: req.user.uid,
                metadata,
                payment_intent_data: { metadata },
                success_url: `${origin}${returnPath}?tokens=success&session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${origin}${returnPath}?tokens=cancelled`
            });

            // Both best effort: the return page also confirms the payment by its session ID
            if (!(await tokenStore.addPendingCheckout(req.user.uid, session.id))) console.warn(`[Tokens] Could not list checkout ${session.id} as pending`);
            await recordTransaction(session.id, {
                amount: total.amount, currency: total.currency.toLowerCase(), paymentMethod: 'stripe', paymentType: 'tokens',
                status: 'initiated', description: `${tokensText} tokens (${pricing.formatPrice(total)})`, recordedAt: new Date().toISOString(),
                userId: req.user.uid, customerEmail: req.user.email, tokens
            });
            res.json({ url: session.url });
        } catch (e) {
            console.error('[Tokens] Checkout error:', e);
            sendServerError(res, e, 'Could not start the card payment. Please try again.');
        }
    });

    app.post('/api/tokens/confirm', requireAuth, async (req, res) => {
        const sessionId = String((req.body && req.body.sessionId) || '').trim();
        if (!tokenBalances.SESSION_PATTERN.test(sessionId)) return res.status(400).json({ error: 'sessionId is required.' });
        const stripe = getStripe();
        if (!stripe) return res.status(503).json({ error: 'Card payments are not set up yet.' });
        let session;
        try {
            session = await stripe.checkout.sessions.retrieve(sessionId);
        } catch (e) {
            return res.status(404).json({ error: 'Payment not found.' });
        }
        // Only the buyer can confirm, and only token checkouts
        if (!session.metadata || session.metadata.kind !== 'tokens' || session.metadata.uid !== req.user.uid) {
            return res.status(404).json({ error: 'Payment not found.' });
        }
        try {
            const result = await tokenStore.settleCheckout(session);
            await syncTokenTransaction(session, result.status);
            const account = await tokenStore.getBalance(req.user.uid);
            res.json({ status: result.status, tokens: result.tokens, balance: account ? account.balance : null });
        } catch (e) {
            console.error('[Tokens] Confirm error:', e);
            sendServerError(res, e, 'Your payment went through, but the tokens could not be added just now. Open Buy Tokens again in a minute to try again.');
        }
    });

    // reference is the app's own ID for the purchase, so sending the same one again never takes tokens twice.
    // 409 with the balance when there aren't enough tokens (nothing is taken)
    app.post('/api/tokens/spend', requireAuth, async (req, res) => {
        const body = req.body || {};
        const tokens = pricing.parseTokenQuantity(body.tokens, { min: 1 });
        if (Number.isNaN(tokens)) return res.status(400).json({ error: 'tokens must be a whole number, at least 1.' });
        if (!tokenBalances.APP_PATTERN.test(String(body.app || ''))) return res.status(400).json({ error: 'app must be the app\'s tag in lower case, e.g. "lms".' });
        if (!tokenBalances.REFERENCE_PATTERN.test(String(body.reference || ''))) return res.status(400).json({ error: 'reference must be the purchase ID in your app: up to 100 letters, numbers or _ . : -' });
        try {
            const result = await tokenStore.spendTokens({ uid: req.user.uid, tokens, app: body.app, reference: body.reference, description: body.description });
            if (result.status === 'insufficient') return res.status(409).json({ error: 'Not enough tokens.', status: result.status, balance: result.balance });
            res.json({ status: result.status, spent: tokens, balance: result.balance });
        } catch (e) {
            console.error('[Tokens] Spend error:', e);
            sendServerError(res, e, 'Tokens could not be spent just now, and none were taken. Please try again.');
        }
    });

    app.get('/api/tokens/accounts', requireSuperAdmin, async (req, res) => {
        try {
            const accounts = await tokenStore.listAccounts();
            if (!accounts) return res.status(503).json({ error: 'Accounts can\'t be reached right now. Please try again shortly.' });
            res.setHeader('Cache-Control', 'private, no-store');
            res.json({ accounts });
        } catch (e) {
            console.error('[Tokens] Accounts error:', e);
            sendServerError(res, e);
        }
    });

    // requestId is made once per click in the browser, so a retried request isn't added twice
    app.post('/api/tokens/grant', requireSuperAdmin, async (req, res) => {
        const body = req.body || {};
        const tokens = pricing.parseTokenQuantity(body.tokens, { min: 1 });
        if (Number.isNaN(tokens)) return res.status(400).json({ error: 'Enter a whole number of tokens, at least 1.' });
        if (!tokenBalances.UID_PATTERN.test(String(body.uid || ''))) return res.status(400).json({ error: 'Choose an account.' });
        if (!tokenBalances.REQUEST_ID_PATTERN.test(String(body.requestId || ''))) return res.status(400).json({ error: 'requestId is required.' });
        try {
            const result = await tokenStore.grantTokens({ uid: body.uid, tokens, requestId: body.requestId, grantedBy: req.user.email, note: body.note });
            const account = await tokenStore.getBalance(body.uid);
            res.json({ status: result.granted ? 'granted' : 'already-granted', tokens, balance: account ? account.balance : null });
        } catch (e) {
            if (/no profile/.test(e.message)) return res.status(404).json({ error: 'That account has no profile, so tokens can\'t be added to it.' });
            console.error('[Tokens] Grant error:', e);
            sendServerError(res, e, 'The tokens could not be added just now. Please try again.');
        }
    });

    app.get('/api/exchange-rates/usd-aud', requireSuperAdmin, async (req, res) => {
        try {
            const { rate, date } = await exchangeRates.usdToAud();
            res.json({ rate, date, source: 'Frankfurter' });
        } catch (e) {
            console.warn('[Exchange Rate] Lookup failed:', e.message);
            res.status(503).json({ error: 'Today\'s exchange rate could not be fetched.' });
        }
    });
}

module.exports = { mountTokenRoutes };
