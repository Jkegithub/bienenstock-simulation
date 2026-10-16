# Testlauf 01 — Bienenstock-Simulation

| | |
|---|---|
| Prompt | #1 der Sammlung `CLAUDE\PRJ\999_PROMPT_Tests` |
| Quelle | `README.md` der Sammlung, `text`-Block Zeilen 12–88 (versioniert im Repo `CLAUDE\PRJ`, Commit `4004721`) |
| sha256 des Blocks | `5f6b3405d1769c9e8be4d60abee021a784183049271a4d9a56cef77426c5f2ad` (77 Zeilen, 6747 Bytes, UTF-8, LF; gemessen 16.10.2026, vor Baustart neu messen) |
| Eingabe | nur der Text zwischen den `text`-Zäunen, unverändert |
| Modell | Opus 5.5, Effort Mittel (wie Lauf 22) — *beim Start bestätigen* |
| Start · Ende | *beim Start eintragen* |

Gehasht wird der Block, nicht die ganze `README.md`: Sie ändert sich mit jedem Indexeintrag.

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
| S1 | Ressourcenbilanz: eingesammelt == eingelagert + verbraucht + in Transit (Toleranz 0) | | |
| S2 | Honig-Herkunft: Honigzellen ohne Nektarphase == 0 | | |
| S3 | Brut-Konsistenz: Stats-Panel == Zellen in Brutzuständen | | |
| S4 | Agenten-Integrität: genau eine Rolle, gültiges Ziel im Gitter | | |
| S5 | Takt: nach 1 s Ticks > 5 und Frames > 20 | | |
| S6 | UI: jeder Slider/Button gebunden, verändert messbar den Zustand | | |
| S7 | `selfCheck` prüft Invarianten, nicht Existenz; Fail zeigt Invariante + Zahlen | | |

**Orakel-Gegenprobe:** Der `selfCheck` des Laufs ist selbst Prüfgegenstand. Bei der Abnahme wird
mindestens S1 und S2 unabhängig nachgerechnet (eigener Zähler über die Zellübergänge), nicht nur
die Tabelle des Laufs abgelesen.

### Weitere Kriterien

| # | Kriterium | Ergebnis | Beleg |
|---|---|---|---|
| K1 | Eine HTML-Datei, inline, keine Frameworks/externen Assets, läuft per Doppelklick aus `file://` | | |
| K2 | Modulplan am Dateikopf (6–10 Module), jede Funktion mit Modulname | | |
| K3 | Ein `<canvas>` 2D für Waben + Bienen, HTML nur für Panels | | |
| K4 | 10 Ticks/s, entkoppelt vom rAF; 2× verdoppelt nur Ticks | | |
| K5 | 1 Tick = 0,1 Sim-Tag | | |
| K6 | Gitter ~80 → max. 1.200 Zellen, Meldung an der Obergrenze | | |
| K7 | Sieben Zellzustände, Nektar mit Wassergehalt | | |
| K8 | Drei getrennte Pools mit korrekter Verwendung (Pollen nie zu Honig) | | |
| K9 | Honigkette 1–5, Deckelung erst < 20 % Wasser | | |
| K10 | Brutzyklus 30/60/120 Ticks, Unterversorgung → Brut stirbt, Log-Eintrag | | |
| K11 | Drei Rollen, altersabhängiger Wechsel, sichtbare Pfade | | |
| K12 | Umweltfaktoren: Wetter, Blüten, Temperatur (35 °C), Krankheit | | |
| K13 | Fail-State: < 10 Bienen oder Brut 0 bei leerem Honig → Stopp + Ursachenkette 50 Ticks | | |
| K14 | Vier Slider live ohne Reset; Pause, 2×, Reset | | |
| K15 | Stress-Test mit definiertem Effekt (10/10/80 %, 30 Sim-Tage) und Report | | |
| K16 | Layer-Toggles: Pfade, Temperatur, Ressourcenflüsse | | |
| K17 | Stats-Panel vollständig (Rolle, Brutphase, Honig, Effizienz, Sterblichkeit) | | |
| K18 | Zell-Inspektor per Klick (Zustand, Füllgrad, Wasser, Alter, zuständige Biene) | | |
| K19 | Ausbaustufen-Regel: Weggelassenes steht im Status-Bereich, nichts halb implementiert | | |
| K20 | `/* Design decisions */` mit fünf Entscheidungen, je Alternative und Grund | | |
| K21 | Visuelle Richtung (Schrift, Palette, Tiefe, orchestrierter Aufbau, Lesbarkeit bei 1.000 Zellen) — Autorurteil | | |
