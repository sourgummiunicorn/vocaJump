// game.js
// The game's brain: which screen we're on, the run's distance, and the main loop.
//
// MODES
//   title   -> menu with the big seal (overlay: options or the journal)
//   lesson  -> WORD MODE only: Professor Seal shows the next word on a board
//   play    -> the endless journey
//   paused
//   flop    -> the run just ended: a funny belly flop (about one second)
//   over    -> distance, best distance, fish, and a big HOP AGAIN button
//
// ONE RECORD: your best is simply the farthest you have ever hopped.
// FISH ARE MONEY: every treat you catch goes into your fish bucket, which
// carries over between runs. Spend it in the shop (in the journal) on looks.
// Prices are high on purpose: the crown is a long-term goal.
//
// THE ENDLESS LOOP
//   Every step, the level generator builds the path a little further ahead
//   and forgets what is behind. Speed comes from distance (HH.Level.speedAt).
//
// HEARTS
//   - The seal starts with 3 hearts. Touching a rock, log, boulder or crab
//     costs one (then a second of safety while it wobbles). No hearts left
//     = belly flop, run over. Kelp only slows you down.
//   - A pearl's bubble absorbs one bump without costing a heart.
//   - Hitboxes start extra small and grow to normal by 700 m, so early
//     near-misses go your way.
//
// TWO WAYS TO PLAY (this.runMode)
//   'cruise' -> the endless run described above
//   'words'  -> Word Mode: learn a word on Professor Seal's board, then spell
//               it by scooting into letter bubbles. Correct letters fly down
//               into the slots at the bottom; a wrong letter costs a heart.
//               The slots never show the word: players spell it from memory.
//               The learning rules (what comes next, streaks) live in study.js.
//
// The simulation runs in fixed 1/120 s steps, so every hop arc is identical
// no matter how fast the device draws. That keeps timing fair.

HH.Game = class {
  constructor(canvas, bgCanvas) {
    this.cv = canvas;
    // The game draws in 160 x 256 game pixels, onto a canvas 3x finer
    // (480 x 768): the art looks the same, and letters can use smaller,
    // sharper dots (see font.js).
    canvas.width = HH.View.W * HH.View.RES;
    canvas.height = HH.View.H * HH.View.RES;
    this.g = canvas.getContext('2d');
    this.g.setTransform(HH.View.RES, 0, 0, HH.View.RES, 0, 0);
    this.g.imageSmoothingEnabled = false;

    HH.Save.load();
    this.save = HH.Save.data;
    HH.Audio.setMusic(this.save.music);
    HH.Audio.setTrack(this.save.musicTrack);
    HH.Audio.setSfx(this.save.sfx);
    HH.World.init(bgCanvas);

    this.mode = 'title';
    this.overlay = null;          // 'settings' | 'wordbook' (the Flipbook) | 'journal' | 'shop' | 'help'
    this.t = 0;
    this.modeT = 0;
    this.buttons = [];
    this.focus = 0;
    this.factPage = 0;
    this.seal = new HH.Seal();
    this.titleSeal = new HH.Seal();
    this.titleSeal.groundT = 9;
    this.titleSeal.view = 'front';          // on the menu the seal faces us
    this.titleGen = HH.Level.create(12345);  // scenery for the title screen
    this.runMode = 'cruise';
    this.profSeal = new HH.Seal();           // Professor Seal, the Word Mode teacher
    this.profSeal.view = 'front';
    this.book = { tab: 'days', day: 0, page: 0, az: 0, word: null };   // word book view
    this.gen = null;
    this.st = null;
  }

  static get HEARTS() { return 3; }

  // ---------------------------------------------------------------------------
  // Starting a run: everything is generated fresh, so a restart is instant.
  // ---------------------------------------------------------------------------
  newRun(mode) {
    if (this.endBossTest) this.endBossTest();         // leaving a boss test: the real save comes back
    if (mode) this.runMode = mode;
    const words = this.runMode === 'words';
    this.gen = HH.Level.create((Math.random() * 1e9) | 0, this.runMode);
    HH.Level.fill(this.gen, 80);
    this.gen.items.forEach((it, i) => { it.seed = i % 5; });
    this.seal.reset();
    this.seal.runSpeed = this.speed(0);
    this.seal.v = words ? 0 : 3;
    this.st = {
      dist: 0, eaten: 0, bank: 0, combo: 0, bestCombo: 0,
      counts: { fish: 0, shrimp: 0, squid: 0, gold: 0, glass: 0 }, bumps: 0, shield: false, rhythm: 0,
      hearts: HH.Game.HEARTS, heartLostT: 0,
      tier: 0, calm: false, toast: null, toastT: 0, newFacts: [], unlocked: [],
      // Word Mode: words spelled this run, words to practise, words already used
      wm: words ? { done: [], practice: [], used: [], count: 0, queue: this.reviewQueue || [], extra: !!this.extraPractice } : null,
    };
    this.result = null;
    this.overlay = null;
    HH.Particles.clear();
    HH.Proj.camZ = this.seal.z - HH.View.CAM_BACK;
    HH.Proj.camX = 0;
    this.reviewQueue = null;                  // a review only lasts one run
    if (words) this.nextWord();
    else this.setMode('play');
  }

  speed(z) { return HH.Level.speedAt(z, this.runMode); }

  setMode(m) {
    if (m === 'title' && this.endBossTest) this.endBossTest();   // a boss test hands back the real save
    if (m === 'title') this.extraPractice = false;
    this.mode = m;
    this.modeT = 0;
    this.focus = 0;
  }

  toast(text) { this.st.toast = text; this.st.toastT = 1.6; }

  // ---------------------------------------------------------------------------
  // Input from input.js
  // ---------------------------------------------------------------------------
  // touch: true for a finger (not a mouse). Returns 'deferred' when the hop
  // should wait until the finger lifts (see input.js).
  pointerDown(x, y, touch) {
    for (const b of this.buttons) {
      if (!b.disabled && x >= b.x - 2 && x <= b.x + b.w + 2 && y >= b.y - 2 && y <= b.y + b.h + 3) {
        this.press(b);
        return;
      }
    }
    // WORD MODE on a phone: a finger going down might be the start of a
    // slide toward a letter. Hopping right away could carry the seal OVER
    // that letter's row, so we wait: a quick tap hops, a slide only steers.
    if (this.mode === 'play' && touch && this.st && (this.st.wm || this.st.boss)) return 'deferred';
    if (this.mode === 'play') this.seal.tap();
    else if (this.mode === 'lesson' || this.mode === 'bossCard') return;   // only the button starts
    else if (this.mode === 'flop' && this.modeT > 0.4) this.setMode('over');        // skip ahead
    else if (this.mode === 'title' && !this.overlay && y > 150 && y < 220) this.titleSeal.tap();   // poke the seal
  }

  steerTo(x, fromMouse) {
    if (this.mode !== 'play') return;
    this.seal.tx = Math.max(-0.99, Math.min(0.99, x));
  }

  action(a) {
    if (a === 'music') { this.toggle('music'); return; }
    if (this.mode === 'play') {
      if (a === 'hop') this.seal.tap();
      if (a === 'pause' || a === 'autopause') this.pause();
      return;
    }
    if (this.mode === 'lesson') {
      if ((a === 'hop' || a === 'confirm') && this.modeT > 0.6) this.startSpelling();
      if (a === 'pause') this.pause();
      return;
    }
    if (this.mode === 'bossCard') {
      if ((a === 'hop' || a === 'confirm') && this.modeT > 0.6) this.bossGo();
      if (a === 'pause') this.pause();
      return;
    }
    if (a === 'autopause') return;
    if (this.mode === 'flop') { if ((a === 'hop' || a === 'confirm') && this.modeT > 0.4) this.setMode('over'); return; }

    // Menus: arrows move focus, Space/Enter press the focused button.
    const usable = this.buttons.filter((b) => !b.disabled && b.id !== 'pause');
    if (!usable.length) return;
    if (a === 'left' || a === 'down' || a === 'right') {
      const dir = a === 'left' ? -1 : 1;
      this.focus = (this.focus + dir + usable.length) % usable.length;
      HH.Audio.play('click');
    } else if (a === 'hop' || a === 'confirm') {
      this.press(usable[Math.min(this.focus, usable.length - 1)]);
    } else if (a === 'pause') {
      if (this.mode === 'paused') this.setMode(this.pausedFrom || 'play');
      else if (this.overlay) { this.overlay = null; this.focus = 0; }
    }
  }

  press(b) {
    // the game-over screen ignores taps for a moment, so a frantic last
    // tap can't skip straight past your distance
    if (this.mode === 'over' && this.modeT < 0.45 && !this.overlay) return;
    if (b.id === 'spell' && this.modeT < 0.5) return;       // no accidental skip past the lesson
    b.pressT = 0.1;
    HH.Audio.play('click');
    const id = b.id;
    if (id === 'play') this.newRun('cruise');
    // weekly boss rounds (boss.js)
    else if (id === 'boss') {
      this.lastBossPreview = false;
      if (HH.Study.bossStatus(this.save).ready) this.startBoss();
      else { this.overlay = 'bossinfo'; this.focus = 0; }                  // the week meter: how the week works
    }
    else if (id === 'bossAgain') { if (this.testWeek) this.startBossTest(this.testWeek); else this.startBoss(this.lastBossPreview); }
    else if (id === 'bossTester') { this.overlay = 'bosstest'; this.focus = 0; }
    else if (id === 'bossPreview') { this.overlay = null; this.lastBossPreview = true; this.startBoss(true); }
    else if (/^bossTest\d$/.test(id)) { this.overlay = null; this.lastBossPreview = false; this.startBossTest(+id.slice(8)); }
    else if (id === 'bossGo') { if (this.modeT >= 0.5) this.bossGo(); }
    else if (id === 'words') {
      // boss day: Word Mode opens with Murk instead of new words
      if (this.endBossTest) this.endBossTest();
      if (HH.Study.bossStatus(this.save).ready) { this.lastBossPreview = false; this.startBoss(); }
      else {
        this.newRun('words');
        if (HH.Study.dayDone(this.save)) this.endDay();     // already done today: say so (PRACTICE plays on)
      }
    }
    else if (id === 'again') {
      // after DONE FOR TODAY, "practice" plays on with reviews (no new words)
      if (this.result && this.result.dayDone) this.extraPractice = true;
      this.newRun(this.result && this.result.dayDone ? 'words' : undefined);
    }
    else if (id === 'restart') { this.keepCatch(); this.newRun(); }
    else if (id === 'spell') this.startSpelling();
    else if (id === 'pause') this.pause();
    else if (id === 'resume') this.setMode(this.pausedFrom || 'play');
    else if (id === 'menu') { if (this.mode === 'paused') this.keepCatch(); this.setMode('title'); this.overlay = null; }
    else if (id === 'settings' || id === 'journal' || id === 'shop') { this.overlay = id; this.focus = 0; this.shopSel = this.save.equipped; this.shopMsg = null; }
    else if (id === 'back') { this.overlay = null; this.focus = 0; }
    else if (id === 'privacyOk') { this.save.privacyOk = true; HH.Save.save(); this.overlay = null; this.focus = 0; }
    else if (id === 'music' || id === 'sfx') this.toggle(id);
    else if (id === 'dailyDown' || id === 'dailyUp') {
      // new words a day, 1 to 5: takes effect right away
      const S = HH.Study;
      this.save.dailyNew = Math.min(S.DAILY_MAX, Math.max(S.DAILY_MIN, S.dailyGoal(this.save) + (id === 'dailyUp' ? 1 : -1)));
      HH.Save.save();
      HH.Audio.play('letter', this.save.dailyNew - 1, 5);    // a note that climbs with the number
    }
    else if (/^track[123]$/.test(id)) {
      this.save.musicTrack = +id.slice(5);
      HH.Audio.setTrack(this.save.musicTrack);
      if (!this.save.music) { this.save.music = true; HH.Audio.setMusic(true); }   // picking a song turns music on
      HH.Save.save();
    }
    else if (id === 'help') { this.overlay = 'help'; this.helpPage = 0; this.focus = 0; }
    else if (/^help\d$/.test(id)) this.helpPage = +id.slice(4);
    else if (id === 'seeFact') {
      this.overlay = 'journal'; this.focus = 0;
      this.factPage = Math.max(0, this.save.facts.indexOf(this.result && this.result.factId));
    }
    else if (id === 'wordbook') { this.overlay = 'wordbook'; this.focus = 0; this.book = { tab: 'days', day: 0, page: 0, az: 0, word: null }; }
    else if (id === 'bookBack') { this.overlay = null; this.focus = 0; }
    else if (id === 'toBook') { this.overlay = 'wordbook'; this.focus = 0; }
    else if (id === 'review') {
      // a review session: Word Mode with just that day's words, shuffled
      const d = HH.Study.history(this.save)[this.book.day];
      if (d) { this.reviewQueue = d.words.map(([w]) => w).sort(() => Math.random() - 0.5); this.newRun('words'); }
    }
    else if (id === 'bookDays' || id === 'bookAz') { this.book.tab = id === 'bookDays' ? 'days' : 'az'; this.book.word = null; this.focus = 0; }
    else if (id === 'dayOlder' || id === 'dayNewer') { this.book.day += id === 'dayOlder' ? 1 : -1; this.book.page = 0; }
    else if (id === 'dayMore') this.book.page++;
    else if (id.startsWith('pick:')) { this.book.word = id.slice(5); this.focus = 0; }
    else if (id === 'cardBack') { this.book.word = null; this.focus = 0; }
    else if (id === 'wordPrev' || id === 'wordNext') {
      const n = Math.max(1, HH.Study.learnedCount(this.save));
      this.book.az = (this.book.az + (id === 'wordNext' ? 1 : n - 1)) % n;
    }
    else if (id === 'factPrev' || id === 'factNext') {
      const n = Math.max(1, this.save.facts.length);           // only found facts can be flipped through
      this.factPage = (this.factPage + (id === 'factNext' ? 1 : n - 1)) % n;
    }
    else if (id.startsWith('wear:')) this.shop(id.slice(5));
    else if (id === 'buy') this.buy();
  }

  pause() { this.pausedFrom = this.mode; this.setMode('paused'); }

  // Leaving a run from the pause menu still keeps the fish you caught
  // (in Word Mode a long, careful run can be worth a lot).
  keepCatch() {
    const st = this.st;
    if (!st || this.result) return;
    this.save.wallet += st.bank;
    st.bank = 0;
    // the word you were in the middle of goes into today's history as "not yet"
    if (st.wm && st.wm.w && st.wm.shown < st.wm.w.length) HH.Study.unfinished(this.save, st.wm.w, st.wm.started);
    HH.Save.save();
  }

  toggle(which) {
    this.save[which] = !this.save[which];
    if (which === 'music') HH.Audio.setMusic(this.save.music);
    else HH.Audio.setSfx(this.save.sfx);
    HH.Save.save();
  }

  // ---------------------------------------------------------------------------
  // Simulation step (fixed dt)
  // ---------------------------------------------------------------------------
  step(dt) {
    this.t += dt;
    this.modeT += dt;
    for (const b of this.buttons) if (b.pressT) b.pressT -= dt;

    if (this.mode === 'title') this.stepTitle(dt);
    else if (this.mode === 'play') this.stepPlay(dt);
    else if (this.mode === 'lesson' || this.mode === 'bossCard') this.stepLesson(dt);
    else if (this.mode === 'over' && this.result && ((this.result.boss && this.result.win) || this.result.dayDone)) this.stepLesson(dt);   // the winner rests
    else if (this.mode === 'flop' || this.mode === 'over') this.stepFlop(dt);
    HH.Particles.update(dt);
  }

  stepTitle(dt) {
    // first launch: a one-time note about privacy (until OK is pressed)
    if (!this.overlay && !this.save.privacyOk) { this.overlay = 'privacy'; this.focus = 0; }
    const s = this.titleSeal;
    // the title seal does a happy little hop every few seconds
    if (s.state === 'ground' && s.groundT > 2.6) { s.groundT = 9; s.tap(); }
    s.update(dt, 0);
    s.z = 0; s.x = 0;
    for (const e of s.events) if (e.type === 'land') HH.Audio.play('land', 0.5);
    s.events.length = 0;
    HH.Proj.camZ = this.t * 0.8;
    HH.Proj.camX = 0;
    HH.Level.fill(this.titleGen, HH.Proj.camZ + 70);
    HH.Level.prune(this.titleGen, HH.Proj.camZ - 2);
  }

  stepPlay(dt) {
    const seal = this.seal, st = this.st, gen = this.gen;

    seal.runSpeed = this.speed(seal.z);
    seal.floor = 0;
    seal.update(dt, HH.Input.steerDir());

    // seal events -> sound and particles
    for (const e of seal.events) this.onSealEvent(e);
    seal.events.length = 0;

    // the endless coast: build ahead, forget behind
    HH.Level.fill(gen, seal.z + 80);
    HH.Level.prune(gen, seal.z - 8);
    HH.Entities.update(gen.items, this.t);

    if (st.wm) this.fillLetters();
    if (st.boss) this.fillBoss();

    // collisions (extra forgiving early on)
    const forgive = st.wm || st.boss ? 1 : 1 - Math.min(1, seal.z / 700);
    for (const e of HH.Entities.collide(gen.items, seal, forgive)) {
      this.onHit(e);
      if (this.mode !== 'play') return;      // the run just ended
    }

    // sand trail while scooting, wind streaks when it gets fast
    if (seal.state === 'ground' && Math.random() < dt * 10 && this.lastSeal) HH.Particles.scoot(this.lastSeal.x, this.lastSeal.groundY);
    if (seal.runSpeed > 5.4 && Math.random() < dt * (seal.runSpeed - 5.2) * 3) HH.Particles.wind();

    // camera: right behind the seal, sliding sideways smoothly
    HH.Proj.camZ = seal.z - HH.View.CAM_BACK;
    const targetX = HH.Level.pathX(seal.z) + seal.x * 0.65;
    HH.Proj.camX += (targetX - HH.Proj.camX) * Math.min(1, dt * 6);

    st.dist = seal.z;
    st.rhythm = seal.rhythm;
    st.toastT = Math.max(0, st.toastT - dt);
    st.heartLostT = Math.max(0, st.heartLostT - dt);
    if (st.wm) { this.stepWords(dt); return; }      // Word Mode has no distance milestones
    if (st.boss) { this.stepBoss(dt); return; }

    // milestones: small, quiet notes at the top of the screen, never pop-ups
    const tier = Math.floor(st.dist / 150);
    if (tier > st.tier) { st.tier = tier; HH.Audio.play('speed'); }
    const calm = HH.Level.calmAt(st.dist) > 0.5;
    if (calm && !st.calm) this.toast('CALM WATERS');
    st.calm = calm;
    if (!st.passedBest && this.save.bestDist >= 50 && st.dist > this.save.bestDist) { st.passedBest = true; this.toast('NEW BEST!'); HH.Audio.play('unlock'); }
    for (const [m, ach] of [[100, 'm100'], [500, 'm500'], [1500, 'm1500']]) {
      if (st.dist >= m && !this.save.achievements[ach]) this.grant(ach);
    }
  }

  onSealEvent(e) {
    const p = this.lastSeal;
    if (e.type === 'hop') HH.Audio.play('hop', e.rhythm);
    if (e.type === 'land') {
      HH.Audio.play('land', Math.min(1, e.power));
      if (p) HH.Particles.dust(p.x, p.groundY, Math.min(1.2, e.power));
    }
    if (e.type === 'rhythm') {
      HH.Audio.play('rhythm', e.level);
      // a little "nice" for a well-timed hop; louder at max rhythm
      if (p) HH.Particles.text(p.x, p.top - 6, e.level === 3 ? 'PERFECT!' : 'NICE', e.level === 3 ? HH.PAL.gold : HH.PAL.seafoam);
      if (e.level === 3) {
        this.seal.setFace('sing', 0.35);
        this.grant('rhythm');
      }
    }
  }

  onHit(e) {
    const st = this.st, seal = this.seal, p = this.lastSeal || { x: 80, y: 190, top: 160, groundY: 200 };
    if (e.type === 'eat') {
      const it = e.it;
      if (it.kind === 'pearl') {
        st.shield = true;
        st.bank += HH.Entities.VALUE.pearl;
        HH.Audio.play('shield');
        HH.Particles.sparkle(p.x, p.top + 8, '#c9f4ff', 12);
        HH.Particles.text(p.x, p.top - 2, 'BUBBLE!', '#c9f4ff');
        this.save.totals.pearl++;
        return;
      }
      st.combo++;
      st.bestCombo = Math.max(st.bestCombo, st.combo);
      st.eaten++;
      st.counts[it.kind]++;
      const value = HH.Entities.VALUE[it.kind] || 1;
      st.bank += value;
      if (it.kind === 'gold') this.grant('golden');
      HH.Audio.play(it.kind === 'glass' ? 'glass' : 'food', it.kind === 'glass' ? undefined : it.kind, st.combo - 1);
      seal.setFace(it.kind === 'gold' ? 'sing' : 'happy', it.kind === 'gold' ? 1 : 0.35);
      const color = { gold: HH.PAL.gold, squid: HH.PAL.lavender, glass: HH.PAL.seafoam }[it.kind] || HH.PAL.white;
      HH.Particles.sparkle(p.x, p.top + 8, color, it.kind === 'fish' ? 5 : 10);
      // treats worth more than one fish show what they add to the bucket
      if (value > 1) HH.Particles.text(p.x, p.top - 2, `+${value}`, color);
      // streaks of fish get a celebration
      if (st.combo % 10 === 0) {
        HH.Particles.heart(p.x, p.top);
        HH.Particles.text(p.x, p.top - 14, `STREAK ${st.combo}!`, HH.PAL.coral);
        HH.Audio.play('rhythm', 3);
      }
      if (it.kind === 'gold' || it.kind === 'squid') HH.Particles.heart(p.x, p.top);
    } else if (e.type === 'bonk') {
      st.combo = 0;
      st.bumps++;
      if (st.shield) {
        // the pearl's bubble pops instead of losing a heart
        st.shield = false;
        HH.Audio.play('pop');
        HH.Particles.sparkle(p.x, p.top + 10, '#c9f4ff', 14);
        this.toast('THE BUBBLE SAVED YOU!');
      } else {
        st.hearts--;
        st.heartLostT = 0.9;
        HH.Audio.play('heart');
        HH.Particles.brokenHeart(p.x, p.top - 2);
        if (st.hearts <= 0) { this.gameOver(e.it); return; }
        if (st.hearts === 1) this.toast('LAST HEART!');
      }
      // still going: a soft, wobbly bump
      const push = e.it.kind === 'boulder' ? HH.Entities.pushOut(e.it, seal) : undefined;
      seal.bonk(e.it.kind, push);
      HH.Audio.play('bonk');
    } else if (e.type === 'kelp') {
      // kelp never ends a run: it just slows you down and breaks the streak
      st.combo = 0;
      seal.setFace('surprised', 0.4);
      seal.rhythm = 0;
      HH.Audio.play('kelp');
      HH.Particles.kelpSplat(p.x, p.groundY);
    } else if (e.type === 'miss') {
      st.combo = 0;
    } else if (e.type === 'letter') {
      if (st.boss) this.onBossPick(e.it);
      else this.onLetter(e.it);
    }
  }

  // ===========================================================================
  // WORD MODE
  // ===========================================================================
  // A new word: Professor Seal shows it (with its meaning) on the board.
  nextWord() {
    const wm = this.st.wm;
    // a review session hops through its own words first, then carries on as usual
    let e = null;
    while (wm.queue.length && !e) e = HH.Study.entry(wm.queue.shift());
    if (!e) e = HH.Study.next(this.save, wm.used);
    wm.used.push(e[0]);
    Object.assign(wm, {
      entry: e, w: e[0], got: 0, shown: 0, mistakes: 0, rows: [], fly: [], pops: {}, reveal: null,
      ghost: HH.Study.isNew(this.save, e[0]),    // first meeting: the board says NEW WORD
      doneT: 0, started: false,
      weekLabel: HH.Study.weekLabel(this.save),  // "WEEK 2 DAY 4" on the board
    });
    this.seal.v = 0;
    this.seal.tx = this.seal.x;
    const p = this.profSeal;
    p.reset(); p.view = 'front'; p.groundT = 1.5; p.setFace('happy', 0.8);
    HH.Audio.play('glass');
    this.setMode('lesson');
  }

  // Professor Seal at 2x, with the left front flipper raised to hold the
  // pointer. Returns where that flipper is on screen, so the stick starts
  // right in it (and follows the professor's little hops).
  drawProfessor(g, x, y) {
    const p = this.profSeal, S = 2;
    const f = Object.assign(p.frame('professor'), { flip: 'paddleL' });   // left flipper forward
    const spr = HH.Sprites.seal(f);
    const top = y - Math.round(p.y * 60);
    HH.Entities.pixelEllipse(g, x, y - 1, 13 * S * f.sx, 2.5 * S, HH.PAL.shadow);
    g.drawImage(spr.canvas, Math.round(x - spr.ax * S), Math.round(top - spr.ay * S), spr.canvas.width * S, spr.canvas.height * S);
    // the same numbers sealBody() uses for a forward flipper
    const hand = (sx, sy, t0) => {
      const rx = 14.2 * sx, ry = 9.6 * sy, cy = 45 - 1 - ry;
      return { x: Math.round(x - (rx - 0.4) * S), y: Math.round(t0 + (cy - 0.2 * ry - 45) * S) };
    };
    // where the flipper is now, and where it is when standing still (no hop, no squash)
    return Object.assign(hand(f.sx, f.sy, top), { rest: hand(1, 1, y) });
  }

  stepLesson(dt) {
    // the world waits while the player reads; Professor Seal bobs happily
    const s = this.seal;
    s.runSpeed = 0; s.v = 0; s.floor = 0;
    s.update(dt, 0);
    s.events.length = 0;
    const p = this.profSeal;
    if (p.state === 'ground' && p.groundT > 3.2) { p.groundT = 0; p.tap(); }
    p.update(dt, 0); p.z = 0; p.x = 0;
    p.events.length = 0;
    this.st.toastT = Math.max(0, this.st.toastT - dt);
  }

  // SPELL IT! Clear a short runway, then go.
  startSpelling() {
    const wm = this.st.wm, z = this.seal.z;
    wm.started = true;
    this.gen.items = this.gen.items.filter((it) => {
      if (it.z < z - 1 || it.z > z + 9) return true;
      if (it.type === 'slot') { it.used = true; return true; }
      return false;
    });
    this.setMode('play');
  }

  // Letter rows are filled in only as they come into view, because which
  // letter they need depends on how much of the word is spelled by then.
  fillLetters() {
    const wm = this.st.wm, seal = this.seal;
    if (!wm.started || wm.got >= wm.w.length) return;
    for (const it of this.gen.items) {
      if (it.z > seal.z + 24) break;
      if (it.type !== 'slot' || it.used) continue;
      if (it.z < seal.z + 7) { it.used = true; continue; }     // too close to read: skip it
      const idx = wm.got + wm.rows.length;
      if (idx >= wm.w.length) break;
      it.used = true;
      const row = { z: it.z, idx, slot: it, live: true, items: [] };
      wm.rows.push(row);
      this.setLetters(row, idx);
    }
  }

  // Put three bubbles in a row: the letter needed at `idx` plus two decoys.
  // Decoys are often other letters from the same word, so order matters.
  setLetters(row, idx) {
    const wm = this.st.wm, need = wm.w[idx];
    for (const it of row.items) it.taken = true;            // old bubbles vanish
    const inWord = [...new Set(wm.w.split(''))].filter((c) => c !== need);
    const decoys = [];
    while (decoys.length < 2) {
      const c = inWord.length && Math.random() < 0.55
        ? inWord[Math.floor(Math.random() * inWord.length)]
        : String.fromCharCode(65 + Math.floor(Math.random() * 26));
      if (c !== need && !decoys.includes(c)) decoys.push(c);
    }
    const letters = [need, ...decoys].sort(() => Math.random() - 0.5);
    row.idx = idx;
    row.items = [-0.75, 0, 0.75].map((x, i) => ({ type: 'letter', kind: 'letter', ch: letters[i], z: row.z, x, e: 0.2, row, popT: this.t }));
    this.gen.items.push(...row.items);
    this.gen.items.sort((a, b) => a.z - b.z);
  }

  // After a pick or a skipped row, the rows still ahead are re-lettered so
  // the nearest one always holds the next letter you need.
  relabel() {
    const wm = this.st.wm;
    wm.rows = wm.rows.filter((r) => r.live).sort((a, b) => a.z - b.z);
    wm.rows.forEach((row, i) => {
      const idx = wm.got + i;
      if (idx >= wm.w.length) {
        row.live = false;
        for (const it of row.items) it.taken = true;
        row.slot.used = false;                                // free the spot for later
      } else if (row.idx !== idx) this.setLetters(row, idx);
    });
    wm.rows = wm.rows.filter((r) => r.live);
  }

  onLetter(it) {
    const st = this.st, wm = st.wm, row = it.row;
    if (!row.live || wm.got >= wm.w.length) return;
    row.live = false;
    for (const o of row.items) if (o !== it) o.taken = true;   // the other bubbles pop
    const p = this.lastSeal || { x: 80, top: 170 };
    const need = wm.w[wm.got];
    if (it.ch === need) {
      // RIGHT: the letter flies down to its slot (the reward happens when it lands)
      wm.fly.push({ ch: it.ch, idx: wm.got, x0: p.x, y0: p.top + 6, t: 0 });
      wm.got++;
      st.bank += HH.Study.LETTER_FISH;
      HH.Audio.play('pop');
      HH.Particles.sparkle(p.x, p.top + 8, HH.PAL.seafoam, 6);
      if (wm.got >= wm.w.length) {
        for (const r of wm.rows) { r.live = false; for (const o of r.items) o.taken = true; }
      }
    } else {
      // WRONG: it costs a heart (no hint: the player recalls the word)
      wm.mistakes++;
      if (!wm.practice.includes(wm.w)) wm.practice.push(wm.w);
      this.toast(`OOPS! IT'S ${need}`);
      // Show the right letter in its slot for a moment, as a faint outline.
      // Feedback right after a miss is when it teaches best; the slot empties
      // again, so the player still has to recall it and scoot into it.
      wm.reveal = { idx: wm.got, ch: need, t: this.t };
      this.onHit({ type: 'bonk', it });
      if (this.mode !== 'play') return;
    }
    this.relabel();
  }

  stepWords(dt) {
    const st = this.st, wm = st.wm, seal = this.seal;
    // letters flying down to the slots
    for (const f of wm.fly) {
      f.t += dt;
      if (f.t >= HH.UI.FLY_TIME && !f.done) { f.done = true; this.letterLanded(f); }
    }
    wm.fly = wm.fly.filter((f) => !f.done);

    // a row slipped past (hopped over or missed): the needed letter comes again
    if (wm.rows.some((r) => r.live && r.z < seal.z - 0.5)) {
      for (const r of wm.rows) if (r.z < seal.z - 0.5) r.live = false;
      this.relabel();
    }

    if (wm.doneT > 0) {
      wm.doneT -= dt;
      if (wm.doneT <= 0 && this.mode === 'play') {
        // today's words done and no reviews waiting: stop here (unless practising extra)
        if (!wm.extra && HH.Study.dayDone(this.save)) this.endDay();
        else this.nextWord();
      }
    }
  }

  // The satisfying moment: the letter clicks into its slot with a rising note.
  letterLanded(f) {
    const wm = this.st.wm;
    wm.shown++;
    wm.pops[f.idx] = this.t;
    if (wm.reveal && wm.reveal.idx === f.idx) wm.reveal = null;   // the real letter replaces the hint
    HH.Audio.play('letter', f.idx, wm.w.length);                   // the next note up the scale
    const pos = HH.UI.slotPos(wm.w.length, f.idx);
    HH.Particles.text(pos.x, pos.y - 9, `+${HH.Study.LETTER_FISH}`, HH.PAL.gold);
    if (wm.shown >= wm.w.length) this.wordDone();
  }

  wordDone() {
    const st = this.st, wm = st.wm, s = this.save;
    const res = HH.Study.finish(s, wm.w, wm.mistakes);
    wm.done.push(wm.w);
    wm.count++;
    if (res.streakUp) st.bank += res.bonus;     // the daily streak bonus
    // today's ocean fact uses one of today's words: it is found when that word
    // is spelled (or when the day's words are done, as a fallback)
    if (s.lastFactDay !== HH.Study.today()) {
      const f = HH.Study.factToFind(s, HH.Study.todayWords(s));
      if (f && f.word === wm.w) this.discover(f);
      else if (res.goalDone || HH.Study.dayDone(s)) this.discover(f);
    }
    // graduation: learning ALL the words earns Professor Seal's cap
    const graduated = HH.Study.learnedCount(s) >= HH.WORDS.length && !s.cosmetics.mortarboard;
    if (graduated) { s.cosmetics.mortarboard = true; st.unlocked.push('GRAD CAP'); }

    if (graduated) { this.toast('YOU GRADUATED! GRAD CAP EARNED!'); st.toastT = 3; }
    else if (res.streakUp) { this.toast(`DAY ${s.streak.count} STREAK! +${res.bonus} FISH`); st.toastT = 2.4; }
    else if (res.goalDone) { this.toast(`DAILY GOAL DONE! ${HH.Study.dailyGoal(s)} NEW WORDS`); st.toastT = 2.6; }
    else this.toast(res.firstTime ? 'NEW WORD LEARNED!' : wm.mistakes ? 'SPELLED IT!' : 'PERFECT SPELLING!');
    HH.Audio.play(graduated ? 'unlock' : 'spelled');
    // a sparkle runs along the whole tray, left to right
    for (let i = 0; i < wm.w.length; i++) {
      const p = HH.UI.slotPos(wm.w.length, i);
      HH.Particles.sparkle(p.x, p.y + 4, i % 2 ? HH.PAL.gold : HH.PAL.seafoam, 3);
    }
    this.seal.setFace('sing', 1.2);
    if (this.lastSeal) HH.Particles.heart(this.lastSeal.x, this.lastSeal.top);
    wm.doneT = 1.7;
    HH.Save.save();
  }

  // DONE FOR TODAY: the day's new words are learned and no review is waiting.
  // A happy results screen instead of more words (PRACTICE plays on).
  endDay() {
    const st = this.st, s = this.save, wm = st.wm;
    s.wallet += st.bank;
    s.runs++;
    if (s.lastFactDay !== HH.Study.today()) this.discover(HH.Study.factToFind(s, HH.Study.todayWords(s)));
    HH.Save.save();
    this.result = {
      words: true, dayDone: true, done: HH.Study.todayWords(s), practice: wm.practice.slice(),
      learned: HH.Study.learnedCount(s), streak: HH.Study.currentStreak(s),
      earned: st.bank, wallet: s.wallet, goal: this.nextGoal(),
      newFacts: st.newFacts.length, factId: st.newFacts[0],
    };
    st.bank = 0;
    this.seal.setFace('sing', 99);
    this.setMode('over');
  }

  // Unlock the next ocean fact (shown on the results screen and in the Flipbook).
  discover(pick) {
    const facts = this.save.facts;
    // only ONE ocean fact a day, no matter how much you play
    const today = HH.Study.today();
    if (this.save.lastFactDay === today) return;
    const next = pick || HH.FACTS.find((f) => !facts.includes(f.id));
    if (!next) return;
    this.save.lastFactDay = today;
    {
      facts.push(next.id); this.st.newFacts.push(next.id); this.factPage = facts.length - 1;
    }
    HH.Save.save();
  }

  grant(ach, cos, label) {
    const s = this.save;
    if (!s.achievements[ach]) s.achievements[ach] = true;
    if (cos && !s.cosmetics[cos]) {
      s.cosmetics[cos] = true;
      if (this.st) { this.st.unlocked.push(label); this.toast(`NEW LOOK: ${label}!`); }
      HH.Audio.play('unlock');
    }
    HH.Save.save();
  }

  // ---------------------------------------------------------------------------
  // Game over: the belly flop
  // ---------------------------------------------------------------------------
  gameOver(it) {
    const st = this.st, s = this.save;
    this.setMode('flop');
    this.flopLanded = false;
    this.seal.flop();
    HH.Audio.play('bonk');
    if (it && it.kind === 'boulder') this.seal.v = 0.6;       // boulders stop you, logs and rocks you sail over

    if (st.boss) {
      // keep the fish from first-try answers; the boss waits to be tried again
      this.bossResult(false);
      return;
    }

    if (st.wm) {
      // Word Mode keeps its own results: words spelled and words to practise.
      // (The distance record belongs to Cruise.)
      const wm = st.wm;
      if (wm.w && wm.shown < wm.w.length) {
        HH.Study.unfinished(s, wm.w, wm.started);          // it will be the first word next run
        if (wm.started && !wm.practice.includes(wm.w)) wm.practice.push(wm.w);
      }
      s.wallet += st.bank;
      s.runs++;
      HH.Save.save();
      this.result = {
        words: true, done: wm.done.slice(), practice: wm.practice.slice(),
        learned: HH.Study.learnedCount(s), streak: HH.Study.currentStreak(s),
        earned: st.bank, wallet: s.wallet, goal: this.nextGoal(),
        newFacts: st.newFacts.length, factId: st.newFacts[0],
      };
      return;
    }

    // results and records
    const dist = Math.floor(st.dist);
    const prevBest = s.bestDist;
    const newBest = dist > prevBest;
    s.bestDist = Math.max(prevBest, dist);
    s.bestFish = Math.max(s.bestFish, st.eaten);
    s.wallet += st.bank;                                   // the run's catch goes into the bucket
    s.runs++;
    for (const k of Object.keys(st.counts)) s.totals[k] += st.counts[k];   // the journal's collection
    HH.Save.save();

    this.result = {
      dist, eaten: st.eaten, best: Math.max(prevBest, dist), earned: st.bank, wallet: s.wallet,
      goal: this.nextGoal(),
      newBest: newBest && prevBest > 0, bestCombo: st.bestCombo,
      unlocked: st.unlocked.slice(), newFacts: st.newFacts.length, factId: st.newFacts[0],
      tip: this.tipFor(it),
    };
  }

  // The cheapest look you don't own yet: the "just one more run" target.
  nextGoal() {
    const s = this.save;
    const item = HH.UI.SHOP.filter(([id, , price]) => price > 0 && !s.cosmetics[id]).sort((a, b) => a[2] - b[2])[0];
    if (!item) return null;
    return { name: item[1], price: item[2], need: Math.max(0, item[2] - s.wallet) };
  }

  // Shop: tap a look to try it on; tap a look you own to wear it.
  shop(id) {
    const s = this.save;
    const item = HH.UI.SHOP.find(([k]) => k === id);
    if (!item) return;
    this.shopSel = id;
    this.shopMsg = null;
    if (id === 'none' || s.cosmetics[id]) s.equipped = id;
    HH.Save.save();
  }

  buy() {
    const s = this.save, id = this.shopSel;
    const item = HH.UI.SHOP.find(([k]) => k === id);
    if (!item || s.cosmetics[id] || item[2] < 0) return;   // the grad cap is earned, not bought
    if (s.wallet >= item[2]) {
      s.wallet -= item[2];
      s.cosmetics[id] = true;
      s.equipped = id;
      this.shopMsg = `${item[1]} IS YOURS!`;
      HH.Audio.play('unlock');
    } else {
      this.shopMsg = `${item[2] - s.wallet} MORE FISH NEEDED`;
      HH.Audio.play('heart');
    }
    this.shopMsgUntil = this.t + 1.8;
    HH.Save.save();
  }

  // One friendly, specific hint for the next try (on the game-over screen only).
  tipFor(it) {
    const kind = it ? it.kind : '';
    if (kind === 'boulder') return 'STEER INTO ROCK GAPS';
    if (kind === 'log') return 'HOP JUST BEFORE A LOG';
    if (kind === 'crab') return 'HOP OVER WANDERING CRABS';
    if (this.seal.bestRhythm < 3) return 'TAP RIGHT AS YOU LAND';
    return 'PEARLS GIVE A SAFE BUBBLE';
  }

  stepFlop(dt) {
    const s = this.seal;
    s.runSpeed = this.speed(s.z);
    s.floor = 0;
    s.update(dt, 0);
    for (const e of s.events) {
      if (e.type === 'land' && !this.flopLanded) {
        // SPLAT: the big belly flop, then the seal turns to look at you
        this.flopLanded = true;
        this.flopT = 0;
        s.sqv -= 6;
        s.view = 'front';
        HH.Audio.play('flop');
        if (this.lastSeal) HH.Particles.dust(this.lastSeal.x, this.lastSeal.groundY, 1.6);
      }
    }
    s.events.length = 0;
    if (this.flopLanded) {
      this.flopT += dt;
      if (this.flopT > 0.5 && s.face === 'surprised') s.setFace('blink', 0.2);
      if (this.flopT > 0.7) s.setFace('happy', 99);     // "oops!" ... but still smiling
    }
    if (this.mode === 'flop' && this.flopLanded && this.flopT > 1.0) this.setMode('over');

    HH.Proj.camZ = s.z - HH.View.CAM_BACK;
    HH.Proj.camX += (HH.Level.pathX(s.z) + s.x * 0.65 - HH.Proj.camX) * Math.min(1, dt * 4);
    HH.Entities.update(this.gen.items, this.t);
  }

  // ---------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------
  render() {
    const g = this.g, t = this.t;
    const acc = this.save.equipped;
    let btns = [];
    g.clearRect(0, 0, HH.View.W, HH.View.H);     // the game layer is transparent over the background

    if (this.mode === 'title') {
      HH.World.drawScene(g, t, { gen: this.titleGen, dist: 0 });
      const s = this.titleSeal;
      HH.World.drawSealAt(g, s, acc, 80, 214 - Math.round(s.y * 70), 2);   // the big, squishy star of the show
      HH.Particles.draw(g);
      if (this.overlay) btns = this.drawOverlay(g, t, acc);
      else btns = HH.UI.title(g, t, this.save);
    } else {
      // during a lesson the player's seal steps aside so the board has the stage
      const showSeal = this.mode !== 'lesson';
      const info = HH.World.drawScene(g, t, { gen: this.gen, seal: showSeal ? this.seal : null, acc, dist: this.seal.z });
      if (showSeal) this.lastSeal = info;
      if (this.st.shield && this.mode === 'play' && this.lastSeal) HH.UI.bubble(g, this.lastSeal, t);
      HH.Particles.draw(g);
      HH.World.tintSprites(g);                       // match sprites to sunset / moonlight
      const wm = this.st.wm, boss = this.st.boss;
      if (boss && (this.mode === 'play' || this.mode === 'paused' || this.mode === 'flop')) btns = HH.Boss.hud(g, t, this.st, HH.Game.HEARTS);
      else if (boss && this.mode === 'bossCard') btns = HH.Boss.card(g, t, this.st, this.modeT);
      else if (wm && (this.mode === 'play' || this.mode === 'paused' || this.mode === 'flop')) btns = HH.UI.wordHud(g, t, this.st, HH.Game.HEARTS);
      else if (this.mode === 'play' || this.mode === 'paused') btns = HH.UI.hud(g, t, this.st, HH.Game.HEARTS, this.result ? 0 : this.save.bestDist);
      if (this.mode === 'lesson') {
        btns = HH.UI.lesson(g, t, wm, this.modeT, (gg, x, y) => this.drawProfessor(gg, x, y));
      }
      if (this.mode === 'play' && !wm && !boss && this.st.dist < 12) HH.UI.hint(g, t, HH.Input.touching || 'ontouchstart' in window, this.seal.state === 'ground' && this.st.dist < 6 ? 0 : 1);
      if (this.mode === 'paused') btns = HH.UI.pause(g);
      if (this.mode === 'over') {
        btns = this.overlay ? this.drawOverlay(g, t, acc)
          : this.result.boss ? HH.Boss.over(g, t, this.result, this.modeT)
          : this.result.words ? HH.UI.wordOver(g, t, this.result, this.modeT) : HH.UI.over(g, t, this.result, this.modeT);
      }
    }

    // keep the pressed animation state between frames
    const old = this.buttons;
    for (const b of btns) {
      const prev = old.find((o) => o.id === b.id);
      if (prev && prev.pressT > 0) b.pressT = prev.pressT;
    }
    this.buttons = btns;
    const usable = btns.filter((b) => !b.disabled && b.id !== 'pause');
    const focused = usable[Math.min(this.focus, usable.length - 1)];
    for (const b of btns) HH.UI.button(g, b, b === focused && this.mode !== 'play', t);
  }

  drawOverlay(g, t, acc) {
    if (this.overlay === 'privacy') return HH.UI.privacyNote(g, t);
    if (this.overlay === 'bosstest') return HH.Boss.tester(g, t);
    if (this.overlay === 'bossinfo') return HH.Boss.info(g, t, this.save);
    if (this.overlay === 'settings') return HH.UI.settings(g, t, this.save);
    if (this.overlay === 'journal') return HH.UI.journal(g, t, this.save, this.factPage);
    if (this.overlay === 'help') return HH.UI.help(g, t, this.helpPage || 0);
    if (this.overlay === 'wordbook') return HH.UI.wordBook(g, t, this.save, this.book);
    const sel = this.shopSel || this.save.equipped;
    const shop = { sel, msg: this.t < (this.shopMsgUntil || 0) ? this.shopMsg : null };
    return HH.UI.shopScreen(g, t, this.save, shop, (gg, x, y) => {
      // the mirror shows a big seal wearing what you picked (try before you buy)
      const f = this.titleSeal.frame(sel);
      const spr = HH.Sprites.seal(Object.assign({}, f, { sx: 1, sy: 1, flip: 'tuck', view: 'front', face: f.face === 'blink' ? 'blink' : 'open' }));
      HH.Entities.pixelEllipse(gg, x, y - 1, 24, 4, HH.PAL.shadow);
      gg.drawImage(spr.canvas, x - spr.ax * 2 + 1, y - spr.ay * 2, spr.canvas.width * 2, spr.canvas.height * 2);
    });
  }

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------
  start() {
    const STEP = 1 / 120;
    let last = performance.now(), acc = 0;
    const frame = (now) => {
      acc += Math.min(0.1, (now - last) / 1000);   // cap so a hiccup never teleports the seal
      last = now;
      if (this.mode !== 'paused') {
        while (acc >= STEP) { this.step(STEP); acc -= STEP; }
      } else {
        acc = 0;
        this.t += 1 / 60;
      }
      this.render();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
};
