// Run with: node --test tests/*.test.js  (CI runs this before every APK build)
const test = require('node:test');
const assert = require('node:assert');
const U = require('../app-update.js');

test('newer versions are detected', () => {
  assert.ok(U.isNewer('1.0.46', '1.0.45'));
  assert.ok(U.isNewer('1.0.10', '1.0.9'));   // numeric, not text, comparison
  assert.ok(U.isNewer('1.1.0', '1.0.99'));
  assert.ok(U.isNewer('1.0.1', '1.0'));
});

test('same or older versions are not updates', () => {
  assert.ok(!U.isNewer('1.0.45', '1.0.45'));
  assert.ok(!U.isNewer('1.0.44', '1.0.45'));
  assert.ok(!U.isNewer('1.0', '1.0.0'));
});

test('tags that are not plain versions are never updates', () => {
  assert.ok(!U.isNewer('apk-v1.0.2', '1.0.1'));
  assert.ok(!U.isNewer('test-perms', '1.0.1'));
  assert.ok(!U.isNewer('', '1.0.1'));
});

function memStore() {
  const m = {};
  return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } };
}

test('installed version comes from ?app= and survives in-app navigation', () => {
  const s = memStore();
  assert.strictEqual(U.installedVersion('?app=1.0.7', s), '1.0.7');
  assert.strictEqual(U.installedVersion('', s), '1.0.7');
  assert.strictEqual(U.installedVersion('', memStore()), null); // plain browser visit
});

test('newerVersion reads the GitHub release tag', async () => {
  const reply = tag => async () => ({ ok: true, json: async () => ({ tag_name: tag }) });
  assert.strictEqual(await U.newerVersion('1.0.5', reply('v1.0.6')), '1.0.6');
  assert.strictEqual(await U.newerVersion('1.0.6', reply('v1.0.6')), null);
  assert.strictEqual(await U.newerVersion('1.0.5', async () => ({ ok: false })), null);
  assert.strictEqual(await U.newerVersion('1.0.5', async () => { throw new Error('offline'); }), null);
});

test('the download link always points at the newest APK', () => {
  assert.match(U.APK_URL, /releases\/latest\/download\/RexComicsverse\.apk$/);
});
