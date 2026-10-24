/**
 * Token rules shared by the browser (window.TokenPricing) and the server (require), so both use the same limits,
 * the same price rule and the same totals. These must stay the same in every app that uses tokens.
 *
 * - One token costs the price set in AI Foundation's admin panel (Services & Pricing, "Tokens"), USD $1 by default.
 *   Visitors in Australia pay the AUD price when one is set; everyone else pays USD.
 * - Token prices keep their cents (AUD 1.43). Other prices in an app are whole dollars (decimals: 0).
 * - Buyers choose any whole number of tokens from 10, with no upper limit: the box starts at 10 and + / - change it
 *   by 10, and any amount from 10 can be typed.
 */
(function (root) {
    'use strict';

    // max only guards against typing mistakes (a billion tokens in one go)
    const TOKEN_LIMITS = { min: 10, max: 1000000000, step: 10, pricedPer: 1 };
    const DEFAULT_TOKEN_PRICE = { usd: 1, aud: null };
    const TOKEN_PRICE_DECIMALS = 2;
    const MAX_AMOUNT = 1000000;

    // Stripe's smallest and largest card payment, in USD and in AUD
    const MIN_CARD_PAYMENT = 0.5;
    const MAX_CARD_PAYMENT = 999999.99;

    // A price as a number, null when blank, or NaN when it isn't a price. Accepts numbers and text such as "1500",
    // "1,500" or "$1,499.95". Rounded to whole dollars by default (1,499.95 is 1,500), or to the cent with decimals: 2
    // (token prices: 1.4261 is 1.43). The result must be above 0 and at most MAX_AMOUNT
    function parseAmount(value, { decimals = 0 } = {}) {
        if (value === null || value === undefined) return null;
        let amount;
        if (typeof value === 'number') {
            amount = value;
        } else if (typeof value === 'string') {
            const text = value.trim().replace(/^\$\s*/, '');
            if (!text) return null;
            if (!/^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(text)) return NaN;
            amount = Number(text.replace(/,/g, ''));
        } else {
            return NaN;
        }
        if (!Number.isFinite(amount)) return NaN;
        const factor = 10 ** decimals;
        const rounded = Math.round(amount * factor) / factor;
        return rounded > 0 && rounded <= MAX_AMOUNT ? rounded : NaN;
    }

    // The price a visitor pays: AUD for visitors in Australia when an AUD price is set, otherwise USD.
    // { currency, amount }, or null when there is no price
    function resolvePrice(part, countryCode, { decimals = 0 } = {}) {
        const usd = parseAmount(part ? part.usd : null, { decimals });
        const aud = parseAmount(part ? part.aud : null, { decimals });
        if (String(countryCode || '').toUpperCase() === 'AU' && Number.isFinite(aud)) return { currency: 'AUD', amount: aud };
        return Number.isFinite(usd) ? { currency: 'USD', amount: usd } : null;
    }

    // "USD $1,500" or "AUD $14.30" (cents only when the amount has them)
    function formatPrice(price) {
        if (!price) return '';
        const hasCents = !Number.isInteger(price.amount);
        const amount = price.amount.toLocaleString('en-AU', { minimumFractionDigits: hasCents ? 2 : 0, maximumFractionDigits: 2 });
        return `${price.currency} $${amount}`;
    }

    // An AUD price for a USD price at an exchange rate (AUD per USD): whole dollars, or cents with decimals: 2.
    // null when the USD price isn't valid
    function convertUsdToAud(usd, rate, { decimals = 0 } = {}) {
        const amount = parseAmount(usd, { decimals });
        if (!Number.isFinite(amount) || !(rate > 0)) return null;
        const aud = parseAmount(amount * rate, { decimals });
        return Number.isFinite(aud) ? aud : null;
    }

    // A number of tokens as a whole number, or NaN when it isn't one from min to TOKEN_LIMITS.max or isn't a multiple of
    // multipleOf (1 unless given: purchases take any amount from TOKEN_LIMITS.min). Accepts "300" or "1,500" too
    function parseTokenQuantity(value, { min = TOKEN_LIMITS.min, multipleOf = 1 } = {}) {
        let quantity;
        if (typeof value === 'number') {
            quantity = value;
        } else if (typeof value === 'string' && /^\s*(?:\d{1,3}(?:,\d{3})+|\d+)\s*$/.test(value)) {
            quantity = Number(value.replace(/[,\s]/g, ''));
        } else {
            return NaN;
        }
        const valid = Number.isInteger(quantity) && quantity >= min && quantity <= TOKEN_LIMITS.max && quantity % multipleOf === 0;
        return valid ? quantity : NaN;
    }

    // The token price in use ({ usd, aud }, with cents) from AI Foundation's saved prices (system_settings/
    // aifoundation_service_prices, field prices): the saved USD price or the default USD $1, and the AUD price when set
    function tokenPricePart(prices) {
        const saved = (prices && prices.tokens && prices.tokens.perToken) || {};
        const usd = parseAmount(saved.usd, { decimals: TOKEN_PRICE_DECIMALS });
        const aud = parseAmount(saved.aud, { decimals: TOKEN_PRICE_DECIMALS });
        return { usd: Number.isFinite(usd) ? usd : DEFAULT_TOKEN_PRICE.usd, aud: Number.isFinite(aud) ? aud : null };
    }

    // The price of one token for a visitor ({ currency, amount }, with cents)
    function tokenPrice(prices, countryCode) {
        return resolvePrice(tokenPricePart(prices), countryCode, { decimals: TOKEN_PRICE_DECIMALS });
    }

    // What a number of tokens costs ({ currency, amount }), rounded to the cent
    function tokenTotal(pricePerToken, quantity) {
        if (!pricePerToken || !Number.isFinite(pricePerToken.amount) || !Number.isInteger(quantity)) return null;
        const cents = Math.round(Math.round(pricePerToken.amount * 100) * quantity / TOKEN_LIMITS.pricedPer);
        return { currency: pricePerToken.currency, amount: cents / 100 };
    }

    const api = {
        TOKEN_LIMITS, DEFAULT_TOKEN_PRICE, TOKEN_PRICE_DECIMALS, MAX_AMOUNT, MIN_CARD_PAYMENT, MAX_CARD_PAYMENT,
        parseAmount, resolvePrice, formatPrice, convertUsdToAud, parseTokenQuantity, tokenPricePart, tokenPrice, tokenTotal
    };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.TokenPricing = api;
})(typeof window !== 'undefined' ? window : globalThis);
