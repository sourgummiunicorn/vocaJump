// sprites.js
// All art is ORIGINAL pixel art made in code. There are no image files.
//
// Two techniques:
//   1. Hand-made grids: little ASCII drawings where each letter is a colour.
//   2. Procedural pixels: we "paint" ellipses one pixel at a time into a grid,
//      then add a 1px outline. Because we work on whole pixels, the result is
//      real pixel art, not a blurry vector drawing.
//
// Every sprite is drawn once into a small offscreen canvas and cached.

(function () {
  const P = HH.PAL;

  // ---------------------------------------------------------------------------
  // A tiny pixel grid we can paint into.
  // ---------------------------------------------------------------------------
  class Raster {
    constructor(w, h) {
      this.w = w; this.h = h;
      this.px = new Array(w * h).fill(null);
    }
    set(x, y, c) {
      x = Math.floor(x); y = Math.floor(y);
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
      this.px[y * this.w + x] = c;
    }
    get(x, y) {
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
      return this.px[y * this.w + x];
    }
    // Fill an ellipse. `c` is a colour or a function (x, y, nx, ny) -> colour,
    // where nx, ny run from -1 to 1 across the ellipse. Returning null skips.
    ellipse(cx, cy, rx, ry, c) {
      const x0 = Math.floor(cx - rx - 1), x1 = Math.ceil(cx + rx + 1);
      const y0 = Math.floor(cy - ry - 1), y1 = Math.ceil(cy + ry + 1);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
          if (nx * nx + ny * ny <= 1) {
            const col = typeof c === 'function' ? c(x, y, nx, ny) : c;
            if (col) this.set(x, y, col);
          }
        }
      }
    }
    // Fill an ellipse that overlaps other parts, and give it a 1px line only
    // where it meets those parts. Its outer edge is left for outline(),
    // so the line stays one pixel thick everywhere, just like the body.
    blob(cx, cy, rx, ry, c) {
      const mask = new Set();
      this.ellipse(cx, cy, rx, ry, (x, y) => { mask.add(y * this.w + x); return null; });
      const before = this.px.slice();
      for (const i of mask) {
        const x = i % this.w, y = (i - x) / this.w;
        const col = typeof c === 'function' ? c(x, y, (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry) : c;
        this.px[i] = col;
      }
      for (const i of mask) {
        const x = i % this.w, y = (i - x) / this.w;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
          const j = ny * this.w + nx;
          if (!mask.has(j) && before[j]) { this.px[i] = P.outline; break; }
        }
      }
    }
    // Like blob(), for any polygon: pts = [[x, y], ...] (pixel centres inside
    // are filled). A 1px line is drawn only where it meets other parts.
    polyBlob(pts, c) {
      const inside = (px, py) => {
        let hit = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i], [xj, yj] = pts[j];
          if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
        }
        return hit;
      };
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const mask = new Set();
      for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++)
        for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++)
          if (x >= 0 && y >= 0 && x < this.w && y < this.h && inside(x + 0.5, y + 0.5)) mask.add(y * this.w + x);
      const before = this.px.slice();
      for (const i of mask) { const x = i % this.w, y = (i - x) / this.w; this.px[i] = typeof c === 'function' ? c(x, y) : c; }
      for (const i of mask) {
        const x = i % this.w, y = (i - x) / this.w;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
          const j = ny * this.w + nx;
          if (!mask.has(j) && before[j]) { this.px[i] = P.outline; break; }
        }
      }
    }
    // Stamp a little pixel drawing: rows of characters, each mapped to a colour
    // by `colors` ('.' = empty). Like blob(), it gets a 1px line only where it
    // overlaps other parts; outline() draws the outer edge later.
    // `mirror` flips it left-to-right; `behind` only fills empty pixels
    // (for parts that peek out from behind the body).
    stamp(rows, x0, y0, colors, mirror, behind) {
      const mask = new Map();
      rows.forEach((row, j) => {
        for (let i = 0; i < row.length; i++) {
          const ch = row[mirror ? row.length - 1 - i : i];
          if (ch === '.' || !colors[ch]) continue;
          const x = Math.round(x0) + i, y = Math.round(y0) + j;
          if (x >= 0 && y >= 0 && x < this.w && y < this.h && !(behind && this.px[y * this.w + x])) mask.set(y * this.w + x, colors[ch]);
        }
      });
      // the line goes on the parts BEHIND it, so thin points (toes) stay whole
      for (const [i, c] of mask) this.px[i] = c;
      for (const [i] of mask) {
        const x = i % this.w, y = (i - x) / this.w;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
          const j = ny * this.w + nx;
          if (!mask.has(j) && this.px[j]) this.px[j] = P.outline;
        }
      }
    }
    rect(x, y, w, h, c) {
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
    }
    // Add a 1px outline around everything that is filled.
    outline(color) {
      const src = this.px.slice();
      const at = (x, y) => (x < 0 || y < 0 || x >= this.w || y >= this.h) ? null : src[y * this.w + x];
      for (let y = 0; y < this.h; y++) {
        for (let x = 0; x < this.w; x++) {
          if (src[y * this.w + x]) continue;
          if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) this.set(x, y, color);
        }
      }
    }
    toCanvas() {
      const cv = document.createElement('canvas');
      cv.width = this.w; cv.height = this.h;
      const g = cv.getContext('2d');
      for (let y = 0; y < this.h; y++) {
        for (let x = 0; x < this.w; x++) {
          const c = this.px[y * this.w + x];
          if (c) { g.fillStyle = c; g.fillRect(x, y, 1, 1); }
        }
      }
      return cv;
    }
  }
  HH.Raster = Raster;

  // Turn an ASCII drawing into a canvas. '.' means transparent.
  function fromGrid(rows, map) {
    const r = new Raster(rows[0].length, rows.length);
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch !== '.' && map[ch]) r.set(x, y, map[ch]);
      }
    });
    return r.toCanvas();
  }

  // Small seeded random so procedural rocks look the same every time.
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  HH.rng = rng;

  const cache = new Map();
  function cached(key, make) {
    if (!cache.has(key)) cache.set(key, make());
    return cache.get(key);
  }

  // ===========================================================================
  // THE SEAL
  // ===========================================================================
  // We see the seal from slightly behind and above, glancing back at us.
  // Parts, from back to front:
  //   rear flippers (a little fan toward the camera)
  //   big belly (pale, bulging out past the sides)
  //   spotted back
  //   tiny front flippers
  //   round head with the face
  //
  // Options (all optional):
  //   sx, sy  squash and stretch (1 = normal; landing is sx>1, sy<1)
  //   flip    'tuck' | 'spread' | 'up' | 'paddleL' | 'paddleR'
  //   face    'open' | 'blink' | 'happy' | 'sleepy' | 'surprised' | 'sing'
  //   look    -1, 0, 1  (head turned left / centre / right)
  //   acc     accessory: 'none' | 'bow' | 'flower' | 'hat' | 'crown'
  //   view    'back'  = gameplay: we ride behind the seal and see its tail fan.
  //                     It glances back over its shoulder when something happens.
  //           'front' = menus and the belly flop: the seal faces us.
  //
  // Returns { canvas, ax, ay } where (ax, ay) is the spot that touches the sand.
  function seal(o = {}) {
    const sx = o.sx || 1, sy = o.sy || 1;
    const flip = o.flip || 'tuck';
    const face = o.face || 'open';
    const look = o.look || 0;
    const acc = o.acc || 'none';
    const view = o.view || 'front';
    const sway = view === 'back' ? (o.sway || 0) : 0;   // tail wag, in pixels (-4..4)
    const key = `seal|${sx.toFixed(2)}|${sy.toFixed(2)}|${flip}|${face}|${look}|${acc}|${view}|${sway}|${HH.TAIL_STYLE || 'fan'}`;
    return cached(key, () => view === 'back'
      ? buildSealBack(sx, sy, flip, face, look, acc, sway)
      : buildSeal(sx, sy, flip, face, look, acc));
  }

  // Shared by both views: the dumpling body, its spots and the tiny front flippers.
  function sealBody(r, cx, G, sx, sy, flip) {
    const rx = 14.2 * sx;
    const ry = 9.6 * sy;
    const cy = G - 1 - ry;                 // belly sits on the sand

    // Where the body is squished against the sand, the pale silvery belly
    // bulges out at the lower sides.
    const icy = cy - ry * 0.2, irx = rx * 0.87, iry = ry * 0.9;
    r.ellipse(cx, cy, rx, ry, (x, y, nx, ny) => {
      const bx = (x + 0.5 - cx) / irx, by = (y + 0.5 - icy) / iry;
      const onBack = bx * bx + by * by <= 1;
      if (!onBack && ny > -0.15) return ny > 0.78 ? P.bellyShade : P.belly;
      if ((nx + 0.45) ** 2 + (ny + 0.55) ** 2 < 0.05) return P.sealLight;   // sunny shine
      return P.seal;
    });
    const blob = (x, y, big) => {
      const pts = big ? [[0, 0], [1, 0], [0, 1], [1, 1]] : [[0, 0], [1, 0]];
      for (const [dx, dy] of pts) {
        const px = Math.round(cx + x * sx) + dx, py = Math.round(cy + y * sy) + dy;
        if (r.get(px, py) === P.seal) r.set(px, py, P.spot);
      }
    };
    blob(-9, -2, true); blob(7, -5, false); blob(9, 1, true); blob(-5, 3, false);
    blob(3, 3, true); blob(-11, 3, false); blob(-2, 6, false); blob(6, 6, false);

    const fl = (side) => {
      let mode = flip;
      if (flip === 'paddleL') mode = side < 0 ? 'fwd' : 'tuck';
      if (flip === 'paddleR') mode = side > 0 ? 'fwd' : 'tuck';
      let fx, fyy, frx, fry;
      if (mode === 'spread') { fx = cx + side * (rx + 1.4); fyy = cy - ry * 0.15; frx = 3.6; fry = 1.6; }
      else if (mode === 'up') { fx = cx + side * (rx + 0.2); fyy = cy - ry * 0.65; frx = 2.0; fry = 2.8; }
      else if (mode === 'fwd') { fx = cx + side * (rx - 0.4); fyy = cy - ry * 0.2; frx = 2.6; fry = 2.2; }
      else { fx = cx + side * (rx - 0.8); fyy = cy + ry * 0.25; frx = 2.6; fry = 1.9; }
      r.ellipse(fx, fyy, frx, fry, P.sealDark);
    };
    fl(-1); fl(1);
    return { rx, ry, cy };
  }

  // Accessories are drawn onto the head before the outline pass, so they get
  // the same crisp navy outline as the seal. `top` is the top row of the head;
  // o = { hrx, hry, hy, view } gives the head's size, centre and which way we see it.
  // Each look is a few rectangles and ellipses: easy to read, easy to remix.
  function accessory(r, acc, hx, top, o = {}) {
    const hrx = o.hrx || 9, hry = o.hry || 8, hy = o.hy || top + 8, front = o.view !== 'back';
    const X = Math.round(hx);
    if (acc in EXTRA) { EXTRA[acc](r, X, top, hrx, hry, Math.round(hy), front); return; }
    if (acc === 'bow') {
      const bx = Math.round(hx + 3), by = top + 1;
      r.rect(bx - 2, by - 1, 2, 3, P.coral); r.rect(bx + 1, by - 1, 2, 3, P.coral);
      r.set(bx, by, P.coralD); r.set(bx - 2, by - 1, P.blush); r.set(bx + 2, by - 1, P.blush);
    } else if (acc === 'flower') {
      // a big five-petal flower tucked behind the ear, with a little leaf
      const fx = hx - 5, fy2 = top + 2;
      r.ellipse(fx + 3.2, fy2 + 3.4, 2.2, 1.2, P.grass);                       // leaf
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
        // each petal: pale tip, darker base, so the five petals read separately
        r.ellipse(fx + Math.cos(a) * 3, fy2 + Math.sin(a) * 3, 1.8, 1.8,
          (x, y, nx, ny) => nx * Math.cos(a) + ny * Math.sin(a) > 0.2 ? '#e6dcf7' : P.lavender);
        r.set(Math.round(fx + Math.cos(a + 0.63) * 2.6 - 0.5), Math.round(fy2 + Math.sin(a + 0.63) * 2.6 - 0.5), P.lavenderD);
      }
      r.ellipse(fx, fy2, 1.6, 1.6, (x, y, nx, ny) => nx + ny < -0.4 ? '#fff2b0' : P.gold);   // sunny centre
    } else if (acc === 'hat') {
      r.ellipse(hx, top + 1.2, 11.5, 2.2, (x, y, nx, ny) => ny < -0.2 ? '#f9de8f' : '#e9be62');
      r.ellipse(hx, top - 1.6, 6.2, 3.6, (x, y, nx, ny) => ny > 0.25 ? P.coral : '#f9de8f');
    } else if (acc === 'crown') {
      for (let i = -3; i <= 3; i++) {
        const x = Math.round(hx) + i * 2 - 1;
        const h = (i % 2 === 0) ? 3 : 2;
        for (let j = 0; j < h; j++) r.set(x, top + 1 - j, j === h - 1 ? P.seafoam : P.kelpL);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // The shop's extra looks. Each function gets (r, x centre, head top row,
  // head radius x, head radius y, head centre row, front view?).
  // ---------------------------------------------------------------------------
  const EXTRA = {
    // Professor Seal's mortarboard (Word Mode teacher only, not in the shop):
    // a flat square board, a snug cap, and a gold tassel hanging off one corner
    professor(r, x, top) {
      r.rect(x - 5, top - 1, 10, 3, P.eye);                   // cap
      r.rect(x - 9, top - 3, 18, 2, '#3b3f63');               // the flat board
      r.rect(x - 8, top - 4, 16, 1, '#4a4b72');               // its sunny top edge
      r.set(x, top - 4, P.gold);                              // button
      r.rect(x + 1, top - 4, 7, 1, P.gold);                   // tassel cord
      r.rect(x + 8, top - 4, 1, 5, P.gold);
      r.rect(x + 7, top + 1, 3, 2, P.goldD);                  // tassel end
    },

    // a tiny striped knit scarf around the neck, one end hanging down
    scarf(r, x, top, hrx, hry, hy, front) {
      const y0 = Math.round(hy + hry - 1.5), w = Math.round(hrx * 2) - 2;
      for (let i = 0; i < w; i++) {
        const c = Math.floor(i / 2) % 2 ? P.white : P.coral;
        r.rect(x - Math.floor(w / 2) + i, y0, 1, 3, c);
      }
      const tx = x + (front ? 4 : -5);
      for (let j = 0; j < 5; j++) r.rect(tx, y0 + 2 + j, 3, 1, j % 2 ? P.white : P.coral);
      r.set(tx, y0 + 7, P.coralD); r.set(tx + 2, y0 + 7, P.coralD);       // fringe
    },

    // a dapper little top hat with a coral band
    tophat(r, x, top) {
      r.rect(x - 6, top, 12, 1, P.eye);                       // brim
      r.rect(x - 4, top - 7, 8, 7, P.eye);                    // crown
      r.rect(x - 4, top - 2, 8, 1, P.coral);                  // band
      r.rect(x - 3, top - 6, 1, 3, '#4a4b72');                // shine
    },

    // chunky headphones: a band over the head and round ear cups
    headphones(r, x, top, hrx, hry, hy) {
      for (let i = -Math.round(hrx); i <= Math.round(hrx); i++) {
        const t = i / (hrx + 0.5);
        r.set(x + i, Math.round(top + 1 - Math.sqrt(Math.max(0, 1 - t * t)) * 2), '#3b3f63');
      }
      for (const sd of [-1, 1]) {
        const cx = x + sd * Math.round(hrx) - (sd > 0 ? 1 : 1);
        r.rect(cx - 1, hy - 3, 3, 6, P.teal);
        r.rect(cx - 1, hy - 3, 3, 1, P.seafoam);
        r.rect(cx + (sd > 0 ? 1 : -1), hy - 2, 1, 4, '#3b3f63');
      }
    },

    // a frog hat: a green cap with big googly frog eyes on top
    frog(r, x, top, hrx, hry, hy, front) {
      r.ellipse(x, top + 3, hrx * 0.95, 4.2, (px, py, nx, ny) => ny > 0.35 ? null : ny < -0.4 ? '#9ad77c' : P.grass);
      for (const sd of [-1, 1]) {
        r.ellipse(x + sd * 4, top - 1, 2.6, 2.6, P.grass);
        r.ellipse(x + sd * 4, top - 1.3, 1.7, 1.7, P.white);
        if (front) r.set(x + sd * 4 - (sd < 0 ? 1 : 0), top - 1, P.eye);
      }
      if (front) { r.set(x - 1, top + 3, P.blush); r.set(x, top + 3, P.blush); }   // a tiny frog smile blush
    },

    // a black pirate hat with gold trim and a little skull
    pirate(r, x, top) {
      const rows = [[18, 1], [16, 0], [14, -1], [12, -2], [12, -3], [10, -4], [6, -5]];
      for (const [w, dy] of rows) r.rect(x - w / 2, top + dy, w, 1, P.eye);
      r.set(x - 9, top - 1, P.eye); r.set(x + 8, top - 1, P.eye);          // curled-up corners
      r.set(x - 9, top - 2, P.eye); r.set(x + 8, top - 2, P.eye);
      r.rect(x - 9, top + 1, 18, 1, P.gold);                               // gold trim
      r.rect(x - 1, top - 4, 3, 2, P.white);                               // skull
      r.set(x - 1, top - 2, P.white); r.set(x + 1, top - 2, P.white);
      r.set(x - 1, top - 3, P.eye); r.set(x + 1, top - 3, P.eye);
    },

    // a red toadstool cap with white spots
    mushroom(r, x, top) {
      r.ellipse(x, top + 1, 11, 6, (px, py, nx, ny) => ny > 0.2 ? null : ny < -0.6 ? '#f0726a' : '#e0524a');
      r.rect(x - 9, top + 1, 18, 1, '#f6e3c8');                            // the soft underside
      for (const [dx, dy] of [[-6, -1], [-1, -4], [4, -2], [7, 0], [-3, 0]]) {
        r.rect(x + dx, top + dy, 2, 2, P.white);
      }
    },

    // a salmon nigiri balanced on the head
    sushi(r, x, top) {
      r.rect(x - 6, top - 2, 12, 3, '#fbfbf2');                            // rice
      r.set(x - 4, top - 1, '#e6e3d6'); r.set(x + 2, top, '#e6e3d6'); r.set(x + 4, top - 2, '#e6e3d6');
      r.rect(x - 7, top - 5, 14, 3, '#f6955e');                            // salmon
      for (let i = -6; i < 7; i += 3) r.set(x + i, top - 4, '#ffd2b8');    // fatty stripes
      r.rect(x - 1, top - 5, 2, 6, '#2f4a3a');                             // nori band
    },

    // a shark hoodie: a fin on top and a toothy hood around the face
    shark(r, x, top, hrx, hry, hy, front) {
      const hood = '#5f86c0', hoodD = '#4a6ea6', belly = '#eef4fa';
      const fy = Math.round(hy + 1), orx = hrx - 3.2, ory = hry - 2.8;
      r.ellipse(x, hy + 0.5, hrx + 1.3, hry + 1.2, (px, py, nx, ny) => {
        if (front) {
          const ox = (px + 0.5 - x) / orx, oy = (py + 0.5 - fy) / ory;
          if (ox * ox + oy * oy <= 1) return null;                         // the face opening
        }
        if (!front && ny > 0.55) return belly;                             // white shark belly at the back
        return ny > 0.45 ? hoodD : hood;
      });
      if (front) {
        const ty = Math.round(fy - ory) + 1;                               // teeth along the top of the opening
        for (let i = -4; i <= 4; i += 2) r.set(x + i, ty, P.white);
      }
      for (let j = 0; j < 6; j++) r.rect(x - 1 + Math.floor(j / 2), top - 6 + j, 6 - j - Math.floor(j / 2), 1, hood);   // fin
    },

    // a tiny UFO hovering over the head, lights blinking
    ufo(r, x, top) {
      r.ellipse(x, top - 6, 4, 3, (px, py, nx, ny) => ny > 0.3 ? null : nx < -0.3 && ny < -0.2 ? P.white : '#a6e6ef');   // glass dome
      r.ellipse(x, top - 3, 10, 2.4, (px, py, nx, ny) => ny < -0.2 ? '#d7dceb' : '#a7aec4');                             // saucer
      for (let i = -7; i <= 7; i += 3.5) r.set(Math.round(x + i), top - 3, Math.round(i) % 2 ? P.gold : P.coral);
      r.set(x - 1, top - 1, '#c9f7f2'); r.set(x + 1, top - 1, '#c9f7f2'); r.set(x, top, '#c9f7f2');              // little beam
    },

    // a stack of fluffy pancakes with butter and syrup
    pancake(r, x, top) {
      for (let k = 0; k < 3; k++) {
        const y = top - k * 2;
        r.ellipse(x, y, 8.5 - k * 0.5, 1.6, (px, py, nx, ny) => ny < -0.1 ? '#f2c071' : '#d9984a');
      }
      r.ellipse(x, top - 5, 7, 1.4, '#7a3b1d');                            // syrup on top
      r.rect(x - 7, top - 4, 1, 4, '#7a3b1d'); r.set(x - 7, top + 1, '#7a3b1d');   // a drip down the side
      r.rect(x - 1, top - 7, 3, 2, '#fff0a6');                             // butter
      r.set(x - 1, top - 7, P.white);
    },
  };
  // the graduation cap the player earns is Professor Seal's mortarboard
  EXTRA.mortarboard = EXTRA.professor;

  // ---------------------------------------------------------------------------
  // BACK VIEW: what the player sees while playing.
  // The stars here are the round spotted back, the back of the head with
  // whiskers poking out, and the little tail fan that wiggles as it scoots.
  // ---------------------------------------------------------------------------
  function buildSealBack(sx, sy, flip, face, look, acc, sway = 0) {
    const W = 48, H = 48, G = 45;
    const r = new Raster(W, H);
    const cx = 24;
    const { ry, cy } = sealBody(r, cx, G - 4, sx, sy, flip);   // lifted a little so the tail shows below

    // --- back of the head: further away from us, so it sits a little higher
    const hrx = 8.6 * (1 + (sx - 1) * 0.35);
    const hry = 7.6 * (1 + (sy - 1) * 0.35);
    const glance = face === 'happy' || face === 'sing' || face === 'surprised';
    const side = look || 1;                              // which shoulder it glances over
    const hx = cx + (glance ? side * 1.6 : look * 1.4);
    const hy = (cy - ry) + hry * 0.18;
    r.ellipse(hx, hy + 1.3, hrx, hry, '#737c99');        // soft shadow where head meets body
    r.ellipse(hx, hy, hrx, hry, (x, y, nx, ny) => {
      if ((nx + 0.35) ** 2 + (ny + 0.55) ** 2 < 0.08) return P.sealLight;
      if (Math.abs(nx + 0.5) < 0.13 && Math.abs(ny + 0.1) < 0.14) return P.spot;
      if (Math.abs(nx - 0.35) < 0.13 && Math.abs(ny + 0.55) < 0.12) return P.spot;
      if (Math.abs(nx - 0.05) < 0.1 && Math.abs(ny - 0.35) < 0.12) return P.spot;
      return P.seal;
    });

    // --- glancing back: one eye, a rosy cheek and the tip of the muzzle peek out
    if (glance) {
      const ex = Math.round(hx + side * (hrx - 4.2)) - (side < 0 ? 1 : 0);
      const ey = Math.round(hy - 0.5);
      if (face === 'surprised') {
        r.rect(ex, ey - 1, 2, 3, P.white); r.set(ex + (side > 0 ? 1 : 0), ey, P.eye);
      } else {
        r.set(ex - 1, ey + 1, P.eye); r.set(ex, ey, P.eye); r.set(ex + 1, ey + 1, P.eye);   // ^ happy eye
      }
      r.set(ex + side * 2, ey + 3, P.blush); r.set(ex + side * 3, ey + 3, P.blush);
      const mx = side > 0 ? Math.ceil(hx + hrx) - 1 : Math.floor(hx - hrx);
      r.set(mx, ey + 3, P.muzzle); r.set(mx, ey + 4, P.muzzle);
      r.set(mx + side, ey + 3, P.muzzle); r.set(mx + side, ey + 4, P.muzzle);
      r.set(mx + side * 2, ey + 3, P.nose);
      if (acc === 'shades') {
        // the lens of the cool sunglasses, seen from the side
        r.rect(ex - 1, ey - 1, 4, 3, P.eye);
        r.rect(ex, ey + 2, 2, 1, P.eye);
        r.set(ex, ey, P.white); r.set(ex + 1, ey - 1, P.white);
      }
    }
    if (acc === 'shades') {
      // from behind we only see the arms of the glasses hugging the head
      const ay = Math.round(hy - 0.5);
      for (let i = 0; i < 3; i++) {
        r.set(Math.floor(hx - hrx) + i, ay, P.eye);
        r.set(Math.ceil(hx + hrx) - 1 - i, ay, P.eye);
      }
    }

    tailBack(r, cx, G, sway, flip, HH.TAIL_STYLE || 'fan');

    accessory(r, acc, hx, Math.round(hy - hry), { hrx, hry, hy, view: 'back' });
    r.outline(P.outline);

    // whiskers poking out from behind the cheeks
    for (const sd of [-1, 1]) {
      const bx = sd < 0 ? Math.floor(hx - hrx) - 2 : Math.ceil(hx + hrx) + 1;
      const wy = Math.round(hy + 2);
      r.set(bx, wy, P.whisker); r.set(bx + sd, wy, P.whisker); r.set(bx + sd * 2, wy - 1, P.whisker);
      r.set(bx, wy + 2, P.whisker); r.set(bx + sd, wy + 3, P.whisker);
    }
    return { canvas: r.toCanvas(), ax: cx, ay: G };
  }

  // ---------------------------------------------------------------------------
  // THE TAIL (back view): the two rear flippers, seen from behind.
  // `sway` wags it left and right; the flippers spread a little more in the air.
  // Styles (HH.TAIL_STYLE):
  //   'round'  the original: two round flippers on the sand
  //   'v'      two pointed flippers flaring UP and out in a "V", toes at the tips
  //   'fan'    flippers pressed together and raised, toes splayed in a pointy fan (in use)
  //   'flick'  flippers along the sand, their pointed tips flicked up at the ends
  // ---------------------------------------------------------------------------
  const TAIL_DARK = '#565e79', TAIL_LIGHT = '#7f88a5', TAIL_EDGE = '#9aa2bd';
  function tailBack(r, cx, G, sway, flip, style) {
    const spread = flip === 'spread' || flip === 'up' ? 1.5 : 0;
    if (style === 'round') {
      r.blob(cx + sway * 0.35, G - 4.4, 2.8, 2.2, P.sealDark);          // stem
      r.blob(cx + sway * 0.7, G - 2.8, 2.3, 1.7, P.sealDark);
      for (const sd of [-1, 1]) {
        const lift = Math.sign(sway) === -sd ? Math.ceil(Math.abs(sway) / 2) : 0;
        const tx = cx + sway + sd * (4.6 + spread), ty = G - 1.4 - lift;
        r.blob(tx, ty, 4.3, 2.7, (x, y, nx, ny) => nx * sd > 0.35 ? TAIL_EDGE : ny < -0.2 ? TAIL_LIGHT : P.sealDark);
        r.set(Math.round(tx + sd * 1.6), Math.round(ty), TAIL_DARK);
        r.set(Math.round(tx + sd * 0.2), Math.round(ty + 1), TAIL_DARK);
        r.set(Math.round(tx - sd * 1.2), Math.round(ty), TAIL_DARK);
      }
      return;
    }
    // Hand-drawn flippers (left one shown; the right one is its mirror image).
    // D = deep shade by the stem, M = flipper, L = light catching the edge.
    const C = { D: '#565e79', M: P.sealDark, L: '#8b94b0' };
    const wag = Math.round(sway * 0.6);
    const lifted = (sd) => (Math.sign(sway) === -sd && sway !== 0 ? 1 : 0);   // the far flipper tips up

    if (style === 'v') {
      // both flippers held UP in a "V" behind the seal, two sharp toes on each tip
      const L = [
        'L.L....',
        'LMLM...',
        'LMMM...',
        '.MMM...',
        '.MMMM..',
        '..MMM..',
        '..MMMM.',
        '...MMM.',
        '...MMMD',
        '....MDD',
        '....DDD',
        '....DDD',
      ];
      r.stamp(L, cx - 7 + wag - Math.round(spread), G - 12 - lifted(-1), C, false);
      r.stamp(L, cx + wag + Math.round(spread), G - 12 - lifted(1), C, true);
      return;
    }

    if (style === 'fan') {
      // the flippers pressed together and raised like a little fan, four sharp toes
      const F = [
        'L..L.L..L',
        'LM.MLM.ML',
        'LMMMDMMML',
        '.MMMDMMM.',
        '.MMMDMMM.',
        '..MMDMM..',
        '..MMDMM..',
        '...MDM...',
        '...DDD...',
        '...DDD...',
        '...DDD...',
        '...DDD...',
      ];
      r.stamp(F, cx - 4 + wag, G - 12, C, false);
      return;
    }

    // 'flick': flippers along the sand, each tip curling up into a sharp point
    const K = [
      'L..............',
      'LL.............',
      'LM.............',
      '.MM............',
      '.LMMMMMMMMDDDDD',
      '..LMMMMMMMDDDDD',
      '....MMMMMDDDDDD',
    ];
    r.stamp(K, cx - 15 + wag - spread, G - 7 - lifted(-1), C, false);
    r.stamp(K, cx + wag + spread, G - 7 - lifted(1), C, true);
  }

  // ---------------------------------------------------------------------------
  // FRONT VIEW: the face, for menus and the end-of-level celebration.
  // ---------------------------------------------------------------------------
  function buildSeal(sx, sy, flip, face, look, acc) {
    const W = 48, H = 48, G = 45;          // G = ground row
    const r = new Raster(W, H);
    const cx = 24;

    const { rx, ry, cy } = sealBody(r, cx, G, sx, sy, flip);

    // --- rear flippers
    const spread = flip === 'spread' || flip === 'up' ? 1 : 0;
    const tail = HH.TAIL_STYLE || 'fan';
    if (tail === 'round') {
      for (const side of [-1, 1]) {
        r.ellipse(cx + side * (3.1 + spread), G - 2.2, 3.0, 2.3, (x, y, nx, ny) => ny < -0.3 ? '#7a83a1' : P.sealDark);
      }
    }
    // (the pointed tail styles are behind the seal when it faces us: hidden)

    // --- head: round, melting into the top of the body, turned to look back at us
    const hrx = 9.2 * (1 + (sx - 1) * 0.35);
    const hry = 8.2 * (1 + (sy - 1) * 0.35);
    const hx = cx + look * 1.8;
    const hy = (cy - ry) + hry * 0.38;
    // a soft shadow under the chin instead of a hard outline: the head blends in
    r.ellipse(hx, hy + 1.3, hrx, hry, '#737c99');
    r.ellipse(hx, hy, hrx, hry, (x, y, nx, ny) => {
      const mx = (x + 0.5 - hx) / 4.6, my = (y + 0.5 - (hy + 3.4)) / 2.9;
      if (mx * mx + my * my <= 1) return P.muzzle;                     // pale muzzle
      if ((nx + 0.35) ** 2 + (ny + 0.6) ** 2 < 0.08) return P.sealLight;
      if (Math.abs(nx + 0.66) < 0.12 && Math.abs(ny + 0.3) < 0.13) return P.spot;
      if (Math.abs(nx - 0.55) < 0.12 && Math.abs(ny + 0.62) < 0.12) return P.spot;
      return P.seal;
    });

    // --- face
    const ey = Math.round(hy - 1.2);
    const eL = Math.round(hx - 5.5), eR = Math.round(hx + 2.5);
    const cL = Math.round(hx) - 1, cR = cL + 1;           // two centre columns

    const eye = (e) => {
      if (face === 'blink') {
        r.rect(e, ey + 1, 3, 1, P.eye);
      } else if (face === 'happy' || face === 'sing') {
        r.set(e, ey + 1, P.eye); r.set(e + 1, ey, P.eye); r.set(e + 2, ey + 1, P.eye);
      } else if (face === 'sleepy') {
        r.set(e, ey + 1, P.eye); r.set(e + 1, ey + 2, P.eye); r.set(e + 2, ey + 1, P.eye);
      } else if (face === 'surprised') {
        r.rect(e, ey - 1, 3, 4, P.white);
        r.set(e + 1, ey, P.eye); r.set(e + 1, ey + 1, P.eye);
        r.set(e, ey - 3, P.outline); r.set(e + 1, ey - 3, P.outline); r.set(e + 2, ey - 3, P.outline);
      } else {
        r.rect(e, ey - 1, 3, 4, P.eye);
        r.set(e, ey - 1, P.white);           // the shine that makes it look alive
        r.set(e + 2, ey + 2, P.eyeGlint);
      }
    };
    eye(eL); eye(eR);

    // blush
    if (face !== 'surprised') {
      r.set(eL - 1, ey + 3, P.blush); r.set(eL, ey + 3, P.blush);
      r.set(eR + 2, ey + 3, P.blush); r.set(eR + 3, ey + 3, P.blush);
    }

    // nose
    r.set(cL, ey + 3, P.nose); r.set(cR, ey + 3, P.nose);
    // mouth
    if (face === 'surprised' || face === 'sing') {
      r.rect(cL, ey + 5, 2, 2, P.coralD);
      r.set(cL, ey + 5, P.nose); r.set(cR, ey + 5, P.nose);
    } else if (face === 'sleepy') {
      r.set(cL, ey + 5, P.mouth); r.set(cR, ey + 5, P.mouth);
    } else {
      r.set(cL - 1, ey + 5, P.mouth); r.set(cR + 1, ey + 5, P.mouth);
      r.set(cL, ey + 6, P.mouth); r.set(cR, ey + 6, P.mouth);
    }

    // --- accessories (unlockable cosmetics)
    accessory(r, acc, hx, Math.round(hy - hry), { hrx, hry, hy, view: 'front' });
    if (acc === 'shades') {
      // The meme sunglasses, traced from the reference picture: one flat top
      // bar, two lenses that step in toward the bottom, white checker glints,
      // and a long arm off to one side that bends down at the tip.
      SHADES.forEach((row, j) => {
        for (let i = 0; i < row.length; i++) {
          if (row[i] === 'X') r.set(eL - 2 + i, ey - 1 + j, P.eye);
          else if (row[i] === 'W') r.set(eL - 2 + i, ey - 1 + j, P.white);
        }
      });
    }

    if (acc === 'professor') {
      // round reading glasses: a ring around each eye and a little bridge
      // thin gold frames, so the friendly eyes still show through
      const ring = (e) => {
        for (let i = 0; i < 3; i++) { r.set(e + i, ey - 2, P.goldD); r.set(e + i, ey + 3, P.goldD); }
        for (let j = 0; j < 4; j++) { r.set(e - 1, ey - 1 + j, P.goldD); r.set(e + 3, ey - 1 + j, P.goldD); }
      };
      ring(eL); ring(eR);
      for (let x = eL + 4; x < eR - 1; x++) r.set(x, ey - 1, P.goldD);
    }

    r.outline(P.outline);

    // whiskers after the outline so they stay delicate
    const wy = ey + 4;
    for (const [dx, dy] of [[-3, 0], [-4, 0], [-5, -1], [-3, 1], [-4, 2]]) r.set(cL + dx, wy + dy, P.whisker);
    for (const [dx, dy] of [[3, 0], [4, 0], [5, -1], [3, 1], [4, 2]]) r.set(cR + dx, wy + dy, P.whisker);

    return { canvas: r.toCanvas(), ax: cx, ay: G };
  }

  // The sunglasses as a tiny pixel grid (X = black, W = glint, . = clear).
  // Left lens, one-pixel bridge, right lens, then the arm and its bent tip.
  const SHADES = [
    'XXXXXXXXXXXXXXXXXXXXX',
    'XWXWWXX.XWXWWXX....XX',
    '.XWXXWX..XWXXWX....XX',
    '..XXXX....XXXX.......',
  ];

  // ===========================================================================
  // FOOD
  // ===========================================================================
  const FISH = [
    '....kkkk.....',
    '..kkhhhhk..kk',
    '.kwhhhhhhkkhk',
    'kehhshhhhhhhk',
    '.kggggggggkgk',
    '..kkggggk..kk',
    '....kkkk.....',
  ];
  const SHRIMP = [
    '.k......k.',
    '..k....k..',
    '..kkkkkk..',
    '.kepppPPk.',
    '.kppppppPk',
    '..kkkppPPk',
    '....kkpPk.',
    '...kpPPk..',
    '...kkkk...',
  ];
  const SQUID = [
    '...kkk...',
    '..kLLLk..',
    '.kLhLLLk.',
    '.kLLLLLk.',
    '.kewLewk.',
    '.kLLLLLk.',
    '..kLLLk..',
    '.kLkLkLk.',
    '.kLkLkLk.',
    'kLk.k.kLk',
    'kk.....kk',
  ];

  // ===========================================================================
  // OBSTACLES (procedural)
  // ===========================================================================
  function rock(seed, w, h) {
    return cached(`rock|${seed}|${w}|${h}`, () => {
      const rand = rng(seed);
      const r = new Raster(w + 2, h + 2);
      const cx = (w + 2) / 2, cy = h + 1, rx = w / 2, ry = h;   // a dome resting on the sand
      const a1 = rand() * 6, a2 = rand() * 6;
      for (let y = 1; y <= h; y++) {
        for (let x = 1; x <= w; x++) {
          const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
          const ang = Math.atan2(ny, nx);
          const rad = 1 + 0.07 * Math.sin(ang * 3 + a1) + 0.05 * Math.sin(ang * 7 + a2);
          if (nx * nx + ny * ny > rad * rad) continue;
          const light = -nx * 0.55 - ny * 0.7 + (rand() - 0.5) * 0.25;
          let c = P.rock;
          if (light > 0.62) c = P.rockL;
          else if (light < 0.0 && ny > -0.25) c = P.rockD;
          if (rand() < 0.05) c = P.rockD;
          r.set(x, y, c);
        }
      }
      // a little seafoam moss on top for charm
      for (let i = 0; i < Math.max(2, w / 6); i++) {
        const x = Math.floor(cx - rx * 0.4 + rand() * rx * 0.8);
        for (let y = 0; y < r.h; y++) if (r.get(x, y)) { r.set(x, y, P.seafoam); break; }
      }
      r.outline(P.outline);
      return r.toCanvas();
    });
  }

  // A driftwood log lying across the path.
  function log(w, h) {
    return cached(`log|${w}|${h}`, () => {
      const r = new Raster(w + 2, h + 2);
      const rand = rng(77);
      const er = h / 2;               // end radius
      for (let y = 1; y <= h; y++) {
        for (let x = 1 + 2; x <= w - 2; x++) {
          const t = (y - 1) / h;
          let c = t < 0.28 ? P.woodL : t > 0.75 ? P.woodD : P.wood;
          if ((x * 7 + y * 3) % 11 === 0 && t > 0.2) c = P.woodD;       // bark grooves
          if (rand() < 0.03) c = P.woodL;
          r.set(x, y, c);
        }
      }
      // cut ends (we see the rings)
      for (const ex of [3, w - 2]) {
        r.ellipse(ex, 1 + er, 3, er, (x, y, nx, ny) => {
          const d = Math.sqrt(nx * nx + ny * ny);
          return d > 0.8 ? P.woodD : (d > 0.45 && d < 0.6) ? P.wood : P.woodEnd;
        });
      }
      // a strand of seaweed draped over it
      for (let i = 0; i < 5; i++) r.set(Math.floor(w * 0.62) + i, 1 + (i % 2), P.kelpL);
      r.set(Math.floor(w * 0.62) + 1, 3, P.kelp);
      r.outline(P.outline);
      return r.toCanvas();
    });
  }

  // A soft, slippery kelp patch lying flat on the sand. Two wiggle frames.
  function kelp(frame) {
    return cached(`kelp|${frame}`, () => {
      const w = 46, h = 13;
      const r = new Raster(w + 2, h + 2);
      r.ellipse((w + 2) / 2, h - 2.5, w / 2, 3.6, (x, y, nx, ny) =>
        ny < -0.3 ? P.kelpL : (x + y) % 5 === 0 ? P.kelpD : P.kelp);
      const fronds = [5, 11, 17, 24, 30, 37, 42];
      fronds.forEach((fx, i) => {
        const len = 3 + (i % 3) * 2;
        for (let j = 0; j < len; j++) {
          const sway = ((frame + i) % 2 === 0 ? 1 : -1) * Math.round(j / 3);
          r.set(fx + sway, h - 3 - j, j > len - 2 ? P.kelpL : P.kelp);
        }
      });
      r.outline(P.kelpD);
      return r.toCanvas();
    });
  }

  // ===========================================================================
  // DECORATIONS
  // ===========================================================================
  const DECOR = {
    shell: ['..kk..', '.kppk.', 'kpPpPk', 'kPpPpk', '.kkkk.'],
    star: ['...k...', '..kok..', 'kkkoOkk', 'kooooOk', '.kOOOk.', '.koKok.', '.k...k.'],
    grass: ['...g....', '.g.g..g.', '.g.gg.g.', '..gGGg..', '.gGGGGg.', 'GGGGGGGG'],
    weed: ['..k..k.', '.kK.kK.', '.kKkK..', '..kKk.k', '.kkKkK.', 'kKKKKKk'],
    pebbles: ['..ab...', '.abbb.a', '..bb.ab'],
    stick: ['kk.......', 'kwwk.....', '.kwwwkk..', '..kkwwwwk', '.....kkk.'],
    flower: ['.l.', 'lol', '.g.', '.g.'],
  };
  const DECOR_MAP = {
    shell: { k: '#c9736c', p: P.blush, P: '#fbd0c8' },
    star: { k: P.orangeD, o: P.orange, O: '#f8c08a', K: P.orangeD },
    grass: { g: P.grass, G: P.grassD },
    weed: { k: P.kelp, K: P.kelpL },
    pebbles: { a: P.rockL, b: P.rock },
    stick: { k: P.woodD, w: P.woodL },
    flower: { l: P.lavender, o: P.gold, g: P.grassD },
  };

  const CRAB = [
    ['k.k...k.k', 'kck...kck', '.kkcckk..', '.kccccck.', 'kcewcewck', '.kccccck.', 'k.k.k.k.k'],
    ['.k.k.k.k.', 'kck...kck', '.kkcckk..', '.kccccck.', 'kcewcewck', '.kccccck.', '.k.k.k.k.'],
  ];
  const BIRD = [
    ['k.....k', '.k...k.', '..kwk..'],
    ['.......', 'kkkwkkk', '.......'],
  ];

  // ===========================================================================
  // DESTINATION: a little lighthouse on an island (always on the horizon)
  // ===========================================================================
  function lighthouse() {
    return cached('lighthouse', () => {
      const r = new Raster(56, 60);
      // island mound
      r.ellipse(28, 58, 27, 9, (x, y, nx, ny) => ny < -0.55 ? P.grass : ny < -0.25 ? P.grassD : (x % 4 === 0 ? P.rockD : P.rock));
      // tower (narrower at the top)
      for (let y = 14; y <= 50; y++) {
        const t = (y - 14) / 36;
        const half = Math.round(4 + t * 3);
        const band = Math.floor((y - 14) / 7) % 2 === 1;
        for (let x = 28 - half; x < 28 + half; x++) {
          let c = band ? P.coral : '#fff8ee';
          if (x === 28 - half) c = band ? P.coralD : '#e8dccf';
          r.set(x, y, c);
        }
      }
      // gallery + lamp room
      r.rect(21, 12, 14, 2, P.outline);
      r.rect(24, 6, 8, 6, P.goldL);
      r.rect(26, 7, 4, 4, P.gold);
      // roof
      for (let i = 0; i < 5; i++) r.rect(23 + i, 1 + i, 10 - i * 2, 1, P.lavenderD);
      r.rect(22, 5, 12, 1, P.lavenderD);
      // door
      r.rect(26, 45, 4, 6, P.lavenderD);
      // a tiny cozy cottage
      r.rect(37, 46, 9, 5, '#fff8ee');
      for (let i = 0; i < 4; i++) r.rect(36 + i, 45 - i, 11 - i * 2, 1, P.coralD);
      r.set(41, 48, P.turquoiseD);
      r.outline(P.outline);
      return r.toCanvas();
    });
  }

  function cloud(seed) {
    return cached(`cloud|${seed}`, () => {
      const rand = rng(seed * 13 + 1);
      const w = 30 + Math.floor(rand() * 18), h = 12;
      const r = new Raster(w, h);
      const puffs = 3 + Math.floor(rand() * 3);
      for (let i = 0; i < puffs; i++) {
        const px = 5 + rand() * (w - 10);
        const pr = 3 + rand() * 4;
        r.ellipse(px, h - pr - 1, pr * 1.3, pr, (x, y, nx, ny) => ny > 0.45 ? P.cloudShade : P.cloud);
      }
      r.ellipse(w / 2, h - 3, w / 2 - 1, 2.5, (x, y, nx, ny) => ny > 0 ? P.cloudShade : P.cloud);
      return r.toCanvas();
    });
  }

  // A pearl clam: open shell with a shiny pearl (gives a bubble shield).
  const PEARL = [
    ['..kkkkkk..', '.kppppppk.', 'kpPpPpPpPk', 'kPkkkkkkPk', '.k.kwwk.k.', 'kkkwwWwkkk', 'kpPpPpPpPk', '.kkkkkkkk.'],
    ['..kkkkkk..', '.kppppppk.', 'kpPpPpPpPk', 'kPkkkkkkPk', '.k.kWWk.k.', 'kkkwWwwkkk', 'kpPpPpPpPk', '.kkkkkkkk.'],
  ];
  // A smooth piece of sea glass (a rare treat worth 3 fish).
  const GLASS = ['..kkk..', '.kLLtk.', 'kLWLttk', 'kLLttTk', 'kttTTTk', '.kTTTk.', '..kkk..'];

  // A wild harbor seal resting on a rock. Real harbor seals haul out on rocks
  // and lie in a few classic ways, so each rock seal gets a POSE:
  //   'banana'  belly down, head AND tail flippers lifted high, bent like a
  //             banana; the tail flippers waggle slowly (frame 0/1)
  //   'belly'   rolled onto its back, belly up, patting its tummy with a
  //             front flipper (frame 0 = flipper up, 1 = pat!)
  //   'nap'     flat out, chin on the rock, eyes shut (puffs little z's)
  //   'look'    lying flat but head up, looking around (frame 1 = blink)
  // `tone` picks a fur colour and `left` mirrors it to face the other way.
  // Every sprite is 26 x 13 pixels and sits on its bottom centre.
  const REST_POSES = ['banana', 'belly', 'nap', 'look'];
  //
  // `size` is the width in screen pixels. The seal is DRAWN at that size
  // (every shape is scaled first, then turned into pixels) instead of being
  // drawn at 26 pixels and shrunk: shrinking pixel art drops whole rows,
  // and the head or flippers would vanish at a distance.
  function restingSeal(tone, pose, left, frame = 0, size = 26) {
    if (pose === true) pose = 'look';                     // older callers passed `awake`
    if (!REST_POSES.includes(pose)) pose = pose ? 'look' : 'banana';
    size = Math.max(8, Math.round(size));
    return cached(`rest|${tone}|${pose}|${left}|${frame}|${size}`, () => {
      const f = size / 26;                                 // scale from the 26-pixel design
      const furs = [['#8e97b2', '#6a7291'], ['#9a8f8a', '#766b67'], ['#b2b8c9', '#878fa8']];
      const [fur, spot] = furs[tone % furs.length];
      const BELLY = '#e6e3ee';
      const raw = new Raster(size, Math.max(5, Math.round(13 * f)));
      // the same drawing calls as the 26 x 13 design, scaled by f
      const r = {
        ellipse: (x, y, rx, ry, c) => raw.ellipse(x * f, y * f, Math.max(0.6, rx * f), Math.max(0.6, ry * f), c),
        set: (x, y, c) => raw.set(Math.min(raw.w - 1, Math.floor(x * f)), Math.min(raw.h - 1, Math.floor(y * f)), c),
        get: (x, y) => raw.get(Math.min(raw.w - 1, Math.floor(x * f)), Math.min(raw.h - 1, Math.floor(y * f))),
        outline: (c) => raw.outline(c),
        toCanvas: () => raw.toCanvas(),
      };
      const spots = (pts) => { for (const [x, y] of pts) if (r.get(x, y) === fur) r.set(x, y, spot); };

      if (pose === 'banana') {
        // the body is a chain of round segments along a smile-shaped curve:
        // lowest in the middle (the belly on the rock), rising at both ends
        for (let i = 0; i <= 10; i++) {
          const x = 4 + i * 1.6, u = (i - 5) / 5;
          const y = 9.4 - 3.4 * u * u;
          r.ellipse(x, y, 2.8, 2.6, (px, py, nx, ny) => ny > 0.3 ? BELLY : fur);
        }
        // head up at the right end, nose pointing to the sky a little
        r.ellipse(21.2, 4.4, 3.2, 2.9, fur);
        r.ellipse(23.6, 3.7, 1.6, 1.3, P.muzzle);
        r.set(24, 3, P.nose);
        r.set(21, 3, P.eye); r.set(21, 2, P.white);
        // tail flippers up at the left end: they waggle between two heights
        const up = frame ? 1 : 0;
        r.ellipse(2.4, 5.2 - up, 1.7, 1.1, P.sealDark);
        r.ellipse(1.4, 4.1 - up, 1.2, 0.9, P.sealDark);
        r.set(16, 10, P.sealDark); r.set(17, 10, P.sealDark);       // little front flipper
        spots([[8, 7], [11, 8], [14, 8], [17, 6], [6, 6], [19, 4]]);
      } else if (pose === 'belly') {
        // rolled over: a big round pale tummy faces the sky, back underneath
        r.ellipse(12, 8.6, 9.6, 3.9, (px, py, nx, ny) => ny < 0.25 ? BELLY : fur);
        // head at the right end, face turned up toward the sky
        r.ellipse(21.4, 8, 3.4, 3.2, fur);
        r.ellipse(22.6, 5.3, 1.7, 1.2, P.muzzle);
        r.set(23, 4, P.nose);
        r.set(19, 7, P.eye); r.set(20, 6, P.eye); r.set(21, 7, P.eye);   // a happy closed eye: ^
        r.ellipse(2.2, 8.4, 1.8, 1.3, P.sealDark);                      // tail flippers
        r.ellipse(1.1, 7.4, 1.1, 0.9, P.sealDark);
        if (frame) {
          // PAT! the round front flipper lands flat on the tummy
          r.ellipse(14, 7, 2.6, 1.2, P.sealDark);
        } else {
          // the flipper is lifted, ready for the next pat
          r.ellipse(15.2, 2.4, 1.6, 1.4, P.sealDark);
          r.set(16, 4, P.sealDark);                                     // its little wrist
        }
        spots([[5, 11], [9, 12], [13, 12], [17, 11]]);
      } else {
        // 'nap' and 'look': lying flat out on the rock
        r.ellipse(12, 9.3, 10, 3.2, (px, py, nx, ny) => ny > 0.4 ? BELLY : fur);
        r.ellipse(2, 9, 1.7, 1.2, P.sealDark);                      // tail flippers, flat
        r.ellipse(0.9, 8.2, 1.1, 0.9, P.sealDark);
        if (pose === 'nap') {
          r.ellipse(21.4, 9.3, 3.3, 2.6, fur);                      // chin down on the rock
          r.ellipse(23.8, 9.8, 1.5, 1.1, P.muzzle);
          r.set(24, 9, P.nose);
          r.set(20, 8, P.eye); r.set(21, 8, P.eye);                  // eyes shut
        } else {
          r.ellipse(19.6, 6.8, 1.8, 2.6, fur);                      // neck lifting the head
          r.ellipse(21, 4.6, 3.2, 2.9, fur);
          r.ellipse(23.4, 5.3, 1.6, 1.2, P.muzzle);
          r.set(24, 5, P.nose);
          if (frame) { r.set(21, 4, P.eye); r.set(22, 4, P.eye); }   // blink
          else { r.set(21, 4, P.eye); r.set(21, 3, P.white); }
        }
        r.set(16, 11, P.sealDark); r.set(17, 11, P.sealDark);       // front flipper
        spots([[7, 8], [10, 8], [13, 8], [16, 8], [5, 9]]);
      }
      r.outline(P.outline);
      let cv = r.toCanvas();
      if (left) {
        const m = document.createElement('canvas'); m.width = cv.width; m.height = cv.height;
        const g = m.getContext('2d'); g.translate(cv.width, 0); g.scale(-1, 1); g.drawImage(cv, 0, 0);
        cv = m;
      }
      return cv;
    });
  }

  // Which frame a rock seal shows at time t (seed keeps neighbours out of sync).
  function restFrame(pose, t, seed) {
    if (pose === 'banana') return Math.floor(t * 1.3 + seed) % 2;              // slow tail waggle
    if (pose === 'belly') {                                                      // a burst of pats, then a rest
      const c = (t * 0.5 + seed * 0.37) % 2;
      return c < 0.9 ? Math.floor(c * 9) % 2 : 0;
    }
    if (pose === 'look') return ((t * 0.4 + seed * 0.21) % 1.5) < 0.08 ? 1 : 0;  // the odd blink
    return 0;
  }

  // A pile of dark gray shore rocks. Each stone is a FACETED shape (a polygon
  // with a flat top), lit from the upper left like classic pixel-art rocks:
  //   flat top = lightest, the face toward us = mid, the far side = dark.
  // Sharp facets read as hard stone; round lumps read as... something else.
  // Returns { canvas, seat } where seat is the flat top a seal can lie on
  // (in pixels from the bottom centre).
  const STONES = {
    gray:  { top: '#868c9c', rim: '#a3a9b8', mid: '#5b606f', dark: '#3d414d', deep: '#2c2f39', wet: '#24262e' },
    brown: { top: '#9a8574', rim: '#b8a492', mid: '#6e5c4f', dark: '#4c3f36', deep: '#372e28', wet: '#29231f' },
  };
  const MOSS = { light: '#9cc466', mid: '#74a04c', dark: '#4f7a3a' };

  function stone(r, cx, base, w, h, rand, STONE, mossy) {
    // the outline: wide at the waterline, flat-topped, a little lopsided
    const topW = w * (0.45 + rand() * 0.25), top = base - h;
    const tl = cx - topW / 2 + (rand() - 0.5) * 3, tr = cx + topW / 2 + (rand() - 0.5) * 3;
    const shoulder = top + h * (0.35 + rand() * 0.2);
    const poly = [
      [cx - w / 2, base], [cx - w / 2 + rand() * 3, shoulder], [tl, top + rand() * 1.5],
      [tr, top + rand() * 1.5], [cx + w / 2 - rand() * 3, shoulder + rand() * 3], [cx + w / 2, base],
    ];
    const inside = (x, y) => {
      let c = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i], [xj, yj] = poly[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
      }
      return c;
    };
    const topDepth = 2 + Math.floor(rand() * 2);
    const ridgeTop = tl + (tr - tl) * 0.65, ridgeBase = cx + w * (0.12 + rand() * 0.1);
    const before = r.px.slice();
    const mask = [];
    for (let y = Math.floor(top) - 1; y <= base; y++) {
      for (let x = Math.floor(cx - w / 2) - 1; x <= Math.ceil(cx + w / 2) + 1; x++) {
        if (x < 0 || y < 0 || x >= r.w || y >= r.h || !inside(x + 0.5, y + 0.5)) continue;
        let c;
        if (y + 0.5 < top + 1.5 + topDepth) c = STONE.top;                       // flat sunny top
        else {
          const t = (y - top) / h;
          const ridge = ridgeTop + (ridgeBase - ridgeTop) * t;
          c = x + 0.5 < ridge ? STONE.mid : STONE.dark;                          // lit face vs. shadow face
          if (y > base - 2) c = STONE.wet;                                       // wet waterline
          else if (y > base - 4 && c === STONE.dark) c = STONE.deep;
        }
        r.set(x, y, c);
        mask.push([x, y]);
      }
    }
    // a bright rim along the top edge, and a 1px line where this stone meets stones behind it
    for (const [x, y] of mask) {
      if (r.get(x, y) === STONE.top && !inside(x + 0.5, y - 0.5)) r.set(x, y, STONE.rim);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= r.w || ny >= r.h) continue;
        if (!inside(nx + 0.5, ny + 0.5) && before[ny * r.w + nx]) { r.set(x, y, P.outline); break; }
      }
    }
    // a crack, barnacles near the water, and a touch of lichen on top
    const cxk = Math.round(cx + (rand() - 0.5) * w * 0.4);
    for (let i = 0; i < 3; i++) if (inside(cxk + i + 0.5, top + topDepth + 3 + i * 2 + 0.5)) r.set(cxk + i, Math.round(top + topDepth + 3 + i * 2), STONE.deep);
    for (let i = 0; i < w / 4; i++) {
      const bx = Math.round(cx - w / 2 + 2 + rand() * (w - 4)), by = base - 3 - Math.floor(rand() * 2);
      if (inside(bx + 0.5, by + 0.5)) r.set(bx, by, '#d9dbe2');
    }
    if (rand() < 0.6 && !mossy) {
      const lx = Math.round(tl + 2 + rand() * Math.max(1, tr - tl - 4));
      r.set(lx, Math.round(top + 2), '#d8b25a'); r.set(lx + 1, Math.round(top + 2), '#c99a3f');
    }
    // moss: soft green cushions on the flat top, a fringe creeping over the
    // edge, and a few streaks running down the sunny face
    if (mossy) {
      for (const [x, y] of mask) {
        const c = r.get(x, y);
        if (c === STONE.top || c === STONE.rim) {
          if (rand() < 0.7) r.set(x, y, rand() < 0.35 ? MOSS.light : MOSS.mid);
        } else if (c === STONE.mid && y < top + topDepth + 4 && rand() < 0.45) {
          r.set(x, y, MOSS.dark);
        }
      }
      for (let i = 0; i < 3; i++) {
        const sx = Math.round(tl + rand() * Math.max(1, (tr - tl) * 0.7));
        const len = 2 + Math.floor(rand() * 4);
        for (let j = 0; j < len; j++) {
          const yy = Math.round(top + topDepth + 2 + j);
          if (inside(sx + 0.5, yy + 0.5) && r.get(sx, yy) === STONE.mid) r.set(sx, yy, MOSS.dark);
        }
      }
    }
    return { top, cx };
  }

  // look: 'gray' | 'brown' | 'gray-moss' | 'brown-moss'
  function rockPile(seed, look = 'gray') {
    return cached(`pile|${seed}|${look}`, () => {
      const pal = STONES[look.startsWith('brown') ? 'brown' : 'gray'];
      const mossy = look.endsWith('moss');
      const rand = rng(seed * 31 + 7);
      const W = 56, H = 40, base = H - 4;
      const r = new Raster(W, H);
      // back stones first, the main flat-topped slab last (in front)
      const stones = [];
      const n = 2 + Math.floor(rand() * 2);
      for (let i = 0; i < n; i++) {
        const tall = rand() < 0.25;                                   // the odd tall sea stack
        stones.push({ cx: 8 + rand() * (W - 16), w: tall ? 10 + rand() * 4 : 12 + rand() * 10, h: tall ? 20 + rand() * 8 : 8 + rand() * 8 });
      }
      const main = { cx: W / 2 + (rand() - 0.5) * 8, w: 26 + rand() * 8, h: 11 + rand() * 5 };
      let seat = null;
      for (const st of stones) stone(r, st.cx, base - 1, st.w, st.h, rand, pal, mossy && rand() < 0.7);
      const m = stone(r, main.cx, base, main.w, main.h, rand, pal, mossy);
      seat = { x: m.cx - W / 2, y: H - m.top - 1 };
      r.outline(P.outline);
      // white foam where the waves meet the stones
      for (let x = 0; x < W; x++) {
        if (r.get(x, base) || r.get(x, base - 1)) {
          if (rand() < 0.75) r.set(x, base + 1, P.white);
          if (rand() < 0.35) r.set(x, base + 2, '#d9f4f2');
        }
      }
      return { canvas: r.toCanvas(), seat };
    });
  }

  // A flat haul-out rock poking out of the water.
  function haulRock(seed) {
    return cached(`haul|${seed}`, () => {
      const rand = rng(seed * 7 + 3);
      const w = 30 + Math.floor(rand() * 8), h = 9;
      const r = new Raster(w + 2, h + 2);
      r.ellipse((w + 2) / 2, h - 2, w / 2, h - 3, (x, y, nx, ny) => {
        if (ny < -0.35) return rand() < 0.15 ? P.rock : P.rockL;      // flat sunny top
        return ny > 0.5 ? P.rockD : (rand() < 0.1 ? P.rockD : P.rock);
      });
      for (let i = 0; i < 4; i++) r.set(Math.floor(3 + rand() * (w - 4)), h - 1, P.seafoam);   // a little seaweed at the waterline
      r.outline(P.outline);
      return r.toCanvas();
    });
  }

  // A little seal head for the HUD.
  const SEAL_ICON = ['.kkkkk.', 'kgggggk', 'kegkegk', 'kgnnggk', '.kkkkk.'];

  HH.Sprites = {
    seal,
    fish: () => cached('fish', () => fromGrid(FISH, { k: P.outline, h: '#eef5fa', g: '#a9bfd3', s: '#cfdce8', w: P.white, e: P.eye })),
    goldFish: () => cached('gold', () => fromGrid(FISH, { k: '#8a5a2b', h: P.goldL, g: P.goldD, s: P.gold, w: P.white, e: P.eye })),
    shrimp: () => cached('shrimp', () => fromGrid(SHRIMP, { k: '#a64c49', p: '#f9a593', P: P.coral, e: P.eye })),
    squid: () => cached('squid', () => fromGrid(SQUID, { k: '#6c5b98', L: P.lavender, h: '#e2d8f5', e: P.eye, w: P.white })),
    rock, log, kelp, lighthouse, cloud,
    decor: (name) => cached(`decor|${name}`, () => fromGrid(DECOR[name], DECOR_MAP[name])),
    crab: (f) => cached(`crab|${f}`, () => fromGrid(CRAB[f], { k: '#9c4a46', c: P.coral, e: P.eye, w: P.white })),
    bird: (f) => cached(`bird|${f}`, () => fromGrid(BIRD[f], { k: '#5b6683', w: '#ffffff' })),
    pearl: (f) => cached(`pearl|${f}`, () => fromGrid(PEARL[f], { k: '#9b5e7a', p: '#f7c6d4', P: P.blush, w: '#f4f0ff', W: P.white })),
    seaGlass: () => cached('glass', () => fromGrid(GLASS, { k: '#2f7a7c', L: '#c9f4ea', W: P.white, t: P.seafoam, T: P.teal })),
    restingSeal, restFrame, REST_POSES, haulRock, rockPile,
    sealIcon: () => cached('sealIcon', () => fromGrid(SEAL_ICON, { k: P.outline, g: P.seal, e: P.eye, n: P.muzzle })),
    fromGrid,
  };
})();
