# Übergabe Bienenstock — 17.10.2026, v1

## Stand (gemessen 17.10.2026, 02:1x)

| | |
|---|---|
| Ordner | `D:\4-DAT\SCHULE\ChatGPT\100_PRJ\TESTs\01_Bienenstock` |
| Git | `main` = `origin/main`, letzter Commit `5ad14df`, Arbeitsbaum sauber (vor dieser Datei) |
| GitHub | https://github.com/Jkegithub/bienenstock-simulation — **public**, MIT-Lizenz |
| Online | https://jkegithub.github.io/bienenstock-simulation/ — Pages `built`, per Headless-Chrome geprüft: läuft, selfCheck 6/6 |
| Artefakt | `bienenstock.html` 194.095 Bytes, **gebaut** aus `src/` + `fonts/` per `build.ps1` — nie direkt editieren |

## Was passiert ist

- Testlauf von Prompt #1 wurde auf Autorentscheid zum **optimierten Bau** (kein Prompttest; vermerkt in `TESTLAUF.md`).
- Simulation gebaut (10 Module), Abnahme K1–K20 und S1–S7 bestanden, Gegenprobe S1/S2 unabhängig bestanden.
- Echte Fehler durch selfCheck/Messung gefunden und behoben: F1 Takt-Messung bei verborgenem Tab, F2 Bilanz (Pollen als Zucker gebucht), F3 Ziel auf tote Biene, F4 Wettermodell (Regenserien bis 24 Tage → alle Kollapse).
- Autorbefunde behoben: Kollaps-Modal schloss bei Fensterklick; Blütenbalken unbeschriftet; Vorgeschichte (30 Tage) + Slider-Stellung im Kollapsbericht.
- README mit Screenshot (`docs/screenshot.png`), MIT-Lizenz, GitHub Pages mit `index.html`-Weiterleitung.

## Offen

- **K21 Optik:** Autor hat „Optik Klasse“ gesagt — in `TESTLAUF.md` noch als „offen (Autor)“ eingetragen → nachtragen.
- **Doppelklick-Start in Brave** nicht getestet (nur Browser-Pane und Headless-Chrome).
- Balance: Standard 20/20 Seeds überleben 150 Tage; Kolonie 400 fällt auf Wiesentragfähigkeit (~170) zurück; Kolonie 30 empfindlich. Bewusst nicht weiter getunt.
- Diese Übergabedatei und die STATUS-Aktualisierung sind **nicht committet** (Repo ist öffentlich → Autor entscheidet).

## Wiedereinstieg

1. `git -C <Ordner> status -sb` und `git log --oneline -3` messen, nicht aus dieser Datei übernehmen.
2. Änderungen nur in `src/`, danach `./build.ps1`, dann im Browser prüfen (Badge `selfCheck 6/6 PASS`).
3. Screenshot neu: Node-Skript per Chrome-DevTools-Protokoll (lag im Scratchpad dieser Sitzung, nicht im Repo — bei Bedarf neu schreiben: Seite laden, 3,5 s warten, `simTick()` × 600, `Page.captureScreenshot`).
4. Push → Pages baut automatisch neu (~1 min).
