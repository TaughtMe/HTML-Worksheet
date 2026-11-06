# Kleine Abhängigkeitsauswahl

Stand: 24. Oktober 2026; P08. Entscheidung für den begrenzten S01/S05–S09-Versuch nach G0, noch keine installierte oder auditierte Lieferkette. [ADR 0001](../adr/0001-RUNNER-EXPERIMENT.md) und die Daten-/Bridgeverträge bestimmen die Auswahl.

## Auswahl und Umfang

| Kandidat | Entscheidung / Zweck | Offline-Eignung und Risiko | Aktuelle Version / Lizenz / Pflege |
|---|---|---|---|
| `typescript` | Für Typprüfung/Build vorgesehen. Node-eigener Test-Runner reicht zunächst für Unit-Tests. | Entwicklungswerkzeug; kein CDN zur Laufzeit. Typen ersetzen keine Prüfung untrusted JSON. | **Nicht verifiziert**, siehe Nachweislücke. |
| `vite` | Für kleinen lokalen Bundle-Build vorgesehen; kein React-Plugin im Labor. CSP-Nonce-HTTP-Server bleibt eigene minimale Node-Komponente. | Gebündelte lokale Artefakte; Vite-HMR/WebSocket sind kein freizugebender Laufzeitpfad. Devserver-Policy ist kein Sicherheitsnachweis. | **Nicht verifiziert**. |
| `parse5` | Vorgesehener reiner HTML-AST-Parser; kein DOMParser-/Host-DOM-Import und kein Regex-Sanitizer. | Lokal bündeln, keine externen Assets. Parsing/Serialisierung und fehlerhaftes HTML müssen den festen CSP-Präfix erhalten. Parser ist Teil der kritischen Lieferkette. | Kandidat **7.3.0**, Registry-Lizenzfeld **MIT** verifiziert; kein Latest-/Auditnachweis, Tarball-Lizenztext/Pflege offen. |
| `@playwright/test` | Für getrennte Chromium-/Firefox-/WebKit-Läufe vorgesehen; System-Chromium zuerst nutzbar. | Nur Testwerkzeug; Browserbinaries müssen vorab bereitstehen. Playwright-WebKit ersetzt keinen Safari-/iPad-Test. | **Nicht verifiziert**. |
| Direkte IndexedDB / `dexie` | Keine Persistenzabhängigkeit im Sicherheitslabor. Native API als erste D01-Baseline; Dexie nur nach kleinem Transaktions-/Migrationsvergleich. | Beide können lokal arbeiten; Quota, Tabrennen und Abbruch bleiben Anwendungsaufgabe. | Dexie-Version, Lizenz, Pflege und Bündelgröße **offen**. |
| `react` / `react-dom` | Im Labor nicht einbinden; spätere Produktoberfläche separat entscheiden. | Kein Bedarf für Import/Öffnen/Schließen/Diagnose. | Versionen, Lizenzen und Pflege **offen**. |
| Browserdruck, `pdf-lib`, `jspdf` + `html2canvas` | Nur E01-Vergleichskandidaten, jetzt keine PDF-Abhängigkeit. | Druck ist keine überall verfügbare Dateierzeugung. PDF-Zusammenstellung rendert nicht automatisch HTML; DOM-/Bildrenderer erfordern isolierten Kontext und Seiten-/Speicherlimits. Kein fremdes DOM in H übernehmen. | Bibliotheksversionen, Lizenzen, Pflege, Qualität und Plattformverhalten **offen**. |

Browser-native APIs (`File`, `TextDecoder`, Web Crypto, `MessageChannel`, später IndexedDB) benötigen keine zusätzliche JS-Laufzeitbibliothek. Keine CDN-Bibliotheken, Analytics, generischen Pluginlader oder Host-HTML-Renderer im Labor. Runtime-Code wird nur als lokales Build-Artefakt ausgeliefert; Service Worker und statische/offline Nonce-Lösung bleiben eigene spätere Prüfungen.

## Tatsächlich vorhandener Nachweis

Die Koordination hat Node **24.19.0**, npm **11.9.0** und System-Chromium **154.0.8037.57** unter `/usr/bin/chromium` vorgeprüft. Das Repository enthält vor S01 keine Paket-/Lockdatei. Eine gebündelte npm-Metadatenabfrage für obige Pakete (`npm view <paket> version license engines dependencies time.modified dist.integrity --json`) lieferte kein einziges Paketresultat; der Toolaufruf endete nach ca. 3.878 Sekunden mit **„aborted by user“**. Ursache innerhalb der Abfrage ist unbekannt, kein bestimmter Registry- oder Lizenzfehler nachgewiesen. Weitere Netzwerkversuche wurden beendet.

Eine anschließende **begrenzte Root-Abfrage** war erfolgreich: `npm view parse5@7.3.0 version license dist.integrity --json --fetch-retries=0 --fetch-timeout=10000 --cache=/tmp/worksheet-npm-cache`. Registryergebnis: Version `7.3.0`, Lizenzfeld `MIT`, Integritätswert `sha512-IInvU7fabl34qmi9gY8XOVxhYyMyuH2xUNpb2q8/Y+7552KlejkRvqvD19nMoUW/uQGGbqNpA6Tufu5FL5BZgw==`. Das verifiziert Metadaten eines möglichen Releases, nicht dessen Aktualität oder den tatsächlich heruntergeladenen Tarball. Lokal ist außerdem Playwright unter `/opt/codex/cua_node/lib/node_modules/playwright` beziehungsweise `playwright-core` vorhanden; Paketversion/Lizenz wurden dabei nicht geprüft.

Alle anderen Paketversionen sowie sämtliche Lizenztexte, Wartungsstände, Transitivabhängigkeiten und Advisorylagen bleiben ungeprüft. Eine aus Erinnerung vermutete Lizenz ist keine Verifikation. Referenzquellen für S01: jeweilige Paketansicht unter `https://www.npmjs.com/package/<paket>`, Registry-Metadaten, gepinntes Release/Tarball und dortiger LICENSE-/NOTICE-Text. Außer dem genannten Registryabruf sind diese Quellen hier nicht als erfolgreich abgerufen dargestellt.

## Begrenzte Folgeschritte in S01

Vor erster Paketinstallation funktionierenden Registryzugriff mit kurzem Timeout prüfen; bei Blocker konkrete Fehlermeldung dokumentieren, nicht unbeschränkt wiederholen. Exakte stabile Versionen samt Node-Engines auswählen und pinnen; `package.json` und Lockdatei gemeinsam committen. Für gewählte direkte und aufgelöste transitive Pakete Lizenz/NOTICE am tatsächlich gepinnten Artefakt, Release-/Pflegestand und bekannte Advisories erfassen; unbekannte Befunde offen lassen. Offline-Build-/Startnachweis erfordert vorhandene Artefakte und ist nicht allein durch das Fehlen von CDN-URLs erbracht.

G0 kann diese kleine **vorläufige** Auswahl und die Nachweislücken reviewen. Es bestätigt keine Lizenzfreigabe und keinen reproduzierbaren Build. S01 darf ohne konkrete Versionen, Lockdatei und dokumentierte Prüfung keine abgeschlossene Lieferkette behaupten; unzulässige oder ungeklärte Lizenzbefunde blockieren die betroffene Einbindung. PDF-Kandidaten erst in E01 auswählen und prüfen.
