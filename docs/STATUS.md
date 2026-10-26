# Entwicklungsstand

Stand: 25. Oktober 2026. Dieser Status beschreibt belegte Ergebnisse; der Entwicklungsplan beschreibt Ziel und Reihenfolge.

| Abschnitt | Status | Evidenz / nächster Schritt |
|---|---|---|
| Repository und Entwicklungsplan | Erledigt | `main`, ursprünglicher Plancommit `72807f9` |
| P01 Anforderungen | Erledigt | [Anforderungen](spec/ANFORDERUNGEN.md), [Abdeckungsprüfung](reports/P01.md) |
| P02 Experimente | Reviewt | [Browserexperimente](spec/EXPERIMENTE.md), Ergebnisse noch offen |
| P03–P06, P08 Spezifikation | Reviewt | Bedrohungsmodell, Architektur- und Schnittstellenverträge; installiertes [Dependencyinventar](reports/DEPENDENCIES.md) vorhanden |
| P07 Testmatrix | Erledigt | [Testmatrix](spec/TESTMATRIX.md): 32 Anforderungen, 14 Bedrohungen, zehn Experimente zugeordnet |
| P09 / G0 | Begrenzt freigegeben | [Unabhängiges Review](reports/P09-G0.md), Commit `51c367f`; nur lokales Labor mit synthetischem RAM-State |
| S01, S03–S09 Sicherheitsprototyp | Begrenzter Kern implementiert | Typecheck, Build, 12 Unit-/Importtests und je 28 Fälle in Chromium/Firefox/WebKit bestanden; [Umfang und Grenzen](reports/SECURITY-LAB.md) |
| S02 CI | Positiver Lauf nachgewiesen | [Actions-Lauf 40219223224](https://github.com/TaughtMe/HTML-Worksheet/actions/runs/40219223224) erfolgreich: 12 Unittests und je 28 Browserfälle; absichtlich fehlschlagender Voll-CI-Lauf noch offen |
| S10 | Drei-Engine-Messlauf mit offenem Verfügbarkeitsbefund | [Bericht und Rohbelege](reports/S10.md): Chromium/Firefox wegen RSS-Budget vor Angriff inconclusive; WebKit-Loop zeigt UI-Stillstand. G1a/S13 offen; keine DoS-Freigabe |
| S11 | Designvorbereitung abgeschlossen | ADR-Entwurf [0001](adr/0001-RUNNER-EXPERIMENT.md), Commit `3bd0b37`; keine Implementierung und kein Offline-Nachweis |
| S12–S13 | Ausstehend | Evidenzbericht und unabhängiger Sicherheitsreview bleiben erforderlich |
| G1a / G1b | Nicht freigegeben | S10 meldet WebKit-Verfügbarkeitsrisiko; Chromium/Firefox-RSS-Kalibrierung, übrige Versuchsmatrix, Offline und reale Geräte fehlen |
| Speicherung, PDF und Produkt-PWA | Ausstehend | Nach den jeweiligen Gates |
| Cloudflare | Nicht eingerichtet | HTTPS-Testhosting erst nach G1a erforderlich |

Es gibt noch keine Sicherheitsfreigabe, keine Garantie für beliebiges fremdes JavaScript und keine Freigabe zur Verarbeitung echter Schülerdaten.

## G1a-Lücken gegenüber den 28 Browserfällen

Die 28 Fälle belegen ausgewählte Interaktionen: Inline-Classic-Script, Host-Header-CSP/Nonce, ausgewählte dynamische HTTP-/WS-Sinks, Popup/Download/Form/Top-Sandboxaktionen, `location.href` zu E und H sowie einzelne Bridge-Fehler. Folgende Varianten bleiben offen. Unit-Tests für Parser-/JSON-/Token-Budgets sind ergänzende lokale Evidenz, aber keine Browserabdeckung oder Gatefreigabe.

| Offener Subfall | Zuständiges Paket; Browser und beobachtbares Orakel | Gatepflicht |
|---|---|---|
| X01: finale `srcdoc`-Policy mit Header-/Meta-CSP und Parent-`frame-src` prüfen. Blob und normal geladene R-Seite sind Vergleichs-/Alternativexperimente, keine Pflicht für eine nicht gewählte Architektur; nur bei entsprechender ADR-Entscheidung oder Versuchsergebnis nachziehen. | S08; Chromium, Firefox, Playwright-WebKit einzeln. Für die tatsächlich gewählte Policy effektive CSP und Skriptmarker protokollieren; Meta darf nicht lockern. Alternativen nur bei Auswahl gleichwertig prüfen. | G1a für finale Architektur, jede freizugebende Engine |
| X01: Inline-Modul, dynamischer Import, `blob:`-/`data:`-Script, Worker und CSP-Meta-Grenzen. Bisher positiver Classic-Scriptmarker sowie `eval`/Handler geprüft. | S08; dieselben drei Engines. Erlaubte/verbotene Marker einzeln protokollieren; jeder unerlaubte Lauf blockiert. | G1a |
| X02: `location.assign`/`replace`, sofortige und verzögerte Navigation, `target=_self`-Link mit/ohne Klick sowie GET-/POST-Formular und Laufzeit-Meta-Refresh. Bisher nur verzögertes `location.href`; statisches Meta-Refresh wird beim Import abgewiesen. | S08; dieselben drei Engines. Frame-URL/`load`, Host- und Receiverlogs; jeder verbotene Request ist Fail. | G1a |
| X02: Ziele zu R und URLklassen `data:`, `blob:`, `about:blank`, relative und Fragmentziele. Bisher Receiver- und Host-HTTP-Ziele. | S08; dieselben drei Engines. H/R/E-Requestlogs und Framezustand beobachten; jeder verbotene Ausgang ist Fail. | G1a |
| X02: Navigation nach erneutem Dokument-`load`, nach Bridge-Setup und bei Fragmentwechsel; Widerruf gegen verspätete Nachricht getrennt prüfen. | S08/S10 (Lifecycle parallel in Arbeit); dieselben drei Engines. `load`, Kanalstatus und Receiverhits zeitlich ordnen; Widerruf heilt keinen schon gesendeten Request. | G1a |
| X03: explizite `https:`, `wss:` und protocol-relative Ziele sowie Referrerlecks. Bisher Receiver HTTP und WebSocket-Kontrolle, aber nicht diese Ziel-/Referrerklassen. | S08; dieselben drei Engines mit Positivkontrolle je Messpfad. Kein verbotener Receiver-/Hosthit und keine unerlaubte Referrerinformation. | G1a |
| X03: `srcset`, Fonts, Media-Poster, Anchor-`ping` und eigenständige Prefetch-/Preloadvarianten. Bereits geprüft sind Image, ausgewählte Script-/Frame-/Media-Tags, `link rel=prefetch` und CSS-URLs. | S08; dieselben drei Engines. Separater E-Receiver und Requestinventar; jeder verbotene Treffer ist Fail. | G1a |
| X04: fremder opaque Geschwisterframe sendet dieselbe `READY`-/Window-Nachricht. Bisher nur `parent.postMessage`-Spoof aus aktivem Runner. | S07/S09; dieselben drei Engines. Nur fest gebundene aktive Source/Port darf Status oder State ändern; `origin: null` allein nie akzeptieren. | G1a |
| X04: tatsächliches Wiederverwenden eines alten Ports nach Ersatz/Neusitzung, zweite INIT/Portübertragung und wiederholtes Öffnen/Schließen. Bisher falsche Session/Replay und neuer Runner ohne alten RAM-State. | S07/S10 (Lifecycle parallel in Arbeit); dieselben drei Engines. Alte Sitzung darf keinen neuen State ändern; jeder widerrufene Kanal bleibt geschlossen. | G1a |
| X04/Bridge: Sequenzlücke/-sprung, doppelte READY-/Restoreantwort, ungültige Phase, zusätzliche Ports und unbekannte Payloadfelder. Browserfälle prüfen falsche Version/Session, Nicht-String, Übergröße und Replay, nicht diese Fälle. | S07; dieselben drei Engines. Protokollfehlercode und Kanalabschluss; keine Stateänderung. | G1a |
| Bridge-Bytes: UTF-16- und UTF-8-Nachrichtengrenze an/über 393.216 Bytes, 256-KiB-State und Host-Ausgangslimits. Unit-Tests prüfen einen Teil der Umschlaggrenzen; Browserlauf prüft nur übergroße Nachricht. | S07; dieselben drei Engines. Je Validierungsschicht mit sonst gültigem Inhalt Limit und Limit+1 prüfen; schema-ungültige Payloads bleiben auch am Byte-Maximum ungültig. | G1a |
| Bridge-JSON: Tiefe, Gesamtwerte, Array-/Objektgrößen, Schlüssel-/Stringlänge und verbotene Prototypschlüssel über den integrierten Kanal. Unit-Tests decken einzelne Grenzen ab, nicht Browser-Integration/alle Grenzpaare. | S07; dieselben drei Engines. Exakte Grenzreaktion/Sessionverschluss und unveränderter State. | G1a |
| Bridge-Rate: Token-Bucket-Burst/Refill, 4-MiB/10-s-Fenster, ungültige Nachrichten ohne Budgetreset und Hostausgangsrate. Token-Bucket-Unit-Test vorhanden, kein gleichwertiger Browserlauf. | S07/S10; dieselben drei Engines. Zeitgestempelte Requests; Überschreitung schließt Sitzung, keine unbeschränkte Queue. | G1a |
| Bridge-Zeitlimits: verspätetes/fehlendes `READY`/`RESTORED` und Snapshottimeout; normale Fälle warten auf Aktivierung, provozieren aber keine Ablaufgrenzen. Der 5-s-DB-Committimeout gehört zur Persistenzphase. | S07/S10; dieselben drei Engines. 3-s-Handshake und 2-s-Snapshot mit Abschlussdiagnose/ohne falsche Bestätigung belegen; DB-Commitfrist mit dem Speichervertrag prüfen. | G1a für Handshake/Snapshot; G2/D05–D06 für DB-Commit |
| X10: Kamera/Mikrofon, Geo, Clipboard, Fullscreen, Pointer Lock, Screen Capture, Payment, USB/Bluetooth/Serial, File Picker und Share-APIs samt Permissions-Policy. Bisher Popup-/Download-/Form-/Top-Sandboxwirkungen, keine API-Matrix. | S09; APIs je Chromium, Firefox, Playwright-WebKit separat. Verfügbare Wirkung/Dialoge und gesetzte Policy erfassen; fehlende API ist kein Pass. | G1a Engineprüfung; echte verfügbare Gerätewirkungen zusätzlich G1b |
| X10: privilegierte API und native Dialoge jeweils mit/ohne echte Nutzeraktivierung. Bisher Klickkontrollen für Popup/Download, aber keine Geräteberechtigungs-Prompts. | S09; zuerst B1, dann reales iPad/Safari und Android/Chrome. Kein unerwarteter Zugriff/Prompt; reale Geräteversion und Nutzeraktion protokollieren. | G1a für Enginefälle; G1b zwingend für Geräte |
| X07: echter Offline-Neustart nach Browserprozess-/Geräteneustart ohne warmen Tab, Netzabruf oder fehlende Appressource. | S11; B1 und reale iPad-/Android-Geräte; keine Ressource nach Erstladen, lokale Demo erneut startbar. | G1a Desktopnachweis; G1b auf realen Geräten |

G1a bleibt bis zur Durchführung und Prüfung der für den freizugebenden Umfang einschlägigen Browserfälle offen. G1b bleibt zusätzlich von realen Geräten und deren Ergebnissen abhängig. S10-Ressourcen- und Lifecycleversuche laufen parallel; S11-Offlineversuch ist offen. Keine der genannten Lücken wird durch die vorhandenen 28 Ergebnisse als erledigt gewertet.

## Agentenzuordnung

Die Namen sind interne Aufgabenkennungen, keine separat zu verwaltenden Nutzerchats. Der Stand wird bei Meilensteinen aktualisiert und ist kein Live-Dashboard.

| Agent | Modell / Stufe | Zuletzt belegtes Ergebnis |
|---|---|---|
| `p01_requirements` | Luna / medium | P01/P07, S03/S04-Fixtures, Dependencyinventar, S02-CI und G1a-Gapcheck integriert; derzeit kein Limitblocker |
| `technical_spec` | Sol / xhigh | Bedrohungsmodell, Architektur- und Daten-/Bridgeverträge; S11-Designvorbereitung in Commit `3bd0b37`, Implementierung und Offline-Nachweis offen |
| `security_prototype` | Sol / high | Standard-CI je 28 Fälle; S10-Matrix: WebKit-Loop mit UI-Stillstand, Chromium/Firefox wegen RSS-Baseline inconclusive; Follow-up offen |
| `g0_review` | Sol / high | Unabhängiges G0-/Codereview und Abgleich der 28 Chromiumresultate |

Die Koordination integriert die Commits, führt gemeinsame Prüfungen aus und veröffentlicht die Ergebnisse. Routinekoordination erhält kurze Zusammenfassungen; technische Eskalationen werden getrennt von normaler Implementierung behandelt. Die verbindlichen Regeln zur Aufwandsbegrenzung stehen in [AGENTS.md](../AGENTS.md).
