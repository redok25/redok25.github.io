// ===================================
// KOPI.JS - Kopi Rahasia (P3): the secret cups as data, when each one shows, when the bike
// takes it, and the Motor Emas gold ramp. Pure logic (no DOM): node tests import it. Every
// count (toast, journal, Motor Emas) is KOPI.length, so a new cup is one entry here plus
// its hint in COPY.kopi.hints.
// ===================================

// x = the cup's centre in world px; lift = px from the ground line up to the cup's bottom.
// Placement rules (tests/kopi.test.js): on the road after the opening ride, 150 px or more
// from every teleport landing and from every other cup, #4 past the credits trigger, #5 on a
// gauge post. Appended only: the save keeps ids in this order (the journal's).
export const KOPI = [
  // Bab 1, night only: on the lower rail of the Bab 1 fence (world.js PROPS, left edge 3010).
  { id: "pagar", x: 3126, lift: 54, when: "night" },
  // Bab 2, floating after the last gauge just above the rider's head: only a full wheelie
  // (the rider leans back and up) reaches it.
  { id: "wheelie", x: 4652, lift: 96, when: "wheelie" },
  // Bab 3, rain only: on the grass under the warung's left eave, behind the warung.
  { id: "warung", x: 5805, lift: 4, when: "rain" },
  // Bab 4, past the credits trigger (7100): the road goes on after the last card.
  { id: "ujung", x: 7300, lift: 4, when: null },
  // Bab 2, Mode Bengkel only (R9): on the post of the third skill gauge (world.js GAUGE_X),
  // inside its box. Shown and taken only while the hitbox view is on; drawn by bengkel.js.
  { id: "bengkel", x: 4300, lift: 20, when: "bengkel" },
];

// The stored ids (save key "kopi"), in KOPI order: the list getIds/addId check against.
export const KOPI_IDS = KOPI.map((c) => c.id);

export const KOPI_SIZE = 30; // on-screen px: the 10 x 10 cup art (world.js) at 3x, like the props
export const KOPI_RADIUS = 30; // bike centre to cup centre: a 61 px window, top speed is 10 px/step
const NIGHT_FROM = 0.25; // effects.currentTimeState.a: noon 0, morning 0.1, afternoon 0.15, night 0.5
const NIGHT_FULL = 0.45; // fully shown before the overlay settles at 0.5
const TAKE_FROM = 0.5; // a cup must be at least half shown to be taken

// 0..1, how much of a cup shows. The night cup fades in with the darkness (the same 0.25
// line the Phase 4 lighting uses), the rain cup with the rain (rainIntensity eases over 1 s),
// the Bengkel cup only while the hitbox view is on (xray).
export function kopiShown(cup, nightA, rain, xray = false) {
  if (cup.when === "night") return Math.min(1, Math.max(0, (nightA - NIGHT_FROM) / (NIGHT_FULL - NIGHT_FROM)));
  if (cup.when === "rain") return rain;
  if (cup.when === "bengkel") return xray ? 1 : 0;
  return 1;
}

// The bike's centre (sim x) takes a cup: in range, the cup at least half shown, and the
// floating cup only at full wheelie rotation.
export function kopiReach(cup, centerX, shown, fullWheelie) {
  return Math.abs(centerX - cup.x) <= KOPI_RADIUS && shown >= TAKE_FROM && (cup.when !== "wheelie" || fullWheelie);
}

// Motor Emas: on while every cup there is has been found (got = getKopi, normalised ids).
// A cup added later asks for it again.
export const isEmas = (got) => got.length === KOPI.length;

// R10: Pemburu Kopi earned (every cup there was) but not every cup now = a cup came later.
// True once per profile (told = the save's kopiNotice flag): the "new cup" toast.
export const kopiNotice = (got, achievements, told) => !told && achievements.includes("kopi") && !isEmas(got);

// Motor Emas sprite: each pixel's brightness (Rec. 601 luma, lifted by GOLD_GAMMA so the
// navy tank turns gold, not bronze) picks a colour on a bronze..pale-gold ramp.
const GOLD_GAMMA = 0.6;
const GOLD_RAMP = [
  [0, 30, 16, 2],
  [0.45, 190, 135, 25],
  [0.8, 250, 210, 80],
  [1, 255, 250, 220],
];

// Rewrites the RGB of the pixel at byte i of RGBA data in place (alpha untouched).
export function goldPixel(px, i) {
  const t = ((0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) / 255) ** GOLD_GAMMA;
  let k = 1;
  while (k < GOLD_RAMP.length - 1 && t > GOLD_RAMP[k][0]) k++;
  const a = GOLD_RAMP[k - 1];
  const b = GOLD_RAMP[k];
  const f = (t - a[0]) / (b[0] - a[0]);
  px[i] = a[1] + (b[1] - a[1]) * f;
  px[i + 1] = a[2] + (b[2] - a[2]) * f;
  px[i + 2] = a[3] + (b[3] - a[3]) * f;
}
