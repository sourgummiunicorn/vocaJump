// projection.js
// The pseudo-3D camera, in the spirit of Penguin Adventure.
//
// World coordinates:
//   z  = distance along the path (forward, toward the horizon)
//   x  = sideways position in world units (the path is about 1 unit wide)
//   h  = height above the sand
//
// The camera floats CAM_H units above the sand, CAM_BACK units behind the seal.
// A point that is dz units in front of the camera lands on screen at
//
//     screenY = HORIZON + (CAM_H - h) * F / dz
//     screenX = centre  + (x - camX)  * F / dz
//
// So "F / dz" is simply how many pixels one world unit covers at that depth.
// Far things get a small number (tiny), near things a big number (large).

HH.View = {
  W: 160,          // virtual screen size in pixels
  RES: 3,          // canvas pixels per game pixel (finer lettering, same art)
  H: 256,
  HORIZON: 96,     // the horizon line
  CAM_H: 1,        // camera height above the sand
  CAM_BACK: 3,     // camera distance behind the seal
  F: 312,          // "focal length": at dz = 3, one world unit = 104 px
  FAR: 90,         // stop drawing the ground beyond this distance
};

HH.Proj = {
  camZ: 0,
  camX: 0,

  // How far away (dz) is the sand visible on screen row y?
  depthAtRow(y) {
    const V = HH.View;
    return (V.F * V.CAM_H) / (y + 0.5 - V.HORIZON);
  },

  // Pixels per world unit at distance dz.
  scale(dz) { return HH.View.F / dz; },

  // Project a world point. Returns null when it is behind the camera.
  project(x, z, h) {
    const V = HH.View;
    const dz = z - this.camZ;
    if (dz <= 0.3) return null;
    const s = V.F / dz;
    return {
      x: V.W / 2 + (x - this.camX) * s,
      y: V.HORIZON + (V.CAM_H - h) * s,
      s,   // pixels per world unit here
      dz,
    };
  },

  // Sprites are authored at the size they appear next to the seal.
  // This returns how much to shrink or grow them at distance dz.
  spriteScale(dz) { return HH.View.CAM_BACK / dz; },
};
