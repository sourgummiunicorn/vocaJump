// main.js
// Boot: size the canvas to the window and start the game.
//
// The canvas is always 160 x 256 pixels inside. We only change its CSS size.
// Whole-number scales (2x, 3x, 4x) keep every pixel perfectly square, so we
// snap to one whenever it still fills most of the screen.

(function () {
  const canvas = document.getElementById('game');
  const bgCanvas = document.getElementById('bg');
  canvas.tabIndex = 0;

  function fit() {
    const V = HH.View;
    // available space inside the stage (it keeps clear of phone notches)
    const stage = canvas.parentElement, cs = getComputedStyle(stage);
    const vw = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const vh = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    let s = Math.min(vw / V.W, vh / V.H);
    const whole = Math.floor(s);
    if (whole >= 2 && whole / s > 0.86) s = whole;
    for (const c of [canvas, bgCanvas]) {
      c.style.width = Math.floor(V.W * s) + 'px';
      c.style.height = Math.floor(V.H * s) + 'px';
    }
  }
  window.addEventListener('resize', fit);
  fit();

  const game = new HH.Game(canvas, bgCanvas);
  HH.Input.init(canvas, game);
  HH.game = game;          // handy for poking at the game from the browser console
  game.start();
})();
