// [sim] Gesamtzustand
let S = null;

// [sim] frischen Zustand anlegen; Parameter und Layer kommen aus der UI
function createState(seed, params, layers) {
  rnd = makeRng(seed);
  S = {
    seed, tick: 0, speed: 1, paused: false, collapsed: false, frames: 0, startedAt: performance.now(),
    params: { ...params }, layers: { ...layers },
    grid: newGrid(),
    counts: { empty: 0, egg: 0, larva: 0, pupa: 0, pollen: 0, nectar: 0, honey: 0 },
    ledger: newLedger(), water: 0,
    stores: { nectar: [], honey: [], pollen: [] }, storeTotals: { nectar: 0, honey: 0, pollen: 0, water: 0 },
    env: newEnv(), queen: newQueen(),
    bees: [], beeById: new Map(), nextBeeId: 1, roleCount: { forager: 0, nurse: 0, worker: 0 },
    handover: [], claims: new Map(), flows: [],
    log: [], history: [], window: [], days: [], dayAcc: null,
    stats: { births: 0, deaths: {}, broodDeaths: {}, trips: 0, tripsOk: 0, tripUnits: 0, delivered: { nectar: 0, pollen: 0, water: 0 }, ripened: 0 },
    stress: { active: false, collected: { nectar: 0, pollen: 0, water: 0 } },
    honeyGuardHits: 0, selected: null, dirty: true, revealT0: performance.now(),
  };
  seedColony();
  rebuildStoreLists();
  logEvent(`Kolonie angelegt: ${S.bees.length} Bienen, ${S.grid.cells.length} Zellen, Seed ${seed}.`, "sys");
}

// [sim] Startbestand: Brutnest innen, Pollenkranz, unreifer Nektar außen (noch KEIN Honig)
function seedColony() {
  for (let i = 0; i < CFG.START_CELLS; i++) growCell(null);
  for (const c of S.grid.cells) {
    if (c.ring <= 3 && chance(0.9)) {
      const st = pick(["egg", "larva", "larva", "pupa", "pupa", "pupa"]);
      setCellState(c, st);
      c.since = -randInt(0, (st === "egg" ? CFG.EGG_T : st === "larva" ? CFG.LARVA_T : CFG.PUPA_T) - 1);
    } else if (c.ring === 4 && chance(0.6)) {
      setCellState(c, "pollen"); c.amount = randInt(30, 55); poolCollect("pollen", c.amount, "Anfangsbestand");
    } else if (c.ring >= 5 && chance(0.9)) {
      setCellState(c, "nectar"); c.amount = randInt(75, 100); c.water = rand(21, 50);
      poolCollect("nectar", c.amount, "Anfangsbestand");
    }
  }
  S.water = 80; poolCollect("water", 80, "Anfangsbestand");
  for (let i = 0; i < S.params.colony; i++) { const c = pick(S.grid.cells); spawnBee(Math.floor(420 * Math.pow(rnd(), 1.5)), c.x, c.y); }
  const rc = { forager: 0, nurse: 0, worker: 0 };
  for (const b of S.bees) rc[b.role]++;
  S.roleCount = rc;
}

// [sim] Ereignis ins Log
function logEvent(text, kind = "") {
  S.log.push({ tick: S.tick, text, kind });
  if (S.log.length > 400) S.log.shift();
  S.logDirty = true;
}

// [sim] ein Logik-Tick in fester Reihenfolge
function simTick() {
  if (S.paused || S.collapsed) return false;
  S.tick++;
  envStep();
  rebuildStoreLists();
  broodStep();
  beesStep();
  rebuildStoreLists();
  recordHistory();
  checkFail();
  stressStep();
  if (S.tick % 20 === 0) runInvariants();
  return true;
}

// [sim] Kennzahlen der letzten 50 Ticks für die Ursachenkette
function recordHistory() {
  S.history.push({
    tick: S.tick, pop: S.bees.length, brood: S.counts.egg + S.counts.larva + S.counts.pupa,
    larva: S.counts.larva, honey: S.storeTotals.honey, nectar: S.storeTotals.nectar, pollen: S.storeTotals.pollen,
    water: S.water, tHive: S.env.tHive, weather: S.env.weather, foragers: S.roleCount.forager, nurses: S.roleCount.nurse,
  });
  if (S.history.length > CFG.HISTORY) S.history.shift();
  while (S.window.length && S.window[0].tick <= S.tick - CFG.HISTORY) S.window.shift();
  recordDay();
}

// [sim] Tagesverlauf (1 Eintrag pro Sim-Tag, 30 Tage): Vorgeschichte, die das 50-Tick-Fenster nicht sieht
function recordDay() {
  const A = S.dayAcc || (S.dayAcc = { rain: 0, c0: S.ledger.nectar.collected, k0: S.ledger.nectar.consumed, hunger0: S.stats.deaths.Hunger || 0 });
  if (S.env.weather === "Regen") A.rain++;
  if (S.tick % 10 !== 0) return;
  const L = S.ledger.nectar;
  S.days.push({
    day: S.tick / 10, pop: S.bees.length, brood: S.counts.egg + S.counts.larva + S.counts.pupa,
    sugar: S.storeTotals.honey + S.storeTotals.nectar, pollen: S.storeTotals.pollen,
    rain: A.rain / 10, sugarIn: L.collected - A.c0, sugarOut: L.consumed - A.k0,
    hunger: (S.stats.deaths.Hunger || 0) - A.hunger0, params: { ...S.params }, stress: S.stress.active,
  });
  if (S.days.length > CFG.LONG_DAYS) S.days.shift();
  S.dayAcc = null;
}

// [sim] Vorgeschichte aus dem Tagesverlauf: wann begann der Abstieg, wie lange regnete es, was wurde verstellt
function longTrend() {
  const D = S.days;
  if (D.length < 2) return [];
  const out = [], first = D[0], last = D[D.length - 1];
  const maxBy = k => D.reduce((m, d) => d[k] > m[k] ? d : m, D[0]);
  const pk = maxBy("pop"), sk = maxBy("sugar");
  out.push(`Bienen: Höchststand ${pk.pop} an Tag ${fmt(pk.day)} → ${last.pop} an Tag ${fmt(last.day)}.`);
  let z = D.length; while (z > 0 && D[z - 1].sugar === 0) z--;
  out.push(`Zuckervorrat: Höchststand ${fmt(sk.sugar)} an Tag ${fmt(sk.day)}` + (z < D.length ? `; leer seit Tag ${fmt(D[z].day)} (${D.length - z} Tage).` : `; zuletzt ${fmt(last.sugar)}.`));
  const inSum = D.reduce((s, d) => s + d.sugarIn, 0), outSum = D.reduce((s, d) => s + d.sugarOut, 0);
  out.push(`Zuckerbilanz der ${D.length} Tage: +${fmt(inSum / D.length)} gesammelt / −${fmt(outSum / D.length)} verbraucht pro Tag.`);
  const rainDays = D.filter(d => d.rain >= 0.5);
  let best = 0, cur = 0, end = null;
  D.forEach(d => { cur = d.rain >= 0.5 ? cur + 1 : 0; if (cur > best) { best = cur; end = d.day; } });
  out.push(`Regen an ${rainDays.length} von ${D.length} Tagen` + (best ? `; längste Serie ${best} Tage (bis Tag ${fmt(end)}).` : "."));
  const P = last.params;
  out.push(`Einstellungen zuletzt: Kolonie ${P.colony}, Ressourcen ${P.res} %, Wetterstabilität ${P.weather} %, Krankheit ${P.disease} %` +
    `; zu Beginn des Zeitraums: ${first.params.res} % / ${first.params.weather} % / ${first.params.disease} %.`);
  const changed = ["colony", "res", "weather", "disease"].filter(k => D.some(d => d.params[k] !== first.params[k]));
  if (changed.length) out.push(`Slider verändert im Zeitraum: ${changed.join(", ")}` + (D.some(d => d.stress) ? " (Stress-Test aktiv)." : "."));
  const hunger = D.reduce((s, d) => s + d.hunger, 0);
  if (hunger) out.push(`Verhungerte Bienen im Zeitraum: ${hunger}.`);
  return out;
}

// [sim] Fail-State prüfen
function checkFail() {
  const pop = S.bees.length, brood = S.counts.egg + S.counts.larva + S.counts.pupa, honey = honeyStock();
  let reason = null;
  if (pop < CFG.POP_MIN) reason = `Population ${pop} < ${CFG.POP_MIN}`;
  else if (brood === 0 && honey === 0) reason = `Brut 0 bei leerem Honigvorrat (Honig ${honey})`;
  if (!reason) return;
  S.collapsed = true;
  logEvent("KOLONIE KOLLABIERT: " + reason, "bad");
  const chain = causalChain(reason);
  showCollapse(reason, chain);
  if (S.stress.active) finishStress(true);
}

// [sim] Ursachenkette aus History und Ereignisfenster der letzten 50 Ticks, zeitlich geordnet
function causalChain(reason) {
  const H = S.history, first = H[0], last = H[H.length - 1], out = [];
  const add = (tick, text) => out.push({ tick, text });
  const rain = H.filter(h => h.weather === "Regen");
  if (rain.length >= 5) add(rain[0].tick, `Regen in ${rain.length} von ${H.length} Ticks — keine Sammelflüge, kein Nachschub.`);
  const hot = H.filter(h => Math.abs(h.tHive - CFG.T_TARGET) > 3);
  if (hot.length) add(hot[0].tick, `Brutnest außerhalb 32–38 °C in ${hot.length} Ticks (${fmt(Math.min(...hot.map(h => h.tHive)), 1)}–${fmt(Math.max(...hot.map(h => h.tHive)), 1)} °C).`);
  const noPollen = H.find(h => h.pollen === 0);
  if (noPollen) add(noPollen.tick, "Pollenvorrat erschöpft.");
  const noSugar = H.find(h => h.honey + h.nectar === 0);
  if (noSugar) add(noSugar.tick, "Nektar- und Honigvorrat erschöpft.");
  else if (first.honey + first.nectar > last.honey + last.nectar) add(first.tick, `Zuckervorrat sinkt: ${fmt(first.honey + first.nectar)} → ${fmt(last.honey + last.nectar)} Einheiten.`);
  const groups = {};
  for (const e of S.window) {
    const k = (e.kind === "brood" ? "Brut: " : "Bienen: ") + e.cause;
    if (!groups[k]) groups[k] = { tick: e.tick, n: 0 };
    groups[k].n++;
  }
  for (const k in groups) add(groups[k].tick, `${k} — ${groups[k].n} Todesfälle.`);
  if (first.foragers > last.foragers) add(first.tick, `Sammlerinnen: ${first.foragers} → ${last.foragers}; Ammen: ${first.nurses} → ${last.nurses}.`);
  add(last.tick, `Population ${first.pop} → ${last.pop}, Brut ${first.brood} → ${last.brood}.`);
  out.sort((a, b) => a.tick - b.tick);
  out.push({ tick: S.tick, text: "Auslöser: " + reason });
  return { items: out, first, last, long: longTrend(), days: S.days.slice() };
}

// [sim] Parameter setzen (live, ohne Reset)
function setParam(name, value) {
  S.params[name] = value;
  if (name === "colony") applyColonyTarget(false);
}

// [sim] Koloniegröße: Imker setzt Bienen zu bzw. entnimmt Bienen ohne Last (Ableger)
function applyColonyTarget(log) {
  const target = S.params.colony, pop = S.bees.length;
  if (target > pop) {
    const n = Math.min(target, CFG.POP_MAX) - pop;
    for (let i = 0; i < n; i++) { const c = pick(S.grid.cells); spawnBee(randInt(0, 300), c.x, c.y); }
    if (log && n) logEvent(`Imker setzt ${n} Bienen zu (Ziel ${target}).`, "sys");
  } else if (target < pop) {
    const cand = S.bees.filter(b => !b.load && b.task !== "handover" && !S.claims.has(b.id) && b.space === "hive");
    let n = pop - target;
    for (let i = 0; i < cand.length && n > 0; i++, n--) removeBee(cand[i], "entnommen", false);
    S.bees = S.bees.filter(b => !b.dead);
    if (log) logEvent(`Ableger entnommen: ${pop - S.bees.length} Bienen (Ziel ${target}).`, "sys");
  }
  const rc = { forager: 0, nurse: 0, worker: 0 };
  for (const b of S.bees) rc[b.role]++;
  S.roleCount = rc;
}

// [sim] Stress-Test starten: Wetter 10 %, Blüten 10 %, Krankheit 80 % für 30 Sim-Tage
function startStress() {
  const deaths0 = Object.values(S.stats.deaths).reduce((a, b) => a + b, 0);
  S.stress = {
    active: true, start: S.tick, end: S.tick + CFG.STRESS_TICKS, prev: { ...S.params },
    honey0: honeyStock(), sugar0: S.storeTotals.nectar + S.storeTotals.honey, pop0: S.bees.length,
    brood0: S.counts.egg + S.counts.larva + S.counts.pupa, deaths0, births0: S.stats.births,
    broodDeaths0: Object.values(S.stats.broodDeaths).reduce((a, b) => a + b, 0),
    collected: { nectar: 0, pollen: 0, water: 0 },
  };
  setParam("weather", 10); setParam("res", 10); setParam("disease", 80);
  syncSliders();
  logEvent("Stress-Test gestartet: Wetter 10 %, Blüten 10 %, Krankheit 80 % für 30 Sim-Tage.", "bad");
}

// [sim] Stress-Test überwachen
function stressStep() { if (S.stress.active && S.tick >= S.stress.end) finishStress(false); }

// [sim] Stress-Test beenden (regulär, durch Kollaps oder Abbruch) und Report bilden
function finishStress(collapsed, aborted = false) {
  const st = S.stress;
  const deaths = Object.values(S.stats.deaths).reduce((a, b) => a + b, 0) - st.deaths0;
  const births = S.stats.births - st.births0;
  const broodDeaths = Object.values(S.stats.broodDeaths).reduce((a, b) => a + b, 0) - st.broodDeaths0;
  const honey1 = honeyStock(), sugar1 = S.storeTotals.nectar + S.storeTotals.honey;
  const rep = {
    result: aborted ? "abgebrochen" : collapsed ? "kollabiert" : "überlebt",
    days: (S.tick - st.start) * CFG.DAYS_PER_TICK,
    honey0: st.honey0, honey1, sugar0: st.sugar0, sugar1,
    pop0: st.pop0, pop1: S.bees.length, brood0: st.brood0, brood1: S.counts.egg + S.counts.larva + S.counts.pupa,
    deaths, births, broodDeaths, mortality: deaths / Math.max(1, st.pop0 + births) * 100,
    collected: { ...st.collected },
  };
  st.active = false;
  for (const k of ["weather", "res", "disease"]) S.params[k] = st.prev[k];
  syncSliders();
  logEvent(`Stress-Test ${rep.result} nach ${fmt(rep.days, 1)} Sim-Tagen.`, rep.result === "überlebt" ? "sys" : "bad");
  if (!aborted) showReport(rep);
  return rep;
}

let loopAcc = 0, loopLast = 0;
// [sim] Hauptschleife: feste Logik-Ticks, entkoppelt vom requestAnimationFrame
function frameLoop(now) {
  const dt = Math.min(0.25, (now - loopLast) / 1000); loopLast = now;
  if (!S.paused && !S.collapsed) {
    loopAcc += dt * CFG.TICKS_PER_SEC * S.speed;
    let steps = 0;
    while (loopAcc >= 1 && steps < CFG.MAX_STEPS_PER_FRAME) { simTick(); loopAcc -= 1; steps++; }
    if (steps >= CFG.MAX_STEPS_PER_FRAME) loopAcc = 0;
  } else loopAcc = 0;
  S.frames++;
  render(clamp(loopAcc, 0, 1));
  uiFrame(now);
  requestAnimationFrame(frameLoop);
}

// [sim] Start: Zustand, UI, Startprüfung (UI-Test auf Wegwerfzustand), dann Uhr
function boot() {
  initUI();
  createState(20261016, readParams(), readLayers());
  initRenderer();
  runStartupCheck();
  loopLast = performance.now();
  requestAnimationFrame(frameLoop);
}
