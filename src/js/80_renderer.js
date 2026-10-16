// [renderer] Zustand der Darstellung
const R = { cv: null, ctx: null, comb: null, cctx: null, w: 0, h: 0, dpr: 1, cam: { s: 0, cx: 0, cy: 0 }, camKey: "", lastComb: -1 };
const CELL_COL = {
  empty: "#3a2614", egg: "#d6dde0", larva: "#f6e6bc", pupa: "#9a6431",
  pollen: "#ff5d1f", nectar: "#ffe189", honey: "#f5a623",
};
const RES_COL = { nectar: "#ffd86b", pollen: "#ff5d1f", water: "#4fb3d9" };
const ROLE_COL = { forager: "#ffb347", nurse: "#f7ead0", worker: "#c58a3c" };

// [renderer] Canvas einrichten
function initRenderer() {
  R.cv = document.getElementById("view");
  R.ctx = R.cv.getContext("2d");
  R.comb = document.createElement("canvas");
  R.cctx = R.comb.getContext("2d");
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
  R.cv.addEventListener("click", onCanvasClick);
}

// [renderer] Größe an Container und Pixeldichte anpassen
function resizeCanvas() {
  const r = R.cv.getBoundingClientRect();
  R.dpr = Math.min(2, window.devicePixelRatio || 1);
  R.w = Math.max(200, r.width); R.h = Math.max(200, r.height);
  for (const c of [R.cv, R.comb]) { c.width = Math.round(R.w * R.dpr); c.height = Math.round(R.h * R.dpr); }
  R.camKey = ""; if (S) S.dirty = true;
}

// [renderer] Wabenkamera: aktuelles Gitter in die linke Bildhälfte einpassen (weich nachgeführt)
function updateCamera() {
  const e = S.grid.extent, regionW = R.w * (R.w < 700 ? 0.6 : 0.66);
  const ex0 = e.minX - 14, ex1 = S.grid.entrance.x + 10, ey0 = e.minY - 14, ey1 = e.maxY + 14;
  const target = Math.min((regionW - 30) / (ex1 - ex0), (R.h - 90) / (ey1 - ey0), 5);
  const c = R.cam;
  if (!c.s) c.s = target;
  c.s += (target - c.s) * 0.08;
  c.cx = 24 + (regionW - 30 - (ex1 - ex0) * c.s) / 2 - ex0 * c.s;
  c.cy = R.h / 2 - (ey0 + ey1) / 2 * c.s - 8;
  const key = c.s.toFixed(3) + "|" + R.w + "|" + R.h;
  if (key !== R.camKey) { R.camKey = key; S.dirty = true; }
}

// [renderer] Welt -> Bildschirm (Innenraum über Kamera, Außenraum ab dem Flugloch)
function toScreen(x, y, space) {
  const c = R.cam;
  if (space === "hive") return [c.cx + x * c.s, c.cy + y * c.s];
  const E = toScreen(S.grid.entrance.x, S.grid.entrance.y, "hive");
  const so = Math.min((R.w - E[0] - 26) / 1000, (R.h / 2 - 34) / 380);
  return [E[0] + 14 + x * so, E[1] + y * so];
}

// [renderer] Bildschirm -> Wabenkoordinate
function fromScreen(px, py) { return { x: (px - R.cam.cx) / R.cam.s, y: (py - R.cam.cy) / R.cam.s }; }

// [renderer] Sechseck-Pfad
function hexPath(g, x, y, r) {
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 180 * (60 * i - 30);
    i ? g.lineTo(x + r * Math.cos(a), y + r * Math.sin(a)) : g.moveTo(x + r * Math.cos(a), y + r * Math.sin(a));
  }
  g.closePath();
}

// [renderer] Farbe zwischen zwei RGB-Tripeln
function mix(a, b, t) { return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`; }

// [renderer] Temperatur -> Farbe (kühl blau, Ziel bernstein, heiß rot)
function tempColor(t) {
  if (t < CFG.T_TARGET) return mix([79, 179, 217], [245, 166, 35], clamp((t - 26) / (CFG.T_TARGET - 26), 0, 1));
  return mix([245, 166, 35], [255, 40, 30], clamp((t - CFG.T_TARGET) / 5, 0, 1));
}

// [renderer] Waben in den Offscreen-Cache zeichnen (nur bei Änderung oder während des Aufbaus)
function drawComb(reveal) {
  const g = R.cctx, s = R.cam.s, cells = S.grid.cells;
  g.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
  g.clearRect(0, 0, R.w, R.h);
  // Rahmen (Holz) um das Gitter
  const e = S.grid.extent, [x0, y0] = toScreen(e.minX - 12, e.minY - 12, "hive"), [x1, y1] = toScreen(S.grid.entrance.x, e.maxY + 12, "hive");
  g.fillStyle = "rgba(10,6,3,.55)"; g.strokeStyle = "#5a3a1c"; g.lineWidth = 3;
  g.beginPath(); g.roundRect(x0, y0, x1 - x0, y1 - y0, 8); g.fill(); g.stroke();
  const r = CFG.HEX * s * 0.93, small = r < 4.5;
  const br = broodRadius(), maxRing = cells.length ? cells[cells.length - 1].ring : 1;
  const n = Math.floor(cells.length * reveal);
  for (let i = 0; i < n; i++) {
    const c = cells[i], [x, y] = toScreen(c.x, c.y, "hive");
    const grow = reveal < 1 ? clamp((reveal * cells.length - i) / 6, 0, 1) : 1;
    const rr = r * grow;
    hexPath(g, x, y, rr);
    g.fillStyle = c.state === "nectar" || c.state === "pollen" ? "#3f2812" : CELL_COL[c.state];
    if (c.state === "honey") g.fillStyle = "#e8961c";
    g.fill();
    if (!small) { g.strokeStyle = "rgba(233,201,139,.22)"; g.lineWidth = 1; g.stroke(); }
    if (c.state === "nectar") {
      const f = Math.sqrt(c.amount / CFG.CELL_CAP.nectar);
      hexPath(g, x, y, rr * (0.35 + 0.6 * f));
      g.fillStyle = mix([255, 244, 196], [255, 190, 50], clamp((CFG.NECTAR_WATER_IN - c.water) / (CFG.NECTAR_WATER_IN - CFG.HONEY_WATER), 0, 1));
      g.fill();
    } else if (c.state === "pollen") {
      hexPath(g, x, y, rr * (0.35 + 0.6 * Math.sqrt(c.amount / CFG.CELL_CAP.pollen)));
      g.fillStyle = CELL_COL.pollen; g.fill();
    } else if (c.state === "honey" && !small) {
      hexPath(g, x, y, rr * 0.72); g.fillStyle = "#f6c45a"; g.fill();
      g.fillStyle = "rgba(255,255,255,.25)"; g.beginPath(); g.arc(x - rr * 0.25, y - rr * 0.25, rr * 0.18, 0, 7); g.fill();
    } else if (c.state === "pupa" && !small) {
      hexPath(g, x, y, rr * 0.7); g.fillStyle = "#b9824a"; g.fill();
    } else if (c.state === "egg" && !small) {
      hexPath(g, x, y, rr); g.fillStyle = "#2b1b0d"; g.fill();
      g.fillStyle = "#f4f1e8"; g.beginPath(); g.ellipse(x, y, rr * 0.16, rr * 0.36, 0.5, 0, 7); g.fill();
    } else if (c.state === "larva" && !small) {
      hexPath(g, x, y, rr); g.fillStyle = "#2b1b0d"; g.fill();
      const k = 0.3 + 0.35 * clamp((S.tick - c.since) / CFG.LARVA_T, 0, 1);
      g.strokeStyle = c.starve ? "#ff8a5c" : "#fbefcf"; g.lineWidth = Math.max(1, rr * 0.28); g.lineCap = "round";
      g.beginPath(); g.arc(x, y, rr * k, 0.4, 5.2); g.stroke();
    }
    if (S.layers.temp) {
      hexPath(g, x, y, rr); g.globalAlpha = 0.55; g.fillStyle = tempColor(cellTemp(c, br, maxRing)); g.fill(); g.globalAlpha = 1;
    }
  }
  // Flugloch
  const [ex, ey] = toScreen(S.grid.entrance.x, S.grid.entrance.y, "hive");
  g.fillStyle = "#0b0603"; g.fillRect(ex - 5, ey - 9, 12, 18);
  g.strokeStyle = "#e9c98b"; g.lineWidth = 1.5; g.strokeRect(ex - 5, ey - 9, 12, 18);
  S.dirty = false;
}

// [renderer] Wiese: Himmel nach Wetter, Blütenfelder mit Füllstand, Tränke, Regen
function drawMeadow(g, now) {
  const [ex, ey] = toScreen(0, 0, "out"), so = toScreen(1, 0, "out")[0] - ex;
  const x0 = ex - 4, y0 = 16, w = R.w - x0 - 12, h = R.h - 32;
  const sky = { Sonne: ["#3b2a12", "#5c4316"], "Bewölkt": ["#2b2621", "#45392b"], Regen: ["#141c24", "#25303a"] }[S.env.weather];
  const gr = g.createLinearGradient(0, y0, 0, y0 + h);
  gr.addColorStop(0, sky[0]); gr.addColorStop(1, sky[1]);
  g.fillStyle = gr; g.beginPath(); g.roundRect(x0, y0, w, h, 10); g.fill();
  g.strokeStyle = "rgba(233,201,139,.18)"; g.lineWidth = 1; g.stroke();
  g.save(); g.beginPath(); g.roundRect(x0, y0, w, h, 10); g.clip();
  g.strokeStyle = "rgba(120,140,50,.10)"; g.lineWidth = 1;
  for (let y = y0 + 20; y < y0 + h; y += 14) { g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + w, y + 6); g.stroke(); }
  if (S.env.weather === "Regen") {
    g.strokeStyle = "rgba(160,200,230,.35)";
    const t = now / 1000;
    for (let i = 0; i < 70; i++) {
      const rx = x0 + ((i * 97 + t * 40) % w), ry = y0 + ((i * 53 + t * 420) % h);
      g.beginPath(); g.moveTo(rx, ry); g.lineTo(rx - 3, ry + 10); g.stroke();
    }
  } else if (S.env.weather === "Sonne") {
    const sg = g.createRadialGradient(x0 + w - 50, y0 + 46, 4, x0 + w - 50, y0 + 46, 70);
    sg.addColorStop(0, "rgba(255,200,80,.55)"); sg.addColorStop(1, "rgba(255,200,80,0)");
    g.fillStyle = sg; g.fillRect(x0 + w - 130, y0, 130, 130);
  }
  g.restore();
  g.font = "11px SourceCode, monospace"; g.textAlign = "center";
  for (const p of S.env.patches) {
    const [px, py] = toScreen(p.u, p.v, "out"), rad = 46 * so;
    if (p.kind === "water") {
      g.fillStyle = "rgba(79,179,217,.55)"; g.beginPath(); g.ellipse(px, py, rad * 1.1, rad * 0.55, 0, 0, 7); g.fill();
      g.fillStyle = "#cfe9f3"; g.fillText(p.name, px, py + rad * 0.55 + 14); continue;
    }
    const fill = p.nectar / p.maxN, nFl = 6 + Math.round(fill * 26);
    for (let i = 0; i < nFl; i++) {
      const a = i * 2.399, d = rad * Math.sqrt((i + 0.5) / 32);
      const fx = px + Math.cos(a) * d, fy = py + Math.sin(a) * d * 0.7;
      g.fillStyle = `hsl(${p.hue},${p.hue === 0 ? 0 : 75}%,${p.hue === 0 ? 92 : 62}%)`;
      g.beginPath(); g.arc(fx, fy, 2.6, 0, 7); g.fill();
      g.fillStyle = "#ffb000"; g.beginPath(); g.arc(fx, fy, 1, 0, 7); g.fill();
    }
    // Vorratsbalken je Blütenfeld: beschriftet, mit Prozentwert
    const narrow = w < 460, bw = narrow ? 44 : 64;
    const ty = py + rad * 0.8 + 14, bx = clamp(px - bw / 2, x0 + 6, x0 + w - bw - 6);   // Balken bleibt in der Wiese
    g.font = "600 12px Fraunces, serif"; g.fillStyle = "#f2e3c6"; g.fillText(p.name, px, ty);
    g.font = "10px SourceCode, monospace";
    const labelLeft = bx + bw + (narrow ? 44 : 78) > x0 + w;   // nahe am rechten Rand: Etikett links vom Balken
    g.textAlign = labelLeft ? "right" : "left";
    [["Nektar", fill, RES_COL.nectar], ["Pollen", p.pollen / p.maxP, RES_COL.pollen]].forEach(([lab, f, col], i) => {
      const y = ty + 6 + i * 13;
      g.fillStyle = "rgba(0,0,0,.45)"; g.fillRect(bx, y, bw, 7);
      g.fillStyle = col; g.fillRect(bx, y, bw * clamp(f, 0, 1), 7);
      g.fillStyle = "rgba(242,227,198,.85)"; g.fillText(`${narrow ? lab[0] : lab} ${Math.round(f * 100)} %`, labelLeft ? bx - 5 : bx + bw + 5, y + 7);
    });
    g.textAlign = "center"; g.font = "11px SourceCode, monospace";
  }
  g.textAlign = "left"; g.fillStyle = "rgba(242,227,198,.7)";
  g.fillText(`${S.env.weather} · ${fmt(S.env.tOut, 1)} °C`, x0 + 12, y0 + 20);
}

// [renderer] interpolierte Bildschirmposition einer Biene
function beePos(b, a) {
  if (b.pspace !== b.space) return toScreen(b.x, b.y, b.space);
  return toScreen(b.px + (b.x - b.px) * a, b.py + (b.y - b.py) * a, b.space);
}

// [renderer] Pfade der Bienen (Layer)
function drawPaths(g, a) {
  g.lineWidth = 1;
  for (const b of S.bees) {
    if (!b.path.length) continue;
    g.strokeStyle = b.load ? "rgba(255,216,107,.22)" : "rgba(242,227,198,.10)";
    g.beginPath();
    const [x, y] = beePos(b, a); g.moveTo(x, y);
    for (const w of b.path) { const [wx, wy] = toScreen(w.x, w.y, w.space); g.lineTo(wx, wy); }
    g.stroke();
  }
}

// [renderer] Ressourcenflüsse (Layer): wandernde Punkte von Quelle zu Ziel
function drawFlows(g, a) {
  const life = 18;
  S.flows = S.flows.filter(f => S.tick - f.born < life);
  for (const f of S.flows) {
    const t = clamp((S.tick - f.born + a) / life, 0, 1);
    const [x0, y0] = toScreen(f.from.x, f.from.y, f.from.space), [x1, y1] = toScreen(f.to.x, f.to.y, f.to.space);
    g.strokeStyle = RES_COL[f.res]; g.globalAlpha = 0.28 * (1 - t); g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.globalAlpha = 1 - t * 0.6; g.fillStyle = RES_COL[f.res];
    g.beginPath(); g.arc(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 2.4, 0, 7); g.fill();
  }
  g.globalAlpha = 1;
}

// [renderer] Bienen: Körper mit Streifen, Flügel, Rollenfarbe am Kopf, Last als Punkt
function drawBees(g, a, now, reveal) {
  const k = clamp(R.cam.s * 0.32, 1.5, 3.2);
  g.globalAlpha = clamp((reveal - 0.7) / 0.3, 0, 1);
  for (const b of S.bees) {
    const [x, y] = beePos(b, a);
    const sz = b.space === "out" ? 2.4 : k;
    const ang = Math.atan2(b.y - b.py, b.x - b.px) || b.wobble;
    g.save(); g.translate(x, y); g.rotate(ang);
    const flap = Math.sin(now / 40 + b.wobble) * 0.5 + 0.5;
    g.fillStyle = "rgba(240,240,255,.45)";
    g.beginPath(); g.ellipse(-sz * 0.2, -sz * 0.9, sz * 0.9, sz * (0.35 + 0.25 * flap), -0.4, 0, 7); g.fill();
    g.fillStyle = "#f2b31f"; g.beginPath(); g.ellipse(0, 0, sz * 1.5, sz * 0.85, 0, 0, 7); g.fill();
    g.fillStyle = "#24160a"; g.fillRect(-sz * 0.5, -sz * 0.8, sz * 0.35, sz * 1.6); g.fillRect(sz * 0.15, -sz * 0.8, sz * 0.3, sz * 1.6);
    g.fillStyle = ROLE_COL[b.role]; g.beginPath(); g.arc(sz * 1.4, 0, sz * 0.5, 0, 7); g.fill();
    if (b.load) { g.fillStyle = RES_COL[b.load.res]; g.beginPath(); g.arc(-sz * 0.2, sz * 0.9, sz * 0.55, 0, 7); g.fill(); }
    g.restore();
  }
  g.globalAlpha = 1;
}

// [renderer] ein Frame
function render(a) {
  const g = R.ctx, now = performance.now();
  updateCamera();
  const reveal = clamp((now - S.revealT0 - 250) / 1500, 0, 1), eased = 1 - Math.pow(1 - reveal, 3);
  if (S.dirty || eased < 1 || R.lastComb !== S.tick) { drawComb(eased); R.lastComb = S.tick; }
  g.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
  g.clearRect(0, 0, R.w, R.h);
  g.globalAlpha = clamp((reveal - 0.45) / 0.4, 0, 1);
  drawMeadow(g, now);
  g.globalAlpha = 1;
  g.drawImage(R.comb, 0, 0, R.w, R.h);
  if (S.selected !== null) {
    const c = S.grid.cells[S.selected], [x, y] = toScreen(c.x, c.y, "hive");
    hexPath(g, x, y, CFG.HEX * R.cam.s * 1.08); g.strokeStyle = "#fff"; g.lineWidth = 2; g.stroke();
  }
  if (S.layers.paths) drawPaths(g, a);
  if (S.layers.flow) drawFlows(g, a);
  drawBees(g, a, now, reveal);
}

// [renderer] Klick auf eine Zelle -> Inspektor
function onCanvasClick(ev) {
  const r = R.cv.getBoundingClientRect();
  const w = fromScreen(ev.clientX - r.left, ev.clientY - r.top);
  const c = cellAt(w.x, w.y);
  S.selected = c ? c.id : null;
  renderInspector();
}
