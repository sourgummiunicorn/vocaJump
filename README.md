# Harbor Hop

An 8-bit harbor seal belly-hops along the beach.

- **Cruise:** an endless runner.
- **Vocab:** academic vocabulary for high school and college, with spaced review, a daily streak and an ocean fact each day.
- **Weekly boss:** after 6 learning days, boss day brings Murk the Orca, a review round.

The game is plain HTML, CSS and JavaScript. It needs no build step, no installs and no server code.

**Play it here:** https://sourgummiunicorn.github.io/vocaJump/

## Play it on GitHub Pages

1. Create a new repository on GitHub, for example `harbor-hop`. It can be public or private; a private one needs a paid plan for Pages.
2. On the repository page, choose **Add file → Upload files**.
3. Drag in **everything inside this folder**: `index.html`, `style.css`, `README.md`, `.nojekyll`, and the `js` and `audio` folders.
   - `index.html` must be at the top of the repository, not inside another folder.
   - `.nojekyll` is a hidden file. If you can't drag it in, it's optional.
4. Click **Commit changes**.
5. Go to **Settings → Pages**. Under "Build and deployment", set the source to **Deploy from a branch**, then choose **main** and **/ (root)**, and click **Save**.
6. Wait a minute or two, then refresh. The page shows your link, for example `https://YOUR-NAME.github.io/harbor-hop/`.

To update the game later, upload the changed files again with the same names and commit. Pages refreshes within a minute or two. If you still see the old version, do a hard refresh: Ctrl+Shift+R, or Cmd+Shift+R on a Mac.

## Play it on your own computer

Double-click `index.html` to open it in Chrome, Edge, Safari or Firefox.

Opened this way, song 3 (Sealy Techno) may loop with a tiny gap. On GitHub Pages it loops seamlessly.

## Controls

| | Laptop | Phone or tablet |
|---|---|---|
| Move between lanes | Left and right arrow keys, or A and D | Slide left or right |
| Hop | Space, up arrow or W | Tap |
| Pause | Esc or P | The life ring button |

## Good to know for testing

- **Progress is saved in each browser separately.** Your fish, words and streak on GitHub Pages are separate from the Claude preview, and separate on each device or browser.
- **To start fresh,** clear the site data in your browser settings.
- **The Boss Tester is turned on.** Tap the week meter (six dots and a little orca under VOCAB), then **BOSS TESTER**. You can play any week's boss as a pretend player, and your real progress isn't touched.
  - Before the App Store release, set `const TESTER = true;` to `false` in `js/boss.js`.

## Files

| Path | What it is |
|---|---|
| `index.html` | The page that loads everything |
| `style.css` | Page layout (the game draws itself on a canvas) |
| `js/words.js` | The 3,000 vocabulary words with meanings and example sentences |
| `js/study.js` | Spaced review, the daily goal, the streak and the boss-day schedule |
| `js/boss.js` | Boss rounds with Murk the Orca, plus the Boss Tester |
| `js/game.js` | The game loop, modes and rules |
| `js/ui.js` | Menus, boards and on-screen text |
| `js/facts.js` | The daily ocean facts |
| `audio/` | Songs 2 and 3. Song 1 is made in code. |

## Credits

- The lettering is traced from the **Press Start 2P** font by codeman38 (Copyright 2012 The Press Start 2P Project Authors), used under the SIL Open Font License 1.1. See `FONT-LICENSE.txt`.
