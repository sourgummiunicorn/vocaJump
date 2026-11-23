// world.js
// Draws the coastal world: sky, sea, the sandy path in perspective, scenery,
// and the seal itself.
//
// THE GROUND TRICK (the heart of the pseudo-3D look)
// We draw the ground one screen ROW at a time. For each row we ask:
// "how far away is the sand on this row?" Knowing the distance, we know where
// the path's centre is (it curves), how wide it looks, and which stripe colour
// it has. Stripes that alternate every 1.5 m rush toward the camera as the
// seal moves, which sells the feeling of speed.
//
// TWO LAYERS
// The sky and ground are painted on a background canvas with 2x finer pixels,
// so the big open areas look calm and clear. Everything with character (the
// seal, food, obstacles, scenery, UI) stays on the chunky 160 x 256 canvas.
//
// TIME OF DAY travels with you: the coast drifts from a sunny morning beach to
// a sunset coast to a moonlit shore and back to morning, every 2100 m.
// Each look is a THEME (a set of colours); in between, we blend two themes.

HH.World = (function () {
  const P = HH.PAL, V = HH.View;
  const BG = 2;                 // background pixels per game pixel
  let bg = null;                // background 2D context
  const clouds = [];
  const birds = [];
  let stars = [];

  // ---------------------------------------------------------------------------
  // Themes. Colours are hex here and turned into [r, g, b] once, so blending
  // between themes is just a little arithmetic.
  // ---------------------------------------------------------------------------
  const RAW = {
    day: {
      sky: ['#78c4df', '#86cce3', '#96d4e7', '#a9dcea', '#bfe4ec', '#d6ebeb', '#ecefe2', '#f8e8cd'],
      waterA: '#42c1cc', waterB: '#4bc6cf', waterFar: '#7dd8de', glint: '#9fe3e6', foam: '#ffffff', foam2: '#9ee6c8',
      sand: '#f3ddb4', sandL: '#f8e9c9', sandD: '#e5c79a', sandDD: '#cfab7c', dune: '#ead0a6', wet: '#d8b98e', wetD: '#d0b086',
      grass: '#7cc49a', grassL: '#86cba3', island: '#9fb7cc', islandD: '#86a1ba', head: '#a6cfb5', headD: '#8fc0a4',
      rim: '#a9abc0', rimD: '#9093ad', rimL: '#cdd0de', crest: '#9be6e8', swell: '#36adbb',
      haze: '#e8f0e8', sunCol: '#fffaf0', glow: '#ffe6b0', tint: '#000000',
      sunY: 58, sun: 1, moon: 0, stars: 0, cloud: 1, tintA: 0,
    },
    sunset: {
      sky: ['#5e6fb0', '#7d78b8', '#a983b4', '#d091a8', '#ec9f92', '#f6b383', '#fbc98a', '#ffdca0'],
      waterA: '#5aa2c0', waterB: '#63a9c4', waterFar: '#d7a7ae', glint: '#ffd6a8', foam: '#fff0e2', foam2: '#f2b8a8',
      sand: '#f2cfa6', sandL: '#f6dbb8', sandD: '#e2b48e', sandDD: '#c9956f', dune: '#e8c29c', wet: '#d4a283', wetD: '#cb987a',
      grass: '#93b48c', grassL: '#9dbb93', island: '#a387a8', islandD: '#8d7397', head: '#a8a08f', headD: '#968c80',
      rim: '#ab95a3', rimD: '#937f90', rimL: '#cdb6bd', crest: '#f3cdbf', swell: '#4e93b2',
      haze: '#f8d2b4', sunCol: '#ffd27a', glow: '#ff9e6b', tint: '#ff9a6e',
      sunY: 88, sun: 1, moon: 0, stars: 0.15, cloud: 0.85, tintA: 0.13,
    },
    night: {
      sky: ['#141a3f', '#1b2250', '#232b5f', '#2d356c', '#3a4178', '#4a4f86', '#5d5f92', '#72709c'],
      waterA: '#24557c', waterB: '#285b83', waterFar: '#4d5f8c', glint: '#cfe6ff', foam: '#dbe8ff', foam2: '#7fa6c9',
      sand: '#8d8bab', sandL: '#9593b2', sandD: '#7d7b9c', sandDD: '#6a6889', dune: '#83819f', wet: '#706e8e', wetD: '#6b6989',
      grass: '#4d6d78', grassL: '#55747f', island: '#38406c', islandD: '#2f3660', head: '#3a4a68', headD: '#34425f',
      rim: '#5e6283', rimD: '#4f5373', rimL: '#7b7fa0', crest: '#6f9fc8', swell: '#1f4b70',
      haze: '#6a6c98', sunCol: '#ffd27a', glow: '#ff9e6b', tint: '#2a3478',
      sunY: 110, sun: 0, moon: 1, stars: 1, cloud: 0.45, tintA: 0.3,
    },
  };
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const THEMES = {};
  for (const [name, th] of Object.entries(RAW)) {
    const o = {};
    for (const [k, v] of Object.entries(th)) {
      o[k] = Array.isArray(v) ? v.map(hex) : typeof v === 'string' ? hex(v) : v;
    }
    THEMES[name] = o;
  }

  // Blend two themes. Colours become 'rgb(...)' strings ready for drawing.
  function blend(a, b, t) {
    const out = {};
    const lerp = (x, y) => x + (y - x) * t;
    const col = (ca, cb) => `rgb(${Math.round(lerp(ca[0], cb[0]))}, ${Math.round(lerp(ca[1], cb[1]))}, ${Math.round(lerp(ca[2], cb[2]))})`;
    for (const k of Object.keys(a)) {
      const va = a[k], vb = b[k];
      if (k === 'sky') out.sky = va.map((c, i) => [lerp(c[0], vb[i][0]), lerp(c[1], vb[i][1]), lerp(c[2], vb[i][2])]);
      else if (Array.isArray(va)) { out[k] = col(va, vb); out[k + 'Rgb'] = [lerp(va[0], vb[0]), lerp(va[1], vb[1]), lerp(va[2], vb[2])]; }
      else out[k] = lerp(va, vb);
    }
    return out;
  }

  // Which theme belongs to a distance? Long steady stretches, slow fades.
  const CYCLE = 2100;
  const SEGMENTS = [   // [start, end, from, to]
    [0, 550, 'day', 'day'], [550, 700, 'day', 'sunset'], [700, 1250, 'sunset', 'sunset'],
    [1250, 1400, 'sunset', 'night'], [1400, 1950, 'night', 'night'], [1950, 2100, 'night', 'day'],
  ];
  let theme = blend(THEMES.day, THEMES.day, 0);
  let themeKey = '';

  function setDistance(dist) {
    const ph = ((dist % CYCLE) + CYCLE) % CYCLE;
    const seg = SEGMENTS.find(([a, b]) => ph >= a && ph < b) || SEGMENTS[0];
    let t = seg[2] === seg[3] ? 0 : (ph - seg[0]) / (seg[1] - seg[0]);
    t = t * t * (3 - 2 * t);
    const key = seg[2] + seg[3] + t.toFixed(3);          // only re-blend when something changed
    if (key !== themeKey) { theme = blend(THEMES[seg[2]], THEMES[seg[3]], t); themeKey = key; }
    return theme;
  }

  // ---------------------------------------------------------------------------
  function init(bgCanvas) {
    bg = bgCanvas.getContext('2d');
    bg.imageSmoothingEnabled = false;
    for (let i = 0; i < 5; i++) {
      clouds.push({ x: i * 41 + 7, y: 10 + ((i * 23) % 50), speed: 1.2 + (i % 3) * 0.7, c: cloudHi(i) });
    }
    const rand = HH.rng(31);
    stars = Array.from({ length: 46 }, () => ({ x: Math.floor(rand() * V.W * BG), y: Math.floor(rand() * 82 * BG), p: rand() * 6, big: rand() < 0.15 }));
  }

  // Clouds painted at 2x resolution: soft and round instead of blocky.
  function cloudHi(seed) {
    const rand = HH.rng(seed * 13 + 1);
    const w = (30 + Math.floor(rand() * 18)) * BG, h = 13 * BG;
    const r = new HH.Raster(w, h);
    const puffs = 3 + Math.floor(rand() * 3);
    for (let i = 0; i < puffs; i++) {
      const px = 10 + rand() * (w - 20);
      const pr = (3 + rand() * 4) * BG;
      r.ellipse(px, h - pr - 2, pr * 1.3, pr, (x, y, nx, ny) => ny > 0.5 ? P.cloudShade : P.cloud);
    }
    r.ellipse(w / 2, h - 5, w / 2 - 2, 5, (x, y, nx, ny) => ny > 0 ? P.cloudShade : P.cloud);
    return r.toCanvas();
  }

  // ---------------------------------------------------------------------------
  // Sky: gradient, stars, sun or moon, islands, clouds, birds
  // ---------------------------------------------------------------------------
  function disc(g, cx, cy, r, color) {
    g.fillStyle = color;
    for (let y = -r; y <= r; y++) {
      const half = Math.round(Math.sqrt(r * r - y * y));
      g.fillRect(cx - half, cy + y, half * 2, 1);
    }
  }

  function drawSky(t) {
    const g = bg, th = theme;
    const W2 = V.W * BG, H2 = (V.HORIZON + 1) * BG;

    // soft gradient in 4px steps: still banded like a retro sky, but gentle
    const n = th.sky.length - 1;
    for (let y = 0; y < H2; y += 4) {
      const f = Math.min(0.999, y / H2) * n, i = Math.floor(f), u = f - i;
      const a = th.sky[i], b = th.sky[i + 1];
      g.fillStyle = `rgb(${Math.round(a[0] + (b[0] - a[0]) * u)}, ${Math.round(a[1] + (b[1] - a[1]) * u)}, ${Math.round(a[2] + (b[2] - a[2]) * u)})`;
      g.fillRect(0, y, W2, 4);
    }

    // stars twinkle in as night falls
    if (th.stars > 0.02) {
      for (const s of stars) {
        const tw = 0.55 + 0.45 * Math.sin(t * 1.7 + s.p);
        g.globalAlpha = th.stars * tw;
        g.fillStyle = '#ffffff';
        g.fillRect(s.x, s.y, s.big ? 2 : 1, s.big ? 2 : 1);
      }
      g.globalAlpha = 1;
    }

    // the sun sinks lower and warmer toward sunset
    if (th.sun > 0.02) {
      const sx = 122 * BG, sy = Math.round(th.sunY * BG);
      g.globalAlpha = th.sun;
      g.globalAlpha = th.sun * 0.2; disc(g, sx, sy, 34, th.glow);
      g.globalAlpha = th.sun * 0.3; disc(g, sx, sy, 24, th.glow);
      g.globalAlpha = th.sun; disc(g, sx, sy, 15, th.sunCol);
      disc(g, sx, sy, 11, '#fffaf0');
      g.globalAlpha = 1;
    }
    // the moon rises on the sea side
    if (th.moon > 0.02) {
      const mx = 40 * BG, my = 34 * BG;
      g.globalAlpha = th.moon * 0.15; disc(g, mx, my, 30, '#c9d6ff');
      g.globalAlpha = th.moon * 0.25; disc(g, mx, my, 20, '#c9d6ff');
      g.globalAlpha = th.moon; disc(g, mx, my, 12, '#f4f2e6');
      g.fillStyle = '#d9d6c6';
      g.fillRect(mx - 5, my - 3, 4, 3); g.fillRect(mx + 3, my + 3, 3, 3); g.fillRect(mx - 1, my + 6, 2, 2);
      g.globalAlpha = 1;
    }

    // distant islands (sea side) and a headland (dune side)
    const hill = (x0, w, h, c) => {
      g.fillStyle = c;
      for (let x = 0; x < w * BG; x++) {
        const u = x / (w * BG);
        const hh = Math.round(h * BG * Math.sin(u * Math.PI) * (0.85 + 0.15 * Math.sin(u * 9)));
        g.fillRect(x0 * BG + x, V.HORIZON * BG - hh, 1, hh + BG);
      }
    };
    hill(4, 34, 7, th.island);
    hill(24, 22, 4, th.islandD);
    hill(46, 12, 2, th.island);
    hill(118, 42, 6, th.head);
    hill(132, 28, 3, th.headD);

    // drifting clouds
    g.globalAlpha = th.cloud;
    for (const c of clouds) {
      const span = W2 + c.c.width;
      const x = ((c.x * BG - t * c.speed * BG) % span + span) % span - c.c.width;
      g.drawImage(c.c, Math.round(x), c.y * BG);
    }
    g.globalAlpha = 1;

    // seabirds glide across now and then (kept chunky: they are characters)
    if (Math.random() < 0.002 && birds.length < 3 && th.moon < 0.5) {
      birds.push({ x: V.W + 5, y: 18 + Math.random() * 40, v: 10 + Math.random() * 8, ph: Math.random() * 6 });
    }
    for (const b of birds) {
      b.x -= b.v / 60;
      const spr = HH.Sprites.bird(Math.floor(t * 4 + b.ph) % 2);
      g.drawImage(spr, Math.round(b.x * BG), Math.round((b.y + Math.sin(t * 2 + b.ph) * 2) * BG), spr.width * BG, spr.height * BG);
    }
    for (let i = birds.length - 1; i >= 0; i--) if (birds[i].x < -10) birds.splice(i, 1);
  }

  // ---------------------------------------------------------------------------
  // The ground, one fine row at a time (see THE GROUND TRICK above).
  // ---------------------------------------------------------------------------
  function drawGround(t) {
    const g = bg, th = theme, Proj = HH.Proj;
    const W2 = V.W * BG;
    for (let y = V.HORIZON * BG + 1; y < V.H * BG; y++) {
      const vy = (y + 0.5) / BG;                         // this row in game pixels
      const dz = (V.F * V.CAM_H) / (vy - V.HORIZON);
      const z = Proj.camZ + dz;
      const s = (V.F / dz) * BG;                         // fine pixels per world unit
      const cx = (V.W / 2 + (HH.Level.pathX(z) - Proj.camX) * (V.F / dz)) * BG;
      const X = (rel) => Math.round(cx + rel * s);
      const far = dz > 40;
      const stripe = Math.floor(z / 1.5) % 2 === 0;

      // The path is a sandbar: water on both sides. The sand slopes into a
      // thin band of wet sand where the waves wash up; piles of dark rocks
      // (drawn as scenery sprites) line both shores.
      const shoreL = -1.36 + 0.05 * Math.sin(t * 1.1 + z * 0.35);
      const shoreR = 1.36 + 0.05 * Math.sin(t * 1.2 + z * 0.4 + 2);
      const water = far ? th.waterFar : (Math.floor(z * 0.4 + t * 0.25) % 2 ? th.waterA : th.waterB);
      const foamW = Math.max(1, Math.round(0.045 * s));

      // 1. the ocean on both sides
      g.fillStyle = water;
      g.fillRect(0, y, Math.max(0, X(shoreL)), 1);
      g.fillRect(X(shoreR), y, W2 - X(shoreR), 1);

      // rolling waves: crests run parallel to the shore and travel in toward
      // the sand, breaking up and fading as they go, then a new one rolls in
      if (!far) {
        const crestW = Math.max(1, Math.round(0.05 * s));
        for (let i = 0; i < 4; i++) {
          const d = ((t * 0.32 + i * 0.62) % 2.48);            // how far out this crest is (world units)
          if (d < 0.12) continue;                              // it has reached the foam
          const broken = Math.sin(z * 1.7 + i * 2.1 + Math.floor(t * 0.32 + i * 0.25) * 1.3);
          if (broken < -0.35) continue;                        // gaps make the crest look natural
          // WIGGLE: real crests are never ruler-straight. Two sine waves along
          // the shore (one long and lazy, one short and quick) push each crest
          // in and out, and they drift over time so the wiggle keeps moving.
          // Each crest (i) and each side gets its own wiggle, so they don't match.
          const wobble = (side) =>
            0.11 * Math.sin(z * 1.1 + i * 1.9 + side * 2.3 + t * 0.8) +
            0.045 * Math.sin(z * 3.4 + i * 0.7 - side * 1.4 + t * 1.7);
          const dL = d + wobble(0), dR = d + wobble(1);
          if (dL > 0.08) {
            g.fillStyle = dL < 0.6 ? th.foam : th.crest;       // whiter as it nears the shore
            g.fillRect(X(shoreL - dL), y, crestW, 1);
            g.fillStyle = th.swell;                            // a darker swell just behind gives it body
            g.fillRect(X(shoreL - dL - 0.07), y, crestW, 1);
          }
          if (dR > 0.08) {
            g.fillStyle = dR < 0.6 ? th.foam : th.crest;
            g.fillRect(X(shoreR + dR) - crestW, y, crestW, 1);
            g.fillStyle = th.swell;
            g.fillRect(X(shoreR + dR + 0.07) - crestW, y, crestW, 1);
          }
        }
      }
      sparkle(g, y, t, far, X(shoreL), 0);
      sparkle(g, y, t, far, W2 - X(shoreR), X(shoreR));

      // 2. foam where the water meets the rocks
      //    (the dashed "second wave" line that used to sit just offshore is gone:
      //    its regular dashes looked like road markings under the water)
      g.fillStyle = th.foam;
      g.fillRect(X(shoreL) - foamW, y, foamW, 1);
      g.fillRect(X(shoreR), y, foamW, 1);

      // 3. wet sand where the waves wash up, shiny like the beach in the photo
      g.fillStyle = stripe ? th.wet : th.wetD;
      g.fillRect(X(shoreL), y, X(-1.24) - X(shoreL), 1);
      g.fillRect(X(1.24), y, X(shoreR) - X(1.24), 1);

      // 4. the sandbar itself: plain sand that runs straight into the wet sand
      //    (no border lines, so it reads as a beach, not a road)
      g.fillStyle = stripe ? th.sand : th.sandL;
      g.fillRect(X(-1.24), y, X(1.24) - X(-1.24), 1);
    }

    // a soft haze where land meets sky, so the far distance stays calm
    const top = V.HORIZON * BG, hz = th.hazeRgb;
    for (let i = 0; i < 14 * BG; i++) {
      g.fillStyle = `rgba(${Math.round(hz[0])}, ${Math.round(hz[1])}, ${Math.round(hz[2])}, ${(0.75 * (1 - i / (14 * BG))).toFixed(3)})`;
      g.fillRect(0, top + i, W2, 1);
    }
  }

  // a few slow glints on the water
  function sparkle(g, y, t, far, limit, offset = 0) {
    if (far || limit < 8) return;
    const tick = Math.floor(t * 1.4);
    const h = Math.sin(y * 12.9898 + tick * 78.233 + offset) * 43758.5453;
    const r = h - Math.floor(h);
    if (r < 0.07) {
      const x = Math.floor(r * 14 * limit);
      if (x < limit - 4) { g.fillStyle = theme.glint; g.fillRect(offset + x, y, 4, 1); }
    }
  }

  // ---------------------------------------------------------------------------
  // Scenery sprites along the coast
  // ---------------------------------------------------------------------------
  const DECOR_MUL = { grass: 1.6, weed: 1.3, stick: 1.3, flower: 1.4, shell: 1, star: 1, pebbles: 1.2, crab: 1 };

  // A wild seal resting on a rock: picks its pose, animates it, and adds the
  // little extras (z's for nappers, "pat" marks for belly patters).
  function restingSealOn(g, d, t, wx, z, h) {
    const pose = d.pose || (d.awake ? 'look' : 'banana');      // older saves of the level
    const frame = HH.Sprites.restFrame(pose, t, d.seed);
    const MUL = 1.6;                                           // big enough to read the pose
    const p = HH.Proj.project(wx, z, h);
    if (!p) return;
    const k = HH.Proj.spriteScale(p.dz);
    // draw the seal at its on-screen size (rounded to even widths so we only
    // build a handful of sizes), never shrunk from a bigger picture
    const size = Math.round((26 * k * MUL) / 2) * 2;
    if (size < 8) return;                                      // too far away to see
    const cv = HH.Sprites.restingSeal(d.tone, pose, d.left, frame, size);
    g.drawImage(cv, Math.round(p.x - cv.width / 2), Math.round(p.y - cv.height));
    if (p.dz > 18) return;
    const dir = d.left ? -1 : 1;
    if (pose === 'nap' && Math.floor(t * 0.8 + d.seed) % 3 === 0) {
      HH.Font.draw(g, 'z', p.x + dir * 16 * k, p.y - 24 * k - (t * 6 % 4), { color: P.white });   // a plain white z floats up
    }
    if (pose === 'belly' && frame === 1) {
      // two tiny white ticks above the tummy: pat, pat!
      const kk = k * MUL, px = p.x + dir * (14.5 - 13) * kk, py = p.y - 9 * kk;
      g.fillStyle = P.white;
      g.fillRect(Math.round(px - 3 * kk), Math.round(py), 1, Math.max(1, Math.round(kk)));
      g.fillRect(Math.round(px + 3 * kk), Math.round(py), 1, Math.max(1, Math.round(kk)));
    }
  }

  function drawDecor(g, d, t) {
    let x = d.x, cv;
    if (d.kind === 'crab') {
      x += Math.sin(t * 1.2 + d.seed) * 0.08;               // little sideways scuttle
      cv = HH.Sprites.crab(Math.floor(t * 6 + d.seed) % 2);
    } else if (d.kind === 'pile') {
      // a pile of dark rocks at the water's edge
      const wx = HH.Level.pathX(d.z) + x;
      const pile = HH.Sprites.rockPile(d.seed, d.look);
      const MUL = 1.5;
      const p = HH.Entities.drawAt(g, pile.canvas, wx, d.z, -0.07, MUL);
      if (!p) return;
      const k = HH.Proj.spriteScale(p.dz) * MUL;
      // now and then a wave bursts against the outer side of the rocks
      const ph = (t * 0.45 + d.splash) % 1;
      if (ph < 0.22 && p.dz < 26) {
        const sx = p.x + d.side * (pile.canvas.width * 0.32) * k;
        const sy = p.y - 4 * k;
        const grow = ph / 0.22;
        g.fillStyle = P.white;
        for (let i = 0; i < 9; i++) {
          const a = -Math.PI / 2 + (i - 4) * 0.28 + d.side * 0.3;
          const rr = (4 + i % 3 * 3) * grow * k;
          g.fillRect(Math.round(sx + Math.cos(a) * rr), Math.round(sy + Math.sin(a) * rr * 1.4), Math.max(1, Math.round(k)), Math.max(1, Math.round(k)));
        }
      }
      // a wild harbor seal resting on top, in one of several poses
      if (d.seal) restingSealOn(g, d, t, wx + (pile.seat.x * MUL) / 104, d.z - 0.01, -0.07 + (pile.seat.y * MUL) / 104 - 0.03);
      return;
    } else if (d.kind === 'haul') {
      // a flat rock in the shallows; maybe a seal napping on top
      const wx = HH.Level.pathX(d.z) + x;
      HH.Entities.drawAt(g, HH.Sprites.haulRock(d.seed), wx, d.z, -0.05, 1.6);
      if (d.seal) restingSealOn(g, d, t, wx, d.z, 0.06);
      return;
    } else if (d.kind === 'searock') {
      cv = HH.Sprites.rockPile(20 + d.seed).canvas;
      HH.Entities.drawAt(g, cv, HH.Level.pathX(d.z) + x, d.z, -0.08, 0.8);
      return;
    } else {
      cv = HH.Sprites.decor(d.kind);
    }
    HH.Entities.drawAt(g, cv, HH.Level.pathX(d.z) + x, d.z, 0, DECOR_MUL[d.kind] || 1);
  }

  // ---------------------------------------------------------------------------
  // The seal (with its shadow)
  // ---------------------------------------------------------------------------
  function drawSeal(g, seal, acc, scale) {
    const wx = HH.Level.pathX(seal.z) + seal.x;
    const p = HH.Proj.project(wx, seal.z, seal.y);
    const ground = HH.Proj.project(wx, seal.z, seal.floor || 0);
    if (!p) return;
    const k = scale || HH.Proj.spriteScale(p.dz);
    const f = seal.frame(acc);
    const spr = HH.Sprites.seal(f);

    // shadow shrinks as the seal rises
    const lift = Math.max(0, seal.y - (seal.floor || 0));
    const sh = Math.max(0.35, 1 - lift * 1.6);
    HH.Entities.pixelEllipse(g, ground.x, ground.y - 1, 12 * sh * k * f.sx, 2.4 * sh * k, P.shadow);

    const w = Math.round(spr.canvas.width * k), h = Math.round(spr.canvas.height * k);
    const x = Math.round(p.x - spr.ax * k + f.wobble);
    const y = Math.round(p.y - spr.ay * k);
    g.drawImage(spr.canvas, x, y, w, h);

    // dizzy stars after a bump (and after the final flop)
    if (seal.bonkT > 0 || seal.flopped) {
      g.fillStyle = P.gold;
      for (let i = 0; i < 3; i++) {
        const a = seal.t * 7 + (i * Math.PI * 2) / 3;
        g.fillRect(Math.round(p.x + Math.cos(a) * 9), Math.round(y + 14 + Math.sin(a) * 2), 2, 2);
      }
    }
    return { x: p.x, y: p.y, groundY: ground.y, top: y };
  }

  // A big seal for the title screen (integer scale keeps pixels square).
  function drawSealAt(g, seal, acc, sx, sy, scale) {
    const f = seal.frame(acc);
    const spr = HH.Sprites.seal(f);
    HH.Entities.pixelEllipse(g, sx, sy - 1, 13 * scale * f.sx, 2.5 * scale, P.shadow);
    g.drawImage(spr.canvas, Math.round(sx - spr.ax * scale + f.wobble * scale), Math.round(sy - spr.ay * scale),
      spr.canvas.width * scale, spr.canvas.height * scale);
  }

  // ---------------------------------------------------------------------------
  // Full scene: sky, ground, then every object from far to near.
  // opts: { gen, seal, acc, dist }
  // ---------------------------------------------------------------------------
  function drawScene(g, t, opts) {
    const { gen, seal, acc } = opts;
    setDistance(opts.dist || 0);
    drawSky(t);
    drawGround(t);

    const camZ = HH.Proj.camZ;
    const near = camZ + 0.6, farZ = camZ + 60;
    const draw = [];
    if (gen) {
      for (const d of gen.decor) {
        if (d.z <= near) continue;
        if (d.z >= camZ + 32) break;                        // far scenery would just be noise
        draw.push({ z: d.z, fn: () => drawDecor(g, d, t) });
      }
      for (const it of gen.items) {
        if (it.z <= near || it.taken) continue;
        if (it.z >= farZ) break;
        draw.push({ z: it.z, fn: () => HH.Entities.drawItem(g, it, t) });
      }
    }
    let sealInfo = null;
    if (seal) draw.push({ z: seal.z, fn: () => { sealInfo = drawSeal(g, seal, acc); } });

    draw.sort((a, b) => b.z - a.z);
    for (const d of draw) d.fn();
    return sealInfo;
  }

  // Tint the chunky sprite layer to match the light (warm at sunset, blue at
  // night). 'source-atop' paints only over pixels that are already there,
  // so empty areas stay see-through.
  function tintSprites(g) {
    if (theme.tintA < 0.01) return;
    const c = theme.tintRgb;
    g.save();
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${theme.tintA.toFixed(3)})`;
    g.fillRect(0, 0, V.W, V.H);
    g.restore();
  }

  return { init, drawScene, drawSeal, drawSealAt, tintSprites, setDistance, get theme() { return theme; } };
})();
