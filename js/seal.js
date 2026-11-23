// seal.js
// The seal's physics (how it moves) and animation (how it looks).
//
// STATE MACHINE
//   ground  -> belly on the sand, scooting forward
//   antic   -> a tiny squash just before a hop (50 ms, keeps it responsive)
//   air     -> flying in an arc
//   (landing returns to ground with a squash + jiggle)
//
// RHYTHM
//   Tap again just before or just after landing and the rhythm goes up (max 3).
//   Higher rhythm = a little faster and a little higher. Wait too long and it
//   cools down. This rewards a calm, steady beat instead of button mashing.
//
// SQUASH AND STRETCH
//   One spring value `sq` drives the whole body shape:
//     sq < 0  squashed (wider, shorter)  -> landing
//     sq > 0  stretched (thinner, taller) -> take-off
//   The spring overshoots a few times, which is the jiggle after landing.

HH.Seal = class {
  constructor() { this.reset(); }

  reset() {
    this.z = 0;           // distance along the path
    this.x = 0;           // sideways, relative to path centre (-0.99..0.99)
    this.tx = 0;          // where steering wants to go
    this.y = 0;           // height above the sand
    this.vy = 0;
    this.v = 0;           // forward speed
    this.state = 'ground';
    this.stateT = 0;

    this.rhythm = 0;      // 0..3
    this.bestRhythm = 0;
    this.groundT = 1;     // time since landing
    this.buffered = false;

    this.sq = 0; this.sqv = 0;   // squash spring
    this.t = 0;                  // animation clock

    this.face = 'open'; this.faceT = 0;
    this.blinkIn = 2.5;
    this.bonkT = 0;              // > 0 while dizzy after a bump
    this.invuln = 0;
    this.inKelp = 0;
    this.look = 0;
    this.auto = false;           // true when the game, not the player, is in control
    this.autoV = 0;              // forward speed the game wants while in control
    this.cheer = false;          // flippers up in celebration
    this.resting = false;        // dozing (menus)
    this.flopped = false;        // run over: a big, harmless belly flop
    this.floor = 0;              // height of the ground under the seal
    this.runSpeed = 4.2;         // the world's current speed (set by the game every step)
    this.view = 'back';          // 'back' while travelling, 'front' when it turns to face us
    this.events = [];            // things that happened this frame (for sound/particles)
  }

  // ---- tuning (all in world units and seconds)
  static get G() { return 9.5; }               // gravity
  static get HOP_V() { return 2.55; }          // launch speed up
  // Forward speed follows the run speed. Hopping on the beat adds a little
  // momentum (+4% per rhythm level); scooting on the belly is a bit slower.
  static get BUFFER() { return 0.2; }          // seconds before landing a tap is remembered
  static get LATE() { return 0.24; }           // seconds after landing that still count as "on beat"

  // Time left until landing (solving the jump arc for y = 0).
  airLeft() {
    const g = HH.Seal.G;
    return (this.vy + Math.sqrt(this.vy * this.vy + 2 * g * Math.max(0, this.y))) / g;
  }

  // Called when the player taps.
  tap() {
    if (this.auto) return;
    if (this.state === 'ground') this.startHop();
    else if (this.state === 'air' && this.airLeft() < HH.Seal.BUFFER) this.buffered = true;
    // taps earlier in the air are ignored: no accidental double jumps
  }

  startHop() {
    this.state = 'antic';
    this.stateT = 0;
    // On-beat? Then the rhythm grows.
    const onBeat = this.buffered || this.groundT < HH.Seal.LATE;
    if (onBeat && this.groundT < 5) {
      if (this.rhythm < 3) { this.rhythm++; this.events.push({ type: 'rhythm', level: this.rhythm }); }
    } else {
      this.rhythm = Math.max(0, this.rhythm - 1);
    }
    this.bestRhythm = Math.max(this.bestRhythm, this.rhythm);
    this.buffered = false;
  }

  launch() {
    this.state = 'air';
    this.stateT = 0;
    this.vy = HH.Seal.HOP_V * (1 + 0.085 * this.rhythm);
    this.v = Math.max(this.v, this.runSpeed * (1 + 0.04 * this.rhythm));
    this.sqv += 3.4;                     // stretch on take-off
    this.events.push({ type: 'hop', rhythm: this.rhythm });
  }

  land() {
    const impact = Math.min(1.4, Math.abs(this.vy) / HH.Seal.HOP_V);
    this.y = this.floor; this.vy = 0;
    this.state = 'ground';
    this.stateT = 0;
    this.groundT = 0;
    this.sqv -= 4.6 * impact;            // the big belly squish
    this.events.push({ type: 'land', power: impact });
    if (this.buffered) this.startHop();  // a remembered tap hops right away
  }

  // A soft bump (early in a run, or saved by a bubble): surprised face,
  // wobble, lose some speed, carry on.
  bonk(kind, pushX) {
    this.bonkT = 0.7;
    this.invuln = 1.0;
    this.rhythm = 0;
    this.v = Math.max(this.runSpeed * 0.45, this.v * 0.5);
    this.sqv -= 3;
    this.setFace('surprised', 0.7);
    if (pushX !== undefined) { this.x = pushX; this.tx = pushX; }
    if (kind !== 'boulder' && this.state === 'ground') {
      // a harmless little tumble over the log or rock
      this.state = 'air'; this.vy = 1.9; this.stateT = 0;
    }
  }

  // The run is over: a funny, harmless belly flop. The seal bounces up,
  // lands flat as a pancake, turns to look at you, and slides to a stop.
  flop() {
    this.flopped = true;
    this.auto = true;
    this.autoV = 0;
    this.rhythm = 0;
    this.buffered = false;
    this.setFace('surprised', 99);
    this.v = Math.max(1.6, this.v * 0.55);
    if (this.state !== 'air') { this.state = 'air'; this.stateT = 0; }
    this.vy = Math.max(this.vy, 2.1);
    this.sqv += 2.5;
  }

  setFace(f, t) { this.face = f; this.faceT = t; }

  update(dt, steerDir) {
    const S = HH.Seal;
    this.t += dt;
    this.stateT += dt;
    this.groundT += this.state === 'ground' ? dt : 0;
    this.bonkT = Math.max(0, this.bonkT - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.inKelp = Math.max(0, this.inKelp - dt);

    // ---- steering (gentle and forgiving)
    if (!this.auto) {
      if (steerDir) this.tx = this.x + steerDir * 0.58;
      this.tx = Math.max(-0.99, Math.min(0.99, this.tx));
      const maxSpd = (this.state === 'air' ? 1.75 : 2.65) * dt;
      const want = (this.tx - this.x) * Math.min(1, dt * 10);
      this.x += Math.max(-maxSpd, Math.min(maxSpd, want));
      const d = this.tx - this.x;
      this.look = Math.abs(d) > 0.03 ? Math.sign(d) : 0;
    }

    // ---- vertical motion
    if (this.state === 'antic' && this.stateT > 0.05) this.launch();
    if (this.state === 'air') {
      this.vy -= S.G * dt;
      this.y += this.vy * dt;
      if (this.y <= this.floor && this.vy < 0) this.land();
    }

    // ---- forward speed
    if (this.state === 'ground' || this.state === 'antic') {
      const target = this.auto ? this.autoV : this.inKelp > 0 ? this.runSpeed * 0.5 : this.runSpeed * 0.9;
      const rate = this.auto ? 3 : this.inKelp > 0 ? 3 : 1.6;
      this.v += (target - this.v) * Math.min(1, dt * rate);
      // rhythm cools down if the seal rests too long
      if (this.groundT > 0.9 && this.rhythm > 0) this.rhythm = 0;
    }
    this.z += this.v * dt;

    // ---- squash spring: stiff and lightly damped = a cute jiggle
    const target = this.state === 'antic' ? -0.16 : this.state === 'air' ? 0.05
      : this.flopped ? -0.24 : this.resting ? -0.07 : 0;
    const k = 240, damp = 8.5;
    this.sqv += (-(this.sq - target) * k - this.sqv * damp) * dt;
    this.sq += this.sqv * dt;
    this.sq = Math.max(-0.3, Math.min(0.24, this.sq));

    // ---- face
    if (this.faceT > 0) {
      this.faceT -= dt;
      if (this.faceT <= 0) this.face = 'open';
    }
    this.blinkIn -= dt;
    if (this.blinkIn <= 0 && this.face === 'open' && !this.resting) {
      this.setFace('blink', 0.12);
      this.blinkIn = 2 + Math.random() * 2.5;
    }
  }

  // ---- tail wag (seen from behind): a quick waggle while scooting along,
  //      a little flutter in the air, a slow lazy sway when resting.
  tailSway() {
    if (this.flopped) return 0;
    let s;
    if (this.state === 'air') s = Math.sin(this.t * 14) * 2;
    else if (this.v > 0.6 && !this.auto) s = Math.sin(this.t * 8) * 4.4;
    else s = Math.sin(this.t * 2.5) * 2;
    if (this.look) s -= this.look * 1.5;                // steering right swings the tail left, like a rudder
    return Math.max(-4, Math.min(4, Math.round(s / 2) * 2));   // steps of 2 px: -4, -2, 0, 2, 4
  }

  // ---- animation: choose the sprite options for this frame
  frame(accessory) {
    // breathing when resting on the sand
    const breathe = this.state === 'ground' ? Math.sin(this.t * (this.resting ? 1.6 : 2.6)) * (this.resting ? 0.035 : 0.025) : 0;
    const s = this.sq + breathe;
    // round to steps so sprites can be cached
    const q = (v) => Math.round(v * 25) / 25;
    const sx = q(1 - s * 0.85), sy = q(1 + s);

    let flip = 'tuck';
    if (this.state === 'air') flip = this.bonkT > 0 ? 'up' : 'spread';
    else if (this.state === 'antic') flip = 'tuck';
    else if (this.v > 0.6 && !this.auto) flip = Math.floor(this.t * 5.5) % 2 ? 'paddleL' : 'paddleR';
    if (this.cheer) flip = Math.floor(this.t * 6) % 2 ? 'up' : 'spread';
    if (this.flopped) flip = this.state === 'air' ? 'up' : 'spread';   // a starfish of a seal

    return {
      sx, sy, flip,
      face: this.face,
      look: this.look,
      acc: accessory,
      view: this.view,
      wobble: this.bonkT > 0 ? Math.round(Math.sin(this.bonkT * 40) * 1.5) : 0,
      sway: this.tailSway(),
    };
  }
};
