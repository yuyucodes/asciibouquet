// ASCII bouquet: the scene is painted with vector shapes onto a tiny offscreen
// canvas (one pixel per character cell), then every pixel is redrawn as a
// coloured ASCII glyph whose density follows the pixel's brightness.
//
// Pink roses and blue hydrangeas on long stems, with baby's breath tucked behind,
// float over rippling water and lilypads. Stems rise and leaves unfurl, then each
// flower starts as a bud and blooms open one by one.
(() => {
  // characters from dark to bright
  const RAMP = ' .:-=+*cxoaX#%&@';
  // size of the painted world, scaled to fit the screen
  const W = 1000, H = 1100, FPS = 30;
  // ---------- helpers ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rad = d => d * Math.PI / 180;
  // 0..1 progress of an animation that starts at s and lasts d seconds
  const prog = (s, d) => clamp((T - s) / d, 0, 1);
  const ease = t => 1 - Math.pow(1 - t, 3);
  const smooth = (a, b, t) => { const x = clamp((t - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };

  // small seeded random generator so the scene is the same every time
  function rng(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // point on a cubic bezier curve (stems and branches)
  const bez = (p, t) => {
    const u = 1 - t;
    return [
      u*u*u*p[0][0] + 3*u*u*t*p[1][0] + 3*u*t*t*p[2][0] + t*t*t*p[3][0],
      u*u*u*p[0][1] + 3*u*u*t*p[1][1] + 3*u*t*t*p[2][1] + t*t*t*p[3][1],
    ];
  };
  // direction of the curve at t, used to angle leaves along a stem
  const bezAngle = (p, t) => {
    const a = bez(p, Math.max(0, t - .01)), b = bez(p, Math.min(1, t + .01));
    return Math.atan2(b[1] - a[1], b[0] - a[0]);
  };
  // f < 1 darkens, f > 1 lightens
  const shade = (c, f) => `rgb(${c.map(v => Math.round(clamp(f < 1 ? v * f : v + (255 - v) * (f - 1), 0, 255)))})`;

  // seconds since the start; the breeze and every animation read it
  let T = 0;
  // gentle breeze: higher points drift further, so the whole bunch bends together
  function sway(x, y) {
    const lift = clamp((1090 - y) / 800, 0, 1);
    return [x + Math.sin(T * .9 + y * .006) * 8 * lift, y];
  }

  // ---------- scene ----------
  const r = rng(7);

  // hydrangea floret colours
  const BLUES = [[79,111,224], [107,140,240], [138,166,245], [122,111,216], [165,139,232], [90,160,232]];
  // one hydrangea head: florets packed in a dome (sunflower spiral), centre ones lit brighter
  function florets(R) {
    const out = [], N = 70;
    for (let i = 0; i < N; i++) {
      const d = Math.sqrt((i + .5) / N) * R, a = i * 2.399;
      const x = Math.cos(a) * d, y = Math.sin(a) * d * .95;
      const z = Math.sqrt(1 - (d / R) ** 2);
      out.push({
        x, y, i: i / N, rot: r() * 3,
        s: R * (.16 + .08 * z),
        col: BLUES[Math.floor(r() * BLUES.length)],
        lit: .75 + .3 * z - (x + y) / R * .12,
      });
    }
    return out;
  }

  // [type, x, y, size]: h = hydrangea, r = rose. Hydrangeas come first so roses draw on top
  const spec = [
    ['h', 560, 300, 125], ['h', 250, 500, 95], ['h', 760, 520, 105],
    ['r', 440, 520, 85], ['r', 640, 650, 75], ['r', 330, 670, 70],
  ];
  // each flower gets a stem rising from the bottom, leaves along it and its own bloom time
  const items = spec.map(([k, x, y, R], i) => {
    const bx = 400 + r() * 60;
    const leaves = [];
    for (let j = 0; j < 7; j++) {
      leaves.push({ t: .2 + j * .09 + r() * .03, side: j % 2 ? 1 : -1, len: 80 + r() * 40, w: 14 });
    }
    return {
      k, x, y, R, rot: r() * 6.28, leaves, s0: i * .25,
      stem: [[bx, 1090], [bx + (x - bx) * .1, 880], [lerp(bx, x, .7), y + 250], [x, y]],
      fl: k === 'h' ? florets(R) : null,
      bloom: 4.4 + i * .5,
    };
  });

  // unused lilypad rolls, kept so the random numbers below stay the same
  const spare = [];
  while (spare.length < 14) {
    const p = { x: -450 + r() * 1900, y: -50 + r() * 1200, r: 55 + r() * 50, a: r() * 6.28, ph: r() * 6 };
    if (p.x > 150 && p.x < 880 && p.y > 150) continue;
    spare.push(p);
  }
  // lilypads: fixed spots at the edges of the frame
  const pads = [
    { x: 40, y: 930, r: 85, a: .5, ph: 1 }, { x: 50, y: 220, r: 70, a: 2, ph: 3 },
    { x: 950, y: 300, r: 75, a: 4, ph: 2 }, { x: 940, y: 640, r: 90, a: 1.2, ph: 5 },
  ];
  // slow expanding rings on the water
  const ripples = Array.from({ length: 9 }, () => ({
    x: -400 + r() * 1800, y: 100 + r() * 1000, per: 12 + r() * 8, off: r() * 9,
  }));

  // baby's breath: thin forking sprays ending in tiny white puffs
  const gyp = [[540, 520], [520, 690], [760, 690], [430, 780], [260, 740], [180, 800]].map(([cx, cy], ci) => {
    const bx = 400 + r() * 60, segs = [], fl = [], out = Math.atan2(cy - 620, cx - 500);
    // each branch forks into 2-3 shorter ones and ends in tiny white puffs
    const br = (x, y, a, len, d, t) => {
      const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
      segs.push({ x, y, x2, y2, t });
      if (d === 0) { fl.push({ x: x2, y: y2, s: 6 + r() * 4, t: t + .2, n: 2 + Math.floor(r() * 2) }); return; }
      if (d < 3 && r() < .7) fl.push({ x: x2, y: y2, s: 5 + r() * 3, t: t + .2, n: 1 });
      const kids = 2 + (r() < .4 ? 1 : 0);
      for (let k = 0; k < kids; k++) {
        const sp = rad(lerp(-65, 65, k / (kids - 1)) + (r() - .5) * 30);
        br(x2, y2, lerp(a + sp, out, .25), len * (.45 + r() * .4), d - 1, t + .2);
      }
    };
    br(cx, cy + 40, -1.57 + (cx - 500) / 900, 55 + r() * 15, 4, .6);
    return {
      segs, fl, front: false, start: 3 + ci * .3 + r() * .4,
      main: [[bx, 1090], [lerp(bx, cx, .2), lerp(1090, cy, .5)], [lerp(bx, cx, .8), cy + 60], [cx, cy + 40]],
    };
  });

  // ---------- drawing ----------
  // water: blue gradient, faint wave lines, then the ripple rings
  function water(g) {
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#0a2a44');
    gr.addColorStop(1, '#14607a');
    g.fillStyle = gr;
    g.fillRect(-1000, -1000, 3000, 3300);
    g.strokeStyle = 'rgba(140,200,220,.13)';
    g.lineWidth = 8;
    for (let y = -300; y < 1500; y += 40) {
      g.beginPath();
      for (let x = -600; x <= 1600; x += 40) {
        const yy = y + Math.sin(x * .012 + T * .5 + y * .05) * 6;
        x === -600 ? g.moveTo(x, yy) : g.lineTo(x, yy);
      }
      g.stroke();
    }
    g.lineWidth = 7;
    // two rings per ripple, fading as they grow
    for (const rp of ripples) {
      for (const lag of [0, .18]) {
        const u = ((T + rp.off) / rp.per - lag + 10) % 1;
        const rx = u * 230;
        g.strokeStyle = `rgba(160,215,235,${(1 - u) * .5})`;
        g.beginPath(); g.ellipse(rp.x, rp.y, rx, rx * .33, 0, 0, 6.283); g.stroke();
      }
    }
  }

  // lilypad: a flattened disc with a notch cut out, bobbing slightly
  function pad(g, p) {
    const y = p.y + Math.sin(T * .8 + p.ph) * 3;
    const pulse = Math.sin(T * .8 + p.ph);
    g.save();
    g.translate(p.x, y);
    g.scale(1, .42);
    g.strokeStyle = `rgba(160,215,235,${.2 + .08 * pulse})`;
    g.lineWidth = 6;
    g.beginPath(); g.arc(0, 0, p.r * (1.18 + .04 * pulse), 0, 6.283); g.stroke();
    g.rotate(p.a);
    g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, p.r, .45, 6.283); g.closePath();
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, p.r);
    gr.addColorStop(0, '#4ea040');
    gr.addColorStop(1, '#215f2c');
    g.fillStyle = gr; g.fill();
    g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 5; g.stroke();
    g.strokeStyle = 'rgba(150,210,110,.35)'; g.lineWidth = 2;
    for (let k = 0; k < 7; k++) {
      const a = .6 + k * .8;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * p.r * .9, Math.sin(a) * p.r * .9); g.stroke();
    }
    g.restore();
  }

  // draw a curve from its start up to `upto` (0..1) so stems grow upward
  function stem(g, pts, upto, w, col = '#3f8a3a') {
    if (upto <= 0) return;
    g.beginPath();
    for (let i = 0; i <= 30; i++) {
      const p = bez(pts, upto * i / 30), q = sway(p[0], p[1]);
      i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]);
    }
    g.lineWidth = w; g.strokeStyle = col; g.lineCap = 'round'; g.stroke();
  }

  // lance-shaped leaf along +x, its tip arching by `bend`
  function leaf(g, x, y, ang, L, Wd, bend) {
    g.save(); g.translate(x, y); g.rotate(ang);
    g.beginPath(); g.moveTo(0, 0);
    g.bezierCurveTo(L * .3, -Wd, L * .7, -Wd * .8 + bend / 2, L, bend);
    g.bezierCurveTo(L * .7, Wd * .8 + bend / 2, L * .3, Wd, 0, 0);
    const gr = g.createLinearGradient(0, 0, L, 0);
    gr.addColorStop(0, '#2a6a28'); gr.addColorStop(1, '#6cb04a');
    g.fillStyle = gr; g.fill();
    g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 5; g.stroke();
    g.strokeStyle = 'rgba(190,230,150,.5)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(L * .9, bend * .9); g.stroke();
    g.restore();
  }

  // florets open from the centre outwards; each is four round petals around a pale dot
  function hydrangea(g, it, p) {
    if (!p) return;
    const [x, y] = sway(it.x, it.y);
    g.save(); g.translate(x, y);
    for (let n = it.fl.length - 1; n >= 0; n--) {
      const f = it.fl[n];
      const k = ease(clamp((p - f.i * .6) / .4, 0, 1));
      if (!k) continue;
      const s = f.s * k;
      g.fillStyle = shade(f.col, f.lit);
      g.strokeStyle = 'rgba(10,15,60,.6)'; g.lineWidth = 4;
      for (let q = 0; q < 4; q++) {
        const a = f.rot + q * Math.PI / 2;
        g.beginPath();
        g.ellipse(f.x * (.4 + .6 * k) + Math.cos(a) * s * .5, f.y * (.4 + .6 * k) + Math.sin(a) * s * .5, s * .55, s * .55, 0, 0, 6.283);
        g.fill(); g.stroke();
      }
      g.fillStyle = '#e4eaff';
      g.beginPath(); g.arc(f.x * (.4 + .6 * k), f.y * (.4 + .6 * k), s * .18, 0, 6.283); g.fill();
    }
    g.restore();
  }

  // rose petal rings [count, size, distance from centre, colour], outer to inner
  const LAYERS = [[7, .95, .62, '#f4a9bf'], [6, .78, .44, '#f7b8ca'], [5, .6, .3, '#f9c6d5'], [4, .42, .18, '#fbd4df'], [3, .26, .08, '#fde3ea']];
  // rose: rings of round petals appear outer to inner, with a spiral in the middle
  function rose(g, it, p) {
    if (!p) return;
    const [x, y] = sway(it.x, it.y);
    const R = it.R;
    g.save(); g.translate(x, y); g.rotate(it.rot);
    LAYERS.forEach(([n, rr, d, c], li) => {
      const q = smooth(li * .14, li * .14 + .5, p);
      if (!q) return;
      for (let i = 0; i < n; i++) {
        const a = i / n * 6.283 + li * .7, pr = R * rr * .58 * q, dd = R * d * q;
        const px = Math.cos(a) * dd, py = Math.sin(a) * dd;
        g.beginPath(); g.arc(px, py, pr, 0, 6.283);
        g.fillStyle = c; g.fill();
        const gr = g.createLinearGradient(px - Math.cos(a) * pr, py - Math.sin(a) * pr, px + Math.cos(a) * pr, py + Math.sin(a) * pr);
        gr.addColorStop(0, 'rgba(190,90,130,.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fill();
        g.strokeStyle = 'rgba(120,40,70,.55)'; g.lineWidth = 5; g.stroke();
      }
    });
    // spiral at the heart of the rose
    g.strokeStyle = 'rgba(150,50,90,.8)'; g.lineWidth = 5;
    g.beginPath();
    for (let t = 0; t < 10.5; t += .3) {
      const rr = t * R * .018 * smooth(0, 1, p);
      g.lineTo(Math.cos(t) * rr, Math.sin(t) * rr);
    }
    g.stroke();
    g.restore();
  }

  // baby's breath: the main stem grows, branches fork out, then the white puffs appear
  function gypsy(g, c) {
    const p = prog(c.start, 3.2);
    if (!p) return;
    stem(g, c.main, ease(Math.min(1, p * 3)), 4, '#8fae6a');
    const local = p * 3.2 - .6;
    g.strokeStyle = '#9bb87a'; g.lineWidth = 3;
    for (const s of c.segs) {
      const k = clamp((local - s.t) / .25, 0, 1);
      if (!k) continue;
      const [x, y] = sway(s.x, s.y), [x2, y2] = sway(s.x2, s.y2);
      g.beginPath(); g.moveTo(x, y); g.lineTo(lerp(x, x2, k), lerp(y, y2, k)); g.stroke();
    }
    for (const f of c.fl) {
      const k = ease(clamp((local - f.t) / .5, 0, 1));
      if (!k) continue;
      const [x, y] = sway(f.x, f.y);
      g.fillStyle = `rgba(252,250,244,${.9 + .1 * Math.sin(T * 2.5 + f.x * .3)})`;
      for (let i = 0; i < f.n; i++) {
        g.beginPath(); g.arc(x + (i - (f.n - 1) / 2) * f.s * .9, y - (i % 2) * f.s * .6, f.s * k, 0, 6.283); g.fill();
      }
    }
  }

  // bud: swells and blushes, then shrinks away as the flower opens from it
  function bud(g, it, grow, p) {
    const sz = it.R * .4 * grow * (1 - smooth(0, .6, p));
    if (sz < 1) return;
    const [x, y] = sway(it.x, it.y), rs = it.k === 'r', b = smooth(.4, 1, grow);
    const a = [140, 190, 70], c = rs ? [246, 176, 196] : [100, 130, 230];
    g.save(); g.translate(x, y); g.rotate(rs ? -1.57 : 0);
    g.fillStyle = `rgb(${a.map((v, i) => Math.round(lerp(v, c[i], b * (rs ? .8 : .6))))})`;
    g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 5;
    g.beginPath(); g.ellipse(0, 0, rs ? sz * 1.5 : sz, sz, 0, 0, 6.283); g.fill(); g.stroke();
    if (rs) {
      g.strokeStyle = 'rgba(40,70,20,.55)';
      g.beginPath(); g.moveTo(-sz * 1.3, 0); g.quadraticCurveTo(0, sz * .3, sz * 1.3, 0); g.stroke();
    }
    g.restore();
  }

  // back to front: water, pads, baby's breath, stems, leaves, then buds and flowers
  function drawScene(g) {
    water(g);
    for (const p of pads) pad(g, p);
    for (const c of gyp) if (!c.front) gypsy(g, c);
    for (const it of items) stem(g, it.stem, ease(prog(it.s0, 2.4)), 9);
    for (const it of items) {
      for (const lf of it.leaves) {
        const lp = ease(prog(it.s0 + 2.4 * lf.t, 1.4));
        if (!lp) continue;
        const a = bez(it.stem, lf.t), [x, y] = sway(a[0], a[1]);
        leaf(g, x, y, bezAngle(it.stem, lf.t) + lf.side * rad(40), lf.len * lp, lf.w * lp, lf.side * lf.len * lp * .15);
      }
    }
    for (const it of items) {
      const p = ease(prog(it.bloom, it.k === 'h' ? 4 : 3.5));
      bud(g, it, ease(prog(it.s0 + 2.2, 1.3)), p);
      it.k === 'h' ? hydrangea(g, it, p) : rose(g, it, p);
    }
  }

  // ---------- ascii renderer ----------
  const screen = document.getElementById('screen');
  const sctx = screen.getContext('2d');
  const off = document.createElement('canvas');
  const octx = off.getContext('2d', { willReadFrequently: true });
  let cols = 0, rows = 0, cellW = 0, cellH = 0, fontSize = 0, dpr = 1;
  const styleCache = new Map();
  function style(r, g, b) {
    const key = (r << 16) | (g << 8) | b;
    let s = styleCache.get(key);
    if (!s) { s = `rgb(${r},${g},${b})`; styleCache.set(key, s); }
    return s;
  }

  // size the canvases to the framed area, one offscreen pixel per character cell
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = screen.clientWidth, h = screen.clientHeight;
    fontSize = clamp(Math.floor(Math.min(w / 100, h / 85)), 5, 11);
    sctx.font = `bold ${fontSize}px Menlo, Consolas, "DejaVu Sans Mono", monospace`;
    cellW = sctx.measureText('M').width || fontSize * .6;
    cellH = fontSize;
    screen.width = Math.floor(w * dpr);
    screen.height = Math.floor(h * dpr);
    cols = Math.ceil(w / cellW);
    rows = Math.ceil(h / cellH);
    off.width = cols;
    off.height = rows;
  }

  // paint the scene into the low-res buffer, correcting for tall character cells
  function render() {
    const aspect = cellH / cellW;
    const sx = Math.min(cols / W, (rows * aspect) / H) * .96;
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.fillStyle = '#000';
    octx.fillRect(0, 0, cols, rows);
    octx.setTransform(sx, 0, 0, sx / aspect, (cols - W * sx) / 2, (rows - (H * sx) / aspect) / 2);
    drawScene(octx);
    for (const c of gyp) if (c.front) gypsy(octx, c);

    const data = octx.getImageData(0, 0, cols, rows).data;
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sctx.fillStyle = '#000';
    sctx.fillRect(0, 0, screen.width, screen.height);
    // soft glow of the same image underneath the glyphs, like a CRT bloom
    sctx.save();
    sctx.globalAlpha = .4;
    sctx.filter = `blur(${Math.round(cellH * .4)}px)`;
    sctx.drawImage(off, 0, 0, cols * cellW, rows * cellH);
    sctx.restore();
    sctx.textBaseline = 'top';
    const n = RAMP.length - 1;
    const flick = Math.floor(T * 8);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = (y * cols + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const m = Math.max(r, g, b);
        if (m < 14) continue;
        const v = m / 255;
        // a little shimmer so the glyphs feel alive
        const h = ((x * 73856093) ^ (y * 19349663) ^ (flick * 83492791)) >>> 0;
        const j = h % 7 === 0 ? (h & 8 ? 1 : -1) : 0;
        // brighter pixels get denser characters
        const idx = clamp(Math.round(Math.pow(v, .7) * n) + j, 1, n);
        const k = Math.min(1.25, (40 + 215 * v) / m);
        sctx.fillStyle = style(Math.min(255, (r * k) | 0) & 0xf8, Math.min(255, (g * k) | 0) & 0xf8, Math.min(255, (b * k) | 0) & 0xf8);
        sctx.fillText(RAMP[idx], x * cellW, y * cellH);
      }
    }
  }

  // ---------- loop ----------
  let t0 = performance.now(), last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (now - last < 1000 / FPS) return;
    last = now;
    T = (now - t0) / 1000;
    render();
  }
  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(frame);
})();
