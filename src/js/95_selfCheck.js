// [selfCheck] Ergebnisse; S5/S6 stammen aus der Startprüfung, S1–S4 werden laufend neu berechnet
const CHK = { s5: null, s6: null, last: [] };

// [selfCheck] Ist das Ziel einer Biene gültig und innerhalb von Gitter bzw. Wiese?
function targetValid(b) {
  const t = b.target, n = S.grid.cells.length;
  if (!t) return false;
  let ok;
  switch (t.kind) {
    case "cell": ok = Number.isInteger(t.id) && t.id >= 0 && t.id < n; break;
    case "patch": ok = !!S.env.patches[t.id]; break;
    case "entrance": ok = true; break;
    case "bee": ok = S.beeById.has(t.id); break;
    case "site": ok = n < CFG.MAX_CELLS; break;
    case "rest": ok = true; break;
    default: ok = false;
  }
  const e = S.grid.extent, m = 60;
  const inB = b.space === "hive"
    ? b.x >= e.minX - m && b.x <= S.grid.entrance.x + m && b.y >= e.minY - m && b.y <= e.maxY + m
    : b.x >= -60 && b.x <= 1100 && b.y >= -450 && b.y <= 450;
  return ok && inB;
}

// [selfCheck] S1–S4: Invarianten über den laufenden Zustand
function invariantRows() {
  const rows = [];
  // S1 Ressourcenbilanz — Ereigniszähler gegen frisch gezählte Bestände
  const parts = [], bad = [];
  for (const res of ["nectar", "pollen", "water"]) {
    const L = S.ledger[res], st = storedAmount(res), tr = transitAmount(res);
    const ok = L.collected === st + L.consumed + tr;
    parts.push(`${RES_DE[res]}: ${L.collected} ${ok ? "=" : "≠"} ${st} + ${L.consumed} + ${tr}`);
    if (!ok) bad.push(res);
  }
  rows.push({ id: "S1", name: "Ressourcenbilanz", ok: !bad.length, detail: parts.join(" · ") + " (gesammelt = eingelagert + verbraucht + Transit)" });
  // S2 Honig-Herkunft
  let noNectar = 0;
  for (const c of S.grid.cells) if (c.state === "honey" && !(c.wasNectar && c.fanTicks > 0)) noNectar++;
  rows.push({ id: "S2", name: "Honig-Herkunft", ok: noNectar === 0 && S.honeyGuardHits === 0, detail: `Honigzellen ohne Nektarphase: ${noNectar}, blockierte Sprünge: ${S.honeyGuardHits}, Honigzellen gesamt: ${S.counts.honey}` });
  // S3 Brut-Konsistenz — angezeigte Zahlen im Stats-Panel gegen Zellscan
  renderStats();
  const num = id => parseInt($(id).textContent.replace(/\./g, ""), 10);
  const shown = { egg: num("stEgg"), larva: num("stLarva"), pupa: num("stPupa") }, scan = { egg: 0, larva: 0, pupa: 0 };
  for (const c of S.grid.cells) if (c.state in scan) scan[c.state]++;
  const s3 = ["egg", "larva", "pupa"].every(k => shown[k] === scan[k]);
  rows.push({ id: "S3", name: "Brut-Konsistenz", ok: s3, detail: `Panel E/L/P ${shown.egg}/${shown.larva}/${shown.pupa} vs. Zellen ${scan.egg}/${scan.larva}/${scan.pupa}` });
  // S4 Agenten-Integrität
  const badB = S.bees.filter(b => !CFG.ROLES.includes(b.role) || !targetValid(b));
  const rc = S.roleCount, sum = rc.forager + rc.nurse + rc.worker;
  rows.push({ id: "S4", name: "Agenten-Integrität", ok: !badB.length && sum === S.bees.length, detail: `${S.bees.length} Bienen, ungültig: ${badB.length}${badB.length ? " (#" + badB.slice(0, 4).map(b => b.id + ":" + b.task).join(", #") + ")" : ""}, Rollensumme ${sum}` });
  return rows;
}

// [selfCheck] laufende Prüfung + Anzeige
function runInvariants() {
  const rows = invariantRows();
  rows.push(CHK.s5 || { id: "S5", name: "Takt", ok: null, detail: "misst 1 s nach Start …" });
  rows.push(CHK.s6 || { id: "S6", name: "UI-Bindung", ok: null, detail: "…" });
  CHK.last = rows;
  renderChecks(rows);
  return rows;
}

// [selfCheck] Tabelle, Badge und Fail-Banner
function renderChecks(rows) {
  $("checks").innerHTML = rows.map(r => `<tr><td>${r.id}</td><td>${r.name}</td><td class="${r.ok === null ? "" : r.ok ? "pass" : "failc"}">${r.ok === null ? "…" : r.ok ? "PASS" : "FAIL"}</td></tr>` +
    `<tr><td></td><td colspan=2 class="note" style="margin:0">${r.detail}</td></tr>`).join("");
  const fails = rows.filter(r => r.ok === false);
  const banner = $("failBanner");
  banner.classList.toggle("show", fails.length > 0);
  banner.innerHTML = fails.map(r => `<b>Invariante verletzt: ${r.id} ${r.name}</b><br>${r.detail}`).join("<br>");
  const done = rows.filter(r => r.ok !== null).length, pass = rows.filter(r => r.ok).length;
  const badge = $("checkBadge");
  badge.className = "badge " + (fails.length ? "fail" : "ok");
  const pending = rows.length - done;
  badge.textContent = (fails.length ? `selfCheck FAIL: ${fails.map(r => r.id).join(", ")}` : `selfCheck ${pass}/${done} PASS`) + (pending ? ` · ${pending} ausstehend` : "");
  $("checkNote").textContent = `Letzte Prüfung: Tick ${S.tick} (S1–S4 alle 20 Ticks neu; S5/S6 beim Start).`;
}

// [selfCheck] S6: jedes Bedienelement an einem Wegwerfzustand auslösen und Wirkung messen
function runUiTest() {
  const out = [];
  const t = (name, fn) => { try { const [ok, d] = fn(); out.push({ name, ok, d }); } catch (e) { out.push({ name, ok: false, d: "Fehler: " + e.message }); } };
  const slide = (id, v) => { const el = $(id); el.value = v; el.dispatchEvent(new Event("input")); el.dispatchEvent(new Event("change")); };
  t("Koloniegröße", () => { const p0 = S.bees.length, v0 = +$("sColony").value; slide("sColony", v0 + 25); const p1 = S.bees.length; slide("sColony", v0); return [p1 === p0 + 25 && S.bees.length === p0, `Bienen ${p0}→${p1}→${S.bees.length}`]; });
  t("Ressourcen", () => { const v0 = +$("sRes").value, p = S.env.patches[0], a = flowerRegen(p); slide("sRes", 0); const b = flowerRegen(p); slide("sRes", v0); return [a > 0 && b === 0, `Nachwuchs ${a.toFixed(5)}→${b}`]; });
  t("Wetterstabilität", () => { const v0 = +$("sWeather").value, a = weatherChangeProb("Sonne"); slide("sWeather", 0); const b = weatherChangeProb("Sonne"); slide("sWeather", v0); return [b > a && weatherChangeProb("Sonne") === a, `Wechsel-p bei Sonne ${a.toFixed(3)}→${b.toFixed(3)}`]; });
  t("Krankheitsdruck", () => { const v0 = +$("sDisease").value, bee = S.bees[0], a = mortalityPerTick(bee); slide("sDisease", 100); const b = mortalityPerTick(bee); slide("sDisease", v0); return [b > a, `Sterbe-p ${a.toFixed(5)}→${b.toFixed(5)}`]; });
  t("Pause", () => { $("bPause").click(); const t0 = S.tick, ran = simTick(); const ok = S.paused && !ran && S.tick === t0; $("bPause").click(); return [ok && !S.paused && simTick(), `Tick eingefroren bei ${t0}, danach weiter`]; });
  t("2×", () => { $("bSpeed").click(); const a = S.speed; $("bSpeed").click(); return [a === 2 && S.speed === 1, `Ticks/s ${CFG.TICKS_PER_SEC}→${CFG.TICKS_PER_SEC * a}`]; });
  t("Stress-Test", () => { $("bStress").click(); const p = { ...S.params }, act = S.stress.active; $("bStress").click(); return [act && p.weather === 10 && p.res === 10 && p.disease === 80 && !S.stress.active && S.params.disease !== 80, `aktiv ${act}, Werte ${p.weather}/${p.res}/${p.disease}, zurückgestellt`]; });
  for (const [id, key] of LAYERS) t("Layer " + key, () => { const a = S.layers[key]; $(id).click(); const b = S.layers[key]; $(id).click(); return [b === !a && S.layers[key] === a, `${a}→${b}→${S.layers[key]}`]; });
  t("Bericht", () => { S.collapsed = true; syncReportButton(); const vis = !$("bReport").hidden; $("bReport").click(); const open = $("collapseModal").classList.contains("show");
    $("collapseModal").classList.remove("show"); S.collapsed = false; syncReportButton(); return [vis && open && $("bReport").hidden, `sichtbar ${vis}, öffnet ${open}, danach verborgen`]; });
  t("Reset", () => { simTick(); simTick(); const old = S, t0 = S.tick; $("bReset").click(); return [S !== old && S.tick === 0 && t0 > 0, `Tick ${t0}→${S.tick}, neuer Zustand`]; });
  return out;
}

// [selfCheck] Startprüfung: S6 auf Wegwerfzustand, dann frischer Zustand, S1–S4 sofort, S5 nach 1 s
function runStartupCheck() {
  const ui = runUiTest();
  const okAll = ui.every(r => r.ok);
  CHK.s6 = { id: "S6", name: "UI-Bindung", ok: okAll, detail: ui.map(r => `${r.ok ? "✓" : "✗"} ${r.name} (${r.d})`).join(" · ") };
  createState(20261016, readParams(), readLayers());
  syncSliders();
  logEvent(`selfCheck UI: ${ui.filter(r => r.ok).length}/${ui.length} Bedienelemente wirken messbar.`, okAll ? "sys" : "bad");
  runInvariants();
  // Die Sekunde beginnt mit dem ersten gezeichneten Frame: Ein im Hintergrund geladener Tab rendert nicht,
  // dann wäre "0 Frames" eine Aussage über die Sichtbarkeit, nicht über den Takt.
  requestAnimationFrame(() => {
    const t0 = S.tick, f0 = S.frames, st = S;
    setTimeout(() => {
      if (S !== st) return;                    // Reset innerhalb der Sekunde: Messung verworfen
      const dt = S.tick - t0, df = S.frames - f0;
      CHK.s5 = { id: "S5", name: "Takt", ok: dt > 5 && df > 20, detail: `1 s ab erstem Frame: ${dt} Ticks (> 5), ${df} Frames (> 20)${document.hidden ? " — Tab war verborgen" : ""}` };
      runInvariants();
    }, 1000);
  });
}

// [sim] Einstieg
boot();
