// Unlocks a password-protected case study in the browser.
// No password is stored anywhere — the page only holds AES-GCM ciphertext.
// One password unlocks every case study; the derived key is kept for this tab session.
(() => {
  const KEY_STORE = 'ac-portfolio-key';
  const ITERATIONS = 310000;
  const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const toB64 = buf => { let s = ''; new Uint8Array(buf).forEach(b => { s += String.fromCharCode(b); }); return btoa(s); };

  const payload = JSON.parse(document.getElementById('payload').textContent);
  const lock = document.getElementById('lock');
  const form = document.getElementById('lock-form');
  const input = document.getElementById('lock-input');
  const button = form.querySelector('button');
  const error = document.getElementById('lock-error');
  const content = document.getElementById('content');

  async function deriveKey(password) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: b64(payload.salt), iterations: ITERATIONS, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, true, ['decrypt']
    );
  }
  async function openManifest(key) {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(payload.iv) }, key, b64(payload.data));
    return JSON.parse(new TextDecoder().decode(plain));
  }
  function reveal(manifest, key) {
    content.hidden = false;
    lock.remove();
    document.body.classList.add('is-unlocked');
    window.scrollTo(0, 0);
    window.initDeck(content, manifest, key);
  }
  async function trySaved() {
    let raw; try { raw = sessionStorage.getItem(KEY_STORE); } catch (e) {}
    if (!raw) return false;
    try {
      const key = await crypto.subtle.importKey('raw', b64(raw), 'AES-GCM', false, ['decrypt']);
      reveal(await openManifest(key), key); return true;
    } catch (e) { try { sessionStorage.removeItem(KEY_STORE); } catch (_) {} return false; }
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const pw = input.value.trim();
    if (!pw) return;
    button.disabled = true; error.textContent = '';
    try {
      const key = await deriveKey(pw);
      const manifest = await openManifest(key);
      try { sessionStorage.setItem(KEY_STORE, toB64(await crypto.subtle.exportKey('raw', key))); } catch (e) {}
      reveal(manifest, key);
    } catch (e) {
      error.textContent = 'That password isn’t right. Please try again.';
      lock.classList.remove('shake'); void lock.offsetWidth; lock.classList.add('shake');
      input.select();
    } finally { button.disabled = false; }
  });

  trySaved().then(ok => { if (!ok) { lock.hidden = false; input.focus(); } });
})();
