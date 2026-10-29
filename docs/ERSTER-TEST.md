# Erster lokaler Techniktest

Dieser geführte Test dauert nach der Installation etwa 5–10 Minuten. Er verwendet ausschließlich erfundene Beispielantworten in einem lokalen Prototyp. Er lädt nichts hoch und sendet keine Telemetrie.

## Starten

Benötigt werden Node.js 24, npm 11 und ein aktueller Desktopbrowser wie Chromium/Chrome. Klone das Repository und wechsle in den Arbeitszweig des Prototyps:

```sh
git clone https://github.com/TaughtMe/HTML-Worksheet.git
cd HTML-Worksheet
git switch feat/security-foundation
node --version
npm --version
npm ci --ignore-scripts
npm run build
npm start
```

Die Versionsbefehle sollen Node 24 und npm 11 anzeigen. Lass den Server im Terminal laufen und öffne im Browser `http://127.0.0.1:4173`. Der Server lauscht nur auf deinem eigenen Gerät. Es gibt keinen öffentlichen Link.

## Mit dem Standardfelder-Beispiel testen

1. In der Laborseite über das Dateiauswahlfeld die vorhandene Datei `tests/fixtures/demo-standard-fields.html` öffnen. Sie enthält nur erfundene Texte und ist bereits im Repository vorhanden.
2. **Öffnen** anklicken. Der Status sollte `active · synthetischer RAM-State` anzeigen. Im JSON-Bereich sollten `durability: "memory"` und zunächst leere Antworten stehen. Die HTML-Startwerte der Datei werden für diese neue RAM-Instanz durch leere Antworten ersetzt.
3. In **Fantasiename** zum Beispiel `Mira Beispiel` eintragen, bei **Mathe ist interessant** das Häkchen setzen, **Farbe des Fantasiehimmels** auf `Grün` ändern und beim **Fantasieplanet** `Tavi` wählen. Bei **Lieblingssymbole** zusätzlich `Komet` auswählen. Bei Mehrfachauswahl je nach Betriebssystem Strg- oder Command-Taste beim zusätzlichen Anklicken gedrückt halten.
4. Nach einer kurzen Pause die Werte im JSON-Bereich ansehen. Die Eingabe sollte dort als synthetischer State erscheinen. **RAM-Snapshot** anklicken; erwartet wird `active · RAM-Snapshot bestätigt`. Das ist nur eine Bestätigung im Arbeitsspeicher.
5. **Schließen** anklicken. Erwartet werden `closed · USER_CLOSE`, ein entfernter Arbeitsblattbereich und ein leerer JSON-Bereich. Danach **Synthetische Demo** anklicken: die neue Sitzung startet wieder leer. Der Button **Interaktion** im Arbeitsblatt sollte `JS funktioniert` anzeigen.

Bitte die Seite für diesen Test nicht neu laden und nicht schließen, um eine Wiederherstellung zu erwarten. Dauerhafte Speicherung, Wiederherstellung nach Reload/Neustart und Backup sind noch nicht implementiert. Schließen oder Beenden verwirft die Antworten.

## Optional: strikter Laborversuch (STRICT01)

Dieser getrennte Versuch nutzt nur die enge `strict-v1`-Feldliste und eine fest definierte Checkbox-Aktion. Er ersetzt den bisherigen Fremd-JS-Weg nicht. Der aktuelle begrenzte CI-Korpus besteht 41/41 Fälle je Chromium, Firefox und Playwright-WebKit; das ist weder G1-/Produktfreigabe noch ein Nachweis für reale Geräte oder Ressourcenreserven.

1. Im Dateiauswahlfeld `tests/fixtures/demo-strict-fields.html` wählen und **Strikt öffnen (Labor)** anklicken. Die Fixture enthält keine Fremdskripte, Stylesheets oder URLs.
2. Text, Textarea, Auswahlfelder, Radiogruppe und Checkbox mit erfundenen Antworten bearbeiten. **Kristallfund umschalten** ändert ausschließlich die Checkbox `check`; anschließend den Feldzustand im JSON-Bereich ansehen.
3. **RAM-Snapshot** anklicken. Das bestätigt nur einen flüchtigen Zustand im Arbeitsspeicher. **Schließen** verwirft ihn; dauerhafte Speicherung und Wiederherstellung nach Reload sind nicht vorhanden.

Der Button führt genau eine fest deklarierte Aktion aus vertrauenswürdigem Runnercode aus. Dieser Modus ist ein enger technischer Versuch und keine allgemeine Unterstützung für beliebiges HTML oder eine Produkt-/Sicherheitsfreigabe. Der bestehende Button **Öffnen** und die synthetische Fremd-JS-Demo bleiben als Legacy-Laborpfad erhalten.

## Falls etwas nicht klappt

Notiere den Fehler lokal mit diesem kurzen Bogen. Verwende weiterhin nur erfundene Antworten; kopiere keine Schülerdaten, Namen, Fotos oder Unterrichtsunterlagen in einen Bericht.

```text
Repository-Commit (git rev-parse --short HEAD):
Betriebssystem und Version:
Browser und Version:
Schritt (Standard 1–5 oder STRICT01 1–3):
Erwartet:
Tatsächlich (Statuszeile / gekürzter Fehlertext):
Lässt es sich mit denselben Schritten wiederholen?:
```

## Was dieser Test aussagt

**Jetzt:** Du kannst das lokale Techniklabor mit synthetischen Antworten ausprobieren. Das belegt nur ausgewählte Funktionen des RAM-Prototyps, keine Alltagstauglichkeit oder Sicherheitsfreigabe.

**Alltagsnaher Test mit synthetischen Antworten:** erst nach erfolgreichem G1a-Sicherheitsgate und G2-Umsetzung samt geprüfter Speicherung, Wiederherstellung und Backup. Echte personenbezogene Schülerdaten erfordern zusätzlich eine spätere Pilot- und Datenschutzfreigabe.

**Tests auf realen Geräten:** Diese Prüfungen auf den vorgesehenen iPadOS-/Safari- und Android-Geräten liefern den Nachweis für G1b; ein Desktopbrowser ersetzt sie nicht. Eine Gerätefreigabe gibt es erst nach bestandenem G1b.

**Produktiver Pilot:** folgt erst nach den dafür nötigen Produkt-, Datenschutz-, Sicherheits- und Wiederherstellungsprüfungen. Ein Termin steht noch nicht fest.
