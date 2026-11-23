// entities.js
// Obstacles and food: their sizes, how they collide with the seal,
// and how they are drawn in perspective.

HH.Entities = (function () {
  const P = HH.PAL;

  // Collision sizes in world units.
  //   hw = half width (sideways), hd = half depth (forward), h = height
  // Notice the seal's own hitbox is a bit SMALLER than its drawing:
  // near misses feel lucky instead of unfair.
  const SIZE = {
    rock:    { hw: 0.11, hd: 0.10, h: 0.12 },
    boulder: { hw: 0.15, hd: 0.14, h: 0.46 },   // steer around (only a max-rhythm hop clears it)
    log:     { hw: 1.3,  hd: 0.07, h: 0.12 },   // a hop that only just clears it still counts
    kelp:    { hw: 0.2,  hd: 0.2,  h: 0.04 },   // only slows you if you're on the sand
    crab:    { hw: 0.12, hd: 0.10, h: 0.13 },   // scuttles sideways; hop it or dodge it
  };
  const SEAL_HW = 0.1, SEAL_HD = 0.09;

  // What each treat is worth in the fish bucket (the shop currency).
  // Rarer treats are worth more, so chasing them is worth the risk.
  const VALUE = { fish: 1, shrimp: 2, squid: 5, gold: 20, glass: 3, pearl: 2 };
  const REACH = 0.34;           // how far above its belly the seal can grab food


  // Moving obstacles: crabs swing side to side across the path.
  // `cx` is where an item is right now (most things never move).
  function update(items, t) {
    for (const it of items) {
      if (it.kind === 'crab') it.cx = it.x + it.swing * Math.sin(t * it.rate + it.phase);
    }
  }
  const xOf = (it) => (it.cx !== undefined ? it.cx : it.x);

  // ---------------------------------------------------------------------------
  // Letter bubbles: one shared shape for drawing AND catching, so what you
  // see is exactly what counts.
  // ---------------------------------------------------------------------------
  // The bubble's radius in screen pixels, given the pixels per world unit `s`
  // at its distance: it fills most of its lane, within a readable size range.
  const bubblePx = (s) => Math.round(Math.min(26, Math.max(9, 0.75 * s * 0.88))) / 2;
  // The seal's body, measured from its sprite: about 0.33 units wide and
  // 0.31 tall, sitting on its belly. Treated as an oval.
  const BODY_HW = 0.16, BODY_HH = 0.155;
  // How deep the seal must press into the bubble before it counts, so a
  // one-pixel graze along the edge does not pick a letter by accident.
  const BUBBLE_INSET = 0.03;

  // Boss rounds hold whole WORDS, so their bubbles are pills: as tall as a
  // letter bubble and as wide as the word. Half-width in screen pixels.
  // Big letters when the pill still fits inside its lane, small ones when not.
  const pillScale = (word, s) => (bubblePx(s) * 2 >= 16 && HH.Font.width(word, 2) + 8 <= 0.75 * s * 0.92 ? 2 : 1);
  function pillHalf(word, s) {
    return (HH.Font.width(word, pillScale(word, s)) + 8) / 2;
  }

  function touchesBubble(it, seal, dx) {
    const s = HH.View.F / HH.View.CAM_BACK;              // pixels per unit at the seal's distance
    const R = bubblePx(s) / s;                            // bubble radius in world units
    const Rx = it.word ? pillHalf(it.word, s) / s : R;    // a word pill is wider than it is tall
    const belly = seal.y - (seal.floor || 0);
    const dy = (it.e + R) - (belly + BODY_HH);            // bubble centre vs body centre, upward
    // oval-meets-circle test: grow the body oval by the bubble's size
    const ax = BODY_HW + Rx - BUBBLE_INSET, ay = BODY_HH + R - BUBBLE_INSET;
    return (dx / ax) ** 2 + (dy / ay) ** 2 < 1;
  }

  // ---------------------------------------------------------------------------
  // Collisions. Returns a list of events for the game to react to.
  //
  // `forgive` runs from 1 (start of a run) to 0 (far along). While it is high,
  // the seal's hitbox is smaller and obstacles count as a little lower, so
  // early near-misses go your way. Survival gets tighter as you travel.
  // ---------------------------------------------------------------------------
  function collide(items, seal, forgive = 0) {
    const events = [];
    const hw = SEAL_HW - 0.035 * forgive, hd = SEAL_HD - 0.03 * forgive, lower = 0.03 * forgive;

    for (const it of items) {
      if (it.z < seal.z - 1.2) {
        // food that slipped past breaks the combo (optional treats don't)
        if (it.type === 'food' && !it.taken && !it.missed) {
          it.missed = true;
          if (it.kind === 'fish' || it.kind === 'shrimp') events.push({ type: 'miss', it });
        }
        continue;
      }
      if (it.z > seal.z + 1.2) break;          // items are sorted by z
      if (it.taken || it.hit || it.type === 'slot') continue;

      const dz = Math.abs(it.z - seal.z);
      const dx = Math.abs(xOf(it) - seal.x);

      // Word Mode letter bubbles: you catch one when the seal's body TOUCHES
      // the bubble as it is drawn on screen, whether you scoot or hop into it.
      // (The old rule used a fixed height window, so a hop that visibly went
      // through a bubble could miss it, and a seal beside a bubble could grab it.)
      if (it.type === 'letter') {
        if (dz < 0.22 && touchesBubble(it, seal, dx)) {
          it.taken = true;
          events.push({ type: 'letter', it });
        }
        continue;
      }

      if (it.type === 'food') {
        // Food is caught by the seal's body, which spans from its belly
        // (height y) up to the top of its head (about y + 0.3).
        // Ground food (e = 0.2) is in reach while scooting. High food
        // (e = 0.5) floats above the head, so you must hop to reach it.
        const rel = it.e - (seal.y - (seal.floor || 0));
        if (dz < 0.32 && dx < 0.2 && rel > -0.06 && rel < REACH) {
          it.taken = true;
          events.push({ type: 'eat', it });
        }
        continue;
      }

      const s = SIZE[it.kind];
      if (dz < s.hd + hd && dx < s.hw + hw) {
        if (it.kind === 'kelp') {
          if (seal.state !== 'air' && seal.y < 0.05) {
            seal.inKelp = 0.35;
            if (!it.touched) { it.touched = true; events.push({ type: 'kelp', it }); }
          }
          continue;
        }
        if (seal.invuln > 0) continue;
        if (seal.y < s.h - lower) {
          it.hit = true;
          events.push({ type: 'bonk', it });
        }
      }
    }
    return events;
  }

  // Where to push the seal so it slides around a boulder instead of through it.
  function pushOut(it, seal) {
    const s = SIZE.boulder;
    let dir = Math.sign(seal.x - it.x) || 1;
    let px = it.x + dir * (s.hw + SEAL_HW + 0.04);
    if (Math.abs(px) > 0.99) { dir = -dir; px = it.x + dir * (s.hw + SEAL_HW + 0.04); }
    return Math.max(-0.99, Math.min(0.99, px));
  }

  // ---------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------
  // Draw a sprite standing at world (x, z, height h), scaled for its distance.
  // `mul` makes a sprite bigger than its native size.
  function drawAt(g, cv, wx, z, h, mul = 1, shadow = 0) {
    const p = HH.Proj.project(wx, z, h);
    if (!p) return null;
    const k = HH.Proj.spriteScale(p.dz) * mul;
    const w = Math.round(cv.width * k), hh = Math.round(cv.height * k);
    if (w < 1 || hh < 1) return null;
    if (shadow) {
      const gp = HH.Proj.project(wx, z, 0);
      pixelEllipse(g, gp.x, gp.y, w * 0.45 * shadow, Math.max(1, w * 0.1 * shadow), P.shadow);
    }
    g.drawImage(cv, Math.round(p.x - w / 2), Math.round(p.y - hh), w, hh);
    return p;
  }

  // An ellipse made of whole-pixel rows, so shadows stay crisp.
  function pixelEllipse(g, cx, cy, rx, ry, color) {
    g.fillStyle = color;
    const r = Math.max(1, Math.round(ry));
    for (let j = -r; j <= r; j++) {
      const t = j / (r + 0.5);
      const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - t * t)));
      if (half > 0) g.fillRect(Math.round(cx - half), Math.round(cy + j), half * 2, 1);
    }
  }

  function spriteFor(it, t) {
    const S = HH.Sprites;
    switch (it.kind) {
      case 'fish': return S.fish();
      case 'shrimp': return S.shrimp();
      case 'squid': return S.squid();
      case 'gold': return S.goldFish();
      case 'rock': return S.rock(it.seed || 3, 26, 16);
      case 'boulder': return S.rock((it.seed || 5) + 40, 34, 46);
      case 'log': return S.log(266, 18);
      case 'kelp': return S.kelp(Math.floor(t * 2.5 + it.z) % 2);
      case 'crab': return S.crab(Math.floor(t * 8 + it.phase) % 2);
      case 'glass': return S.seaGlass();
      case 'pearl': return S.pearl(Math.floor(t * 1.5 + it.z) % 3 === 0 ? 1 : 0);
    }
  }

  // A Word Mode letter bubble. It is drawn at a size that fits its lane on
  // screen (instead of shrinking like a sprite), so letters stay readable far
  // ahead: small bubbles hold the small 3x5 letter, close ones the big one.
  function drawLetter(g, it, t) {
    const pathX = HH.Level.pathX(it.z);
    const bob = Math.sin(t * 3 + it.z * 1.7 + it.x * 3) * 0.02;
    const p = HH.Proj.project(pathX + it.x, it.z, it.e + bob);
    if (!p) return;
    const pop = it.popT !== undefined ? Math.max(0, 1 - (t - it.popT) * 4) : 0;
    const size = Math.round(bubblePx(p.s) * 2 * (1 + pop * 0.3));       // same size the catch test uses
    const r = size / 2, cx = Math.round(p.x), cy = Math.round(p.y - r);
    const gp = HH.Proj.project(pathX + it.x, it.z, 0);
    pixelEllipse(g, gp.x, gp.y, r * 0.7, Math.max(1, r * 0.18), P.shadow);    // shadow on the sand
    if (it.word) { drawPill(g, it, cx, cy, r, p.s, pop); return; }           // boss rounds: a word pill
    pixelEllipse(g, cx, cy, r, r, P.outline);
    pixelEllipse(g, cx, cy, r - 1, r - 1, '#8fd9ea');                         // the bubble's rim
    pixelEllipse(g, cx + (size > 14 ? 1 : 0), cy + (size > 14 ? 1 : 0), r - 2, r - 2, '#f4fdff');
    g.fillStyle = P.white;
    g.fillRect(Math.round(cx - r * 0.55), Math.round(cy - r * 0.6), Math.max(1, Math.round(r * 0.3)), 1);   // shine
    const big = size >= 16;
    HH.Font.draw(g, it.ch, cx + (big ? 0 : 1), cy - (big ? 5 : 2), { align: 'center', scale: big ? 2 : 1, color: P.outline });
  }

  // A boss-round word pill, drawn over the round bubble's spot (same height,
  // same shadow), so it catches exactly where it looks like it should.
  function drawPill(g, it, cx, cy, r, s, pop) {
    const sc = pillScale(it.word, s);
    const room = 0.75 * s * 0.92;                         // the lane's width on screen here
    // far away the lanes are too narrow for a word: show a plain bubble until it can be read
    if (HH.Font.width(it.word, 1) + 6 > room) {
      pixelEllipse(g, cx, cy, r, r, P.outline);
      pixelEllipse(g, cx, cy, r - 1, r - 1, '#8fd9ea');
      pixelEllipse(g, cx, cy, r - 2, r - 2, '#f4fdff');
      return;
    }
    const hw = Math.round(Math.min(pillHalf(it.word, s), room / 2) * (1 + pop * 0.3));
    const h = sc === 2 ? Math.round(r * 2) : Math.min(Math.round(r * 2), 11);
    const x = cx - hw, y = cy - Math.round(h / 2);
    const rr = (x0, y0, w, hh, c) => {                    // a rounded box with 2px corners
      g.fillStyle = c;
      g.fillRect(x0 + 2, y0, w - 4, hh); g.fillRect(x0, y0 + 2, w, hh - 4); g.fillRect(x0 + 1, y0 + 1, w - 2, hh - 2);
    };
    rr(x, y, hw * 2, h, P.outline);
    rr(x + 1, y + 1, hw * 2 - 2, h - 2, '#8fd9ea');                        // the rim
    rr(x + 2, y + 2, hw * 2 - 4, h - 4, '#f4fdff');
    g.fillStyle = P.white; g.fillRect(x + 4, y + 2, Math.max(2, Math.round(hw * 0.4)), 1);   // shine
    HH.Font.draw(g, it.word, cx + (sc === 2 ? 0 : 1), cy - (sc === 2 ? 5 : 2), { align: 'center', scale: sc, color: P.outline });
  }

  function drawItem(g, it, t) {
    if (it.taken || it.type === 'slot') return;
    if (it.type === 'letter') { drawLetter(g, it, t); return; }
    const wx = HH.Level.pathX(it.z) + xOf(it);
    const cv = spriteFor(it, t);
    if (it.type === 'food') {
      // food bobs gently and casts a little shadow
      const bob = Math.sin(t * 3 + it.z * 1.7) * 0.02;
      const big = { gold: 1.4, squid: 1.2, glass: 1.3, pearl: 1.3 }[it.kind] || 1;   // rare treats stand out
      const p = drawAt(g, cv, wx, it.z, it.e - 0.05 + bob, big, 0.55);
      // the golden fish twinkles so players notice it from far away
      // rare treats twinkle so players notice them from far away
      if (p && (it.kind === 'gold' || it.kind === 'glass') && Math.floor(t * 4) % 2) {
        g.fillStyle = it.kind === 'gold' ? P.goldL : P.white;
        const k = HH.Proj.spriteScale(p.dz);
        g.fillRect(Math.round(p.x + 6 * k), Math.round(p.y - 10 * k), 1, 1);
        g.fillRect(Math.round(p.x - 7 * k), Math.round(p.y - 2 * k), 1, 1);
      }
    } else if (it.kind === 'kelp') {
      drawAt(g, cv, wx, it.z, 0.0, 1);
    } else if (it.kind === 'crab') {
      drawAt(g, cv, wx, it.z, 0, 2, 0.8);
    } else {
      drawAt(g, cv, wx, it.z, 0, 1, it.kind === 'log' ? 0 : 0.8);
    }
  }

  return { update, collide, pushOut, drawItem, drawAt, pixelEllipse, SIZE, VALUE };
})();
