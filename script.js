(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];

  // Scroll reveal for text blocks (.rv) and photos (.ph)
  const els = $$('.rv, .ph');
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    els.forEach(el => io.observe(el));
    // Fallback: reveal anything already on screen, even if the observer is slow to fire
    const revealVisible = () => els.forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.top < innerHeight && r.bottom > 0) { el.classList.add('in'); io.unobserve(el); }
    });
    requestAnimationFrame(revealVisible);
    addEventListener('load', revealVisible);
  } else {
    els.forEach(el => el.classList.add('in'));
  }

  // Header background, floating button and hero parallax
  const header = $('#header');
  const fab = $('#fab');
  const heroImg = $('#heroImg');
  let ticking = false;
  const onScroll = () => {
    const y = scrollY;
    header?.classList.toggle('solid', y > 40);
    fab?.classList.toggle('show', y > innerHeight * 0.7);
    if (heroImg && !reduce && y < innerHeight * 1.2) heroImg.style.translate = `0 ${y * 0.18}px`;
    ticking = false;
  };
  addEventListener('scroll', () => { if (!ticking) { requestAnimationFrame(onScroll); ticking = true; } }, { passive: true });
  onScroll();

  // Menu drawer (tablet / small desktop) and full-screen menu (phones)
  const menuBtn = $('#menuBtn');
  const isOpen = () => document.body.classList.contains('menu-open');
  const setMenu = (open, returnFocus = false) => {
    if (open === isOpen()) return;
    document.body.classList.toggle('menu-open', open);
    menuBtn?.setAttribute('aria-expanded', open);
    menuBtn?.setAttribute('aria-label', open ? 'Zatvori meni' : 'Otvori meni');
    if (open) setTimeout(() => $('#nav a')?.focus({ preventScroll: true }), 120);
    else if (returnFocus) menuBtn?.focus({ preventScroll: true });
  };
  menuBtn?.addEventListener('click', () => setMenu(!isOpen()));
  $('#navBackdrop')?.addEventListener('click', () => setMenu(false, true));
  $$('#nav a').forEach(a => a.addEventListener('click', () => setMenu(false)));
  // Keep Tab inside the open menu
  addEventListener('keydown', e => {
    if (e.key !== 'Tab' || !isOpen()) return;
    const items = [menuBtn, ...$$('#nav a')].filter(Boolean);
    const i = items.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); items[items.length - 1].focus(); }
    else if (!e.shiftKey && i === items.length - 1) { e.preventDefault(); items[0].focus(); }
  });
  matchMedia('(min-width: 1101px)').addEventListener('change', e => { if (e.matches) setMenu(false); });

  // Vehicle-size price switcher (home page)
  const labels = ['Mali auto', 'Auto', 'SUV'];
  $$('.size-pick button').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = +btn.dataset.size;
      $$('.size-pick button').forEach(b => b.setAttribute('aria-pressed', b === btn));
      $$('[data-prices]').forEach(el => {
        el.style.opacity = 0;
        setTimeout(() => { el.textContent = el.dataset.prices.split(',')[i] + '€'; el.style.opacity = 1; }, 160);
      });
      // The icon next to each price follows the selected vehicle
      const icon = $('img', btn);
      $$('.size-label img').forEach(img => {
        img.src = icon.src; img.alt = labels[i];
        img.width = icon.getAttribute('width'); img.height = icon.getAttribute('height');
      });
    });
  });

  // Services slider arrows (home page)
  const track = $('#track');
  if (track) {
    const step = () => (track.firstElementChild?.getBoundingClientRect().width || 300) + 16;
    $('#prev')?.addEventListener('click', () => track.scrollBy({ left: -step(), behavior: 'smooth' }));
    $('#next')?.addEventListener('click', () => track.scrollBy({ left: step(), behavior: 'smooth' }));
  }

  // ---------- Before / after compare sliders ----------
  const arrows = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l-6 6 6 6M15 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const sliders = $$('.cmp').map(cmp => {
    cmp.insertAdjacentHTML('beforeend',
      '<span class="cmp-tag pre">Pre</span><span class="cmp-tag posle">Posle</span>' +
      '<span class="cmp-line"></span>' +
      `<span class="cmp-knob" role="slider" tabindex="0" aria-label="Pomeri liniju pre i posle" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50">${arrows}</span>` +
      '<span class="cmp-hint">← Prevucite →</span>');
    const knob = $('.cmp-knob', cmp);
    let pos = 50, anim = null;

    const set = p => {
      pos = Math.max(0, Math.min(100, p));
      cmp.style.setProperty('--pos', pos + '%');
      knob.setAttribute('aria-valuenow', Math.round(pos));
      cmp.dataset.near = pos > 70 ? 'pre' : pos < 30 ? 'posle' : '';
    };
    const stop = () => { if (anim) cancelAnimationFrame(anim); anim = null; cmp.classList.add('touched'); };
    const fromEvent = e => {
      const r = cmp.getBoundingClientRect();
      set(((e.clientX - r.left) / r.width) * 100);
    };

    cmp.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      stop();
      cmp.classList.add('dragging');
      cmp.setPointerCapture(e.pointerId);
      fromEvent(e);
    });
    cmp.addEventListener('pointermove', e => { if (cmp.classList.contains('dragging')) fromEvent(e); });
    const end = () => cmp.classList.remove('dragging');
    cmp.addEventListener('pointerup', end);
    cmp.addEventListener('pointercancel', end);

    knob.addEventListener('keydown', e => {
      const map = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5, PageDown: -20, PageUp: 20 };
      if (e.key in map) set(pos + map[e.key]);
      else if (e.key === 'Home') set(0);
      else if (e.key === 'End') set(100);
      else return;
      e.preventDefault(); stop();
    });

    // "Slide" intro: sweep to show the before photo, then the after photo, then settle in the middle
    const sweep = () => {
      if (reduce || cmp.classList.contains('touched')) return;
      const keys = [[0, 50], [700, 88], [1500, 12], [2300, 50]];
      const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const t0 = performance.now();
      const frame = now => {
        const t = now - t0;
        let i = 1;
        while (i < keys.length - 1 && t > keys[i][0]) i++;
        const [ta, pa] = keys[i - 1], [tb, pb] = keys[i];
        const k = Math.min(1, Math.max(0, (t - ta) / (tb - ta)));
        set(pa + (pb - pa) * ease(k));
        anim = t < keys[keys.length - 1][0] ? requestAnimationFrame(frame) : null;
      };
      anim = requestAnimationFrame(frame);
    };

    set(50);
    return { cmp, sweep };
  });

  if (sliders.length && 'IntersectionObserver' in window) {
    const sio = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const s = sliders.find(x => x.cmp === e.target);
        setTimeout(s.sweep, 350);
        sio.unobserve(e.target);
      });
    }, { threshold: 0.55 });
    sliders.forEach(s => sio.observe(s.cmp));
  }

  // ---------- Gallery lightbox ----------
  const items = $$('.masonry button');
  let lb = null, idx = 0;
  if (items.length) {
    document.body.insertAdjacentHTML('beforeend', `
      <div class="lightbox" id="lightbox" role="dialog" aria-modal="true" aria-label="Galerija fotografija">
        <img alt="">
        <button class="lb-btn lb-close" type="button" aria-label="Zatvori"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
        <button class="lb-btn lb-prev" type="button" aria-label="Prethodna fotografija"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <button class="lb-btn lb-next" type="button" aria-label="Sledeća fotografija"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <span class="lb-count"></span>
      </div>`);
    lb = $('#lightbox');
    const img = $('img', lb), count = $('.lb-count', lb);
    let lastFocus = null;

    const show = i => {
      idx = (i + items.length) % items.length;
      const src = $('img', items[idx]);
      img.style.opacity = 0;
      img.onload = () => { img.style.opacity = 1; };
      img.src = src.currentSrc || src.src;
      img.alt = src.alt;
      count.textContent = `${idx + 1} / ${items.length}`;
    };
    const open = i => {
      lastFocus = document.activeElement;
      show(i);
      lb.classList.add('open');
      document.body.style.overflow = 'hidden';
      $('.lb-close', lb).focus();
    };
    const close = () => {
      lb.classList.remove('open');
      document.body.style.overflow = '';
      lastFocus?.focus();
    };

    items.forEach((b, i) => b.addEventListener('click', () => open(i)));
    $('.lb-close', lb).addEventListener('click', close);
    $('.lb-prev', lb).addEventListener('click', () => show(idx - 1));
    $('.lb-next', lb).addEventListener('click', () => show(idx + 1));
    lb.addEventListener('click', e => { if (e.target === lb) close(); });

    // Swipe left/right on phones
    let x0 = null;
    lb.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', e => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 50) show(idx + (dx < 0 ? 1 : -1));
      x0 = null;
    });

    addEventListener('keydown', e => {
      if (!lb.classList.contains('open')) return;
      if (e.key === 'ArrowRight') show(idx + 1);
      if (e.key === 'ArrowLeft') show(idx - 1);
    });
  }

  addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    setMenu(false, true);
    if (lb?.classList.contains('open')) { lb.classList.remove('open'); document.body.style.overflow = ''; }
  });
})();

// ======================================================================
// Zakazivanje – booking form, calendar and WhatsApp request
// Working hours come from termini.js; busy days / times come from the server (/api/availability)
// ======================================================================
(() => {
  const form = document.getElementById('bookForm');
  const cfg = window.ZAKAZIVANJE;
  if (!form || !cfg) return;
  const $ = id => document.getElementById(id);

  const SERVICES = {
    refresh: { name: 'Refresh paket', prices: [90, 110, 120], dur: '1–2 dana' },
    full:    { name: 'Full paket', prices: [230, 270, 300], dur: '1–2 dana' },
    premium: { name: 'Premium paket', prices: [290, 350, 400], dur: '2–3 dana' },
    pol1:    { name: 'Poliranje – jednoslojno', prices: [90, 120, 150], dur: '1 dan' },
    pol2:    { name: 'Poliranje – dvoslojno', prices: [150, 180, 200], dur: '1–2 dana' },
    pol3:    { name: 'Poliranje – višeslojno', prices: [200, 250, 300], dur: '1–2 dana' },
    klima:   { name: 'Dezinfekcija klime', prices: [30, 30, 30], dur: 'isti dan' },
    farovi:  { name: 'Polimerizacija farova', prices: [30, 30, 30], dur: 'isti dan' },
    motor:   { name: 'Detaljno pranje motornog prostora', prices: [40, 40, 40], dur: 'isti dan' },
    ker_staklo:  { name: 'Keramička zaštita staklenih površina', prices: [40, 40, 40], from: true, dur: 'po dogovoru' },
    ker_tekstil: { name: 'Keramička zaštita tekstilnih površina', prices: [40, 40, 40], from: true, dur: 'po dogovoru' },
    ker_lak:     { name: 'Keramička zaštita laka', prices: [50, 50, 50], from: true, dur: 'po dogovoru' }
  };
  const SIZES = ['Mali auto', 'Auto', 'SUV'];
  const priceOf = (s, i) => `${s.from ? 'od ' : ''}${s.prices[i]}€`;
  const MONTHS = ['januar', 'februar', 'mart', 'april', 'maj', 'jun', 'jul', 'avgust', 'septembar', 'oktobar', 'novembar', 'decembar'];
  const DAYS = ['nedelja', 'ponedeljak', 'utorak', 'sreda', 'četvrtak', 'petak', 'subota'];

  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const human = d => `${DAYS[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}.`;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Bookable through the last day of next month (30 Sep → all of October, not November)
  const maxDate = new Date(today.getFullYear(), today.getMonth() + 2, 0);
  let busyDays = new Set();
  let busyTimes = {};

  const slotsFor = d => (d.getDay() === 6 && cfg.terminiSubota) ? cfg.terminiSubota : cfg.termini;
  const freeSlots = d => {
    const taken = busyTimes[iso(d)] || [];
    return slotsFor(d).filter(t => {
      if (taken.includes(t)) return false;
      if (+d === +today) { // no times that already passed today (1 h notice)
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m > now.getHours() * 60 + now.getMinutes() + 60;
      }
      return true;
    });
  };
  const dayState = d => {
    if (d < today || d > maxDate) return 'off';
    if ((cfg.neradniDani || []).includes(d.getDay())) return 'closed';
    if (busyDays.has(iso(d))) return 'busy';
    const free = freeSlots(d).length;
    if (!free) return +d === +today ? 'off' : 'busy'; // today with no times left is just "past", not "busy"
    return free < slotsFor(d).length ? 'part' : 'free';
  };

  let view = new Date(today.getFullYear(), today.getMonth(), 1);
  let selDate = null, selTime = null;

  // ---------- Calendar ----------
  const grid = $('calGrid');
  const renderCal = () => {
    $('calTitle').textContent = `${MONTHS[view.getMonth()]} ${view.getFullYear()}`;
    $('calPrev').disabled = view <= new Date(today.getFullYear(), today.getMonth(), 1);
    $('calNext').disabled = new Date(view.getFullYear(), view.getMonth() + 1, 1) > maxDate;

    const first = (view.getDay() + 6) % 7; // Monday-first week
    const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    let html = '<span class="day blank"></span>'.repeat(first);
    for (let i = 1; i <= days; i++) {
      const d = new Date(view.getFullYear(), view.getMonth(), i);
      const st = dayState(d);
      const off = st === 'off' || st === 'closed' || st === 'busy';
      const note = st === 'busy' ? ' – zauzeto' : st === 'closed' ? ' – neradni dan' : st === 'part' ? ' – delimično zauzeto' : '';
      const cls = ['day', st === 'busy' ? 'busy' : '', st === 'part' ? 'part' : '', +d === +today ? 'today' : ''].join(' ').trim();
      html += `<button type="button" class="${cls}" data-date="${iso(d)}" aria-pressed="${selDate === iso(d)}" aria-label="${human(d)}${note}"${off ? ' disabled' : ''}>${i}</button>`;
    }
    grid.innerHTML = html;
  };
  grid.addEventListener('click', e => {
    const b = e.target.closest('.day');
    if (!b || b.disabled) return;
    selDate = b.dataset.date; selTime = null;
    renderCal(); renderSlots(); update();
    $('bkDateErr').textContent = '';
  });
  $('calPrev').addEventListener('click', () => { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); renderCal(); });
  $('calNext').addEventListener('click', () => { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); renderCal(); });

  // ---------- Time slots ----------
  const slotsEl = $('slots');
  const renderSlots = () => {
    if (!selDate) { slotsEl.innerHTML = '<p class="slots-empty">Prvo izaberite dan u kalendaru.</p>'; return; }
    const d = fromIso(selDate);
    const free = freeSlots(d);
    slotsEl.innerHTML = slotsFor(d).map(t => {
      const ok = free.includes(t);
      return `<button type="button" class="slot" role="radio" data-time="${t}" aria-checked="${selTime === t}" aria-label="${t}${ok ? '' : ' – zauzeto'}"${ok ? '' : ' disabled'}>${t}</button>`;
    }).join('');
  };
  slotsEl.addEventListener('click', e => {
    const b = e.target.closest('.slot');
    if (!b || b.disabled) return;
    selTime = b.dataset.time;
    renderSlots(); update();
    $('bkTimeErr').textContent = '';
  });

  // ---------- Summary ----------
  const size = () => +(form.querySelector('input[name="velicina"]:checked')?.value ?? 1);
  const update = () => {
    const s = SERVICES[$('bkService').value];
    const model = $('bkModel').value.trim(), year = $('bkYear').value.trim();
    const who = [$('bkName').value.trim(), $('bkPhone').value.trim()].filter(Boolean).join(' · ');
    $('sumClient').textContent = who || '—';
    $('sumService').textContent = s ? s.name : '—';
    // Car text plus the icon of the selected vehicle size
    const car = $('sumCar'), icon = form.querySelector('input[name="velicina"]:checked + span img').cloneNode();
    car.textContent = model ? `${model}${year ? ` (${year})` : ''}` : '';
    car.append(icon);
    $('sumWhen').textContent = selDate ? `${human(fromIso(selDate))}${selTime ? ` u ${selTime}` : ''}` : '—';
    $('sumDur').textContent = s ? s.dur : '—';
    $('sumPrice').textContent = s ? priceOf(s, size()) : '—';
  };
  form.addEventListener('input', update);
  form.addEventListener('change', update);

  // "Zakaži …" buttons in the price list preselect the service
  document.querySelectorAll('[data-book]').forEach(a => a.addEventListener('click', () => {
    $('bkService').value = a.dataset.book;
    $('bkService').removeAttribute('aria-invalid'); $('bkServiceErr').textContent = '';
    update();
  }));
  // Keep vehicle size in sync with the price-list switch
  document.querySelectorAll('.size-pick button').forEach(b => b.addEventListener('click', () => {
    const r = $('bkSize' + b.dataset.size); if (r) { r.checked = true; update(); }
  }));

  // ---------- Validation + submit ----------
  const setErr = (input, errId, msg) => {
    $(errId).textContent = msg;
    if (input) msg ? input.setAttribute('aria-invalid', 'true') : input.removeAttribute('aria-invalid');
    return !msg;
  };
  form.addEventListener('submit', e => {
    e.preventDefault();
    const name = $('bkName'), phone = $('bkPhone'), model = $('bkModel'), year = $('bkYear'), svc = $('bkService');
    const y = +year.value, maxY = today.getFullYear() + 1;
    const checks = [
      [name, setErr(name, 'bkNameErr', name.value.trim().split(/\s+/).length < 2 ? 'Upišite ime i prezime.' : '')],
      [phone, setErr(phone, 'bkPhoneErr', !/^\+?[\d\s\/().-]{8,20}$/.test(phone.value.trim()) || phone.value.replace(/\D/g, '').length < 8 ? 'Upišite ispravan broj telefona, npr. 063 123 4567.' : '')],
      [model, setErr(model, 'bkModelErr', !model.value.trim() ? 'Upišite marku i model vozila.' : '')],
      [year, setErr(year, 'bkYearErr', !(y >= 1950 && y <= maxY) ? `Upišite godište između 1950 i ${maxY}.` : '')],
      [svc, setErr(svc, 'bkServiceErr', !svc.value ? 'Izaberite uslugu.' : '')],
      [grid.querySelector('button.day:not(:disabled)'), setErr(null, 'bkDateErr', !selDate ? 'Izaberite dan u kalendaru.' : '')],
      [slotsEl.querySelector('.slot:not(:disabled)'), setErr(null, 'bkTimeErr', selDate && !selTime ? 'Izaberite vreme dolaska.' : '')]
    ];
    const bad = checks.find(([, ok]) => !ok);
    if (bad) { bad[0]?.focus(); return; }

    const s = SERVICES[svc.value];
    const note = $('bkNote').value.trim();
    const msg = [
      'Zdravo! Želim da zakažem termin preko sajta.',
      '',
      `Ime i prezime: ${name.value.trim()}`,
      `Telefon: ${phone.value.trim()}`,
      `Vozilo: ${model.value.trim()} (${y}), ${SIZES[size()]}`,
      `Usluga: ${s.name} – okvirno ${priceOf(s, size())} (${s.dur})`,
      `Termin: ${human(fromIso(selDate))} u ${selTime}`,
      note ? `Napomena: ${note}` : ''
    ].filter((l, i, a) => l || i === 1).join('\n');

    const url = `https://wa.me/${cfg.whatsapp}?text=${encodeURIComponent(msg)}`;
    $('bookDone').hidden = false;
    window.open(url, '_blank', 'noopener');
  });

  renderCal(); renderSlots(); update();

  // Load busy days set by the admin, then redraw
  fetch('/api/availability', { cache: 'no-store' })
    .then(r => r.ok ? r.json() : Promise.reject(r.status))
    .then(data => {
      busyDays = new Set(data.zauzetiDani || []);
      busyTimes = data.zauzetiTermini || {};
      if (selDate && dayState(fromIso(selDate)) === 'busy') { selDate = null; selTime = null; }
      if (selDate && selTime && !freeSlots(fromIso(selDate)).includes(selTime)) selTime = null;
      renderCal(); renderSlots(); update();
    })
    .catch(() => { /* no server (plain static hosting): calendar still works, nothing extra blocked */ });
})();

// ======================================================================
// Service descriptions – click an item in a package to read what it includes
// Items with no entry here stay plain text.
// ======================================================================
(() => {
  const OPIS = {
    'Premium pranje u više faza': 'Podrazumeva pranje u više koraka a to je predpranje vozila i nanošenje sredstva kako bi omekšala prljavština i samim tim pripremamo površinu auta za ručno pranje i time smanjujemo rizik od grebanja samog laka, pažljivo prelazimo svaki panel sa mikrofiber rukavicom nakon čega pažljivo nanosimo zaštitni vosak, zatim ispiramo vozilo i sušimo vozilo posebnim peškirom kako bismo izbegli vodene mrlje.',
    'Detaljno pranje felni': 'Običnim pranjem ne možemo ukloniti čestice od kočnica i tragove katrana, zbog toga felnu tretiramo sa najkvalitetnijom hemijom i četkicama kako bismo zašli u najsitniju šupljinu felne.',
    'Detaljno usisavanje enterijera': 'Podrazumeva detaljno usisavanje svih površina, sedišta, tepiha, gepeka kako bismo pripremili enterijer za hemijsko čišćenje.',
    'Hemijsko pranje enterijera': 'Podrazumeva dubinsko čišćenje sedišta, gepeka i svih podnih površina pomoću posebnog šampona i dubinskog usisivača za ekstrakciono pranje kako bismo uklonili fleke, bakterije, alergene, prljavštinu i neprijatne mirise.\n\nDok kožna sedišta tretiramo posebnim sredstvima koje održavaju i hidriraju samu kožu, sprečavajući dalje pucanje i oštećenje iste.',
    'Detailing enterijera': 'Podrazumeva posebno usmerenu pažnju svakom detalju u enterijeru, sa posebnim četkicama i pažljivo odabranom hemijom dolazimo do rezultata koji će vam vratiti osećaj novog enterijera.',
    'Dresing enterijera': 'Podrazumeva nanošenje zaštite na sve plastične površine, kako bismo zaštitili plastične delove u autu od UV zraka i daljeg habanja.',
    'Čišćenje staklenih površina': 'Podrazumeva temeljno uklanjanje svih mrlja, prašine i tragova prstiju na samom staklu, kako bismo postigli maksimalnu vidljivost.',
    'Dresing za gume': 'Podrazumeva poseban zaštitni premaz kako bi vaša guma dobila mat sjaj a samim tim produžavate životni vek same gume i sprečavate da ona izbledi.',
    'Dresing pneumatika': 'Podrazumeva poseban zaštitni premaz kako bi vaša guma dobila mat sjaj a samim tim produžavate životni vek same gume i sprečavate da ona izbledi.',
    'Dezinfekcija enterijera ozonizatorom': 'Dezinfekcija i sterilizacija ozonizatorom su izuzetno efikasni u ubijanju bakterija, virusa, plesni i drugih mikroorganizama. Ovaj proces dezinfekcije osigurava da unutrašnjost vozila bude higijenski čista.\n\nJedna od najvećih prednosti ozonizatora je njegova sposobnost da eliminiše neprijatne mirise. Bez obzira na to da li se radi o mirisu dima, kućnih ljubimaca, hrane ili vlage, ozon efikasno uklanja te mirise, ostavljajući vozilo svežim i prijatnim za korišćenje.',
    'Osnovno sređivanje enterijera': 'Podrazumeva temeljno usisavanje kompletnog auta kao i brisanje plastičnih površina kao i samih stakala.\n\n*ne podrazumeva uklanjanje dubinske prljavštine*',
    'Polimerizacija farova': 'Podrazumeva proces detaljnog i temeljnog pripremanja fara za samu polimerizaciju. Šmirglanjem vodenom šmirglom uklanjamo sve ogrebotine i oštećenja i samo žutilo sa fara pripremajući sam far za proces polimerizacije sa polimerom. Nanosimo polimer na sam far čime dobijate besprekoran rezultat, vaš far dobija maksimalnu vidljivost i samim tim estetski jak lep rezultat.'
  };

  const items = [...document.querySelectorAll('.pkg li, .extra h4')];
  if (!items.length || typeof HTMLDialogElement === 'undefined') return;

  document.body.insertAdjacentHTML('beforeend', `
    <dialog class="opis" id="opis" aria-labelledby="opisTitle">
      <button class="opis-close" type="button" aria-label="Zatvori"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      <h3 id="opisTitle"></h3>
      <div id="opisText"></div>
    </dialog>`);
  const dlg = document.getElementById('opis');
  const root = document.documentElement;

  const open = title => {
    document.getElementById('opisTitle').textContent = title;
    const box = document.getElementById('opisText');
    box.replaceChildren(...OPIS[title].split('\n\n').map(t => Object.assign(document.createElement('p'), { textContent: t })));
    // Stop the page behind from scrolling, without it jumping sideways
    document.body.style.paddingRight = (innerWidth - root.clientWidth) + 'px';
    root.style.overflow = 'hidden';
    dlg.showModal();
  };
  let openedByPointer = false;
  dlg.addEventListener('close', () => {
    root.style.overflow = ''; document.body.style.paddingRight = '';
    // Keyboard users keep their place; a mouse/touch user shouldn't be left with a card highlighted
    if (openedByPointer) document.activeElement?.blur();
  });
  dlg.querySelector('.opis-close').addEventListener('click', () => dlg.close());
  // Close on a click outside the box (the backdrop also reports the dialog as its target)
  dlg.addEventListener('click', e => {
    const r = dlg.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (e.target === dlg && !inside) dlg.close();
  });

  // Turn each item that has a description into a button (the check icon stays outside it)
  items.forEach(el => {
    const node = [...el.childNodes].find(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
    const title = node?.textContent.trim();
    if (!title || !OPIS[title]) return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'opis-btn';
    b.setAttribute('aria-label', `${title} – prikaži opis`);
    b.textContent = title;
    b.setAttribute('aria-haspopup', 'dialog');
    // detail is 0 when the click came from the keyboard (Enter / Space)
    b.addEventListener('click', e => { openedByPointer = e.detail > 0; open(title); });
    node.replaceWith(b);
  });
})();
