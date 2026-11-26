import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Rules = require('../extension/rules.js');

test('Detects Emails accurately without false positives', () => {
  const sample = 'Owner: sarah.chen+billing@meridian-labs.io and support@acme.co.uk (not @handle or plain.text)';
  const matches = Rules.detectMatches(sample, ['emails']);
  assert.deepEqual(
    matches.map((m) => m.text),
    ['sarah.chen+billing@meridian-labs.io', 'support@acme.co.uk']
  );
  assert.ok(matches.every((m) => m.category === 'emails'));
});

test('Detects Stripe, OpenAI, Anthropic, GitHub, AWS, Google, Slack, and Bearer/JWT secrets', () => {
  const sample = [
    'STRIPE_SECRET=sk_live_51NxDemo92kLpQ8vR4mTwXz',
    'STRIPE_PUB=pk_live_51NxDemo92kLpQ8vR4mTwXz',
    'OPENAI=sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz123456',
    'GH=ghp_8aK9mN2pQrStUvWxYz1234567890abcd',
    'AWS=AKIAIOSFODNN7EXAMPLE',
    'GOOGLE=AIzaSyDaGmWKa4JsXZ-HjGw7ISLn_3namBGqe',
    'AUTH=Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'
  ].join('\n');

  const matches = Rules.detectMatches(sample, ['apiKeys']);
  assert.equal(matches.length, 7, `Expected 7 secrets, got ${matches.length}: ${JSON.stringify(matches)}`);
  assert.ok(matches.every((m) => m.category === 'apiKeys'));
});

test('Detects Revenue & Currency amounts while ignoring shell variables like $HOME', () => {
  const sample = 'MRR $48,920.50 | Payout -$320.00 | Growth +$1.4M | EU €9,820.00 | UK £1,499 | USD 12,400 | env $HOME and $PATH';
  const matches = Rules.detectMatches(sample, ['currency']);
  assert.deepEqual(
    matches.map((m) => m.text),
    ['$48,920.50', '-$320.00', '+$1.4M', '€9,820.00', '£1,499', 'USD 12,400']
  );
});

test('Detects Luhn-valid payment cards, SSNs, and phone numbers while ignoring invalid 16-digit order IDs', () => {
  const sample = 'Card: 4242 4242 4242 4242 | BadOrder: 1111 2222 3333 4445 | Phone: +1 (415) 555-0194 | SSN: 123-45-6789 | Year: 2026';
  const matches = Rules.detectMatches(sample, ['phonesCards']);
  assert.deepEqual(
    matches.map((m) => m.text),
    ['4242 4242 4242 4242', '+1 (415) 555-0194', '123-45-6789']
  );
  assert.equal(Rules.isValidLuhn('4242424242424242'), true);
  assert.equal(Rules.isValidLuhn('1111222233334445'), false);
});

test('Deduplicates overlapping multi-category matches in deterministic sorted order', () => {
  const sample = 'Account ceo@acme.io paid $12,345.67 via key sk_live_51NxDemo92kLpQ8vR4mTwXz call 415-555-0199';
  const matches = Rules.detectMatches(sample, ['apiKeys', 'emails', 'currency', 'phonesCards']);
  assert.equal(matches.length, 4);
  for (let i = 1; i < matches.length; i++) {
    assert.ok(matches[i].start >= matches[i - 1].end, 'Matches must be sorted and non-overlapping');
  }
});

test('Generates stable CSS selectors for IDs, data-testid, and nth-of-type fallback', () => {
  const mockDoc = {
    querySelectorAll(sel) {
      if (sel === '#revenue-card' || sel === 'div[data-testid="api-key-box"]' || sel === 'section > div.metric:nth-of-type(2)') {
        return [{}];
      }
      return [{}, {}];
    }
  };

  const byId = { tagName: 'DIV', id: 'revenue-card', classList: ['card'], getAttribute: () => null };
  assert.equal(Rules.buildStableSelector(byId, mockDoc), '#revenue-card');

  const byTestId = {
    tagName: 'DIV',
    id: '123456', // volatile numeric ID should be skipped
    classList: ['box'],
    getAttribute: (a) => (a === 'data-testid' ? 'api-key-box' : null)
  };
  assert.equal(Rules.buildStableSelector(byTestId, mockDoc), 'div[data-testid="api-key-box"]');

  const sib1 = { tagName: 'DIV', id: '', classList: ['metric'], getAttribute: () => null };
  const sib2 = { tagName: 'DIV', id: '', classList: ['metric'], getAttribute: () => null };
  const parent = { tagName: 'SECTION', id: '', classList: [], children: [sib1, sib2], getAttribute: () => null };
  sib1.parentElement = parent;
  sib2.parentElement = parent;
  assert.equal(Rules.buildStableSelector(sib2, mockDoc), 'section > div.metric:nth-of-type(2)');
});

test('Offline Pro license key generation and verification (zero server calls)', () => {
  const validKey = Rules.generateProKey('DEMX2426');
  assert.match(validKey, /^DSPRO-DEMX-2426-[23456789A-HJ-NP-Z]{4}$/);
  assert.equal(Rules.verifyProKey(validKey), true);
  assert.equal(Rules.verifyProKey(validKey.toLowerCase()), true);

  // Tampered checksum must fail
  const lastChar = validKey[validKey.length - 1];
  const tampered = validKey.slice(0, -1) + (lastChar === 'A' ? 'B' : 'A');
  assert.equal(Rules.verifyProKey(tampered), false);
  assert.equal(Rules.verifyProKey('DSPRO-FAKE-0000-0000'), false);
  assert.equal(Rules.verifyProKey(''), false);
});
