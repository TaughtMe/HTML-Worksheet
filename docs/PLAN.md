# Entwicklungsplan in kleinen Arbeitspaketen

Stand: 24. Oktober 2026. Dieser Plan setzt das vorgelegte Projektkonzept um. **Ursprünglicher Planungsumfang: Repository und abgestimmter Arbeitsplan.** Den inzwischen umgesetzten technischen Kern und die tatsächlich ausgeführten Prüfungen dokumentiert [STATUS.md](STATUS.md). Die folgenden Aufgaben definieren den gesamten weiteren Entwicklungsweg.

## Modellverteilung

Die Reasoning-Stufe beschreibt den Arbeitsaufwand des Modells, keine Garantie für Richtigkeit.

| Agent | Standardaufgaben | Stufe |
|---|---|---|
| Luna (`gpt-6-luna`) | Dokumente aus festgelegten Entscheidungen, Testdaten, einfache Konfiguration | low |
| Luna | Spezifizierte Fixtures, begrenzte UI-Komponenten und manuelle Testanleitungen | medium |
| Sol (`gpt-6.1-sol`) | Projektgerüst, Build, normale Integration | medium |
| Sol | Sicherheitscode, Bridge, Persistenz, Migrationen, PDF und kritische Reviews | high |
| Sol | Ungeklärte Browsergrenzen und widersprüchliche Sicherheitsanforderungen | xhigh |
| Astra (`gpt-6-astra`) | Aufgaben koordinieren, Abhängigkeiten und Nachweise prüfen | low/medium nach Bedarf |
| Astra | Dokumentierte, durch Sol nicht gelöste Architekturblocker | high, xhigh nur bei Bedarf |

Astra erhält Zusammenfassungen und offene Entscheidungen statt vollständiger Rohprotokolle. Es implementiert nicht routinemäßig mit. Sicherheitsreviews gehen an einen separaten Sol-Auftrag. Modelle höher einzustufen ersetzt keine Tests.

## Ablauf und Arbeitsgröße

Jede Tabellenzeile ist ein eigener Auftrag nach [AUFTRAG.md](AUFTRAG.md). Meist ein einzelner Patch oder ein einzelnes Experiment. Größenorientierung: 30–90 Minuten aktive Arbeit; komplexere Pakete vor Start weiter zerlegen. Zeitangaben sind keine Zusage für KI-Laufzeit oder Projektdauer.

Maximal zwei ausführende Agenten zunächst. Nach akzeptierten Verträgen dürfen unabhängige Dokumentation und Fixtures parallel entstehen. Sicherheitsimplementierung und deren Review erfolgen sequenziell. Gemeinsame Dateien werden nicht gleichzeitig geändert.

Ursprünglicher Planungsstand: alle nachfolgenden Aufgaben offen. Den fortgeschriebenen Status und die tatsächlichen Nachweise führt [STATUS.md](STATUS.md); diese Aufgabenliste beschreibt weiterhin Reihenfolge und Abnahmekriterien, nicht automatisch abgeschlossene Arbeit. Ein bestandener Teiltest ersetzt kein Gate.

## Abschnitt 0: technische Spezifikation

| ID | Auftrag und konkretes Ergebnis | Agent | Voraussetzung | Abnahme |
|---|---|---|---|---|
| P01 | Anforderungen mit stabilen IDs, MVP-Grenze und späteren Funktionen erfassen | Luna medium | Projektkonzept | Jede Kernanforderung hat späteren Test/Gate; keine stille Auslassung |
| P02 | Widersprüche und Browser-Experimente präzisieren | Sol high | P01 | Für jede offene Annahme Experiment und Entscheidungsfolge |
| P03 | Bedrohungsmodell: Daten, Angreifer, Origins, Datenflüsse, DoS | Sol xhigh | P02 | Jede Vertrauensgrenze und jeder erlaubte Datenfluss benannt |
| P04 | Sandbox-Varianten und CSP-Strategie als ADR entwerfen | Sol xhigh | P03 | srcdoc/Blob/separate Origin verglichen; Selbstnavigation ausdrücklich behandelt |
| P05 | Bridge-Vertrag v1 mit Limits, Sitzung und Fehlerverhalten | Sol high | P03–P04 | Nachrichtentypen, Payloadgrenzen, Rate-Limits und Kanal-Lebenszyklus eindeutig |
| P06 | Vorlagen-, Instanz-, State- und Backup-Schema entwerfen | Sol high | P01, P05 | Versionen, Konflikte, atomare Updates und Wiederherstellung spezifiziert |
| P07 | Testmatrix und Evidenzformat aus P03–P06 ableiten | Luna medium | P03–P06 | Jede Bedrohung einem Test zugeordnet; Browser und reale Geräte getrennt |
| P08 | Kleine Abhängigkeitsauswahl prüfen | Sol medium | P04–P06 | Pflege, Lizenz, Offline-Eignung und Risiken dokumentiert; PDF-Kandidaten noch nicht blind eingebunden |
| P09 | Spezifikation unabhängig gegenlesen | separater Sol high | P01–P08 | Widersprüche gelöst oder als blockierend benannt; Traceability vollständig |

**Gate G0:** Technisches Pflichtenheft, Bedrohungsmodell, Datenmodell und Schnittstellen sind reviewt. Offene Isolationsfragen sind als Experimente spezifiziert, nicht als gelöst dargestellt. Danach darf der begrenzte Sicherheitsprototyp beginnen.

## Abschnitt 1: begrenzter Sicherheitsprototyp

| ID | Auftrag und konkretes Ergebnis | Agent | Voraussetzung | Abnahme |
|---|---|---|---|---|
| S01 | Minimales TypeScript-Projekt, reproduzierbarer Build und Testbefehle | Sol medium | G0 | Frischer Checkout baut; Lockfile und Toolversionen dokumentiert |
| S02 | CI für Typecheck, Tests und Build hinzufügen | Luna medium | S01 | Erfolgreicher und absichtlich fehlschlagender Lauf; minimale CI-Rechte |
| S03 | Harmlose Fixtures: Standardfelder, JS-Interaktion, Drag-and-Drop | Luna medium | P07, S01 | Erwartetes Verhalten pro Fixture, keine externen Assets |
| S04 | Netzwerk-/Navigations-Angriffsfixtures nach P07 | Luna medium | P07, S01 | Alle spezifizierten Vektoren enthalten; Sol prüft Aussagekraft |
| S05 | Minimalen Host und isolierten Runner bauen | Sol high | S01, P04 | Nur Datei wählen, öffnen, schließen und Diagnose; kein Produkt-Dashboard |
| S06 | HTML-Import begrenzen und Policy vor Ausführung anwenden | Sol high | S05 | Größenlimit vor Verarbeitung; fehlerhafte Dateien kontrolliert abgelehnt; Host-Metadaten als Text |
| S07 | Sitzungskanal und Bridge-Validierung implementieren | Sol high | S06, P05 | Alte/fremde/zu große Nachrichten abgewiesen; kein frei wählbares Speicherziel |
| S08 | Netzwerk und Navigation experimentell angreifen | Sol xhigh | S04, S07 | Browseraufzeichnung plus unabhängiger Testendpunkt; positive Kontrollanfrage beweist funktionierende Messung |
| S09 | Origin-, Storage-, Popup-, Download- und Berechtigungstests | Sol high | S07 | Parent-DOM/DB und andere Instanzen unzugänglich; keine unerlaubte Aktion |
| S10 | Missbrauch, Last und Lebenszyklus untersuchen | Sol high | S07 | Message-Flood, Größenlimits, Framewechsel und Endlosschleife geprüft; Absturztests in separatem Browserprozess |
| S11 | Minimalen Offline-Runner-Versuch ergänzen | Sol high | S08–S10 | App/Runner nach initialem Laden ohne Netz erneut startbar; keine Ressourcen nachgeladen |
| S12 | Ergebnisse und verbleibende Grenzen protokollieren | Luna medium | S08–S11 | Reproduktionsbefehle, Versionsnummern, Rohbelege und unbekannte Ergebnisse klar getrennt |
| S13 | Unabhängiges Review des Prototyps und der Testabdeckung | separater Sol high | S12 | Keine ungelöste kritische Lücke im freizugebenden Umfang; Gate-Entscheidung begründet |

**Gate G1a, lokal:** Unterstützte Interaktionen funktionieren; definierte verbotene Aktionen scheitern in der dokumentierten Desktop-Browsermatrix. Chromium, Firefox und Playwright-WebKit werden getrennt ausgewertet. Keine unerwarteten Requests am Testendpunkt. Selbstnavigation, Nachrichtenmissbrauch und Ressourcenrisiken sind ausdrücklich bewertet. Ein grüner Testlauf ist nur Evidenz für die geprüften Szenarien.

**Bei Fehlschlag:** Keine pauschale Freigabe fremden JavaScripts. Sol prüft einen stärker eingeschränkten Arbeitsblattstandard oder eine andere Ausführungsarchitektur. Das bloße Entfernen bekannter gefährlicher HTML-Zeilen ist kein ausreichender Ersatz. Ungeklärte Zielkonflikte gehen mit Experimenten und Optionen an Astra; Grundanforderungen werden nicht stillschweigend abgeschwächt.

**H01, anschließend:** Statisches HTTPS-Testhosting gemäß [BETRIEB.md](BETRIEB.md) einrichten. Sol medium führt, Luna medium dokumentiert, Sol high prüft wirksame Header.

**Gate G1b, reale Geräte:** Die relevante Isolation auf einem realen iPad/Safari und Android/Chrome prüfen, einschließlich installierter App soweit verfügbar. Playwright-WebKit ersetzt keinen iPad-Test. Fehlende Geräte werden als Blocker dieses Gates benannt, nicht als bestandener Test. Bis dahin nur synthetische Daten und technischer Versuchsbetrieb.

## Abschnitt 2: Speicherung und Wiederherstellung

Erst nach G1a beginnen; G1b bleibt Voraussetzung für die entsprechende Gerätefreigabe.

| ID | Kleiner Auftrag | Agent | Abnahme |
|---|---|---|---|
| D01 | IndexedDB-Schema und erste Migration | Sol high | Leere DB und definierter Vorgängerstand konsistent migriert |
| D02 | Vorlagen unveränderlich speichern, unabhängige Instanzen anlegen | Sol high | Zwei Instanzen derselben Vorlage beeinflussen sich nicht |
| D03 | Standardfeld-Adapter mit stabilen IDs | Sol high | Text, Checkbox, Radio und Select vollständig restauriert; nicht unterstützte Typen gemeldet |
| D04 | Versionierten Adapter für komplexe Zustände definieren und demonstrieren | Sol high | Drag-and-Drop-Demo restauriert Zustand, ohne Host-Privilegien |
| D05 | Autosave, Revisionen und sichere Ansichtswechsel | Sol high | Letzte bestätigte Revision überlebt Neustart; veraltetes Tab überschreibt nicht stillschweigend |
| D06 | Quoten-, Abbruch- und Korruptionsfehler behandeln | Sol high | Fehlgeschlagener Commit nie als gespeichert angezeigt; letzte gültige Revision bleibt lesbar |
| D07 | Minimales versioniertes Backup mit atomarem Import | Sol high | Roundtrip vollständig; defekter Import ändert bestehende Daten nicht |
| D08 | Wiederherstellungsfixtures und Prüfprotokoll erweitern | Luna medium | Testfälle aus Vertrag vollständig; Review durch separaten Sol high |

Reihenfolge: D01 → D02 → D03/D04 → D05 → D06 → D07 → D08. D03 und D04 nur bei getrennten Modulen parallel.

**Gate G2:** Eingaben nach Browserneustart korrekt, Instanzen getrennt, Speicherfehler sichtbar, Tab-Konflikte behandelt und Sicherung auf frischem Browserprofil wiederhergestellt. Nicht allein auf `beforeunload` bauen. Menschliche Tests für Betriebssystem-Abbruch ergänzen.

## Abschnitt 3: PDF als eigener technischer Nachweis

| ID | Kleiner Auftrag | Agent | Abnahme |
|---|---|---|---|
| E01 | Druck-CSS und bildbasierten Export in isolierten Versuchen vergleichen | Sol high | Qualitäts-, Sicherheits-, Speicher- und Lizenzvergleich mit denselben Fixtures |
| E02 | Exportvertrag, Seitenbudget und Renderer-Grenzen festlegen | Sol high | Keine DOM-Freigabe an den Host; Ausgabedaten weiterhin untrusted behandelt |
| E03 | Aktuellen Zustand und Druckansicht synchronisieren | Sol high | Export enthält die jüngsten Antworten und verändert nicht die Bearbeitung |
| E04 | A4-Seiten einzeln erzeugen und PDF zusammenstellen | Sol high | Mehrseitige, lange und grafische Blätter ohne abgeschnittene relevante Inhalte |
| E05 | Download und Web Share mit Fallback anbinden | Sol medium | Bewusste Nutzeraktion, Abbruch behandelt, fehlende Share-Unterstützung abgefangen |
| E06 | Export-Regressionen und reale Geräteprüfungen | separater Sol high; Luna medium für Fixtures | Inhaltliche und visuelle Kontrolle auf iPad, Android, Desktop; Limits dokumentiert |

Reihenfolge E01 → E02 → E03 → E04 → E05 → E06. **Gate G3:** Vollständige Antworten, mehrseitiger Export, lokales Speichern und unterstütztes Teilen praktisch nachgewiesen. Keine pauschale Unterstützung beliebigen HTMLs; veröffentlichte Kompatibilitätsmatrix gehört zur Abnahme.

## Abschnitt 4: Produktfähige PWA und Arbeitshefte

| ID | Kleiner Auftrag | Agent | Abnahme |
|---|---|---|---|
| U01 | App-Shell, Manifest und kontrollierten Updateablauf | Sol high | Installierbarkeit, Offline-Neustart, fehlgeschlagenes Update und alte Vorlagenversionen getestet |
| U02 | Lokale Datenlage und Sicherungsstatus verständlich anzeigen | Luna medium | Keine falsche Speicherzusage; Warnung bei Speicherfehlern bedienbar |
| U03 | Arbeitshefte und Ordner anlegen/umbenennen | Luna medium | Fachlich getrennte Speicherung über geprüfte Repository-API |
| U04 | Verschieben/Löschen mit definierten Datenregeln | Sol high | Keine Hierarchiezyklen oder verwaisten Instanzen; unbeabsichtigter Verlust verhindert |
| U05 | Status und unabhängige Arbeitskopien | Sol medium | Abgeschlossene Arbeit bleibt bei neuer Bearbeitung unverändert |
| U06 | Suche und Sortierung | Luna medium | Konsistentes Ergebnis, Tastaturbedienung |
| U07 | Vollständige Arbeitsheftsicherung auf D07 erweitern | Sol high | Struktur, Ressourcen, Vorlagen und Zustände auf frischem Profil wiederhergestellt |
| U08 | Touch-, Tastatur- und Screenreader-Durchlauf | Luna medium, Sol reviewt | Wesentliche Abläufe ohne Maus; Fokus und Fehlertexte verständlich |

Nach G3; U01 zuerst, U03 vor U04/U05, U07 nach U04/U05. U02/U06/U08 können bei festem UI-Vertrag getrennt bearbeitet werden. **Gate G4:** Vollständiger lokaler Arbeitsablauf einschließlich Sicherung ohne Konto und ohne Netz.

## Abschnitt 5: Vorlagenaustausch

| ID | Kleiner Auftrag | Agent | Abnahme |
|---|---|---|---|
| T01 | Austauschformat v1 aus P06 konkretisieren | Sol high | Versionsschema, Metadaten, Größenlimits und Ressourcenpfade dokumentiert |
| T02 | Vorlage exportieren | Sol medium | Keine Antworten oder personenbezogenen Instanzdaten im Export |
| T03 | Austauschpaket validieren und importieren | Sol high | Defekte Pakete, Pfadtraversal und bei Archiven Dekompressionsbomben abgefangen |
| T04 | Zwei-Geräte-Roundtrip und KI-Standardprompt | Luna medium, Sol reviewt | Export auf Gerät B unabhängig bearbeitbar; generierte Beispieldatei erfüllt den Adaptervertrag |

Nach G4, T01 → T02/T03 → T04. **Gate G5:** Dateiweitergabe funktioniert ohne zentralen Server. Link-/QR-Import ist ein späteres eigenes Paket: URL-Quelle, Weiterleitungen, Datenschutz und Downloadgrenzen vor Umsetzung spezifizieren. Eine öffentliche Bibliothek bleibt außerhalb des MVP.

## Abschnitt 6: Pilotfreigabe

| ID | Auftrag | Agent / Verantwortung | Abnahme |
|---|---|---|---|
| Q01 | Alle Anforderungen und Tests auf Lücken prüfen | Sol high | Jeder MVP-Punkt mit konkreter Evidenz oder Blocker |
| Q02 | Adversarial Review und Abhängigkeitsprüfung | separater Sol high, anschließend menschliche Sicherheitsprüfung | Kritische Befunde behoben und Regressionen ergänzt |
| Q03 | Reale Geräte-, Langzeit-, Update- und Verlusttests durchführen | menschliche Testpersonen; Luna dokumentiert, Sol analysiert | Reale iPads, Android, Windows/macOS, Browser-/OS-Versionen und Grenzen erfasst |
| Q04 | Betrieb, Datenschutz, gemeinsame Geräte und Wiederherstellung klären | Projektverantwortliche; Sol liefert technische Fakten | Hosting/Logs, Löschung, mögliche AVV und Zuständigkeiten geklärt |
| Q05 | Begrenzten Pilot durchführen und Befunde beheben | Lehrkräfte/Testpersonen; Sol/Luna nach Befund | MVP-Checkliste vollständig, keine offenen kritischen Fehler |

**Gate G6:** Erst jetzt Pilotversion für den festgelegten Einsatzbereich. KI-Review ersetzt keine unabhängige fachliche Kontrolle. Keine künstliche Zeitgarantie: nach G1, G2 und G3 anhand realer Befunde neu schätzen.

## Eskalation und Koordination

1. Luna meldet einen reproduzierbaren Blocker an Sol mit Ziel, bisherigem Versuch und Fehlerbeleg.
2. Sol untersucht mit angemessener Stufe. Architekturkonflikte direkt xhigh; gewöhnliche Fehler nicht automatisch hochstufen.
3. Nach zwei verschiedenen erfolglosen Ansätzen oder einem ungelösten Grundsatzkonflikt erhält Astra eine kurze Entscheidungsvorlage. Keine unsicheren Versuche allein zum Erreichen dieser Anzahl.
4. Astra entscheidet zwischen begründeten Optionen oder benennt die fehlende externe Evidenz. Nur abhängige Aufgaben pausieren.
5. Routineentscheidungen bleiben bei Sol. Nutzerrückfragen nur, wenn Produktziele, Zugänge, Kosten oder reale Testressourcen nicht aus dem vorhandenen Auftrag ableitbar sind.

## Unmittelbar nächste Aufträge

**P01 → P02 → P03 → P04/P05/P06 → P07/P08 → P09.** Abhängigkeiten der Tabelle haben Vorrang: P05 folgt P04, P06 folgt P05. Parallel möglich sind danach vor allem Testmatrix und Abhängigkeitsprüfung. Erst nach G0 startet S01. Cloudflare wird in H01 nach G1a konkret benötigt.
