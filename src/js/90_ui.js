// [ui] DOM-Kurzgriff
const $ = id => document.getElementById(id);
const SLIDERS = [["sColony", "colony", "oColony", ""], ["sRes", "res", "oRes", " %"], ["sWeather", "weather", "oWeather", " %"], ["sDisease", "disease", "oDisease", " %"]];
const LAYERS = [["lPaths", "paths"], ["lTemp", "temp"], ["lFlow", "flow"]];
let uiLast = 0;

// [ui] Steuerelemente binden, Legende und Ausbaustufen füllen
function initUI() {
  for (const [id, key, out, unit] of SLIDERS) {
    const el = $(id);
    el.addEventListener("input", () => { $(out).textContent = el.value + unit; if (S) setParam(key, +el.value); });
    el.addEventListener("change", () => { if (S && key === "colony") applyColonyTarget(true); });
    $(out).textContent = el.value + unit;
  }
  for (const [id, key] of LAYERS) $(id).addEventListener("change", () => { S.layers[key] = $(id).checked; S.dirty = true; });
  $("bPause").addEventListener("click", () => { S.paused = !S.paused; syncButtons(); });
  $("bSpeed").addEventListener("click", () => { S.speed = S.speed === 1 ? 2 : 1; syncButtons(); });
  $("bReset").addEventListener("click", resetSim);
  $("bStress").addEventListener("click", () => { if (S.collapsed) return; S.stress.active ? finishStress(false, true) : startStress(); syncButtons(); });
  // Modals schließen nur per Button — ein Klick neben die Box (z. B. zum Aktivieren des Fensters) schließt nicht
  for (const m of ["collapseModal", "reportModal"]) $(m).addEventListener("click", e => { if (e.target.dataset.close !== undefined) $(m).classList.remove("show"); if (e.target.dataset.reset !== undefined) resetSim(); });
  $("bReport").addEventListener("click", () => { if (S.collapsed) $("collapseModal").classList.add("show"); else if (S.lastReport) $("reportModal").classList.add("show"); });
  const chip = (col, label) => `<span><i style="background:${col}"></i>${label}</span>`;
  $("legend").innerHTML =
    Object.keys(STATE_DE).map(k => chip(k === "honey" ? "#f6c45a" : CELL_COL[k], STATE_DE[k].replace(" (gedeckelt)", ""))).join("") +
    Object.keys(ROLE_COL).map(k => `<span><b style="color:${ROLE_COL[k]}">●</b>${ROLE_DE[k]}</span>`).join("") +
    Object.keys(RES_COL).map(k => `<span><b style="color:${RES_COL[k]}">•</b>Last ${k === "nectar" ? "Nektar" : k === "pollen" ? "Pollen" : "Wasser"}</span>`).join("");
  $("stages").innerHTML =
    "<b>1 Kern</b> ✓ vollständig · <b>2 Aufbau</b> ✓ vollständig · <b>3 Layer/Visuelles</b> ✓ vollständig.<br>" +
    "Weggelassen: nichts.<br>Vereinfachungen (bewusst, siehe Design decisions): Königin implizit (keine Agentin), keine Drohnen; " +
    "Wasserreserve als Stockvorrat statt in Zellen; Larvenfütterung zentral mit Pflegekapazität; Temperatur als ein Brutnestwert " +
    "mit radialem Abfall; Koloniegröße-Slider = Zielgröße (Imker setzt zu / entnimmt Ableger).";
}

// [ui] Parameter / Layer aus den Bedienelementen lesen
function readParams() { const p = {}; for (const [id, key] of SLIDERS) p[key] = +$(id).value; return p; }
// [ui]
function readLayers() { const l = {}; for (const [id, key] of LAYERS) l[key] = $(id).checked; return l; }

// [ui] Slider auf den Zustand ziehen (Stress-Test setzt und stellt zurück)
function syncSliders() {
  for (const [id, key, out, unit] of SLIDERS) {
    $(id).value = S.params[key]; $(out).textContent = S.params[key] + unit;
    $(id).disabled = S.stress.active && key !== "colony";
  }
  syncButtons();
}

// [ui] Button-Zustände
function syncButtons() {
  $("bPause").classList.toggle("on", S.paused); $("bPause").textContent = S.paused ? "Weiter" : "Pause";
  $("bSpeed").classList.toggle("on", S.speed === 2);
  $("bStress").textContent = S.stress.active ? "Stress-Test abbrechen" : "Stress-Test";
}

// [ui] Reset: frischer Zustand mit den aktuellen Slider-Werten
function resetSim() {
  const seed = (S ? S.seed : 1) + 1;
  createState(seed, readParams(), readLayers());
  R.cam.s = 0; R.camKey = "";
  for (const m of ["collapseModal", "reportModal"]) $(m).classList.remove("show");
  syncSliders(); renderStats(); renderInspector(); renderLog(); S.logDirty = false;
}

// [ui] periodisches Panel-Update (5×/s)
function uiFrame(now) {
  if (now - uiLast < 200) return;
  uiLast = now;
  renderStats(); renderInspector();
  if (S.logDirty) { renderLog(); S.logDirty = false; }
  syncReportButton();
  if (S.stress.active) $("stressNote").textContent = `Stress-Test läuft: noch ${fmt((S.stress.end - S.tick) * CFG.DAYS_PER_TICK, 1)} Sim-Tage`;
  else $("stressNote").textContent = "";
}

// [ui] Button zum Wiederöffnen von Kollaps-Bericht bzw. Stress-Report
function syncReportButton() {
  const rb = $("bReport");
  rb.hidden = !(S.collapsed || S.lastReport);
  rb.textContent = S.collapsed ? "Kollaps-Bericht" : "Stress-Report";
}

// [ui] Stats-Panel
function renderStats() {
  const C = S.counts, rc = S.roleCount, T = S.storeTotals, st = S.stats;
  const day = S.tick * CFG.DAYS_PER_TICK;
  $("day").textContent = fmt(day, 1); $("tick").textContent = fmt(S.tick);
  $("weather").textContent = S.env.weather; $("tout").textContent = fmt(S.env.tOut, 1) + " °C";
  $("thive").textContent = fmt(S.env.tHive, 1) + " °C"; $("thive").style.color = Math.abs(S.env.tHive - CFG.T_TARGET) > 3 ? "var(--pollen)" : "";
  const brood = C.egg + C.larva + C.pupa;
  $("kPop").textContent = fmt(S.bees.length); $("kHoney").textContent = fmt(T.honey); $("kBrood").textContent = fmt(brood);
  const nectarCells = S.stores.nectar, avgW = nectarCells.length ? nectarCells.reduce((s, c) => s + c.water, 0) / nectarCells.length : 0;
  const winDeaths = S.window.filter(e => e.kind === "bee").length;
  const deathsTot = Object.values(st.deaths).reduce((a, b) => a + b, 0);
  const broodTot = Object.values(st.broodDeaths).reduce((a, b) => a + b, 0);
  const causes = o => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(", ") || "—";
  const row = (k, v, id = "") => `<tr><th>${k}</th><td class="n"${id ? ` id="${id}"` : ""}>${v}</td></tr>`;
  $("stats").innerHTML =
    `<tr><th colspan=2 style="color:var(--wax)">Population nach Rolle</th></tr>` +
    row("Sammlerinnen", fmt(rc.forager)) + row("Brutpflege", fmt(rc.nurse)) + row("Arbeiterinnen", fmt(rc.worker)) +
    `<tr><th colspan=2 style="color:var(--wax)">Brut nach Phase</th></tr>` +
    row("Eier", fmt(C.egg), "stEgg") + row("Larven", fmt(C.larva), "stLarva") + row("Puppen", fmt(C.pupa), "stPupa") +
    `<tr><th colspan=2 style="color:var(--wax)">Vorräte (Einheiten)</th></tr>` +
    row("Honig (gedeckelt)", `${fmt(T.honey)} · ${C.honey} Z.`) +
    row("Nektar reifend", `${fmt(T.nectar)} · ${C.nectar} Z. · Ø ${fmt(avgW, 0)} % H₂O`) +
    row("Pollen", `${fmt(T.pollen)} · ${C.pollen} Z.`) + row("Wasserreserve", fmt(S.water)) +
    `<tr><th colspan=2 style="color:var(--wax)">Leistung</th></tr>` +
    row("Sammel-Effizienz", st.trips ? `${fmt(st.tripUnits / st.trips, 1)} Einh./Flug · ${fmt(st.tripsOk / st.trips * 100)} % mit Last` : "—") +
    row("Honigzellen gereift", fmt(st.ripened)) +
    row("Sterblichkeit (5 Tage)", `${fmt(winDeaths / Math.max(1, S.bees.length) * 100, 1)} %`) +
    row("Tote gesamt", `${fmt(deathsTot)} (${causes(st.deaths)})`) +
    row("Brutverluste", `${fmt(broodTot)} (${causes(st.broodDeaths)})`) +
    row("Geschlüpft", fmt(st.births)) +
    row("Klima", `${S.env.heaters} heizen · ${S.env.coolers} kühlen`) +
    row("Zellen", `${fmt(S.grid.cells.length)} / ${fmt(CFG.MAX_CELLS)}`);
  $("capNote").textContent = S.grid.capReached ? "Obergrenze 1.200 Zellen erreicht — kein Wabenwachstum mehr." : "";
}

// [ui] Zell-Inspektor (live)
function renderInspector() {
  const box = $("inspector");
  if (S.selected === null || !S.grid.cells[S.selected]) { box.innerHTML = '<span class="empty">Zelle im Wabenbild anklicken.</span>'; return; }
  const c = S.grid.cells[S.selected];
  const cap = CFG.CELL_CAP[c.state === "honey" ? "nectar" : c.state];
  const brood = c.state === "egg" || c.state === "larva" || c.state === "pupa";
  const dur = { egg: CFG.EGG_T, larva: CFG.LARVA_T, pupa: CFG.PUPA_T }[c.state];
  const age = S.tick - c.since;
  const b = c.bee !== null ? S.beeById.get(c.bee) : null;
  const none = c.state === "empty" ? "—" : c.state === "egg" ? "— (Königin)" : brood ? "— (noch nicht gepflegt)" : "— (Startbestand)";
  const beeTxt = c.bee === null ? none : b ? `#${b.id} · ${ROLE_DE[b.role]} · ${fmt(b.age * CFG.DAYS_PER_TICK, 1)} Tage · ${b.task}` : `#${c.bee} (lebt nicht mehr)`;
  const row = (k, v) => `<tr><th>${k}</th><td class="n">${v}</td></tr>`;
  box.innerHTML = `<table>` +
    row("Zelle", `#${c.id} · Ring ${c.ring}`) +
    row("Zustand", STATE_DE[c.state]) +
    row("Füllgrad", cap ? `${c.amount} / ${cap} (${fmt(c.amount / cap * 100)} %)` : brood ? `Entwicklung ${fmt(Math.min(100, age / dur * 100))} %` : "—") +
    row("Wassergehalt", c.state === "nectar" || c.state === "honey" ? `${fmt(c.water, 1)} %` : "—") +
    row("Alter des Inhalts", c.state === "empty" ? "—" : `${fmt(age * CFG.DAYS_PER_TICK, 1)} Tage (${age} Ticks)`) +
    row("Zuständige Biene", beeTxt) +
    (c.state === "nectar" || c.state === "honey" ? row("Nektarphase / Fächeln", `${c.wasNectar ? "ja" : "nein"} / ${c.fanTicks} Ticks`) : "") +
    (c.state === "larva" ? row("Unterversorgt", c.starve ? `${c.starve} Ticks` : "nein") : "") +
    `</table>`;
}

// [ui] Ereignislog
function renderLog() {
  $("log").innerHTML = S.log.slice(-90).reverse().map(e => `<div class="${e.kind}"><span class="t">T${fmt(e.tick * CFG.DAYS_PER_TICK, 1)} ·</span> ${e.text}</div>`).join("");
}

// [ui] Inline-SVG: Bienen, Zucker, Brut je auf eigenes Maximum skaliert; Regentage als Bänder
function trendSvg(D) {
  const W = 580, H = 150, padL = 4, padR = 4, padT = 8, padB = 20;
  const x = i => padL + i * (W - padL - padR) / Math.max(1, D.length - 1);
  const series = [["pop", "Bienen", "var(--cream)"], ["sugar", "Zucker", "var(--honey)"], ["brood", "Brut", "var(--cool)"]];
  const bw = (W - padL - padR) / Math.max(1, D.length - 1);
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;background:rgba(0,0,0,.25);border:1px solid var(--line);border-radius:3px">`;
  D.forEach((d, i) => { if (d.rain > 0) s += `<rect x="${x(i) - bw / 2}" y="${padT}" width="${bw}" height="${H - padT - padB}" fill="rgba(79,179,217,${(0.35 * d.rain).toFixed(2)})"/>`; });
  const legend = [];
  for (const [k, label, col] of series) {
    const max = Math.max(1, ...D.map(d => d[k]));
    const pts = D.map((d, i) => `${x(i).toFixed(1)},${(padT + (1 - d[k] / max) * (H - padT - padB)).toFixed(1)}`).join(" ");
    s += `<polyline points="${pts}" fill="none" stroke="${col}" stroke-width="2"/>`;
    legend.push(`<tspan fill="${col}">● ${label} (max ${fmt(max)})</tspan>`);
  }
  s += `<text x="${padL}" y="${H - 5}" font-size="11" font-family="SourceCode, monospace" fill="var(--muted)">Tag ${fmt(D[0].day)}</text>`;
  s += `<text x="${W - padR}" y="${H - 5}" font-size="11" text-anchor="end" font-family="SourceCode, monospace" fill="var(--muted)">Tag ${fmt(D[D.length - 1].day)}</text>`;
  s += `<text x="${W / 2}" y="${H - 5}" font-size="11" text-anchor="middle" font-family="SourceCode, monospace">${legend.join("  ")} <tspan fill="var(--cool)">▮ Regen</tspan></text>`;
  return s + "</svg>";
}

// [ui] Kollaps-Modal mit Ursachenkette
function showCollapse(reason, chain) {
  const f = chain.first, l = chain.last;
  const tr = (k, a, b) => `<tr><th>${k}</th><td class="n">${a}</td><td class="n">${b}</td></tr>`;
  $("collapseBox").innerHTML =
    `<h2>Kolonie kollabiert</h2><p class="warn">${reason} — Tag ${fmt(S.tick * CFG.DAYS_PER_TICK, 1)}, Tick ${S.tick}. Simulation angehalten.</p>` +
    (chain.days.length > 1 ? `<h2 style="font-size:16px">Vorgeschichte (letzte ${chain.days.length} Tage)</h2>` + trendSvg(chain.days) +
      `<ul style="padding-left:18px;margin:6px 0 12px">${chain.long.map(t => `<li>${t}</li>`).join("")}</ul>` : "") +
    `<h2 style="font-size:16px">Ursachenkette (letzte ${CFG.HISTORY} Ticks)</h2><ol>` +
    chain.items.map(i => `<li><span style="color:var(--muted)">T${fmt(i.tick * CFG.DAYS_PER_TICK, 1)}</span> ${i.text}</li>`).join("") + `</ol>` +
    `<table><tr><th></th><th>Tick ${f.tick}</th><th>Tick ${l.tick}</th></tr>` +
    tr("Bienen", f.pop, l.pop) + tr("Brut", f.brood, l.brood) + tr("Honig", f.honey, l.honey) + tr("Nektar", f.nectar, l.nectar) +
    tr("Pollen", f.pollen, l.pollen) + tr("Wasser", f.water, l.water) + tr("Brutnest °C", fmt(f.tHive, 1), fmt(l.tHive, 1)) + tr("Wetter", f.weather, l.weather) +
    `</table><div class="btns"><button data-reset>Reset</button><button data-close>Schließen</button></div>`;
  $("collapseModal").classList.add("show");
}

// [ui] Ergebnisreport des Stress-Tests
function showReport(r) {
  const row = (k, v) => `<tr><th>${k}</th><td class="n">${v}</td></tr>`;
  const loss = r.honey0 - r.honey1;
  $("reportBox").innerHTML =
    `<h2>Stress-Test: ${r.result}</h2><p class="note">Wetterstabilität 10 %, Blütenverfügbarkeit 10 %, Krankheitsdruck 80 % — ${fmt(r.days, 1)} Sim-Tage. Slider sind zurückgestellt.</p><table>` +
    row("Ergebnis", `<b class="${r.result === "überlebt" ? "pass" : "failc"}">${r.result}</b>`) +
    row("Honigverlust", `${fmt(loss)} Einh. (${fmt(r.honey0)} → ${fmt(r.honey1)}${r.honey0 ? ", " + fmt(loss / r.honey0 * 100) + " %" : ""})`) +
    row("Zucker gesamt", `${fmt(r.sugar0)} → ${fmt(r.sugar1)}`) +
    row("Sterblichkeit", `${fmt(r.mortality, 1)} % (${r.deaths} Tote / ${r.pop0} + ${r.births} geschlüpft)`) +
    row("Population", `${r.pop0} → ${r.pop1}`) + row("Brut", `${r.brood0} → ${r.brood1} (${r.broodDeaths} Brutverluste)`) +
    row("Gesammelt", `Nektar ${r.collected.nectar} · Pollen ${r.collected.pollen} · Wasser ${r.collected.water}`) +
    `</table><div class="btns"><button data-close>Schließen</button></div>`;
  $("reportModal").classList.add("show");
  S.lastReport = true;
}
