# Begrenztes lokales Sicherheitslabor

Stand: 25. Oktober 2026. Arbeitsauftrag S01/S05/S06/S07 und Teilmessungen S08/S09 nach G0 (`51c367f`). **Keine G1a-/G1b-, Produkt-, Offline-, Persistenz- oder PDF-Freigabe.** Nur synthetische HTML-Quellen und flüchtiger RAM-State.

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
- Offen: Firefox, Playwright-WebKit, reale iPad-/Android-Geräte, Remote-HTTPS/WSS, vollständige X01–X04-/X10-Varianten, künstlich verzögerte Snapshot-/Commitrennen, Ressourcen-/Endlosschleifen-/Allokationstests und Offline-Neustart.
- Das lokale dynamische Nonce-/No-store-Experiment ist keine statisch gehostete oder offline startbare PWA. S10–S13 und die fehlenden Browsernachweise sind vor G1a erforderlich; G1b verlangt reale Geräte. Ein externer unabhängiger menschlicher Sicherheitsreview bleibt vor Schuleinsatz erforderlich.
- Die zwölf lokalen Tests und der Browserharness sind wiederholbar. Ein SHA-gepinnter GitHub-CI-Workflow (S02) mit drei Engines ist inzwischen implementiert; tatsächliche Actions-Läufe stehen noch aus. Der oben belegte 28/28-Lauf betrifft den zuvor geprüften Chromiumstand, keine automatisch bestandene Firefox-/WebKit-Abnahme.
