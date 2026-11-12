# Funktionaler Worksheet-MVP

Der funktionale MVP verwendet das unterstützte `strict-v1`-Format. Der bisherige Sicherheitslaborpfad bleibt separat unter `npm start` erhalten. Es gibt keine Konten oder CDN-Laufzeitabhängigkeiten. Sicherheits-/Gerätefreigaben sind weiterhin offen; vorerst nur Beispieldaten verwenden. Siehe [Status und Prüfumfang](../../docs/STATUS.md#entwicklungsstand) und [MVP-Inventur](../../docs/FUNCTIONAL-MVP-INVENTORY.md).

```sh
npm ci
npm run build:app
npm run start:app
```

Die App öffnet auf `http://127.0.0.1:4174`. Service Worker benötigen HTTPS oder localhost. Es gibt keine CDN-Abhängigkeit und kein Serverkonto. Für einen ersten Versuch eignet sich [demo-strict-fields.html](../../tests/fixtures/demo-strict-fields.html).

## Hosting und Versionswechsel

Cloudflare Pages verwendet `npm run build:app` und das Ausgabeverzeichnis `apps/worksheet/dist/pages`. Der Pages-Worker liefert die Startseite mit frischer CSP-Nonce aus. Jeder Build erhält eine sichtbare Versionsnummer aus der UTC-Bauzeit. Der Service Worker prüft beim Installieren die Prüfsummen von Oberfläche und Programmdatei.

Beim erneuten Öffnen oder Zurückkehren in die App sucht der Browser online nach Updates. Unten in der Bibliothek ist die Prüfung über **Nach Updates suchen** auch manuell möglich. Ein geöffnetes Blatt zuerst speichern und schließen, dann **Neue Version öffnen** wählen. Für den Zugriff auf dieselben lokalen Arbeitshefte immer dieselbe Produktionsadresse und dasselbe Browserprofil verwenden.

Der Regressionstest `node apps/worksheet/test/pages-update.mjs` baut zwei Versionen, wechselt bei geöffnetem Blatt zwischen den Releases und prüft die gespeicherte Antwort bei abgeschaltetem Server. Er verwendet Playwright Chromium oder, mit `BROWSER_ENGINE=webkit`, WebKit.

1. Ein Arbeitsheft und darin ein Kapitel anlegen. Kapitel werden als Ordner im gemeinsamen Containerbaum gespeichert.
2. **Blatt öffnen** importiert eine neue unveränderliche Vorlage und eine unabhängige Bearbeitung. Später aus der Bibliothek öffnen, um dieselbe Bearbeitung fortzusetzen.
3. Text, Checkbox, Radiogruppe und Auswahlfelder bearbeiten. Die fest deklarierte Checkboxaktion funktioniert über den vertrauenswürdigen Adapter. Während eine Änderung bestätigt wird, sperrt dieser kurz die Felder und stellt den Fokus danach wieder her.
4. **Jetzt speichern** bestätigt einen aktuellen Snapshot. Erst eine abgeschlossene IndexedDB-Transaktion führt zu `committed` und einer sichtbaren Bestätigung. „Zuletzt lokal bestätigt“ beschreibt diesen Stand, nicht einen Schutz gegen Geräteschaden oder Browserlöschung.
5. **PDF herunterladen** erzeugt lokal eine echte PDF-Datei aus Fragen, Auswahltexten und dem eigenen bestätigten Antwortsnapshot. **PDF teilen** nutzt verfügbare Dateifreigabe nach bewusster Nutzeraktion; bei fehlender Unterstützung/Fehler folgt der Download. Abgebrochene Freigaben lösen keinen zusätzlichen Download aus.
6. **Sicherung exportieren** lädt eine vollständige JSON-Sicherung des bestätigten Bestands herunter. **Sicherung importieren** fügt validierte Inhalte als neue Kopien mit frischen IDs hinzu und überschreibt den bestehenden Bestand nicht.

Die App-Dateien werden nach der ersten erfolgreichen Vorbereitung lokal gecacht. Die Anzeige „App-Dateien lokal verfügbar“ prüft den tatsächlichen Shell-/Bundlecache. Antworten bleiben getrennt in IndexedDB; der Service Worker cached keine Vorlagen oder Antworten. Zum Beenden vorsichtshalber **Jetzt speichern** verwenden. Solange ein editierbares Blatt offen ist, warnt die App beim Schließen auch während der noch unsichtbaren 500-ms-Eingabedebounce. Ein abruptes OS-Beenden kann sie nicht verhindern.

Bei einem Tabkonflikt, Speicherfehler oder fremder Löschung wird nichts automatisch überschrieben. Der zuletzt mögliche ungesicherte Kandidat bleibt begrenzt im Arbeitsspeicher. **Arbeitskopie anlegen** rettet ihn in eine unabhängige Bearbeitung; bei inzwischen entfernter Originalinstanz werden gebundene Vorlage und Antworten atomar mit neuen IDs in der Wurzel angelegt. Bewusstes Schließen kann diesen RAM-Kandidaten verwerfen.

## Unterstütztes Format und Grenzen

- Feste Standardfelder mit eindeutigen IDs, maximal 1.024 Felder, bis 2 MiB HTML und bis 256 KiB State. Genau ein `type="button"` mit `data-ws-action="toggle-checkbox"` und gültigem Checkboxziel gehört zu `strict-v1`.
- Kein beliebiges Fremd-JavaScript, CSS, externe Ressourcen oder universeller DOM-/Canvaszustand. Solche Dateien werden vollständig vor Frameerzeugung abgewiesen. Es gibt keinen stillen Rückfall auf den Labor-JS-Pfad.
- Vorlagen, Instanzen, bestätigte Revisionen und Container liegen getrennt in IDB-v1. CAS schützt Head- und Metadatenrevisionen; Blattlöschen prüft zusätzlich den angezeigten Head. Nichtleere Container werden nicht gelöscht. Mindestens Head und vorige Revision bleiben gespeichert.
- Die Bibliothek hält die Backupgrenzen atomar ein: maximal 32 Vorlagen, 256 Instanzen, 64 Hefte/256 Ordner, 16 MiB Originalquellen, 8 MiB bestätigte States und konservativ höchstens 32 MiB vollständig serialisierter Backupinhalt.
- PDF ist ein semantischer Datenbericht, kein originalgetreues HTML-Drucklayout. Die lokal eingebettete Open-Sans-Schrift, ihre Herkunft, Hash und Lizenz stehen unter [assets](assets/README.md). Nicht vorhandene Glyphen, mehr als 1 MiB Berichtstext oder mehr als 250 Seiten führen vor Dateiausgabe zu einem sichtbaren Fehler. Antworten bleiben gespeichert und sicherbar.
- Keine Synchronisation oder automatische externe Sicherung. IndexedDB/Cache können durch Browser/OS gelöscht werden. Heruntergeladene Sicherungen enthalten die Antworten.

## Ausgeführte Prüfung und offener vollständiger Ablauf

- Native IDB: 5/5 Fälle; Modellprüfungen: 3/3; PDF-Daten-/Fehlerprüfungen: 2/2.
- Online-Produktaktion: alle Feldarten, feste Interaktion, tatsächlicher mehrseitiger PDF-Download und extrahierte Fragen/Antworten belegt.
- Neue Workflowregressionen: 4/4; echter UI-Backupdownload/Import und Labor-Memorydefault: 2/2.
- Separater Offline-Datenlauf: tatsächlicher persistenter Profilneustart, gestoppter Server, direkter `ECONNREFUSED`, ausschließlich SW-Antworten, alle Feldwerte wiederhergestellt und neue Revision 2 lokal bestätigt.
- **Vollständiger Offline-PDF-End-to-End-Test ist lokal blockiert.** System-Chromium 154.0.8037.57 schließt beim späteren Offline-Blobdownload den Browserprozess; auch eine einfache Textblob-Gegenkontrolle scheitert. Die vollständigen initialen Debug- und Textblob-Kontrolllogs sind lokal archiviert, aber nach automatischer Uploadprüfung nicht im Repo veröffentlicht; Hashes und Größen stehen im Manifest. Der veröffentlichte stabile Diagnose-Log und der separate Server-aus-Lauf bleiben verfügbar. SIGTRAP/SIGSEGV und Crashpad-Startprobleme belegen keine Ursache. Der alternative Server-aus-Lauf belegt einen geschlossenen Downloadkontext ohne zusätzlichen nativen Prozesslog. Kein Test wurde dadurch als bestanden umklassifiziert.
- Ein unabhängiger textueller CI-Review des Workflows fand keinen Blocker; integrierte Browserläufe sind noch offen. Firefox/WebKit und reale iPad-/Android-Geräte sind für diesen funktionalen MVP noch nicht ausgeführt. Playwright-WebKit wäre kein iPad-Nachweis. Native Dateifreigabe wurde nicht auf einem unterstützenden Gerät praktisch geprüft.

```sh
npm run test:app:model
npm run test:app:repository
npm run test:app:workflow
npm run test:app:smoke
npm run test:app:offline-state
BROWSER_ENGINE=chromium npm run test:app
# BROWSER_ENGINE=firefox oder webkit für den zentralen Integrationslauf
```

CI 42235649475 bestätigt den vollständigen fünfschrittigen Ablauf in Chromium 143.0.7499.4 und Firefox 144.0.2; unabhängiger Sol-Rohreview prüfte 22 Quellhashes je Engine, alle Stufen, PDFs/Extraktionen, Backup und Viewportgrenzen. WebKit 26.0 scheiterte vor Stage 1, da der aktivierte Worker-Cache leer war; Ursache ist offen. Das ist kein Drei-Engine-Pass und kein realer Geräte-/G1-Nachweis. Der vorangehende CI 42116489219 und sein Einzelbefund bleiben getrennt im [früheren Archiv](../../docs/reports/evidence/functional-ci-42116489219/manifest.json). [Aktueller Lauf und Belegliste](../../docs/reports/evidence/functional-ci-42235649475/manifest.json); weitere Daten/Quellhashes unter [functional-core-data](../../docs/reports/evidence/functional-core-data/) und [functional-core-app](../../docs/reports/evidence/functional-core-app/).

Die aktuelle lokale Prüfmatrix belegt native IDB 5/5, Modell 3/3, PDF-Modell 2/2, Workflow 4/4, Smoke 2/2 und Offline-State 1/1. Das ist kein vollständiger Offline-PDF-End-to-End-Pass und keine Firefox-/WebKit- oder Gerätefreigabe. Der Screenshotreview dieser Revision war wegen eines sofortigen Chromium-154-Prozessabbruchs in der verwalteten Umgebung nicht verfügbar; es wurde kein zusätzliches Funktionsszenario daraus abgeleitet.

Ein gezielter UI-Review auf Chromium 154.0.8037.57 bestätigte 13/13 Aktionsbuttons innerhalb der Viewports 390, 820 und 1440 px; die echten Arbeitsblattfelder und die feste Checkboxaktion waren sichtbar. Bei 390 px funktionierte Navigation zu „Alle Arbeitsblätter“, Heft und Kapitel. Die zugehörigen kanonischen Worksheet-Viewportbilder und der Bericht liegen unter [UI-Review](../../docs/reports/evidence/functional-ui-review-42116489219/manifest.json). Das ist kein physischer Gerätetest und ersetzt nicht die noch laufende integrierte Browsermatrix.
