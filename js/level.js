// level.js
// The ENDLESS coast. There is no finish line: a generator keeps building the
// path a little way ahead of the seal and throws away what is behind it.
//
// Why patterns? Pure randomness makes unfair or boring layouts. A pattern is a
// tiny designed moment ("hop the log and catch the arc of fish"). The generator
// shuffles patterns, so every run is different but always fair:
//   - patterns never overlap, and there is always breathing room between them
//   - boulders (which you must steer around) always leave a wide gap
//   - every log, rock and crab is low enough to hop over
//   - all spacing grows with speed, so a hop always fits between obstacles
//
// DIFFICULTY grows with distance in three ways:
//   1. speed rises gradually toward a gentle maximum (with calm stretches)
//   2. new pattern types unlock at set distances
//   3. gaps between patterns slowly shrink
//
// Units: 1 world unit = 1 metre. Sideways positions (x) are measured from the
// centre of the path, which runs from x = -1.2 (sea side) to x = +1.2 (dunes).

HH.Level = (function () {
  const smooth = (t) => t * t * (3 - 2 * t);
  const clamp01 = (t) => Math.max(0, Math.min(1, t));

  // ---------------------------------------------------------------------------
  // Speed and difficulty
  // ---------------------------------------------------------------------------
  const BASE_SPEED = 4.2;        // metres per second at the start
  const MAX_SPEED = 6.9;         // the ceiling: fast but still readable
  const CALM_EVERY = 420;        // a calm stretch every 420 m...
  const CALM_LEN = 70;           // ...lasting 70 m

  // How deep into a calm stretch are we? 0 = not calm, 1 = fully calm.
  function calmAt(z) {
    if (z < CALM_EVERY) return 0;
    const into = z % CALM_EVERY;
    if (into > CALM_LEN) return 0;
    return Math.min(1, into / 12, (CALM_LEN - into) / 12);
  }

  // The run speed at distance z: rises fast at first, then levels off.
  // Word Mode is slower and calmer, so there is time to read the letters.
  const WORD_SPEED = 3.4, WORD_MAX = 4.5;
  function speedAt(z, mode) {
    if (mode === 'words') return WORD_SPEED + (WORD_MAX - WORD_SPEED) * (1 - Math.exp(-z / 1500));
    const rise = 1 - Math.exp(-z / 1100);
    const s = BASE_SPEED + (MAX_SPEED - BASE_SPEED) * rise;
    return s * (1 - 0.12 * calmAt(z));                  // ease off in calm stretches
  }

  // 0 at the start, 1 after 1500 m.
  const difficulty = (z) => clamp01(z / 1500);

  // The gentle S-curves of the path (straight for the first 30 m).
  function pathX(z) {
    const fade = smooth(clamp01((z - 10) / 30));
    return (1.15 * Math.sin(z / 23) + 0.55 * Math.sin(z / 9.7 + 1.3)) * fade;
  }

  // ---------------------------------------------------------------------------
  // Item helpers
  // ---------------------------------------------------------------------------
  // Food heights: GROUND food (0.2) can be caught while scooting.
  // HIGH food (0.5) floats above the seal's head: only a hop reaches it.
  // The golden fish (0.66) is so high that you need a hop with rhythm (or a
  // perfectly timed plain hop, right at the top of the arc) to reach it.
  const GROUND = 0.2, HIGH = 0.5;
  const food = (kind, z, x, e = GROUND) => ({ kind, z, x, e, type: 'food' });
  const obst = (kind, z, x) => ({ kind, z, x, type: 'obstacle' });
  const LANES = [-0.6, 0, 0.6];
  const BEAT = 3.3;              // metres per relaxed hop at the starting speed
  const lane = (rand) => LANES[Math.floor(rand() * 3)];

  // ---------------------------------------------------------------------------
  // Patterns: (s = start z, rand, k = spacing factor that grows with speed)
  // Each returns { items, len }.
  // ---------------------------------------------------------------------------
  const PATTERNS = {
    // a simple line of fish: steer to collect
    fishLine(s, rand, k) {
      const x = lane(rand);
      const items = [];
      for (let i = 0; i < 5; i++) items.push(food('fish', s + i * 1.2 * k, x));
      return { items, len: 5.5 * k };
    },

    // a wavy ribbon of fish at two heights: pure joy, used in calm stretches
    fishWave(s, rand, k) {
      const items = [];
      const x0 = lane(rand);
      for (let i = 0; i < 8; i++) {
        const x = Math.max(-0.85, Math.min(0.85, x0 + Math.sin(i * 0.8) * 0.34));
        items.push(food(i === 7 && rand() < 0.4 ? 'shrimp' : 'fish', s + i * 1.3 * k, x, i % 2 ? HIGH : GROUND));
      }
      return { items, len: 10 * k };
    },

    // a log across the path with an arc of fish tracing the perfect hop
    logHop(s, rand, k) {
      const z = s + 2.4 * k;
      const items = [obst('log', z, 0)];
      [GROUND, 0.4, HIGH, 0.4, GROUND].forEach((e, j) => items.push(food('fish', z + (j - 2) * 0.7 * k, 0, e)));
      return { items, len: 5 * k };
    },

    // three logs spaced for a rhythm: hop, land, hop, land, hop.
    // The spacing is one relaxed hop apart (about 0.72 s at any speed),
    // so tapping on the beat clears every log.
    logRhythm(s, rand, k) {
      const items = [];
      for (let i = 0; i < 3; i++) {
        const z = s + 2 * k + i * BEAT * k;
        items.push(obst('log', z, 0), food('fish', z, 0, HIGH));
      }
      return { items, len: (3 + 2 * BEAT) * k };
    },

    // small rocks alternating sides, fish on the free side
    rockSlalom(s, rand, k) {
      const side = rand() < 0.5 ? 1 : -1;
      const items = [];
      for (let i = 0; i < 4; i++) {
        const z = s + 2 * k + i * 3.2 * k;
        const rx = (i % 2 ? 0.57 : -0.57) * side;
        items.push(obst('rock', z, rx), food('fish', z, -rx));
      }
      return { items, len: 13 * k };
    },

    // big boulders with a gap: steer through it
    boulderGate(s, rand, k) {
      const g = lane(rand);
      return { items: gate(s + 3 * k, g, k), len: 6 * k };
    },

    // slippery kelp patches with shrimp tucked between them
    kelpField(s, rand, k) {
      const items = [];
      let prev = 99;
      for (let i = 0; i < 3; i++) {
        let x;
        do { x = lane(rand); } while (x === prev);
        prev = x;
        items.push(obst('kelp', s + 1.5 * k + i * 2.6 * k, x));
        if (i < 2) {
          const free = LANES.filter((l) => l !== x);
          items.push(food('shrimp', s + 2.8 * k + i * 2.6 * k, free[Math.floor(rand() * free.length)]));
        }
      }
      return { items, len: 8.5 * k };
    },

    // a zig-zag of shrimp with one small rock to hop in the middle
    shrimpZig(s, rand, k) {
      const xs = [-0.6, -0.23, 0.23, 0.6, 0.23];
      const items = xs.map((x, i) => food('shrimp', s + (1 + i * 1.4) * k, x));
      items.push(obst('rock', s + 3.8 * k, 0));
      return { items, len: 8 * k };
    },

    // THE GOLDEN ROUTE: four logs in rhythm. Only a seal with a good rhythm
    // hops high enough to reach the golden fish above the last log.
    golden(s, rand, k) {
      const items = [];
      for (let i = 0; i < 4; i++) {
        const z = s + 2 * k + i * BEAT * k;
        items.push(obst('log', z, 0));
        if (i < 3) items.push(food('fish', z, 0, HIGH));
      }
      items.push(food('gold', s + 2 * k + 3 * BEAT * k, 0, 0.66));
      return { items, len: (3 + 3 * BEAT) * k };
    },

    // an optional risky line along the edge with a squid at the end
    squidEdge(s, rand, k) {
      const side = rand() < 0.5 ? -1 : 1;
      return {
        items: [
          obst('rock', s + 2 * k, 0.94 * side),
          food('fish', s + 2 * k, 0.94 * side, HIGH),
          obst('boulder', s + 3.4 * k, 0.26 * side),
          food('squid', s + 3.6 * k, 0.94 * side, 0.2),
        ],
        len: 6 * k,
      };
    },

    // NEW at 450 m: crabs scuttling across the path (hop them or dodge them)
    crabCrossing(s, rand, k) {
      const items = [];
      for (let i = 0; i < 2; i++) {
        const c = obst('crab', s + (2 + i * 3.4) * k, 0);
        c.phase = rand() * 6; c.swing = 0.72; c.rate = 1.3 + rand() * 0.5;
        items.push(c, food('fish', s + (3.7 + i * 3.4) * k, lane(rand)));
      }
      return { items, len: 8.5 * k };
    },

    // NEW at 650 m: hop a log, land, then steer through a gate
    logGate(s, rand, k) {
      const items = [obst('log', s + 2 * k, 0), food('fish', s + 2 * k, 0, HIGH)];
      items.push(...gate(s + 5.6 * k, lane(rand), k));
      return { items, len: 8.5 * k };
    },

    // NEW at 650 m: kelp before a log makes the take-off sticky
    kelpLog(s, rand, k) {
      const x = lane(rand);
      return {
        items: [obst('kelp', s + 1.4 * k, x), obst('log', s + 4.4 * k, 0),
          food('shrimp', s + 4.4 * k, 0, HIGH), food('fish', s + 1.4 * k, LANES.find((l) => l !== x))],
        len: 7 * k,
      };
    },

    // NEW at 900 m: two gates with gaps on different sides: a zig-zag
    doubleGate(s, rand, k) {
      const g1 = lane(rand);
      let g2;
      do { g2 = lane(rand); } while (g2 === g1);
      return { items: [...gate(s + 2.5 * k, g1, k), ...gate(s + 6.8 * k, g2, k)], len: 9.5 * k };
    },

    // NEW at 1200 m: a scatter of small rocks, hop in rhythm or weave through
    rockField(s, rand, k) {
      const items = [];
      let prev = 99;
      for (let i = 0; i < 5; i++) {
        const z = s + (1.5 + i * 2.4) * k;
        let x;
        do { x = lane(rand); } while (x === prev);      // never two in a row in the same lane
        prev = x;
        items.push(obst('rock', z, x));
        if (i % 2) items.push(food('fish', z, x, HIGH));
      }
      return { items, len: 13.5 * k };
    },
  };

  // Boulders around a gap centred on g (always at least a seal and a half wide).
  function gate(z, g, k) {
    const items = [];
    for (const c of [-1.0, -0.34, 0.34, 1.0]) if (Math.abs(c - g) >= 0.62) items.push(obst('boulder', z, c));
    for (let i = -1; i <= 1; i++) items.push(food('fish', z + i * k, g));
    return items;
  }

  // Which patterns can appear, from what distance (m), and how often.
  const POOL = [
    ['fishLine', 0, 3], ['logHop', 0, 3], ['shrimpZig', 30, 2], ['kelpField', 100, 2],
    ['rockSlalom', 150, 2], ['boulderGate', 220, 2], ['logRhythm', 300, 2], ['fishWave', 0, 1],
    ['crabCrossing', 450, 2], ['logGate', 650, 2], ['kelpLog', 650, 2],
    ['doubleGate', 900, 2], ['rockField', 1200, 2],
  ];

  function pick(rand, z, last) {
    const ok = POOL.filter(([name, min]) => z >= min && name !== last);
    const total = ok.reduce((a, [, , w]) => a + w, 0);
    let r = rand() * total;
    for (const [name, , w] of ok) { r -= w; if (r <= 0) return name; }
    return ok[0][0];
  }

  // ---------------------------------------------------------------------------
  // The generator
  // ---------------------------------------------------------------------------
  function create(seed, mode) {
    const gen = {
      mode: mode || 'cruise',
      rand: HH.rng(seed),
      items: [], decor: [],
      cursor: 15, decorCursor: 2, nextPileL: 8, nextPileR: 18,
      last: '', lastGold: -999, nextGlass: 260, nextPearl: 230,
    };
    // a gentle line of fish right in front of the seal to get things going
    if (gen.mode !== 'words') for (let i = 0; i < 4; i++) gen.items.push(food('fish', 7 + i * 1.2, 0));
    return gen;
  }

  // Keep building until the path reaches `upto`.
  function fill(gen, upto) {
    if (gen.mode === 'words') { fillWords(gen, upto); return; }
    const rand = gen.rand;
    while (gen.cursor < upto) {
      const z = gen.cursor;
      const k = speedAt(z) / BASE_SPEED;             // faster = more spacing
      let name;
      if (calmAt(z) > 0 || calmAt(z + 12 * k) > 0) name = rand() < 0.6 ? 'fishWave' : 'fishLine';   // calm waters
      else if (z > 200 && z - gen.lastGold > 300 && rand() < 0.08) { name = 'golden'; gen.lastGold = z; }
      else if (z > 320 && rand() < 0.06) name = 'squidEdge';
      else name = pick(rand, z, gen.last);
      gen.last = name;

      const res = PATTERNS[name](z, rand, k);
      gen.items.push(...res.items);

      // rare surprises, placed in the breathing room after a pattern
      const after = z + res.len + 1.5 * k;
      if (z > gen.nextGlass) {
        // sea glass: a rare treat worth 3 fish. Floats a little high on an edge.
        gen.items.push(food('glass', after, (rand() < 0.5 ? -1 : 1) * 0.85, HIGH + 0.05));
        gen.nextGlass = z + 380 + rand() * 260;
      } else if (z > gen.nextPearl) {
        // a pearl clam: a bubble that saves you from one bump
        gen.items.push(food('pearl', after, lane(rand), 0.2));
        gen.nextPearl = z + 700 + rand() * 350;
      }

      const d = difficulty(z);
      gen.cursor += res.len + (3.2 + 2.4 * (1 - d) + rand() * 1.5) * k + (name.includes('Gate') ? 1.5 * k : 0);
    }
    gen.items.sort((a, b) => a.z - b.z);
    fillDecor(gen, upto + 10);
  }

  // ---------------------------------------------------------------------------
  // WORD MODE path: a steady beat of "letter rows" with small, friendly
  // obstacles in the gaps between them. The generator only marks WHERE a row
  // goes (a 'slot'); game.js decides which letters it holds when it comes into
  // view, because that depends on how much of the word is already spelled.
  // ---------------------------------------------------------------------------
  const ROW_GAP = 10.5;          // metres between letter rows (about 3 seconds)
  function fillWords(gen, upto) {
    const rand = gen.rand;
    while (gen.cursor < upto) {
      const z = gen.cursor;
      const k = speedAt(z, 'words') / WORD_SPEED;
      gen.items.push({ type: 'slot', kind: 'slot', z, x: 0 });
      // halfway to the next row: sometimes a log to hop, a rock or a kelp patch
      const mid = z + ROW_GAP * k * 0.5;
      const chance = Math.min(0.6, 0.3 + z / 2500);
      if (z > 30 && rand() < chance) {
        const r = rand();
        if (r < 0.45) gen.items.push(obst('log', mid, 0));
        else if (r < 0.8) gen.items.push(obst('rock', mid, lane(rand)));
        else gen.items.push(obst('kelp', mid, lane(rand)));
      }
      gen.cursor += ROW_GAP * k;
    }
    gen.items.sort((a, b) => a.z - b.z);
    fillDecor(gen, upto + 10);
  }

  // Scenery that never gets in the way: always off the path.
  // The path is a sandbar in the ocean: open water and waves on both sides,
  // with now and then a pile of rocks where wild harbor seals nap.
  function fillDecor(gen, upto) {
    const rand = gen.rand;
    for (; gen.decorCursor < upto; gen.decorCursor += 0.55) {
      const z = gen.decorCursor;
      // a few shells and bits of seaweed on the wet sand
      if (rand() < 0.12) {
        const side = rand() < 0.5 ? -1 : 1;
        const r = rand();
        const kind = r < 0.45 ? 'weed' : r < 0.8 ? 'shell' : 'star';
        gen.decor.push({ kind, z: z + rand() * 0.5, x: side * (1.28 + rand() * 0.05), seed: Math.floor(rand() * 9) });
      }
      // piles of dark rocks lining both shores; seals rest on some of them
      for (const side of [-1, 1]) {
        const key = side < 0 ? 'nextPileL' : 'nextPileR';
        if (z >= gen[key]) {
          gen.decor.push({
            kind: 'pile', z, x: side * (1.62 + rand() * 0.35), seed: Math.floor(rand() * 12), side,
            look: pickLook(rand()),
            seal: rand() < 0.5, tone: Math.floor(rand() * 3), pose: pickPose(rand()), left: rand() < 0.5,
            splash: rand() * 10,
          });
          gen[key] = z + 12 + rand() * 14;                    // rocks are an occasional treat, not a wall
        }
      }
      // small rocks further out in the water
      if (rand() < 0.012) {
        const side = rand() < 0.5 ? -1 : 1;
        gen.decor.push({ kind: 'searock', z: z + rand() * 0.5, x: side * (2.4 + rand() * 1.2), seed: Math.floor(rand() * 4) });
      }
    }
    gen.decor.sort((a, b) => a.z - b.z);
  }

  // Rock colours: mostly gray, plenty of brown, some of either with moss.
  // How rock seals lie: mostly the classic banana, with belly patters,
  // nappers and the odd head-up looker mixed in for variety.
  function pickPose(r) {
    return r < 0.35 ? 'banana' : r < 0.6 ? 'belly' : r < 0.85 ? 'nap' : 'look';
  }

  function pickLook(r) {
    return r < 0.35 ? 'gray' : r < 0.65 ? 'brown' : r < 0.85 ? 'gray-moss' : 'brown-moss';
  }

  // Forget everything that is safely behind the camera, so memory never grows.
  function prune(gen, behind) {
    let i = 0;
    while (i < gen.items.length && gen.items[i].z < behind) i++;
    if (i) gen.items.splice(0, i);
    let j = 0;
    while (j < gen.decor.length && gen.decor[j].z < behind) j++;
    if (j) gen.decor.splice(0, j);
  }

  return { create, fill, prune, pathX, speedAt, calmAt, difficulty, BASE_SPEED, MAX_SPEED, LANES };
})();
