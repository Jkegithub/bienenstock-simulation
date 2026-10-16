// [beeAgents] Rolle aus dem Alter; die Altersgrenzen verschieben sich mit dem Bedarf des Volks
function roleForAge(age) {
  const a = S.roleAges || { w: CFG.AGE_WORKER, f: CFG.AGE_FORAGER };
  return age < a.w ? "nurse" : age < a.f ? "worker" : "forager";
}

// [beeAgents] Bedarfsanpassung der Altersgrenzen (Ammen bleiben länger / Sammeln früher), weich nachgeführt
function updateRoleAges() {
  const a = S.roleAges || (S.roleAges = { w: CFG.AGE_WORKER, f: CFG.AGE_FORAGER });
  const rc = S.roleCount, pop = Math.max(1, S.bees.length);
  const wT = rc.nurse * CFG.NURSE_CAP < S.counts.larva * 1.2 ? CFG.AGE_WORKER + 60 : rc.nurse > pop * 0.4 ? CFG.AGE_WORKER - 40 : CFG.AGE_WORKER;
  const fT = rc.forager < pop * 0.3 ? CFG.AGE_FORAGER - 70 : rc.forager > pop * 0.55 ? CFG.AGE_FORAGER + 60 : CFG.AGE_FORAGER;
  a.w += (wT - a.w) * 0.02; a.f += (Math.max(fT, a.w + 30) - a.f) * 0.02;
}

// [beeAgents] neue Biene im Stock
function spawnBee(age, x, y) {
  const b = {
    id: S.nextBeeId++, age, role: roleForAge(age), task: "idle", timer: 0,
    x, y, space: "hive", px: x, py: y, pspace: "hive", path: [],
    target: { kind: "rest", x, y }, load: null, want: null, waitT: 0, hunger: 0, dead: false,
    wobble: rnd() * 6.28,
  };
  S.bees.push(b); S.beeById.set(b.id, b);
  return b;
}

// [beeAgents] Wegpunkte; Innen- und Außenraum sind am Flugloch verbunden (Design decision 4)
function wp(x, y, space) { return { x, y, space }; }
// [beeAgents] versetzter Zwischenpunkt, damit Pfade nicht schnurgerade sind
function midPoint(a, b, space, k = 0.18) {
  const dx = b.x - a.x, dy = b.y - a.y, s = (rnd() - 0.5) * 2 * k;
  return wp((a.x + b.x) / 2 - dy * s, (a.y + b.y) / 2 + dx * s, space);
}
// [beeAgents] Pfad von der aktuellen Position zu dest
function pathTo(b, dest) {
  const Ein = wp(S.grid.entrance.x, S.grid.entrance.y, "hive"), Eout = wp(0, 0, "out");
  const here = wp(b.x, b.y, b.space), p = [];
  if (b.space === dest.space) p.push(midPoint(here, dest, dest.space), dest);
  else if (b.space === "hive") p.push(midPoint(here, Ein, "hive"), Ein, Eout, midPoint(Eout, dest, "out", 0.25), dest);
  else p.push(midPoint(here, Eout, "out", 0.25), Eout, Ein, midPoint(Ein, dest, "hive"), dest);
  b.path = p;
}
// [beeAgents] Bewegung entlang des Pfads; true, wenn angekommen
function moveBee(b) {
  b.px = b.x; b.py = b.y; b.pspace = b.space;
  let budget = b.space === "out" ? 55 : 12;
  while (budget > 0 && b.path.length) {
    const w = b.path[0];
    if (w.space !== b.space) { b.space = w.space; b.x = w.x; b.y = w.y; b.path.shift(); budget = w.space === "out" ? 55 : 12; continue; }
    const dx = w.x - b.x, dy = w.y - b.y, d = Math.hypot(dx, dy);
    if (d <= budget) { b.x = w.x; b.y = w.y; b.path.shift(); budget -= d; }
    else { b.x += dx / d * budget; b.y += dy / d * budget; budget = 0; }
  }
  return b.path.length === 0;
}
// [beeAgents] Zielkoordinate einer Zelle
function cellWp(c) { return wp(c.x + rand(-2, 2), c.y + rand(-2, 2), "hive"); }
// [beeAgents] Ziel setzen und loslaufen
function goTo(b, task, target, dest) { b.task = task; b.target = target; b.timer = 0; pathTo(b, dest); }

// [beeAgents] Ruhen auf einer zufälligen Zelle (optional nahe dem Flugloch)
function goRest(b, nearEntrance) {
  const cells = S.grid.cells;
  let c = pick(cells);
  if (nearEntrance) c = bestCell(() => true, x => Math.hypot(x.x - S.grid.entrance.x, x.y - S.grid.entrance.y) / 20) || c;
  goTo(b, "toRest", { kind: "cell", id: c.id }, cellWp(c));
}

// [beeAgents] Ressourcenfluss für den Layer merken
function addFlow(res, from, to) {
  if (S.flows.length > 260) S.flows.shift();
  S.flows.push({ res, from, to, born: S.tick });
}

// ---------------------------------------------------------------- Sammlerin (Honigkette Schritt 1–2)
// [beeAgents] Sammlerin entscheidet: was holen, wohin fliegen
function decideForager(b) {
  if (!canFly()) { goRest(b, true); return; }
  const E = S.env, T = S.storeTotals;
  const larvae = S.counts.larva;
  let res = "nectar";
  const needWater = (E.tHive > CFG.T_COOL - 0.6 && S.water < 120) || S.water < 30;
  // Reichweite beider Vorräte in Ticks; der knappere wird proportional häufiger angeflogen
  const pCover = T.pollen / (larvae + 5);
  const sCover = (T.nectar + T.honey) / (larvae + S.bees.length / CFG.EAT_EVERY + 5);
  const pPollen = clamp(sCover / (sCover + pCover + 1e-9), 0.15, 0.85);
  // volle Lager und kaum freie Zellen: weniger Ausflüge (verhindert ein honigverstopftes Brutnest)
  const full = Math.min(pCover, sCover) / 500 + (freeCellCount() < 6 ? 0.5 : 0);
  if (rnd() < clamp(full, 0, 0.9)) { goRest(b, true); return; }
  const r = rnd();
  if (needWater && r < 0.3) res = "water";
  else if (rnd() < pPollen) res = "pollen";
  let patch;
  if (res === "water") patch = E.patches[4];
  else {
    const fl = E.patches.filter(p => p.kind === "flower");
    const tot = fl.reduce((s, p) => s + p[res] + 1, 0);
    let x = rnd() * tot; patch = fl[0];
    for (const p of fl) { x -= p[res] + 1; if (x <= 0) { patch = p; break; } }
  }
  b.want = res;
  goTo(b, "outbound", { kind: "patch", id: patch.id }, wp(patch.u + rand(-40, 40), patch.v + rand(-30, 30), "out"));
}

// [beeAgents] an der Blüte: Nektar/Pollen/Wasser laden (Schritt 1) und zurück zum Eingang (Schritt 2)
function gather(b) {
  const p = S.env.patches[b.target.id], res = b.want;
  let n = CFG.LOAD[res];
  if (res !== "water") { n = Math.min(n, Math.floor(p[res])); p[res] -= n; }
  S.stats.trips++;
  if (n > 0) {
    b.load = { res, n };
    poolCollect(res, n, "Sammelflug");
    S.stats.tripsOk++; S.stats.tripUnits += n;
    addFlow(res, wp(p.u, p.v, "out"), wp(0, 0, "out"));
  }
  goTo(b, "inbound", { kind: "entrance" }, wp(S.grid.entrance.x - 6, S.grid.entrance.y + rand(-6, 6), "hive"));
}

// [beeAgents] Sammlerin am Eingang angekommen
function foragerArrived(b) {
  if (!b.load) { b.task = "idle"; return; }
  const res = b.load.res;
  if (res === "nectar") {                    // Schritt 2: Übergabe an eine Stockbiene
    b.task = "handover"; b.waitT = 0; b.target = { kind: "entrance" };
    S.handover.push(b.id);
  } else if (res === "water") {
    S.water += b.load.n; S.stats.delivered.water += b.load.n;
    addFlow("water", wp(S.grid.entrance.x, S.grid.entrance.y, "hive"), wp(0, 0, "hive"));
    b.load = null; b.task = "idle";
  } else storeLoad(b, "pollen");
}

// ---------------------------------------------------------------- Einlagern (Schritt 3)
// [beeAgents] passende Zelle für Pollen (Kranz um die Brut) oder Nektar (außen) wählen und reservieren
function chooseStoreCell(res) {
  const br = broodRadius(), CAP = CFG.CELL_CAP[res];
  if (res === "pollen")
    return bestCell(c => (c.state === "pollen" && c.amount < CAP) || c.state === "empty",
      c => Math.abs(c.ring - (br + 1)) * 3 + (c.state === "empty" ? 2 : 0) - (c.state === "pollen" ? c.amount / CAP : 0) + (c.state === "empty" && c.ring <= br ? 60 : 0));
  // Brutnest-Zellen nur als Notlösung (hoher Malus), sonst blockiert ein Brutnest bis zum Rand die Einlagerung
  return bestCell(c => (c.state === "nectar" && c.amount < CAP) || c.state === "empty",
    c => -c.ring * 2 + (c.state === "empty" ? 3 : 0) - (c.state === "nectar" ? c.amount / CAP * 3 : 0) + (c.state === "empty" && c.ring <= br ? 60 : 0));
}

// [beeAgents] Last zu einer Zelle tragen
function storeLoad(b, res) {
  const c = chooseStoreCell(res);
  if (!c) {
    // kein Platz: mit Nektar im Honigmagen selbst Wachs bauen (Wachs aus der eigenen Last), sonst warten
    const n = S.grid.cells.length;
    if (res === "nectar" && b.load.n >= CFG.WAX_COST && n < CFG.MAX_CELLS && countTask("build", "toBuild") < 8) {
      const [q, r] = SPIRAL[n], p = hexToXY(q, r);
      goTo(b, "toBuild", { kind: "site", x: p.x, y: p.y }, wp(p.x, p.y, "hive")); return;
    }
    b.task = "holdLoad"; b.timer = 10; b.target = { kind: "entrance" }; return;
  }
  c.reservedBy = b.id;
  goTo(b, "deposit", { kind: "cell", id: c.id, reserved: true }, cellWp(c));
}

// [beeAgents] Einlagerung in die Zielzelle; Nektar kommt mit ~60 % Wasser hinein
function depositAt(b) {
  const c = S.grid.cells[b.target.id];
  if (c.reservedBy === b.id) c.reservedBy = null;
  if (!b.load) { b.task = "idle"; return; }                 // Last unterwegs aufgefressen
  const res = b.load.res, CAP = CFG.CELL_CAP[res];
  const ok = c.state === "empty" || (c.state === res && c.amount < CAP);
  if (ok) {
    const add = Math.min(b.load.n, CAP - c.amount);
    if (c.state === "empty") setCellState(c, res);
    if (res === "nectar") c.water = (c.water * c.amount + CFG.NECTAR_WATER_IN * add) / (c.amount + add);
    c.amount += add; b.load.n -= add; c.bee = b.id; S.dirty = true;
    addFlow(res, wp(S.grid.entrance.x, S.grid.entrance.y, "hive"), wp(c.x, c.y, "hive"));
    if (res !== "water") S.stats.delivered[res] += add;
  }
  if (b.load.n === 0) { b.load = null; b.task = "idle"; }
  else storeLoad(b, res);
}

// ---------------------------------------------------------------- Stockbienen
// [beeAgents] wartende Sammlerin ohne Abholerin finden (Ammen erst nach 40 Ticks Wartezeit)
function claimHandover(b) {
  for (const fid of S.handover) {
    if (S.claims.has(fid)) continue;
    const f = S.beeById.get(fid);
    if (!f || f.task !== "handover") continue;
    if (b.role === "nurse" && f.waitT < 40) continue;
    S.claims.set(fid, b.id);
    goTo(b, "toReceive", { kind: "bee", id: fid }, wp(f.x - 4, f.y + rand(-4, 4), "hive"));
    return true;
  }
  return false;
}

// [beeAgents] Übergabe Sammlerin -> Stockbiene (Schritt 2), dann Einlagerung (Schritt 3)
function receive(b) {
  const fid = b.target.id, f = S.beeById.get(fid);
  S.claims.delete(fid);
  if (!f || f.dead || f.task !== "handover" || !f.load) { b.task = "idle"; return; }
  b.load = f.load; f.load = null; f.task = "idle";
  S.handover = S.handover.filter(id => id !== fid);
  storeLoad(b, "nectar");
}

// [beeAgents] Anzahl Bienen in einer Aufgabe
function countTask(...tasks) { let n = 0; for (const b of S.bees) if (tasks.includes(b.task)) n++; return n; }

// [beeAgents] Arbeiterin wählt nach Priorität: Abholen, Kühlen, Heizen, Fächeln, Bauen, Ruhen
function decideWorker(b) {
  if (claimHandover(b)) return;
  const E = S.env, br = broodRadius();
  const broodCell = () => bestCell(c => c.ring <= br, () => 0) || S.grid.cells[0];
  if (E.tHive > CFG.T_COOL && S.water > 0 && countTask("cool", "toCool") < Math.ceil((E.tHive - CFG.T_TARGET) * 4)) {
    const c = broodCell(); goTo(b, "toCool", { kind: "cell", id: c.id }, cellWp(c)); return;
  }
  if (E.tHive < CFG.T_HEAT && countTask("heat", "toHeat") < Math.ceil((CFG.T_TARGET - E.tHive) * 5)) {
    const c = broodCell(); goTo(b, "toHeat", { kind: "cell", id: c.id }, cellWp(c)); return;
  }
  // Bauen vor Fächeln, sobald Zellen knapp werden — sonst verstopft Nektar das Brutnest
  const cells = S.grid.cells.length;
  const waiting = S.handover.length + countTask("holdLoad");
  if (!S.grid.capReached && cells < CFG.MAX_CELLS && (freeCellCount() < Math.max(12, cells * 0.18) || waiting > 2)
      && S.storeTotals.nectar + S.storeTotals.honey > CFG.WAX_COST * 4 && countTask("build", "toBuild") < 5) {
    const [q, r] = SPIRAL[cells], p = hexToXY(q, r);
    goTo(b, "toBuild", { kind: "site", x: p.x, y: p.y }, wp(p.x, p.y, "hive")); return;
  }
  const fanCell = bestCell(c => c.state === "nectar" && c.fanner === null && c.water >= CFG.HONEY_WATER, c => -c.amount / 10);
  if (fanCell) {                              // Schritt 4: Fächeln
    fanCell.fanner = b.id;
    goTo(b, "toFan", { kind: "cell", id: fanCell.id }, cellWp(fanCell)); return;
  }
  if (cells >= CFG.MAX_CELLS && !S.grid.capReached) growCell(b.id);
  goRest(b, false);
}

// [beeAgents] Amme: Larven versorgen (Ziel = hungrigste Larve), sonst Brut kontrollieren
function decideNurse(b) {
  if (claimHandover(b)) return;
  const E = S.env;
  if (E.tHive < CFG.T_HEAT && countTask("heat", "toHeat") < Math.ceil((CFG.T_TARGET - E.tHive) * 5)) {   // Brut wärmen
    const br = broodRadius(), h = bestCell(c => c.ring <= br, () => 0) || S.grid.cells[0];
    goTo(b, "toHeat", { kind: "cell", id: h.id }, cellWp(h)); return;
  }
  const c = bestCell(c => c.state === "larva", c => -c.starve * 5)
         || bestCell(c => c.state === "egg" || c.state === "pupa", () => 0);
  if (c) { goTo(b, "toTend", { kind: "cell", id: c.id }, cellWp(c)); return; }
  goRest(b, false);
}

// [beeAgents] Arbeitsschritt einer laufenden Aufgabe (pro Tick)
function work(b) {
  const c = b.target.kind === "cell" ? S.grid.cells[b.target.id] : null;
  switch (b.task) {
    case "fan": {
      if (!c || c.state !== "nectar") { b.timer = 0; break; }
      c.water = Math.max(0, c.water - CFG.FAN_RATE * (1.3 - 0.5 * c.amount / CFG.CELL_CAP.nectar));
      c.fanTicks++; c.bee = b.id; S.dirty = true;
      if (c.water < CFG.HONEY_WATER) {          // Schritt 5: reif -> Honig, gedeckelt
        if (setCellState(c, "honey")) { S.stats.ripened++; c.fanner = null; }
        b.timer = 0;
      }
      break;
    }
    case "cool":
      if (S.env.tHive <= CFG.T_TARGET) { b.timer = 0; break; }
      if ((S.tick + b.id) % 3 === 0 && withdraw("water", 1, "Kühlung") === 0) { b.timer = 0; break; }
      S.env.coolersNext++; break;
    case "heat":
      if (S.env.tHive >= CFG.T_TARGET) { b.timer = 0; break; }
      if ((S.tick + b.id) % 6 === 0) withdraw("nectar", 1, "Heizen");
      S.env.heatersNext++; break;
    case "tend":
      if (c && c.state === "larva") c.bee = b.id;
      break;
  }
}

// [beeAgents] Aufgabe beendet
function finishTask(b) {
  if (b.task === "fan") {
    const c = S.grid.cells[b.target.id];
    if (c && c.fanner === b.id) c.fanner = null;
  }
  const room = S.grid.cells.length < CFG.MAX_CELLS;
  if (b.task === "build" && room && b.load && b.load.res === "nectar" && b.load.n >= CFG.WAX_COST) {
    b.load.n -= CFG.WAX_COST; poolConsume("nectar", CFG.WAX_COST, "Wachsbau");
    if (b.load.n === 0) b.load = null;
    growCell(b.id);
  } else if (b.task === "build" && room) {
    if (S.storeTotals.nectar + S.storeTotals.honey >= CFG.WAX_COST) {
      const t = withdraw("nectar", CFG.WAX_COST, "Wachsbau");
      if (t === CFG.WAX_COST) growCell(b.id);
    }
  }
  if (b.task === "holdLoad" && b.load) { storeLoad(b, b.load.res); return; }
  if (b.task === "gather") { gather(b); return; }
  b.task = "idle";
}

// [beeAgents] Ankunft am Pfadende
function arrive(b) {
  const timed = { toFan: ["fan", 16], toCool: ["cool", 14], toHeat: ["heat", 16], toBuild: ["build", 14], toTend: ["tend", 8], toRest: ["rest", 8], outbound: ["gather", 6] };
  if (timed[b.task]) {
    const [t, d] = timed[b.task];
    b.task = t; b.timer = (t === "gather" && S.env.weather === "Bewölkt") ? 9 : d;
    return;
  }
  if (b.task === "inbound") foragerArrived(b);
  else if (b.task === "toReceive") receive(b);
  else if (b.task === "deposit") depositAt(b);
}

// [beeAgents] Tod oder Entnahme einer Biene; Last wird als verloren verbucht, Referenzen gelöst
function removeBee(b, cause, natural = true) {
  if (b.dead) return;
  b.dead = true;
  if (b.load) { poolConsume(b.load.res, b.load.n, "verloren (" + cause + ")"); b.load = null; }
  if (b.target && b.target.kind === "cell") {
    const c = S.grid.cells[b.target.id];
    if (c && c.reservedBy === b.id) c.reservedBy = null;
    if (c && c.fanner === b.id) c.fanner = null;
  }
  S.handover = S.handover.filter(id => id !== b.id);
  for (const [fid, rid] of S.claims) {
    if (fid === b.id) {
      const r = S.beeById.get(rid);
      if (r && !r.dead) { r.task = "idle"; r.path = []; r.target = { kind: "rest", x: r.x, y: r.y }; }
      S.claims.delete(fid);
    }
    else if (rid === b.id) S.claims.delete(fid);
  }
  S.beeById.delete(b.id);
  if (natural) {
    S.stats.deaths[cause] = (S.stats.deaths[cause] || 0) + 1;
    S.window.push({ tick: S.tick, kind: "bee", cause });
  }
}

// [beeAgents] ein Tick für alle Bienen
function beesStep() {
  S.env.heatersNext = 0; S.env.coolersNext = 0;
  updateRoleAges();
  for (const b of S.bees) {
    if (b.dead) continue;
    b.age++;
    if (chance(mortalityPerTick(b))) { removeBee(b, b.space === "out" ? "Räuber/Krankheit" : "Krankheit"); continue; }
    // Alterstod am Ende eines Arbeitsgangs (untätig, ohne Last) — nicht mitten im Transport
    if (b.age > CFG.AGE_MAX && b.task === "idle" && !b.load && chance(0.3)) { removeBee(b, "Alter"); continue; }
    if (b.space === "hive" && (S.tick + b.id) % CFG.EAT_EVERY === 0) {
      if (b.load && b.load.res === "nectar" && b.load.n > 0) {      // frisst aus der eigenen Last
        b.load.n--; poolConsume("nectar", 1, "Ernährung Bienen"); b.hunger = 0;
        if (b.load.n === 0) {
          b.load = null;
          if (b.task === "handover") { b.task = "idle"; S.handover = S.handover.filter(id => id !== b.id); }
        }
      } else if (withdraw("nectar", 1, "Ernährung Bienen") === 0) { if (++b.hunger >= 4) { removeBee(b, "Hunger"); continue; } }
      else b.hunger = 0;
    }
    if (b.task === "idle" && !b.load) b.role = roleForAge(b.age);
    if (b.task === "handover") { b.waitT++; b.px = b.x; b.py = b.y; b.pspace = b.space; continue; }
    const arrived = moveBee(b);
    if (b.timer > 0) { if (arrived) { work(b); if (--b.timer <= 0) finishTask(b); } continue; }
    if (arrived && b.task !== "idle") arrive(b);
    if (b.task === "idle") {
      if (b.load) { storeLoad(b, b.load.res); continue; }
      if (b.role === "forager") decideForager(b);
      else if (b.role === "worker") decideWorker(b);
      else decideNurse(b);
    }
  }
  if (S.bees.some(b => b.dead)) S.bees = S.bees.filter(b => !b.dead);
  S.env.heaters = S.env.heatersNext; S.env.coolers = S.env.coolersNext;
  const rc = { forager: 0, nurse: 0, worker: 0 };
  for (const b of S.bees) rc[b.role]++;
  S.roleCount = rc;
}
