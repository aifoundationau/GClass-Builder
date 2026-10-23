/**
 * USD to AUD exchange rate (for apps with their own price boxes)
 * Typing a USD price in an admin price box fills its AUD box at today's rate. The rate comes from Frankfurter
 * (https://frankfurter.dev, free, no key) through GET /api/exchange-rates/usd-aud, so the browser never calls it directly.
 * The rate is kept for an hour; when Frankfurter can't be reached, the last rate fetched is used instead.
 */

const RATE_URL = 'https://api.frankfurter.dev/v2/rate/USD/AUD';
const CACHE_MS = 60 * 60 * 1000;
const TIMEOUT_MS = 5000;

// A rate outside this range is a bad answer, not a real AUD per USD rate
const MIN_SANE_RATE = 0.5;
const MAX_SANE_RATE = 5;

function createExchangeRates({ fetchImpl = (...args) => fetch(...args), now = () => Date.now() } = {}) {
    let cached = null; // { rate, date, fetchedAt }

    // { rate, date } with rate in AUD per 1 USD and date the day Frankfurter's rate is for. Throws when there is no rate at all
    async function usdToAud() {
        if (cached && now() - cached.fetchedAt < CACHE_MS) return { rate: cached.rate, date: cached.date };
        try {
            const res = await fetchImpl(RATE_URL, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
            if (!res.ok) throw new Error(`Frankfurter answered HTTP ${res.status}`);
            const data = await res.json();
            const rate = Number(data && data.rate);
            if (data.base !== 'USD' || data.quote !== 'AUD' || !(rate >= MIN_SANE_RATE && rate <= MAX_SANE_RATE)) {
                throw new Error('Frankfurter sent an unexpected rate');
            }
            cached = { rate, date: String(data.date || ''), fetchedAt: now() };
        } catch (e) {
            if (!cached) throw e;
            console.warn('[Exchange Rate] Using the last rate fetched:', e.message);
        }
        return { rate: cached.rate, date: cached.date };
    }

    return { usdToAud };
}

module.exports = { createExchangeRates, RATE_URL };
