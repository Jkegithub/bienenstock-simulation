// [hexGrid] Richtungen im axialen System
const HEX_DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const SQ3 = Math.sqrt(3);

// [hexGrid] alle Zellkoordinaten bis maxCells in Spiralreihenfolge (Ring für Ring)
function hexSpiral(maxCells) {
  const out = [[0, 0, 0]];
  for (let k = 1; out.length < maxCells; k++) {
    let q = HEX_DIRS[4][0] * k, r = HEX_DIRS[4][1] * k;
    for (let d = 0; d < 6; d++) {
      for (let i = 0; i < k; i++) {
        out.push([q, r, k]);
        q += HEX_DIRS[d][0]; r += HEX_DIRS[d][1];
      }
    }
  }
  return out.slice(0, maxCells);
}
const SPIRAL = hexSpiral(CFG.MAX_CELLS);

// [hexGrid] axial -> Wabenkoordinaten (Spitze oben)
function hexToXY(q, r) { return { x: CFG.HEX * SQ3 * (q + r / 2), y: CFG.HEX * 1.5 * r }; }

// [hexGrid] Wabenkoordinaten -> axial (Würfel-Rundung)
function xyToHex(x, y) {
  const qf = (SQ3 / 3 * x - y / 3) / CFG.HEX, rf = (2 / 3 * y) / CFG.HEX, sf = -qf - rf;
  let q = Math.round(qf), r = Math.round(rf); const s = Math.round(sf);
  const dq = Math.abs(q - qf), dr = Math.abs(r - rf), ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s; else if (dr > ds) r = -q - s;
  return { q, r };
}

// [hexGrid] leeres Gitter
function newGrid() { return { cells: [], index: new Map(), extent: { minX: 0, maxX: 0, minY: 0, maxY: 0 }, entrance: { x: 0, y: 0 }, capReached: false }; }

// [hexGrid] neue Zelle an der nächsten Spiralposition; false an der Obergrenze
function growCell(builderId) {
  const g = S.grid;
  if (g.cells.length >= CFG.MAX_CELLS) {
    if (!g.capReached) { g.capReached = true; logEvent("Wabengitter hat die Obergrenze von 1.200 Zellen erreicht — kein weiteres Wachstum.", "sys"); }
    return false;
  }
  const [q, r, ring] = SPIRAL[g.cells.length];
  const p = hexToXY(q, r);
  const c = {
    id: g.cells.length, q, r, ring, x: p.x, y: p.y,
    state: "empty", amount: 0, water: 0, since: S.tick,
    wasNectar: false, fanTicks: 0, starve: 0,
    bee: builderId ?? null, reservedBy: null, fanner: null, built: S.tick,
  };
  g.cells.push(c);
  g.index.set(q + "," + r, c.id);
  S.counts.empty++;
  const e = g.extent;
  e.minX = Math.min(e.minX, p.x - CFG.HEX); e.maxX = Math.max(e.maxX, p.x + CFG.HEX);
  e.minY = Math.min(e.minY, p.y - CFG.HEX); e.maxY = Math.max(e.maxY, p.y + CFG.HEX);
  g.entrance = { x: e.maxX + CFG.HEX * 1.6, y: e.maxY * 0.45 };
  S.dirty = true;
  return true;
}

// [hexGrid] Zelle an Wabenkoordinate oder null
function cellAt(x, y) {
  const h = xyToHex(x, y);
  const id = S.grid.index.get(h.q + "," + h.r);
  return id === undefined ? null : S.grid.cells[id];
}

// [hexGrid] einzige Stelle, die Zellzustände ändert — führt die Zähler mit und bewacht die Honigkette
function setCellState(c, state) {
  if (c.state === state) return true;
  if (state === "honey" && !(c.state === "nectar" && c.wasNectar && c.fanTicks > 0 && c.water < CFG.HONEY_WATER)) {
    S.honeyGuardHits++;
    logEvent(`FEHLER: Zelle #${c.id} sollte ohne Nektarphase zu Honig werden — blockiert.`, "bad");
    return false;
  }
  S.counts[c.state]--;
  S.counts[state]++;
  c.state = state;
  c.since = S.tick;
  if (state === "empty") { c.amount = 0; c.water = 0; c.wasNectar = false; c.fanTicks = 0; c.starve = 0; c.fanner = null; c.bee = null; }
  if (state === "nectar") { c.wasNectar = true; }
  S.dirty = true;
  return true;
}

// [hexGrid] beste Zelle nach Bewertungsfunktion (kleinster Wert), ohne Reservierung
function bestCell(filter, score) {
  let best = null, bs = Infinity;
  for (const c of S.grid.cells) {
    if (c.reservedBy !== null || !filter(c)) continue;
    const s = score(c) + rnd() * 0.8;
    if (s < bs) { bs = s; best = c; }
  }
  return best;
}

// [hexGrid] Radius des Brutnests: feste 55 % des aktuellen Wabenradius (Brut innen, Pollenkranz, Honig außen).
// Nicht aus der äußersten Brutzelle abgeleitet — eine einzelne verirrte Brutzelle würde sonst die Zone aufblähen.
function broodRadius() {
  const cells = S.grid.cells, maxRing = cells.length ? cells[cells.length - 1].ring : 1;
  let rNeed = 1;                                   // kleinster Ring, innerhalb dessen ~0,6 × Zielgröße Zellen liegen
  while (1 + 3 * rNeed * (rNeed + 1) < S.params.colony * 0.6) rNeed++;
  return Math.max(2, Math.min(maxRing - 1, Math.max(Math.floor(maxRing * 0.55), rNeed)));
}

// [hexGrid] Anteil freier, unreservierter Zellen
function freeCellCount() {
  let n = 0;
  for (const c of S.grid.cells) if (c.state === "empty" && c.reservedBy === null) n++;
  return n;
}
