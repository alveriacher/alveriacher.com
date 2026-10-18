// Homepage: four "scenes" (Hello → About → Skills → Contact card) in one fixed screen.
// The page itself never scrolls. Wheel / trackpad, finger swipes and keys are read
// directly: each gesture moves one scene in the direction of the gesture, straight
// away, and the text swaps with a quick line-by-line rise + fade.
(() => {
  const scenes = [...document.querySelectorAll('.hero__scene')];
  if (!scenes.length) return;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const OUT_MS = reduce ? 0 : 180;    // old text fades out, then the new text rises in

  scenes.forEach(s => s.querySelectorAll('.scene-line').forEach((el, i) => el.style.setProperty('--i', i)));
  document.body.classList.add('scenes-ready');

  const byName = name => scenes.findIndex(s => s.dataset.scene === name);
  // scenes on screen for scene i (an overlay scene keeps the one it sits over)
  const onScreen = i => { const o = scenes[i].dataset.over; return o ? [byName(o), i] : [i]; };

  let cur = Math.max(0, byName(location.hash.slice(1)));
  let swapTimer = 0;

  const bgs = [...document.querySelectorAll('.hero__bg')];
  const sync = () => {
    scenes.forEach((s, i) => {
      const off = i !== cur; // only the top scene is interactive
      s.setAttribute('aria-hidden', off);
      s.inert = off;
    });
    const look = scenes[onScreen(cur)[0]]; // an overlay takes the look of the scene below it
    document.body.dataset.scene = scenes[cur].dataset.scene;
    document.body.classList.toggle('is-dark', look.dataset.theme === 'dark');
    bgs.forEach(b => b.classList.toggle('is-shown', b.dataset.for === look.dataset.scene));
  };

  function show(n) {
    n = Math.max(0, Math.min(scenes.length - 1, n));
    if (n === cur) return false;
    const before = onScreen(cur), after = onScreen(n);
    const leaving = before.filter(i => !after.includes(i));
    clearTimeout(swapTimer);
    scenes.forEach((s, i) => { if (!before.includes(i)) s.classList.remove('is-leaving', 'is-active'); });
    leaving.forEach(i => { scenes[i].classList.remove('is-active'); scenes[i].classList.add('is-leaving'); });
    cur = n;
    sync();
    swapTimer = setTimeout(() => {
      scenes.forEach((s, i) => { s.classList.remove('is-leaving'); s.classList.toggle('is-active', after.includes(i)); });
    }, leaving.length ? OUT_MS : 0);
    return true;
  }

  const panelOpen = () => { const c = document.querySelector('.contact'); return c && !c.hidden; };

  // ---- wheel / trackpad: one scene per gesture, in the gesture's direction ----
  // A gesture triggers as soon as it has moved 25px. The rest of it (including the
  // trackpad's momentum) is ignored, unless the user clearly starts a new swipe:
  // a short pause, a change of direction, or a fresh burst in the momentum tail.
  const W = { acc: 0, last: 0, locked: false, dir: 0, at: 0, min: Infinity };
  addEventListener('wheel', e => {
    if (panelOpen()) return;
    e.preventDefault();
    const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1);
    if (!dy) return;
    const now = performance.now(), gap = now - W.last, abs = Math.abs(dy), dir = Math.sign(dy);
    W.last = now;
    if (W.locked) {
      const settled = now - W.at > 300;
      const fresh = gap > 110 || (settled && (dir !== W.dir || (abs > 10 && abs > W.min * 2)));
      if (!fresh) { W.min = Math.min(W.min, abs); return; }
      W.locked = false; W.acc = 0;
    }
    if (gap > 110 || Math.sign(W.acc) !== dir) W.acc = 0;
    W.acc += dy;
    if (Math.abs(W.acc) >= 25) {
      show(cur + dir);
      Object.assign(W, { locked: true, dir, at: now, min: abs, acc: 0 });
    }
  }, { passive: false });

  // ---- touch: follow the finger; a 30px drag (or a quick flick) moves one scene ----
  const T = { y: 0, t: 0, done: true };
  addEventListener('touchstart', e => {
    if (panelOpen() || e.touches.length > 1) { T.done = true; return; }
    T.y = e.touches[0].clientY; T.t = performance.now(); T.done = false;
  }, { passive: true });
  addEventListener('touchmove', e => {
    if (panelOpen()) return;
    e.preventDefault();                          // no page scroll / bounce
    if (T.done) return;
    const dy = T.y - e.touches[0].clientY;      // finger up = next, finger down = previous
    if (Math.abs(dy) >= 30) { T.done = true; show(cur + Math.sign(dy)); }
  }, { passive: false });
  addEventListener('touchend', e => {
    if (T.done) return;
    T.done = true;
    const dy = T.y - e.changedTouches[0].clientY, dt = performance.now() - T.t;
    if (Math.abs(dy) >= 12 && Math.abs(dy) / dt > 0.2) show(cur + Math.sign(dy)); // quick flick
  });

  // ---- keyboard ----
  addEventListener('keydown', e => {
    if (panelOpen() || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    let n = null;
    if (k === 'ArrowDown' || k === 'PageDown' || (k === ' ' && !e.shiftKey)) n = cur + 1;
    else if (k === 'ArrowUp' || k === 'PageUp' || (k === ' ' && e.shiftKey)) n = cur - 1;
    else if (k === 'Home') n = 0;
    else if (k === 'End') n = scenes.length - 1;
    if (n === null) return;
    e.preventDefault();
    show(n);
  });

  // contact scene: "Back to top" and "Copy email"
  document.querySelectorAll('[data-top]').forEach(b => b.addEventListener('click', () => show(0)));
  document.querySelectorAll('[data-copy-email]').forEach(btn => btn.addEventListener('click', () => {
    const email = 'alveriacher@gmail.com';
    const done = () => { btn.textContent = 'Copied ✓'; setTimeout(() => { btn.textContent = 'Copy email'; }, 2500); };
    try { navigator.clipboard.writeText(email).then(done, () => { btn.textContent = email; }); } catch (e) { btn.textContent = email; }
  }));

  sync();
  requestAnimationFrame(() => requestAnimationFrame(() => onScreen(cur).forEach(i => scenes[i].classList.add('is-active'))));
})();
