/* ══════════════════════════════════════════════════════════════
   celebrate.js — fireworks + card cascade on win
   Canvas sits at z-index 500 (above game, below overlay at 1000)
   ══════════════════════════════════════════════════════════════ */

let celebCanvas = null;
let celebCtx    = null;
let celebRaf    = null;
let celebInterval = null;

let rockets    = [];
let particles  = [];
let cascadeCards = [];

const GRAVITY = 0.38;

/* ─── Public API ─────────────────────────────────────────────── */
function startCelebration(foundations) {
  stopCelebration();

  celebCanvas = document.createElement('canvas');
  celebCanvas.style.cssText =
    'position:fixed;inset:0;width:100vw;height:100vh;z-index:500;pointer-events:none;';
  document.body.appendChild(celebCanvas);
  resizeCelebCanvas();
  window.addEventListener('resize', resizeCelebCanvas);

  celebCtx = celebCanvas.getContext('2d');

  const cw = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--card-w')) || 84;
  const ch = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--card-h')) || 116;

  // Queue all 52 cards to launch from their foundation pile positions
  let delay = 0;
  document.querySelectorAll('.foundation').forEach((el, fi) => {
    const rect = el.getBoundingClientRect();
    const pile = foundations[fi];
    // Launch top card first (King → Ace)
    for (let i = pile.length - 1; i >= 0; i--) {
      const card = pile[i];
      const d = delay;
      setTimeout(() => {
        if (!celebCanvas) return;
        cascadeCards.push({
          x: rect.left, y: rect.top,
          vx: (Math.random() - 0.5) * 10,
          vy: -(9 + Math.random() * 9),
          rotation: (Math.random() - 0.5) * 0.5,
          rotSpeed: (Math.random() - 0.5) * 0.12,
          rank: card.rank,
          suit: card.suit,
          isRed: card.suit === '♥' || card.suit === '♦',
          w: cw, h: ch,
        });
      }, d);
      delay += 18;
    }
  });

  // Fireworks
  for (let i = 0; i < 4; i++) setTimeout(launchRocket, i * 250);
  celebInterval = setInterval(launchRocket, 750);

  celebRaf = requestAnimationFrame(celebLoop);
}

function stopCelebration() {
  if (celebRaf)      { cancelAnimationFrame(celebRaf); celebRaf = null; }
  if (celebInterval) { clearInterval(celebInterval);   celebInterval = null; }
  if (celebCanvas)   { celebCanvas.remove(); celebCanvas = null; }
  window.removeEventListener('resize', resizeCelebCanvas);
  rockets = []; particles = []; cascadeCards = [];
}

/* ─── Internals ──────────────────────────────────────────────── */
function resizeCelebCanvas() {
  if (!celebCanvas) return;
  celebCanvas.width  = window.innerWidth;
  celebCanvas.height = window.innerHeight;
}

function launchRocket() {
  if (!celebCanvas) return;
  const w = celebCanvas.width, h = celebCanvas.height;
  const tx = 0.1 * w + Math.random() * 0.8 * w;
  const ty = 0.06 * h + Math.random() * 0.42 * h;
  const sx = 0.1 * w + Math.random() * 0.8 * w;
  const dist = Math.hypot(tx - sx, ty - h);
  const speed = 13 + Math.random() * 5;
  rockets.push({
    x: sx, y: h,
    vx: (tx - sx) / dist * speed,
    vy: (ty - h)  / dist * speed,
    tx, ty,
    color: `hsl(${Math.floor(Math.random() * 360)},100%,65%)`,
    trail: [],
  });
}

function explode(r) {
  const count = 75 + Math.floor(Math.random() * 35);
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.15;
    const speed = 1.8 + Math.random() * 5;
    particles.push({ x: r.x, y: r.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      color: r.color, life: 1, decay: 0.012 + Math.random() * 0.009 });
  }
  // White sparkle centre burst
  for (let i = 0; i < 18; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = Math.random() * 2.5;
    particles.push({ x: r.x, y: r.y, vx: Math.cos(a)*s, vy: Math.sin(a)*s,
      color: '#fff', life: 1, decay: 0.03 + Math.random() * 0.02 });
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawCard(ctx, c) {
  const { x, y, w, h, rotation, rank, suit, isRed } = c;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(rotation);

  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur  = 8;
  ctx.fillStyle   = '#fff';
  roundRect(ctx, -w/2, -h/2, w, h, 6);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth   = 1;
  roundRect(ctx, -w/2, -h/2, w, h, 6);
  ctx.stroke();

  const fs = Math.max(9, w * 0.22);
  ctx.fillStyle    = isRed ? '#e03030' : '#1a1a1a';
  ctx.font         = `bold ${fs}px system-ui,sans-serif`;
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(rank, -w/2 + 3, -h/2 + 2);
  ctx.fillText(suit, -w/2 + 3, -h/2 + fs + 1);

  ctx.restore();
}

function celebLoop() {
  if (!celebCanvas || !celebCtx) return;
  const ctx = celebCtx;
  const w = celebCanvas.width, h = celebCanvas.height;

  ctx.clearRect(0, 0, w, h);

  /* ── Rockets ── */
  rockets = rockets.filter(r => {
    r.trail.push({ x: r.x, y: r.y });
    if (r.trail.length > 9) r.trail.shift();
    r.x += r.vx;
    r.y += r.vy;
    r.vy += 0.18;

    const arrived = Math.hypot(r.x - r.tx, r.y - r.ty) < 18 || r.y < r.ty - 10;
    if (arrived) { explode(r); return false; }

    r.trail.forEach((p, i) => {
      ctx.globalAlpha = (i / r.trail.length) * 0.55;
      ctx.fillStyle   = r.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    ctx.fillStyle   = '#fff';
    ctx.beginPath();
    ctx.arc(r.x, r.y, 3, 0, Math.PI * 2);
    ctx.fill();
    return true;
  });

  /* ── Explosion particles ── */
  particles = particles.filter(p => {
    p.x += p.vx; p.y += p.vy;
    p.vy += 0.09; p.vx *= 0.97;
    p.life -= p.decay;
    if (p.life <= 0) return false;
    ctx.globalAlpha = p.life;
    ctx.fillStyle   = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
    return true;
  });

  ctx.globalAlpha = 1;

  /* ── Cascade cards ── */
  cascadeCards.forEach(c => {
    c.x += c.vx;
    c.y += c.vy;
    c.vy += GRAVITY;
    c.rotation += c.rotSpeed;

    // Bounce off floor
    if (c.y + c.h > h) {
      c.y  = h - c.h;
      c.vy = -(Math.abs(c.vy) * 0.52 + 1.5 + Math.random() * 2.5);
      c.vx *= 0.88;
      c.rotSpeed = (Math.random() - 0.5) * 0.14;
      if (Math.abs(c.vy) < 3.5) c.vy = -(3.5 + Math.random() * 2);
    }
    // Bounce off walls
    if (c.x < 0)        { c.x = 0;        c.vx =  Math.abs(c.vx) * 0.7; }
    if (c.x + c.w > w)  { c.x = w - c.w;  c.vx = -Math.abs(c.vx) * 0.7; }

    drawCard(ctx, c);
  });

  celebRaf = requestAnimationFrame(celebLoop);
}
