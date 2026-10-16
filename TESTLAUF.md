# Testlauf 01 — Bienenstock-Simulation

| | |
|---|---|
| Prompt | #1 der Sammlung `CLAUDE\PRJ\999_PROMPT_Tests` |
| Quelle | `README.md` der Sammlung, `text`-Block Zeilen 12–88 (versioniert im Repo `CLAUDE\PRJ`, Commit `4004721`) |
| sha256 des Blocks | `5f6b3405d1769c9e8be4d60abee021a784183049271a4d9a56cef77426c5f2ad` (77 Zeilen, 6747 Bytes, UTF-8, LF; gemessen 16.10.2026, vor Baustart neu messen) |
| Eingabe | nur der Text zwischen den `text`-Zäunen, unverändert |
| Modell | Opus 5.5 (laut Sitzungsumgebung); Effort-Stufe nicht gemessen |
| Start · Ende | 16.10.2026, Bau ab ≈ 23:18 (Dateizeit `fonts/`) · Abnahme 23:42 |
| Ergebnis | `bienenstock.html` (187.096 Bytes, 1.842 Zeilen, sha256 `CB678F1E…D9E3`), gebaut aus `src/` + `fonts/` per `build.ps1` |

Gehasht wird der Block, nicht die ganze `README.md`: Sie ändert sich mit jedem Indexeintrag.

> **⚠ ABWEICHUNG (16.10.2026, Autorentscheid): kein Prompttest, sondern optimierter Bau.**
> Die Sitzung begann mit „Bienenstock Projekt umsetzen“, nicht mit dem Prompt. Der Prompt
> diente als Pflichtenheft, die Kriterien unten waren dem Bauenden **bekannt** und wurden
> als Checkliste benutzt. **Als Baseline für Prompt-Vergleiche ist dieser Lauf unbrauchbar.**
> Hash vor Baustart neu gemessen: stimmt (77 Zeilen, 6747 Bytes).

## Bekannte Störgröße

Die globale `CLAUDE.md` des Autors lädt mit. Gemessen wird der Prompt in dieser Umgebung,
nicht in einer neutralen.

**Zielkonflikt im Prompt:** „keine externen Assets“ und „keine System-Fonts“ zugleich. Wie der
Lauf das auflöst (eingebettete Schrift, Begründung im Design-Abschnitt, stilles Ignorieren), wird
bei der Abnahme festgehalten — nicht als Fehler des Laufs gewertet.

## Abnahme

*Nach dem Lauf, je Kriterium bestanden / nicht bestanden mit Beleg (Fundstelle im Code oder Messung im Browser).*

### Selbstprüfung (`selfCheck`, vom Prompt verlangt)

| # | Invariante | Ergebnis | Beleg |
|---|---|---|---|
| S1 | Ressourcenbilanz: eingesammelt == eingelagert + verbraucht + in Transit (Toleranz 0) | bestanden | `invariantRows()`; Bestand und Transit per Zellscan, Zu-/Abgang als Ereigniszähler. 0 Fails in den letzten beiden Regressionsrunden (12 + 4 Läufe à bis 1.500 Ticks, Prüfung alle 20 Ticks); davor ein echter Fail, s. F2 |
| S2 | Honig-Herkunft: Honigzellen ohne Nektarphase == 0 | bestanden | Scan `wasNectar && fanTicks>0` + Wache in `setCellState` (0 blockierte Sprünge) |
| S3 | Brut-Konsistenz: Stats-Panel == Zellen in Brutzuständen | bestanden | liest die **angezeigten** Zahlen aus dem DOM (`#stEgg/#stLarva/#stPupa`) gegen Zellscan |
| S4 | Agenten-Integrität: genau eine Rolle, gültiges Ziel im Gitter | bestanden | Rolle ∈ ROLES, Ziel- und Positionsprüfung; ein Fehler fand Fehler F3 (s. u.) |
| S5 | Takt: nach 1 s Ticks > 5 und Frames > 20 | bestanden | 12 Ticks / 60 Frames. Misst ab erstem gezeichnetem Frame (verborgener Tab rendert nicht, s. F1) |
| S6 | UI: jeder Slider/Button gebunden, verändert messbar den Zustand | bestanden | 11/11: 4 Slider, Pause, 2×, Reset, Stress-Test, 3 Layer — je Wirkung gemessen und zurückgestellt |
| S7 | `selfCheck` prüft Invarianten, nicht Existenz; Fail zeigt Invariante + Zahlen | bestanden | Fehlerinjektion: +5 Zucker → S1 FAIL; Honig ohne Nektar → S2 FAIL; Larvenzähler +1 → S3 FAIL; Ziel #99999 bzw. Doppelrolle → S4 FAIL. Banner nennt Invariante + Zahlen |

**Orakel-Gegenprobe:** Der `selfCheck` des Laufs ist selbst Prüfgegenstand. Bei der Abnahme wird
mindestens S1 und S2 unabhängig nachgerechnet (eigener Zähler über die Zellübergänge), nicht nur
die Tabelle des Laufs abgelesen.

**Durchgeführt (Seeds 1, 4, 13 × 1.500 Ticks, Hooks von außen in die laufende Seite):**
- **S1:** „gesammelt“ unabhängig = Anfangsbestand (Zellscan bei Tick 0) + was **physisch aus den
  Blütenfeldern verschwand** (Hook um `gather`, Differenz des Feldbestands). Ergebnis je Ressource
  einheitengenau gleich dem Ledger (z. B. Seed 1 Nektar 53.394 = 53.394; Verbrauch 41.865 = 41.865).
- **S2:** Hook um `setCellState`, eigene Liste der Nektar-Eintritte: 352 Übergänge zu Honig, **0**
  ohne vorherige Nektarphase ≥ 2 Ticks oder mit Wasser ≥ 20 %.
  *Erste Fassung der Probe meldete 10–13 Verstöße — Fehler der Probe (Start-Nektarzellen entstanden
  vor dem Hook), nach Vorregistrierung 0.*
- **Was das Orakel NICHT liest:** ob die Mengen biologisch plausibel sind (Balance), ob die Pfade
  sichtbar sind, ob Wassergehalt beim Mischen korrekt gewichtet ist. Dafür: Messreihen unten + Sichtprüfung.

**Vom selfCheck während des Baus gefundene echte Fehler:**
- F1 S5 schlug fehl, weil der Tab verborgen startete → Messfenster ab erstem Frame.
- F2 S1 (Seed 1, Tick 259): Vorratsliste vom Tickanfang; Zelle wurde geleert, mit Pollen gefüllt,
  dann als „Nektar“ angefressen → Pollen als Zucker gebucht. Fix: Zustandsprüfung bei Entnahme.
- F3 S4: Abholerin behielt nach dem Tod der Sammlerin ein Ziel auf eine tote Biene → Ruheziel.

**Nachtrag 17.10.2026 — „plötzliches Sterben“ (Autorbefund):** Die 50-Tick-Kette zeigte nur das Ende.
Neu: Vorgeschichte über 30 Sim-Tage im Kollaps-Modal (Kurve Bienen/Zucker/Brut mit Regenbändern +
Kennzahlen). Damit gemessen: **alle 4 Kollapse in 20 Standard-Seeds** gingen auf Regenserien von
13–24 Tagen zurück. Ursache F4 im Wettermodell: „Stabilität“ senkte die Wechselwahrscheinlichkeit für
**jedes** Wetter, also hielt auch Regen länger. Fix: Stabilität hält gutes Wetter, beendet Regen schnell.
Danach: Standard **20/20 überleben** 150 Tage (144–180 Bienen); Wetterstabilität 10 %: 3/5 kollabieren;
Stress-Test 1/3 kollabiert; 0 Invariantenfehler; S6 weiter 11/11.

**Nachtrag 17.10.2026 (2) — Autorbefunde:** (a) Blütenbalken zu klein/unbeschriftet → größer, „Nektar/Pollen x %“,
auf schmalen Fenstern „N/P x %“, im Wiesenrahmen gehalten. (b) Kollaps-Modal schloss bei Klick neben die Box
(auch beim Aktivieren des Fensters) → schließt nur per Button; neuer Button „Kollaps-Bericht“/„Stress-Report“
öffnet wieder (in S6 aufgenommen, jetzt 12/12). (c) Vorgeschichte nennt die Slider-Stellung. Der Autor-Kollaps
an Tag 22 (Regen 18/22 Tage) ist ohne diese Zeile nicht zuordenbar; niedrige Wetterstabilität ist **Vermutung**.
(d) Log: Zeit und Text getrennt („T10,1 · 28 Larven“ statt „T10,128 Larven“).

**Balance (keine Invariante, gemessen, vor F4):** Standard 150 Bienen: 6–7 von 8 Seeds überleben 150
Sim-Tage bei 140–190 Bienen; Kollapse durch lange Regenphasen, mit korrekter Ursachenkette.
Kolonie 400: wächst bis ≈ 285, fällt dann (Tragfähigkeit der Wiese bei 70 % ≈ 170). Kolonie 30:
1 von 2 überlebt. Ressourcen 0 %: Kollaps an Tag 44.

### Weitere Kriterien

| # | Kriterium | Ergebnis | Beleg |
|---|---|---|---|
| K1 | Eine HTML-Datei, inline, keine Frameworks/externen Assets, läuft per Doppelklick aus `file://` | bestanden (Doppelklick in Brave **nicht** getestet) | einzige URLs: SVG-Namensraum und Lizenzlink im Kommentar; geladen per `file://` im Browser-Pane, 0 Konsolenfehler |
| K2 | Modulplan am Dateikopf (6–10 Module), jede Funktion mit Modulname | bestanden | 10 Module im Kopfkommentar; 115 Funktionen, je `// [modul]` |
| K3 | Ein `<canvas>` 2D für Waben + Bienen, HTML nur für Panels | bestanden | `canvas#view`, Waben im Offscreen-Cache |
| K4 | 10 Ticks/s, entkoppelt vom rAF; 2× verdoppelt nur Ticks | bestanden | `frameLoop`: Akkumulator × `S.speed`; gemessen 10 Ticks / 60 Frames pro s |
| K5 | 1 Tick = 0,1 Sim-Tag | bestanden | `CFG.DAYS_PER_TICK`, Kopfzeile Tag = Tick × 0,1 |
| K6 | Gitter ~80 → max. 1.200 Zellen, Meldung an der Obergrenze | bestanden | Start 80; erzwungen auf 1.200: `growCell` → false, Meldung in Stats + Log |
| K7 | Sieben Zellzustände, Nektar mit Wassergehalt | bestanden | `STATE_DE`; Wasser gewichtet gemischt (60 % Eingang) |
| K8 | Drei getrennte Pools mit korrekter Verwendung (Pollen nie zu Honig) | bestanden | Ledger je Ressource; Wasser → Kühlung (> 36 °C) + Futterverdünnung |
| K9 | Honigkette 1–5, Deckelung erst < 20 % Wasser | bestanden | gather → handover → depositAt (60 %) → fan → `setCellState(honey)` mit Wache |
| K10 | Brutzyklus 30/60/120 Ticks, Unterversorgung → Brut stirbt, Log-Eintrag | bestanden | `advanceBrood`, `feedLarvae` (3 Ticks ohne Futter → Tod, Log mit Grund + Zellen) |
| K11 | Drei Rollen, altersabhängiger Wechsel, sichtbare Pfade | bestanden | Altersgrenzen verschieben sich mit dem Bedarf (`updateRoleAges`); Pfad-Layer |
| K12 | Umweltfaktoren: Wetter, Blüten, Temperatur (35 °C), Krankheit | bestanden | Markov-Wetter, Blütenfelder mit Nachwuchs, Heizen/Kühlen, Sterblichkeit |
| K13 | Fail-State: < 10 Bienen oder Brut 0 bei leerem Honig → Stopp + Ursachenkette 50 Ticks | bestanden | Modal mit geordneter Kette + Trendtabelle; Beispiel: 24 Tage Regen → Hunger → Brut 0 |
| K14 | Vier Slider live ohne Reset; Pause, 2×, Reset | bestanden | S6 |
| K15 | Stress-Test mit definiertem Effekt (10/10/80 %, 30 Sim-Tage) und Report | bestanden | 3 Läufe: 1 kollabiert (Tag 26,7), 2 überlebt; Report mit Honigverlust + Sterblichkeit; Slider gesperrt und danach zurückgestellt |
| K16 | Layer-Toggles: Pfade, Temperatur, Ressourcenflüsse | bestanden | S6 + Sichtprüfung |
| K17 | Stats-Panel vollständig (Rolle, Brutphase, Honig, Effizienz, Sterblichkeit) | bestanden | `renderStats` |
| K18 | Zell-Inspektor per Klick (Zustand, Füllgrad, Wasser, Alter, zuständige Biene) | bestanden | alle 7 Zustände geprüft; Fehler „zuständige Biene“ bei geleerter Zelle gefunden und behoben |
| K19 | Ausbaustufen-Regel: Weggelassenes steht im Status-Bereich, nichts halb implementiert | bestanden | „Weggelassen: nichts“ + Liste der Vereinfachungen |
| K20 | `/* Design decisions */` mit fünf Entscheidungen, je Alternative und Grund | bestanden | Kopf von `src/js/10_core.js` |
| K21 | Visuelle Richtung (Schrift, Palette, Tiefe, orchestrierter Aufbau, Lesbarkeit bei 1.000 Zellen) — Autorurteil | **offen (Autor)** | Fraunces + Source Code Pro eingebettet; Lesbarkeit bei 1.034 Zellen gesichtet; schwächste Trennung Nektar/Honig |

**Zielkonflikt Schrift:** aufgelöst durch base64-Einbettung zweier OFL-1.1-Schriften (Lizenz an den
mitgelieferten Lizenzdateien geprüft, nicht per Websuche); Begründung im CSS-Kopf.
