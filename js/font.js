// font.js
// A hand-made 3x5 pixel font. Each glyph is 5 rows of 3 bits.
// Drawing text pixel by pixel keeps the UI as crisp as the rest of the art.

(function () {
  const G = {
    A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
    E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
    I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
    M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100',
    Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
    U: '101101101101111', V: '101101101010010', W: '101101111111101', X: '101101010101101',
    Y: '101101010010010', Z: '111001010100111',
    0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
    4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010',
    8: '111101111101111', 9: '111101111001110',
    '.': '000000000000010', ',': '000000000010100', '!': '010010010000010', '?': '110001010000010',
    ':': '000010000010000', '-': '000000111000000', '+': '000010111010000', '/': '001001010100100',
    "'": '010010000000000', '(': '010100100100010', ')': '010001001001010', '%': '101001010100101',
    '*': '000101010101000', '<': '001010100010001', '>': '100010001010100', '=': '000111000111000',
    '"': '101101000000000', ';': '000010000010100',
    ' ': '000000000000000',
  };

  // Measure text width in pixels at a given scale.
  function width(text, scale = 1) {
    return text.length ? (text.length * 4 - 1) * scale : 0;
  }

  // Draw text. opts: { color, scale, align: 'left'|'center'|'right', shadow, outline }
  function draw(g, text, x, y, opts = {}) {
    text = String(text).toUpperCase().replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
    const s = opts.scale || 1;
    const w = width(text, s);
    let x0 = Math.round(opts.align === 'center' ? x - w / 2 : opts.align === 'right' ? x - w : x);
    const y0 = Math.round(y);

    const paint = (dx, dy, color) => {
      g.fillStyle = color;
      for (let i = 0; i < text.length; i++) {
        const bits = G[text[i]] || G['?'];
        for (let b = 0; b < 15; b++) {
          if (bits[b] === '1') {
            g.fillRect(x0 + dx + (i * 4 + (b % 3)) * s, y0 + dy + Math.floor(b / 3) * s, s, s);
          }
        }
      }
    };

    if (opts.outline) {
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        paint(dx, dy, opts.outline);
      }
    }
    if (opts.shadow) paint(0, Math.max(1, Math.floor(s / 2)), opts.shadow);
    paint(0, 0, opts.color || HH.PAL.uiText);
    return w;
  }

  HH.Font = { draw, width };
})();
