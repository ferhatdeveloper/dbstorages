/**
 * Default payment providers (polar + crypto; stripe off via PAYMENTS_DISABLED default)
 * and Polar mock checkoutUrl — no network.
 *
 * Run: node scripts/test-payments-providers.js
 */
const path = require('path');

const savedDisabled = process.env.PAYMENTS_DISABLED;
delete process.env.PAYMENTS_DISABLED;
delete process.env.POLAR_ACCESS_TOKEN;
delete process.env.POLAR_AGENT_IDENTITY_ASSERTION;
delete process.env.POLAR_PRODUCT_ID_ONCE;
delete process.env.POLAR_PRODUCT_ID_MONTH;
delete process.env.POLAR_PRODUCT_ID_YEAR;

const root = path.join(__dirname, '..');
const {
  listProviders,
  getProvider,
  getPackage,
  disabledProviderIds,
} = require(path.join(root, 'payments'));

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

const disabled = disabledProviderIds();
assert(disabled.has('stripe'), 'stripe disabled by PAYMENTS_DISABLED default');
assert(!disabled.has('polar'), 'polar enabled by default');
assert(!disabled.has('crypto'), 'crypto enabled by default');

const enabled = listProviders();
const ids = enabled.map((p) => p.id).sort();
assert(enabled.length === 2, `exactly 2 enabled providers, got ${enabled.length}`);
assert(
  ids[0] === 'crypto' && ids[1] === 'polar',
  `enabled providers polar+crypto, got: ${ids.join(', ')}`
);

const all = listProviders({ includeDisabled: true });
const stripe = all.find((p) => p.id === 'stripe');
assert(stripe && stripe.enabled === false, 'stripe present but disabled');

(async () => {
  const polar = getProvider('polar');
  assert(!polar.isConfigured(), 'polar not configured in test env');
  const plan = getPackage('pro');
  const result = await polar.createCheckout({
    plan,
    user: { id: 'u_test', email: 'pay@test.local' },
    successUrl: 'https://example.com/billing/success?session_id={CHECKOUT_SESSION_ID}',
    cancelUrl: 'https://example.com/billing/cancel',
    metadata: { tenantId: 'ten_test' },
  });
  assert(result.provider === 'polar', 'provider polar');
  assert(result.mock === true, 'polar mock checkout');
  assert(
    typeof result.checkoutUrl === 'string' && result.checkoutUrl.startsWith('http'),
    'checkoutUrl is http(s) string'
  );
  assert(result.checkoutUrl.includes('mock=1'), 'checkoutUrl includes mock=1');

  if (savedDisabled !== undefined) {
    process.env.PAYMENTS_DISABLED = savedDisabled;
  }

  if (failed) {
    console.error(`\ntest-payments-providers: ${failed} failure(s)`);
    process.exit(1);
  }
  console.log('\ntest-payments-providers: OK');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});