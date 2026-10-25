# Testmatrix v1 (P07)

Stand: 24. Oktober 2026. Alle hier genannten Prüffälle sind **geplant und noch nicht ausgeführt**; sie beschreiben künftige Verfahren und Orakel, keine Ergebnisse oder Sicherheitsfreigabe. Die festen TEST-IDs aus `ANFORDERUNGEN.md` und `BEDROHUNGSMODELL.md` bleiben erhalten. Die Testmatrix konkretisiert sie mit Setup/Orakel und verbindet sie mit TH- und X-IDs.

## Ausführungsprofile und Regeln

| Profil | Zielumgebung | Zweck / Grenze |
|---|---|---|
| B1 | Chromium, Firefox und Playwright-WebKit, Versionen protokollieren, Desktopbetriebssystem | Automatisierte/reproduzierbare Fälle. Engines getrennt ausweisen; WebKit ist kein iPad-Safari-Nachweis. |
| B2 | Reales iPad mit Safari sowie reales Android-Gerät mit Chrome, Versionen und Installationsmodus protokollieren | G1b-Isolation, Offline/Installierbarkeit und native Berechtigungs-/Share-Effekte. Nicht verfügbare Geräte blockieren die jeweilige Freigabe. |
| B3 | Reale Windows- und macOS-Geräte/Browser im festgelegten Supportumfang | Installierbarkeit, Offline-Neustart, PDF und Dateiabläufe für G6/Q03. |
| L | Isoliertes Labor mit synthetischen Dateien und Daten; lokaler Host und isolierter Prozess | Sicherheits- und Protokollfälle. Keine Schülerdaten. |

Sicherheitsfälle verwenden jeweils einen separaten, kontrollierten E-Receiver und auch H-/R-Request-Inventare. Ein absichtlich ausgelöster positiver Kontrollrequest muss am Receiver mit eindeutigem Marker ankommen; andernfalls ist die Instrumentierung ungültig und „kein Request“ kein Pass. Verbotener Marker an einem beliebigen Receiver, Host-/Frame-Log oder unerwarteter Dialog ist Fail. Abwesenheit von CSP-Reports allein ist kein Pass. Grenzwerte werden bei Limit und Limit+1 geprüft. Protokollverhalten richtet sich nach `BRIDGE-V1.md` v1, einschließlich Schema, Sequenz, Sessionbindung, Nachrichtengröße, State-/JSON-Limits, Token Bucket, Zeitlimits und Schließverhalten; Tests dokumentieren die konkrete Grenze und Reaktion, ohne sie stillschweigend zu ändern.

Endlosschleife, wachsende Allokation und sonstige CPU-/RAM-DoS-Fälle laufen jeweils in einem separaten Browserprozess mit externem Prozess-Timeout und synthetischem Inhalt. Zu protokollieren sind Prozessabbruch, Hostbedienbarkeit und Wiederanlauf. Das iframe stellt keine garantierte CPU-/RAM-Quote bereit; ein bestandener Fall belegt keine allgemeine DoS-Immunität.

## Anforderungs-Traceability

| Anforderungs-ID | Konkreter Fall / Orakel | Browser / Gate |
|---|---|---|
| REQ-PLAT-01 | TEST-PLAT-01: Installation/Start und dokumentierte Browser-/OS-Version; TEST-PLAT-02: reale Plattform- und Installationsmatrix vollständig oder Blocker ausgewiesen. | B2/B3; G1b, G6/Q03 |
| REQ-PLAT-02 | TEST-OFF-01: nach Erstladen Prozess/Browser schließen, offline neu starten, lokale Vorlage öffnen und bearbeiten; TEST-OFF-02: Netzwerkaufzeichnung enthält keine unerwarteten App-/Inhaltsabrufe. | B1, B2, B3; G1a, G1b, G4 |
| REQ-PLAT-03 | TEST-DATA-01: Netzwerkinventar bei Nutzung und Antworten; Orakel: kein Backend-Request, Antwortpayload bleibt lokal. | B1/L plus B2; G1a, G4, G6/Q04 |
| REQ-DATA-01 | TEST-DATA-02: Hash/Bytes und Versionsreferenz der Vorlage vor/nach Bearbeitung gleich; TEST-DATA-03: getrennte Instanzen verändern einander nicht. | L; G2/D02 |
| REQ-DATA-02 | TEST-DATA-03: zwei Instanzen derselben Version mit unterschiedlichen Eingaben speichern, schließen und erneut öffnen; Orakel: Zustand bleibt instanzgebunden. | L; G2/D02 |
| REQ-DATA-03 | TEST-STATE-01: Text, Checkbox, Radio, Select-Roundtrip mit stabilen IDs; TEST-STATE-02: fehlende/duplizierte IDs und nicht unterstützter Typ ergeben sichtbare Inkompatibilität, nie falsche Speicherbestätigung. | L; G2/D03, X05 |
| REQ-DATA-04 | TEST-STATE-03: drag-demo Adapterzustand serialisieren, schließen und restaurieren; TEST-STATE-04: falsche Adapter-/Schema-Version, ungültige JSON-Form, unerlaubte Befehlsfelder und Prototyp-Schlüssel abweisen; gültigen Text `<b>Antwort</b>` unverändert als inerten String im Roundtrip erhalten. | L; G0/P05–P07, G2/D04, X05 |
| REQ-DATA-05 | TEST-SAVE-01: bestätigte Änderung autospeichern, Browserprozess beenden und letzte Revision restaurieren; TEST-SAVE-02: absichtlich fehlgeschlagener Commit/Quota wird als Fehler angezeigt, nicht als gespeichert. | L; G2/D01,D05,D06, X08 |
| REQ-DATA-06 | TEST-SAVE-03: zwei Tabs mit gleicher Basisrevision ändern; TEST-SAVE-04: Revision-CAS/Transaktionsabbruch; Orakel: keine stille Überschreibung, letzte bestätigte Revision bleibt. | L; G2/D05–D06, X08 |
| REQ-DATA-07 | TEST-BACKUP-01: vollständiger Export/Import auf frischem Profil; TEST-BACKUP-02: unbekannte Version, Hash-/Referenzfehler vor Commit; Orakel: bestehender Bestand byte-/inhaltstreu unverändert. | L; G2/D07–D08, G4/U07, X08 |
| REQ-DATA-08 | TEST-UX-01: Quota, Abbruch, beschädigte/fehlende Daten und ungesicherter Zustand; Orakel: klare, rechtzeitige Meldung und keine falsche Persistenzzusage. | L plus B2/B3 für Bedienbarkeit; G2/D06, G4/U02, G6/Q05 |
| REQ-DATA-09 | TEST-PRIV-01: zwei Personen im selben Browserprofil; Orakel: gemeinsame Datenlage und fehlende Zugriffstrennung werden vor Nutzung verständlich angezeigt, Lösch-/Betriebsablauf dokumentiert. | B2/B3 und Review; G6/Q04–Q05 |
| REQ-SEC-01 | TEST-SEC-01: HTML-/Metadaten-/Dateinamen-Payloads (Script, Eventhandler, DOM-Sinks); Orakel: im Host nur inert/textuell sichtbar, kein Ausführen/DOM-Übernehmen. | B1/L, B2 als Gate-Evidenz; G0, G1a/S06,S09, X04 |
| REQ-SEC-02 | TEST-SEC-02: Runner kann weder Host-DOM/Storage noch andere Instanzen erreichen; TEST-SEC-03: Egress, Selbstnavigation, Popup, Download, Form und privilegierte Geräteberechtigung/-wirkung versuchen. Orakel: kein verbotener Empfängerhit, Dialog, Download oder Zugriff. | B1 für Chromium/Firefox/WebKit einzeln; B2 für iPad/Safari und Android/Chrome zwingend; G1a, G1b, X01–X04,X10 |
| REQ-SEC-03 | TEST-BRIDGE-01: v1 gültige und ungültige Schemas, Limits an/über Grenze; TEST-BRIDGE-02: fremder/alter Port, Session, Replay, Sequenz, Rate und Dokumentwechsel. Orakel: nur gültiger aktiver Port kann fest gebundenen Zustand ändern; bei Verstoß Kanal schließen. | B1/L; G0/P05, G1a/S07–S10, X04 |
| REQ-SEC-04 | TEST-SEC-04: Nachrichtenflut, State am/über Grenze, Endlosschleife und Allokationslast; externe Prozesskontrolle und Wiederanlauf erfassen. Orakel: deklarierte Grenzreaktion; Resultat wird nicht als garantierte CPU-/RAM-Isolation ausgelegt. | B1/L, danach B2; G1a/S10, G1b, G6/Q02–Q03, X06 |
| REQ-SEC-05 | TEST-SEC-05: Datei 2 MiB und 2 MiB+1 vor Verarbeitung; ungültiges UTF-8, AST-Knoten/Tiefe/Attribute am Limit und darüber. Orakel: oberhalb kontrollierte Ablehnung vor Runnerstart. | B1/L; G1a/S06, X04/X06 |
| REQ-PDF-01 | TEST-PDF-01: jüngste bestätigte Antwort exportieren und parallel Zustand vergleichen; Orakel: PDF enthält aktuelle Antwort und Export verändert keinen Zustand. | B1, B2/B3; G3/E03 |
| REQ-PDF-02 | TEST-PDF-02: A4 Hoch- und Querformat; TEST-PDF-03: langer mehrseitiger Text, Grafik und Umbruch; Orakel: Seitenformat korrekt und keine relevanten Antworten abgeschnitten. | B1, B2/B3; G3/E01–E04,E06 |
| REQ-PDF-03 | TEST-PDF-04: Web Share verfügbar/nicht verfügbar/abgebrochen, Download und Dateiname; Orakel: Nutzeraktion erforderlich, Fallback speichert lokal. | B1, B2/B3; G3/E05–E06 |
| REQ-PDF-04 | TEST-PDF-05: bösartiger Renderer-/Exportpayload; Orakel: Host greift nicht auf fremdes DOM zu, Rückgabe wird als untrusted und nach Grenzen validiert. | B1/L; G3/E01–E02,E06, X09 |
| REQ-ORG-01 | TEST-ORG-01: Arbeitsheft/Ordner anlegen, umbenennen, erneut öffnen; Orakel: stabile IDs und persistierte Struktur. | B1, B2; G4/U03 |
| REQ-ORG-02 | TEST-ORG-02: Ordner/Arbeitshefte verschieben und löschen, Arbeitsblätter zuweisen/verschieben; Zyklen, verwaiste Instanzen und undefinierte Löschung müssen abgewiesen oder nach dokumentierter Regel behandelt werden. | B1; G4/U04 |
| REQ-ORG-03 | TEST-ORG-03: Statuswechsel und unabhängige Kopie; Orakel: Kopie ändert weder Quelle noch abgeschlossene Arbeit. | B1; G4/U05 |
| REQ-ORG-04 | TEST-BACKUP-03: Arbeitsheftstruktur, Vorlagen, Instanzen und Zustände auf leerem Profil wiederherstellen; Orakel: Beziehungen und Inhalte vollständig. | L, B2/B3; G4/U07 |
| REQ-EXCH-01 | TEST-EXCH-01: Vorlage als Datei auf zweites Gerät übertragen und importieren; TEST-EXCH-02: Paketinhalt prüfen; Orakel: keine Antworten/Instanz-/Personendaten. | B2/B3; G5/T01–T04 |
| REQ-EXCH-02 | TEST-EXCH-03: falsche Version, Pfadtraversal, fehlende Referenz und ggf. Archiv-Dekompressionslast; Orakel: vor Änderung vollständig abgelehnt. | L; G5/T01,T03 |
| REQ-EXCH-03 | TEST-EXCH-01: Datei-Roundtrip zwischen zwei Geräten ohne zentralen Dienst; Netzwerkaufzeichnung muss frei von Datei-/Antwortübertragung an Backend sein. | B2/B3; G5 |
| REQ-EXCH-04 | Kein MVP-Test. Bei eigener späterer Spezifikation müssen Redirects, Herkunft, Datenschutz und Downloadlimits neue Fälle und ein eigenes Gate erhalten. | Außerhalb MVP; vor Umsetzung |
| REQ-PRIV-01 | TEST-PRIV-02: Netzwerkinventar und Build-/Runtime-Diensteliste; Orakel: keine Telemetrie-/Trackingrequests oder Antwortübermittlung. | B1/L, B2; G1a, G4, G6/Q02–Q04 |
| REQ-UX-01 | TEST-UX-02: Kernabläufe per Touch, Maus und Tastatur; Fokus, Schließen, Fehlertexte und Screenreader-Grundbedienung protokollieren. | B1, B2/B3; G4/U08 |
| REQ-PRIV-02 | TEST-PRIV-03: Fixtures, Logs und Testartefakte auf echte Schüler-/Personendaten prüfen; Orakel: ausschließlich synthetische Daten. | Alle Profile; G1a, G6/Q02–Q05 |

## Bedrohungsmodell-Traceability

| Bedrohungs-ID | Fälle / Orakel | Browser / Gate |
|---|---|---|
| TH-01 | TEST-SEC-01 plus Metadaten-/Filename-AST-Fuzzing: kein Fremdscript im Host ausführbar. | B1/L; G1a/S06,S09 |
| TH-02 | TEST-SEC-02: Runner liest/schreibt weder Host-DOM/DB noch fremde Instanz; Speicher- und DOM-Kanariendaten bleiben unberührt. | B1; G1a/S09, G1b |
| TH-03 | TEST-SEC-03, X01–X03: Egress-Vektoren gegen positiven Receiverkontrollrequest; null verbotene Treffer ist nur bei erfolgreicher Positivkontrolle gültig. | B1, B2; G1a/S08, G1b |
| TH-04 | TEST-SEC-03, X02: Navigationsziele und Marker in E/H/R-Logs prüfen, auch verzögert/nach load; jeder verbotene Request = Fail. | B1, B2; G1a/S08, G1b |
| TH-05 | TEST-SEC-03, X10: Berechtigungs-APIs/echte Klicks und unerwartete Dialoge prüfen; nicht verfügbare API ist kein Pass. | B1, B2; G1b/S09 |
| TH-06 | TEST-BRIDGE-02, X04: gleichlautende READYs aus fremdem Frame, Port-Replay und alte Session; nur aktive Source/Port akzeptiert. | B1; G1a/S07,S10 |
| TH-07 | TEST-BRIDGE-01/02: fremde IDs, URL-/Befehlsfelder, unbekannte Properties; nichts verändert Hostzuordnung oder löst Aktion aus. | B1/L; G1a, X04 |
| TH-08 | TEST-STATE-04 und TEST-PDF-05: gefälschter State/Adapter/Rendererinhalt bleibt Datenwert, führt weder HTML aus noch erhält privilegierten Exportzugriff. | B1/L; G2/D04, G3/E06, X05/X09 |
| TH-09 | TEST-SEC-04/05 und TEST-BRIDGE-01/02: Größen-, JSON-Tiefen-, Floodlimits an/über Grenze; feste Fehlerreaktion, Sitzung geschlossen. | B1/L; G1a/S06,S07,S10, X06 |
| TH-10 | TEST-SEC-04, X06: je Endlosschleife und Allokationslast eigener Prozess, Timeout, Bedienbarkeit und Wiederanlauf erfassen; keine Ressourcenquotenbehauptung. | B1/L; G1a/S10, G1b |
| TH-11 | TEST-SAVE-02–04, TEST-BACKUP-02, X08: Quota/Abort, konkurrierende Revision und fehlerhaftes Backup; letzte bestätigte Revision bleibt, kein Teilimport. | L; G2/D05–D08 |
| TH-12 | TEST-PRIV-01: gleiches Profil und Geräteverlust-/Löschablauf; Grenzen und Betriebsmaßnahme sichtbar, keine Zugriffstrennung behauptet. | B2/B3; G6/Q04–Q05 |
| TH-13 | Dependency-/Cache-Review, Lockfile- und Updatefall aus P08/U01; Orakel: keine ungeprüfte Laufzeit-CDN-Abhängigkeit, Versionen inventarisiert. | B1/B3; G6/Q02, G4 |
| TH-14 | TEST-UX-02: bösartige/täuschende Runneroberfläche; Host-Schließen bleibt erreichbar, Fokus-/Bediengrenzen werden dokumentiert. | B1, B2; G1a/S05,S10, G4/U08 |

## Experiment-Traceability X01–X10

| X-ID | Konkreter Ablauf / Orakel | Browser / Freigabe |
|---|---|---|
| X01 | `srcdoc`, dann nur falls abweichend Blob; Header- und frühe Meta-CSP; Marker für Inline-Classic-Script, Handler, eval, Module, dynamischen Import, Blob/data-Script und Worker. Pro Fall wirksame Policy und erwarteter/unerwarteter Marker erfassen; Meta darf Policy nicht lockern. | B1 einzeln; X01–X04 Eingang zu G1a. Abweichung/Fail blockiert Skriptfreigabe. |
| X02 | Selbstnavigation durch location/assign/replace, Links, Formulare, Meta-Refresh; absolute/relative H/R/E-URLs, data/blob/about:blank und Fragment; sofort und verzögert/nach load. Orakel: kein verbotener Marker in E/H/R-Logs; jeder Request = Fail, Portwiderruf heilt ihn nicht. | B1, B2; G1a und reale G1b. |
| X03 | fetch/XHR/Beacon/WebSocket/EventSource, Bild/srcset, CSS, Fonts, Medien, Script/Module, nested frame, object/embed, prefetch/preload, ping, Popup, Download und Form inkl. http/https/ws/wss/protocol-relative. Positivkontrollierter E-Receiver muss erreichbar sein; kein verbotener Request/Fenster/Download. | B1, B2; G1a/S08, G1b. |
| X04 | Fremder opaque Frame mit identischem READY, alte Session/Port, Replay, falsche Sequenz/Schema/Größe, Rate und Navigation; wiederholtes Öffnen/Schließen. Orakel: nur aktive Sitzung bewirkt begrenzte Änderung; Widerruf sichtbar. | B1/L; G1a/S07–S10. |
| X05 | Standardfelder mit stabilen IDs, Mehrfachauswahl, fehlende/duplizierte IDs, nicht unterstützte Typen, Canvas/Shadow DOM und drag-demo. Orakel: exakter Roundtrip nur für unterstützte Werte; übrige sichtbar abgewiesen, JSON statt HTML. | B1/L; G2/D03–D04. |
| X06 | State am/über Protokolllimit, ungültiges/tiefes JSON, 1.000 schnelle Nachrichten; je ein Endlosschleifen- und Allokationstest in separatem Prozess mit Timeout. Orakel: deklarierte Limits/Schließung, Messung von Hostreaktion und Wiederanlauf; keine Garantiezusage für CPU/RAM. | B1/L; G1a/S10, G1b. |
| X07 | Erstladen, Schließen, Browser-/OS-Neustart, offline starten, Runner neu erstellen; Cache leeren, unvollständiges Update und alte Inhalte getrennt testen. Orakel: unterstützte lokale Inhalte starten ohne Nachladen; warmer Tab zählt nicht. | B1, B2, B3; G1a/S11, G1b, G4/U01. |
| X08 | Zwei Tabs gleiche Basisrevision, Transaktion abbrechen/Quota erzwingen, Backup mit unbekannter Version/Hash/Relation. Orakel: keine stille Überschreibung/Teiländerung, letzte bestätigte Revision bleibt. | L; G2/D05–D08. |
| X09 | Gleicher Druck-/Bild-PDF-Korpus mit aktueller Antwort, mehrseitig und großer Grafik; Renderer gibt falschen MIME/Größe/Dateiname. Orakel: Inhalt vollständig, Ausgabevalidierung/Isolation/Fallback separat bestanden, Host greift nicht auf fremdes DOM zu. | B1, B2/B3; G3/E01–E06. |
| X10 | Clipboard, Geolocation, Kamera/Mikrofon, Fullscreen, Pointer Lock, Screen Capture, Payment, USB/Bluetooth/Serial, File Picker und Web Share je ohne/mit echtem Klick soweit verfügbar. Orakel: keine privilegierte Wirkung/unerwarteter Dialog; verfügbare Permissions-Policy/Sandbox erfassen. | B1 je Engine, zwingend B2 für G1b; S09/G1b. |

## Evidenzprotokoll

Für jeden Lauf: Fall-ID und Subcase, Commit/Build, OS-/Browser-/Engine-Version, Gerät und Installationsmodus, Policyheader/iframe-Sandbox/Permissions-Policy, Eingabehash (synthetisch), Startzustand, Aktionen, Receiver-Positivkontrolle, rohe Request-/Konsolen-/Dialogbelege, erwartetes und beobachtetes Orakel, Pass/Fail/Blockiert/Nicht ausgeführt, Abweichung und Reviewer. Gerätefälle trennen von automatisierten Enginefällen. Negative Resultate ohne erfolgreiche Messkontrolle als ungültig markieren. Gate-Berichte verlinken konkrete Evidenz; diese Matrix allein ist kein Gate-Nachweis.
