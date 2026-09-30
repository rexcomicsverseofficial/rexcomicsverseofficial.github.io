// Live check of the access rules against the real project, run after every backend deploy.
// Creates a throwaway reader account, tries things a reader must NOT be able to do, then deletes it.
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL: url, SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_KEY: service } = process.env;
const admin = createClient(url, service, { auth: { persistSession: false } });
const reader = createClient(url, anon, { auth: { persistSession: false } });
let failures = 0;
const check = (ok, what) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`); if (!ok) failures++; };

const email = `selftest+${Date.now()}@rexcomicsverse.test`;
const { data: signUp, error: signUpErr } = await reader.auth.signUp({ email, password: 'Selftest-' + Math.random().toString(36).slice(2) });
check(!signUpErr && signUp.session, `a reader can sign up instantly ${signUpErr ? '(' + signUpErr.message + ')' : ''}`);
const uid = signUp?.user?.id;

try {
  const { data: prof } = await reader.from('profiles').select('tier,is_creator').eq('id', uid).single();
  check(prof?.tier === 'free' && prof?.is_creator === false, 'new reader starts as a free member, not creator');

  await reader.from('profiles').update({ tier: 'hero', paid_until: '2099-01-01' }).eq('id', uid);
  const { data: after } = await admin.from('profiles').select('tier,paid_until').eq('id', uid).single();
  check(after?.tier === 'free' && !after?.paid_until, 'a reader cannot make themselves a paid member');

  const { error: insErr } = await reader.from('episodes').insert({ series: 'Self Test', number: 1, title: 'x' });
  check(!!insErr, 'a reader cannot add episodes');

  const up = await reader.storage.from('pages').upload(`00000000-0000-0000-0000-000000000000/001.jpg`, new Blob(['x']), { contentType: 'image/jpeg' });
  check(!!up.error, 'a reader cannot upload comic pages');

  const { data: stats } = await reader.rpc('creator_stats');
  check(stats === null, 'a reader cannot see the creator dashboard numbers');

  // A paid episode's pages stay locked for a free reader; a free episode's pages open.
  const { data: ep4 } = await admin.from('episodes').insert({ series: 'Self Test', number: 4, title: 'Paid', published: true, page_count: 1 }).select().single();
  const { data: ep1 } = await admin.from('episodes').insert({ series: 'Self Test', number: 1, title: 'Free', published: true, page_count: 1 }).select().single();
  for (const ep of [ep4, ep1]) await admin.storage.from('pages').upload(`${ep.id}/001.jpg`, new Blob(['x']), { contentType: 'image/jpeg', upsert: true });
  const paid = await reader.storage.from('pages').createSignedUrl(`${ep4.id}/001.jpg`, 60);
  check(!!paid.error, 'episode 4 is locked for a free reader');
  const free = await reader.storage.from('pages').createSignedUrl(`${ep1.id}/001.jpg`, 60);
  check(!free.error && !!free.data?.signedUrl, 'episode 1 is open for a free reader');

  await admin.from('profiles').update({ tier: 'fan', paid_until: new Date(Date.now() + 864e5).toISOString() }).eq('id', uid);
  const paidNow = await reader.storage.from('pages').createSignedUrl(`${ep4.id}/001.jpg`, 60);
  check(!paidNow.error, 'episode 4 opens once the reader is a paid member');

  const { data: creator } = await admin.from('profiles').select('is_creator').eq('email', 'rexraja89@gmail.com').maybeSingle();
  check(creator?.is_creator === true, 'the creator account is reserved and marked as creator');
} finally {
  // Always clean up, even after a failed check, so test episodes never linger on the site.
  const { data: leftovers } = await admin.from('episodes').select('id').eq('series', 'Self Test');
  if (leftovers?.length) {
    await admin.storage.from('pages').remove(leftovers.map(e => `${e.id}/001.jpg`));
    await admin.from('episodes').delete().eq('series', 'Self Test');
  }
  if (uid) await admin.auth.admin.deleteUser(uid);
}
if (failures) { console.log(`::error title=Self-test::${failures} access check(s) failed`); process.exit(1); }
console.log('All access checks passed.');
