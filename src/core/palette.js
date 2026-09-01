/**
 * The whole scene pulls its colour from this one file.
 *
 * The look is built on a deliberate split: everything the sun touches drifts
 * warm (cream / straw), everything in shade drifts cool (violet-grey). Keeping
 * both tints here — rather than baking them into each material — is what lets
 * the scene read as one painting instead of a pile of models.
 */

export const LIGHT = {
  // Warm afternoon key light. Three's toon shading divides irradiance by π, so
  // an intensity near 2.8 is what actually lands a fully lit surface at ~1.0
  // of its own albedo.
  sun: 0xfff2d2,
  sunIntensity: 2.8,
  // Bounce light off the sky: cool, soft, fills the shadow side.
  skyFill: 0xdcebff,
  groundFill: 0xa9a2c8,
  hemiIntensity: 0.55,
  ambient: 0xb2adcd,
  ambientIntensity: 0.36,

  // Secondary painterly fills. These are intentionally restrained because the
  // renderer uses NoToneMapping: once a toon band clips, extra light just turns
  // the painted palette into white. The depth should be visible through local
  // colour separation and falloff, not through overexposure.
  facadeBounce: 0xffd8bf,
  facadeBounceIntensity: 8.5,
  facadeBounceDistance: 9.5,
  blossomBounce: 0xffbfd3,
  blossomBounceIntensity: 5.5,
  blossomBounceDistance: 11.5,
  crossingFill: 0xd8e9ff,
  crossingFillIntensity: 9.0,
  crossingFillDistance: 22,
  groundBounce: 0xffe6c9,
  groundBounceIntensity: 3.8,
  groundBounceDistance: 7.5,

  // ~64° up, from over the west rooftops. Elevation matters more than it
  // sounds: this street is 6m wide between 6m buildings, so anything below
  // about 60° puts most of the road in permanent shade and the dappling from
  // the cherry canopy stops reading against it.
  sunPosition: [-24, 60, -19],
};

/**
 * Multiplied over lit / shaded regions inside the toon shader. `*Level` is the
 * luminance each tint is normalised to before use — the hue does the styling,
 * these two numbers do the (small) value separation.
 */
export const TINT = {
  sun: 0xfff2d6,
  sunLevel: 1.06,
  shade: 0xcfcade,
  shadeLevel: 0.90,
  // Where the light→shade crossfade happens, in normalised light luminance.
  lo: 0.32,
  hi: 0.72,
};

export const SKY = {
  zenith: 0x8fc4ee,
  middle: 0xc8e2f7,
  horizon: 0xffe9ec,
  // Kept under pure white so the sky never trips the bloom threshold — bloom
  // is reserved for things that are genuinely emitting.
  glow: 0xffeecb,
  cloud: 0xf7f2e8,
  cloudShade: 0xd3daef,
};

export const C = {
  // ---- ground plane -------------------------------------------------------
  asphalt: 0xa9a6b0,
  asphaltWorn: 0xb2afb8,
  roadLine: 0xf4f2ee,
  roadLineWorn: 0xdedae0,
  sidewalk: 0xc2bfcb,
  sidewalkEdge: 0xd6d3dc,
  curb: 0xcecbd6,
  tactile: 0xf2c53f, // 点字ブロック
  drain: 0x8b8898,
  manhole: 0x8f8c9c,
  dirt: 0xb4a795,

  // ---- railway ------------------------------------------------------------
  ballast: 0x9a9490,
  sleeper: 0x6d6058,
  rail: 0xb6b3bd,
  railSide: 0x7c7480,
  crossingDeck: 0xb9b6c0,
  barrierYellow: 0xf5c93c,
  barrierBlack: 0x2f2b33,
  signalRed: 0xff4b42,
  signalBody: 0x37333d,
  signalPole: 0xf0c93f,

  // ---- rolling stock ------------------------------------------------------
  trainBody: 0xeef0f4,
  trainRoof: 0xb9bcc6,
  trainSkirt: 0x5d5a68,
  trainStripe: 0xe2683f,
  trainStripe2: 0x4e9d5c,
  trainGlass: 0x6d90a8,
  trainDoor: 0xe4e6ec,
  bogie: 0x4a4753,

  // ---- architecture -------------------------------------------------------
  wallCream: 0xf2e6d2,
  wallBeige: 0xe3d4bd,
  wallWarm: 0xe8cdae,
  wallMint: 0xcfded2,
  wallBlue: 0xc8d6e4,
  wallPink: 0xf0d6d2,
  wallGrey: 0xd9d6d9,
  roofTile: 0x5f6b7a, // 瓦
  roofTileWarm: 0x7a6a63,
  roofDark: 0x4a5361,
  concrete: 0xcdc9cd,
  blockWall: 0xd2ceca, // ブロック塀
  woodDark: 0x7a5c44,
  woodLight: 0xb99873,
  glass: 0x9fc2d6,
  glassDark: 0x6f8ba1,
  shutter: 0xbfc3c9,
  awningRed: 0xc94a44,
  awningGreen: 0x4f8f6b,
  awningBlue: 0x3d72b0,
  awningStripe: 0xf5efe4,
  signBlue: 0x275ea6,
  signWhite: 0xf8f6f1,
  noren: 0x2f5d8a,

  // ---- props --------------------------------------------------------------
  poleConcrete: 0xc9c5c8,
  poleBand: 0xe0dcda,
  wire: 0x3b3742,
  vendRed: 0xd8433a,
  vendBlue: 0x2f6fb5,
  vendPanel: 0x2b2830,
  vendGlow: 0xfff6e0,
  mirrorOrange: 0xe8813a,
  mirrorFace: 0xd8e4ec,
  guardrail: 0xdcd8d4,
  bikeFrame: 0x3f5f7a,
  bikeFrame2: 0x8a4550,
  bikeMetal: 0x9a9aa4,
  tyre: 0x39353d,
  cone: 0xe8623c,
  planter: 0xb5705a,
  planterGrey: 0xa9a5a8,
  leaf: 0x5c8f56,
  leafDark: 0x3f6c46,
  leafLight: 0x81b06a,
  bin: 0x5b6672,
  catFur: 0xe4d5c0,
  crow: 0x2e2b35,

  // ---- sakura -------------------------------------------------------------
  bark: 0x8d777c,
  barkLight: 0xab9299,
  blossom: 0xf6bccf,
  blossomLight: 0xfdd9e4,
  blossomDeep: 0xe294b3,
  petal: 0xfcccdc,
};

/** Drink-can colours for the vending machine racks — deliberately loud. */
export const DRINKS = [
  0xe8483c, 0xf5a623, 0x3f8fd8, 0x4fb372, 0xf2e34a, 0xe86ea4, 0x8f6fd0,
  0xf7f3e8, 0x2f4f8c, 0xe0763a, 0x5ec6c9, 0xd94a6a,
];
