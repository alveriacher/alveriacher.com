// Homepage: three "scenes" (Hello → About → Skills) in one fixed screen.
// The nav, text and footer never move. The page still scrolls natively (so
// trackpads, mouse wheels and touch feel normal), but the scroll position is
// only used as input: each scroll gesture, up or down, swaps the text by one
// scene with a line-by-line rise + fade.
(() => {
  const scenes = [...document.querySelectorAll('.hero__scene')];
  const hero = document.querySelector('.hero');
  if (!scenes.length || !hero) return;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const OUT_MS = reduce ? 0 : 300;     // old text fades out, then the new text rises in
  const TRIGGER_PX = 60;               // this much scrolling in one direction swaps the text
  const QUIET_MS = 160;                // no scroll for this long = the gesture has ended
  const MIN_LOCK_MS = reduce ? 100 : 650;

  // a tall invisible track to scroll over; we start in its middle so there is
  // always room to scroll both ways, and quietly re-centre when near an end
  const track = document.createElement('div');
  track.className = 'scroll-track';
  track.setAttribute('aria-hidden', 'true');
  hero.after(track);
  // instant jump (the site sets scroll-behavior: smooth, which must not apply here)
  const jump = y => scrollTo({ top: y, left: 0, behavior: 'instant' });
  const mid = () => Math.round((track.offsetHeight - innerHeight) / 2);
  const nearEdge = () => scrollY < innerHeight * 4 || scrollY > track.offsetHeight - innerHeight * 5;

  scenes.forEach(s => s.querySelectorAll('.scene-line').forEach((el, i) => el.style.setProperty('--i', i)));
  document.body.classList.add('scenes-ready');
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  let cur = Math.max(0, scenes.findIndex(s => s.dataset.scene === location.hash.slice(1)));
  let swapTimer = 0, quietTimer = 0, locked = false, unlockAt = 0;
  let anchor = null; // scroll position the next gesture is measured from (null = take the next reading)

  const bgs = [...document.querySelectorAll('.hero__bg')];
  const setHidden = () => {
    scenes.forEach((s, i) => {
      const off = i !== cur; // only the top scene is interactive
      s.setAttribute('aria-hidden', off);
      s.inert = off;
    });
    // background, nav + footer colour follow the scene straight away (the text follows after its fade-out)
    const s = scenes[onScreen(cur)[0]]; // an overlay takes the look of the scene below it
    document.body.dataset.scene = scenes[cur].dataset.scene;
    document.body.classList.toggle('is-dark', s.dataset.theme === 'dark');
    bgs.forEach(b => b.classList.toggle('is-shown', b.dataset.for === s.dataset.scene));
  };

  // scenes that are on screen for scene i (an overlay scene keeps the one it sits over)
  const byName = name => scenes.findIndex(s => s.dataset.scene === name);
  const onScreen = i => { const o = scenes[i].dataset.over; return o ? [byName(o), i] : [i]; };

  function show(n) {
    if (n < 0 || n >= scenes.length || n === cur) return false;
    const before = onScreen(cur), after = onScreen(n);
    const leaving = before.filter(i => !after.includes(i));
    const entering = after.filter(i => !before.includes(i));
    clearTimeout(swapTimer);
    scenes.forEach((s, i) => { if (!before.includes(i)) s.classList.remove('is-leaving', 'is-active'); });
    leaving.forEach(i => { scenes[i].classList.remove('is-active'); scenes[i].classList.add('is-leaving'); });
    cur = n;
    setHidden();
    swapTimer = setTimeout(() => {
      scenes.forEach((s, i) => { s.classList.remove('is-leaving'); s.classList.toggle('is-active', after.includes(i)); });
    }, leaving.length ? OUT_MS : 0);
    return true;
  }

  function onQuiet() {
    const wait = unlockAt - performance.now();
    if (wait > 0) { quietTimer = setTimeout(onQuiet, wait); return; }
    if (nearEdge()) { jump(mid()); anchor = null; } // instant and invisible: nothing on screen scrolls
    else anchor = scrollY;
    locked = false;
  }

  addEventListener('scroll', () => {
    clearTimeout(quietTimer);
    quietTimer = setTimeout(onQuiet, QUIET_MS);
    if (locked) return;                 // rest of the gesture (momentum included) is absorbed
    if (anchor === null) { anchor = scrollY; return; }
    const d = scrollY - anchor;
    if (Math.abs(d) < TRIGGER_PX) return;
    if (show(cur + (d > 0 ? 1 : -1))) { locked = true; unlockAt = performance.now() + MIN_LOCK_MS; }
    else anchor = scrollY;              // already at the first/last scene
  }, { passive: true });

  addEventListener('resize', () => { if (!locked) { jump(mid()); anchor = null; } });

  // keyboard: one scene per key press
  const contactOpen = () => { const c = document.querySelector('.contact'); return c && !c.hidden; };
  addEventListener('keydown', e => {
    if (contactOpen() || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    let n = null;
    if (k === 'ArrowDown' || k === 'PageDown' || (k === ' ' && !e.shiftKey)) n = cur + 1;
    else if (k === 'ArrowUp' || k === 'PageUp' || (k === ' ' && e.shiftKey)) n = cur - 1;
    else if (k === 'Home') n = 0;
    else if (k === 'End') n = scenes.length - 1;
    if (n === null) return;
    e.preventDefault();
    show(Math.max(0, Math.min(scenes.length - 1, n)));
  });

  jump(mid());
  requestAnimationFrame(() => { if (Math.abs(scrollY - mid()) > 2) jump(mid()); anchor = null; });
  setHidden();
  requestAnimationFrame(() => requestAnimationFrame(() => onScreen(cur).forEach(i => scenes[i].classList.add('is-active'))));

  // leaving the homepage: reset the scroll so the next page (and a later visit) starts at the top
  const toTop = () => { locked = true; clearTimeout(quietTimer); jump(0); };
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (!a || a.hasAttribute('data-contact') || a.target === '_blank' || e.defaultPrevented) return;
    if (a.origin === location.origin && !a.href.startsWith('mailto:')) toTop();
  }, true);
  addEventListener('pagehide', toTop);
  addEventListener('pageshow', e => { if (e.persisted) { jump(mid()); anchor = null; locked = false; } });

  // contact scene: "Back to top" and "Copy email"
  document.querySelectorAll('[data-top]').forEach(b => b.addEventListener('click', () => {
    show(0);
    anchor = null;
  }));
  document.querySelectorAll('[data-copy-email]').forEach(btn => btn.addEventListener('click', () => {
    const email = 'alveriacher@gmail.com';
    const done = () => { btn.textContent = 'Copied ✓'; setTimeout(() => { btn.textContent = 'Copy email'; }, 2500); };
    try { navigator.clipboard.writeText(email).then(done, () => { btn.textContent = email; }); } catch (e) { btn.textContent = email; }
  }));
})();
