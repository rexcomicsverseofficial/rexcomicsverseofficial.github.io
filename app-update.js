/*
 * Rex Comicsverse app updates (same flow as XARVIS's update/Updates.kt).
 *
 * The Android app is a Trusted Web Activity: it opens this site with ?app=<versionName>
 * (android-app/app/build.gradle). When the page sees that, it knows it is inside the app and
 * which version is installed. It then asks GitHub for the latest release when the app opens
 * and every 30 minutes, and shows an "UPDATE TO vX" bar that downloads the newest APK in Chrome.
 * Site content (characters, episodes, art) updates by itself; only the app shell needs this.
 */
(function (root) {
  const REPO = 'rexraja89-oss/rexcomicsverse';
  const LATEST = `https://api.github.com/repos/${REPO}/releases/latest`;
  // Always the newest build: CI attaches RexComicsverse.apk to every release on main.
  const APK_URL = `https://github.com/${REPO}/releases/latest/download/RexComicsverse.apk`;
  const CHECK_EVERY_MS = 30 * 60 * 1000;

  /** "1.0.46" is newer than "1.0.45"; tags that aren't plain versions ("apk-v1.0.2", "test-x") never are. */
  function isNewer(candidate, current) {
    const a = String(candidate).split('.').map(n => (/^\d+$/.test(n) ? +n : NaN));
    if (a.some(Number.isNaN)) return false;
    const b = String(current).split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const x = a[i] || 0, y = b[i] || 0;
      if (x !== y) return x > y;
    }
    return false;
  }

  /** The installed app version from ?app=1.0.12 (kept for the session, since the SPA can drop the query). */
  function installedVersion(search, store) {
    const v = new URLSearchParams(search || '').get('app');
    try {
      if (v) store.setItem('rexAppVersion', v);
      return v || store.getItem('rexAppVersion');
    } catch (e) {
      return v;
    }
  }

  /** The newest version on GitHub ("1.0.46") if it's newer than `current`; null if not, or offline. */
  async function newerVersion(current, fetchFn) {
    try {
      const r = await fetchFn(LATEST, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
      if (!r.ok) return null;
      const tag = String((await r.json()).tag_name || '').replace(/^v/, '');
      return isNewer(tag, current) ? tag : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Download link for the newest APK that actually exists: the latest release's .apk
   * (RexComicsverse.apk when present). Falls back to the releases page, so a website
   * visitor never lands on a 404 before the first release is published.
   */
  async function latestApkUrl(fetchFn) {
    const fallback = `https://github.com/${REPO}/releases`;
    try {
      const r = await fetchFn(LATEST, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
      if (!r.ok) return fallback;
      const apks = ((await r.json()).assets || []).filter(a => /\.apk$/i.test(a.name));
      const best = apks.find(a => a.name === 'RexComicsverse.apk') || apks[0];
      return best ? best.browser_download_url : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function showBar(doc, version) {
    let bar = doc.getElementById('app-update-bar');
    if (!bar) {
      bar = doc.createElement('div');
      bar.id = 'app-update-bar';
      bar.innerHTML =
        '<span>A new version of the app is ready.</span>' +
        '<a class="btn btn-gold btn-sm" target="_blank" rel="noopener"></a>' +
        '<button aria-label="Later" title="Later">✕</button>';
      bar.querySelector('button').onclick = () => bar.remove();
      doc.body.appendChild(bar);
    }
    const a = bar.querySelector('a');
    a.href = APK_URL;
    a.textContent = `UPDATE TO v${version}`;
  }

  function start(win) {
    const doc = win.document;
    const current = installedVersion(win.location.search, win.sessionStorage);
    if (!current) return null; // a normal browser visit: nothing to update
    doc.documentElement.classList.add('in-app');
    const label = doc.getElementById('app-version');
    if (label) label.textContent = `App v${current}`;
    const check = async () => {
      const v = await newerVersion(current, win.fetch.bind(win));
      if (v) showBar(doc, v);
    };
    check();
    win.setInterval(check, CHECK_EVERY_MS);
    doc.addEventListener('visibilitychange', () => { if (doc.visibilityState === 'visible') check(); });
    return current;
  }

  const api = { REPO, LATEST, APK_URL, isNewer, installedVersion, newerVersion, latestApkUrl, start };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.RexUpdates = api;
    if (root.document) {
      if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', () => start(root));
      else start(root);
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
