# Lokales Sicherheitslabor

Begrenzter G0-Versuch (S01/S05/S06/S07, Teilmessungen S08/S09), kein freigegebenes Produkt. Ausschließlich synthetische HTML-Dateien und RAM-State benutzen. Keine Persistenz, kein PDF, Service Worker oder Deployment.

Voraussetzung: Node 24, npm 11 sowie ein bereits vorhandenes Browserbinary für die gewählte Engine. Chromium verwendet zuerst `CHROMIUM_PATH`, sonst ein vorhandenes `/usr/bin/chromium`, sonst das von Playwright verwaltete Binary. Firefox und WebKit verwenden ihre Playwright-Binaries; `CHROMIUM_PATH` gilt dort nicht.

```sh
npm ci --ignore-scripts --fetch-retries=0 --fetch-timeout=10000 --cache=/tmp/worksheet-npm-cache
npm run typecheck
npm test
npm run build
npm start
```

Die Oberfläche liegt unter `http://127.0.0.1:4173`. „Synthetische Demo“ startet den erlaubten Inline-Classic-Script-Korpus. Alternativ Datei wählen und öffnen. „RAM-Snapshot“ bestätigt nur flüchtigen State, „Schließen“ verwirft ihn. Der Server bindet ausschließlich Loopback. `LAB_PORT` wählt einen anderen Port; kein Devserver/HMR und keine externen Laufzeitressourcen.

```sh
npm run test:browser # standardmäßig Chromium
BROWSER_ENGINE=chromium npm run test:browser
BROWSER_ENGINE=firefox npm run test:browser
BROWSER_ENGINE=webkit npm run test:browser
```

Der Browserlauf startet Host und unabhängigen Receiver auf zufälligen Loopbackports und ein frisches Profil der gewählten Engine. `BROWSER_ENGINE` akzeptiert ausschließlich `chromium`, `firefox` oder `webkit`; andere Werte brechen vor dem Serverstart ab. Rohdaten (Requests, Navigationsereignisse, CSP-Konsole, Fixture-SHA-256, Receiverhits, Resultate) stehen anschließend in `apps/security-lab/test-results/<engine>.json`, einschließlich Engine und Browserversion. Der Rückgabewert ist bei jedem fehlgeschlagenen Kriterium ungleich null. Insbesondere bleiben Navigationslecks fehlgeschlagene Tests. Die Linux-Testumgebung startet Chromium mit `--no-sandbox`; Firefox und WebKit erhalten keine Chromium-Argumente; das HTML-iframe trägt weiterhin exakt `sandbox="allow-scripts"`. Das ist kein Beleg für eine Betriebssystem-Ressourcensandbox.

## Bewusste Teilmenge

`standard-fields` v1 umfasst Text/Input, Textarea, Checkbox, explizite Radiogruppen sowie Single-/Multiple-Select. Die AST-Auswertung bindet ein sortiertes Manifest; fehlende/mehrdeutige IDs, unbekannte Feldtypen oder Optionsinventare werden abgewiesen. `drag-demo` und vollständige persistierbare TemplateVersion-/Instanzentitäten (einschließlich Quellhash) sind nicht implementiert. Originalbytes bleiben unverändert im RAM; normalisierte Darstellung ist nur ein Derivat. HTML-artige Antworttexte bleiben Strings.

Die Port-Bridge implementiert INIT, READY, RESTORE_STATE/RESTORED, STATE_CHANGED/STATE_ACCEPTED, REQUEST_STATE/STATE_SNAPSHOT/SNAPSHOT_ACCEPTED, Konfliktablehnung und CLOSE. Revisionen/CAS gelten nur im RAM. Es gibt keine DB, keinen Storagefehler-/Read-only-Modus und keine Speicherbestätigung `committed`. Hostbefehle für Exporte und Dateien sind nicht vorhanden. Größen-, Struktur-, Token-/Bytefenster-, Sequenz-, Sitzungs-, Phasen- und Handshake-/Snapshotgrenzen werden geprüft. Die vollständige normative Grenzmatrix und Ressourcentests sind weiterhin offen; dieser Versuch behauptet keine vollständige Bridge-Abnahme. Im Konfliktfall ist die Implementierung zusätzlich begrenzt: nach `STATE_REJECTED`/`SNAPSHOT_REJECTED` endet der Kanal mit Protokolldiagnose; ein unbestätigter Kandidat wird verworfen, und der Runner hat keine eigene Konfliktanzeige. Der im vollständigen Vertrag geforderte begrenzte Kandidatenerhalt und die getrennte Fehlerbehandlung sind vor Persistenz nachzuholen.

Der Import unterstützt HTML ohne fremde Frames, SVG/MathML, Templates, Canvas, Module, Handler-/Styleattribute, eigene Nonces, explizite `form`-Zuordnungen oder externe Ressourcen. Radiogruppen dürfen keine Formelemente enthalten; der Runner prüft zusätzlich gemeinsame tatsächliche Form-Owner. Native Formular-Resets werden nach ihrer Defaultaktion erfasst. `<style>` erlaubt hier nur CSS ohne erkennbare `url(`/`@import`-Konstrukte; das ist ein enger Kompatibilitätsfilter, kein CSS-Sanitizer. CSP und opaque Sandbox bilden die zu prüfende Ausführungsgrenze. Aktive Angriffstests erzeugen verbotene Ressourcen dynamisch aus erlaubten Skripten. Geschlossene Shadow Roots und beliebige fremde JS-Objekte sind kein unterstützter State.

Header-/Meta-CSP folgen ADR 0001. Der Bootstrap steht vor importierten AST-Inhalten. Fremdes JavaScript teilt trotzdem den Realm mit dem Adapter und kann Port/State fälschen. Hostvalidierung prüft Schema und Zuordnung, keine inhaltliche Ehrlichkeit. Eine nachträgliche Frameentfernung verhindert keine bereits gesendete Navigationsanfrage.

Aktuelle Evidenz und offene Gates: [SECURITY-LAB.md](../../docs/reports/SECURITY-LAB.md).
