// input.js
// One-thumb friendly controls.
//
//   TOUCH  : touch anywhere = hop. Keep the thumb down and slide = steer.
//            (One touch does both, so tapping and steering never fight.)
//            WORD MODE is different: a quick TAP hops (when the finger lifts)
//            and a SLIDE only steers, so steering toward a letter never
//            accidentally hops over it.
//   MOUSE  : click = hop, move the mouse left/right = steer.
//   KEYS   : Space / Up / W = hop, Left/Right or A/D = steer,
//            Enter = confirm, P or Esc = pause, M = music on/off.
//
// Input only reports WHAT happened. game.js decides what it means
// (a tap on the title screen presses a button; in play it makes the seal hop).

HH.Input = (function () {
  let canvas, game;
  let down = false, pointerType = 'mouse', anchorX = 0, anchorTx = 0;
  // Word Mode tap-or-slide: where and when the finger went down, and how far it has moved
  let deferred = false, downT = 0, downX = 0, downY = 0, moved = 0;
  const TAP_MOVE = 4;        // virtual pixels (about 10 on a phone screen): more than this is a slide
  const TAP_TIME = 300;      // milliseconds: a longer press is not a tap
  const keys = { left: false, right: false };

  // Convert a page position into the 160 x 256 virtual screen.
  function toVirtual(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * HH.View.W,
      y: ((e.clientY - r.top) / r.height) * HH.View.H,
    };
  }

  function init(cv, g) {
    canvas = cv; game = g;

    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      HH.Audio.init();
      canvas.focus({ preventScroll: true });
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
      const v = toVirtual(e);
      down = true;
      pointerType = e.pointerType || 'mouse';
      anchorX = v.x;
      anchorTx = game.seal.tx;
      const touch = pointerType !== 'mouse';
      deferred = game.pointerDown(v.x, v.y, touch) === 'deferred';
      downT = performance.now(); downX = v.x; downY = v.y; moved = 0;
    });

    canvas.addEventListener('pointermove', (e) => {
      const v = toVirtual(e);
      if (down) moved = Math.max(moved, Math.hypot(v.x - downX, v.y - downY));
      if (pointerType !== 'mouse' && down) {
        // touch: relative drag, about 38 screen pixels per world unit
        game.steerTo(anchorTx + (v.x - anchorX) / 38);
      } else if (e.pointerType === 'mouse') {
        // mouse: the seal follows the cursor's horizontal position
        game.steerTo(((v.x - HH.View.W / 2) / (HH.View.W / 2)) * 1.05, true);
      }
    });

    const up = (e) => {
      // Word Mode: the finger lifted. A short, still touch was a tap: hop now.
      if (deferred && e.type === 'pointerup' && moved <= TAP_MOVE && performance.now() - downT <= TAP_TIME) {
        game.action('hop');
      }
      deferred = false; down = false;
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      const k = e.key;
      const handled = [' ', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'ArrowDown', 'Enter', 'Escape'].includes(k);
      if (handled) e.preventDefault();
      HH.Audio.init();
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') keys.left = true;
      if (k === 'ArrowRight' || k === 'd' || k === 'D') keys.right = true;
      if (e.repeat) return;                       // holding Space never double-hops
      if (k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W' || k === 'z' || k === 'Z') game.action('hop');
      else if (k === 'Enter') game.action('confirm');
      else if (k === 'Escape' || k === 'p' || k === 'P') game.action('pause');
      else if (k === 'm' || k === 'M') game.action('music');
      else if (k === 'ArrowLeft' || k === 'a' || k === 'A') game.action('left');
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') game.action('right');
      else if (k === 'ArrowDown' || k === 's' || k === 'S') game.action('down');
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') keys.left = false;
      if (k === 'ArrowRight' || k === 'd' || k === 'D') keys.right = false;
    });
    // pause automatically if the player switches apps
    document.addEventListener('visibilitychange', () => { if (document.hidden) game.action('autopause'); });
    window.addEventListener('blur', () => { keys.left = keys.right = false; });
  }

  return {
    init,
    steerDir() { return (keys.right ? 1 : 0) - (keys.left ? 1 : 0); },
    get touching() { return down && pointerType !== 'mouse'; },
  };
})();
