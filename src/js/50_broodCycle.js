// [broodCycle] Zustand der impliziten Königin
function newQueen() { return { acc: 0, laid: 0, noCellLogged: false }; }

// [broodCycle] Legerate (Eier pro Tick) aus Zielgröße, Vorräten und Temperatur
function layingRate() {
  const target = S.params.colony, pop = S.bees.length;
  const brood = S.counts.egg + S.counts.larva + S.counts.pupa;
  if (pop + brood >= CFG.POP_MAX) return 0;
  // weiche Regelung: Brut zählt als künftige Bienen (Gleichgewicht: Brut ≈ 0,47 × Ziel); kein harter Stopp,
  // denn ein Legestopp wirkt erst 21 Tage später und lässt kleine Völker durch die Untergrenze schwingen
  const ratio = (pop + brood) / (target * 1.47);
  let rate = target / 380 * clamp(1 + (1 - ratio) * 3, 0.15, 2);
  const sugar = S.storeTotals.nectar + S.storeTotals.honey, pollen = S.storeTotals.pollen;
  const food = clamp(Math.min(sugar / 350, pollen / 100), 0, 1);
  if (pollen < 20 || sugar < 40) return 0;
  if (S.env.tHive < 32) rate *= 0.3;
  return rate * food;
}

// [broodCycle] Eiablage in die innerste freie Zelle
function queenLay() {
  const Q = S.queen;
  Q.acc += layingRate();
  while (Q.acc >= 1) {
    Q.acc -= 1;
    const br = broodRadius();
    const c = bestCell(c => c.state === "empty" && c.ring <= br + 1, c => c.ring * 2 + (c.ring > br ? 40 : 0))
           || bestCell(c => c.state === "empty", c => c.ring * 2);           // Notfall: Brutnest voll

    if (!c) {
      if (!Q.noCellLogged) { Q.noCellLogged = true; logEvent("Königin findet keine freie Zelle für Eier.", "bad"); }
      Q.acc = 0; return;
    }
    Q.noCellLogged = false;
    setCellState(c, "egg");
    c.bee = null; Q.laid++;
  }
}

// [broodCycle] Entwicklung Ei 30 -> Larve 60 -> Puppe 120 -> Biene; Temperaturschäden
function advanceBrood() {
  const dev = Math.abs(S.env.tHive - CFG.T_TARGET);
  const pTemp = dev > 3 ? 0.0015 * (dev - 3) : 0;
  let tempDead = 0;
  for (const c of S.grid.cells) {
    if (c.state !== "egg" && c.state !== "larva" && c.state !== "pupa") continue;
    if (pTemp > 0 && chance(pTemp)) { killBrood(c, "Temperatur"); tempDead++; continue; }
    const age = S.tick - c.since;
    if (c.state === "egg" && age >= CFG.EGG_T) { setCellState(c, "larva"); c.starve = 0; }
    else if (c.state === "larva" && age >= CFG.LARVA_T) setCellState(c, "pupa");
    else if (c.state === "pupa" && age >= CFG.PUPA_T) {
      setCellState(c, "empty");
      spawnBee(0, c.x, c.y);
      S.stats.births++;
    }
  }
  if (tempDead) logEvent(`${tempDead} Brutzelle(n) durch Stocktemperatur ${fmt(S.env.tHive, 1)} °C abgestorben.`, "bad");
}

// [broodCycle] Brutzelle stirbt ab
function killBrood(c, cause) {
  setCellState(c, "empty");
  S.stats.broodDeaths[cause] = (S.stats.broodDeaths[cause] || 0) + 1;
  S.window.push({ tick: S.tick, kind: "brood", cause });
}

// [broodCycle] Fütterung: jede Larve braucht je Tick 1 Zucker + 1 Pollen, alle 5 Ticks 1 Wasser zur Verdünnung
function feedLarvae() {
  const larvae = [];
  for (const c of S.grid.cells) if (c.state === "larva") larvae.push(c);
  if (!larvae.length) return;
  const nurses = S.bees.filter(b => b.role === "nurse");
  const workers = S.roleCount.worker;
  const cap = nurses.length * CFG.NURSE_CAP + workers * CFG.WORKER_CAP;
  larvae.sort((a, b) => b.starve - a.starve);
  const dead = {};
  larvae.forEach((c, i) => {
    let reason = null;
    if (i >= cap) reason = "keine Pflegebiene frei";
    else {
      const s = withdraw("nectar", 1, "Larvenfutter");
      const p = withdraw("pollen", 1, "Larvenfutter");
      if ((S.tick + c.id) % 5 === 0 && withdraw("water", 1, "Futterverdünnung") === 0) withdraw("nectar", 1, "Verdünnung ohne Wasser");
      if (!s) reason = "Nektar fehlte"; else if (!p) reason = "Pollen fehlte";
      if (nurses.length) c.bee = nurses[i % nurses.length].id;
    }
    if (reason) {
      c.starve++;
      if (c.starve >= CFG.LARVA_STARVE_LIMIT) { (dead[reason] = dead[reason] || []).push(c.id); killBrood(c, "Unterversorgung: " + reason); }
    } else c.starve = 0;
  });
  for (const r in dead) logEvent(`${dead[r].length} Larve(n) gestorben — ${r} (Zelle ${dead[r].slice(0, 5).map(i => "#" + i).join(", ")}${dead[r].length > 5 ? " …" : ""}).`, "bad");
}

// [broodCycle] ein Tick Brut
function broodStep() { queenLay(); advanceBrood(); feedLarvae(); }
