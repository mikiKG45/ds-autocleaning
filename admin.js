// ======================================================================
// Admin – login + manage busy days / times
// Talks to server.py: /api/me, /api/login, /api/logout, /api/availability,
// /api/admin/day, /api/admin/slot
// ======================================================================
(() => {
  const cfg = window.ZAKAZIVANJE || { termini: [], neradniDani: [] };
  const $ = id => document.getElementById(id);

  const MONTHS = ['januar', 'februar', 'mart', 'april', 'maj', 'jun', 'jul', 'avgust', 'septembar', 'oktobar', 'novembar', 'decembar'];
  const DAYS = ['nedelja', 'ponedeljak', 'utorak', 'sreda', 'četvrtak', 'petak', 'subota'];
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const clientMax = new Date(today.getFullYear(), today.getMonth() + 2, 0); // what customers can book
  const adminMaxMonth = new Date(today.getFullYear(), today.getMonth() + 12, 1); // admin may plan a year ahead

  let busyDays = new Set(), busyTimes = {};
  let view = new Date(today.getFullYear(), today.getMonth(), 1);
  let sel = null;

  // ---------- helpers ----------
  const toastEl = $('toast');
  let toastT;
  const toast = (msg, bad = false) => {
    toastEl.textContent = msg;
    toastEl.classList.toggle('bad', bad);
    toastEl.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove('show'), 2600);
  };
  const api = async (url, body) => {
    const r = await fetch(url, body ? {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body)
    } : { credentials: 'same-origin', cache: 'no-store' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(data.error || 'Greška na serveru.'); e.status = r.status; throw e; }
    return data;
  };
  const setData = d => { busyDays = new Set(d.zauzetiDani || []); busyTimes = d.zauzetiTermini || {}; };
  const slotsFor = d => (d.getDay() === 6 && cfg.terminiSubota) ? cfg.terminiSubota : cfg.termini;
  const closed = d => (cfg.neradniDani || []).includes(d.getDay());
  const state = d => {
    if (d < today) return 'past';
    if (closed(d)) return 'closed';
    if (busyDays.has(iso(d))) return 'busy';
    const taken = (busyTimes[iso(d)] || []).filter(t => slotsFor(d).includes(t)).length;
    if (taken && taken >= slotsFor(d).length) return 'busy';
    return taken ? 'part' : 'free';
  };

  // ---------- views ----------
  const showLogin = () => {
    $('dashView').hidden = true; $('admUser').hidden = true; $('loginView').hidden = false;
    setTimeout(() => $('lgUser').focus(), 50);
  };
  const showDash = async username => {
    $('loginView').hidden = true; $('dashView').hidden = false; $('admUser').hidden = false;
    $('admName').textContent = username;
    try { setData(await api('/api/availability')); } catch { toast('Ne mogu da učitam termine.', true); }
    renderCal(); renderDay(); renderStats();
  };

  // ---------- login ----------
  $('pwToggle').addEventListener('click', e => {
    const show = $('lgPass').type === 'password';
    $('lgPass').type = show ? 'text' : 'password';
    e.currentTarget.setAttribute('aria-pressed', show);
    e.currentTarget.setAttribute('aria-label', show ? 'Sakrij lozinku' : 'Prikaži lozinku');
  });
  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const username = $('lgUser').value.trim(), password = $('lgPass').value;
    if (!username || !password) { $('loginErr').textContent = 'Upišite korisničko ime i lozinku.'; return; }
    $('loginBtn').disabled = true; $('loginErr').textContent = '';
    try {
      const me = await api('/api/login', { username, password });
      $('lgPass').value = '';
      showDash(me.username);
    } catch (err) {
      $('loginErr').textContent = err.status ? err.message : 'Server nije dostupan. Proverite da li je pokrenut.';
      $('lgPass').select();
    } finally { $('loginBtn').disabled = false; }
  });
  $('logoutBtn').addEventListener('click', async () => {
    try { await api('/api/logout', {}); } catch { /* cookie is cleared anyway */ }
    sel = null; showLogin();
  });

  // ---------- calendar ----------
  const grid = $('aGrid');
  const renderCal = () => {
    $('aTitle').textContent = `${MONTHS[view.getMonth()]} ${view.getFullYear()}`;
    $('aPrev').disabled = view <= new Date(today.getFullYear(), today.getMonth(), 1);
    $('aNext').disabled = view >= adminMaxMonth;
    const first = (view.getDay() + 6) % 7;
    const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    let html = '<span class="day blank"></span>'.repeat(first);
    for (let i = 1; i <= days; i++) {
      const d = new Date(view.getFullYear(), view.getMonth(), i);
      const st = state(d), k = iso(d);
      const off = st === 'past';
      const label = { busy: 'ceo dan zauzet', part: 'delimično zauzeto', closed: 'neradni dan', free: 'slobodno', past: 'prošao' }[st];
      const cls = ['day', `st-${st}`, +d === +today ? 'today' : '', d > clientMax && !off ? 'beyond' : ''].join(' ').trim();
      html += `<button type="button" class="${cls}" data-date="${k}" aria-pressed="${sel === k}" aria-label="${DAYS[d.getDay()]}, ${i}. ${MONTHS[d.getMonth()]} – ${label}"${off ? ' disabled' : ''}>${i}</button>`;
    }
    grid.innerHTML = html;
    $('aWindow').textContent = `Klijenti trenutno mogu da zakažu do ${clientMax.getDate()}. ${MONTHS[clientMax.getMonth()]} ${clientMax.getFullYear()}. Kasnije dane možete unapred da zauzmete.`;
  };
  grid.addEventListener('click', e => {
    const b = e.target.closest('.day');
    if (!b || b.disabled) return;
    sel = b.dataset.date;
    renderCal(); renderDay();
  });
  $('aPrev').addEventListener('click', () => { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); renderCal(); });
  $('aNext').addEventListener('click', () => { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); renderCal(); });

  // ---------- day panel ----------
  const renderDay = () => {
    $('dayEmpty').hidden = !!sel; $('dayBody').hidden = !sel;
    if (!sel) return;
    const d = fromIso(sel), dayBusy = busyDays.has(sel), isClosed = closed(d);
    $('dayEyebrow').textContent = isClosed ? 'Neradni dan' : dayBusy ? 'Ceo dan zauzet' : state(d) === 'part' ? 'Delimično zauzeto' : 'Slobodan dan';
    $('dayTitle').textContent = `${DAYS[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}.`;
    $('dayBusy').checked = dayBusy;
    $('dayBusy').disabled = isClosed;
    const taken = busyTimes[sel] || [];
    const slots = slotsFor(d);
    $('daySlots').innerHTML = isClosed
      ? '<p class="slots-empty">Ovo je neradni dan po radnom vremenu (termini.js), klijenti ga ne mogu izabrati.</p>'
      : slots.map(t => {
          const busy = dayBusy || taken.includes(t);
          return `<button type="button" class="adm-slot ${busy ? 'busy' : ''}" data-time="${t}" aria-pressed="${busy}"${dayBusy ? ' disabled' : ''}><b>${t}</b><span>${busy ? 'Zauzeto' : 'Slobodno'}</span></button>`;
        }).join('');
  };

  const save = async (url, body, okMsg) => {
    try {
      setData(await api(url, body));
      renderCal(); renderDay(); renderStats();
      toast(okMsg);
    } catch (err) {
      if (err.status === 401) { toast('Sesija je istekla. Prijavite se ponovo.', true); showLogin(); return; }
      toast(err.message || 'Promena nije sačuvana.', true);
      renderDay();
    }
  };
  $('dayBusy').addEventListener('change', e => {
    const busy = e.target.checked;
    save('/api/admin/day', { date: sel, busy }, busy ? 'Dan je označen kao zauzet.' : 'Dan je ponovo slobodan.');
  });
  $('daySlots').addEventListener('click', e => {
    const b = e.target.closest('.adm-slot');
    if (!b || b.disabled) return;
    const busy = b.getAttribute('aria-pressed') !== 'true';
    save('/api/admin/slot', { date: sel, time: b.dataset.time, busy }, `${b.dataset.time} je ${busy ? 'zauzet' : 'slobodan'}.`);
  });

  // ---------- stats (next 30 days) ----------
  const renderStats = () => {
    let busy = 0, part = 0;
    for (let i = 0; i < 30; i++) {
      const d = new Date(today); d.setDate(d.getDate() + i);
      const st = state(d);
      if (st === 'busy') busy++; else if (st === 'part') part++;
    }
    $('admStats').innerHTML = `<div><b>${busy}</b><span>zauzetih dana</span></div><div><b>${part}</b><span>delimično zauzetih</span></div><small>narednih 30 dana</small>`;
  };

  // ---------- start ----------
  api('/api/me').then(me => showDash(me.username)).catch(showLogin);
})();
