// Full-screen slideshow for unlocked case studies.
// Slides, layers and videos are separate encrypted files: each is fetched and
// decrypted only when it's about to be shown. Click / arrows / swipe to move,
// Esc closes. No transitions (instant cut, like the Figma deck).
(() => {
  const ICON = {
    prev: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M11 3L5 9l6 6"/></svg>',
    next: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M7 3l6 6-6 6"/></svg>',
    fs: '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9"/></svg>',
    arrow: '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M1 7h12M8 2l5 5-5 5"/></svg>',
  };
  const W = 1920, H = 1080;
  const px = (v, base) => (v / base * 100).toFixed(4) + '%';
  const cq = v => (v / W * 100).toFixed(4) + 'cqw';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const WORDS = ['Stories', 'Articles', 'Clinical Updates', 'Case Studies', 'Magazines'];

  window.initDeck = (root, manifest, key) => {
    // ---------- encrypted asset loader ----------
    const cache = new Map();
    function load(ref) {
      if (!cache.has(ref.f)) {
        cache.set(ref.f, fetch(ref.f).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
          .then(buf => crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(buf, 0, 12) }, key, new Uint8Array(buf, 12)))
          .then(plain => URL.createObjectURL(new Blob([plain], { type: ref.t }))));
      }
      return cache.get(ref.f);
    }

    // ---------- build slides ----------
    const stage = document.createElement('div');
    stage.className = 'deck__stage';
    const total = manifest.slides.length;
    const slides = manifest.slides.map((s, n) => {
      const el = document.createElement('section');
      el.className = 'slide is-loading'; el.hidden = true;
      el.setAttribute('aria-roledescription', 'slide'); el.setAttribute('aria-label', `${n + 1} of ${total}`);
      let h = `<img class="slide__img" alt="${esc(manifest.alt)}, slide ${n + 1} of ${total}" decoding="async">`;
      (s.videos || []).forEach((v, k) => {
        h += `<video class="slide__video" data-v="${k}" muted loop playsinline preload="none" aria-hidden="true" style="left:${px(v.x, W)};top:${px(v.y, H)};width:${px(v.w, W)};height:${px(v.h, H)};object-fit:${v.fit};object-position:${v.pos};border-radius:${cq(v.radius || 0)}"></video>`;
      });
      (s.layers || []).forEach((l, k) => {
        h += `<img class="slide__layer" data-l="${k}" alt="" aria-hidden="true" style="left:${px(l.x, W)};top:${px(l.y, H)};width:${px(l.w, W)};height:${px(l.h, H)}">`;
      });
      (s.tickers || []).forEach(t => {
        const [cx, cy, cw, ch] = t.cursor;
        h += `<div class="ticker${t.fade ? ' ticker--fade' : ''}" data-start="${t.start}" aria-hidden="true" style="left:${px(t.x, W)};top:${px(t.y, H)};width:${px(t.w, W)};height:${px(t.pitch, H)};--fs:${cq(t.fs * 0.965)};--pitch:${cq(t.pitch)};--pad:${cq(t.pad)};--dy:${cq(t.dy || 0)}"><div class="ticker__list">${WORDS.map(w => `<span>${w}</span>`).join('')}</div></div>`;
        h += `<div class="blink" aria-hidden="true" style="left:${px(cx, W)};top:${px(cy, H)};width:${px(cw, W)};height:${px(ch, H)}"></div>`;
      });
      (s.hotspots || []).forEach(a => {
        h += `<a class="hotspot" href="${esc(a.url)}" target="_blank" rel="noopener" aria-label="${esc(a.label)}" style="left:${px(a.x, W)};top:${px(a.y, H)};width:${px(a.w, W)};height:${px(a.h, H)}"></a>`;
      });
      el.innerHTML = h + '<span class="slide__spinner" aria-hidden="true"></span>';
      stage.appendChild(el);
      return el;
    });
    root.appendChild(stage);

    const ready = new Map();
    function prepare(n, withMedia) {
      if (n < 0 || n >= total) return Promise.resolve();
      const s = manifest.slides[n], el = slides[n];
      if (!ready.has(n)) {
        ready.set(n, Promise.all([
          load(s.img).then(u => new Promise(res => { const img = el.querySelector('.slide__img'); img.onload = img.onerror = res; img.src = u; })),
          ...(s.layers || []).map((l, k) => load(l.src).then(u => { el.querySelector(`[data-l="${k}"]`).src = u; })),
        ]).then(() => el.classList.remove('is-loading')).catch(() => el.classList.add('is-error')));
      }
      if (withMedia) (s.videos || []).forEach((v, k) => load(v.src).then(u => {
        const vid = el.querySelector(`[data-v="${k}"]`);
        if (!vid.src) { vid.src = u; vid.load(); }
        if (el.classList.contains('is-active')) vid.play().catch(() => {});
      }));
      return ready.get(n);
    }

    // ---------- controls ----------
    const pad = n => String(n).padStart(2, '0');
    const ui = document.createElement('div');
    ui.className = 'deck__ui';
    ui.innerHTML = `
      <button class="deck__nav deck__nav--prev" type="button" aria-label="Previous slide">${ICON.prev}</button>
      <button class="deck__nav deck__nav--next" type="button" aria-label="Next slide">${ICON.next}</button>
      <div class="deck__bar">
        <span class="deck__count" aria-live="polite"><span data-cur>01</span> / ${pad(total)}</span>
        <button class="deck__btn" type="button" data-fs aria-label="Toggle full screen">${ICON.fs}<span class="lbl">Full screen</span></button>
        <a class="deck__btn deck__btn--next-cs" href="${manifest.next}" hidden>Next case study ${ICON.arrow}</a>
      </div>`;
    root.appendChild(ui);
    const prevBtn = ui.querySelector('.deck__nav--prev'), nextBtn = ui.querySelector('.deck__nav--next');
    const curEl = ui.querySelector('[data-cur]'), nextCs = ui.querySelector('.deck__btn--next-cs');
    const fsBtn = ui.querySelector('[data-fs]');

    let i = -1, end = null;
    const tickers = new Map();
    function show(n) {
      n = Math.max(0, Math.min(total - 1, n));
      if (i >= 0) { const old = slides[i]; old.classList.remove('is-active'); old.hidden = true; stopTickers(old); old.querySelectorAll('video').forEach(v => v.pause()); }
      i = n;
      const el = slides[i];
      el.hidden = false; el.classList.add('is-active');
      prepare(i, true).then(() => { if (el.classList.contains('is-active')) startTickers(el); });
      el.querySelectorAll('video').forEach(v => { if (v.src) { v.currentTime = 0; v.play().catch(() => {}); } });
      [i + 1, i + 2, i - 1].forEach(k => prepare(k, k === i + 1));
      curEl.textContent = pad(i + 1);
      prevBtn.disabled = i === 0;
      nextCs.hidden = i !== total - 1;
      try { history.replaceState(null, '', '#' + (i + 1)); } catch (e) {}
    }
    function next() { if (end) return; i < total - 1 ? show(i + 1) : showEnd(); }
    function prev() { if (end) { hideEnd(); return; } show(i - 1); }

    function showEnd() {
      end = document.createElement('div');
      end.className = 'deck__end';
      end.innerHTML = `<div><p>Next case study</p><h2>${esc(manifest.nextTitle)}</h2>
        <div class="row"><a href="${manifest.next}">View case study ${ICON.arrow}</a>
        <a class="ghost" href="../work.html">Close</a></div></div>`;
      document.body.appendChild(end);
      end.querySelector('a').focus();
    }
    function hideEnd() { if (end) { end.remove(); end = null; } }

    // ---------- search-bar word ticker ----------
    function startTickers(slide) {
      slide.querySelectorAll('.ticker').forEach(t => {
        if (tickers.has(t)) return;
        const list = t.querySelector('.ticker__list'), items = [...list.children];
        let k = +t.dataset.start || 0, timer;
        const place = (idx, animate) => {
          list.style.transition = animate ? 'transform 1.02s cubic-bezier(.22,1,.36,1)' : 'none';
          list.style.transform = `translateY(${-idx * t.getBoundingClientRect().height}px)`;
          items.forEach((s, j) => s.classList.toggle('is-on', j === idx));
        };
        place(k, false);
        const step = () => {
          if (k === items.length - 1) {
            list.style.transition = 'opacity .38s ease'; list.style.opacity = 0;
            timer = setTimeout(() => { k = 0; place(k, false); list.style.opacity = 1; timer = setTimeout(step, 380 + 800); }, 380);
          } else { k += 1; place(k, true); timer = setTimeout(step, 1020 + 800); }
        };
        timer = setTimeout(step, 800);
        const onResize = () => place(k, false);
        addEventListener('resize', onResize);
        tickers.set(t, () => { clearTimeout(timer); removeEventListener('resize', onResize); list.style.opacity = 1; });
      });
    }
    function stopTickers(slide) {
      slide.querySelectorAll('.ticker').forEach(t => { const stop = tickers.get(t); if (stop) { stop(); tickers.delete(t); } });
    }

    // ---------- input ----------
    prevBtn.addEventListener('click', e => { e.stopPropagation(); prev(); });
    nextBtn.addEventListener('click', e => { e.stopPropagation(); next(); });
    stage.addEventListener('click', e => {
      if (e.target.closest('a')) return;
      const r = stage.getBoundingClientRect();
      (e.clientX - r.left) < r.width * 0.3 ? prev() : next();
    });
    addEventListener('keydown', e => {
      if (e.target.closest && e.target.closest('input, textarea')) return;
      if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key)) { if (e.key === 'Enter' && e.target.closest('a,button')) return; e.preventDefault(); next(); }
      else if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); prev(); }
      else if (e.key === 'Home') show(0);
      else if (e.key === 'End') show(total - 1);
      else if (e.key === 'Escape' && !document.fullscreenElement) { if (end) hideEnd(); else location.href = '../work.html'; }
    });
    let sx = null, sy = null;
    stage.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    stage.addEventListener('touchend', e => {
      if (sx === null) return;
      const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { e.preventDefault(); dx < 0 ? next() : prev(); }
      sx = null;
    });

    const fsEl = document.documentElement;
    if (!(fsEl.requestFullscreen || fsEl.webkitRequestFullscreen)) fsBtn.hidden = true;
    fsBtn.addEventListener('click', () => {
      const on = document.fullscreenElement || document.webkitFullscreenElement;
      try {
        if (on) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        else (fsEl.requestFullscreen || fsEl.webkitRequestFullscreen).call(fsEl);
      } catch (e) {}
    });

    let idle;
    const wake = () => { document.body.classList.remove('deck-idle'); clearTimeout(idle); idle = setTimeout(() => { if (!end) document.body.classList.add('deck-idle'); }, 2500); };
    ['mousemove', 'mousedown', 'touchstart', 'keydown'].forEach(ev => addEventListener(ev, wake, { passive: true }));
    wake();

    show(Math.min(total, Math.max(1, parseInt(location.hash.slice(1), 10) || 1)) - 1);

    // quietly fetch the remaining slide images in the background, one at a time
    (async () => { for (let k = 0; k < total; k++) { try { await prepare(k, false); } catch (e) {} } })();
  };
})();
