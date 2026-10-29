# Offene Annahmen und Browser-Experimente

Stand: 24. Oktober 2026. P02; Basis: [Anforderungen](ANFORDERUNGEN.md). Alle Ergebnisse sind **offen**. Dieses Dokument definiert Versuche für S08–S11, keine Sicherheitsfreigabe.

## Entscheidungsregeln

Ein fehlgeschlagener Schutz blockiert die entsprechende G1a-Freigabe; eine nicht messbare Wirkung gilt als unbekannt. Positive Kontrollanfragen müssen im selben Lauf ankommen. Ein Browserfehler oder CSP-Konsoleneintrag allein beweist keine unterbliebene Anfrage. Ein grüner Desktop-Lauf ersetzt weder andere Engines noch G1b auf realen Geräten.

| Konflikt | Annahme / Versuch | Folge bei Fehlschlag |
|---|---|---|
| C01: fremdes JS gegen Netzwerk-/Navigationsverbot (REQ-SEC-02) | X01–X03: Sandbox und CSP verhindern nicht automatisch Selbstnavigation. | Keine arbitrary-JS-Freigabe; eingeschränktes Format oder andere Architektur, separat reviewen. |
| C02: strikte Host-CSP gegen fremde Inline-Skripte | X01: `srcdoc`/Blob erben Host-CSP; Child-Meta kann nur weiter einschränken. | Unterstützte Syntax begrenzen oder neue Ausführungsarchitektur; Host-Policy nicht für Kompatibilität lockern. |
| C03: opaque Origin gegen Kanalidentität (REQ-SEC-03) | X04: `origin === "null"` gilt auch für fremde opaque Frames. | Source-/Port-/Sitzungsbindung erzwingen; null niemals als Identität akzeptieren. |
| C04: universelle Zustandserkennung gegen beliebiges HTML (REQ-DATA-03/04) | X05: Standardfelder und demonstrierter Adapter getrennt. | Sichtbar inkompatibel; kein gespeicherter Zustand behaupten. |
| C05: iframe gegen Ressourcenquote (REQ-SEC-04) | X06: CPU, RAM und Message-Flood, getrennte Prozesse. | Ressourcenrisiko dokumentieren; keine garantierte Beendigung/Quote zusagen. |
| C06: getrennte Origin gegen Offline-Neustart (REQ-PLAT-02) | X07: vollständiger Neustart ohne Netz und ohne warmen Renderer. | Kein Offline-Claim; Architektur/Cache separat korrigieren. |
| C07: Dauerhaftigkeit gegen Browserlöschung (REQ-DATA-05–09) | X08: Transaktionsabbruch, Quota, Tabkonflikt und Backup. | G2 blockiert; Commit darf nicht als gespeichert bestätigt werden. |
| C08: PDF gegen opaque DOM und fremden Renderer (REQ-PDF-01–04) | X09: getrennte Renderwege, Inhalt und Ausgabe untrusted. | G3 blockiert; kein Host-DOM-Zugriff als Ersatz. |
| C09: Sandbox gegen Gerätefunktionen | X10: Berechtigungen und Nutzeraktivierung getrennt prüfen. | Betroffene Browser-/Gerätefreigabe blockiert. |

## Gemeinsamer Versuchsaufbau

- Drei getrennte Rollen: Host-Origin H, optional Runner-Origin R, unabhängiger Empfänger E. Zwei localhost-Ports sind verschiedene Origins, aber kein Beleg für HTTPS-/Internetverhalten. Remote-HTTPS und reale Geräte werden zusätzlich dokumentiert, sobald verfügbar.
- E protokolliert pro Lauf zufällige `runId`/`caseId`, Methode, URL und Zeitpunkt ohne echte Daten. Testinhalt trägt nur synthetische Marker. Ein unabhängiger Prozess schreibt Empfängerlogs; Browser-Request-/Navigationsereignisse und Konsole werden ergänzend erfasst.
- Vor und nach jedem Verbotsfall sendet ein vertrauenswürdiger Kontrollkontext eine erlaubte Anfrage an E. Fehlt eine Kontrolle, ist der Fall ungültig. Alle Frames/Prozesse am Ende schließen, Beobachtungsfenster nach Aktion mindestens 3 Sekunden; verzögerte Fälle zusätzlich nach 10 Sekunden prüfen.
- Chromium, Firefox und Playwright-WebKit mit exakten Versionen separat auswerten. Playwright-WebKit ist kein Safari-/iPad-Nachweis. Rohlogs, Header, Fixture-Hash und Startbefehl gehören zum Prüfbericht.
- Jede Variante erhält eine Positivfixture, die aktive Skriptausführung sichtbar nachweist. Sonst ist ein grüner Netzwerkfall möglicherweise nur ein blockiertes Skript. Keine Produktionsdaten oder privilegierten Zugangsdaten im Testprofil.

## Versuche und beobachtbare Kriterien

| ID / Folgeauftrag | Eingabe und Variation | Messung und Entscheidung |
|---|---|---|
| X01 / S05, S08 | `srcdoc`, Blob und normal geladene R-Seite; Header-CSP und zusätzliche frühe Meta-CSP. Strikte H-Policy, dann getrennte Labor-Policy vergleichen. Testen: initiale Quelle, Inline-Classic-Script, Handler, `eval`, Inline-Modul, dynamischer Import, Blob-/data-Script, Worker. Parent `frame-src 'none'` gegen auf R begrenzte Policy. | Tatsächlich wirksame Policy und Skriptmarker je Fall protokollieren. Meta darf Header-/geerbte Policy nicht lockern. Labor-Policy ist keine freigegebene Host-Policy. G1a verlangt dokumentierte finale Policy und funktionierende erlaubte Demo. |
| X02 / S08 | Selbstnavigation per `location=`, `assign`, `replace`, Link mit/ohne Nutzerklick, `target=_self`, GET-/POST-Formular und Meta-Refresh; absolute E-URL, H-/R-URL mit Marker in Pfad/Query, `data:`, `blob:`, `about:blank`, relative und fragment-only Ziele. Auch verzögert und nach erstem `load`. | E- und H-/R-Logs, Frame-URL, `load` und Portabschluss prüfen. Schon eine verbotene Anfrage zählt als Verstoß, auch wenn Anzeige/CORS danach scheitert. Fragment-only darf keine neue Dokumentberechtigung erzeugen. Portwiderruf verhindert keine bereits abgegangene Anfrage. |
| X03 / S08 | `fetch`, XHR, Beacon, WebSocket, EventSource, Image/srcset, CSS `url`/`@import`, Font, Audio/Video/Poster, Script/Module, nested iframe, object/embed, prefetch/preload, Anchor `ping`, `window.open`, Downloadlink und Formular. Explizit `https:`, `http:`, `ws:`, `wss:`, protocol-relative und Referrer-Leck prüfen. | Keine verbotene Anfrage bei E/H/R; keine neuen Fenster/Downloads. CSP-Verletzung nur Zusatzbeleg. Nicht implementierte Protokolle separat als nicht ausgeführt kennzeichnen. |
| X04 / S07, S09, S10 | Fremder opaque Frame sendet gleiche READY-Nachricht; alte Sitzung/Port wiederverwenden; Replay, falsche Sequenz, Schema-/Größenüberschreitung, schnelle Nachrichten, Navigation und Öffnen/Schließen wiederholen. | Nur aktiver Source/Port beeinflusst genau die zugeordnete Instanz. Kein Origin-null-Trust; neue Sitzung bekommt keine Daten der alten. Limits und Widerrufsgründe sind sichtbar. |
| X05 / D03, D04 | Text/Textarea, Checkbox, Radiogruppe, Single-/Multiple-Select mit stabilen IDs; Duplikat-/fehlende IDs, File/Password/Hidden, Canvas, Shadow DOM; Drag-and-Drop-Adapter. | Exakter Roundtrip der unterstützten Werte, keine pauschale DOM-Erkennung. Nicht unterstützte oder mehrdeutige Felder sichtbar; Adapterzustand bleibt JSON, kein HTML. |
| X06 / S10 | State am/über Limit; ungültiges JSON/zu tiefe Struktur; 1.000 schnelle Portnachrichten; Endlosschleife und steigende Allokation jeweils im eigenen Browserprozess. | Zeit, Speicher, Hostbedienbarkeit und Wiederanlauf protokollieren; externes Prozess-Timeout. Host-Watchdog ist Best Effort, keine CPU-/RAM-Sandbox. Browser kann schon vor Hostvalidierung kopieren/allozieren. |
| X07 / S11, U01 | Erstladen, schließen, Kontext/Browser neu starten, Netz sperren, Host und neuen Runner starten; Cache leeren, unvollständige Aktualisierung und alten Inhalt getrennt testen. | Keine nachgeladenen Ressourcen; unterstützter Inhalt startet neu. Warmer Tab allein genügt nicht. Ohne reale SW-/HTTPS-Umgebung nicht ausgeführt. |
| X08 / D05–D08 | Zwei Tabs mit gleicher Revision; Transaktion abbrechen/Quota erzwingen; Backup mit unbekannter Version, fehlender Vorlage, falschem Hash oder kaputter Relation. | Letzte bestätigte Revision bleibt; kein Teilimport. Löschung durch Browser/OS bleibt externe Verlustgrenze. |
| X09 / E01–E06 | Druck-CSS gegen seitenweise Bild-/PDF-Erzeugung; identischer mehrseitiger Korpus, große Grafik und jüngster State. Bösartiger Renderer sendet falschen MIME-Typ/Größe/Dateinamen. | Vollständigkeit, Speicher, Isolation, Ausgabevalidierung und Dateifallback getrennt belegen. Kein Zugriff des Hosts auf fremden DOM. |
| X10 / S09, G1b | Clipboard, Geolocation, Kamera/Mikrofon, Fullscreen, Pointer Lock, Bildschirmaufnahme, Payment, USB/Bluetooth/Serial, File Picker und Web Share, jeweils ohne/mit echtem Klick soweit API vorhanden. | Keine privilegierte Wirkung und kein unerwarteter Dialog. Nicht verfügbare API ist kein engineübergreifender Schutzbeleg; Permissions-Policy und Sandboxattribute samt Headern erfassen. |

## Offene Freigabeentscheidungen

X01–X04 und X06 sind Voraussetzung für eine G1a-Aussage über skriptfähige Inhalte. G0 kann die Experimente freigeben, nicht deren Ergebnis vorwegnehmen. Bei verbleibendem Konflikt wird eine kurze Entscheidungsvorlage mit reproduzierbarem Gegenbeispiel, eingeschränktem Format und alternativer Architektur erstellt. PDF, Persistenz und Produktausbau bleiben nachgeordnet.
