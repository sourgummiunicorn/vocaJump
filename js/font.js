// font.js
// The game's lettering: an 8 x 8 pixel alphabet traced from the Press Start 2P
// font (Copyright 2012 The Press Start 2P Project Authors, cody@zone38.net),
// used under the SIL Open Font License 1.1; see FONT-LICENSE.txt. This traced
// version is not itself called "Press Start 2P" (a Reserved Font Name).
//
// Each glyph is an 8 x 8 grid of dots (16 hex digits, one byte per row).
// The game screen is 160 x 256 "game pixels"; the canvas underneath is 3x
// finer, so letters can use smaller dots than the art and stay sharp:
//   scale 1 (normal text):  a dot = 2/3 of a game pixel, 5 1/3 px per letter
//   scale 2 (titles):       a dot = 1 game pixel, 8 px per letter
//   scale 3 (big numbers):  a dot = 4/3 of a game pixel
// Letters are drawn from a small picture per colour (cached), which is fast.

(function () {
  const G = {
    "0": '384cc6c6c6643800',
    "1": '1838181818187e00',
    "2": '7cc60e3c78e0fe00',
    "3": '7e0c183c06c67c00',
    "4": '1c3c6cccfe0c0c00',
    "5": 'fcc0fc0606c67c00',
    "6": '3c60c0fcc6c67c00',
    "7": 'fec60c1830303000',
    "8": '78c4e4789e867c00',
    "9": '7cc6c67e060c7800',
    "A": '386cc6c6fec6c600',
    "B": 'fcc6c6fcc6c6fc00',
    "C": '3c66c0c0c0663c00',
    "D": 'f8ccc6c6c6ccf800',
    "E": 'fec0c0fcc0c0fe00',
    "F": 'fec0c0fcc0c0c000',
    "G": '3e60c0cec6663e00',
    "H": 'c6c6c6fec6c6c600',
    "I": '7e18181818187e00',
    "J": '0606060606c67c00',
    "K": 'c6ccd8f0f8dcce00',
    "L": '6060606060607e00',
    "M": 'c6eefed6d6c6c600',
    "N": 'c6e6f6decec6c600',
    "O": '7cc6c6c6c6c67c00',
    "P": 'fcc6c6c6fcc0c000',
    "Q": '7cc6c6c6decc7a00',
    "R": 'fcc6c6cef8dcce00',
    "S": '7cc6c07c06c67c00',
    "T": '7e18181818181800',
    "U": 'c6c6c6c6c6c67c00',
    "V": 'c6c6c6ee7c381000',
    "W": 'd6d6d6d6feee4400',
    "X": 'c6c66c386cc6c600',
    "Y": '6666663c18181800',
    "Z": 'fe0e1c3870e0fe00',
    ".": '0000000000303000',
    ",": '0000000000303060',
    "!": '3838383030003000',
    "?": '7cfec60c38003800',
    ":": '0030300030300000',
    "-": '0000007e00000000',
    "+": '0018187e18180000',
    "/": '0204081020408000',
    "'": '3030300000000000',
    "(": '0c18303030180c00',
    ")": '6030181818306000',
    "%": '62a4c810264a8c00',
    "*": '006c38fe386c0000',
    "<": '0c18306030180c00',
    ">": '6030180c18306000',
    "=": '0000fe00fe000000',
    "\"": '6c6c6c0000000000',
    ";": '0030300030306000',
    "&": '70d8d870dacc7e00',
    "#": '6cfe6c6c6cfe6c00',
    "_": '00000000000000fe',
    " ": '0000000000000000',
  };

  // dot size (in game pixels) for each scale; always a whole number of
  // canvas pixels (thirds of a game pixel) so the dots stay crisp
  const dot = (s) => (s <= 1 ? 2 / 3 : s === 2 ? 1 : Math.floor(s * 1.5) / 3);

  // Measure text width in game pixels at a given scale.
  function width(text, scale = 1) {
    return text.length ? (String(text).length * 8 - 1) * dot(scale) : 0;
  }

  // One picture per colour holding every glyph (1 canvas pixel per dot).
  const CHARS = Object.keys(G);
  const atlases = {};
  function atlas(color) {
    if (atlases[color]) return atlases[color];
    const cv = document.createElement('canvas');
    cv.width = CHARS.length * 8; cv.height = 8;
    const g = cv.getContext('2d');
    g.fillStyle = color;
    CHARS.forEach((ch, k) => {
      const hex = G[ch];
      for (let row = 0; row < 8; row++) {
        const bits = parseInt(hex.substr(row * 2, 2), 16);
        for (let col = 0; col < 8; col++) if (bits & (128 >> col)) g.fillRect(k * 8 + col, row, 1, 1);
      }
    });
    return (atlases[color] = cv);
  }
  const INDEX = Object.fromEntries(CHARS.map((c, k) => [c, k]));

  // Draw text. opts: { color, scale, align: 'left'|'center'|'right', shadow, outline }
  // (x, y) is the top-left of the text box, as with the old 3x5 font; tall
  // scales are nudged down a little so they sit where the old letters did.
  function draw(g, text, x, y, opts = {}) {
    text = String(text).toUpperCase().replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
    const s = opts.scale || 1, u = dot(s);
    const w = width(text, s);
    const x0 = Math.round(opts.align === 'center' ? x - w / 2 : opts.align === 'right' ? x - w : x);
    const y0 = Math.round(y) + Math.round(((5 * s - 7 * u) / 2) * 3) / 3;
    const smooth = g.imageSmoothingEnabled;
    g.imageSmoothingEnabled = false;

    const paint = (dx, dy, color) => {
      const a = atlas(color);
      for (let i = 0; i < text.length; i++) {
        const k = INDEX[text[i]] ?? INDEX['?'];
        if (text[i] === ' ') continue;
        g.drawImage(a, k * 8, 0, 8, 8, x0 + dx + i * 8 * u, y0 + dy, 8 * u, 8 * u);
      }
    };

    if (opts.outline) {
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        paint(dx * u, dy * u, opts.outline);
      }
    }
    if (opts.shadow) paint(0, u * (s >= 2 ? 1 : 1), opts.shadow);
    paint(0, 0, opts.color || HH.PAL.uiText);
    g.imageSmoothingEnabled = smooth;
    return w;
  }

  // Advance (game pixels per letter) at a scale: 5 1/3 for normal text.
  const adv = (scale = 1) => 8 * dot(scale);

  HH.Font = { draw, width, adv };
})();
