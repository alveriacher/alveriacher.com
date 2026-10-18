// About screen: water-ripple effect on the background photo, following the mouse.
// A small WebGL water simulation (height + velocity) runs at low resolution and
// bends the photo where the ripples are. Desktop (mouse) only; it switches off
// for touch screens, reduced motion, or browsers without the needed WebGL support,
// and the plain photo shows instead.
(() => {
  const canvas = document.querySelector('.hero__ripple');
  const pic = document.querySelector('.hero__bg[data-for="about"] img');
  if (!canvas || !pic) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // desktop only: a real mouse/trackpad and a desktop-width screen (phones and tablets get the plain photo)
  if (!matchMedia('(hover: hover) and (pointer: fine) and (min-width: 821px)').matches) return;

  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: false });
  if (!gl) return;
  const floatOK = gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float');
  if (!floatOK) return;
  gl.getExtension('OES_texture_float_linear');

  // ---- settings ----
  const SIM_W = 320;            // simulation width (height follows the screen's shape)
  const DROP_RADIUS = 22;       // px on screen
  const DROP_STRENGTH = 0.013;
  const DAMPING = 0.968;        // lower = ripples die out faster (0.968 ≈ gone in under a second)
  const PERTURB = 0.021;        // how much the ripples bend the photo

  // ---- shaders ----
  const VS = `#version 300 es
    in vec2 p; out vec2 uv;
    void main(){ uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;
  const STEP = `#version 300 es
    precision highp float; in vec2 uv; out vec4 o;
    uniform sampler2D s; uniform vec2 d; uniform float damp;
    void main(){
      vec4 i = texture(s, uv);
      float avg = (texture(s, uv - vec2(d.x, 0.)).r + texture(s, uv + vec2(d.x, 0.)).r +
                   texture(s, uv - vec2(0., d.y)).r + texture(s, uv + vec2(0., d.y)).r) * 0.25;
      i.g += (avg - i.r) * 2.0;
      i.g *= damp;
      i.r += i.g;
      o = i;
    }`;
  const DROP = `#version 300 es
    precision highp float; in vec2 uv; out vec4 o;
    uniform sampler2D s; uniform vec2 c; uniform float r; uniform float k; uniform float aspect;
    void main(){
      vec4 i = texture(s, uv);
      vec2 v = (uv - c) * vec2(aspect, 1.0);
      float drop = max(0.0, 1.0 - length(v) / r);
      drop = 0.5 - cos(drop * 3.14159265) * 0.5;
      i.r += drop * k;
      o = i;
    }`;
  const DRAW = `#version 300 es
    precision highp float; in vec2 uv; out vec4 o;
    uniform sampler2D s; uniform sampler2D img; uniform vec2 d; uniform vec4 cover; uniform float perturb;
    void main(){
      float h = texture(s, uv).r;
      vec3 ex = vec3(d.x, texture(s, uv + vec2(d.x, 0.)).r - h, 0.0);
      vec3 ey = vec3(0.0, texture(s, uv + vec2(0., d.y)).r - h, d.y);
      vec3 n = normalize(cross(ey, ex));                    // surface normal of the water
      vec2 off = -n.xz;
      vec2 q = vec2(uv.x, 1.0 - uv.y);                      // screen → image coordinates
      vec2 t = cover.xy + q * cover.zw + vec2(off.x, -off.y) * perturb; // object-fit: cover, then bend
      vec3 col = texture(img, clamp(t, 0.001, 0.999)).rgb;
      // a faint highlight on the ripple slopes
      float spec = pow(max(0.0, dot(n, normalize(vec3(-0.6, 1.0, 0.6)))), 80.0);
      o = vec4(col + spec * 0.18, 1.0);
    }`;

  const compile = (type, src) => { const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
  const program = fs => { const pr = gl.createProgram();
    gl.attachShader(pr, compile(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, compile(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(pr, 0, 'p'); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    const u = {}; const n = gl.getProgramParameter(pr, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(pr, i); u[a.name] = gl.getUniformLocation(pr, a.name); }
    return { pr, u }; };

  let P;
  try { P = { step: program(STEP), drop: program(DROP), draw: program(DRAW) }; } catch (e) { return; }

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // ---- simulation textures (ping-pong) ----
  let simW = SIM_W, simH = 200, tex = [], fbo = [], src = 0;
  function makeSim() {
    tex.forEach(t => gl.deleteTexture(t)); fbo.forEach(f => gl.deleteFramebuffer(f));
    tex = []; fbo = [];
    simH = Math.max(64, Math.round(SIM_W * innerHeight / innerWidth));
    for (let i = 0; i < 2; i++) {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, simW, simH, 0, gl.RGBA, gl.HALF_FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      tex.push(t); fbo.push(f);
    }
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('fbo');
  }

  // ---- photo texture ----
  const imgTex = gl.createTexture();
  let imgW = 0, imgH = 0, imgSrc = '';
  function loadPhoto() {
    const url = pic.currentSrc || pic.src;
    if (!url || url === imgSrc || !pic.complete || !pic.naturalWidth) return false;
    imgSrc = url; imgW = pic.naturalWidth; imgH = pic.naturalHeight;
    gl.bindTexture(gl.TEXTURE_2D, imgTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, pic); } catch (e) { return false; }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return true;
  }

  // ---- sizing ----
  let W = 0, H = 0;
  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    makeSim();
  }
  const coverRect = () => {           // object-fit: cover, centred
    const s = Math.max(W / imgW, H / imgH), dw = imgW * s, dh = imgH * s;
    const ox = (W - dw) / 2, oy = (H - dh) / 2;
    return [-ox / dw, -oy / dh, W / dw, H / dh];
  };

  // ---- passes ----
  const pass = (prog, setup) => {
    const dst = 1 - src;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[dst]);
    gl.viewport(0, 0, simW, simH);
    gl.useProgram(prog.pr);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex[src]);
    gl.uniform1i(prog.u.s, 0);
    setup(prog.u);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    src = dst;
  };
  const drops = [];
  function drop(x, y, k) { drops.push([x / W, 1 - y / H, k]); }

  function frame() {
    for (const [x, y, k] of drops.splice(0)) pass(P.drop, u => {
      gl.uniform2f(u.c, x, y); gl.uniform1f(u.r, DROP_RADIUS / H); gl.uniform1f(u.k, k); gl.uniform1f(u.aspect, W / H);
    });
    for (let i = 0; i < 2; i++) pass(P.step, u => { gl.uniform2f(u.d, 1 / simW, 1 / simH); gl.uniform1f(u.damp, DAMPING); });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(P.draw.pr);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex[src]);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, imgTex);
    gl.uniform1i(P.draw.u.s, 0); gl.uniform1i(P.draw.u.img, 1);
    gl.uniform2f(P.draw.u.d, 1 / simW, 1 / simH);
    gl.uniform4f(P.draw.u.cover, ...coverRect());
    gl.uniform1f(P.draw.u.perturb, PERTURB);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // ---- run only while About is on screen ----
  let running = false, raf = 0, last = null;
  const loop = () => { frame(); raf = requestAnimationFrame(loop); };
  function update() {
    const on = document.body.dataset.scene === 'about';
    if (on && !running) {
      if (!imgW && !loadPhoto()) { pic.addEventListener('load', update, { once: true }); return; }
      loadPhoto();
      running = true; canvas.classList.add('is-ready'); loop();
    } else if (!on && running) {
      running = false; cancelAnimationFrame(raf); last = null;
      setTimeout(() => { if (!running) canvas.classList.remove('is-ready'); }, 500);
    }
  }

  addEventListener('pointermove', e => {
    if (!running || e.pointerType !== 'mouse') return;
    const x = e.clientX, y = e.clientY;
    // fast mouse movement makes gentler drops, so the whole screen doesn't wobble
    let k = DROP_STRENGTH;
    if (last) {
      const dx = x - last[0], dy = y - last[1], dist = Math.hypot(dx, dy);
      k = DROP_STRENGTH * Math.min(1, 30 / Math.max(dist, 1));
      const n = Math.min(2, Math.floor(dist / (DROP_RADIUS * 1.5)));
      for (let i = 1; i <= n; i++) drop(last[0] + dx * i / (n + 1), last[1] + dy * i / (n + 1), k);
    }
    if (drops.length < 12) drop(x, y, k);
    last = [x, y];
  }, { passive: true });
  addEventListener('pointerdown', e => { if (running && e.pointerType === 'mouse') drop(e.clientX, e.clientY, DROP_STRENGTH * 4); });

  try { resize(); } catch (e) { return; }
  addEventListener('resize', () => { try { resize(); } catch (e) {} });
  new MutationObserver(update).observe(document.body, { attributes: true, attributeFilter: ['data-scene'] });
  update();
})();
