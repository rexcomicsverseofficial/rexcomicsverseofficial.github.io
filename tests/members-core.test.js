// Run with: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert');
const C = require('../members-core.js');

const DAY = 864e5, now = Date.UTC(2026, 8, 30);
const paid = (tier, days) => ({ tier, paid_until: new Date(now + days * DAY).toISOString() });

test('first 3 episodes of every series are free', () => {
  assert.ok(C.isFreeEpisode({ number: 1 }));
  assert.ok(C.isFreeEpisode({ number: 3 }));
  assert.ok(!C.isFreeEpisode({ number: 4 }));
});

test('paid access needs a paid tier that has not run out', () => {
  assert.ok(C.hasPaidAccess(paid('fan', 5), now));
  assert.ok(C.hasPaidAccess(paid('hero', 1), now));
  assert.ok(!C.hasPaidAccess(paid('fan', -1), now));      // expired
  assert.ok(!C.hasPaidAccess(paid('free', 30), now));     // free tier
  assert.ok(!C.hasPaidAccess({ tier: 'fan' }, now));      // no end date
  assert.ok(!C.hasPaidAccess(null, now));
});

test('who can read which episode', () => {
  const ep1 = { id: 'a', number: 1, published: true }, ep4 = { id: 'b', number: 4, published: true };
  const draft = { id: 'c', number: 1, published: false };
  assert.ok(C.canRead(ep1, null, now));                   // free episode, signed out
  assert.ok(!C.canRead(ep4, null, now));
  assert.ok(!C.canRead(ep4, { tier: 'free' }, now));
  assert.ok(C.canRead(ep4, paid('fan', 3), now));
  assert.ok(!C.canRead(draft, paid('hero', 3), now));     // drafts are hidden
  assert.ok(C.canRead(draft, { is_creator: true }, now)); // except for the creator
});

test('page files keep their reading order', () => {
  const names = ['page10.jpg', 'page2.jpg', 'Page1.jpg', 'page11.png'];
  assert.deepStrictEqual(C.sortPageFiles(names.map(name => ({ name }))).map(f => f.name),
    ['Page1.jpg', 'page2.jpg', 'page10.jpg', 'page11.png']);
});

test('storage paths', () => {
  assert.strictEqual(C.pagePath('ep-id', 7), 'ep-id/007.jpg');
  assert.strictEqual(C.coverPath('ep-id'), 'ep-id.jpg');
});

test('previous and next stay within the same series', () => {
  const eps = [
    { id: 's2', series: 'Mr. Steel', number: 2 }, { id: 'i1', series: 'The Indian', number: 1 },
    { id: 's1', series: 'Mr. Steel', number: 1 }, { id: 's3', series: 'Mr. Steel', number: 3 },
  ];
  assert.deepStrictEqual(C.neighbours(eps, eps[0]), { prev: eps[2], next: eps[3] });
  assert.deepStrictEqual(C.neighbours(eps, eps[1]), { prev: null, next: null });
});

test('friendly sign-in messages', () => {
  assert.match(C.authMessage({ message: 'Invalid login credentials' }), /Forgot password/);
  assert.match(C.authMessage({ message: 'User already registered' }), /Sign In/);
});
