// study.js
// The learning side of Word Mode: which word comes next, what counts as
// "learned", and the daily streak. No drawing here, only the rules.
//
// SPACED REPETITION (a simple "Leitner box" system)
//   Every word the player has met sits in a box from 0 to 5.
//     - Spell it with no wrong letters -> it moves up one box.
//     - Any wrong letter, or the run ends mid-word -> it moves down one box.
//   A word left unfinished comes back as the very next word.
//   The box decides how many days until the word comes back:
//     box:   0  1  2  3  4   5
//     days:  0  1  2  4  7  15
//   So hard words return soon, easy words come back rarely. That is the
//   honest "one more go" hook: players can feel themselves getting better.
//
// RECALL
//   The word is shown only on Professor Seal's board. While spelling, the
//   slots stay blank, so players spell it from memory every time.
//
// LEARNED = spelled correctly at least once. Players only ever see how many
// words they have learned, never how many are left.
//
// WORD HISTORY
//   Every word a player works on is logged under the day it happened, with
//   how it went: 'got' (spelled with no slips), 'tricky' (spelled after a
//   wrong letter) or 'notyet' (the run ended before it was finished).
//   The word book's BY DAY page lets players look back over every day.
//
// DAILY NEW WORDS (the player's choice, 1 to 5, in OPTIONS; 3 by default)
//   Only NEW words are capped. Reviews of words already learned keep coming,
//   because that is how words stick. Once today's new words are done, Word
//   Mode serves reviews, and if none are due, extra practice on learned words
//   (practice never pushes a word's next review further away).
//   Changing the number works right away: raise it and more new words come
//   today; lower it and the new words already learned today still count.
//   With one boss day a week, 3 a day comes to about 2,570 words by the grad
//   cap (1,000 study days); 4 a day covers all 3,000.
//
// DAILY STREAK
//   The first word finished each day keeps the streak going (+1 day) and pays
//   a streak bonus. More words that day earn more fish, but not more streak.

HH.Study = (function () {
  const INTERVAL = [0, 1, 2, 4, 7, 15];
  const LETTER_FISH = 3;                               // each correct letter (a fish is 1)
  const GRAD = 1000;                                   // days of study to graduate (earns the grad cap)
  const DAILY_MIN = 1, DAILY_MAX = 5, DAILY_DEFAULT = 3; // new words a day, chosen in OPTIONS

  // The player's daily new-word goal, kept inside 1 to 5.
  const dailyGoal = (save) => Math.min(DAILY_MAX, Math.max(DAILY_MIN, Math.round(save.dailyNew) || DAILY_DEFAULT));

  // How many brand new words were learned today (`first` = the day it was first spelled).
  function newToday(save) {
    const day = today();
    let n = 0;
    for (const k in save.words) if (save.words[k].first === day) n++;
    return n;
  }
  const goalLeft = (save) => Math.max(0, dailyGoal(save) - newToday(save));

  // About how many days until every word is learned at this pace.
  function daysToFinish(save) {
    const left = HH.WORDS.length - learnedCount(save);
    return Math.ceil((left / dailyGoal(save)) * (LEARN_DAYS + 1) / LEARN_DAYS);   // 1 day in 7 is boss day
  }

  // Today's date as a whole number of days, in the player's own time zone.
  function today() {
    const d = new Date();
    return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
  }

  // The streak bonus grows with the streak, up to a cap: 30, 40, 50 ... 100.
  const streakBonus = (days) => 30 + 10 * Math.min(7, days - 1);

  const rec = (save, w) => save.words[w];
  const entry = (w) => HH.WORDS.find((e) => e[0] === w);

  // Pick the next word. `skip` = words already used this run.
  function next(save, skip) {
    const day = today();
    // UNFINISHED WORD FIRST: if the last run ended (or was quit) in the
    // middle of a word, that same word comes straight back, so the player
    // gets to finish what they started instead of being moved on.
    if (save.retry && !skip.includes(save.retry)) {
      const e = entry(save.retry);
      if (e) return e;
      save.retry = null;                                // the word was removed from the list
    }
    const all = HH.WORDS.filter((e) => !skip.includes(e[0]));
    const pool = all.length ? all : HH.WORDS;
    const due = pool.filter((e) => rec(save, e[0]) && rec(save, e[0]).due <= day);
    // new words only until today's goal is met (unless nothing has been learned yet)
    const fresh = (goalLeft(save) > 0 && !isBossDay(save)) || !learnedCount(save) ? pool.filter((e) => !rec(save, e[0])) : [];
    // Mostly reviews when some are due, but keep a new word coming now and then.
    if (due.length && (!fresh.length || Math.random() < 0.65)) {
      due.sort((a, b) => rec(save, a[0]).box - rec(save, b[0]).box || rec(save, a[0]).due - rec(save, b[0]).due);
      return due[Math.floor(Math.random() * Math.min(3, due.length))];
    }
    if (fresh.length) {
      // gentle start: the first new words are short ones
      const learned = learnedCount(save);
      const maxLen = learned < 5 ? 7 : learned < 15 ? 10 : 15;
      const easy = fresh.filter((e) => e[0].length <= maxLen);
      const from = easy.length ? easy : fresh;
      return from[Math.floor(Math.random() * from.length)];
    }
    // goal met and nothing due: extra practice, picked from the words due soonest
    // (if every learned word was already played this run, they can come round again)
    let known = pool.filter((e) => rec(save, e[0]));
    if (!known.length) known = HH.WORDS.filter((e) => rec(save, e[0]));
    if (!known.length) return pool[Math.floor(Math.random() * pool.length)];
    known.sort((a, b) => rec(save, a[0]).due - rec(save, b[0]).due);
    return known[Math.floor(Math.random() * Math.min(5, known.length))];
  }

  // Is this word brand new to the player? (The board then says NEW WORD.)
  const isNew = (save, w) => !rec(save, w) || !rec(save, w).learned;

  // A word was finished. Returns { streakUp, bonus, firstTime, goalDone }.
  function finish(save, w, mistakes) {
    const day = today();
    const r = rec(save, w) || { box: 0, due: day, learned: false };
    const firstTime = !r.learned;
    const practice = r.learned && r.due > day;          // extra practice before the word was due
    if (!practice) {
      r.box = mistakes === 0 ? Math.min(5, r.box + 1) : Math.max(0, r.box - 1);
      r.due = day + INTERVAL[r.box];
    } else if (mistakes) {                              // a slip in practice: review it sooner
      r.box = Math.max(0, r.box - 1);
      r.due = Math.min(r.due, day + INTERVAL[r.box]);
    }
    r.learned = true;
    if (firstTime) r.first = day;
    save.words[w] = r;
    const goalDone = firstTime && newToday(save) === dailyGoal(save);
    if (save.retry === w) save.retry = null;            // finished at last: no need to repeat it
    log(save, w, mistakes === 0 ? 'got' : 'tricky');

    return Object.assign(streakTick(save), { firstTime, goalDone });
  }

  // The daily streak: only the first word (or boss) of the day counts.
  function streakTick(save) {
    const s = save.streak, day = today();
    let streakUp = false, bonus = 0;
    if (s.lastDay !== day) {
      s.count = s.lastDay === day - 1 ? s.count + 1 : 1;
      s.lastDay = day;
      s.best = Math.max(s.best, s.count);
      streakUp = true;
      bonus = streakBonus(s.count);
    }
    return { streakUp, bonus };
  }

  // The run ended in the middle of a word: it comes back first next time.
  // `started` = the player had begun spelling (not just reading the board);
  // only then does it count against the word and show in the history.
  function unfinished(save, w, started = true) {
    save.retry = w;
    if (!started) return;
    const r = rec(save, w);
    if (r) { r.box = Math.max(0, r.box - 1); r.due = today(); }
    log(save, w, 'notyet');
  }

  // Remember how a word went today. A finished word never goes back to
  // "not yet", and a slip after a clean spelling shows as "tricky".
  const RANK = { notyet: 0, tricky: 1, got: 2 };
  function log(save, w, how) {
    const day = today();
    const d = save.days[day] || (save.days[day] = {});
    if (d[w] === undefined || RANK[how] >= RANK[d[w]] || how === 'tricky') d[w] = how;
  }

  // Days with words, newest first: [{ day, words: [[WORD, how], ...] }]
  function history(save) {
    return Object.keys(save.days).map(Number).sort((a, b) => b - a)
      .map((day) => ({ day, words: Object.entries(save.days[day]) }))
      .filter((d) => d.words.length);
  }

  // "TODAY", "YESTERDAY" or a short date like "MON OCT 12".
  function dayLabel(day) {
    const t = today();
    if (day === t) return 'TODAY';
    if (day === t - 1) return 'YESTERDAY';
    const d = new Date(day * 86400000);                    // day numbers are local days, so read them as UTC
    const wd = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][d.getUTCDay()];
    const mo = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][d.getUTCMonth()];
    return `${wd} ${mo} ${d.getUTCDate()}`;
  }

  function learnedCount(save) {
    let n = 0;
    for (const k in save.words) if (save.words[k].learned) n++;
    return n;
  }

  // Learned words, A to Z, for the word book.
  function learnedList(save) {
    return HH.WORDS.filter((e) => rec(save, e[0]) && rec(save, e[0]).learned);
  }

  // The streak shown on menus: it only counts if you played today or yesterday.
  function currentStreak(save) {
    const d = today(), s = save.streak;
    return s.lastDay >= d - 1 ? s.count : 0;
  }

  // GRADUATION is about showing up, not cramming: every day you finish at
  // least one word counts once (and finds that day's ocean fact).
  // 1,000 study days (about three years) earns the grad cap.
  function studyDays(save) {
    const days = new Set(wordDayList(save));
    for (const d of (save.boss && save.boss.days) || []) days.add(d);
    return days.size;
  }

  const mastered = (save, w) => rec(save, w) && rec(save, w).box >= 4;

  // ---------------------------------------------------------------------------
  // THE WEEKLY RHYTHM: 6 learning days, then a BOSS DAY (played in boss.js)
  //   Learning days are study days with words. After 6 of them, the next
  //   study day is boss day: Word Mode opens with Murk the Orca instead of
  //   new words. Playing the boss (win or lose) counts as that day's study:
  //   it keeps the streak, finds the day's ocean fact and counts toward the
  //   grad cap. Murk waits until he is beaten (try again any time), and no new
  //   words come on boss day. Beating him starts the next week.
  //   A word's WEEK = 1 + how many bosses were beaten before it was learned.
  //   Which words each boss asks about:
  //     boss 1   mostly week 1 words
  //     boss 2   week 2 words + the trickiest week 1 words
  //     boss 3   week 3 words + older words due for review
  //     boss 4   week 4 words + a mix of older words
  //     boss 5+  adaptive: all learned words, trickiest and most overdue first
  // ---------------------------------------------------------------------------
  const BOSS_QUESTIONS = 6, LEARN_DAYS = 6;
  const bossInfo = (save) => save.boss || (save.boss = { beaten: 0 });

  // Days with at least one finished word, oldest first.
  function wordDayList(save) {
    return Object.keys(save.days).map(Number).sort((a, b) => a - b)
      .filter((d) => Object.values(save.days[d]).some((h) => h !== 'notyet'));
  }
  const studyDayList = wordDayList;

  // The day the last boss was beaten (or never).
  const lastBeatenDay = (save) => { const h = bossInfo(save).history; return h && h.length ? h[h.length - 1] : -Infinity; };

  // Where the player is in this week's rhythm.
  //   ready    = boss day: Murk is waiting
  //   done     = learning days finished this week (0 to 6), today included
  //   daysLeft = study days until boss day
  function bossStatus(save) {
    const b = bossInfo(save), day = today(), since = lastBeatenDay(save);
    const list = wordDayList(save).filter((d) => d > since && !(b.days || []).includes(d));
    const before = list.filter((d) => d < day).length;
    const done = Math.min(LEARN_DAYS, before + (list.includes(day) ? 1 : 0));
    const ready = before >= LEARN_DAYS;
    return { n: (b.beaten || 0) + 1, ready, done, daysLeft: ready ? 0 : LEARN_DAYS + 1 - done };
  }

  // Boss day: Murk is waiting, or was already played today. No new words today.
  const isBossDay = (save) => bossStatus(save).ready || (bossInfo(save).days || []).includes(today());

  // "WEEK 2 DAY 4" for Professor Seal's board.
  function weekLabel(save) {
    const st = bossStatus(save);
    if (isBossDay(save)) return `WEEK ${st.ready ? st.n : st.n - 1} BOSS DAY`;
    return `WEEK ${st.n} DAY ${Math.min(LEARN_DAYS, st.done + (wordDayList(save).includes(today()) ? 0 : 1))}`;
  }

  // The day a word was first learned: saved since the daily goal update,
  // otherwise the first day it shows in the history.
  function firstDay(save, w, list) {
    const r = rec(save, w);
    if (r && r.first != null) return r.first;
    for (const d of list) if (save.days[d][w] && save.days[d][w] !== 'notyet') return d;
    return null;
  }

  // Each learned word's week: { WORD: weekNumber }
  function weeks(save) {
    const list = wordDayList(save), out = {}, hist = bossInfo(save).history || [];
    for (const w in save.words) {
      if (!save.words[w].learned) continue;
      const d = firstDay(save, w, list);
      out[w] = 1 + (d == null ? hist.length : hist.filter((h) => h < d).length);
    }
    return out;
  }

  // How tricky a word has been: a low box, slips in the history, boss misses.
  function trickiness(save, w) {
    const r = rec(save, w);
    let slips = 0;
    for (const d in save.days) { const h = save.days[d][w]; if (h === 'tricky' || h === 'notyet') slips++; }
    return (5 - r.box) + 2 * slips + 3 * (r.bossMiss || 0);
  }

  // Pick the boss's words, following the schedule above.
  function bossWords(save, n, count = BOSS_QUESTIONS) {
    const day = today(), wk = weeks(save);
    const learned = Object.keys(wk).filter((w) => entry(w));
    const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const tricky = (a) => a.slice().sort((x, y) => trickiness(save, y) - trickiness(save, x) || Math.random() - 0.5);
    const thisWeek = learned.filter((w) => wk[w] === n);
    const older = learned.filter((w) => wk[w] < n);
    const picked = [];
    const take = (list, k) => { for (const w of list) { if (picked.length >= count || k <= 0) break; if (!picked.includes(w)) { picked.push(w); k--; } } };

    if (n === 1) {
      take(tricky(thisWeek), count);                        // mostly week 1 (trickiest first)
    } else if (n <= 4) {
      const fromWeek = Math.ceil(count * 0.6);              // about 4 of 6 from this week
      take(shuffle(thisWeek.slice()), fromWeek);
      const rest = count - picked.length;
      if (n === 2) take(tricky(older.filter((w) => wk[w] === 1)), rest);            // tricky week 1 words
      if (n === 3) take(tricky(older.filter((w) => rec(save, w).due <= day)), rest); // older words due for review
      if (n === 4) take(shuffle(older.slice()), rest);                               // a mix of older words
      take(tricky(older), count);                           // not enough? the trickiest older words
    } else {
      // adaptive: trickiness, plus how overdue, plus a little luck
      const score = (w) => trickiness(save, w) + Math.min(7, Math.max(0, day - rec(save, w).due)) * 0.5 + Math.random() * 3;
      take(learned.map((w) => [w, score(w)]).sort((a, b) => b[1] - a[1]).map((x) => x[0]), count);
    }
    take(shuffle(learned.slice()), count);                  // still short (an early save): any learned word
    return shuffle(picked);
  }

  // A boss question was missed: the word comes back soon in Word Mode.
  function bossMiss(save, w) {
    const r = rec(save, w);
    if (!r) return;
    r.bossMiss = (r.bossMiss || 0) + 1;
    r.box = Math.max(0, r.box - 1);
    r.due = Math.min(r.due, today() + 1);
  }

  function bossBeaten(save, n) {
    const b = bossInfo(save);
    b.beaten = Math.max(b.beaten || 0, n);
    (b.history || (b.history = [])).push(today());
  }

  // A boss was played today (won or not): it counts as today's study.
  // Returns { streakUp, bonus } like finishing a word does.
  function bossPlayed(save) {
    const b = bossInfo(save), day = today();
    b.days = b.days || [];
    if (!b.days.includes(day)) b.days.push(day);
    return streakTick(save);
  }

  return {
    next, isNew, finish, unfinished, learnedCount, learnedList, currentStreak, mastered, entry, today,
    history, dayLabel, studyDays, LETTER_FISH, GRAD,
    dailyGoal, newToday, goalLeft, daysToFinish, DAILY_MIN, DAILY_MAX,
    weeks, bossStatus, bossWords, bossMiss, bossBeaten, bossPlayed, isBossDay, weekLabel, trickiness, BOSS_QUESTIONS, LEARN_DAYS,
  };
})();
