# Unabhängiger Review des begrenzten Sicherheitslabors

Stand: 25. Oktober 2026. Separater Code-Reviewauftrag nach [G0](P09-G0.md); geprüfter Anwendungscode-Freeze `a8d75c5`, einschließlich `835e833`, Paket-/Lockstand `11aa073` und Fixtures `d5c9fa9`. Die nachfolgende Harnesskorrektur `4852623` wurde ebenfalls geprüft. Der Reviewer hat den Anwendungscode nicht implementiert. Die gemeldeten Fixes wurden durch den Implementierer vorgenommen und anschließend nachgelesen.

## Ergebnis und Umfang

Für die Fortsetzung des **lokalen Versuchs mit ausschließlich synthetischen Quellen und flüchtigem RAM-State** wurde nach den Korrekturen kein weiterer konkreter Hostprivilegien- oder Codeblocker im statischen Review festgestellt. Das ist keine G1a-/G1b-, Offline-, Persistenz-, PDF- oder Produktfreigabe und keine vollständige Bridge-Abnahme. Tatsächliche Browserwirkungen lassen sich aus dieser Codelektüre nicht bestätigen.

Geprüft wurden `AGENTS.md`, G0/ADR und die normativen Bridge-/Daten-/Testverträge, alle vier Dateien unter `apps/security-lab/src`, Server, Build, Unit-/Importtests, Chromium-/Receiver-/Restoreharness, Laboranleitung und Fixture-Inventar. Gegenstand sind S01/S05–S07 und Teilmessungen S08/S09; S10/S11/S13 und die übrigen Gates werden nicht als abgeschlossen bewertet.

## Gemeldete Befunde und Behandlung

P1 bezeichnet hier einen wesentlichen Funktions- oder Messblocker; P2 einen begrenzten Funktions-/Nachweisfehler. Eine Priorität ist keine Behauptung einer ausgenutzten Hostlücke.

| Priorität / Befund | Auswirkung und Fix im geprüften Stand |
|---|---|
| P1: Radiogruppe konnte unterschiedliche Form-Owner enthalten (`import.ts`, `runner.ts`). | Zwei gleichnamige Radios innerhalb eines Fieldsets konnten über verschiedene `form`-Zuordnungen gleichzeitig ausgewählt sein; der State bildet nur eine Auswahl ab. Der ursprüngliche Import akzeptierte eine entsprechende Minimaldatei. `a8d75c5` verweigert explizite `form`-Attribute und Formelemente innerhalb einer Gruppe; der Runner prüft zusätzlich gleiche tatsächliche Form-Owner. Importregression vorhanden; dynamische Mutation hat einen eigenen Browserfall. |
| P1: Negativtrefferliste wurde vor nachlaufender Receiverkontrolle kopiert (`test/browser.mjs`). | Ein im Receiver bereits geloggter, aber erst später per IPC zugestellter Hit konnte aus der Assertion fallen. `a8d75c5` liest Treffer nach erfolgreicher nachlaufender Kontrollbarriere und entfernt nur deren exakten zufälligen Kontrollpfad. Abschließend müssen unabhängige JSONL-Datei und IPC-Inventar übereinstimmen. |
| P1: WebSocketversuch ohne verifizierte Upgrade-Messung (`test/receiver.mjs`). | HTTP-Positivkontrollen belegten keine vollständige WebSocketinstrumentierung. `a8d75c5` ergänzt unabhängiges Upgrade-Logging und echte erlaubte WS-Kontrollen vor/nach dem Netzwerkfall. HTTPS/WSS sind dadurch weiterhin nicht geprüft. |
| P2: Nativer Formular-Reset änderte unterstützte Werte ohne Statebenachrichtigung (`runner.ts`). | `input`/`change` erfassen native Resetänderungen nicht; bestätigter Hoststate konnte veraltet bleiben. `a8d75c5` erfasst `reset` nach dessen Defaultaktion per Timer. Eine Eingabe→Bestätigung→Reset→leerer-Hoststate-Regression ist als Browserfall vorhanden. |
| P2: „Roundtrip“ prüfte nur initial leeren Restore sowie Teilmengen des Captures (`test/browser.mjs`). | Nichtleere Radio-/Select-/Text-Restauration war durch die Bezeichnung überbeansprucht. Der Fall heißt nun Capture/Checkpoint und prüft alle konkreten Felder. Ein separater [Restoreharness](../../apps/security-lab/test/restore-harness.mjs) verwendet den echten Runnerbundle, Revision 7, nichtleeren State aller fünf Kinds, DOM-Werte und ausbleibende künstliche Eingabeereignisse. |

Zusätzlich wurden die von der Koordination gemeldeten Typecheck-/Initialisierungs- und Cleanupkorrekturen in `835e833` nachgelesen: explizite Host-Nonce-Prüfung und tatsächliches Beenden des geforkten Receiverprozesses einschließlich Evidenzdatei. Ein `ChildProcess` wird nicht mehr wie ein HTTP-Server geschlossen. Startup-/Cleanupfehler werden als fehlgeschlagener Harnesslauf erfasst.

Die Tabelle beschreibt Codekorrekturen und Testdefinitionen. Die anschließend tatsächlich geprüfte Browserevidenz ist unten separat ausgewiesen und bestätigt nur die ausgeführten Einzelorakel.

## Sicherheitsgrenzen und Vertragsabgleich

- **Host und AST:** fremde Bytes werden strikt dekodiert und mit parse5 als Daten verarbeitet. Fremdinhalt wird nicht als Host-DOM übernommen; Dateiname und Stateansicht verwenden `textContent`. Namespace-/Element-/Attributgrenzen, feste Policy-/Bootstrapposition und Noncezuweisung sind im Code erkennbar. Der enge CSS-Filter ist ausdrücklich kein Sanitizer-/Isolationsbeweis. Fehlformatierte HTML-Grenzen benötigen weitere Browserfälle.
- **CSP und Navigation:** Host-Header und Child-Meta folgen dem Nonce-/Schnittmengenansatz aus ADR 0001; die Hostpolicy enthält kein `unsafe-inline`. Das Nachladen externer Skripte mit einem im Runner sichtbaren Nonce muss durch die Childpolicy eingeschränkt werden. Selbstnavigation, Dokumentwechsel vor INIT und mögliche Anfragen werden durch Portwiderruf nicht präventiv verhindert. Zwei verzögerte `location.href`-Fälle ersetzen X02 nicht.
- **Port und State:** Host-Nachrichten werden über einen einmal transferierten Port, Sitzung, Sequenz, Phase, Limits und exaktes Manifest begrenzt; Windownachrichten erhalten keine Hostbefehle. Die geprüften Datenpfade verwenden `Map`/Own-Property-Prüfungen statt frei wählbarer Host-Property-/Funktionspfade. Ein formal gültiger State kann weiterhin vom fremden Skript gefälscht sein. Shared-Realm-Portbesitz, Bootstrap und Nonce sind keine Integritäts- oder Personenbeweise.
- **Snapshot und Crossing:** ein bereits gesendeter Change kann den Request kreuzen; H akzeptiert höchstens einen Crossing-Change, R pausiert weitere Changes und wartet dessen ACK vor dem Snapshot. Die Norm verlangt weiterhin Grenz-/Phasen-/Timeout- und künstlich verzögerte Crossingfälle; deren Existenz oder Erfolg wird nicht aus einem normalen Checkpoint abgeleitet.
- **Bewusste Vertragsabweichung:** bei `STATE_REJECTED`/`SNAPSHOT_REJECTED` endet das Labor mit Protokolldiagnose und verwirft den unbestätigten Kandidaten. Der Runner hat keine getrennte Konfliktanzeige; Storage-/Read-only-Pfade fehlen. Dies ist in [Laboranleitung](../../apps/security-lab/README.md) und [Versuchsbericht](SECURITY-LAB.md) ausdrücklich begrenzt. Vor Persistenz/vollständiger Bridge-Abnahme müssen Kandidatenerhalt und getrennte Fehlerbehandlung dem Vertrag entsprechen.
- **Ressourcen und Offline:** Parserkosten vor Strukturprüfung, Browserkopien vor Validierung und gemeinsames Thread-/Speicherverhalten bleiben Grenzen. Es gibt keine garantierte CPU-/RAM-Quote, keine nachgewiesene Prozessbeendigung und keinen Offline-Neustartnachweis. Der dynamische Loopbackserver ist keine fertige statische/offline Architektur.

## Ausgeführte Reviewprüfungen

Reviewerumgebung: Node `v24.19.0`, npm `11.9.0`, Git `2.52.0`.

- `node apps/security-lab/test/run.mjs`: **12/12 bestanden** auf `a8d75c5`, einschließlich neuer Radio-Importregression.
- `node --check` für `test/browser.mjs`, `test/receiver.mjs` und `test/restore-harness.mjs`: bestanden.
- `git diff --check`: ohne Befund.
- Die Koordination/Implementierung meldete Typecheck und Bundle-Build auf dem Freeze erfolgreich; dieser Reviewer hat sie nicht als eigene Browserprüfung ausgegeben.
- Ein eigener isolierter Chromium-Miniversuch scheiterte bereits beim Browserstart mit `setsockopt: Operation not permitted` und `SIGTRAP`. Das ist ein Umgebungsblocker, kein bestandener oder fehlgeschlagener Radio-Isolationstest.

Nach dem ersten Codebericht wurden die unveränderten Rohbelege des initialen Koordinationslaufs gelesen: [Chromium JSON](evidence/chromium-initial.json) und [Receiver JSONL](evidence/chromium-initial-receiver.jsonl), System-Chromium **154.0.8037.57**, Zeitstempel `2026-10-25T06:21:46.575Z`. Ergebnis: **21 bestanden, 2 fehlgeschlagen**, Exit 1. Das unabhängige Dateiinventar stimmt mit den IPC-Hits überein. Capture, nichtleerer Restore, Reset, Radio-Owner-Abweisung, die definierten Portmissbrauchs-/Originfälle und beide verzögerten `location.href`-Varianten bestanden in diesem Lauf. Die beiden fehlgeschlagenen Fälle werden nicht als bestandene Isolationstests umgedeutet.

Der Netzwerkfall scheiterte an `GET /favicon.ico` mit dem eindeutigen zufälligen `network-after`-Kontrollpfad als Referrer; im Receiverinventar steht kein entsprechender `/blocked`-Angriffshit. Der kombinierte Sandboxfall konnte nach dem externen Downloadlink den nächsten Formular-Klick nicht ausführen, weil der Runner nach einer geblockten Dokumentnavigation entfernt war. Damit waren seine nachfolgenden Aktionen nicht gemessen.

Die gezielte Korrektur `4852623` ist methodisch nachvollziehbar: HTTP-Positivkontrollen verwenden nun echten Browser-`fetch` aus einem frischen vertrauenswürdigen `about:blank` statt einer Navigation mit Faviconnebenwirkung. Nur exakte zufällige Kontrollpfade werden aus den nach der Kontrollbarriere gelesenen Treffern entfernt. Fünf Sandboxaktionen erhalten jeweils einen eigenen Runner, Klick, Vor-/Nachkontrollen und getrennte Download-/Popupzählung; Status und Frame-URLs werden erfasst. Erlaubte Popup- und echte Blobdownload-Kontrollen prüfen zusätzlich die Ereignisinstrumentierung. Kein Faviconpfad oder Angriffsvektor wird pauschal ausgefiltert; keine Policy wird gelockert.

Der finale Koordinationslauf wurde unabhängig anhand [chromium-final.json](evidence/chromium-final.json) und [Receiver-JSONL](evidence/chromium-final-receiver.jsonl) nachgeprüft: System-Chromium **154.0.8037.57**, Zeitstempel `2026-10-25T06:29:44.725Z`, **28/28 bestanden**, von der Koordination mit Exit 0 abgeschlossen. Die gesicherte JSON-Datei stimmt byteweise mit dem aktuellen Harnessartefakt überein (SHA-256 `d85b77bf73e374b1124101c4a190b76c2016029bee9f4532030067e7725a071e`). Externes JSONL, eingebettetes Dateiinventar und IPC-Inventar stimmen vollständig überein.

Alle **18 erwarteten HTTP-Kontrollen und 2 WS-Upgrade-Kontrollen** sind mit eindeutigem zufälligem Kontrollpfad und passender Run-ID vorhanden: Suite vorher/nachher, Netzwerk vorher/nachher einschließlich WS, fünf getrennte Sandboxaktionen vorher/nachher sowie beide Navigationsziele vorher/nachher. Weitere Receiverhits existieren im Lauf nicht. Das Hostinventar enthält ausschließlich `/` und `/host.js`, keine markierte Selbstnavigationsanfrage. Ein zusätzlicher read-only Python-Abgleich prüfte Anzahl, erwartete Fallmenge, Eindeutigkeit und Inventargleichheit; ohne Befund.

Damit liegen in diesem Chromiumlauf erfolgreiche Einzelorakel für alle fünf Feld-Kinds inklusive nichtleerem Restore, Reset, Radio-Owner-Abweisung, die implementierten Portmissbrauchsfälle, den dynamischen HTTP-/WS-Netzwerkfall, erlaubte Popup-/Downloadmesskontrollen, fünf getrennte Sandboxaktionen und die zwei verzögerten `location.href`-Ziele vor. Der externe Downloadlink schließt den Runner als `NAVIGATION`, ohne Receiverhit/Popup/Download; das wird als beobachteter Lebenszyklus dokumentiert und nicht als fortbestehender Runner dargestellt. Konsolenverletzungen sind Zusatzbelege; die Negativaussagen stützen sich auf die positiv kontrollierten Receiver-/Hostinventare. Dies bleibt ein **Chromium-Teilnachweis**, keine G1a-/G1b-Entscheidung oder Aussage über alle Navigations-/Netzwerkwege.

Die zusätzlich gelesene [npm-audit-Rohdatei](evidence/npm-audit.json) meldet null bekannte Findings für den abgefragten Dependency-Stand. Das belegt weder Abwesenheit unbekannter Schwachstellen noch eine allgemeine Lieferketten-/Sicherheitsfreigabe.

## Offene Freigabevoraussetzungen

Eine G1a-Entscheidung benötigt die vollständigen relevanten X01–X04-/X06-/X10-Fälle und normativen Bridgegrenzen unter finaler Policy, getrennte Chromium-/Firefox-/WebKit-Auswertung, belastbare Positivkontrollen und widerspruchsfreie Rohbelege. Der Teilharness deckt insbesondere sofortige Navigation, weitere Zielschemata/Navigationsmechanismen, alte Ports/zweite INIT, volle Phasen-/Ratematrix, künstliche Snapshotrennen und DoS nicht vollständig ab. API-Abwesenheit oder ein einzelner CSP-Konsoleneintrag ersetzt kein Messorakel.

Reale iPad-/Android-Geräte, HTTPS/WSS, Ressourcenversuche mit externem Prozess-Timeout, Offline-Neustart und unabhängige menschliche Sicherheitsprüfung bleiben offen. Die Dependencyprüfung ist ebenfalls kein vollständiger Wartungs-/Advisorynachweis. Keine dieser offenen Voraussetzungen wird durch die Fortsetzung des synthetischen lokalen Labors als erfüllt behandelt.
