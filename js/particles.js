// particles.js
// Tiny screen-space effects: sand puffs, sparkles, score pop-ups, dizzy stars, zzz.
// Each particle is a plain object updated every frame and removed when its life ends.

HH.Particles = (function () {
  const P = HH.PAL;
  let list = [];

  function add(p) {
    list.push(Object.assign({ vx: 0, vy: 0, g: 0, life: 0.5, t: 0, size: 1, kind: 'px' }, p));
  }

  // Sand puff when the belly lands: grains fly out sideways and fall.
  function dust(x, y, power = 1) {
    const n = Math.round(5 + power * 5);
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1;
      add({
        x: x + side * (8 + Math.random() * 6), y: y - Math.random() * 2,
        vx: side * (12 + Math.random() * 28) * power, vy: -(10 + Math.random() * 22) * power,
        g: 90, life: 0.35 + Math.random() * 0.25,
        color: Math.random() < 0.5 ? P.sandD : P.sandL, size: Math.random() < 0.3 ? 2 : 1,
      });
    }
  }

  // A small trail of sand behind the scooting seal.
  function scoot(x, y) {
    add({ x: x + (Math.random() - 0.5) * 14, y, vx: (Math.random() - 0.5) * 8, vy: 12 + Math.random() * 10,
      g: 0, life: 0.3, color: P.sandD });
  }

  function sparkle(x, y, color = P.white, n = 6) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      add({ x, y, vx: Math.cos(a) * 30, vy: Math.sin(a) * 30 - 10, g: 20, life: 0.4, color, kind: 'plus' });
    }
  }

  function text(x, y, str, color = P.white) {
    add({ x, y, vy: -18, life: 0.8, kind: 'text', str, color });
  }

  function kelpSplat(x, y) {
    for (let i = 0; i < 6; i++) {
      add({ x: x + (Math.random() - 0.5) * 16, y, vx: (Math.random() - 0.5) * 40, vy: -20 - Math.random() * 20,
        g: 100, life: 0.4, color: Math.random() < 0.5 ? P.kelp : P.kelpL });
    }
  }

  // speed lines at the screen edges when the pace is high
  function wind() {
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = 80 + side * (52 + Math.random() * 26), y = 110 + Math.random() * 90;
    add({ x, y, vx: side * 40, vy: 160, life: 0.25, kind: 'streak', color: 'rgba(255, 255, 255, 0.55)' });
  }

  // a heart that cracks and tumbles away when the seal loses one
  function brokenHeart(x, y) {
    add({ x: x - 2, y, vx: -14, vy: -22, g: 70, life: 0.9, kind: 'halfheart', side: -1, color: P.coral });
    add({ x: x + 2, y, vx: 14, vy: -22, g: 70, life: 0.9, kind: 'halfheart', side: 1, color: P.coral });
  }

  function zzz(x, y) {
    add({ x, y, vx: 6, vy: -9, life: 1.6, kind: 'text', str: 'z', color: P.lavenderD });
  }

  function heart(x, y) {
    add({ x, y, vx: (Math.random() - 0.5) * 10, vy: -16, life: 1.0, kind: 'heart', color: P.coral });
  }

  function update(dt) {
    for (const p of list) {
      p.t += dt;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    list = list.filter((p) => p.t < p.life);
  }

  function draw(g) {
    for (const p of list) {
      const x = Math.round(p.x), y = Math.round(p.y);
      g.fillStyle = p.color;
      if (p.kind === 'px') {
        g.fillRect(x, y, p.size, p.size);
      } else if (p.kind === 'plus') {
        const big = p.t < p.life * 0.5;
        g.fillRect(x, y, 1, 1);
        if (big) { g.fillRect(x - 1, y, 3, 1); g.fillRect(x, y - 1, 1, 3); }
      } else if (p.kind === 'halfheart') {
        // one half of a pixel heart
        const o = p.side < 0 ? -3 : 0;
        g.fillStyle = P.outline; g.fillRect(x + o - 1, y - 2, 5, 6);
        g.fillStyle = p.color; g.fillRect(x + o, y - 1, 3, 3); g.fillRect(x + o + (p.side < 0 ? 1 : 0), y + 2, 2, 1);
      } else if (p.kind === 'streak') {
        g.fillRect(x, y, 1, 4);
      } else if (p.kind === 'text') {
        if (p.t > p.life - 0.15 && Math.floor(p.t * 30) % 2) continue;   // blink out
        HH.Font.draw(g, p.str, x, y, { color: p.color, align: 'center', outline: P.outline });
      } else if (p.kind === 'heart') {
        // 5x4 pixel heart
        g.fillStyle = P.outline;
        g.fillRect(x - 3, y - 1, 7, 3); g.fillRect(x - 2, y - 2, 2, 1); g.fillRect(x + 1, y - 2, 2, 1);
        g.fillRect(x - 2, y + 2, 5, 1); g.fillRect(x - 1, y + 3, 3, 1); g.fillRect(x, y + 4, 1, 1);
        g.fillStyle = p.color;
        g.fillRect(x - 2, y - 1, 2, 1); g.fillRect(x + 1, y - 1, 2, 1);
        g.fillRect(x - 2, y, 5, 2); g.fillRect(x - 1, y + 2, 3, 1); g.fillRect(x, y + 3, 1, 1);
      }
    }
  }

  return { dust, scoot, sparkle, text, kelpSplat, zzz, heart, wind, brokenHeart, update, draw, clear() { list = []; } };
})();
