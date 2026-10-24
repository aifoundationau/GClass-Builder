// The Tokens tab: Buy Tokens, and Token Accounts for SuperAdmins. The markup is the sections of token-kit's
// public/tokens.html with every id unchanged, because public/tokens-ui.js finds its elements by id once, when it
// loads. So the files load once, after the markup is on the page, and App keeps this panel mounted (hidden) while
// other tabs are open. Sign-in comes from src/services/tokenAuthBridge.js.
import React, { memo, useEffect } from 'react';

// Raise a ?v= number whenever that file in public/ changes, so browsers load the new copy
const STYLESHEET = '/tokens.css?v=1';
const SCRIPTS = ['/token-pricing.js?v=1', '/tokens-ui.js?v=2']; // in this order: tokens-ui.js needs token-pricing.js

const MARKUP = `
<!-- Shown until the visitor signs in with Google -->
<section id="tokensSignedOut" class="tokens-card">
    <h2>Tokens</h2>
    <p class="tokens-intro">Sign in to see your token balance and buy tokens. Your tokens work in all our apps.</p>
    <button type="button" id="tokensSignInBtn" class="tokens-btn">Sign in with Google</button>
</section>

<div id="tokensSignedIn" hidden>
    <!-- BUY TOKENS -->
    <section id="buyTokensSection" class="tokens-card">
        <h2>Buy Tokens</h2>
        <p class="tokens-intro">Buy any number of tokens from 10, with no upper limit. Pay securely by card: tokens are added to your balance as soon as your payment goes through, and work in all our apps.</p>
        <div class="tokens-balance">
            <span>Your balance</span>
            <strong id="buyTokensBalance">...</strong>
        </div>
        <div class="tokens-picker">
            <button type="button" id="buyTokensLess" class="tokens-step" aria-label="10 fewer tokens">&minus;</button>
            <label class="tokens-amount">
                <input type="text" id="buyTokensAmount" inputmode="numeric" autocomplete="off" value="10" aria-label="Number of tokens" aria-describedby="buyTokensHint">
                <span>tokens</span>
            </label>
            <button type="button" id="buyTokensMore" class="tokens-step" aria-label="10 more tokens">+</button>
        </div>
        <p id="buyTokensHint" class="tokens-hint">Starts at 10. Press + to add 10 more each time (or &minus; to take 10 off), or type any amount from 10.</p>
        <div id="buyTokensTotal" class="tokens-total" aria-live="polite"></div>
        <button type="button" id="buyTokensPayBtn" class="tokens-btn tokens-btn-wide" disabled>Pay with Card</button>
        <div class="tokens-secure">Secure payments powered by Stripe</div>
        <div id="buyTokensStatus" class="tokens-status" role="status" style="display: none;"></div>
    </section>

    <!-- TOKEN ACCOUNTS: SuperAdmins only (tokens-ui.js shows it when the server says the user is a SuperAdmin) -->
    <section id="tokenAccountsSection" class="tokens-card" hidden>
        <h2>Token Accounts</h2>
        <p class="tokens-intro">Every account's token balance. One balance is shared by all your apps. Choose an account to add tokens to it.</p>
        <div class="token-accounts-layout">
            <div>
                <input type="search" id="tokenAccountsSearch" class="token-accounts-search" placeholder="Search by name, email or app" aria-label="Search accounts" autocomplete="off">
                <div id="tokenAccountsList" class="token-accounts-list"></div>
            </div>
            <div id="tokenGrantPanel" class="tokens-card token-grant-card" hidden>
                <div class="tokens-balance">
                    <span id="tokenGrantWho"></span>
                    <strong id="tokenGrantBalance"></strong>
                </div>
                <div class="tokens-picker">
                    <button type="button" id="tokenGrantLess" class="tokens-step" aria-label="10 fewer tokens">&minus;</button>
                    <label class="tokens-amount">
                        <input type="text" id="tokenGrantAmount" inputmode="numeric" autocomplete="off" value="10" aria-label="Number of tokens to add" aria-describedby="tokenGrantHint">
                        <span>tokens</span>
                    </label>
                    <button type="button" id="tokenGrantMore" class="tokens-step" aria-label="10 more tokens">+</button>
                </div>
                <p id="tokenGrantHint" class="tokens-hint">Starts at 10. Press + to add 10 more each time, or type any amount.</p>
                <button type="button" id="tokenGrantBtn" class="tokens-btn tokens-btn-wide" disabled>Add tokens</button>
            </div>
        </div>
        <div id="tokenAccountsStatus" class="tokens-status" role="status" style="display: none;"></div>
    </section>
</div>`;

function load(tag, attributes, parent) {
  return new Promise((resolve, reject) => {
    const element = Object.assign(document.createElement(tag), attributes);
    element.onload = resolve;
    element.onerror = () => reject(new Error(`Could not load ${attributes.src || attributes.href}`));
    parent.appendChild(element);
  });
}

// Once per page: the stylesheet, and the scripts one after the other
let loading = null;
function loadTokenFiles() {
  if (!loading) {
    load('link', { rel: 'stylesheet', href: STYLESHEET }, document.head)
      .catch(e => console.error('[Tokens]', e.message));
    loading = SCRIPTS.reduce((previous, src) => previous.then(() => load('script', { src }, document.body)), Promise.resolve())
      .catch(e => console.error('[Tokens]', e.message));
  }
  return loading;
}

function TokensPanel({ hidden }) {
  useEffect(() => {
    loadTokenFiles();
  }, []);

  // The outer div is hidden by the browser's own [hidden] rule; the inner one is laid out by .tokens-panel
  return (
    <div hidden={hidden}>
      <div className="tokens-panel animate-fade-in" dangerouslySetInnerHTML={{ __html: MARKUP }} />
    </div>
  );
}

export default memo(TokensPanel);
