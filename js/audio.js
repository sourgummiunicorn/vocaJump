// audio.js
// Every sound is synthesized live with the Web Audio API: no audio files.
//
// Signal flow:
//   sound effects -> sfxBus   ┐
//   ocean waves   -> sfxBus   ├-> master -> speakers
//   music         -> musicBus ┘  (music also feeds a soft echo)
//
// Browsers only allow audio after the player touches the page, so init()
// is called from the first tap or key press.

HH.Audio = (function () {
  let ctx = null, master, sfxBus, musicBus, noiseBuf, pulse25, pulse12;
  const MUSIC_VOL = 1.3;      // song 1 (synth) loudness; was 0.5, raised so it sits closer to song 2
  let musicOn = true, sfxOn = true;

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); syncSong(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();

    master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = sfxOn ? 1 : 0; sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = musicOn ? MUSIC_VOL : 0; musicBus.connect(master);

    // A gentle echo on the music makes the chiptune feel dreamy, not harsh.
    const delay = ctx.createDelay(1); delay.delayTime.value = 0.34;
    const fb = ctx.createGain(); fb.gain.value = 0.28;
    const wet = ctx.createGain(); wet.gain.value = 0.22;
    musicBus.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(master);

    // White noise, reused for waves, sand and thumps.
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // Pulse waves = the classic 8-bit "square" family, softer at narrow widths.
    pulse25 = pulseWave(0.25);
    pulse12 = pulseWave(0.125);

    startOcean();
    startMusic();
    syncSong();
    // iPhones only let a page talk after a tap: say nothing now, inside the
    // tap, so later words can be spoken
    if (window.speechSynthesis) { try { speechSynthesis.speak(new SpeechSynthesisUtterance(' ')); } catch (e) { /* no voice here */ } }
  }

  // ---------------------------------------------------------------------------
  // PROFESSOR SEAL'S VOICE: the word read aloud by the device's own speech
  // voice, pitched up and slowed down to sound like a little seal, after a
  // tiny "ar-ar!". It is quiet when SOUND FX is off. No internet needed: the
  // voice comes from the phone or computer.
  // ---------------------------------------------------------------------------
  let voice = null;
  function pickVoice() {
    const all = window.speechSynthesis ? speechSynthesis.getVoices() : [];
    const en = all.filter((v) => /^en[-_]/i.test(v.lang));
    const like = ['Samantha', 'Google US English', 'Aria', 'Jenny', 'Ava', 'Allison', 'Karen', 'Moira', 'Serena'];
    voice = like.map((n) => en.find((v) => v.name.includes(n))).find(Boolean)
      || en.find((v) => /en[-_]US/i.test(v.lang)) || en[0] || null;
  }
  if (window.speechSynthesis) { pickVoice(); speechSynthesis.addEventListener && speechSynthesis.addEventListener('voiceschanged', pickVoice); }

  function say(word) {
    if (!sfxOn || !window.speechSynthesis || !word) return false;
    try {
      speechSynthesis.cancel();
      if (ctx) sfx.bark();
      const u = new SpeechSynthesisUtterance(String(word).toLowerCase());   // lowercase: read as a word, not letters
      if (!voice) pickVoice();
      if (voice) u.voice = voice;
      u.lang = voice ? voice.lang : 'en-US';
      u.pitch = 1.8;                                  // a little seal: high...
      u.rate = 0.85;                                  // ...and unhurried, so the word is clear
      u.volume = 1;
      setTimeout(() => speechSynthesis.speak(u), ctx ? 280 : 0);
      return true;
    } catch (e) { return false; }
  }

  function pulseWave(duty) {
    const n = 32, real = new Float32Array(n), imag = new Float32Array(n);
    for (let i = 1; i < n; i++) real[i] = (2 / (i * Math.PI)) * Math.sin(i * Math.PI * duty);
    return ctx.createPeriodicWave(real, imag);
  }

  // ---------------------------------------------------------------------------
  // Building blocks
  // ---------------------------------------------------------------------------
  // tone(freq, dur, opts): one note with a quick attack and a soft decay.
  function tone(freq, dur, o = {}) {
    if (!ctx) return;
    const t = ctx.currentTime + (o.delay || 0);
    const osc = ctx.createOscillator();
    if (o.wave === 'p25') osc.setPeriodicWave(pulse25);
    else if (o.wave === 'p12') osc.setPeriodicWave(pulse12);
    else osc.type = o.wave || 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, t + (o.slideTime || dur));

    if (o.vibrato) {
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = o.vibrato; lg.gain.value = o.vibDepth || 20;
      lfo.connect(lg); lg.connect(osc.frequency);
      lfo.start(t); lfo.stop(t + dur + 0.05);
    }

    const g = ctx.createGain();
    const vol = o.vol || 0.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (o.attack || 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(o.bus || sfxBus);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  // noise burst through a filter: sand, thumps, squishes.
  function noise(dur, o = {}) {
    if (!ctx) return;
    const t = ctx.currentTime + (o.delay || 0);
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = o.filter || 'lowpass'; f.frequency.setValueAtTime(o.freq || 800, t); f.Q.value = o.q || 0.7;
    if (o.freqTo) f.frequency.exponentialRampToValueAtTime(o.freqTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.vol || 0.15, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(sfxBus);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }

  // ---------------------------------------------------------------------------
  // Sound effects
  // ---------------------------------------------------------------------------
  // A pentatonic scale: any two notes from it sound nice together,
  // so a chain of fish always plays a pleasant little tune.
  const PENTA = [72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96];
  // C major across two octaves (C5 to C7): 15 notes, one per possible letter.
  const MAJOR2 = [72, 74, 76, 77, 79, 81, 83, 84, 86, 88, 89, 91, 93, 95, 96];

  const sfx = {
    // soft "boop" when the seal pushes off. Higher rhythm = slightly higher boop.
    hop(rhythm = 0) {
      const base = 300 + rhythm * 40;
      tone(base, 0.12, { wave: 'p25', vol: 0.09, slideTo: base * 1.7, slideTime: 0.08 });
    },
    // gentle "plop": a falling sine plus a puff of sand
    land(power = 1) {
      tone(210, 0.16, { wave: 'sine', vol: 0.32 * power, slideTo: 70, slideTime: 0.14 });
      noise(0.08, { freq: 900, vol: 0.06 * power });
    },
    // "bloop" that climbs the scale as the combo grows
    food(kind, combo) {
      const n = PENTA[Math.min(combo, PENTA.length - 1)];
      if (kind === 'fish') {
        tone(midi(n - 5), 0.12, { wave: 'triangle', vol: 0.22, slideTo: midi(n), slideTime: 0.05 });
        tone(midi(n + 12), 0.1, { wave: 'p12', vol: 0.04, delay: 0.04 });
      } else if (kind === 'shrimp') {
        tone(midi(n), 0.1, { wave: 'p25', vol: 0.09 });
        tone(midi(n + 7), 0.14, { wave: 'p25', vol: 0.08, delay: 0.07 });
      } else if (kind === 'squid') {
        [0, 4, 7, 12].forEach((s, i) => tone(midi(n + s - 12), 0.16, { wave: 'triangle', vol: 0.2, delay: i * 0.06 }));
      } else if (kind === 'gold') {
        [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => tone(midi(72 + s), 0.25, { wave: 'p12', vol: 0.08, delay: i * 0.05 }));
        tone(midi(96), 0.9, { wave: 'sine', vol: 0.08, delay: 0.35, vibrato: 6, vibDepth: 8 });
      }
    },
    // funny soft wobble after a bump
    bonk() {
      tone(440, 0.45, { wave: 'sine', vol: 0.2, slideTo: 190, slideTime: 0.42, vibrato: 13, vibDepth: 45 });
      noise(0.06, { freq: 500, vol: 0.12 });
    },
    // squelch in the kelp
    kelp() {
      noise(0.22, { filter: 'bandpass', freq: 700, freqTo: 250, q: 4, vol: 0.25 });
      tone(150, 0.16, { wave: 'sine', vol: 0.12, slideTo: 110 });
    },
    // a little two-note "nice!" when the rhythm level goes up
    rhythm(level) {
      const n = 76 + level * 3;
      tone(midi(n), 0.08, { wave: 'p12', vol: 0.05 });
      tone(midi(n + 5), 0.1, { wave: 'p12', vol: 0.05, delay: 0.06 });
    },
    // the goal chime: a bell-like arpeggio
    goal() {
      [72, 76, 79, 84, 88].forEach((n, i) => {
        tone(midi(n), 1.1, { wave: 'triangle', vol: 0.18, delay: i * 0.12 });
        tone(midi(n + 12), 0.6, { wave: 'sine', vol: 0.05, delay: i * 0.12 });
      });
    },
    // a cosy settling-down sigh
    rest() {
      tone(midi(67), 0.5, { wave: 'sine', vol: 0.1, slideTo: midi(60) });
    },
    click() { tone(1200, 0.04, { wave: 'p25', vol: 0.05 }); },
    // the end of a run: a big squishy belly flop, then a cute "womp womp"
    flop() {
      tone(260, 0.3, { wave: 'sine', vol: 0.4, slideTo: 60, slideTime: 0.28 });
      noise(0.18, { freq: 700, vol: 0.14 });
      [67, 66, 65, 60].forEach((n, i) => tone(midi(n), i === 3 ? 0.5 : 0.18,
        { wave: 'p25', vol: 0.06, delay: 0.35 + i * 0.18, vibrato: i === 3 ? 6 : 0, vibDepth: 6 }));
    },
    // losing a heart: a soft falling two-note "oh no"
    heart() {
      tone(midi(76), 0.12, { wave: 'p25', vol: 0.08 });
      tone(midi(71), 0.22, { wave: 'p25', vol: 0.08, delay: 0.1, vibrato: 7, vibDepth: 8 });
    },
    // a pearl's bubble: a soft rising shimmer, and a pop when it saves you
    shield() { [72, 79, 84].forEach((n, i) => tone(midi(n), 0.25, { wave: 'sine', vol: 0.1, delay: i * 0.05, vibrato: 9, vibDepth: 10 })); },
    pop() { tone(900, 0.08, { wave: 'sine', vol: 0.2, slideTo: 1600 }); noise(0.05, { filter: 'highpass', freq: 2000, vol: 0.08 }); },
    // sea glass: a little discovery chime
    glass() { [84, 88, 91, 96].forEach((n, i) => tone(midi(n), 0.4, { wave: 'triangle', vol: 0.09, delay: i * 0.07 })); },
    // a gentle whoosh when the pace picks up
    speed() { noise(0.5, { filter: 'bandpass', freq: 400, freqTo: 1800, q: 1.2, vol: 0.06 }); },
    // WORD MODE: each correct letter plays the next note of a major scale.
    // The scale is 15 notes (two octaves, C to C), the longest word length.
    // A word starts partway up so its LAST letter always lands on the top C:
    // you can hear how close you are to "home" without seeing any letters.
    letter(idx, n) {
      const step = Math.max(0, Math.min(14, 15 - n + idx));
      const note = MAJOR2[step];
      tone(midi(note), 0.16, { wave: 'triangle', vol: 0.24, slideTo: midi(note) * 1.01, slideTime: 0.03 });
      tone(midi(note + 12), 0.1, { wave: 'p12', vol: 0.035, delay: 0.03 });
    },
    // the word is complete: the tune resolves with a bright chord on "home"
    spelled() {
      [72, 76, 79, 84].forEach((n, i) => tone(midi(n), 0.6, { wave: 'triangle', vol: 0.12, delay: 0.08 + i * 0.03 }));
      tone(midi(96), 0.8, { wave: 'sine', vol: 0.06, delay: 0.2, vibrato: 6, vibDepth: 6 });
    },
    // a tiny seal "ar-ar!" before Professor Seal says a word
    bark() {
      tone(520, 0.09, { wave: 'p25', vol: 0.09, slideTo: 780, slideTime: 0.07 });
      tone(600, 0.1, { wave: 'p25', vol: 0.09, slideTo: 900, slideTime: 0.08, delay: 0.12 });
    },
    unlock() {
      [79, 84, 88, 91].forEach((n, i) => tone(midi(n), 0.3, { wave: 'p25', vol: 0.07, delay: i * 0.09 }));
    },
  };

  // ---------------------------------------------------------------------------
  // Ocean ambience: looping noise, low-passed, slowly swelling like waves.
  // ---------------------------------------------------------------------------
  function startOcean() {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
    const g = ctx.createGain(); g.gain.value = 0.07;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13;   // one swell every ~8 seconds
    const lg = ctx.createGain(); lg.gain.value = 0.055;
    lfo.connect(lg); lg.connect(g.gain);
    src.connect(f); f.connect(g); g.connect(sfxBus);
    src.start(); lfo.start();
  }

  // ---------------------------------------------------------------------------
  // Music: a soft 16-bar chiptune loop, scheduled slightly ahead of time.
  // ---------------------------------------------------------------------------
  const BPM = 86, BEAT = 60 / BPM;
  const CHORDS = {
    C: [60, 64, 67], Am: [57, 60, 64], F: [53, 57, 60], G: [55, 59, 62], Em: [52, 55, 59],
  };
  const PROG = ['C', 'Am', 'F', 'G', 'C', 'Em', 'F', 'G', 'Am', 'F', 'C', 'G', 'F', 'G', 'C', 'C'];
  // Melody, one string per bar: NOTE:BEATS. "R" is a rest.
  const MELODY = [
    'E5:1 G5:1 C6:1.5 B5:.5', 'A5:2 E5:1 C5:1', 'F5:1 A5:1 C6:1 A5:1', 'G5:3 R:1',
    'E5:1 D5:.5 E5:.5 G5:2', 'B4:1 E5:1 G5:1 E5:1', 'A5:1.5 G5:.5 F5:1 A5:1', 'G5:2 D5:1 B4:1',
    'C5:1 E5:1 A5:2', 'A5:1 G5:.5 F5:.5 C5:2', 'E5:1 G5:1 E5:1 D5:1', 'D5:3 R:1',
    'F5:1 A5:1 C6:2', 'B5:1 A5:.5 G5:.5 D5:2', 'E5:1 G5:1 D5:1 E5:1', 'C5:3 R:1',
  ];
  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const parseNote = (s) => 12 * (parseInt(s.slice(-1), 10) + 1) + NOTE[s[0]];

  // Turn the melody text into a list of { beat, midi, len } events.
  const melodyEvents = [];
  MELODY.forEach((bar, b) => {
    let beat = b * 4;
    bar.split(' ').forEach((tok) => {
      const [n, len] = tok.split(':');
      const l = parseFloat(len);
      if (n !== 'R') melodyEvents.push({ beat, midi: parseNote(n), len: l });
      beat += l;
    });
  });
  const LOOP_BEATS = 64;

  let musicStart = 0, nextBeat = 0;

  function startMusic() {
    musicStart = ctx.currentTime + 0.1;
    nextBeat = 0;
    setInterval(scheduleMusic, 40);
  }

  function scheduleMusic() {
    if (!ctx || ctx.state !== 'running') return;
    const ahead = ctx.currentTime + 0.25;
    // schedule in half-beat steps
    while (musicStart + nextBeat * BEAT < ahead) {
      const b = nextBeat % LOOP_BEATS;
      const when = musicStart + nextBeat * BEAT - ctx.currentTime;
      if (track !== 1) { nextBeat += 0.5; continue; }   // a recorded song is playing: keep time, play nothing
      const chord = CHORDS[PROG[Math.floor(b / 4)]];
      const inBar = b % 4;

      // bass: root on beat 1, fifth on beat 3
      if (inBar === 0) tone(midi(chord[0] - 12), BEAT * 1.6, { wave: 'triangle', vol: 0.26, bus: musicBus, delay: when });
      if (inBar === 2) tone(midi(chord[2] - 12), BEAT * 1.4, { wave: 'triangle', vol: 0.2, bus: musicBus, delay: when });

      // soft arpeggio on eighth notes
      const arp = [0, 1, 2, 1];
      const step = Math.round((b % 1) * 2);   // 0 or 1 (half beat)
      const idx = arp[(Math.floor(inBar) * 2 + step) % 4];
      tone(midi(chord[idx] + 12), BEAT * 0.45, { wave: 'p12', vol: 0.035, bus: musicBus, delay: when });

      // melody notes that start on this half beat
      for (const ev of melodyEvents) {
        if (Math.abs(ev.beat - b) < 0.01) {
          tone(midi(ev.midi), BEAT * ev.len * 0.95, { wave: 'p25', vol: 0.07, bus: musicBus, delay: when, vibrato: 5, vibDepth: 3 });
        }
      }
      nextBeat += 0.5;
    }
  }

  // ---------------------------------------------------------------------------
  // Recorded songs. Song 1 is the synth tune above; songs 2 and 3 are files.
  //   2: "Seal Belly Hop"   (audio/seal-belly-hop.mp3)
  //   3: "Sealy Techno"     (audio/sealytechno.wav, the balanced mix), a short 33-second loop
  //      (?v=2 makes browsers fetch the new mix instead of a saved copy of the old one)
  // Each plays through an <audio> element, which also works when the game is
  // opened straight from a file. Song 3 is short, so a tiny gap at the loop
  // point would be heard every half minute: when the browser allows it, we
  // decode it into Web Audio and loop it sample-perfectly instead.
  // ---------------------------------------------------------------------------
  const SONGS = {
    2: { src: 'audio/seal-belly-hop.mp3', vol: 0.8 },
    3: { src: 'audio/sealytechno.wav?v=2', vol: 0.26, seamless: true },   // the balanced mix is ~10 dB louder than song 2, so turned down to match
  };
  let track = 1;
  const els = {};                // <audio> elements, made when first needed
  let buf3 = null, src3 = null, gain3 = null, loading3 = false;

  // Is song n the one that should be playing right now?
  const wanted = (n) => !!ctx && musicOn && !document.hidden && track === n;

  function songEl(n) {
    if (!els[n]) {
      const a = new Audio(SONGS[n].src);
      a.loop = true; a.preload = 'auto'; a.volume = SONGS[n].vol;
      // BACKUP LOOP: `loop = true` should repeat the song forever, but some
      // browsers (and some web servers) let it stop after one play. If it
      // ever ends, rewind it and start again ourselves.
      a.addEventListener('ended', () => {
        a.currentTime = 0;
        if (wanted(n) && !(n === 3 && buf3)) a.play().catch(() => {});
      });
      els[n] = a;
    }
    return els[n];
  }

  // Try to load song 3 into Web Audio. If that fails (for example when the
  // game is opened from a file), the <audio> element plays it instead.
  function loadSeamless() {
    if (loading3 || buf3 || !window.fetch) return;
    loading3 = true;
    fetch(SONGS[3].src).then((r) => r.arrayBuffer())
      .then((data) => new Promise((ok, bad) => ctx.decodeAudioData(data, ok, bad)))
      .then((b) => { buf3 = b; if (els[3]) els[3].pause(); syncSong(); })
      .catch(() => { /* keep using the <audio> element */ });
  }

  // Some audio files start with a sliver of silence; find where the sound really begins
  // so the loop jumps from the last note straight to the first.
  function firstSound(b) {
    const d = b.getChannelData(0);
    for (let i = 0; i < Math.min(d.length, b.sampleRate); i++) if (Math.abs(d[i]) > 1e-4) return i / b.sampleRate;
    return 0;
  }

  function startSeamless() {
    if (src3) return;
    if (!gain3) { gain3 = ctx.createGain(); gain3.connect(master); }
    gain3.gain.value = SONGS[3].vol;
    const node = ctx.createBufferSource(); node.buffer = buf3; node.loop = true;
    const start = firstSound(buf3);
    node.loopStart = start; node.loopEnd = buf3.duration;   // the whole file is one loop
    // BACKUP LOOP: if the browser ever stops the sound on its own, start a fresh copy
    node.onended = () => { if (src3 === node) { src3 = null; if (wanted(3)) startSeamless(); } };
    node.connect(gain3); node.start(0, start);
    src3 = node;
  }
  function stopSeamless() {
    if (!src3) return;
    const node = src3; src3 = null;          // clear first, so onended knows WE stopped it
    try { node.stop(); } catch (e) { /* already stopped */ }
    node.disconnect();
  }

  // Play the chosen recorded song only when music is on; pause everything else.
  function syncSong() {
    if (!ctx) return;                        // wait for the first tap (browsers block sound before that)
    const want = musicOn && !document.hidden ? track : 0;
    for (const n in els) if (+n !== want && !els[n].paused) els[n].pause();
    if (want !== 3) stopSeamless();
    if (want === 2) songEl(2).play().catch(() => { /* blocked: tries again on next tap */ });
    if (want === 3) {
      loadSeamless();
      if (buf3) startSeamless();
      else songEl(3).play().catch(() => {});   // plays right away while the seamless copy loads
    }
  }
  document.addEventListener('visibilitychange', syncSong);   // stop the song when the app is in the background

  // WATCHDOG: every 1.5 seconds, make sure the chosen song is really playing.
  // Phones can pause audio behind our back (a phone call, the lock screen,
  // another app's sound); this quietly starts the music again.
  setInterval(() => {
    if (!ctx || !musicOn || document.hidden) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (track === 3 && buf3) { if (!src3) startSeamless(); return; }
    const a = els[track];
    if (a && (a.paused || a.ended)) a.play().catch(() => {});
  }, 1500);

  return {
    init,
    setTrack(n) { track = SONGS[n] ? n : 1; syncSong(); },
    get track() { return track; },
    get songPlaying() { return (!!src3 && !!ctx && ctx.state === 'running') || Object.values(els).some((a) => !a.paused && !a.ended && a.currentTime > 0); },   // handy for testing
    get _els() { return els; },            // testing only
    // testing only: pretend the browser stopped the song by itself
    _simulateSongStop() {
      if (src3) { const n = src3; n.stop(); return 'seamless'; }
      const a = els[track]; if (a) { a.pause(); a.dispatchEvent(new Event('ended')); return 'element'; }
      return 'none';
    },
    get seamless() { return !!src3; },
    play(name, ...args) { if (ctx && sfxOn && sfx[name]) sfx[name](...args); },
    say,                                              // Professor Seal says a word aloud
    get canSpeak() { return !!window.speechSynthesis; },
    setMusic(on) { musicOn = on; if (musicBus) musicBus.gain.setTargetAtTime(on ? MUSIC_VOL : 0, ctx.currentTime, 0.1); syncSong(); },
    setSfx(on) { sfxOn = on; if (sfxBus) sfxBus.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.05); },
    get ready() { return !!ctx; },
  };
})();
