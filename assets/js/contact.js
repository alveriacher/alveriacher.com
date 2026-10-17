// Contact panel: shows the email with copy + open-mail actions.
(() => {
  const EMAIL = 'alveriacher@gmail.com';
  const panel = document.createElement('div');
  panel.className = 'contact';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="contact__scrim" data-close></div>
    <div class="contact__box" role="dialog" aria-modal="true" aria-labelledby="contact-title">
      <button class="contact__close" type="button" data-close aria-label="Close">Close ✕</button>
      <p class="contact__eyebrow">Contact</p>
      <h2 class="contact__title" id="contact-title">Let’s work<br>together</h2>
      <p class="contact__email" id="contact-email">${EMAIL}</p>
      <div class="contact__actions">
        <button class="contact__btn" type="button" id="contact-copy">Copy email</button>
        <a class="contact__btn contact__btn--ghost" href="mailto:${EMAIL}" target="_blank" rel="noopener">Open email app</a>
      </div>
    </div>`;
  document.body.appendChild(panel);

  const copyBtn = panel.querySelector('#contact-copy');
  let lastFocus = null;
  const open = (e) => {
    e && e.preventDefault();
    lastFocus = document.activeElement;
    panel.hidden = false;
    requestAnimationFrame(() => panel.classList.add('is-open'));
    copyBtn.focus();
  };
  const close = () => {
    panel.classList.remove('is-open');
    setTimeout(() => { panel.hidden = true; }, 250);
    copyBtn.textContent = 'Copy email';
    lastFocus && lastFocus.focus();
  };

  document.querySelectorAll('[data-contact]').forEach(a => a.addEventListener('click', open));
  panel.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', close));
  addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) close(); });

  copyBtn.addEventListener('click', () => {
    const done = () => { copyBtn.textContent = 'Copied ✓'; };
    const fallback = () => {
      const r = document.createRange();
      r.selectNodeContents(panel.querySelector('#contact-email'));
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      copyBtn.textContent = 'Press ⌘C to copy';
    };
    try { navigator.clipboard.writeText(EMAIL).then(done, fallback); } catch (e) { fallback(); }
  });
})();
