// [environment] Anfangszustand der Umwelt; Wiese in Außenkoordinaten (u nach rechts ab Flugloch, v vertikal)
function newEnv() {
  return {
    weather: "Sonne", tOut: 24, tOutTarget: 24, tHive: 34.6,
    heaters: 0, coolers: 0,
    patches: [
      { id: 0, kind: "flower", name: "Linde",       u: 470, v: -300, nectar: 500, pollen: 250, maxN: 840, maxP: 400, phase: 0.00, hue: 48 },
      { id: 1, kind: "flower", name: "Weißklee",    u: 760, v: -110, nectar: 400, pollen: 300, maxN: 600, maxP: 500, phase: 0.30, hue: 0 },
      { id: 2, kind: "flower", name: "Raps",        u: 560, v: 170,  nectar: 600, pollen: 350, maxN: 920, maxP: 560, phase: 0.55, hue: 55 },
      { id: 3, kind: "flower", name: "Wildblumen",  u: 900, v: 300,  nectar: 300, pollen: 400, maxN: 520, maxP: 640, phase: 0.80, hue: 300 },
      { id: 4, kind: "water",  name: "Tränke",      u: 250, v: 330,  nectar: 0,   pollen: 0,   maxN: 0,   maxP: 0,   phase: 0, hue: 200 },
    ],
  };
}

// [environment] Wahrscheinlichkeit eines Wetterwechsels pro Sim-Tag, abhängig vom aktuellen Wetter:
// Stabilität hält gutes Wetter fest und beendet Regen schnell (vorher galt sie für jedes Wetter gleich —
// bei 70 % hielten Regenphasen dadurch bis zu 24 Tage und verursachten alle gemessenen Kollapse).
function weatherChangeProb(state = S.env.weather) {
  const st = S.params.weather / 100;
  return state === "Regen" ? 0.15 + 0.35 * st : 0.04 + (1 - st) * 0.46;
}

// [environment] Nachwachsrate der Blüten (Summe Nektar pro Tick) — Funktion der Slider
function flowerRegen(p) {
  const res = S.params.res / 100;
  const wf = S.env.weather === "Sonne" ? 1 : S.env.weather === "Bewölkt" ? 0.55 : 0.15;
  const bloom = 0.55 + 0.45 * Math.sin(2 * Math.PI * (S.tick * CFG.DAYS_PER_TICK / 40 + p.phase));
  return 0.04 * res * wf * bloom;
}

// [environment] Sterbewahrscheinlichkeit je Tick durch Krankheit/Räuber (Alterstod separat in beesStep)
function mortalityPerTick(b) {
  const d = S.params.disease / 100;
  let p = 0.00025 + d * 0.0024;
  if (b.space === "out") p += d * 0.0012;      // Räuber draußen
  return p;
}

// [environment] Flugwetter?
function canFly() { return S.env.weather !== "Regen"; }

// [environment] ein Tick Umwelt: Wetter, Außentemperatur, Blüten, Stocktemperatur
function envStep() {
  const E = S.env, st = S.params.weather / 100;
  if (S.tick % 10 === 0 && chance(weatherChangeProb())) {
    const w = { Sonne: 0.25 + 0.55 * st, "Bewölkt": 0.35, Regen: Math.max(0.05, 0.4 - 0.35 * st) };
    let x = rnd() * (w.Sonne + w["Bewölkt"] + w.Regen), nw = "Sonne";
    if ((x -= w.Sonne) > 0) nw = (x -= w["Bewölkt"]) > 0 ? "Regen" : "Bewölkt";
    const base = nw === "Sonne" ? 27 : nw === "Bewölkt" ? 21 : 15;
    E.tOutTarget = base + (1 - st) * rand(-9, 9);
    if (nw !== E.weather) { E.weather = nw; logEvent(`Wetter: ${nw}, außen → ${fmt(E.tOutTarget, 1)} °C`, "sys"); }
  }
  E.tOut += (E.tOutTarget - E.tOut) * 0.05;
  for (const p of E.patches) {
    if (p.kind !== "flower") continue;
    const r = flowerRegen(p);
    p.nectar = Math.min(p.maxN, p.nectar + p.maxN * r);
    p.pollen = Math.min(p.maxP, p.pollen + p.maxP * r);
  }
  const passive = E.tOut + 0.045 * Math.min(S.bees.length, CFG.POP_MAX);
  E.tHive += 0.03 * (passive - E.tHive) + E.heaters * 0.05 - E.coolers * 0.05;
  E.tHive = clamp(E.tHive, -5, 50);
}

// [environment] lokale Temperatur einer Zelle (Brutnest warm, Rand nähert sich der Außentemperatur)
function cellTemp(c, br, maxRing) {
  const f = clamp((c.ring - br) / (maxRing - br + 2), 0, 1);
  return S.env.tHive - (S.env.tHive - S.env.tOut) * f * 0.6;
}
