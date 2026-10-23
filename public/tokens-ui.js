// Buy Tokens (everyone signed in) and Token Accounts (SuperAdmins only), for the markup in tokens.html.
// Needs token-pricing.js (window.TokenPricing) and firebase-client.js (sign-in, and the ID token on /api/ requests).
(function () {
    'use strict';
    const pricing = window.TokenPricing;
    const $ = id => document.getElementById(id);

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }

    function setStatus(element, message, type = 'info') {
        if (!element) return;
        element.style.display = message ? 'block' : 'none';
        element.className = `tokens-status is-${type}`;
        element.textContent = message || '';
    }

    // The - / amount / + controls. The amount starts at 10 and each press moves it to the next or previous 10, with no
    // upper limit. Any whole number can be typed; with wholeSteps (Buy Tokens: tokens are bought 10 at a time) it's
    // rounded up to a multiple of 10 on leaving the box. onChange runs after every change
    function setupTokenStepper({ input, less, more, onChange, wholeSteps = false }) {
        const limits = () => pricing.TOKEN_LIMITS;
        const typed = () => parseInt(String(input.value).replace(/\D/g, ''), 10);

        function refresh() {
            const value = typed();
            less.disabled = !(value > limits().min);
            more.disabled = value >= limits().max;
            onChange();
        }

        function step(direction) {
            const { min, max, step: by } = limits();
            const value = typed();
            const current = Number.isFinite(value) ? value : 0;
            // 15 goes up to 20 and down to 10, so the amount lands on a multiple of 10
            const next = direction > 0 ? Math.floor(current / by) * by + by : Math.ceil(current / by) * by - by;
            input.value = String(Math.min(max, Math.max(min, next)));
            refresh();
        }

        input.addEventListener('input', () => {
            const digits = input.value.replace(/\D/g, '');
            if (digits !== input.value) input.value = digits;
            refresh();
        });
        input.addEventListener('blur', () => {
            const { min, max, step: by } = limits();
            const value = typed();
            const rounded = wholeSteps && Number.isFinite(value) ? Math.ceil(value / by) * by : value;
            input.value = String(Number.isFinite(rounded) ? Math.min(max, Math.max(min, rounded)) : min);
            refresh();
        });
        less.addEventListener('click', () => step(-1));
        more.addEventListener('click', () => step(1));
        refresh();
        return { refresh };
    }

    // ---------- Buy Tokens ----------
    const buyBalance = $('buyTokensBalance');
    const buyAmount = $('buyTokensAmount');
    const buyTotal = $('buyTokensTotal');
    const buyPayBtn = $('buyTokensPayBtn');
    const buyStatus = $('buyTokensStatus');
    let buyData = null; // last answer from GET /api/tokens
    let buyBusy = false;
    let buyStepper = null;

    // Back from Stripe: ?tokens=success&session_id=cs_... or ?tokens=cancelled, confirmed on the next load
    const params = new URLSearchParams(window.location.search);
    let stripeReturn = null;
    if (params.get('tokens') === 'success' && params.get('session_id')) stripeReturn = { sessionId: params.get('session_id') };
    else if (params.get('tokens') === 'cancelled') stripeReturn = { cancelled: true };
    if (stripeReturn) window.history.replaceState({}, document.title, window.location.pathname);

    function renderBuyTotal() {
        const quantity = pricing.parseTokenQuantity(buyAmount.value, { multipleOf: pricing.TOKEN_LIMITS.step });
        const price = buyData && buyData.price;
        buyPayBtn.innerHTML = 'Pay with Card';
        if (Number.isNaN(quantity)) {
            buyTotal.textContent = 'Tokens are bought 10 at a time: enter 10, 20, 30 and so on.';
            buyPayBtn.disabled = true;
            return;
        }
        if (!price) {
            buyTotal.textContent = '';
            buyPayBtn.disabled = true;
            return;
        }
        const total = pricing.tokenTotal(price, quantity);
        let problem = '';
        if (total.amount < buyData.minPayment) problem = `The smallest card payment is ${total.currency} $0.50, so please choose more tokens.`;
        else if (total.amount > buyData.maxPayment) problem = `One card payment can be at most ${total.currency} $999,999.99, so please choose fewer tokens.`;
        buyTotal.innerHTML = `
            <strong>${escapeHtml(pricing.formatPrice(total))}</strong> for ${quantity.toLocaleString('en-AU')} tokens
            <span class="tokens-rate">${escapeHtml(pricing.formatPrice(price))} per token</span>
            ${problem ? `<span class="tokens-rate">${escapeHtml(problem)}</span>` : ''}`;
        buyPayBtn.innerHTML = `Pay ${escapeHtml(pricing.formatPrice(total))}`;
        buyPayBtn.disabled = buyBusy || Boolean(problem) || !buyData.canPay || buyData.balance === null || buyData.hasProfile === false;
    }

    function confirmMessage(data) {
        const tokensText = `${Number(data.tokens).toLocaleString('en-AU')} tokens`;
        if (data.status === 'credited') return { text: `Payment received: ${tokensText} added to your balance. Thank you!`, type: 'ok' };
        if (data.status === 'already-credited') return { text: `Payment received: ${tokensText} are in your balance.`, type: 'ok' };
        if (data.status === 'expired') return { text: 'That payment was not completed, so you were not charged and no tokens were added.', type: 'error' };
        return { text: 'Your payment is still being processed. The tokens will appear here once Stripe confirms it.', type: 'info' };
    }

    async function loadBuyTokens() {
        const returned = stripeReturn;
        stripeReturn = null;
        buyPayBtn.disabled = true;
        buyBalance.textContent = '...';
        setStatus(buyStatus, returned && returned.sessionId ? 'Checking your payment...' : '');

        let notice = returned && returned.cancelled ? { text: 'Payment cancelled. You were not charged and no tokens were bought.', type: 'info' } : null;
        if (returned && returned.sessionId) {
            try {
                const res = await fetch('/api/tokens/confirm', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId: returned.sessionId })
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                notice = confirmMessage(data);
            } catch (e) {
                notice = { text: `Your payment could not be confirmed yet: ${e.message}`, type: 'error' };
            }
        }

        try {
            const res = await fetch('/api/tokens');
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(String(data.error || `HTTP ${res.status}`).replace(/\.$/, ''));
            buyData = data;
        } catch (e) {
            buyData = null;
            buyBalance.textContent = '-';
            setStatus(buyStatus, notice ? notice.text : `Could not load your tokens: ${e.message}. Please try again.`, notice ? notice.type : 'error');
            buyStepper.refresh();
            return;
        }

        buyBalance.textContent = buyData.balance === null ? 'Unavailable right now' : `${buyData.balance.toLocaleString('en-AU')} tokens`;
        if (!notice && !buyData.canPay) notice = { text: 'Card payments are not set up yet, so tokens can\'t be bought right now.', type: 'info' };
        if (!notice && buyData.balance === null) notice = { text: 'Your token balance can\'t be reached right now, so buying is paused. Please try again shortly.', type: 'error' };
        if (!notice && buyData.hasProfile === false) notice = { text: 'Your account isn\'t fully set up yet. Please sign out and sign in again to buy tokens.', type: 'info' };
        setStatus(buyStatus, notice ? notice.text : '', notice ? notice.type : 'info');
        buyStepper.refresh();

        // Token Accounts is for SuperAdmins only (the server checks this too)
        const accountsSection = $('tokenAccountsSection');
        if (accountsSection) {
            accountsSection.hidden = !buyData.isSuperAdmin;
            if (buyData.isSuperAdmin) loadTokenAccounts();
        }
    }

    if (buyAmount) {
        buyStepper = setupTokenStepper({ input: buyAmount, less: $('buyTokensLess'), more: $('buyTokensMore'), onChange: renderBuyTotal, wholeSteps: true });
        buyPayBtn.addEventListener('click', async () => {
            const quantity = pricing.parseTokenQuantity(buyAmount.value, { multipleOf: pricing.TOKEN_LIMITS.step });
            if (Number.isNaN(quantity) || buyBusy) return;
            buyBusy = true;
            buyPayBtn.disabled = true;
            buyPayBtn.textContent = 'Opening secure payment...';
            setStatus(buyStatus, '');
            try {
                const res = await fetch('/api/tokens/checkout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tokens: quantity, returnPath: window.location.pathname })
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok || !data.url) throw new Error(data.error || `HTTP ${res.status}`);
                window.location.href = data.url;
            } catch (e) {
                buyBusy = false;
                setStatus(buyStatus, `Could not start the payment: ${String(e.message).replace(/\.$/, '')}.`, 'error');
                renderBuyTotal();
            }
        });
    }

    // ---------- Token Accounts (SuperAdmin) ----------
    const accountsSearch = $('tokenAccountsSearch');
    const accountsList = $('tokenAccountsList');
    const accountsStatus = $('tokenAccountsStatus');
    const grantPanel = $('tokenGrantPanel');
    const grantAmount = $('tokenGrantAmount');
    const grantBtn = $('tokenGrantBtn');
    let accounts = [];
    let selectedUid = null;
    let grantBusy = false;

    const accountLabel = a => a.name || a.email || a.uid;

    function renderAccounts() {
        const query = accountsSearch.value.trim().toLowerCase();
        const shown = accounts.filter(a => !query || `${a.name} ${a.email} ${a.app}`.toLowerCase().includes(query));
        if (!shown.length) {
            accountsList.innerHTML = `<p class="token-accounts-empty">${accounts.length ? 'No accounts match your search.' : 'No accounts to show.'}</p>`;
            return;
        }
        accountsList.innerHTML = shown.map(a => `
            <button type="button" class="token-account-row${a.uid === selectedUid ? ' is-selected' : ''}" data-uid="${escapeHtml(a.uid)}" aria-pressed="${a.uid === selectedUid}">
                <span class="token-account-who">
                    <strong>${escapeHtml(accountLabel(a))}</strong>
                    ${a.name && a.email ? `<small>${escapeHtml(a.email)}</small>` : ''}
                </span>
                ${a.app ? `<span class="token-account-app">${escapeHtml(a.app)}</span>` : ''}
                <span class="token-account-balance">${a.balance.toLocaleString('en-AU')} <small>tokens</small></span>
            </button>`).join('');
    }

    function renderGrant() {
        const account = accounts.find(a => a.uid === selectedUid);
        grantPanel.hidden = !account;
        if (!account) return;
        $('tokenGrantWho').textContent = accountLabel(account);
        $('tokenGrantBalance').textContent = `${account.balance.toLocaleString('en-AU')} tokens`;
        const quantity = pricing.parseTokenQuantity(grantAmount.value);
        grantBtn.disabled = grantBusy || Number.isNaN(quantity);
        grantBtn.textContent = grantBusy ? 'Adding...' : `Add ${Number.isNaN(quantity) ? '' : `${quantity.toLocaleString('en-AU')} `}tokens`;
    }

    async function loadTokenAccounts() {
        setStatus(accountsStatus, 'Loading accounts...');
        try {
            const res = await fetch('/api/tokens/accounts');
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(String(data.error || `HTTP ${res.status}`).replace(/\.$/, ''));
            accounts = Array.isArray(data.accounts) ? data.accounts : [];
            setStatus(accountsStatus, '');
        } catch (e) {
            setStatus(accountsStatus, `Could not load the accounts: ${e.message}.`, 'error');
        }
        renderAccounts();
        renderGrant();
    }

    // A new ID per click, so the server never adds the same click twice
    function newRequestId() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
        return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    }

    if (accountsList) {
        accountsSearch.addEventListener('input', renderAccounts);
        accountsList.addEventListener('click', (e) => {
            const row = e.target.closest('.token-account-row');
            if (!row) return;
            selectedUid = row.dataset.uid;
            setStatus(accountsStatus, '');
            renderAccounts();
            renderGrant();
            grantPanel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
        setupTokenStepper({ input: grantAmount, less: $('tokenGrantLess'), more: $('tokenGrantMore'), onChange: renderGrant });
        grantBtn.addEventListener('click', async () => {
            const account = accounts.find(a => a.uid === selectedUid);
            const tokens = pricing.parseTokenQuantity(grantAmount.value);
            if (!account || Number.isNaN(tokens) || grantBusy) return;
            grantBusy = true;
            renderGrant();
            setStatus(accountsStatus, '');
            try {
                const res = await fetch('/api/tokens/grant', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ uid: account.uid, tokens, requestId: newRequestId() })
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                if (typeof data.balance === 'number') account.balance = data.balance;
                setStatus(accountsStatus, `Added ${tokens.toLocaleString('en-AU')} tokens to ${accountLabel(account)}. Their balance is now ${account.balance.toLocaleString('en-AU')} tokens.`, 'ok');
            } catch (e) {
                setStatus(accountsStatus, `Could not add the tokens: ${String(e.message).replace(/\.$/, '')}.`, 'error');
            } finally {
                grantBusy = false;
                renderAccounts();
                renderGrant();
            }
        });
    }

    // ---------- Signed in / signed out ----------
    const signedOut = $('tokensSignedOut');
    const signedIn = $('tokensSignedIn');
    const signInBtn = $('tokensSignInBtn');
    if (signInBtn) signInBtn.addEventListener('click', () => window.appAuth && window.appAuth.signIn());

    function showSignIn(user) {
        if (signedOut) signedOut.hidden = Boolean(user);
        if (signedIn) signedIn.hidden = !user;
        if (user && buyStepper) loadBuyTokens();
    }
    window.addEventListener('appAuthChanged', (e) => showSignIn(e.detail && e.detail.user));
    // Sign-in may have been restored before this script ran
    if (window.appAuthState) showSignIn(window.appAuthState.user);
})();
