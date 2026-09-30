/*
 * Rex Comicsverse membership rules shared by the site (members.js) and the unit tests.
 * The real enforcement lives in the database (supabase/schema.sql); these mirror it for the UI.
 */
(function (root) {
  const FREE_EPISODES = 3;          // first 3 episodes of every series are free
  const PLANS = {
    fan:  { name: 'Dharma Fan',   inr: 399, usd: 4.99 },
    hero: { name: 'Patriot Hero', inr: 799, usd: 9.99 },
  };
  const SERIES = ['The Indian', 'Mr. Steel', 'Janwar', 'Maya', 'Mr. Entity', 'Ariham', 'Dangara', 'Clash of Era'];

  const isFreeEpisode = ep => !!ep && ep.number <= FREE_EPISODES;

  /** Paid membership that hasn't run out yet. */
  function hasPaidAccess(profile, now = Date.now()) {
    return !!profile && (profile.tier === 'fan' || profile.tier === 'hero')
      && !!profile.paid_until && new Date(profile.paid_until).getTime() > now;
  }

  function canRead(ep, profile, now = Date.now()) {
    if (!ep) return false;
    if (profile && profile.is_creator) return true;
    return !!ep.published && (isFreeEpisode(ep) || hasPaidAccess(profile, now));
  }

  /** Storage path of page i (1-based) of an episode: <episode id>/001.jpg */
  const pagePath = (episodeId, i) => `${episodeId}/${String(i).padStart(3, '0')}.jpg`;
  const coverPath = episodeId => `${episodeId}.jpg`;

  /** Page files in reading order: natural sort by file name, so "page2" comes before "page10". */
  function sortPageFiles(files) {
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    return [...files].sort((a, b) => collator.compare(a.name, b.name));
  }

  /** Episodes of one series in order, plus the previous/next of a given episode. */
  function neighbours(episodes, ep) {
    const same = episodes.filter(e => e.series === ep.series).sort((a, b) => a.number - b.number);
    const i = same.findIndex(e => e.id === ep.id);
    return { prev: same[i - 1] || null, next: same[i + 1] || null };
  }

  /** Short human status for the account panel. */
  function membershipLabel(profile, now = Date.now()) {
    if (!profile) return 'Not signed in';
    if (profile.is_creator) return 'Creator';
    if (hasPaidAccess(profile, now)) {
      const d = new Date(profile.paid_until).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      return `${PLANS[profile.tier].name} member · renews/ends ${d}`;
    }
    return 'Free member';
  }

  /** Friendly text for Supabase auth errors. */
  function authMessage(err) {
    const m = String((err && err.message) || err || '');
    if (/invalid login credentials/i.test(m)) return 'Wrong email or password. New here? Tap "Join Free". Forgot it? Tap "Forgot password".';
    if (/already registered|already been registered/i.test(m)) return 'This email already has an account. Tap "Sign In" instead.';
    if (/password should be at least/i.test(m)) return 'Please use a password of at least 6 characters.';
    if (/rate limit|too many/i.test(m)) return 'Too many tries. Please wait a few minutes and try again.';
    if (/failed to fetch|network/i.test(m)) return 'No internet connection. Check it and try again.';
    return m || 'Something went wrong. Please try again.';
  }

  const api = { FREE_EPISODES, PLANS, SERIES, isFreeEpisode, hasPaidAccess, canRead, pagePath, coverPath,
    sortPageFiles, neighbours, membershipLabel, authMessage };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RexCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
