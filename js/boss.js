// boss.js
// WEEKLY BOSS ROUNDS: review words by RECOGNIZING them, not spelling them.
//
// Murk the Orca clouds the water. Each question shows a clue at the bottom
// of the screen, and rows of three WORD pills roll toward the seal. Scoot
// into the word that fits the clue:
//   right word -> a bubble blast hits Murk, and the water gets clearer
//   wrong word -> one heart, plus what that look-alike word really means
// Six hits win. Clues take turns: the word's MEANING, or its example
// sentence with the word blanked out. The wrong choices are words that LOOK
// alike (LUCID, LURID, LIVID), so players learn to tell them apart.
//
// WHEN AND WHICH WORDS: see "THE WEEKLY RHYTHM" in study.js. After 6
// learning days comes BOSS DAY: Word Mode opens with Murk instead of new
// words. Playing him (win or lose) counts as that day's study and keeps the
// streak. Boss day pays the most fish of the week:
//   right on the first try -> 10 fish   beating Murk -> 50 more
//   all 6 on the first try -> 25 more   (plus the daily streak bonus)
//   a missed word          -> comes back sooner in Word Mode
//
// BOSS PREVIEW plays the same round with sample words and saves nothing.
//
// It plugs into game.js through small hooks: button ids 'boss' /
// 'bossGo' / 'bossAgain', the 'bossCard' mode, the letter-catch event,
// and the results screen.

HH.Boss = (function () {
  const P = HH.PAL, F = HH.Font, V = HH.View;
  const BLAST_TIME = 0.5;                       // seconds for a bubble blast to reach Murk
  // boss day pays more than a normal day: it IS the day's study
  const FISH_RIGHT = 10, FISH_WIN = 50, FISH_PERFECT = 25;

  // ---------------------------------------------------------------------------
  // Building questions for any word
  // ---------------------------------------------------------------------------
  // How different two spellings are (edit distance).
  function lev(a, b) {
    const m = a.length, n = b.length;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  // The start of a word that its other forms share (ABRIDGE -> ABRI, ABRIDGED).
  const stem = (w) => w.toLowerCase().slice(0, w.length > 5 ? Math.max(4, w.length - 3) : Math.max(3, w.length - 1));

  // The meaning's key words, cut to 5 letters ("refusing" -> "refus"), to spot
  // look-alikes that also MEAN nearly the same thing (they would be unfair).
  const COMMON = new Set('about being something someone person people thing things other another their which while there where would could should without having makes making using often especially usually great small large state quality'.split(' '));
  const NOT = new Set(['unable', 'impossible', 'cannot', 'incapable']);       // all mean "can't"
  const root = (x) => {
    if (NOT.has(x)) return 'cant';
    const m = x.match(/^(dis|un|non|in|im|ir|il)(.{5,})$/);                    // disrespectful -> respectful
    return (m ? m[2] : x).slice(0, 5);
  };
  const keys = (meaning) => new Set((meaning.toLowerCase().match(/[a-z]+/g) || [])
    .filter((x) => x.length >= 4 && !COMMON.has(x)).map(root));

  // Two look-alike words to put beside the answer: similar spelling, the same
  // part of speech when possible, never a form of the same word, and never a
  // word whose meaning overlaps the answer's.
  function lookAlikes(answer, avoid) {
    const e = HH.Study.entry(answer), pos = e ? e[1] : '';
    const sa = stem(answer), ka = keys(e ? e[2] : '');
    const scored = [];
    for (const c of HH.WORDS) {
      const w = c[0];
      if (w === answer || avoid.includes(w) || w.includes('-')) continue;
      if (w.toLowerCase().startsWith(sa) || answer.toLowerCase().startsWith(stem(w))) continue;   // same family
      const kc = keys(c[2]);
      if ([...kc].some((k) => ka.has(k))) continue;                                              // means nearly the same
      if (c[2].toLowerCase().includes(sa) || (e && e[2].toLowerCase().includes(stem(w)))) continue;
      let pre = 0;
      while (pre < Math.min(w.length, answer.length) && w[pre] === answer[pre]) pre++;
      const score = lev(w, answer) + Math.abs(w.length - answer.length) * 0.5
        + (w[0] === answer[0] ? 0 : 2) + (c[1] === pos ? 0 : 1.5) - Math.min(3, pre) * 0.5;
      scored.push([w, score]);
    }
    scored.sort((a, b) => a[1] - b[1]);
    const top = scored.slice(0, 6).map((x) => x[0]);
    for (let i = top.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [top[i], top[j]] = [top[j], top[i]]; }
    return top.slice(0, 2);
  }

  // The example sentence with the word (in any form) blanked out, or null.
  function blanked(word, example) {
    const st = stem(word);
    let found = false;
    const text = example.replace(/[A-Za-z]+/g, (tok) => {
      if (!found && tok.toLowerCase().startsWith(st)) { found = true; return '-----'; }
      return tok;
    });
    return found ? text.toUpperCase() : null;
  }

  // Questions for a list of words: clues take turns (meaning, sentence, ...).
  function makeQuestions(words) {
    const flip = Math.random() < 0.5;
    return words.map((w, i) => {
      const e = HH.Study.entry(w);
      const blank = blanked(w, e[3]);
      const useBlank = blank && (i % 2 === 0) === flip;
      return {
        word: w,
        label: useBlank ? 'FILL THE BLANK:' : 'WHICH WORD MEANS:',
        text: useBlank ? blank : e[2].toUpperCase(),
        choices: [w, ...lookAlikes(w, words)],
      };
    });
  }

  // What a boss covers, in words, for the first card.
  function about(kind, n) {
    if (kind === 'preview') return 'A PREVIEW WITH SAMPLE WORDS. NOTHING IS SAVED.';
    if (n === 1) return 'WORDS FROM YOUR FIRST WEEK.';
    if (n === 2) return 'WEEK 2 WORDS, PLUS TRICKY ONES FROM WEEK 1.';
    if (n === 3) return 'WEEK 3 WORDS, PLUS OLDER WORDS DUE FOR REVIEW.';
    if (n === 4) return 'WEEK 4 WORDS, PLUS A MIX OF OLDER ONES.';
    return 'PICKED FROM EVERYTHING YOU HAVE LEARNED, TRICKIEST FIRST.';
  }
  const title = (b) => (b.kind === 'preview' ? 'BOSS PREVIEW' : `WEEK ${b.n} BOSS`);

  // ---------------------------------------------------------------------------
  // Murk the Orca, a chubby pixel orca facing left (toward the sandbar).
  // k outline, K black, W white, e eye, b blush, g grey saddle
  // ---------------------------------------------------------------------------
  const ORCA = [
    '..................kk..........',
    '.................kKk..........',
    '................kKKk..........',
    '...............kKKKk..........',
    '........kkkkkkkKKKKkkkk.......',
    '......kkKKKKKKKKKKKKKKKkk.....',
    '.....kKKWWWKKKKKKKgggKKKKk..kk',
    '....kKKWWWWKKKKKKgggggKKKKkkKk',
    '...kKKeKWWKKKKKKKKKKKKKKKKKKk.',
    '..kKKKKKKKKKKKKKKKKKKKKKKKKKk.',
    '.kKbbKKKKKKKKKKKKKKKKKKKKKKKKk',
    '.kWWWWKKKKKKKKKKKKKKKKKKKKkkKk',
    '..kWWWWWWWKKKKKKKKWWWKKKKk.kKk',
    '...kkWWWWWWWWWWWWWWWKKKkk...kk',
    '.....kkkkkkkkkkkkkkkkkk.......',
  ];
  const MAP = { k: P.outline, K: '#2f3247', W: '#f7f9ff', e: '#f7f9ff', b: '#f3a3a8', g: '#9aa3b8' };
  let orcaCv = null, orcaFlash = null;
  function orca(flash) {
    if (!orcaCv) {
      const make = (map) => {
        const r = new HH.Raster(ORCA[0].length, ORCA.length);
        ORCA.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (map[row[x]]) r.set(x, y, map[row[x]]); });
        return r.toCanvas();
      };
      orcaCv = make(MAP);
      orcaFlash = make(Object.fromEntries(Object.keys(MAP).map((k) => [k, k === 'k' ? P.outline : '#ffffff'])));
    }
    return flash ? orcaFlash : orcaCv;
  }

  // Where Murk swims: out in the water to the right, just below the horizon.
  // Returns his position this frame (he bobs, leaps when hit, dives when beaten).
  function orcaPos(b, t) {
    let x = 142, y = 96 + Math.round(Math.sin(t * 2.4) * 1.5);
    const hit = t - b.hitT;
    if (hit >= 0 && hit < 0.7) y -= Math.round(Math.sin((hit / 0.7) * Math.PI) * 14);   // a startled leap
    const laugh = t - b.laughT;
    if (laugh >= 0 && laugh < 0.6) y -= Math.round(Math.abs(Math.sin(laugh * 16)) * 3);  // a smug little bounce
    if (b.hp <= 0) { const k = Math.min(1, (t - b.hitT) / 1.2); x += Math.round(k * 50); y += Math.round(k * 10); }  // swims away
    return { x, y };
  }

  // ---------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------
  // The water gets murkier the more health Murk has: clearing it IS the goal.
  function murk(g, b) {
    const a = 0.26 * Math.max(0, b.hp) / b.qs.length;
    if (a <= 0) return;
    g.fillStyle = `rgba(36, 70, 72, ${a})`;
    g.fillRect(0, 0, V.W, V.H);
  }

  function drawOrca(g, b, t) {
    const o = orcaPos(b, t);
    const flash = t - b.hitT < 0.25 && Math.floor((t - b.hitT) * 20) % 2 === 0;
    const cv = orca(flash);
    HH.Entities.pixelEllipse(g, o.x, o.y + 1, 22, 2.5, 'rgba(255,255,255,0.45)');   // a ripple ring
    g.drawImage(cv, o.x - cv.width, o.y - cv.height + 2, cv.width * 2, cv.height * 2);
    // health pips above him
    if (b.hp > 0) {
      const n = b.qs.length, x0 = Math.min(o.x - 10, V.W - 4 - n * 7);
      for (let i = 0; i < n; i++) {
        const x = x0 + i * 7, y = o.y - 22;
        g.fillStyle = P.outline; g.fillRect(x - 1, y - 1, 7, 5);
        g.fillStyle = i < b.hp ? '#5b8c8a' : '#e9dfcf'; g.fillRect(x, y, 5, 3);
      }
      F.draw(g, 'MURK', o.x + 2, o.y - 30, { align: 'center', color: P.white, outline: P.outline });
    }
    // bubble blasts flying from the seal to Murk
    for (const f of b.blasts) {
      const k = Math.min(1, f.t / BLAST_TIME), e = k * k;
      const x = f.x0 + (o.x - f.x0) * e, y = f.y0 + (o.y - 6 - f.y0) * e - Math.sin(k * Math.PI) * 30;
      HH.Entities.pixelEllipse(g, x, y, 4, 4, P.outline);
      HH.Entities.pixelEllipse(g, x, y, 3, 3, '#bff0ff');
      g.fillStyle = P.white; g.fillRect(Math.round(x) - 2, Math.round(y) - 2, 2, 1);
    }
  }

  // The HUD while a question is live: hearts, the clue at the bottom, feedback.
  function hud(g, t, st, maxHearts) {
    const b = st.boss, U = HH.UI;
    murk(g, b);
    drawOrca(g, b, t);
    U.plank(g, 3, 3, F.width(title(b), 1) + 12, 12);
    F.draw(g, title(b), 9, 6, { color: P.woodD });
    for (let i = 0; i < maxHearts; i++) {
      const full = i < st.hearts;
      const justLost = i === st.hearts && st.heartLostT > 0;
      if (justLost && Math.floor(t * 12) % 2) continue;
      U.heartIcon(g, 8 + i * 10, 22, full || justLost);
    }
    F.draw(g, `QUESTION ${Math.min(b.qs.length, b.round + 1)} OF ${b.qs.length}`, 8, 32, { color: P.white, outline: P.outline });

    if (st.toastT > 0 && !(st.toastT < 0.3 && Math.floor(t * 20) % 2)) {
      F.draw(g, st.toast, V.W / 2, 44, { align: 'center', color: P.uiPanel, outline: P.outline });
    }
    // after a wrong pick: what that word really means (it stays a few seconds)
    if (b.fb && t - b.fb.t < 3.2) {
      U.wrap(b.fb.text, 34).slice(0, 3).forEach((l, i) => F.draw(g, l, V.W / 2, 54 + i * 8, { align: 'center', color: '#ffe3a3', outline: P.outline }));
    }
    if (b.round === 0 && st.dist < b.startZ + 14 && !b.fb) {
      F.draw(g, 'SCOOT INTO THE RIGHT WORD', V.W / 2, 44, { align: 'center', color: P.white, outline: P.outline });
    }

    // While the row is still too far away to read its pills, a sign shows the
    // three words (left, middle, right) just above it.
    if (b.row && b.row.live) {
      const p = HH.Proj.project(0, b.row.z, 0);
      const room = 0.75 * p.s * 0.92;
      const words = b.row.items.map((it) => it.word);
      if (words.some((w) => F.width(w, 1) + 6 > room)) {
        const cw = words.map((w) => F.width(w, 1) + 6);
        const wide = cw[0] + cw[1] + cw[2] + 8 > V.W;          // too wide for one row: two rows
        const chip = (w, cx, y) => {
          cx = Math.round(cx);
          const hw = Math.ceil((F.width(w, 1) + 6) / 2);
          g.fillStyle = P.outline; g.fillRect(cx - hw, y, hw * 2, 11);
          g.fillStyle = '#f4fdff'; g.fillRect(cx - hw + 1, y + 1, hw * 2 - 2, 9);
          F.draw(g, w, cx + 1, y + 3, { align: 'center', color: P.outline });
        };
        const y = Math.max(70, Math.round(p.y - Math.min(26, 0.66 * p.s)) - (wide ? 28 : 15));   // just above the pills
        if (!wide) {
          const lx = Math.max(2 + cw[0] / 2, 28), rx = Math.min(V.W - 2 - cw[2] / 2, 132);
          chip(words[0], lx, y); chip(words[1], 80, y); chip(words[2], rx, y);
        } else {                                                // left and right on top, the middle below
          chip(words[0], 2 + cw[0] / 2, y); chip(words[2], V.W - 2 - cw[2] / 2, y); chip(words[1], 80, y + 13);
        }
      }
    }

    // the clue tray
    const q = b.qs[Math.min(b.qs.length - 1, b.round)];
    const lines = U.wrap(q.text, 34).slice(0, 4);
    const top = 253 - 16 - lines.length * 7;
    U.panel(g, 4, top, 152, 253 - top);
    F.draw(g, q.label, 10, top + 5, { color: P.tealD });
    lines.forEach((l, i) => F.draw(g, l, 10, top + 13 + i * 7, { color: P.outline }));
    return [{ id: 'pause', x: 137, y: 2, w: 20, h: 20, draw: U.lifeRing }];
  }

  // The question card between rounds: the world waits while you read.
  function card(g, t, st, age) {
    const b = st.boss, U = HH.UI;
    murk(g, b);
    drawOrca(g, b, t);
    g.fillStyle = 'rgba(43, 45, 72, 0.35)'; g.fillRect(0, 0, V.W, V.H);
    const q = b.qs[b.round];
    const intro = b.round === 0 ? U.wrap(`${b.kind === 'preview' ? '' : 'BOSS DAY! NO NEW WORDS TODAY. '}MURK CLOUDS THE WATER. HOP INTO THE RIGHT WORD TO CLEAR IT. ${about(b.kind, b.n)}`, 32) : [];
    const lines = U.wrap(q.text, 32);
    const bx = 8, by = 8, bw = 144, bh = 62 + (intro.length ? intro.length * 7 + 6 : 0) + lines.length * 7;
    U.chalkboard(g, bx, by, bw, bh);
    const pop = Math.max(0, 1 - age * 3);
    F.draw(g, title(b), V.W / 2, by + 10 - Math.round(pop * 4), { align: 'center', scale: 2, color: '#ffe3a3' });
    F.draw(g, `QUESTION ${b.round + 1} OF ${b.qs.length}`, V.W / 2, by + 25, { align: 'center', color: U.CHALK2 });
    let y = by + 36;
    intro.forEach((l) => { F.draw(g, l, bx + 10, y, { color: U.CHALK }); y += 7; });
    if (intro.length) y += 6;
    F.draw(g, q.label, bx + 10, y, { color: P.seafoam }); y += 9;
    lines.forEach((l) => { F.draw(g, l, bx + 10, y, { color: U.CHALK }); y += 7; });
    const ty = by + bh + 8;
    F.draw(g, 'RIGHT WORD = HIT MURK', 10, ty, { color: P.white, outline: P.outline });
    F.draw(g, 'WRONG WORD = -1 HEART', 10, ty + 9, { color: P.uiPanel, outline: P.outline });
    const btns = [{ id: 'pause', x: 137, y: 230, w: 20, h: 20, draw: U.lifeRing }];
    if (age > 0.35) btns.unshift({ id: 'bossGo', label: 'GO!', x: 6, y: 222, w: 84, h: 24, style: 'teal', scale: 2 });
    return btns;
  }

  // Results: how it went, and the words worth another look.
  function over(g, t, r, age) {
    const U = HH.UI;
    const slide = Math.max(0, 1 - age * 5);
    const y0 = 10 - Math.round(slide * slide * 190);
    U.panel(g, 8, y0, 144, 196);
    F.draw(g, r.win ? 'WATER CLEAR!' : 'MURK WINS...', V.W / 2, y0 + 7, { align: 'center', scale: 2, color: r.win ? P.tealD : P.coral, shadow: P.uiPanelD });
    const sub = r.win ? (r.kind === 'preview' ? 'YOU BEAT MURK THE ORCA' : `WEEK ${r.n} BOSS BEATEN`) : 'FOR NOW. TRY AGAIN?';
    F.draw(g, sub, V.W / 2, y0 + 22, { align: 'center', color: '#8a8173' });
    F.draw(g, `FIRST TRY: ${r.firstTry} OF ${r.total}`, V.W / 2, y0 + 31, { align: 'center', color: P.outline });
    if (r.fish) {
      const txt = `+${r.fish}` + (r.streak ? `   DAY ${r.streak.count} STREAK` : '');
      const w = F.width(txt) + 12;
      U.fishIcon(g, V.W / 2 - w / 2, y0 + 39);
      F.draw(g, txt, V.W / 2 - w / 2 + 12, y0 + 40, { color: P.tealD });
    }
    g.fillStyle = P.uiPanelD; g.fillRect(16, y0 + 49, 128, 1);
    let y = y0 + 55;
    if (r.paid && r.paid.length > 1) {                   // boss day's fish, item by item
      U.wrap(r.paid.join(' + '), 32).forEach((l) => { F.draw(g, l, V.W / 2, y, { align: 'center', color: '#8a8173' }); y += 7; });
      y += 4;
    }
    if (!r.missed.length) {
      F.draw(g, 'NO MISSES. CRYSTAL CLEAR!', V.W / 2, y + 4, { align: 'center', color: P.tealD });
      y += 20;
    } else {
      F.draw(g, 'WORTH ANOTHER LOOK:', 16, y, { color: '#8a8173' }); y += 9;
      r.missed.slice(0, 2).forEach((w) => {
        const e = HH.Study.entry(w);
        F.draw(g, w, 16, y, { color: P.coralD }); y += 7;
        const m = U.wrap(e[2].toUpperCase(), 32);
        F.draw(g, m[0] + (m.length > 1 ? '...' : ''), 16, y, { color: P.outline }); y += 10;
      });
      if (r.missed.length > 2) { F.draw(g, `AND ${r.missed.length - 2} MORE`, 16, y, { color: '#8a8173' }); y += 9; }
    }
    const fact = r.newFacts ? 'NEW OCEAN FACT IN YOUR FLIPBOOK! ' : '';
    const note = r.test ? fact + 'TEST RUN: YOUR REAL PROGRESS WAS NOT TOUCHED.'
      : r.kind === 'preview' ? 'PREVIEW: NOTHING WAS SAVED.'
      : fact + (r.missed.length ? 'MISSED WORDS COME BACK SOON IN VOCAB. ' : '')
        + (r.win ? 'NEXT: 6 DAYS OF NEW WORDS, THEN BOSS DAY.' : 'BOSS DAY COUNTS AS TODAY\'S STUDY. MURK WAITS FOR YOU.');
    U.wrap(note, 32).forEach((l) => { F.draw(g, l, 16, y, { color: '#9e9486' }); y += 7; });
    const by = y0 + 152;
    const again = r.test ? { id: 'bossAgain', label: r.win ? 'PLAY AGAIN' : 'TRY AGAIN' }
      : r.kind === 'preview' ? { id: 'bossAgain', label: 'PLAY AGAIN' }
      : r.win ? { id: 'words', label: 'VOCAB' } : { id: 'bossAgain', label: 'TRY AGAIN' };
    return [
      Object.assign(again, { x: 16, y: by, w: 128, h: 21, style: 'teal', scale: 2 }),
      { id: 'menu', label: 'MENU', x: 56, y: by + 28, w: 48, h: 13 },
    ];
  }

  // ---------------------------------------------------------------------------
  // BOSS TESTER (for trying the bosses before release; set TESTER to false to hide it)
  // Makes a pretend player who has studied 3 words a day for 7 x n days, so
  // boss n is waiting. The real save is put aside and comes back untouched.
  // ---------------------------------------------------------------------------
  const TESTER = true;

  function fakeSave(n) {
    const sv = HH.Save.defaults(), today = HH.Study.today();
    const pool = HH.WORDS.map((e) => e[0]).filter((w) => !w.includes('-')).sort(() => Math.random() - 0.5);
    const total = 7 * n - 1;                     // every earlier week ends with a boss day; today is boss day n
    sv.boss = { beaten: n - 1, history: [], days: [] };
    let k = 0;
    for (let i = 0; i < total; i++) {
      const day = today - total + i;
      if (i % 7 === 6) { sv.boss.history.push(day); sv.boss.days.push(day); continue; }   // a beaten boss
      sv.days[day] = {};
      for (let j = 0; j < 3; j++) {
        const w = pool[k++];
        const box = [1, 1, 2, 2, 3, 4][Math.floor(Math.random() * 6)];
        sv.words[w] = { box, due: day + [0, 1, 2, 4, 7, 15][box], learned: true, first: day };
        sv.days[day][w] = Math.random() < 0.25 ? 'tricky' : 'got';
      }
    }
    sv.streak = { count: total, lastDay: today - 1, best: total };
    sv.wallet = 0;
    sv.music = HH.Save.data.music; sv.sfx = HH.Save.data.sfx; sv.musicTrack = HH.Save.data.musicTrack;
    return sv;
  }

  function tester(g, t) {
    const U = HH.UI;
    U.panel(g, 14, 22, 132, 206);
    F.draw(g, 'BOSS TESTER', V.W / 2, 31, { align: 'center', scale: 2, color: P.outline });
    U.wrap('PLAY ANY BOSS DAY AS A PRETEND PLAYER. YOUR REAL PROGRESS IS SAFE.', 28)
      .forEach((l, i) => F.draw(g, l, 22, 48 + i * 7, { color: '#8a8173' }));
    const btns = [];
    const weeks = [1, 2, 3, 4, 5];
    weeks.forEach((n, i) => {
      btns.push({ id: `bossTest${n}`, label: n === 5 ? 'WEEK 5+' : `WEEK ${n}`, x: i % 2 ? 82 : 22, y: 82 + Math.floor(i / 2) * 22, w: 56, h: 17, style: 'teal' });
    });
    F.draw(g, 'STUDY DAY 7 14 21 28 35', V.W / 2, 151, { align: 'center', color: '#9e9486' });
    btns.push({ id: 'bossPreview', label: 'QUICK PREVIEW', x: 22, y: 166, w: 116, h: 17 });
    btns.push({ id: 'back', label: 'BACK', x: 50, y: 204, w: 60, h: 15 });
    return btns;
  }

  // A tiny Murk (12 x 6) for the week meter.
  function miniOrca(g, x, y, lit) {
    const body = lit ? '#2f3247' : '#9aa3b8';
    g.fillStyle = P.outline; g.fillRect(x + 1, y + 1, 10, 5); g.fillRect(x + 6, y - 1, 2, 2); g.fillRect(x + 10, y, 2, 3);
    g.fillStyle = body; g.fillRect(x + 2, y + 2, 8, 3); g.fillRect(x + 6, y, 1, 2);
    g.fillStyle = '#f7f9ff'; g.fillRect(x + 3, y + 2, 2, 1); g.fillRect(x + 2, y + 4, 5, 1);
  }

  // The week meter under WORDS: 6 dots for learning days, then Murk.
  function meter(g, b, t) {
    const st = HH.Study.bossStatus(HH.game.save);
    const x0 = b.x + 4, y = b.y + 3;
    for (let i = 0; i < HH.Study.LEARN_DAYS; i++) {
      const x = x0 + i * 8;
      g.fillStyle = P.outline; g.fillRect(x, y, 6, 6);
      g.fillStyle = i < st.done ? P.goldL : '#e9dfcf'; g.fillRect(x + 1, y + 1, 4, 4);
    }
    miniOrca(g, x0 + 49, y - 1 + Math.round(Math.sin(t * 3) * 0.6), st.done >= HH.Study.LEARN_DAYS);
  }

  // Tapping the meter: how the week works, and where you are in it.
  function info(g, t, save) {
    const U = HH.UI, st = HH.Study.bossStatus(save);
    U.panel(g, 14, 40, 132, 168);
    F.draw(g, `WEEK ${st.n}`, V.W / 2, 49, { align: 'center', scale: 2, color: P.outline });
    meter(g, { x: 46, y: 66 }, t);
    const left = st.daysLeft;
    const lines = [
      `${st.done} OF ${HH.Study.LEARN_DAYS} LEARNING DAYS DONE.`,
      left === 1 ? 'NEXT STUDY DAY IS BOSS DAY!' : `BOSS DAY IN ${left} STUDY DAYS.`,
      '',
      'EVERY WEEK: 6 DAYS OF NEW WORDS, THEN MURK THE ORCA ON BOSS DAY. MISSED A DAY? NO PROBLEM: THE WEEK WAITS FOR YOU.',
    ];
    let y = 82;
    lines.forEach((l) => { if (!l) { y += 5; return; } U.wrap(l, 28).forEach((x) => { F.draw(g, x, 22, y, { color: l.startsWith('EVERY') ? '#8a8173' : P.outline }); y += 7; }); });
    const btns = [{ id: 'back', label: 'BACK', x: 50, y: 188, w: 60, h: 15 }];
    if (TESTER) btns.unshift({ id: 'bossTester', label: 'BOSS TESTER', x: 30, y: 164, w: 100, h: 16, style: 'teal' });
    return btns;
  }

  return { TESTER, fakeSave, tester, meter, info, miniOrca, FISH_PERFECT, BLAST_TIME, FISH_RIGHT, FISH_WIN, orcaPos, hud, card, over, makeQuestions, lookAlikes, blanked };
})();

// ---------------------------------------------------------------------------
// Game hooks: the boss round's own flow, added to HH.Game.
// ---------------------------------------------------------------------------
Object.assign(HH.Game.prototype, {
  // BOSS TESTER: play boss n as a pretend player (the real save waits aside).
  startBossTest(n) {
    if (!this.realSave) this.realSave = this.save;
    this.save = HH.Boss.fakeSave(n);
    this.testWeek = n;
    this.startBoss();
  },

  // Put the real save back after a test (leaving to the menu or Word Mode).
  endBossTest() {
    if (this.realSave) { this.save = this.realSave; this.realSave = null; }
    this.testWeek = 0;
  },

  // A fresh boss run: the waiting weekly boss if there is one, else a preview.
  startBoss(forcePreview) {
    const S = HH.Study, save = this.save, status = S.bossStatus(save);
    let kind, n, words;
    if (status.ready && !forcePreview) {
      kind = 'weekly'; n = status.n;
      words = S.bossWords(save, n);
    } else {
      // preview: your own words if you have enough, otherwise short sample words
      kind = 'preview'; n = 0;
      const learned = S.learnedList(save).map((e) => e[0]);
      const pool = learned.length >= S.BOSS_QUESTIONS ? learned : HH.WORDS.filter((e) => e[0].length <= 8 && !e[0].includes('-')).map((e) => e[0]);
      words = pool.slice().sort(() => Math.random() - 0.5).slice(0, S.BOSS_QUESTIONS);
    }
    const qs = HH.Boss.makeQuestions(words);

    this.runMode = 'words';
    this.gen = HH.Level.create((Math.random() * 1e9) | 0, 'words');
    HH.Level.fill(this.gen, 80);
    this.seal.reset();
    this.seal.runSpeed = this.speed(0);
    this.seal.v = 0;
    this.st = {
      dist: 0, eaten: 0, bank: 0, combo: 0, bestCombo: 0,
      counts: { fish: 0, shrimp: 0, squid: 0, gold: 0, glass: 0 }, bumps: 0, shield: false, rhythm: 0,
      hearts: HH.Game.HEARTS, heartLostT: 0, tier: 0, calm: false, toast: null, toastT: 0, newFacts: [], unlocked: [],
      wm: null,
      boss: { kind, n, qs, round: 0, hp: qs.length, row: null, blasts: [], hitT: -9, laughT: -9, fb: null, nextT: 0,
        missed: false, missedWords: [], firstTry: 0, startZ: 0 },
    };
    this.result = null;
    this.overlay = null;
    HH.Particles.clear();
    HH.Proj.camZ = this.seal.z - HH.View.CAM_BACK;
    HH.Proj.camX = 0;
    this.setMode('bossCard');
  },

  // GO! Clear a short runway (like HOP IN) and roll.
  bossGo() {
    const b = this.st.boss, z = this.seal.z;
    this.gen.items = this.gen.items.filter((it) => {
      if (it.z < z - 1 || it.z > z + 9) return true;
      if (it.type === 'slot') { it.used = true; return true; }
      return false;
    });
    b.missed = false;
    b.startZ = z;
    this.setMode('play');
  },

  // Word rows appear one at a time, at the next free slot coming into view.
  fillBoss() {
    const b = this.st.boss, seal = this.seal;
    if (b.row || b.nextT > 0 || b.hp <= 0) return;
    const q = b.qs[b.round];
    for (const it of this.gen.items) {
      if (it.z > seal.z + 24) break;
      if (it.type !== 'slot' || it.used) continue;
      if (it.z < seal.z + 7) { it.used = true; continue; }        // too close to read: skip it
      it.used = true;
      const words = q.choices.slice().sort(() => Math.random() - 0.5);
      const row = { z: it.z, live: true, items: [] };
      row.items = [-0.75, 0, 0.75].map((x, i) => ({ type: 'letter', kind: 'letter', word: words[i], ch: '', z: it.z, x, e: 0.2, row, popT: this.t }));
      b.row = row;
      this.gen.items.push(...row.items);
      this.gen.items.sort((a, c) => a.z - c.z);
      return;
    }
  },

  onBossPick(it) {
    const st = this.st, b = st.boss, row = it.row, q = b.qs[b.round];
    if (!row.live || b.hp <= 0) return;
    row.live = false;
    b.row = null;
    for (const o of row.items) if (o !== it) o.taken = true;    // the other pills pop
    const p = this.lastSeal || { x: 80, top: 170 };
    if (it.word === q.word) {
      // RIGHT: a bubble blast flies to Murk (the hit lands when it arrives)
      if (!b.missed) { b.firstTry++; if (b.kind !== 'preview') st.bank += HH.Boss.FISH_RIGHT; }
      b.blasts.push({ x0: p.x, y0: p.top, t: 0 });
      b.nextT = 99;                                              // no more rows until the blast lands
      HH.Audio.play('pop');
      HH.Particles.sparkle(p.x, p.top + 8, HH.PAL.seafoam, 8);
      this.toast(`${it.word}! BUBBLE BLAST!`);
    } else {
      // WRONG: a heart, and what that look-alike word actually means
      if (!b.missed) {
        b.missed = true;
        b.missedWords.push(q.word);
        if (b.kind !== 'preview') { HH.Study.bossMiss(this.save, q.word); HH.Save.save(); }   // it comes back sooner
      }
      b.laughT = this.t;
      const e = HH.Study.entry(it.word);
      b.fb = { text: `${it.word} MEANS ${e ? e[2].toUpperCase() : '...'}`, t: this.t };
      this.toast('NOT QUITE!');
      this.onHit({ type: 'bonk', it });
    }
  },

  // The boss is over (won, or out of hearts): pay out and remember it.
  bossResult(win) {
    const st = this.st, b = st.boss;
    let streak = null;
    if (b.kind !== 'preview') {
      // boss day counts as today's study: streak, ocean fact, grad cap days
      const res = HH.Study.bossPlayed(this.save);
      if (res.streakUp) { st.bank += res.bonus; streak = { count: this.save.streak.count, bonus: res.bonus }; }
      this.discover(HH.Study.factToFind(this.save, b.qs.map((q) => q.word)));   // a fact using a boss word, if one fits
      if (win) {
        st.bank += HH.Boss.FISH_WIN;
        if (b.firstTry === b.qs.length) st.bank += HH.Boss.FISH_PERFECT;
        HH.Study.bossBeaten(this.save, b.n);
      }
    }
    const fish = b.kind === 'preview' ? 0 : st.bank;
    // where boss day's fish came from (shown on the results screen)
    const paid = [];
    if (fish) {
      if (b.firstTry) paid.push(`${b.firstTry * HH.Boss.FISH_RIGHT} RIGHT ANSWERS`);
      if (win) paid.push(`${HH.Boss.FISH_WIN} WIN`);
      if (win && b.firstTry === b.qs.length) paid.push(`${HH.Boss.FISH_PERFECT} PERFECT`);
      if (streak) paid.push(`${streak.bonus} STREAK`);
    }
    this.save.wallet += fish;
    st.bank = 0;
    HH.Save.save();
    this.result = { boss: true, test: !!this.realSave, win, kind: b.kind, n: b.n, firstTry: b.firstTry, total: b.qs.length, missed: b.missedWords.slice(), fish, paid, streak, newFacts: st.newFacts.length };
  },

  stepBoss(dt) {
    const st = this.st, b = st.boss, seal = this.seal;
    // a row slipped past without a pick (hopped over): another comes
    if (b.row && b.row.z < seal.z - 0.5) { b.row.live = false; b.row = null; }
    // bubble blasts in flight
    for (const f of b.blasts) {
      f.t += dt;
      if (f.t >= HH.Boss.BLAST_TIME && !f.done) {
        f.done = true;
        b.hp--;
        b.hitT = this.t;
        b.fb = null;
        HH.Audio.play(b.hp <= 0 ? 'unlock' : 'spelled');
        const o = HH.Boss.orcaPos(b, this.t);
        HH.Particles.sparkle(o.x - 6, o.y - 6, '#bff0ff', 14);
        HH.Particles.text(o.x - 6, o.y - 30, b.hp <= 0 ? 'SPLASH!' : 'BONK!', HH.PAL.white);
        b.nextT = 1.1;
      }
    }
    b.blasts = b.blasts.filter((f) => !f.done);
    if (b.nextT > 0 && b.nextT < 99) {
      b.nextT -= dt;
      if (b.nextT <= 0) {
        b.nextT = 0;
        if (b.hp <= 0) {
          this.bossResult(true);
          this.seal.setFace('sing', 99);
          this.setMode('over');
        } else {
          b.round++;
          this.setMode('bossCard');
        }
      }
    }
  },
});
