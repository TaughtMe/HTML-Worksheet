# Begrenztes lokales Sicherheitslabor

Stand: 27. Oktober 2026. Arbeitsauftrag S01/S05/S06/S07 und Teilmessungen S08/S09 nach G0 (`51c367f`). **Keine G1a-/G1b-, Produkt-, Offline-, Persistenz- oder PDF-Freigabe.** Nur synthetische HTML-Quellen und flüchtiger RAM-State.

## Ergebnis

Der lokale Viewer ist implementiert und auf dem korrigierten Code-/Harnessstand `4852623` geprüft. Node **24.19.0**, npm **11.9.0**, System-Chromium **154.0.8037.57**, Linux. Die Paketinstallation gelang mit zusätzlichen Netzwerkrechten; frühere Proxy-/Loopback-EPERM-Fehler waren Grenzen der Ausführungsumgebung und keine App-Testergebnisse.

| Prüfung | Ergebnis | Beleg |
|---|---|---|
| `npm run typecheck` | Bestanden | TypeScript 5.9.3, keine Typfehler nach Noncekorrektur |
| `npm test` | 12/12 bestanden | Direkte node:test-Ausführung, Contract-/Import-/Grenzwertfälle |
| `npm run build` | Bestanden | esbuild 0.25.12, lokales Host-/Runnerbundle |
| `npm run test:browser` | 28/28 bestanden, Exit 0 | [Unveränderte Rohdaten](evidence/chromium-final.json), [unabhängiges Receiver-JSONL](evidence/chromium-final-receiver.jsonl) |
| `npm audit --json` | 0 bekannte Advisories, Exit 0 | [Registryantwort](evidence/npm-audit.json), [Dependencyinventar](DEPENDENCIES.md) |

Der finale Browserlauf endete um **2026-10-25 06:29:44 UTC** (07:29:44 Europe/Berlin nach der Zeitumstellung). Receiverdatei und IPC-Inventar wurden vom Harness abgeglichen. Die Rawdatei enthält Zufallsports, Lauf-ID, Fixtures-Hashes, Browser-/Hostrequests, Navigationen, CSP-Konsole, Kontrollen und Einzelresultate. Die ursprüngliche temporäre Receiverlogadresse darin gehört zur Ausführungsumgebung; die oben verlinkte Datei ist die unveränderte archivierte Kopie. Auditfreiheit bedeutet keine Garantie gegen unbekannte Schwachstellen; Release-/Wartungshistorien bleiben separat zu prüfen.

## Was tatsächlich vorhanden ist

Ein nur an Loopback gebundener HTTP-Server liefert Nonce-CSP und lokale Artefakte. Der Host importiert Einzeldateien über einen reinen parse5-AST, erzeugt ein Feldmanifest und startet genau einen opaque `sandbox="allow-scripts"`-Runner. Der Host erhält ausschließlich schema-, sitzungs-, sequenz-, größen- und ratengeprüfte Zustandsnachrichten. Metadaten und Antworten erscheinen im Host als Text. Originalbytes und Zustand bleiben ausschließlich im RAM.

`standard-fields` unterstützt Text/Input, Textarea, Checkbox, explizite Radiogruppen und Single-/Multiple-Select. Die Browserfälle prüfen aktive erlaubte Skripte, vollständiges Capture/Checkpoint, echte nichtleere Wiederherstellung am Runnerbundle (Revision 7), native Formular-Resets und ungültige Radio-Formzuordnung. Der Restoretest verwendet einen eigenen vertrauenswürdigen Testhost mit derselben strikten CSP; er ist kein IndexedDB- oder Neustartnachweis. Start- und Prüfkommandos: [Laboranleitung](../../apps/security-lab/README.md).

Weitere tatsächlich geprüfte Fälle: Dateigröße und UTF-8, Metadaten-XSS, fehlerhaftes HTML/Policypräfix, Parent-DOM-/Storage-Isolation, Window-Spoofing, falsche Portversion/-sitzung, übergroße bzw. nicht-stringförmige Nachrichten und Replay; dynamische HTTP-/WS-Ausgänge; eval/Handler; je separate Popup-, externe Downloadlink-, Blobdownload-, Formular- und Top-Navigationsfälle; `location.href` zum Receiver und Host; neue Sitzung ohne alten RAM-State.

## Messverfahren und erste fehlgeschlagene Versuche

Host und unabhängiger Receiver laufen in separaten Prozessen auf zufälligen Loopbackports. Erlaubte Browser-HTTP- und WebSocket-Kontrollen mit zufälligen Markern beweisen den Messpfad vor/nach verbotenen Fällen. HTTP-Kontrollen verwenden `fetch` aus einer eigenen vertrauenswürdigen about:blank-Seite. Receiverhits werden erst nach der Kontrollbarriere gelesen; nur exakte Kontrollmarker werden herausgenommen, keine beliebigen Favicon- oder Angriffspfade. Receiverdatei und IPC-Hits müssen übereinstimmen. Erlaubte Popup-/Blobdownload-Kontrollen prüfen die Ereignismessung.

Der erste Lauf hatte **21 bestandene und 2 fehlgeschlagene Fälle**, Exit 1: [Initiale Rohdaten](evidence/chromium-initial.json), [initiales Receiver-JSONL](evidence/chromium-initial-receiver.jsonl). Eine navigierte Kontrollseite erzeugte selbst GET /favicon.ico; der Referrer identifizierte den Kontrollkontext. Der kombinierte Sandboxfall brach nach einem blockierten externen Downloadlink beim nächsten Klick ab, weil der Runner nach Wechsel in ein Fehlerdokument entfernt war. Diese Fehler wurden nicht weggefiltert: die Kontrollnavigation wurde durch fetch ersetzt, und fünf Sandboxaktionen erhielten je einen frischen Runner. Die Wiederholung besteht alle 28 Fälle.

Die beiden getesteten Selbstnavigationen erzeugten innerhalb des Zehn-Sekunden-Fensters keine unerlaubte Receiver-/Hostanfrage. Chromium wechselte dabei in ein Fehlerdokument und der Host widerrief den Runner. Das ist ein Nachweis dieser zwei Varianten und Engine, keine vollständige Navigationsgarantie. Weitere dynamische Fälle haben mindestens drei Sekunden Beobachtungszeit. Der Harness läuft mit Chromium `--no-sandbox`; die HTML-iframe-Sandbox bleibt aktiv, aber eine Betriebssystem-Ressourcensandbox wird nicht behauptet.

## Reviewkorrekturen

Das unabhängige [Code- und Methodenreview](PROTOTYPE-REVIEW.md) führte zu Korrekturen bei Radio-Form-Ownern, nativen Resets, nichtleerer Restoreabdeckung, nachlaufenden Receiver-Messbarrieren und WebSocket-Kontrollen. Zusätzlich wurden fehlender/leerer Hostnonce, ChildProcess-Cleanup und JSONL-Zeilentrennung korrigiert. Typecheck, Unit-/Importtests und der finale Browserlauf prüfen den korrigierten Stand.

## Bewusste Grenzen und nächste Freigaben

- Nur synthetisches RAM-Labor; keine Schülerarbeiten, IndexedDB, Arbeitshefte, PDF, PWA-Installation oder Cloudflare-Veröffentlichung.
- `drag-demo`, persistente Vorlagen-/Instanzentitäten und vollständige normative Bridgegrenzmatrix sind nicht implementiert bzw. abgenommen. Konflikte führen aktuell zu Protokolldiagnose/Kanalabschluss; eigener Konfliktstatus und Erhalt des unbestätigten Kandidaten sind vor Persistenz nachzuholen.
- Fremdes Skript teilt den Realm mit Adapter/Bootstrap und kann gültigen State fälschen; validiert werden Format und Zuordnung, keine inhaltliche Ehrlichkeit.
- Offen: über den unten beschriebenen Teilkorpus hinausgehende Engineprüfungen, reale iPad-/Android-Geräte, Remote-HTTPS/WSS, vollständige X01–X04-/X10-Varianten, künstlich verzögerte Snapshot-/Commitrennen, Ressourcen-/Endlosschleifen-/Allokationstests und Offline-Neustart.
- Das lokale dynamische Nonce-/No-store-Experiment ist keine statisch gehostete oder offline startbare PWA. S10–S13 und die fehlenden Browsernachweise sind vor G1a erforderlich; G1b verlangt reale Geräte. Ein externer unabhängiger menschlicher Sicherheitsreview bleibt vor Schuleinsatz erforderlich.
- Die zwölf lokalen Tests und der Browserharness sind wiederholbar. Ein SHA-gepinnter GitHub-CI-Workflow (S02) mit drei Engines ist implementiert. Der nachfolgende Abschnitt dokumentiert den tatsächlich erfolgreichen ersten Matrixlauf; die vollständigen Sicherheitsgates bleiben offen.

## Automatisierter Drei-Engine-Lauf

[GitHub Actions 40188997045](https://github.com/TaughtMe/HTML-Worksheet/actions/runs/40188997045), Quellencommit `55214c6317e313e6fad6025b050665dd235667c5`, Ubuntu 24.04/Node 24: Checkjob (Typecheck, zwölf Unit-/Importfälle, Build) sowie alle drei Browserjobs erfolgreich. Der Testkatalog wurde unverändert zwischen den Engines verwendet; keine Erwartungen wurden zum Erreichen eines grünen Ergebnisses gelockert.

| Engine | Beobachtete Version | Einzelresultate | Archivierte Rohdaten |
|---|---|---|---|
| Chromium | 155.0.8059.0 | 28/28 bestanden | [Report](evidence/ci-40188997045/chromium.json), [Receiver](evidence/ci-40188997045/chromium-receiver.jsonl) |
| Firefox | 144.0.2 | 28/28 bestanden | [Report](evidence/ci-40188997045/firefox.json), [Receiver](evidence/ci-40188997045/firefox-receiver.jsonl) |
| Playwright-WebKit | 26.0 | 28/28 bestanden | [Report](evidence/ci-40188997045/webkit.json), [Receiver](evidence/ci-40188997045/webkit-receiver.jsonl) |

Die Koordination hat alle drei Artefakte über GitHub geladen, ihre ZIP-SHA-256 mit dem jeweiligen GitHub-Artefaktdigest verglichen und vor dem Lesen auf zwei Dateien und maximal 1 MB entpackte Daten begrenzt. Je Engine stimmen unabhängiges JSONL, embedded Receiverdatei und IPC-Hits überein: 18 HTTP-Kontrollen und zwei WebSocket-Upgrades. Alle 28 Fallresultate sind positiv. [Prüfsummenmanifest](evidence/ci-40188997045/manifest.json). Die Rohdateien bleiben im Repository erhalten, während native CI-Artefakte nach sieben Tagen ablaufen.

Die Engineauswahl ist auf chromium/firefox/webkit begrenzt; ein ungültiger Wert wurde lokal als Abbruch vor Serverstart geprüft. CI verwendet minimale Leserechte, gepinnte Action-SHAs, getrennte Jobs und Artefakte, keinen Deployment- oder Secretzugriff. Der Browserjob hängt von erfolgreichen Basistests ab. Pushläufe sind auf main beschränkt; Pull Requests werden geprüft. Dokumentationsfilter vermeiden reine Dokumentationsläufe, wobei GitHub für Pull Requests deren gesamten Diff betrachtet. Ein absichtlich fehlschlagender kompletter CI-Lauf wurde noch nicht durchgeführt; lokale Negativtests und ihre Abbruchcodes sind belegt.

84 erfolgreiche Einzelprüfungen über drei Engines bedeuten nicht 84 unterschiedliche Angriffsklassen. Playwright-WebKit auf Linux ersetzt weiterhin keinen realen iPad-/Safari-Test. Der Korpus bleibt der begrenzte Prototypnachweis; Ressourcenmissbrauch, Offline-Neustart, vollständige Variationsmatrix und Gerätefreigaben fehlen.

## MSG01 – vier zusätzliche aktive Bridge-Protokollfälle

Commit `b77ac4c` fügt dem 28-Fall-Korpus vier Fälle für Nachrichten auf einem bereits aktiven MessagePort hinzu. Der gezielte lokale Chromium-Lauf mit Node `v24.19.0` und Chromium `154.0.8037.57` bestand **4/4** (`/tmp/msg01-local.mjs`; kein eingecheckter Harnessstarter). Geprüft wurden `sequence-gap` (Sequenzsprung bei `STATE_CHANGED`), `duplicate-ready` (zweites `READY` in aktiver Phase), `unknown-payload-field` (zusätzliches Feld auf `STATE_CHANGED`) und `additional-port` (zusätzlicher übertragener Port bei `STATE_CHANGED`).

Jeder Fall legt zunächst einen gültigen synthetischen Wert mit Revision 1 an, sendet dann die jeweilige ungültige Nachricht auf dem echten aktiven Hostport und prüft, dass der unzulässige Wert nicht übernommen wird, der Host `closed · PROTOCOL` meldet und den Runner entfernt. Eine neue synthetische Demo erhält Revision 0 ohne alten RAM-State. Der lokale Rohreport wurde nicht ins Repository kopiert; sein SHA-256 ist `edc0e459111cb960e1fd52c629a8e26ff5e14defd5d3bf5b808850e5dbf53917`.

Der bisherige Standard-CI-Lauf [40403028340](https://github.com/TaughtMe/HTML-Worksheet/actions/runs/40403028340) bestand **28/28 Fälle je Chromium, Firefox und WebKit**; die vier MSG01-Fälle waren darin noch nicht enthalten. Der unabhängige Sol-Code-/Testreview für Implementierung und Harness ist erfolgt; er ersetzt die noch ausstehenden G1-Prüfungen.

Der integrierte Lauf [40444302241](https://github.com/TaughtMe/HTML-Worksheet/actions/runs/40444302241) bestand Checks und **32/32 Browserfälle in jeder Engine**, einschließlich der vier neuen MSG01-Fälle. Getestete Versionen: Chromium **155.0.8059.0**, Firefox **144.0.2**, Playwright-WebKit **26.0**. Je Engine stimmen 20 Receiver-Treffer zwischen IPC-Erfassung und unabhängiger Receiverdatei überein (18 HTTP-Kontrollen, 2 WebSocket-Upgrades). [Archivierte Reports, Receiverlogs und Prüfsummenmanifest](evidence/msg01-ci-40444302241/manifest.json). Das belegt die konkret aufgeführten Varianten in diesen Engines, schließt weder X04 allgemein noch G1a und ersetzt keine realen Geräteprüfungen.


## MSG02 – zwei zusätzliche Bridge-Phasenfälle

Der Teststand `a0dfeac` erweitert den realen Host-/Runner-/Session-/MessagePort-Harness um `duplicate-restored` (zweites `RESTORED` nach aktiver Phase) und `unsolicited-snapshot` (`STATE_SNAPSHOT` ohne offene Zustandsanforderung). Der gezielte lokale Lauf mit Node **24.19.0** und Chromium **154.0.8037.57** bestand **2/2**. In beiden Fällen wird zunächst ein gültiger Zustand angelegt; danach darf der ungültige Phasenübergang keinen unerlaubten Zustand annehmen, das Protokoll muss geschlossen und eine neue Demo ohne alten RAM-State gestartet werden. Der lokale Rohreport unter `apps/security-lab/test-results/bridge-phases-chromium.json` hat SHA-256 `10df80bfd5d06670e7b7b3dae5fd59f5e69a2cf4f8f99c070a4f849a7b63a41d`; er wurde nicht als Produkt- oder G1-Freigabe gewertet.

Der unabhängige Sol-Code-/Testreview hat keine Blocker für den CI-Lauf gefunden, erteilt aber keine Produktfreigabe. Der neue Standardlauf [40459551330](https://github.com/TaughtMe/HTML-Worksheet/actions/runs/40459551330) stammt von Commit `5dddd1211c444a28fb01be8a4d052102a5801bf5` (Tree `d806e90aa7687cbbe44c937b504ba5a7d42c3b90`). Checks und alle Browserjobs bestanden. Chromium **155.0.8059.0**, Firefox **144.0.2** und Playwright-WebKit **26.0** bestanden je **34/34** Browserfälle; darunter beide MSG02-Fälle. Reports und Receiverlogs aller drei Engines sind im [Evidenzarchiv](evidence/msg02-ci-40459551330/manifest.json) mit Artefakt-ZIP-Prüfsummen abgelegt. Der ältere Lauf [40444302241](https://github.com/TaughtMe/HTML-Worksheet/actions/runs/40444302241) bleibt separat bei **32/32 je Engine** und umfasst nur MSG01. Weitergehende X04-Phasenvarianten sowie G1a/G1b bleiben offen.
