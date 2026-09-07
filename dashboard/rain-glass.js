// Original wet-glass background. Call setWeather with the current OpenWeather code.
// Load after #sky exists. No network requests or changes to calendar data.
(() => {
  const sky = document.getElementById('sky');
  if (!sky) return;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'absolute', inset: '0', width: '100%', height: '100%',
    pointerEvents: 'none', zIndex: '0', opacity: '0.65',
  });
  sky.prepend(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) { canvas.remove(); return; }
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let mode = 'auto', wet = false, frame = 0, last = 0, width = 0, height = 0;
  let drops = [];
  try { mode = localStorage.getItem('rain-glass-mode') || 'auto'; } catch {}
  const enabled = () => mode === 'preview' || (mode === 'auto' && wet);
  const makeDrop = (anywhere = true) => ({
    x: Math.random() * width, y: anywhere ? Math.random() * height : -20,
    r: 1 + Math.random() ** 3 * 7, speed: 4 + Math.random() * 15,
  });
  const paint = (dt = 0) => {
    ctx.clearRect(0, 0, width, height);
    if (!enabled()) return;
    const mist = ctx.createLinearGradient(0, 0, width, height);
    mist.addColorStop(0, 'rgba(190,215,230,.16)');
    mist.addColorStop(.5, 'rgba(190,215,230,.02)');
    mist.addColorStop(1, 'rgba(190,215,230,.2)');
    ctx.fillStyle = mist; ctx.fillRect(0, 0, width, height);
    for (const d of drops) {
      if (d.r > 5) d.y += d.speed * dt;
      if (d.y > height + 20) Object.assign(d, makeDrop(false));
      const g = ctx.createRadialGradient(d.x - d.r * .3, d.y - d.r * .4, 0, d.x, d.y, d.r);
      g.addColorStop(0, 'rgba(255,255,255,.7)');
      g.addColorStop(.3, 'rgba(220,240,250,.12)');
      g.addColorStop(.8, 'rgba(15,40,60,.16)');
      g.addColorStop(1, 'rgba(255,255,255,.38)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r, d.r * 1.18, 0, 0, Math.PI * 2); ctx.fill();
    }
  };
  const tick = (now) => {
    frame = 0;
    if (now - last >= 33) {
      paint(last ? Math.min((now - last) / 1000, .1) : 0); last = now;
    }
    if (enabled() && !reduced.matches && !document.hidden) frame = requestAnimationFrame(tick);
  };
  const sync = () => {
    cancelAnimationFrame(frame); frame = 0; last = 0;
    canvas.hidden = !enabled(); paint();
    if (enabled() && !reduced.matches && !document.hidden) frame = requestAnimationFrame(tick);
  };
  const resize = () => {
    width = sky.clientWidth; height = sky.clientHeight;
    const scale = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    drops = Array.from({ length: Math.min(850, Math.round(width * height / 1600)) }, () => makeDrop());
    sync();
  };
  window.RainGlass = {
    setWeather(code) { wet = Number.isFinite(code) && code >= 200 && code < 600; sync(); },
    setMode(value) {
      if (!['auto', 'off', 'preview'].includes(value)) return;
      mode = value;
      // Preview is temporary; do not make simulated rain persistent.
      try { localStorage.setItem('rain-glass-mode', value === 'preview' ? 'auto' : value); } catch {}
      sync();
    },
  };
  reduced.addEventListener('change', sync);
  document.addEventListener('visibilitychange', sync);
  new ResizeObserver(resize).observe(sky);
  resize();
})();
