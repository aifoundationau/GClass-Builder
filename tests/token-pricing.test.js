// Token rules shared by the browser and the server (public/token-pricing.js). Usage: npm test
const { test } = require('node:test');
const assert = require('node:assert/strict');
const pricing = require('../public/token-pricing');

test('limits: start at 10, steps of 10, priced per token, USD $1 by default', () => {
    assert.deepEqual(pricing.TOKEN_LIMITS, { min: 10, max: 1000000000, step: 10, pricedPer: 1 });
    assert.deepEqual(pricing.DEFAULT_TOKEN_PRICE, { usd: 1, aud: null });
    assert.equal(pricing.MIN_CARD_PAYMENT, 0.5);
    assert.equal(pricing.MAX_CARD_PAYMENT, 999999.99);
});

test('parseAmount: whole dollars by default, cents with decimals: 2', () => {
    assert.equal(pricing.parseAmount('$1,499.95'), 1500);
    assert.equal(pricing.parseAmount('1,500'), 1500);
    assert.equal(pricing.parseAmount('1.4261', { decimals: 2 }), 1.43);
    assert.equal(pricing.parseAmount('0.01', { decimals: 2 }), 0.01);
    for (const value of ['', '   ', null, undefined]) assert.equal(pricing.parseAmount(value), null);
    for (const value of ['0', '0.4', '-5', 'abc', '1e3', '1,50', '1000000.5', true, {}]) {
        assert.ok(Number.isNaN(pricing.parseAmount(value)), JSON.stringify(value));
    }
});

test('parseTokenQuantity: purchases take any whole number from 10; multipleOf when asked; spends and grants can allow 1', () => {
    assert.equal(pricing.parseTokenQuantity('10'), 10);
    assert.equal(pricing.parseTokenQuantity('1,500'), 1500);
    assert.equal(pricing.parseTokenQuantity(15), 15);
    assert.equal(pricing.parseTokenQuantity('37'), 37);
    for (const value of ['9', '0', '15.5', '-10', 'abc', 1000000001, null]) assert.ok(Number.isNaN(pricing.parseTokenQuantity(value)), String(value));
    const tens = { multipleOf: pricing.TOKEN_LIMITS.step };
    assert.equal(pricing.parseTokenQuantity('20', tens), 20);
    assert.ok(Number.isNaN(pricing.parseTokenQuantity('25', tens)));
    assert.equal(pricing.parseTokenQuantity('1', { min: 1 }), 1);
});

test('tokenPrice: the saved price, USD $1 when the USD box is blank, AUD only in Australia and only when set', () => {
    const saved = { tokens: { perToken: { usd: 1, aud: 1.43 } } };
    assert.deepEqual(pricing.tokenPrice(saved, 'AU'), { currency: 'AUD', amount: 1.43 });
    assert.deepEqual(pricing.tokenPrice(saved, 'US'), { currency: 'USD', amount: 1 });
    assert.deepEqual(pricing.tokenPrice(saved, ''), { currency: 'USD', amount: 1 });
    assert.deepEqual(pricing.tokenPrice(null, 'AU'), { currency: 'USD', amount: 1 });
    assert.deepEqual(pricing.tokenPrice({ tokens: { perToken: { usd: null, aud: 2.5 } } }, 'AU'), { currency: 'AUD', amount: 2.5 });
    assert.deepEqual(pricing.tokenPrice({ tokens: { perToken: { usd: 0.99, aud: null } } }, 'AU'), { currency: 'USD', amount: 0.99 });
});

test('tokenTotal: tokens times the price per token, rounded to the cent', () => {
    assert.deepEqual(pricing.tokenTotal({ currency: 'AUD', amount: 1.43 }, 10), { currency: 'AUD', amount: 14.3 });
    assert.deepEqual(pricing.tokenTotal({ currency: 'AUD', amount: 1.43 }, 30), { currency: 'AUD', amount: 42.9 });
    assert.deepEqual(pricing.tokenTotal({ currency: 'USD', amount: 1 }, 5000), { currency: 'USD', amount: 5000 });
    assert.equal(pricing.tokenTotal(null, 10), null);
});

test('convertUsdToAud and formatPrice', () => {
    assert.equal(pricing.convertUsdToAud('2200', 1.4261), 3137);
    assert.equal(pricing.convertUsdToAud('1', 1.4261, { decimals: 2 }), 1.43);
    assert.equal(pricing.convertUsdToAud('abc', 1.4261), null);
    assert.equal(pricing.formatPrice({ currency: 'USD', amount: 1500 }), 'USD $1,500');
    assert.equal(pricing.formatPrice({ currency: 'AUD', amount: 14.3 }), 'AUD $14.30');
});
