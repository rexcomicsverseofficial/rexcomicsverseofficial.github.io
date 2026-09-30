/*
 * Rex Comicsverse membership: real accounts, free/paid episodes, Razorpay memberships and the
 * creator's dashboard, backed by Supabase (supabase/schema.sql). Loaded after the main page
 * script; it replaces that script's sample-data versions of these features.
 */
(function () {
  const C = window.RexCore;
  const cfg = window.REX_SUPABASE || {};
  const sb = (cfg.url && cfg.anonKey && window.supabase) ? window.supabase.createClient(cfg.url, cfg.anonKey) : null;
  const M = window.RexMembers = { sb, session: null, profile: null, episodes: [], loaded: false };
  const $ = id => document.getElementById(id);
  const coverUrl = ep => ep.has_cover
    ? `${cfg.url}/storage/v1/object/public/covers/${C.coverPath(ep.id)}?v=${encodeURIComponent(ep.published_at || ep.created_at || '')}`
    : '';
  const offline = () => { toast('Membership service is not connected yet. Please try again later.', 'e'); };

  localStorage.removeItem('rc_user'); // sign-ins from before real accounts

  /* ── Session & profile ───────────────────────────────────────────────── */
  async function loadProfile() {
    if (!sb || !M.session) { M.profile = null; return; }
    const { data } = await sb.from('profiles').select('*').eq('id', M.session.user.id).maybeSingle();
    M.profile = data || { tier: 'free', is_creator: false, email: M.session.user.email };
  }
  function applyUser() {
    const u = M.session && M.session.user;
    S.user = u ? { id: u.id, email: u.email, name: (M.profile && M.profile.display_name) || u.email.split('@')[0] } : null;
    if (S.user) updateNavUser(S.user);
    else {
      $('nav-av')?.classList.add('hidden');
      $('nav-signin')?.classList.remove('hidden');
    }
  }
  async function refresh() {
    await loadProfile();
    applyUser();
    await loadEpisodes();
    if (S.page === 'reader') renderReader();
    if (S.page === 'dashboard') goTo('dashboard');
  }

  if (sb) {
    sb.auth.onAuthStateChange((event, session) => {
      M.session = session;
      if (event === 'PASSWORD_RECOVERY') openSetPassword();
      if (['SIGNED_IN', 'SIGNED_OUT', 'INITIAL_SESSION', 'USER_UPDATED'].includes(event)) setTimeout(refresh, 0);
    });
  } else {
    setTimeout(() => { M.loaded = true; renderHomePage(); }, 0);
  }

  window.isCreator = () => !!(M.profile && M.profile.is_creator);
  window.loadSession = () => {};

  /* ── Sign in / join / forgot password ─────────────────────────────────── */
  window.handleAuth = async function (e) {
    e.preventDefault();
    if (!sb) return offline();
    const btn = $('auth-btn'), email = $('auth-email').value.trim(), password = $('auth-pass').value;
    const name = $('auth-name')?.value.trim();
    if (!email || !password) return;
    btn.disabled = true; btn.textContent = 'Please wait…';
    try {
      const { error } = S.authMode === 'signup'
        ? await sb.auth.signUp({ email, password, options: { data: { name: name || email.split('@')[0] } } })
        : await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      closeModal('auth-modal');
      toast(S.authMode === 'signup' ? 'Welcome to the Rex Comicsverse! 🎉' : 'Welcome back! 🔥', 's');
      $('auth-form').reset();
    } catch (err) {
      toast(C.authMessage(err), 'e');
    } finally {
      btn.disabled = false; btn.textContent = S.authMode === 'login' ? 'Sign In' : 'Create Free Account';
    }
  };

  window.forgotPassword = async function () {
    if (!sb) return offline();
    const email = $('auth-email').value.trim();
    if (!email) { toast('Type your email above first, then tap "Forgot password" again.', 'i'); $('auth-email').focus(); return; }
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    if (error) toast(C.authMessage(error), 'e');
    else toast(`We've emailed a link to ${email}. Open it on this phone to set your password.`, 's', 8000);
  };

  function openSetPassword() {
    let m = $('pw-modal');
    if (!m) {
      m = document.createElement('div');
      m.className = 'modal-bg'; m.id = 'pw-modal';
      m.innerHTML = `<div class="modal-box">
        <h2 style="font-family:var(--F2);font-size:1.1rem;font-weight:800;margin-bottom:6px;">Set your password</h2>
        <p style="font-size:.8rem;color:var(--txt2);margin-bottom:16px;">Choose a new password for your account.</p>
        <form onsubmit="RexMembers.savePassword(event)">
          <div class="fgrp"><label class="flbl">New password</label><input type="password" class="finp" id="pw-new" minlength="6" required autocomplete="new-password"></div>
          <button class="btn btn-gold btn-full" type="submit">Save password</button>
        </form></div>`;
      document.body.appendChild(m);
    }
    openModal('pw-modal');
  }
  M.savePassword = async function (e) {
    e.preventDefault();
    const { error } = await sb.auth.updateUser({ password: $('pw-new').value });
    if (error) return toast(C.authMessage(error), 'e');
    closeModal('pw-modal');
    toast('Password saved. You are signed in. ✅', 's');
  };

  window.signOut = async function () {
    if (sb) await sb.auth.signOut();
    closeModal('account-modal');
    toast('Signed out', 'i');
    if (S.page === 'dashboard') goTo('home');
  };

  window.handleAvatarClick = function () {
    if (!S.user) { openAuth('login'); return; }
    let m = $('account-modal');
    if (!m) {
      m = document.createElement('div');
      m.className = 'modal-bg'; m.id = 'account-modal';
      m.onclick = ev => { if (ev.target === m) closeModal('account-modal'); };
      document.body.appendChild(m);
    }
    const paid = C.hasPaidAccess(M.profile);
    m.innerHTML = `<div class="modal-box">
      <span class="modal-x" onclick="closeModal('account-modal')">✕</span>
      <h2 style="font-family:var(--F2);font-size:1.05rem;font-weight:800;margin-bottom:4px;">${esc(S.user.name)}</h2>
      <div style="font-size:.78rem;color:var(--muted);margin-bottom:14px;">${esc(S.user.email)}</div>
      <div class="badge ${isCreator() || paid ? 'bg' : 'bc'}" style="margin-bottom:18px;">${esc(C.membershipLabel(M.profile))}</div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${isCreator() ? `<button class="btn btn-gold btn-full" onclick="closeModal('account-modal');goTo('dashboard')">Open Creator Dashboard</button>` : ''}
        ${!isCreator() && !paid ? `<button class="btn btn-gold btn-full" onclick="closeModal('account-modal');goTo('support')">Become a member</button>` : ''}
        <button class="btn btn-ghost btn-full" onclick="signOut()">Sign out</button>
      </div></div>`;
    openModal('account-modal');
  };

  /* ── Episodes ─────────────────────────────────────────────────────────── */
  async function loadEpisodes() {
    if (!sb) return;
    const { data, error } = await sb.from('episodes').select('*').order('series').order('number');
    if (!error) M.episodes = data || [];
    M.loaded = true;
    renderHomePage();
    if (S.page === 'series') renderSeriesPage();
  }
  const published = () => M.episodes.filter(e => e.published);

  window.epCardHTML = function (ep) {
    const open = C.canRead(ep, M.profile);
    const img = coverUrl(ep);
    return `
    <div class="ccard" onclick="openEpisode('${ep.id}')">
      <div class="cthumb">
        ${img ? `<img src="${img}" alt="${esc(ep.title)}" loading="lazy" style="width:100%;height:100%;object-fit:cover;">` : `
        <div class="cthumb-ph">
          <div style="font-family:var(--F1);font-size:4.2rem;line-height:1;background:linear-gradient(180deg,#FF6F00,rgba(255,111,0,.15));-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;">${String(ep.number).padStart(2, '0')}</div>
        </div>`}
        <div class="cthumb-ov"><button class="btn btn-sm btn-gold">${open ? 'Read Now →' : '🔒 Members'}</button></div>
        <div class="cbadges">
          ${!ep.published ? '<span class="badge br">DRAFT</span>' : ''}
          <span class="badge ${C.isFreeEpisode(ep) ? 'bgr' : 'bg'}">${C.isFreeEpisode(ep) ? 'FREE' : 'MEMBERS'}</span>
        </div>
      </div>
      <div class="cbody">
        <div class="c-sname">${esc(ep.series)} · Ep ${String(ep.number).padStart(2, '0')}</div>
        <div class="c-title">${esc(ep.title)}</div>
        <div class="c-meta"><span>${ep.page_count} pages</span><span>${ep.published_at ? fmtDate(ep.published_at) : ''}</span></div>
      </div>
    </div>`;
  };
  function emptyEpisodesHTML() {
    return `<div class="card card-p tc" style="grid-column:1/-1;">
      <div style="font-size:2rem;margin-bottom:8px;">📚</div>
      <div style="font-family:var(--F2);font-weight:800;margin-bottom:6px;">${M.loaded ? 'New episodes are on the way' : 'Loading episodes…'}</div>
      <div style="font-size:.82rem;color:var(--txt2);">The first 3 episodes of every series are free to read.</div></div>`;
  }
  window.renderEpsGrid = function (id, eps) {
    const el = $(id);
    if (el) el.innerHTML = eps.length ? eps.map(epCardHTML).join('') : emptyEpisodesHTML();
  };
  const origHome = window.renderHomePage;
  window.renderHomePage = function () {
    try { origHome(); } catch (e) { /* the sample grid is replaced right below */ }
    const latest = [...published()].sort((a, b) => new Date(b.published_at) - new Date(a.published_at)).slice(0, 4);
    renderEpsGrid('eps-grid-home', latest);
  };
  window.renderSeriesPage = function () {
    renderCoverRail('covers-series', SERIES_COVERS);
    const el = $('eps-grid-series');
    if (!el) return;
    const eps = published();
    if (!eps.length) { el.innerHTML = emptyEpisodesHTML(); return; }
    const bySeries = {};
    eps.forEach(e => (bySeries[e.series] = bySeries[e.series] || []).push(e));
    el.innerHTML = Object.keys(bySeries).map(s => `
      <div style="grid-column:1/-1;margin-top:10px;"><h3 style="font-family:var(--F2);font-size:1rem;font-weight:800;">${esc(s)}</h3></div>
      ${bySeries[s].map(epCardHTML).join('')}`).join('');
  };

  /* ── Reader ───────────────────────────────────────────────────────────── */
  window.openEpisode = function (id) { S.readerEp = id; goTo('reader'); };

  window.renderReader = async function () {
    const wrap = $('panels-container');
    const eps = isCreator() ? M.episodes : published();
    let ep = eps.find(e => e.id === S.readerEp);
    if (!ep) ep = [...eps].sort((a, b) => a.number - b.number || a.series.localeCompare(b.series))[0];
    const setNav = (el, t, e) => { const b = $(el); if (!b) return; $(t).textContent = e ? `Ep ${e.number}: ${e.title}` : '—';
      b.style.opacity = e ? '1' : '.35'; b.style.pointerEvents = e ? 'all' : 'none'; };
    if (!ep) {
      $('reader-arc-info').textContent = 'Rex Comicsverse';
      $('reader-ep-title').textContent = M.loaded ? 'No episodes yet' : 'Loading…';
      wrap.innerHTML = `<div style="max-width:560px;margin:0 auto;padding:30px 20px;">${emptyEpisodesHTML()}</div>`;
      setNav('prev-ep', 'prev-ep-title', null); setNav('next-ep', 'next-ep-title', null);
      return;
    }
    S.readerEp = ep.id;
    $('reader-arc-info').textContent = `${ep.series} · Episode ${String(ep.number).padStart(2, '0')}`;
    $('reader-ep-title').textContent = ep.title;
    const { prev, next } = C.neighbours(eps, ep);
    setNav('prev-ep', 'prev-ep-title', prev); setNav('next-ep', 'next-ep-title', next);
    renderComments();

    if (!C.canRead(ep, M.profile)) {
      wrap.innerHTML = `<div style="max-width:560px;margin:0 auto;padding:20px;">
        <div class="card card-p tc" style="border:1px solid rgba(255,111,0,.35);">
          ${coverUrl(ep) ? `<img src="${coverUrl(ep)}" alt="" style="max-height:260px;border-radius:10px;margin-bottom:14px;">` : ''}
          <div style="font-size:2rem;">🔒</div>
          <h3 style="font-family:var(--F2);font-weight:800;margin:8px 0;">Members-only episode</h3>
          <p style="font-size:.85rem;color:var(--txt2);line-height:1.7;margin-bottom:16px;">Episodes 1–3 of every series are free.
            Become a member to read every episode of every series.</p>
          <button class="btn btn-gold" onclick="goTo('support')">See memberships</button>
          ${S.user ? '' : `<button class="btn btn-ghost" style="margin-left:8px;" onclick="openAuth('login')">Sign in</button>`}
        </div></div>`;
      return;
    }
    wrap.innerHTML = `<div class="tc" style="padding:40px;color:var(--muted);">Loading pages…</div>`;
    const paths = Array.from({ length: ep.page_count }, (_, i) => C.pagePath(ep.id, i + 1));
    const { data, error } = paths.length ? await sb.storage.from('pages').createSignedUrls(paths, 3600) : { data: [] };
    if (S.readerEp !== ep.id) return; // the reader moved on while pages loaded
    if (error) { wrap.innerHTML = `<div class="tc" style="padding:40px;">Couldn't load this episode. Please try again.</div>`; return; }
    wrap.innerHTML = `<div class="comic-pages">${data.map((d, i) =>
      `<img src="${d.signedUrl}" alt="Page ${i + 1}" loading="${i < 2 ? 'eager' : 'lazy'}">`).join('')}
      <div class="tc" style="padding:26px 0;">
        <div style="font-family:var(--F1);font-size:2rem;letter-spacing:.08em;color:var(--gold);">End of Episode ${ep.number}</div>
        ${next ? `<button class="btn btn-gold btn-sm mt16" onclick="navEp('next')">Next: ${esc(next.title)} →</button>` : ''}
      </div></div>`;
    const rbar = $('rbar'), rpct = $('rpct');
    if (rbar) rbar.style.width = '0%'; if (rpct) rpct.textContent = '0%';
  };
  window.navEp = function (dir) {
    const eps = isCreator() ? M.episodes : published();
    const ep = eps.find(e => e.id === S.readerEp);
    if (!ep) return;
    const { prev, next } = C.neighbours(eps, ep);
    const tgt = dir === 'next' ? next : prev;
    if (!tgt) { toast(dir === 'next' ? "You're on the latest episode! 🔥" : "That's the first episode!", 'i'); return; }
    S.readerEp = tgt.id; renderReader(); window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* ── Memberships (Razorpay) ───────────────────────────────────────────── */
  window.renderSupportPage = function () {
    const grid = $('tiers-grid');
    if (!grid) return;
    const current = C.hasPaidAccess(M.profile) ? M.profile.tier : (S.user ? 'free' : null);
    const tiers = [
      { id: 'free', icon: '📖', name: 'Free Reader', price: '₹0', usd: '', period: 'forever',
        feats: ['First 3 episodes of every series', 'Like & comment', 'Email newsletter'], nfeats: ['Every episode', 'Early access'],
        btn: 'Join Free', style: 'btn-outline', action: "openAuth('signup')" },
      { id: 'fan', icon: '⚡', name: 'Dharma Fan', price: '₹399', usd: '≈ $4.99', period: 'per month', featured: true,
        feats: ['Every episode of every series', '3-day early access', 'Bonus panels & art', 'Creator Q&A'], nfeats: ['PDF downloads'],
        btn: 'Subscribe Now', style: 'btn-gold', action: "RexMembers.subscribe('fan')" },
      { id: 'hero', icon: '🛡', name: 'Patriot Hero', price: '₹799', usd: '≈ $9.99', period: 'per month',
        feats: ['Everything in Dharma Fan', '7-day early access', 'Name in credits', 'Vote on story'], nfeats: [],
        btn: 'Become a Hero', style: 'btn-cyan', action: "RexMembers.subscribe('hero')" },
    ];
    grid.innerHTML = tiers.map(t => `
    <div class="tier ${t.featured ? 'feat' : ''}">
      <div style="font-size:2.4rem;margin-bottom:9px;">${t.icon}</div>
      <h3 style="font-family:var(--F2);font-size:.95rem;font-weight:800;margin-bottom:3px;">${t.name}</h3>
      <div class="tier-price">${t.price}</div>
      <div class="tier-period">${t.period} ${t.usd ? `<span style="color:var(--muted);">(${t.usd})</span>` : ''}</div>
      <div class="tier-feats">
        ${t.feats.map(f => `<div class="tier-feat"><span class="feat-y">✓</span>${f}</div>`).join('')}
        ${t.nfeats.map(f => `<div class="tier-feat" style="color:var(--muted);"><span class="feat-n">✕</span>${f}</div>`).join('')}
      </div>
      ${current === t.id ? `<button class="btn btn-ghost btn-full" disabled>✓ Your plan</button>`
        : `<button class="btn ${t.style} btn-full" onclick="${t.action}">${t.btn}</button>`}
    </div>`).join('');
  };
  window.handlePay = () => M.subscribe('fan');

  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  }
  M.subscribe = async function (tier) {
    if (!sb) return offline();
    if (!S.user) { toast('Create a free account first, then choose your membership.', 'i'); openAuth('signup'); return; }
    toast('Opening secure payment…', 'i');
    const { data, error } = await sb.functions.invoke('create-subscription', { body: { tier } });
    if (error) {
      let code = '';
      try { code = (await error.context.json()).error; } catch (e) { /* no body */ }
      if (code === 'payments_not_ready') return toast('Memberships open very soon! Read the free episodes meanwhile. 🙏', 'i', 6000);
      return toast("Couldn't start the payment. Please try again.", 'e');
    }
    try { if (!window.Razorpay) await loadScript('https://checkout.razorpay.com/v1/checkout.js'); }
    catch (e) { return toast("Couldn't reach the payment page. Check your internet.", 'e'); }
    new window.Razorpay({
      key: data.key_id, subscription_id: data.subscription_id,
      name: 'Rex Comicsverse', description: `${C.PLANS[tier].name} membership`,
      prefill: { email: data.email }, theme: { color: '#FF6F00' },
      handler: () => waitForMembership(),
    }).open();
  };
  async function waitForMembership() {
    toast('Payment received! Unlocking your membership…', 's');
    for (let i = 0; i < 20; i++) {
      await delay(3000);
      await loadProfile();
      if (C.hasPaidAccess(M.profile)) {
        toast(`Welcome, ${C.PLANS[M.profile.tier].name}! Every episode is now unlocked. 🎉`, 's', 7000);
        renderSupportPage(); if (S.page === 'reader') renderReader();
        return;
      }
    }
    toast('Your payment went through; your membership will switch on within a few minutes.', 'i', 8000);
  }

  /* ── Creator dashboard ────────────────────────────────────────────────── */
  window.renderDashboard = async function () {
    if (!sb) return;
    const { data: s } = await sb.rpc('creator_stats');
    if (s) {
      $('st-members').textContent = s.members; $('st-paid').textContent = s.paid_members;
      $('st-eps').textContent = s.episodes; $('st-new').textContent = s.new_this_week;
      $('st-paid-sub').textContent = `${s.fans} Dharma Fan · ${s.heroes} Patriot Hero`;
      $('st-eps-sub').textContent = `${s.drafts} draft${s.drafts === 1 ? '' : 's'}`;
    }
    renderCreatorEpisodes();
    renderMembers();
    const dl = $('series-list');
    if (dl) dl.innerHTML = [...new Set([...C.SERIES, ...M.episodes.map(e => e.series)])].map(n => `<option value="${esc(n)}">`).join('');
  };

  function renderCreatorEpisodes() {
    const el = $('creator-eps');
    if (!el) return;
    if (!M.episodes.length) { el.innerHTML = '<p style="color:var(--txt2);font-size:.85rem;">No episodes yet. Upload your first one in "Upload Episode".</p>'; return; }
    el.innerHTML = M.episodes.map(ep => `
      <div class="ep-row">
        <div class="ep-row-img">${coverUrl(ep) ? `<img src="${coverUrl(ep)}" alt="">` : '📄'}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-family:var(--F2);font-size:.82rem;font-weight:800;">${esc(ep.series)} · Ep ${ep.number}: ${esc(ep.title)}</div>
          <div style="font-size:.72rem;color:var(--muted);">${ep.page_count} pages · ${C.isFreeEpisode(ep) ? 'Free' : 'Members only'} ·
            ${ep.published ? `<span style="color:var(--green);">Live</span>` : `<span style="color:var(--red);">Draft (hidden)</span>`}</div>
        </div>
        <div class="frow gap8" style="flex-wrap:wrap;justify-content:flex-end;">
          <button class="btn btn-sm btn-ghost" onclick="openEpisode('${ep.id}')">Read</button>
          <button class="btn btn-sm ${ep.published ? 'btn-ghost' : 'btn-gold'}" onclick="RexMembers.setPublished('${ep.id}', ${!ep.published})">${ep.published ? 'Hide' : 'Publish'}</button>
          <button class="btn btn-sm btn-ghost" style="color:var(--red);" onclick="RexMembers.deleteEpisode('${ep.id}')">Delete</button>
        </div>
      </div>`).join('');
  }
  async function renderMembers() {
    const el = $('creator-members');
    if (!el) return;
    const { data } = await sb.rpc('creator_members');
    if (!data || !data.length) { el.innerHTML = '<p style="color:var(--txt2);font-size:.85rem;">No members yet.</p>'; return; }
    el.innerHTML = `<div style="overflow-x:auto;"><table class="dtable"><thead><tr><th>Member</th><th>Plan</th><th>Joined</th></tr></thead><tbody>
      ${data.map(m => `<tr><td>${esc(m.display_name || '')}<div style="font-size:.7rem;color:var(--muted);">${esc(m.email || '')}</div></td>
        <td>${esc(C.membershipLabel(m))}</td><td>${fmtDate(m.created_at)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  M.setPublished = async function (id, on) {
    const { error } = await sb.from('episodes').update({ published: on, published_at: on ? new Date().toISOString() : null }).eq('id', id);
    if (error) return toast(error.message, 'e');
    toast(on ? 'Episode is live for readers ✅' : 'Episode hidden from readers', 's');
    await loadEpisodes(); renderDashboard();
  };
  M.deleteEpisode = async function (id) {
    const ep = M.episodes.find(e => e.id === id);
    if (!ep || !confirm(`Delete "${ep.series} · Ep ${ep.number}: ${ep.title}" and all its pages? This can't be undone.`)) return;
    const pages = Array.from({ length: ep.page_count }, (_, i) => C.pagePath(ep.id, i + 1));
    if (pages.length) await sb.storage.from('pages').remove(pages);
    if (ep.has_cover) await sb.storage.from('covers').remove([C.coverPath(ep.id)]);
    const { error } = await sb.from('episodes').delete().eq('id', id);
    if (error) return toast(error.message, 'e');
    toast('Episode deleted', 's');
    await loadEpisodes(); renderDashboard();
  };

  /** Shrinks a photo to at most 1400 px wide (JPEG) so pages load fast on phones. */
  function compressImage(file, maxW = 1400, quality = 0.85) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.naturalWidth);
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        c.toBlob(b => b ? resolve(b) : reject(new Error('Could not read ' + file.name)), 'image/jpeg', quality);
      };
      img.onerror = () => reject(new Error('Could not read ' + file.name));
      img.src = URL.createObjectURL(file);
    });
  }

  window.handleUpload = async function (e) {
    e.preventDefault();
    if (!sb || !isCreator()) return toast('Only the creator can upload episodes.', 'e');
    const f = e.target, btn = f.querySelector('button[type=submit]');
    const series = $('up-series').value.trim(), number = parseInt($('up-number').value, 10), title = $('up-title').value.trim();
    const description = $('up-desc').value.trim(), cover = $('up-cover').files[0], publish = $('up-publish').checked;
    const pages = C.sortPageFiles($('up-pages').files);
    if (!series || !number || !title) return toast('Please fill in series, episode number and title.', 'e');
    if (!pages.length) return toast('Please choose the page images.', 'e');
    if (M.episodes.some(ep => ep.series === series && ep.number === number))
      return toast(`${series} episode ${number} already exists. Delete it in "My Episodes" first, or use another number.`, 'e', 7000);

    const progress = $('up-progress'), setP = (done, total, msg) => {
      progress.style.display = 'block';
      progress.querySelector('.bar-fill').style.width = `${Math.round((done / total) * 100)}%`;
      progress.querySelector('.bar-msg').textContent = msg;
    };
    btn.disabled = true; btn.textContent = 'Uploading…';
    let ep = null;
    try {
      const ins = await sb.from('episodes').insert({ series, number, title, description, published: false }).select().single();
      if (ins.error) throw ins.error;
      ep = ins.data;
      const total = pages.length + (cover ? 1 : 0);
      let done = 0;
      if (cover) {
        setP(done, total, 'Uploading cover…');
        const up = await sb.storage.from('covers').upload(C.coverPath(ep.id), await compressImage(cover, 900), { contentType: 'image/jpeg', upsert: true });
        if (up.error) throw up.error;
        setP(++done, total, 'Cover done');
      }
      for (let i = 0; i < pages.length; i++) {
        setP(done, total, `Uploading page ${i + 1} of ${pages.length}…`);
        const up = await sb.storage.from('pages').upload(C.pagePath(ep.id, i + 1), await compressImage(pages[i]), { contentType: 'image/jpeg', upsert: true });
        if (up.error) throw up.error;
        setP(++done, total, `Page ${i + 1} of ${pages.length} done`);
      }
      const fin = await sb.from('episodes').update({ page_count: pages.length, has_cover: !!cover,
        published: publish, published_at: publish ? new Date().toISOString() : null }).eq('id', ep.id);
      if (fin.error) throw fin.error;
      setP(1, 1, publish ? 'Published! Readers can see it now.' : 'Saved as a draft.');
      toast(publish ? `${series} · Ep ${number} is live! 🎉` : 'Saved as a draft. Publish it in "My Episodes".', 's', 6000);
      f.reset(); $('up-pages-info').textContent = ''; $('up-cover-info').textContent = '';
      await loadEpisodes(); renderDashboard();
    } catch (err) {
      toast(`Upload stopped: ${err.message || err}. Nothing was published; you can try again.`, 'e', 8000);
      if (ep) { // leave no half-uploaded episode behind
        await sb.storage.from('pages').remove(pages.map((_, i) => C.pagePath(ep.id, i + 1)));
        if (cover) await sb.storage.from('covers').remove([C.coverPath(ep.id)]);
        await sb.from('episodes').delete().eq('id', ep.id);
      }
    } finally {
      btn.disabled = false; btn.textContent = '⬆ Upload Episode';
    }
  };
  M.showFiles = function (input, infoId) {
    const files = C.sortPageFiles(input.files);
    $(infoId).textContent = files.length ? `✓ ${files.length} image${files.length > 1 ? 's' : ''}: ${files.map(x => x.name).slice(0, 4).join(', ')}${files.length > 4 ? '…' : ''}` : '';
  };
})();
