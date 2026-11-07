// Hello screen, desktop only: moving the mouse stirs an invisible fluid over the page (option A, RGB fluid):
// the name bends gently (staying black), a soft, wide pastel bloom follows
// the cursor, then everything settles back to clean black on white. The name keeps its normal
// HTML entrance; once it has risen in, a WebGL copy drawn from the exact same letter positions
// takes over, and the HTML comes straight back the moment the screen changes.
// Phones/tablets, reduced motion, no WebGL2 or no float render targets: the plain HTML name stays.
(() => {
  const scene = document.querySelector('.hero__scene[data-scene="hello"]');
  const name = scene && scene.querySelector('.hero__name');
  if (!name) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;   // mouse-driven, so desktop only

  const canvas = document.createElement('canvas');
  canvas.className = 'hello-fx';
  canvas.setAttribute('aria-hidden', 'true');
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: false });
  if (!gl) return;
  if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) return;
  gl.getExtension('OES_texture_float_linear');
  scene.prepend(canvas);

  const mouseFluid = matchMedia('(hover: hover) and (pointer: fine)').matches;

  // ---------- shaders ----------
  const VS = `#version 300 es
    in vec2 p; out vec2 uv; out vec2 L; out vec2 R; out vec2 T; out vec2 B; uniform vec2 px;
    void main(){ uv = p*.5+.5; L = uv-vec2(px.x,0.); R = uv+vec2(px.x,0.); T = uv+vec2(0.,px.y); B = uv-vec2(0.,px.y); gl_Position = vec4(p,0.,1.); }`;
  const H = `#version 300 es
    precision highp float; in vec2 uv; in vec2 L; in vec2 R; in vec2 T; in vec2 B; out vec4 o;`;
  const SRC = {
    splat: H + `uniform sampler2D t; uniform vec2 pt; uniform vec3 c; uniform float r; uniform float aspect;
      void main(){ vec2 d = uv-pt; d.x *= aspect; float s = exp(-dot(d,d)/r); o = vec4(texture(t,uv).rgb + c*s, 1.); }`,
    advect: H + `uniform sampler2D v; uniform sampler2D s; uniform vec2 vpx; uniform float dt; uniform float diss;
      void main(){ vec2 co = uv - dt*texture(v,uv).xy*vpx; o = vec4(texture(s,co).rgb/(1.+diss*dt), 1.); }`,
    div: H + `uniform sampler2D v;
      void main(){ float l=texture(v,L).x, r=texture(v,R).x, t=texture(v,T).y, b=texture(v,B).y; vec2 c=texture(v,uv).xy;
        if(L.x<0.) l=-c.x; if(R.x>1.) r=-c.x; if(T.y>1.) t=-c.y; if(B.y<0.) b=-c.y; o=vec4(.5*(r-l+t-b),0.,0.,1.); }`,
    pres: H + `uniform sampler2D pr; uniform sampler2D dv;
      void main(){ float l=texture(pr,L).x, r=texture(pr,R).x, t=texture(pr,T).x, b=texture(pr,B).x;
        o=vec4((l+r+b+t-texture(dv,uv).x)*.25,0.,0.,1.); }`,
    grad: H + `uniform sampler2D pr; uniform sampler2D v;
      void main(){ float l=texture(pr,L).x, r=texture(pr,R).x, t=texture(pr,T).x, b=texture(pr,B).x;
        o=vec4(texture(v,uv).xy - vec2(r-l,t-b), 0., 1.); }`,
    clear: H + `uniform sampler2D t; uniform float k; void main(){ o = k*texture(t,uv); }`,
    // exactly option A (RGB fluid): the name bends and splits into red, green and blue at the edges,
    // with a soft pastel bloom where the mouse moves; everything settles back to black on white
    show: H + `uniform sampler2D txt; uniform sampler2D v; uniform sampler2D dye; uniform float amt;
      void main(){
        vec2 vel = texture(v,uv).xy * amt;
        vec2 q = vec2(uv.x, 1.-uv.y);
        vec2 off = vec2(vel.x, -vel.y);
        vec3 col = vec3(texture(txt, q - off).r);        // one sample: the letters bend but stay black, no colour edges
        vec3 d = texture(dye,uv).rgb;
        float a = clamp(max(d.r,max(d.g,d.b)), 0., 1.);
        vec3 pastel = .78 + .22*normalize(d+1e-4);
        col = mix(col, mix(col, vec3(.93), .55) * pastel, a*.85);
        col += d*.08;
        o = vec4(col,1.);
      }`
  };
  const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
  const P = {};
  try {
    const vs = sh(gl.VERTEX_SHADER, VS);
    for (const k in SRC) {
      const p = gl.createProgram(); gl.attachShader(p, vs); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, SRC[k])); gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const u = {}; for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i++) { const a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); }
      P[k] = { p, u };
    }
  } catch (e) { canvas.remove(); return; }
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const target = (w, h) => {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER].forEach(f => gl.texParameteri(gl.TEXTURE_2D, f, gl.LINEAR));
    [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach(f => gl.texParameteri(gl.TEXTURE_2D, f, gl.CLAMP_TO_EDGE));
    const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    return { t, f, w, h };
  };
  const pair = (w, h) => { const a = target(w, h), b = target(w, h); return { r: a, w: b, swap() { const x = this.r; this.r = this.w; this.w = x; } }; };
  const free = o => { if (!o) return; [o.r, o.w, o].forEach(x => { if (x && x.t) { gl.deleteTexture(x.t); gl.deleteFramebuffer(x.f); } }); };

  let W = 0, Hh = 0, simW, simH, dyeW, dyeH, vel, dye, prs, dvg, txtTex = gl.createTexture();
  const tc = document.createElement('canvas'), tx = tc.getContext('2d');

  // the name as a texture, letter by letter at the exact positions the browser laid them out
  function drawText() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    tc.width = Math.round(W * dpr); tc.height = Math.round(Hh * dpr);
    tx.setTransform(dpr, 0, 0, dpr, 0, 0);
    tx.fillStyle = '#fff'; tx.fillRect(0, 0, W, Hh);
    tx.fillStyle = '#000'; tx.textBaseline = 'alphabetic';
    const cs = getComputedStyle(name);
    tx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const ascent = tx.measureText('H').fontBoundingBoxAscent || parseFloat(cs.fontSize) * 0.81;
    const box = canvas.getBoundingClientRect();
    const range = document.createRange();
    name.querySelectorAll('span').forEach(line => {
      const node = line.firstChild;
      if (!node || node.nodeType !== 3) return;
      const text = node.textContent;
      for (let i = 0; i < text.length; i++) {
        if (text[i] === ' ') continue;
        range.setStart(node, i); range.setEnd(node, i + 1);
        const r = range.getBoundingClientRect();
        tx.fillText(text[i].toUpperCase(), r.left - box.left, r.top - box.top + ascent);
      }
    });
    gl.bindTexture(gl.TEXTURE_2D, txtTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tc);
    [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER].forEach(f => gl.texParameteri(gl.TEXTURE_2D, f, gl.LINEAR));
    [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach(f => gl.texParameteri(gl.TEXTURE_2D, f, gl.CLAMP_TO_EDGE));
  }
  function size() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = canvas.clientWidth; Hh = canvas.clientHeight;
    if (!W || !Hh) return false;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(Hh * dpr);
    free(vel); free(dye); free(prs); free(dvg);
    simW = 160; simH = Math.max(32, Math.round(160 * Hh / W)); dyeW = 512; dyeH = Math.max(64, Math.round(512 * Hh / W));
    vel = pair(simW, simH); dye = pair(dyeW, dyeH); prs = pair(simW, simH); dvg = target(simW, simH);
    drawText();
    return true;
  }

  const run = (prog, dst, set) => {
    gl.useProgram(prog.p); gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.f : null);
    gl.viewport(0, 0, dst ? dst.w : canvas.width, dst ? dst.h : canvas.height);
    let unit = 0;
    set((n, t) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(prog.u[n], unit++); }, prog.u);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  let hue = Math.random(), pointer = null, last = null, raf = 0, t0 = 0, running = false;
  const hsl = h => { const f = n => { const k = (n + h * 12) % 12; return .5 - .5 * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return [f(0), f(8), f(4)]; };
  function splat(x, y, dx, dy) {
    run(P.splat, vel.w, (tex, u) => { gl.uniform2f(u.px, 1 / simW, 1 / simH); tex('t', vel.r.t); gl.uniform2f(u.pt, x, y); gl.uniform3f(u.c, dx, dy, 0); gl.uniform1f(u.r, .0025); gl.uniform1f(u.aspect, W / Hh); }); vel.swap();
    hue = (hue + .004) % 1; const c = hsl(hue).map(v => v * .26);
    run(P.splat, dye.w, (tex, u) => { gl.uniform2f(u.px, 1 / dyeW, 1 / dyeH); tex('t', dye.r.t); gl.uniform2f(u.pt, x, y); gl.uniform3f(u.c, ...c); gl.uniform1f(u.r, .007); gl.uniform1f(u.aspect, W / Hh); }); dye.swap();   // wider, softer bloom
  }
  function step() {
    const dt = 1 / 60, vpx = [1 / simW, 1 / simH];
    run(P.advect, vel.w, (tex, u) => { gl.uniform2f(u.px, ...vpx); tex('v', vel.r.t); tex('s', vel.r.t); gl.uniform2f(u.vpx, ...vpx); gl.uniform1f(u.dt, dt); gl.uniform1f(u.diss, 2.4); }); vel.swap();   // the bend settles quickly too
    run(P.div, dvg, (tex, u) => { gl.uniform2f(u.px, ...vpx); tex('v', vel.r.t); });
    run(P.clear, prs.w, (tex, u) => { gl.uniform2f(u.px, ...vpx); tex('t', prs.r.t); gl.uniform1f(u.k, .8); }); prs.swap();
    for (let i = 0; i < 20; i++) { run(P.pres, prs.w, (tex, u) => { gl.uniform2f(u.px, ...vpx); tex('pr', prs.r.t); tex('dv', dvg.t); }); prs.swap(); }
    run(P.grad, vel.w, (tex, u) => { gl.uniform2f(u.px, ...vpx); tex('pr', prs.r.t); tex('v', vel.r.t); }); vel.swap();
    run(P.advect, dye.w, (tex, u) => { gl.uniform2f(u.px, 1 / dyeW, 1 / dyeH); tex('v', vel.r.t); tex('s', dye.r.t); gl.uniform2f(u.vpx, ...vpx); gl.uniform1f(u.dt, dt); gl.uniform1f(u.diss, 2.2); }); dye.swap();   // the glow fades away quickly once the mouse stops
    run(P.show, null, (tex, u) => { gl.uniform2f(u.px, 0, 0); tex('txt', txtTex); tex('v', vel.r.t); tex('dye', dye.r.t);
      gl.uniform1f(u.amt, .00018); });   // gentle bend on the letters
  }
  function frame() {
    raf = requestAnimationFrame(frame);
    if (pointer && last) {
      const dx = pointer[0] - last[0], dy = pointer[1] - last[1];
      if (dx || dy) splat(pointer[0] / W, 1 - pointer[1] / Hh, dx * 2.6, -dy * 2.6);   // a strong stir so the glow spreads out widely
    }
    last = pointer;
    step();
  }

  // ---------- hand-over between the HTML name and the effect ----------
  let startTimer = 0;
  function start() {
    if (running || document.body.dataset.scene !== 'hello') return;
    if (!size()) return;
    t0 = performance.now(); last = null;
    running = true;
    frame();
    scene.classList.add('fx-on');
  }
  function stop() {
    clearTimeout(startTimer);
    if (!running) return;
    running = false; cancelAnimationFrame(raf);
    scene.classList.remove('fx-on');      // the HTML name is back instantly, ready for its exit animation
  }
  function update() {
    if (document.body.dataset.scene === 'hello') {
      clearTimeout(startTimer);
      startTimer = setTimeout(start, 1100);  // after the lines have risen in
    } else stop();
  }

  if (mouseFluid) {
    addEventListener('pointermove', e => { if (running && e.pointerType === 'mouse') pointer = [e.clientX, e.clientY]; }, { passive: true });
    document.addEventListener('pointerleave', () => { pointer = null; last = null; });
    addEventListener('blur', () => { pointer = null; last = null; });
  }
  addEventListener('resize', () => { if (running) { stop(); update(); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else update(); });
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); stop(); canvas.remove(); });
  new MutationObserver(update).observe(document.body, { attributes: true, attributeFilter: ['data-scene'] });
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(update);
})();
