// save.js
// Everything the game remembers between visits lives in ONE localStorage key.
// localStorage can be unavailable (private mode, blocked storage), so every
// read and write is wrapped in try/catch and the game still works without it.

HH.Save = {
  KEY: 'harborhop.save.v2',      // v2 = the endless version
  data: null,

  defaults() {
    return {
      bestDist: 0,                 // the one record: farthest distance in metres
      bestFish: 0,                 // most food eaten in one run
      runs: 0,
      totals: { fish: 0, shrimp: 0, squid: 0, gold: 0, glass: 0, pearl: 0 },   // the collection
      facts: [],                   // ids of found ocean facts, in the order they were found
      achievements: {},            // id -> true
      wallet: 0,                   // fish in the bucket: spent in the shop
      cosmetics: { none: true },   // looks you own
      equipped: 'none',
      music: true,
      musicTrack: 1,               // 1 = cozy chiptune, 2 = "Seal Belly Hop", 3 = "Sealy Techno" (sealytechno.wav)
      sfx: true,
      words: {},                   // Word Mode: WORD -> { box, due, learned } (see study.js)
      streak: { count: 0, lastDay: -9, best: 0 },   // daily word streak
      lastFactDay: -9,             // the day the last ocean fact was found (one a day)
      days: {},                    // word history: day number -> { WORD: 'got' | 'tricky' | 'notyet' }
      retry: null,                 // a word left unfinished: it comes back as the next word
      dailyNew: 3,                 // new words a day in Word Mode, 1 to 5 (OPTIONS)
      boss: { beaten: 0 },         // weekly boss rounds: the last one beaten (1 = week 1)
    };
  },

  load() {
    const base = this.defaults();
    let stored = {};
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) stored = JSON.parse(raw) || {};
    } catch (e) { stored = {}; }

    // Merge nested objects one level deep so new fields get defaults.
    const d = Object.assign({}, base, stored);
    for (const k of ['totals', 'achievements', 'cosmetics', 'words', 'streak', 'days', 'boss']) {
      d[k] = Object.assign({}, base[k], stored[k] || {});
    }
    if (!Array.isArray(d.facts)) d.facts = [];
    // older saves kept fact numbers instead of ids
    d.facts = d.facts.map((f) => (typeof f === 'number' ? (HH.FACTS_LEGACY || [])[f] : f)).filter(Boolean);
    this.data = d;
  },

  save() {
    try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) { /* fine */ }
  },
};
