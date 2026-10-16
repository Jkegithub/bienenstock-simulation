// [resourcePool] drei getrennte Ledger; nur Ereigniszähler, Bestände werden gezählt, nie mitgeführt
function newLedger() {
  const l = () => ({ collected: 0, consumed: 0, byCat: {} });
  return { nectar: l(), pollen: l(), water: l() };
}

// [resourcePool] Eingang einer Ressource (an der Blüte, an der Quelle oder als Anfangsbestand)
function poolCollect(res, n, cat = "Sammelflug") {
  if (n <= 0) return;
  const L = S.ledger[res];
  L.collected += n;
  L.byCat["+" + cat] = (L.byCat["+" + cat] || 0) + n;
  if (S.stress.active) S.stress.collected[res] += n;
}

// [resourcePool] endgültiger Verbrauch mit Kategorie
function poolConsume(res, n, cat) {
  if (n <= 0) return;
  const L = S.ledger[res];
  L.consumed += n;
  L.byCat[cat] = (L.byCat[cat] || 0) + n;
}

// [resourcePool] Bestandslisten einmal pro Tick (Entnahme ohne Vollscan je Biene)
function rebuildStoreLists() {
  const n = [], h = [], p = [];
  for (const c of S.grid.cells) {
    if (c.amount <= 0) continue;
    if (c.state === "nectar") n.push(c); else if (c.state === "honey") h.push(c); else if (c.state === "pollen") p.push(c);
  }
  S.stores = { nectar: n, honey: h, pollen: p };
  const sum = a => a.reduce((s, c) => s + c.amount, 0);
  S.storeTotals = { nectar: sum(n), honey: sum(h), pollen: sum(p), water: S.water };
}

// [resourcePool] entnimmt bis zu n Einheiten aus Zellen bzw. Reserve und verbucht sie als Verbrauch
function withdraw(res, n, cat) {
  let need = n;
  if (res === "water") {
    const t = Math.min(need, S.water); S.water -= t; poolConsume("water", t, cat); return t;
  }
  const lists = res === "nectar" ? [S.stores.nectar, S.stores.honey] : [S.stores.pollen];
  for (const list of lists) {
    for (let i = 0; i < list.length && need > 0; i++) {        // innen zuerst: räumt das Brutnest frei
      const c = list[i];
      // Liste stammt vom Tickanfang: Zelle kann inzwischen geleert und mit anderem Inhalt befüllt sein
      const okState = res === "nectar" ? (c.state === "nectar" || c.state === "honey") : c.state === "pollen";
      if (!okState || c.amount <= 0) continue;
      const t = Math.min(need, c.amount);
      c.amount -= t; need -= t; S.dirty = true;
      if (c.amount === 0) {
        if (c.reservedBy !== null) releaseReservation(c);
        setCellState(c, "empty");
      }
    }
    if (need === 0) break;
  }
  const taken = n - need;
  poolConsume(res, taken, cat);
  return taken;
}

// [resourcePool] Bestand aus Zellen gezählt (für Entscheidungen und selfCheck)
function storedAmount(res) {
  if (res === "water") return S.water;
  let s = 0;
  for (const c of S.grid.cells) {
    if (res === "nectar" && (c.state === "nectar" || c.state === "honey")) s += c.amount;
    else if (res === "pollen" && c.state === "pollen") s += c.amount;
  }
  return s;
}

// [resourcePool] Honigvorrat = Zucker in gedeckelten bzw. reifen Honigzellen
function honeyStock() {
  let s = 0;
  for (const c of S.grid.cells) if (c.state === "honey") s += c.amount;
  return s;
}

// [resourcePool] Last in Transit (Bienen unterwegs, Übergabe, Einlagerung)
function transitAmount(res) {
  let s = 0;
  for (const b of S.bees) if (b.load && b.load.res === res) s += b.load.n;
  return s;
}

// [resourcePool] Reservierung einer Zielzelle lösen
function releaseReservation(c) {
  const b = S.beeById.get(c.reservedBy);
  if (b && b.target && b.target.kind === "cell" && b.target.id === c.id) b.target.reserved = false;
  c.reservedBy = null;
}
