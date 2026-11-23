// ui.js
// Pixel-art interface: panels, buttons, the HUD and every menu screen.
//
// Screens are drawn every frame. Each screen function returns the list of
// buttons it drew, so game.js can test taps and keyboard focus against them.
// (This "immediate mode" style keeps the UI code short and easy to change.)

HH.UI = (function () {
  const P = HH.PAL, V = HH.View, F = HH.Font;

  // ---------------------------------------------------------------------------
  // Drawing helpers
  // ---------------------------------------------------------------------------
  // A rounded pixel panel with a soft drop shadow.
  function panel(g, x, y, w, h, fill = P.uiPanel, border = P.outline) {
    x = Math.round(x); y = Math.round(y);
    g.fillStyle = 'rgba(43, 45, 72, 0.25)';
    g.fillRect(x + 1, y + h, w - 2, 2);
    g.fillStyle = border;
    g.fillRect(x + 1, y, w - 2, h);
    g.fillRect(x, y + 1, w, h - 2);
    g.fillStyle = fill;
    g.fillRect(x + 1, y + 1, w - 2, h - 2);
    g.fillStyle = P.uiPanelD;
    g.fillRect(x + 1, y + h - 3, w - 2, 2);
  }

  // A chunky button. style: 'primary' | 'normal' | 'ghost'
  function button(g, b, focused, t) {
    if (b.draw) { b.draw(g, b, t); return; }       // buttons with their own look (the life ring)
    const press = b.pressT > 0 ? 1 : 0;
    const fill = b.disabled ? '#e4dccd' : b.style === 'primary' ? P.coral : b.style === 'teal' ? P.teal : b.style === 'ghost' ? '#ebe2d2' : P.uiPanel;
    const text = b.disabled ? '#a59f98' : b.style === 'primary' || b.style === 'teal' ? P.white : b.style === 'ghost' ? '#9e9486' : P.uiText;
    const x = Math.round(b.x), y = Math.round(b.y + press);
    // bottom lip (gives the button a "pressable" depth)
    g.fillStyle = P.outline;
    g.fillRect(x + 1, y + 2, b.w - 2, b.h);
    g.fillRect(x, y + 3, b.w, b.h - 2);
    panel(g, x, y, b.w, b.h, fill, P.outline);
    if (b.style === 'primary') { g.fillStyle = P.coralD; g.fillRect(x + 1, y + b.h - 3, b.w - 2, 2); }
    if (b.style === 'teal') { g.fillStyle = P.tealD; g.fillRect(x + 1, y + b.h - 3, b.w - 2, 2); }
    if (focused) {
      // a little blinking arrow shows keyboard focus
      if (Math.floor(t * 3) % 2) {
        g.fillStyle = P.outline;
        g.fillRect(x - 4, y + b.h / 2 - 2, 1, 5); g.fillRect(x - 3, y + b.h / 2 - 1, 1, 3); g.fillRect(x - 2, y + b.h / 2, 1, 1);
      }
    }
    const s = b.scale || 1;
    if (b.icon) b.icon(g, x + b.w / 2, y + b.h / 2);
    else F.draw(g, b.label, x + b.w / 2, y + Math.round((b.h - 3 - 5 * s) / 2), { color: text, scale: s, align: 'center' });
  }

  // Tiny icons drawn with rectangles.
  function fishIcon(g, x, y, gold) { g.drawImage(gold ? HH.Sprites.goldFish() : HH.Sprites.fish(), Math.round(x), Math.round(y)); }

  // The pause button is a little life ring (a beach lifebuoy): coral and
  // white stripes around a hole, with the two pause bars inside.
  function lifeRing(g, b, t) {
    const press = b.pressT > 0 ? 1 : 0;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2 + press;
    const R = 8.6, r = 4.4;
    for (let y = -10; y <= 10; y++) {
      for (let x = -10; x <= 10; x++) {
        const px = x + 0.5, py = y + 0.5;
        const d = Math.sqrt(px * px + py * py);
        if (d > R + 1) continue;
        let c;
        if (d > R || (d < r && d > r - 1)) c = P.outline;          // outer and inner rims
        else if (d <= r - 1) c = P.uiPanel;                        // the hole, kept light so the bars read
        else {
          const a = Math.atan2(py, px) + Math.PI / 4;
          const stripe = Math.floor((a / (Math.PI * 2)) * 4 + 4) % 2;   // four stripes
          c = stripe ? P.coral : P.white;
          if (py > 0 && d > R - 1.8) c = stripe ? P.coralD : P.uiPanelD;   // shade underneath
        }
        g.fillStyle = c;
        g.fillRect(Math.floor(cx + x), Math.floor(cy + y), 1, 1);
      }
    }
    // the pause bars in the middle of the ring
    g.fillStyle = P.outline;
    g.fillRect(Math.floor(cx) - 2, Math.floor(cy) - 2, 1, 4);
    g.fillRect(Math.floor(cx) + 1, Math.floor(cy) - 2, 1, 4);
  }

  // The help button: a round teal badge with a big question mark.
  function helpBadge(g, b, t) {
    const press = b.pressT > 0 ? 1 : 0;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2 + press, R = 8.6;
    for (let y = -10; y <= 10; y++) {
      for (let x = -10; x <= 10; x++) {
        const d = Math.hypot(x + 0.5, y + 0.5);
        if (d > R + 1) continue;
        g.fillStyle = d > R ? P.outline : (y > 3 && d > R - 1.8) ? P.tealD : P.teal;
        g.fillRect(Math.floor(cx + x), Math.floor(cy + y), 1, 1);
      }
    }
    F.draw(g, '?', cx, cy - 5, { align: 'center', scale: 2, color: P.white });
  }

  // A driftwood sign: a plank with nail heads and wood grain.
  function plank(g, x, y, w, h) {
    g.fillStyle = 'rgba(43, 45, 72, 0.25)'; g.fillRect(x + 1, y + h, w - 1, 2);       // soft shadow
    g.fillStyle = P.outline; g.fillRect(x, y + 1, w, h - 2); g.fillRect(x + 1, y, w - 2, h);
    g.fillStyle = P.woodL; g.fillRect(x + 1, y + 1, w - 2, h - 2);
    g.fillStyle = '#e2b583'; g.fillRect(x + 1, y + 1, w - 2, 1);                       // sunny top edge
    g.fillStyle = P.wood; g.fillRect(x + 1, y + h - 3, w - 2, 2);                     // darker lower edge
    g.fillStyle = '#bf8a5a';                                                           // grain
    for (let i = 6; i < w - 6; i += 9) g.fillRect(x + i, y + 4 + (i % 3), 4, 1);
    g.fillStyle = P.woodD; g.fillRect(x + 2, y + 2, 1, 1); g.fillRect(x + w - 3, y + 2, 1, 1);   // nails
  }

  // A scallop shell badge: filled when earned, outlined when not.
  function shellBadge(g, cx, cy, on, t) {
    const x = Math.round(cx), y = Math.round(cy);
    const rows = [[-2, 4], [-4, 8], [-5, 10], [-5, 10], [-4, 8], [-2, 4]];
    rows.forEach(([dx, w], i) => {
      g.fillStyle = P.outline; g.fillRect(x + dx - 1, y + i - 3, w + 2, 1);
    });
    g.fillRect(x - 2, y + 3, 4, 2);
    rows.forEach(([dx, w], i) => {
      if (i === 0) return;
      g.fillStyle = on ? (i % 2 ? P.gold : P.goldD) : '#e9dfcf';
      g.fillRect(x + dx, y + i - 3, w, 1);
    });
    if (on) {
      g.fillStyle = on ? P.goldD : P.outline;
      g.fillRect(x - 3, y - 1, 1, 3); g.fillRect(x, y - 1, 1, 4); g.fillRect(x + 3, y - 1, 1, 3);
      if (Math.floor(t * 2) % 2) { g.fillStyle = P.white; g.fillRect(x + 5, y - 5, 1, 1); }
    }
  }

  // Split text into lines of at most `max` characters (3x5 font = 4 px a letter).
  // `max` is a line width counted in the OLD 4-pixel letters (so every caller
  // keeps its box width); the Press Start letters are 5 1/3 px, so fewer fit.
  function wrap(text, max) {
    max = Math.max(1, Math.floor((max * 4) / F.adv(1)));
    const lines = [];
    let line = '';
    for (const word of text.split(' ')) {
      if ((line + ' ' + word).trim().length > max) { lines.push(line); line = word; }
      else line = (line + ' ' + word).trim();
    }
    if (line) lines.push(line);
    return lines;
  }

  // Draw wrapped text, highlighting the Word Mode word (any form of it:
  // FOSTER, FOSTERS, FOSTERED). The font is monospaced (F.adv() px per letter).
  function richText(g, text, word, x, y, max, lineH, color, hi) {
    const stem = word ? word.slice(0, word.length <= 4 ? word.length - 1 : word.length - 2) : null;
    const lines = wrap(text, max);
    lines.forEach((line, i) => {
      let col = 0;
      for (const tok of line.split(' ')) {
        const bare = tok.replace(/[^A-Z]/g, '');
        const isWord = stem && bare.startsWith(stem);
        const A = F.adv(1);
        F.draw(g, tok, x + col * A, y + i * lineH, { color: isWord ? hi : color });
        if (isWord) {                                          // underline the letters, not the punctuation
          const lead = tok.indexOf(bare[0]);
          g.fillStyle = hi; g.fillRect(Math.round(x) + (col + lead) * A, Math.round(y) + i * lineH + 16 / 3, bare.length * A - 2 / 3, 2 / 3);
        }
        col += tok.length + 1;
      }
    });
    return lines.length;
  }

  // A found ocean fact as a small card, with its Word Mode word underlined.
  // Returns the card's height.
  const factLines = (fact, max) => {
    const e = HH.Study.entry(fact.word);
    return { text: wrap(fact.text, max), meaning: e ? wrap(`${fact.word} = ${e[2].toUpperCase()}`, max).slice(0, 3) : [] };
  };
  function factCardHeight(fact, w) {
    const L = factLines(fact, Math.floor((w - 12) / 4));
    return 22 + L.text.length * 8 + L.meaning.length * 7 + 5;
  }
  function factCard(g, fact, x, y, w, heading) {
    const max = Math.floor((w - 12) / 4), L = factLines(fact, max), h = factCardHeight(fact, w);
    panel(g, x, y, w, h, '#f3fbf9', P.tealD);
    F.draw(g, heading, x + 6, y + 5, { color: P.goldD });
    F.draw(g, fact.title, x + 6, y + 13, { color: P.tealD });
    richText(g, fact.text, fact.word, x + 6, y + 22, max, 8, P.outline, P.tealD);
    // what the underlined word means, in small grey print underneath
    L.meaning.forEach((l, i) => F.draw(g, l, x + 6, y + 23 + L.text.length * 8 + i * 7, { color: '#8a8173' }));
    return h;
  }

  // ---------------------------------------------------------------------------
  // Title screen
  // ---------------------------------------------------------------------------
  function title(g, t, save) {
    // The game's name, big and bouncy. Each letter bobs a little out of phase.
    const word = (str, y, scale, color) => {
      const w = F.width(str, scale);
      let x = V.W / 2 - w / 2;
      for (let i = 0; i < str.length; i++) {
        const bob = Math.round(Math.sin(t * 2.2 + i * 0.6) * 1.5);
        F.draw(g, str[i], x, y + bob, { scale, color, outline: P.outline, shadow: P.outline });
        x += 4 * scale;
      }
    };
    word('HARBOR', 16, 4, P.uiPanel);
    word('HOP', 40, 6, P.coral);
    F.draw(g, 'AN ENDLESS BELLY-HOP', V.W / 2, 76, { align: 'center', color: P.outline });

    // under each mode: its own kind of progress
    const out = { align: 'center', color: P.white, outline: P.outline };
    if (save.bestDist > 0) F.draw(g, `BEST ${save.bestDist} M`, 45, 133, out);
    const learned = HH.Study.learnedCount(save), streak = HH.Study.currentStreak(save);
    // the weekly boss (boss.js): a big button when one is waiting, otherwise
    // a small one that counts down the study days (and opens a preview)
    const boss = HH.Study.bossStatus(save);
    if (boss.ready) {
      if (streak > 0) F.draw(g, `STREAK ${streak}`, 115, 148, { align: 'center', color: P.goldL, outline: P.outline });
    } else {
      if (learned > 0) F.draw(g, `${learned} LEARNED`, 115, 133, out);
      if (streak > 0) F.draw(g, `STREAK ${streak}`, 115, 141, { align: 'center', color: P.goldL, outline: P.outline });
    }
    if (save.wallet > 0) {
      const txt = String(save.wallet), w = F.width(txt) + 16;
      fishIcon(g, 45 - w / 2, 140);
      F.draw(g, txt, 45 - w / 2 + 16, 141, { color: P.white, outline: P.outline });
    }
    // boss day: a big button; otherwise the week meter (6 learning days, then Murk)
    const bossBtn = boss.ready
      ? { id: 'boss', label: 'BOSS DAY!', x: 82, y: 131, w: 66, h: 13, style: 'primary' }
      : { id: 'boss', x: 84, y: 148, w: 64, h: 11, draw: HH.Boss.meter };
    return [
      bossBtn,
      { id: 'help', x: 136, y: 4, w: 20, h: 20, draw: helpBadge },
      { id: 'play', label: 'CRUISE', x: 12, y: 106, w: 66, h: 22, style: 'primary', scale: 2 },
      { id: 'words', label: 'WORDS', x: 82, y: 106, w: 66, h: 22, style: 'teal', scale: 2 },
      { id: 'shop', label: 'SHOP', x: 6, y: 228, w: 46, h: 15 },
      { id: 'wordbook', label: 'FLIPBOOK', x: 57, y: 228, w: 46, h: 15 },
      { id: 'settings', label: 'OPTIONS', x: 108, y: 228, w: 46, h: 15 },
    ];
  }

  // ---------------------------------------------------------------------------
  // Options: sound, plus how many NEW words Word Mode brings each day.
  // ---------------------------------------------------------------------------
  function settings(g, t, save) {
    const track = [1, 2, 3].includes(save.musicTrack) ? save.musicTrack : 1;
    const S = HH.Study, goal = S.dailyGoal(save);
    panel(g, 18, 36, 124, 184);
    F.draw(g, 'OPTIONS', V.W / 2, 46, { align: 'center', scale: 2, color: P.outline });
    F.draw(g, 'MUSIC', 30, 72, { color: P.outline });
    F.draw(g, 'SONG', 30, 94, { color: P.outline });
    F.draw(g, 'SOUND FX', 30, 116, { color: P.outline });

    // NEW WORDS A DAY  [-] 3 [+]
    g.fillStyle = P.tealD; g.fillRect(28, 133, 104, 1);       // a thin line between sound and study
    F.draw(g, 'WORDS A DAY', 30, 146, { color: P.outline });
    F.draw(g, String(goal), 113, 143, { align: 'center', scale: 2, color: P.tealD });
    // under the number: the range, or MAX / MIN at either end
    const tag = goal >= S.DAILY_MAX ? 'MAX' : goal <= S.DAILY_MIN ? 'MIN' : `${S.DAILY_MIN} TO ${S.DAILY_MAX}`;
    F.draw(g, tag, 113, 158, { align: 'center', color: goal >= S.DAILY_MAX ? P.coralD : '#9e9486' });
    // what the choice means: how long the whole list takes at this pace
    const left = HH.WORDS.length - S.learnedCount(save);
    const n = (x) => String(x).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const info = left <= 0 ? 'EVERY WORD LEARNED. REVIEWS KEEP THEM FRESH.'
      : `AT ${goal} A DAY: ${left === HH.WORDS.length ? 'ALL WORDS' : n(left) + ' MORE WORDS'} IN ABOUT ${n(S.daysToFinish(save))} DAYS. REVIEWS COME DAILY.`;
    wrap(info, 26).slice(0, 4).forEach((l, i) => F.draw(g, l, 30, 168 + i * 7, { color: '#9e9486' }));

    return [
      { id: 'music', label: save.music ? 'ON' : 'OFF', x: 96, y: 67, w: 34, h: 15, style: save.music ? 'primary' : 'normal' },
      { id: 'track1', label: '1', x: 84, y: 89, w: 14, h: 15, style: track === 1 ? 'primary' : 'normal' },
      { id: 'track2', label: '2', x: 100, y: 89, w: 14, h: 15, style: track === 2 ? 'primary' : 'normal' },
      { id: 'track3', label: '3', x: 116, y: 89, w: 14, h: 15, style: track === 3 ? 'primary' : 'normal' },
      { id: 'sfx', label: save.sfx ? 'ON' : 'OFF', x: 96, y: 111, w: 34, h: 15, style: save.sfx ? 'primary' : 'normal' },
      { id: 'dailyDown', label: '-', x: 92, y: 141, w: 13, h: 15, disabled: goal <= S.DAILY_MIN },
      { id: 'dailyUp', label: '+', x: 121, y: 141, w: 13, h: 15, disabled: goal >= S.DAILY_MAX },
      { id: 'back', label: 'BACK', x: 50, y: 199, w: 60, h: 15 },
    ];
  }

  // ---------------------------------------------------------------------------
  // Ocean Discovery Journal: the collection, facts, and dress-up looks.
  // Ocean facts are found one a day, by finishing a word in Word Mode.
  // ---------------------------------------------------------------------------
  // The shop: [id, name, price in fish]. Prices are long-term goals on
  // purpose. A typical run earns somewhere between 50 and 250 fish.
  const SHOP = [
    // Prices tripled (Oct 2026) so the whole collection takes about two years
    // of regular play: roughly 150,000 fish at about 200 fish a day.
    ['none', 'NONE', 0], ['bow', 'BOW', 900], ['flower', 'FLOWER', 2100],
    ['scarf', 'TINY SCARF', 2700], ['shades', 'SHADES', 3600], ['tophat', 'MINI TOP HAT', 3600],
    ['headphones', 'HEADPHONES', 4500], ['frog', 'FROG HAT', 6000], ['hat', 'SUN HAT', 7500],
    ['pirate', 'PIRATE HAT', 9000], ['mushroom', 'MUSHROOM HAT', 10500], ['sushi', 'SUSHI HAT', 12000],
    ['crown', 'KELP CROWN', 15000], ['shark', 'SHARK HOODIE', 18000], ['ufo', 'UFO HAT', 24000],
    ['pancake', 'PANCAKES', 30000],
    // the graduation cap cannot be bought: it is earned by learning every word
    ['mortarboard', 'GRAD CAP', -1],
  ];

  // ---------------------------------------------------------------------------
  // The shop: a big try-on preview at the top, every look in a grid below.
  // Tap a look to try it on; BUY spends fish from your bucket.
  // ---------------------------------------------------------------------------
  function shopScreen(g, t, save, shop, preview) {
    panel(g, 6, 6, 148, 244);
    F.draw(g, 'SEAL SHOP', 12, 12, { scale: 2, color: P.outline });
    fishIcon(g, 108, 13);
    F.draw(g, String(save.wallet), 148, 15, { align: 'right', color: P.coralD });

    // try-on mirror
    panel(g, 12, 28, 62, 66, '#f3fbf9', P.tealD);
    preview(g, 43, 90);

    const item = SHOP.find(([id]) => id === shop.sel) || SHOP[0];
    const owned = item[0] === 'none' || !!save.cosmetics[item[0]];
    F.draw(g, item[1], 80, 32, { color: P.outline });
    const btns = [];
    if (!owned && item[2] < 0) {
      // earned, not bought
      wrap(`LEARN ALL ${HH.WORDS.length.toLocaleString('en-US')} WORDS TO GRADUATE. IT CANNOT BE BOUGHT.`, 16).forEach((l, i) => F.draw(g, l, 80, 40 + i * 7, { color: P.tealD }));
      F.draw(g, `WORDS: ${HH.Study.learnedCount(save)}`, 80, 84, { color: '#9e9486' });
    } else if (!owned) {
      fishIcon(g, 80, 40);
      F.draw(g, String(item[2]), 96, 42, { color: save.wallet >= item[2] ? P.tealD : P.coralD });
      btns.push({ id: 'buy', label: 'BUY', x: 80, y: 52, w: 66, h: 15, style: save.wallet >= item[2] ? 'primary' : 'normal' });
      if (save.wallet < item[2] && !shop.msg) {
        wrap(`${item[2] - save.wallet} MORE FISH TO GO`, 16).forEach((l, i) => F.draw(g, l, 80, 74 + i * 7, { color: '#9e9486' }));
      }
    } else {
      F.draw(g, save.equipped === item[0] ? 'WEARING IT!' : 'YOURS!', 80, 42, { color: P.tealD });
      if (save.equipped !== item[0]) btns.push({ id: 'wear:' + item[0], label: 'WEAR', x: 80, y: 52, w: 66, h: 15, style: 'primary' });
    }
    if (shop.msg) wrap(shop.msg, 16).forEach((l, i) => F.draw(g, l, 80, 74 + i * 7, { color: P.coralD }));

    // every look, cheapest first
    SHOP.forEach(([id, name], i) => {
      const own = id === 'none' || !!save.cosmetics[id];
      btns.push({
        id: 'wear:' + id, label: name, x: 11 + (i % 2) * 70, y: 99 + Math.floor(i / 2) * 14, w: 68, h: 12,
        style: save.equipped === id ? 'primary' : own ? 'normal' : 'ghost',
      });
    });
    btns.push({ id: 'back', label: 'BACK', x: 56, y: 230, w: 48, h: 13 });
    return btns;
  }

  function journal(g, t, save, page) {
    panel(g, 6, 6, 148, 212);
    F.draw(g, 'OCEAN JOURNAL', V.W / 2, 12, { align: 'center', scale: 2, color: P.outline });

    // the collection: two columns of treasures and how many you've found
    const rows = [
      ['fish', 'FISH', HH.Sprites.fish()], ['shrimp', 'SHRIMP', HH.Sprites.shrimp()],
      ['squid', 'SQUID', HH.Sprites.squid()], ['gold', 'GOLDEN', HH.Sprites.goldFish()],
      ['glass', 'SEA GLASS', HH.Sprites.seaGlass()], ['pearl', 'PEARL', HH.Sprites.pearl(0)],
    ];
    rows.forEach(([k, name, spr], i) => {
      const x = 12 + (i % 2) * 70, y = 28 + Math.floor(i / 2) * 11;
      const n = save.totals[k] || 0;
      const known = n > 0 || k === 'fish' || k === 'shrimp';
      g.globalAlpha = known ? 1 : 0.35;
      g.drawImage(spr, x + Math.round((13 - spr.width) / 2), y + Math.round((8 - spr.height) / 2));
      g.globalAlpha = 1;
      F.draw(g, known ? name : '???', x + 16, y + 1, { color: P.outline });
      F.draw(g, String(n), x + 66, y + 1, { align: 'right', color: n ? P.coralD : '#b9ad9c' });
    });
    F.draw(g, `BEST ${save.bestDist} M`, 12, 64, { color: '#8a8173' });
    fishIcon(g, 108, 62);
    F.draw(g, String(save.wallet), 148, 64, { align: 'right', color: P.coralD });

    // ocean facts, one card at a time
    g.fillStyle = P.uiPanelD; g.fillRect(12, 72, 136, 1);
    // only the facts you have found (never how many are left), newest last
    const list = save.facts.map((id) => HH.FACTS.find((f) => f.id === id)).filter(Boolean);
    const found = list.length;
    F.draw(g, 'OCEAN FACTS', 12, 76, { color: P.outline });
    F.draw(g, `${found} FOUND`, 148, 76, { align: 'right', color: '#8a8173' });
    panel(g, 12, 84, 136, 88, '#f3fbf9', P.tealD);
    const unlocked = found > 0;
    const fact = list[page % Math.max(1, found)];
    if (unlocked) {
      F.draw(g, fact.title, 18, 89, { color: P.tealD });
      richText(g, fact.text, fact.word, 18, 97, 31, 7, P.outline, P.tealD);
      F.draw(g, `SOURCE: ${fact.src}`, 18, 160, { color: '#8a8173' });      // where the fact comes from
    } else {
      F.draw(g, 'NO FACTS YET', 18, 89, { color: P.tealD });
      wrap('FINISH A WORD IN WORD MODE TO FIND TODAY\'S OCEAN FACT. ONE NEW FACT EVERY DAY YOU STUDY.', 31)
        .forEach((line, i) => F.draw(g, line, 18, 99 + i * 6, { color: '#9aa9a6' }));
    }
    if (found) F.draw(g, `${(page % found) + 1} / ${found}`, V.W / 2, 180, { align: 'center', color: '#8a8173' });

    const btns = [
      { id: 'factPrev', label: '<', x: 12, y: 177, w: 24, h: 12 },
      { id: 'factNext', label: '>', x: 124, y: 177, w: 24, h: 12 },
    ];
    btns.push({ id: 'toBook', label: 'BACK', x: 56, y: 197, w: 48, h: 13 });
    return btns;
  }

  // ---------------------------------------------------------------------------
  // Help: how each mode works, and a plain promise about privacy.
  // ---------------------------------------------------------------------------
  const HELP = [
    ['CRUISE', [
      'TAP TO HOP. SLIDE YOUR THUMB (OR USE THE ARROWS) TO STEER.',
      'HOP OVER LOGS, ROCKS AND CRABS. STEER AROUND BIG BOULDERS.',
      'EVERY BUMP COSTS A HEART. YOU HAVE 3.',
      'CATCH FISH AND TREATS, THEN SPEND THEM IN THE SEAL SHOP.',
      'TAP JUST AS YOU LAND TO BUILD RHYTHM AND HOP HIGHER.',
      'HOW FAR CAN YOU GO?',
    ]],
    ['WORDS', [
      'SPELL THE WORD FROM MEMORY: SCOOT INTO ITS LETTERS IN ORDER.',
      'HOP OVER A ROW TO SKIP IT.',
      'RIGHT LETTER: 3 FISH. WRONG LETTER: -1 HEART.',
      'PICK 1 TO 5 NEW WORDS A DAY IN OPTIONS.',
      'AFTER 6 STUDY DAYS COMES BOSS DAY WITH MURK.',
      'LEARN ALL 3,000 WORDS TO EARN THE GRAD CAP.',
    ]],
    ['PRIVACY', [
      'HARBOR HOP DOES NOT COLLECT ANY DATA ABOUT YOU.',
      'NO ACCOUNTS, NO ADS, NO TRACKING.',
      'YOUR PROGRESS IS SAVED ON YOUR DEVICE AND IN YOUR OWN ICLOUD, SO IT FOLLOWS YOU TO A NEW PHONE OR IPAD.',
      'WE CANNOT SEE YOUR ICLOUD DATA. ONLY YOU CAN.',
      'DELETE THE GAME AND YOUR ICLOUD DATA TO ERASE YOUR PROGRESS.',
    ]],
  ];

  // First launch: a one-time note that nothing about the player is collected.
  function privacyNote(g, t) {
    panel(g, 14, 46, 132, 150);
    F.draw(g, 'HELLO!', V.W / 2, 56, { align: 'center', scale: 2, color: P.tealD });
    let y = 76;
    [
      'HARBOR HOP SAVES YOUR PROGRESS ON THIS DEVICE ONLY.',
      'NO ACCOUNTS, NO ADS, NO TRACKING, NO COOKIES. NOTHING ABOUT YOU IS SENT ANYWHERE.',
      'CLEARING THIS SITE\'S DATA IN YOUR BROWSER ERASES YOUR PROGRESS.',
    ].forEach((p) => { wrap(p, 28).forEach((l) => { F.draw(g, l, 22, y, { color: P.outline }); y += 7; }); y += 5; });
    return [{ id: 'privacyOk', label: 'OK!', x: 40, y: 172, w: 80, h: 17, style: 'teal' }];
  }

  function help(g, t, page) {
    panel(g, 6, 6, 148, 208);
    F.draw(g, page === 2 ? 'YOUR PRIVACY' : 'HOW TO PLAY', V.W / 2, 12, { align: 'center', scale: 2, color: P.outline });
    const btns = HELP.map(([name], i) => ({
      id: 'help' + i, label: name, x: 12 + i * 46, y: 28, w: 44, h: 13, style: i === page ? 'teal' : 'normal',
    }));
    panel(g, 12, 46, 136, 140, '#f3fbf9', P.tealD);
    let y = 52;
    for (const tip of HELP[page][1]) {
      const lines = wrap(tip, 30);
      g.fillStyle = P.teal; g.fillRect(17, y + 2, 2, 2);                 // bullet
      lines.forEach((l, i) => F.draw(g, l, 22, y + i * 7, { color: P.outline }));
      y += lines.length * 7 + 5;
    }
    btns.push({ id: 'back', label: 'BACK', x: 56, y: 192, w: 48, h: 14 });
    return btns;
  }

  // ===========================================================================
  // WORD MODE screens
  // ===========================================================================
  const POS_NAME = { n: 'NOUN', v: 'VERB', adj: 'ADJECTIVE', adv: 'ADVERB', conj: 'CONJUNCTION' };
  const CHALK = '#fbf8ec', CHALK2 = '#b9d8cf', BOARD = '#2e5b52';
  const FLY_TIME = 0.45;          // seconds for a letter to fly down to its slot

  // Where letter `idx` of an n-letter word sits in the bottom tray.
  function slotPos(n, idx) {
    const pitch = 9, total = n * pitch - 3;
    return { x: Math.round(V.W / 2 - total / 2) + idx * pitch + 3, y: 236 };
  }

  // A wooden-framed chalkboard.
  function chalkboard(g, x, y, w, h) {
    g.fillStyle = 'rgba(43, 45, 72, 0.3)'; g.fillRect(x + 2, y + h, w - 2, 2);
    g.fillStyle = P.outline; g.fillRect(x, y, w, h);
    g.fillStyle = P.wood; g.fillRect(x + 1, y + 1, w - 2, h - 2);
    g.fillStyle = P.woodL; g.fillRect(x + 1, y + 1, w - 2, 1);
    g.fillStyle = P.outline; g.fillRect(x + 4, y + 4, w - 8, h - 8);
    g.fillStyle = BOARD; g.fillRect(x + 5, y + 5, w - 10, h - 10);
    g.fillStyle = '#356759';                                   // soft chalk-dust smudges
    g.fillRect(x + 12, y + h - 8, 22, 1); g.fillRect(x + w - 40, y + 7, 18, 1);
  }

  // A thin pointer stick, drawn pixel by pixel from (x0, y0) to (x1, y1).
  function pointer(g, x0, y0, x1, y1) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + (x1 - x0) * i / n), y = Math.round(y0 + (y1 - y0) * i / n);
      g.fillStyle = P.outline; g.fillRect(x - 1, y - 1, 3, 3);
    }
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + (x1 - x0) * i / n), y = Math.round(y0 + (y1 - y0) * i / n);
      g.fillStyle = i > n - 4 ? P.white : P.woodD; g.fillRect(x, y, 1, 1);
    }
  }

  // A seal flipper curled around the pointer's handle.
  function Entities_grip(g, x, y) {
    HH.Entities.pixelEllipse(g, x, y, 3.5, 3, P.outline);
    HH.Entities.pixelEllipse(g, x, y, 2.5, 2, P.sealDark);
    g.fillStyle = '#7a83a1'; g.fillRect(Math.round(x) - 2, Math.round(y) - 2, 3, 1);   // a little shine
  }

  // THE LESSON: Professor Seal points at today's word on the board.
  function lesson(g, t, wm, age, drawProf) {
    g.fillStyle = 'rgba(43, 45, 72, 0.42)';
    g.fillRect(0, 0, V.W, V.H);
    const e = wm.entry;
    const meaning = wrap(e[2].toUpperCase(), 33), ex = wrap(`"${e[3].toUpperCase()}"`, 33).slice(0, 6);
    // the board grows to fit the meaning and the example sentence
    const bx = 6, by = 8, bw = 148, bh = Math.max(96, 70 + (meaning.length + ex.length) * 7);
    chalkboard(g, bx, by, bw, bh);
    F.draw(g, wm.ghost ? 'NEW WORD' : 'PRACTICE', bx + 9, by + 9, { color: wm.ghost ? P.seafoam : P.gold });
    F.draw(g, wm.weekLabel || `WORD ${wm.count + 1}`, bx + bw - 9, by + 9, { align: 'right', color: '#7fa79c' });
    // the word, written large; it wobbles in like fresh chalk
    const pop = Math.max(0, 1 - age * 3);
    F.draw(g, e[0], V.W / 2, by + 22 - Math.round(pop * 4), { align: 'center', scale: 2, color: CHALK });
    F.draw(g, POS_NAME[e[1]] || e[1].toUpperCase(), V.W / 2, by + 37, { align: 'center', color: P.seafoam });
    g.fillStyle = '#6f9a8f';
    for (let x = bx + 12; x < bx + bw - 12; x += 4) g.fillRect(x, by + 46, 2, 1);
    let y = by + 52;
    meaning.forEach((l) => { F.draw(g, l, bx + 10, y, { color: CHALK }); y += 7; });
    y += 4;
    ex.forEach((l) => { F.draw(g, l, bx + 10, y, { color: CHALK2 }); y += 7; });
    // the chalk tray
    g.fillStyle = P.outline; g.fillRect(bx + 18, by + bh - 1, bw - 36, 4);
    g.fillStyle = P.woodL; g.fillRect(bx + 19, by + bh - 1, bw - 38, 2);
    g.fillStyle = P.white; g.fillRect(bx + 30, by + bh - 3, 6, 2);

    // Professor Seal stands under the board, holding a pointer in one
    // raised flipper and tapping the board with it
    const base = by + bh + 76;
    const hand = drawProf(g, 116, base);                  // where the raised flipper is
    const tap = Math.round(Math.max(0, Math.sin(t * 5)) * 2);
    // the stick is rigid: its tip moves with the flipper, so it keeps its
    // length when the professor hops (and lifts off the board for a moment)
    const tipX = 70 - tap + (hand.x - hand.rest.x), tipY = by + bh - 5 - tap + (hand.y - hand.rest.y);
    // the handle pokes out a little past the flipper, so the stick reads as held
    const dx = hand.x - tipX, dy = hand.y - tipY, len = Math.hypot(dx, dy);
    pointer(g, Math.round(hand.x + dx / len * 5), Math.round(hand.y + dy / len * 5), tipX, tipY);
    // the flipper wraps around the end of the stick, drawn on top so it grips it
    Entities_grip(g, hand.x, hand.y);

    const n = e[0].length, ty = by + bh + 14;
    F.draw(g, `${n} LETTERS`, 10, ty, { color: P.white, outline: P.outline });
    F.draw(g, `+${HH.Study.LETTER_FISH} FISH EACH`, 10, ty + 9, { color: P.goldL, outline: P.outline });
    F.draw(g, 'WRONG LETTER', 10, ty + 18, { color: P.uiPanel, outline: P.outline });
    F.draw(g, '= -1 HEART', 10, ty + 26, { color: P.uiPanel, outline: P.outline });
    const btns = [{ id: 'pause', x: 137, y: 230, w: 20, h: 20, draw: lifeRing }];
    if (age > 0.35) btns.unshift({ id: 'spell', label: 'SPELL IT!', x: 6, y: 222, w: 84, h: 24, style: 'teal', scale: 2 });
    return btns;
  }

  // In-game HUD for Word Mode: words this run, hearts, fish, and the letter
  // tray at the bottom where the word builds up.
  function wordHud(g, t, st, maxHearts) {
    const wm = st.wm, out = { color: P.white, outline: P.outline };
    const txt = `${wm.count} ${wm.count === 1 ? 'WORD' : 'WORDS'}`;
    plank(g, 3, 3, F.width(txt, 2) + 12, 16);
    F.draw(g, txt, 9, 6, { scale: 2, color: P.woodD });
    const ry = 26;
    for (let i = 0; i < maxHearts; i++) {
      const full = i < st.hearts;
      const justLost = i === st.hearts && st.heartLostT > 0;
      if (justLost && Math.floor(t * 12) % 2) continue;
      const beat = full && st.hearts === 1 && Math.floor(t * 3) % 2 ? -1 : 0;
      heartIcon(g, 8 + i * 10, ry + beat, full || justLost);
    }
    const fx = 8 + maxHearts * 10;
    fishIcon(g, fx - 2, ry - 3);
    F.draw(g, String(st.bank), fx + 13, ry - 2, out);

    if (st.toastT > 0 && !(st.toastT < 0.3 && Math.floor(t * 20) % 2)) {
      F.draw(g, st.toast, V.W / 2, 50, { align: 'center', color: P.uiPanel, outline: P.outline });
    }
    if (wm.count === 0 && wm.got === 0 && wm.started && st.dist < 40) {
      F.draw(g, 'SCOOT INTO THE NEXT LETTER', V.W / 2, 64, Object.assign({ align: 'center' }, out));
      F.draw(g, 'HOP OVER A ROW TO SKIP IT', V.W / 2, 73, Object.assign({ align: 'center' }, out));
    }

    // the tray: the meaning on top, one slot per letter below
    const n = wm.w.length;
    panel(g, 4, 213, 152, 40);
    const m = wm.entry[2].toUpperCase();
    let short = m;                                     // the meaning, as a reminder (cut to fit)
    while (F.width(short) > 146 && short.includes(' ')) short = short.slice(0, short.lastIndexOf(' ')).replace(/[,;:]$/, '') + '...';
    if (short.endsWith('......')) short = short.replace(/\.{6}$/, '...');
    F.draw(g, short, V.W / 2, 218, { align: 'center', color: '#8a8173' });
    const done = wm.doneT > 0;
    for (let i = 0; i < n; i++) {
      const p = slotPos(n, i);
      const filled = i < wm.shown;
      const since = wm.pops[i] !== undefined ? t - wm.pops[i] : 9;
      // THE STAMP: the letter lands, squashes down 1px, springs up, then settles
      const lift = since < 0.06 ? 1 : since < 0.18 ? -2 : since < 0.3 ? -1 : 0;
      const wave = done ? Math.round(Math.sin(t * 9 - i * 0.7) * 1.5) : 0;
      g.fillStyle = since < 0.25 ? P.gold : filled ? P.tealD : '#cdbfa7';   // the slot line flashes gold
      g.fillRect(p.x - 3, p.y + 11, 7, 1);                             // the slot line
      if (since < 0.22) {                                              // little impact marks fly out sideways
        const k = Math.floor(since * 20);
        g.fillStyle = P.gold;
        g.fillRect(p.x - 5 - k, p.y + 9, 1, 1); g.fillRect(p.x + 5 + k, p.y + 9, 1, 1);
        g.fillRect(p.x - 4 - k, p.y + 6, 1, 1); g.fillRect(p.x + 4 + k, p.y + 6, 1, 1);
      }
      // empty slots stay blank: players spell the word from memory
      if (filled) F.draw(g, wm.w[i], p.x, p.y + lift + wave, { align: 'center', scale: 2, color: done ? P.tealD : P.outline });
      // AFTER A MISS: the right letter appears faintly in its slot, then fades.
      // It is drawn in pale coral so it never looks like a letter you earned.
      const rv = wm.reveal;
      if (!filled && rv && rv.idx === i) {
        const age = t - rv.t, SHOW = 1.6;
        if (age < SHOW && !(age > SHOW - 0.4 && Math.floor(age * 12) % 2)) {   // blinks out at the end
          F.draw(g, rv.ch, p.x, p.y, { align: 'center', scale: 2, color: '#f2b8a8' });
          g.fillStyle = P.coral; g.fillRect(p.x - 3, p.y + 11, 7, 1);         // the slot line turns coral
        }
      }
    }
    // letters on their way down from the seal
    for (const f of wm.fly) {
      const k = Math.min(1, f.t / FLY_TIME), e = 1 - (1 - k) * (1 - k);
      const p = slotPos(n, f.idx);
      const x = f.x0 + (p.x - f.x0) * e, y = f.y0 + (p.y - f.y0) * e - Math.sin(k * Math.PI) * 18;
      F.draw(g, f.ch, x, y, { align: 'center', scale: 2, color: P.white, outline: P.outline });
    }
    return [{ id: 'pause', x: 137, y: 2, w: 20, h: 20, draw: lifeRing }];
  }

  // Word Mode results: what you spelled, what to practise, and your progress.
  function wordOver(g, t, r, age) {
    const slide = Math.max(0, 1 - age * 5);
    const y0 = 8 - Math.round(slide * slide * 190);
    panel(g, 10, y0, 140, 176);
    // r.dayDone: today's words are finished (a happy ending, not a flop)
    F.draw(g, r.dayDone ? 'ALL DONE TODAY!' : 'BELLY FLOP!', V.W / 2, y0 + 6, { align: 'center', scale: 2, color: r.dayDone ? P.tealD : P.coral, shadow: P.uiPanelD });
    F.draw(g, r.dayDone ? "TODAY'S WORDS" : 'WORDS SPELLED', V.W / 2, y0 + 21, { align: 'center', color: '#8a8173' });
    F.draw(g, String(r.done.length), V.W / 2, y0 + 28, { align: 'center', scale: 3, color: P.outline });
    F.draw(g, `YOU HAVE LEARNED ${r.learned} ${r.learned === 1 ? 'WORD' : 'WORDS'}`, V.W / 2, y0 + 47, { align: 'center', color: P.tealD });
    if (r.streak > 0) F.draw(g, `DAY STREAK: ${r.streak}`, V.W / 2, y0 + 55, { align: 'center', color: P.coralD });
    g.fillStyle = P.uiPanelD; g.fillRect(18, y0 + 63, 124, 1);
    let y = y0 + 67;
    const list = (label, words, color) => {
      const lines = wrap(`${label} ${words.length ? words.join(', ') : '-'}`, 30).slice(0, 2);
      lines.forEach((l, i) => F.draw(g, l, 20, y + i * 7, { color: i === 0 ? color : P.outline }));
      y += 15;
    };
    list(r.dayDone ? 'TODAY:' : 'SPELLED:', r.done, P.tealD);
    if (r.practice.length) list('PRACTICE:', r.practice, P.coralD);
    else { F.draw(g, 'NOTHING TO PRACTICE!', 20, y, { color: P.tealD }); y += 15; }
    g.fillStyle = P.uiPanelD; g.fillRect(18, y0 + 98, 124, 1);
    const line = (label, value, yy) => {
      F.draw(g, label, 20, yy, { color: '#8a8173' });
      F.draw(g, value, 140, yy, { align: 'right', color: P.outline });
    };
    line('FISH CAUGHT', `+${r.earned}`, y0 + 102);
    line('IN YOUR BUCKET', String(r.wallet), y0 + 110);
    const extra = [];
    // the first word of the day finds an ocean fact: a button to read it
    if (r.newFacts) extra.push({ id: 'seeFact', label: 'NEW OCEAN FACT!', x: 30, y: y0 + 117, w: 100, h: 10, style: 'primary' });
    if (r.dayDone) return [...extra,
      { id: 'menu', label: 'SEE YOU TOMORROW', x: 18, y: y0 + 128, w: 124, h: 21, style: 'teal' },
      { id: 'again', label: 'PRACTICE', x: 18, y: y0 + 156, w: 46, h: 13 },
      { id: 'shop', label: 'SHOP', x: 67, y: y0 + 156, w: 26, h: 13 },
      { id: 'wordbook', label: 'FLIPBOOK', x: 96, y: y0 + 156, w: 46, h: 13 },
    ];
    return [...extra,
      { id: 'again', label: 'HOP AGAIN', x: 18, y: y0 + 128, w: 124, h: 21, style: 'teal', scale: 2 },
      { id: 'menu', label: 'MENU', x: 18, y: y0 + 156, w: 34, h: 13 },
      { id: 'shop', label: 'SHOP', x: 56, y: y0 + 156, w: 36, h: 13 },
      { id: 'wordbook', label: 'FLIPBOOK', x: 96, y: y0 + 156, w: 46, h: 13 },
    ];
  }

  // THE FLIPBOOK (a seal has flippers, and you flip through it): the word
  // review book. Two ways to look back:
  //   BY DAY  - every day you played, newest first, with each word you worked on
  //             and how it went (tap a word to see its card)
  //   A TO Z  - every word you have learned, one card at a time
  // It only ever counts what you have learned, never how many are left.
  const HOW = {
    got: ['GOT IT', P.tealD],
    tricky: ['TRICKY', P.goldD],
    notyet: ['NOT YET', P.coralD],
  };
  function howIcon(g, x, y, how) {
    const c = HOW[how][1];
    g.fillStyle = c;
    if (how === 'got') {                                   // a little tick
      g.fillRect(x, y + 2, 1, 1); g.fillRect(x + 1, y + 3, 1, 1); g.fillRect(x + 2, y + 2, 1, 1);
      g.fillRect(x + 3, y + 1, 1, 1); g.fillRect(x + 4, y, 1, 1);
    } else if (how === 'tricky') {                         // a dot
      g.fillRect(x + 1, y, 3, 4); g.fillRect(x, y + 1, 5, 2);
    } else {                                               // a dash
      g.fillRect(x, y + 2, 5, 1);
    }
  }

  // One word's card: the word, its part of speech, meaning and example.
  function wordCard(g, save, e, top, bottom) {
    F.draw(g, e[0], 18, top, { scale: 2, color: P.outline });
    if (HH.Study.mastered(save, e[0])) F.draw(g, '* MASTERED', 142, top + 13, { align: 'right', color: P.goldD });
    F.draw(g, POS_NAME[e[1]] || '', 18, top + 13, { color: P.tealD });
    let y = top + 22;
    wrap(e[2].toUpperCase(), 30).forEach((l) => { F.draw(g, l, 18, y, { color: P.outline }); y += 7; });
    y += 3;
    wrap(`"${e[3].toUpperCase()}"`, 30).slice(0, Math.max(0, Math.floor((bottom - y) / 7)))
      .forEach((l) => { F.draw(g, l, 18, y, { color: '#8a8173' }); y += 7; });
  }

  function wordBook(g, t, save, book) {
    panel(g, 6, 6, 148, 212);
    F.draw(g, 'FLIPBOOK', V.W / 2, 12, { align: 'center', scale: 2, color: P.outline });
    F.draw(g, `WORDS LEARNED: ${HH.Study.learnedCount(save)}`, V.W / 2, 27, { align: 'center', color: P.tealD });
    const btns = [
      { id: 'bookDays', label: 'BY DAY', x: 12, y: 36, w: 66, h: 12, style: book.tab === 'days' ? 'teal' : 'normal' },
      { id: 'bookAz', label: 'A TO Z', x: 82, y: 36, w: 66, h: 12, style: book.tab === 'az' ? 'teal' : 'normal' },
    ];
    panel(g, 12, 53, 136, 141, '#f3fbf9', P.tealD);
    const empty = () => wrap('SPELL WORDS IN WORD MODE AND THEY WILL APPEAR HERE.', 30)
      .forEach((l, i) => F.draw(g, l, 18, 62 + i * 7, { color: '#9aa9a6' }));

    if (book.word) {
      // a single word's card, opened from the day list
      wordCard(g, save, HH.Study.entry(book.word) || [book.word, '', '', ''], 59, 168);
      btns.push({ id: 'cardBack', label: '< LIST', x: 18, y: 172, w: 44, h: 12 });
    } else if (book.tab === 'days') {
      const days = HH.Study.history(save);
      if (!days.length) empty();
      else {
        const di = Math.min(book.day, days.length - 1), d = days[di];
        F.draw(g, HH.Study.dayLabel(d.day), V.W / 2, 59, { align: 'center', color: P.outline });
        F.draw(g, `${d.words.length} ${d.words.length === 1 ? 'WORD' : 'WORDS'}`, V.W / 2, 66, { align: 'center', color: '#8a8173' });
        if (di < days.length - 1) btns.push({ id: 'dayOlder', label: '<', x: 16, y: 58, w: 16, h: 12 });
        if (di > 0) btns.push({ id: 'dayNewer', label: '>', x: 128, y: 58, w: 16, h: 12 });
        const PER = 9, pages = Math.ceil(d.words.length / PER), pg = book.page % pages;
        d.words.slice(pg * PER, pg * PER + PER).forEach(([w, how], i) => {
          const y = 76 + i * 10;
          btns.push({
            id: 'pick:' + w, x: 16, y, w: 128, h: 9,
            draw: (gg, b) => {
              if (b.pressT > 0) { gg.fillStyle = '#dff3ef'; gg.fillRect(b.x, b.y, b.w, b.h); }
              howIcon(gg, b.x + 2, b.y + 2, how);
              F.draw(gg, w, b.x + 10, b.y + 2, { color: P.outline });
              F.draw(gg, HOW[how][0], b.x + b.w - 2, b.y + 2, { align: 'right', color: HOW[how][1] });
            },
          });
        });
        if (pages > 1) btns.push({ id: 'dayMore', label: `MORE (${pg + 1}/${pages})`, x: 40, y: 168, w: 80, h: 10 });
        // a review session: hop through just this day's words again
        btns.push({ id: 'review', label: `REVIEW ${d.words.length === 1 ? 'IT' : 'THEM'}!`, x: 30, y: 179, w: 100, h: 13, style: 'teal' });
      }
    } else {
      const list = HH.Study.learnedList(save);
      if (!list.length) empty();
      else {
        const i = book.az % list.length;
        wordCard(g, save, list[i], 59, 168);
        F.draw(g, `${i + 1} / ${list.length}`, V.W / 2, 175, { align: 'center', color: '#8a8173' });
        btns.push({ id: 'wordPrev', label: '<', x: 16, y: 172, w: 24, h: 12 }, { id: 'wordNext', label: '>', x: 120, y: 172, w: 24, h: 12 });
      }
    }
    // the Ocean Journal (treasures and sea facts) lives in here too
    btns.push({ id: 'journal', label: 'OCEAN FACTS', x: 12, y: 197, w: 72, h: 13 });
    btns.push({ id: 'bookBack', label: 'BACK', x: 90, y: 197, w: 58, h: 13 });
    return btns;
  }

  // ---------------------------------------------------------------------------
  // In-game HUD: distance in the middle, your best under it, fish and hearts on the left.
  // ---------------------------------------------------------------------------
  function hud(g, t, st, maxHearts, best) {
    const out = { color: P.white, outline: P.outline };

    // distance on a driftwood sign in the corner (the score)
    const txt = `${Math.floor(st.dist)} M`;
    const tw = F.width(txt, 2);
    plank(g, 3, 3, tw + 12, 16);
    F.draw(g, txt, 9, 6, { scale: 2, color: P.woodD });

    // your best, as a little tag under the sign (it turns gold once you pass it)
    if (best > 0) {
      const beaten = st.dist > best;
      F.draw(g, beaten ? 'NEW BEST!' : `BEST ${best} M`, 5, 23, { color: beaten ? P.gold : P.uiPanel, outline: P.outline });
    }

    // hearts and fish in one row: full, empty, and the one you just lost blinks away
    const ry = best > 0 ? 35 : 26;
    for (let i = 0; i < maxHearts; i++) {
      const full = i < st.hearts;
      const justLost = i === st.hearts && st.heartLostT > 0;
      if (justLost && Math.floor(t * 12) % 2) continue;
      // the last heart beats gently, so you know it's precious
      const beat = full && st.hearts === 1 && Math.floor(t * 3) % 2 ? -1 : 0;
      heartIcon(g, 8 + i * 10, ry + beat, full || justLost);
    }
    let fx = 8 + maxHearts * 10;
    if (st.shield) { bubbleIcon(g, fx, ry, t); fx += 10; }
    fishIcon(g, fx - 2, ry - 3);
    F.draw(g, String(st.eaten), fx + 13, ry - 2, out);

    // short, quiet notes (never blocking the view)
    if (st.toastT > 0 && !(st.toastT < 0.3 && Math.floor(t * 20) % 2)) {
      F.draw(g, st.toast, V.W / 2, 50, { align: 'center', color: P.uiPanel, outline: P.outline });
    }

    // rhythm pips: three little notes under the seal
    for (let i = 0; i < 3; i++) {
      const on = i < st.rhythm;
      const x = V.W / 2 - 8 + i * 7, yy = 247;
      g.fillStyle = P.outline; g.fillRect(x - 1, yy - 1, 5, 5);
      g.fillStyle = on ? (st.rhythm === 3 ? P.gold : P.coral) : P.sandD;
      g.fillRect(x, yy, 3, 3);
    }
    return [{ id: 'pause', x: 137, y: 2, w: 20, h: 20, draw: lifeRing }];
  }

  // a chunky 7x6 pixel heart
  function heartIcon(g, cx, cy, full) {
    const x = Math.round(cx) - 3, y = Math.round(cy) - 3;
    g.fillStyle = P.outline;
    g.fillRect(x, y + 1, 9, 3); g.fillRect(x + 1, y, 3, 1); g.fillRect(x + 5, y, 3, 1);
    g.fillRect(x + 1, y + 4, 7, 1); g.fillRect(x + 2, y + 5, 5, 1); g.fillRect(x + 3, y + 6, 3, 1); g.fillRect(x + 4, y + 7, 1, 1);
    g.fillStyle = full ? P.coral : '#e9dfcf';
    g.fillRect(x + 1, y + 1, 3, 1); g.fillRect(x + 5, y + 1, 3, 1);
    g.fillRect(x + 1, y + 2, 7, 2); g.fillRect(x + 2, y + 4, 5, 1); g.fillRect(x + 3, y + 5, 3, 1); g.fillRect(x + 4, y + 6, 1, 1);
    if (full) { g.fillStyle = '#ffd3cc'; g.fillRect(x + 2, y + 1, 1, 1); }
  }

  function bubbleIcon(g, cx, cy, t) {
    g.fillStyle = P.outline; g.fillRect(cx - 3, cy - 4, 7, 9); g.fillRect(cx - 4, cy - 3, 9, 7);
    g.fillStyle = '#9fe3f0'; g.fillRect(cx - 2, cy - 3, 5, 7); g.fillRect(cx - 3, cy - 2, 7, 5);
    g.fillStyle = P.white; g.fillRect(cx - 2, cy - 2, 2, 2);
  }

  // A shimmering bubble around the seal while a pearl protects it.
  function bubble(g, seal, t) {
    const cx = seal.x, cy = seal.top + 16, r = 19 + Math.sin(t * 4) * 0.8;
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r * 0.85);
      g.fillStyle = (i + Math.floor(t * 10)) % 8 < 2 ? P.white : '#9fe3f0';
      g.fillRect(x, y, 1, 1);
    }
    g.fillStyle = P.white;
    g.fillRect(Math.round(cx - r * 0.55), Math.round(cy - r * 0.55), 2, 1);
  }

  // Gentle hints during the first few metres, then they're gone for good.
  function hint(g, t, touch, stage) {
    const bob = Math.round(Math.sin(t * 5) * 2);
    if (stage === 0) {
      F.draw(g, 'TAP TO HOP', V.W / 2, 112 + bob, { align: 'center', scale: 2, color: P.white, outline: P.outline });
    }
    F.draw(g, touch ? 'SLIDE YOUR THUMB TO STEER' : 'MOVE MOUSE OR ARROWS TO STEER',
      V.W / 2, 130, { align: 'center', color: P.white, outline: P.outline });
  }

  // ---------------------------------------------------------------------------
  // Pause
  // ---------------------------------------------------------------------------
  function pause(g) {
    g.fillStyle = 'rgba(43, 45, 72, 0.45)';
    g.fillRect(0, 0, V.W, V.H);
    panel(g, 28, 70, 104, 108);
    F.draw(g, 'PAUSED', V.W / 2, 80, { align: 'center', scale: 2, color: P.outline });
    return [
      { id: 'resume', label: 'RESUME', x: 42, y: 100, w: 76, h: 16, style: 'primary' },
      { id: 'restart', label: 'RESTART', x: 42, y: 122, w: 76, h: 16 },
      { id: 'menu', label: 'MENU', x: 42, y: 144, w: 76, h: 16 },
    ];
  }

  // ---------------------------------------------------------------------------
  // Game over: shown above the flopped seal. HOP AGAIN is the big one.
  // ---------------------------------------------------------------------------
  function over(g, t, r, age) {
    const slide = Math.max(0, 1 - age * 5);
    const y0 = 8 - Math.round(slide * slide * 150);
    // a fact found on this run is the reward: it gets its own card
    const fact = r.newFacts ? HH.FACTS.find((f) => f.id === r.factId) : null;
    const cardH = fact ? factCardHeight(fact, 132) : 0;
    const sh = fact ? cardH - 5 : 0;                     // how far the rest moves down
    panel(g, 10, y0, 140, 146 + sh);
    F.draw(g, 'BELLY FLOP!', V.W / 2, y0 + 6, { align: 'center', scale: 2, color: P.coral, shadow: P.uiPanelD });

    // the distance counts up for a little moment of satisfaction
    const shown = Math.min(r.dist, Math.round(r.dist * Math.min(1, age / 0.7)));
    F.draw(g, 'YOU HOPPED', V.W / 2, y0 + 21, { align: 'center', color: '#8a8173' });
    F.draw(g, `${shown} M`, V.W / 2, y0 + 28, { align: 'center', scale: 3, color: P.outline });
    if (r.newBest && age > 0.7) {
      if (Math.floor(t * 3) % 2) F.draw(g, 'NEW BEST!', V.W / 2, y0 + 47, { align: 'center', color: P.coral });
    } else {
      F.draw(g, `BEST ${r.best} M`, V.W / 2, y0 + 47, { align: 'center', color: '#8a8173' });
    }
    g.fillStyle = P.uiPanelD; g.fillRect(18, y0 + 56, 124, 1);

    const line = (label, value, y) => {
      F.draw(g, label, 20, y, { color: '#8a8173' });
      F.draw(g, value, 140, y, { align: 'right', color: P.outline });
    };
    line('FISH CAUGHT', `+${r.earned}`, y0 + 61);
    line('IN YOUR BUCKET', String(r.wallet), y0 + 69);
    if (fact) factCard(g, fact, 14, y0 + 78, 132, r.newFacts > 1 ? `NEW OCEAN FACT! (+${r.newFacts - 1} MORE)` : 'NEW OCEAN FACT!');

    // one friendly tip for next time
    F.draw(g, r.tip, V.W / 2, y0 + 87 + sh, { align: 'center', color: '#9e9486' });

    return [
      { id: 'again', label: 'HOP AGAIN', x: 18, y: y0 + 97 + sh, w: 124, h: 21, style: 'primary', scale: 2 },
      { id: 'menu', label: 'MENU', x: 18, y: y0 + 125 + sh, w: 34, h: 13 },
      { id: 'shop', label: 'SHOP', x: 56, y: y0 + 125 + sh, w: 36, h: 13 },
      { id: 'wordbook', label: 'FLIPBOOK', x: 96, y: y0 + 125 + sh, w: 46, h: 13 },
    ];
  }

  return {
    panel, button, title, settings, journal, shopScreen, hud, bubble, hint, pause, over, wrap, SHOP,
    lesson, wordHud, wordOver, wordBook, slotPos, FLY_TIME, help,
    chalkboard, heartIcon, fishIcon, lifeRing, plank, CHALK, CHALK2,
    privacyNote,
  };
})();
