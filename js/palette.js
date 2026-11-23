// palette.js
// One small, shared colour palette keeps the 8-bit look consistent.
// Every sprite and every background band pulls from this list.

window.HH = window.HH || {};

HH.PAL = {
  // --- the seal ---
  outline:    '#2b2d48',  // soft navy outline, never pure black
  seal:       '#8e97b2',  // back fur
  sealLight:  '#b8c0d8',  // sun-lit fur on the back
  sealDark:   '#666f8c',  // flippers
  spot:       '#6a7291',  // harbour seal spots
  belly:      '#eceaf3',  // big squishy silvery belly
  bellyShade: '#cfcbdc',
  muzzle:     '#dfe3ee',
  eye:        '#1c1b2e',
  eyeGlint:   '#57577a',
  white:      '#ffffff',
  blush:      '#f3a49b',
  nose:       '#3b3044',
  mouth:      '#5f586f',
  whisker:    '#fbf7ee',

  // --- coastal palette from the brief ---
  turquoise:  '#3fbfcb',
  turquoiseD: '#2f9fb5',
  turquoiseL: '#7dd8de',
  seafoam:    '#9ee6c8',
  teal:       '#5aa9a6',
  tealD:      '#3e8584',
  sand:       '#f3ddb4',
  sandL:      '#f8e9c9',
  sandD:      '#e5c79a',
  sandDD:     '#cfab7c',
  wetSand:    '#d8b98e',
  wetSandD:   '#d0b086',
  lavender:   '#b8a7da',
  lavenderD:  '#8f7fbd',
  coral:      '#f08a7e',
  coralD:     '#d2665e',
  orange:     '#f6a85c',
  orangeD:    '#dd8640',
  gold:       '#ffd766',
  goldD:      '#e9a93a',
  goldL:      '#fff2b0',

  // --- sky (top to horizon) ---
  sky: ['#78c4df', '#86cce3', '#96d4e7', '#a9dcea', '#bfe4ec', '#d6ebeb', '#ecefe2', '#f8e8cd'],
  cloud:      '#ffffff',
  cloudShade: '#dfeef5',
  island:     '#9fb7cc',
  islandD:    '#86a1ba',
  haze:       '#d9ece9',

  // --- greenery ---
  grass:      '#7cc49a',
  grassD:     '#4f9c7a',
  kelp:       '#3f8a62',
  kelpD:      '#2d6a4c',
  kelpL:      '#69b37c',

  // --- rocks and wood ---
  rock:       '#9a9cb5',
  rockL:      '#c3c4d6',
  rockD:      '#6f7290',
  wood:       '#b07d52',
  woodL:      '#d29f6c',
  woodD:      '#83583a',
  woodEnd:    '#ecc98f',

  // --- UI ---
  ui:         '#2b2d48',
  uiPanel:    '#fff6e6',
  uiPanelD:   '#efdcbd',
  uiText:     '#2b2d48',
  uiAccent:   '#f08a7e',
  shadow:     'rgba(43, 45, 72, 0.28)',
};
