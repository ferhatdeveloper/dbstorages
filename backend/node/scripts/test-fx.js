/**
 * Unit tests for FX conversion helpers (no network).
 * Run: node scripts/test-fx.js
 */

const assert = require('assert');
const path = require('path');
const fx = require(path.join(__dirname, '../lib/fx'));

const rates = { EUR: 1, USD: 1.1, TRY: 44 };

function almostEqual(a, b, eps = 1e-9) {
  assert.ok(Math.abs(a - b) < eps, `expected ${a} ≈ ${b}`);
}

// identity
almostEqual(fx.convert(10, 'EUR', 'EUR', rates), 10);
almostEqual(fx.convert(10, 'usd', 'USD', rates), 10);

// EUR → USD / TRY
almostEqual(fx.convert(10, 'EUR', 'USD', rates), 11);
almostEqual(fx.convert(10, 'EUR', 'TRY', rates), 440);

// USD → EUR / TRY
almostEqual(fx.convert(11, 'USD', 'EUR', rates), 10);
almostEqual(fx.convert(11, 'USD', 'TRY', rates), 440);

// TRY → EUR / USD
almostEqual(fx.convert(440, 'TRY', 'EUR', rates), 10);
almostEqual(fx.convert(440, 'TRY', 'USD', rates), 11);

// cents: Pro $34 → EUR at 1.1
assert.strictEqual(fx.convertCents(3400, 'USD', 'EUR', rates), 3091);
assert.strictEqual(fx.convertCents(3400, 'USD', 'USD', rates), 3400);
assert.strictEqual(fx.convertCents(3400, 'USD', 'TRY', rates), 136000);

// VPN €5.99 → USD
assert.strictEqual(fx.convertCents(599, 'EUR', 'USD', rates), 659);

// invalid
assert.strictEqual(fx.convert(NaN, 'EUR', 'USD', rates), null);
assert.strictEqual(fx.convert(10, 'EUR', 'GBP', rates), null);
assert.strictEqual(fx.convertCents(null, 'EUR', 'USD', rates), null);

// normalize
assert.strictEqual(fx.normalizeCurrency('eur'), 'EUR');
assert.strictEqual(fx.normalizeCurrency(''), 'EUR');

// static fallback shape
assert.ok(fx.isValidRates(fx.STATIC_FALLBACK.rates));
assert.strictEqual(fx.STATIC_FALLBACK.base, 'EUR');

// sync always returns usable rates
const sync = fx.getRatesSync();
assert.ok(fx.isValidRates(sync.rates));
assert.strictEqual(sync.base, 'EUR');

console.log('test-fx: ok');
