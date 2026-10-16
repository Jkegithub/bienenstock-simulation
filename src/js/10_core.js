/* Design decisions
 * 1. Hex-Gitter als flaches Array in Spiralreihenfolge (axiale Koordinaten q,r) plus Map "q,r"->Index.
 *    Alternative: 2D-Offset-Array mit fester Breite. Grund: Das Gitter wächst ringweise von innen nach
 *    außen; in Spiralreihenfolge ist Wachstum ein push(), Indizes bleiben stabil (Inspektor, Reservierungen,
 *    Zielprüfung bleiben gültig), und Ring = Abstand zur Mitte ergibt die natürliche Zonierung
 *    (Brut innen, Pollenkranz, Honig außen) ohne eigene Zonen-Datenstruktur.
 * 2. Wassergehalt: Erhaltungsgröße ist der Zucker in ganzzahligen Einheiten; der Wassergehalt ist ein
 *    Prozent-Attribut der Zelle, das beim Einlagern gewichtet gemischt wird (neuer Nektar 60 %).
 *    Alternative: Nektar als Volumen, das beim Fächeln schrumpft. Grund: Die Bilanz soll mit Toleranz 0
 *    stimmen; verdunstendes Wasser ist kein Ressourcenverbrauch und würde jede Bilanz verwischen.
 * 3. Bilanz aus zwei unabhängigen Quellen: "gesammelt" und "verbraucht" sind Ereigniszähler, die nur an
 *    der Blüte bzw. am Verbrauchsort erhöht werden; "eingelagert" und "in Transit" werden in selfCheck
 *    jedes Mal neu aus Zellen und Bienenlasten gezählt. Alternative: ein Zähler "eingelagert", der beim
 *    Einlagern hochzählt. Grund: Dann prüfte die Invariante nur, ob dieselbe Zahl zweimal addiert wurde.
 * 4. Pfade ohne A*: Bienen laufen über die Wabenoberfläche (keine Hindernisse), also genügen Polylinien
 *    mit einem versetzten Zwischenpunkt. Innen- und Außenraum haben eigene Koordinatensysteme, die am
 *    Flugloch verbunden sind; so kann die Wabenkamera beim Wachsen zoomen, ohne Flugbahnen zu verzerren.
 *    Alternative: A* auf dem Zellgraphen. Grund: ohne Hindernisse liefert A* dieselbe Gerade, kostet aber
 *    bei 400 Agenten und 10 Ticks/s spürbar Rechenzeit.
 * 5. Larvenfütterung zentral pro Tick mit Pflegekapazität (Ammen x 6 + Arbeiterinnen x 1) statt
 *    Futtertransport je Biene. Alternative: jede Amme trägt Futterportionen einzeln. Grund: Die Vorgabe
 *    "Larven brauchen in jedem Tick Pollen und Nektar" ist bei 10 Ticks/s als Einzeltransport nicht
 *    darstellbar; die Kapazitätsgrenze koppelt trotzdem Ammenzahl -> Unterversorgung -> Brutsterben.
 *    Die Ammen laufen sichtbar zu den Larven und werden im Inspektor als zuständige Biene geführt.
 */

// [core] Konstanten — alle Zeitangaben in Ticks (1 Tick = 0,1 Sim-Tag)
const CFG = Object.freeze({
  TICKS_PER_SEC: 10,
  DAYS_PER_TICK: 0.1,
  MAX_STEPS_PER_FRAME: 8,
  START_CELLS: 80,
  MAX_CELLS: 1200,
  HEX: 10,                       // Zellradius in Wabenkoordinaten
  EGG_T: 30, LARVA_T: 60, PUPA_T: 120,
  LARVA_STARVE_LIMIT: 3,         // Ticks in Folge ohne Futter -> Larve stirbt
  NURSE_CAP: 6, WORKER_CAP: 1,   // Larven pro Amme / Arbeiterin und Tick
  CELL_CAP: { nectar: 100, pollen: 150 },
  LOAD: { nectar: 80, pollen: 80, water: 20 },
  NECTAR_WATER_IN: 60,           // % Wasser beim Einlagern
  HONEY_WATER: 20,               // unter diesem Wert wird Honig gedeckelt
  FAN_RATE: 1.6,                 // %-Punkte Wasser pro Fächel-Tick (bei voller Zelle langsamer)
  WAX_COST: 6,                   // Zucker pro neu gebauter Zelle
  EAT_EVERY: 20,                 // jede Biene isst 1 Einheit Zucker alle n Ticks
  AGE_WORKER: 120, AGE_FORAGER: 220, AGE_MAX: 500,
  T_TARGET: 35, T_COOL: 36, T_HEAT: 34,
  POP_MIN: 10, POP_MAX: 400,
  HISTORY: 50,
  LONG_DAYS: 30,                 // Tagesverlauf für die Vorgeschichte im Kollaps-Modal
  STRESS_TICKS: 300,
  ROLES: ["forager", "nurse", "worker"],
});
const ROLE_DE = { forager: "Sammlerin", nurse: "Brutpflege", worker: "Arbeiterin" };
const STATE_DE = { empty: "leer", egg: "Ei", larva: "Larve", pupa: "Puppe", pollen: "Pollen", nectar: "Nektar", honey: "Honig (gedeckelt)" };
const RES_DE = { nectar: "Nektar (Zucker)", pollen: "Pollen", water: "Wasser" };

// [core] deterministischer Zufallsgenerator (mulberry32)
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rnd = makeRng(1);
// [core]
function rand(a, b) { return a + (b - a) * rnd(); }
// [core]
function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
// [core]
function chance(p) { return rnd() < p; }
// [core]
function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
// [core]
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
// [core] Zahlformat deutsch
function fmt(v, d = 0) { return Number(v).toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d }); }
