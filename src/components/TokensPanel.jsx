// The Tokens tab: Buy Tokens, and Token Accounts for SuperAdmins. The markup is the sections of token-kit's
// public/tokens.html with every id unchanged, because public/tokens-ui.js finds its elements by id once, when it
// loads. So the files load once, after the markup is on the page, and App keeps this panel mounted (hidden) while
// other tabs are open. Sign-in comes from src/services/tokenAuthBridge.js.
import React, { memo, useEffect } from 'react';

// Raise a ?v= number whenever that file in public/ changes, so browsers load the new copy
const STYLESHEET = '/tokens.css?v=2';
const SCRIPTS = ['/token-pricing.js?v=1', '/tokens-ui.js?v=3']; // in this order: tokens-ui.js needs token-pricing.js

const MARKUP = `
<!-- Shown until the visitor signs in with Google -->
<section id="tokensSignedOut" class="tokens-card">
    <h2>Tokens</h2>
    <p class="tokens-intro">Sign in to see your token balance and buy tokens. Your tokens work in all our apps.</p>
    <button type="button" id="tokensSignInBtn" class="tokens-btn">Sign in with Google</button>
</section>

<div id="tokensSignedIn" hidden>
    <div class="tokens-boxes-grid">
        <!-- BOX 1: BUY TOKENS -->
        <details id="buyTokensSection" class="tokens-card tokens-collapsible" open>
            <summary class="tokens-summary" data-agent-id="summary-buy-tokens" data-testid="summary-buy-tokens">
                <span class="tokens-summary-title">Buy Tokens</span>
                <span class="tokens-chevron" aria-hidden="true">▾</span>
            </summary>
            <div class="tokens-card-body">
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
            </div>
        </details>

        <!-- BOX 2: TOKEN PRICE SETTINGS (SuperAdmins only) -->
        <details id="tokenPricingSection" class="tokens-card tokens-collapsible" data-agent-id="token-pricing-admin-section" data-testid="token-pricing-admin-section" hidden open>
            <summary class="tokens-summary" data-agent-id="summary-token-pricing" data-testid="summary-token-pricing">
                <span class="tokens-summary-title">Token Price Settings</span>
                <span class="tokens-chevron" aria-hidden="true">▾</span>
            </summary>
            <div class="tokens-card-body">
                <p class="tokens-intro">Set the baseline USD price for 1 token across all applications in AI Foundation. The AUD price converts automatically at today's exchange rate.</p>
                <div class="token-pricing-admin-grid">
                    <div class="token-pricing-field">
                        <label for="adminTokenPriceUsd">
                            <span>1 Token = USD Price ($)</span>
                            <small>Baseline price in US Dollars</small>
                        </label>
                        <div class="token-pricing-input-wrap">
                            <span class="currency-prefix">USD $</span>
                            <input type="number" id="adminTokenPriceUsd" step="0.01" min="0.01" max="1000000" placeholder="1.00" data-agent-id="input-token-price-usd" data-testid="input-token-price-usd" aria-label="USD price per token">
                        </div>
                    </div>
                    <div class="token-pricing-field">
                        <label for="adminTokenPriceAud">
                            <span>Converted AUD Price ($)</span>
                            <small id="adminExchangeRateHint">Calculated via live exchange rate</small>
                        </label>
                        <div class="token-pricing-input-wrap">
                            <span class="currency-prefix">AUD $</span>
                            <input type="number" id="adminTokenPriceAud" step="0.01" min="0.01" max="1000000" placeholder="Auto-converted" data-agent-id="input-token-price-aud" data-testid="input-token-price-aud" aria-label="AUD price per token">
                        </div>
                    </div>
                </div>
                <div class="token-pricing-meta" id="adminTokenPriceMeta">
                    <span id="adminExchangeRateInfo">Exchange rate: Loading live rate...</span>
                    <span id="adminPriceLastUpdated"></span>
                </div>
                <div class="token-pricing-actions">
                    <button type="button" id="adminSaveTokenPriceBtn" class="tokens-btn" data-agent-id="btn-save-token-price" data-testid="btn-save-token-price" aria-label="Save Token Price">Save Token Price</button>
                    <button type="button" id="adminResetTokenPriceBtn" class="tokens-step" data-agent-id="btn-reset-token-price" data-testid="btn-reset-token-price" aria-label="Reset to Default" title="Reset to USD $1.00" style="width: auto; padding: 0 16px; font-size: 0.88rem; font-weight: 600;">Reset to $1.00</button>
                </div>
                <div id="tokenPricingStatus" class="tokens-status" role="status" style="display: none;" data-agent-id="status-token-pricing" data-testid="status-token-pricing"></div>
            </div>
        </details>

        <!-- BOX 3: TOKEN ACCOUNTS (SuperAdmins only) -->
        <details id="tokenAccountsSection" class="tokens-card tokens-collapsible" data-agent-id="token-accounts-admin-section" data-testid="token-accounts-admin-section" hidden open>
            <summary class="tokens-summary" data-agent-id="summary-token-accounts" data-testid="summary-token-accounts">
                <span class="tokens-summary-title">Token Accounts</span>
                <span class="tokens-chevron" aria-hidden="true">▾</span>
            </summary>
            <div class="tokens-card-body">
                <p class="tokens-intro">Every account's token balance. Choose an account to add tokens to it.</p>
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
            </div>
        </details>
    </div>
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
