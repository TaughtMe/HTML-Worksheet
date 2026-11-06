# Bedrohungsmodell v1

Stand: 24. Oktober 2026. P03; normative Basis: [Anforderungen](ANFORDERUNGEN.md), experimentelle Fragen: [P02](EXPERIMENTE.md). Keine technische Freigabe.

## Schutzgüter, Angreifer und Annahmen

Schutzgüter sind Antworten, Vorlagen, Arbeitsheftstruktur und Backups im Browserprofil, Integrität des Hosts und seiner bestätigten Revisionen, nutzerkontrollierte Dateiweitergabe sowie Geräteverfügbarkeit. Ein Vorlagenhash dient nur Integritätsvergleich, nicht Vertrauensbewertung.

Der Angreifer kontrolliert jeden Byte einer importierten Datei, Metadaten, URLs, IDs, Styles und JavaScript sowie alle Nachrichten aus dem Runner. Er kennt Protokoll und Quellcode, kann syntaktisch gültige Nachrichten senden, State fälschen, seine eigenen Skripte/Adapter überschreiben, Navigation auslösen, Timing verändern und CPU/RAM verbrauchen. Ein wiederhergestelltes Backup und ein vom Runner geliefertes Bild/PDF sind ebenfalls untrusted. Eine fehlerhafte Vorlage wird wie ein bösartiger Sender behandelt.

Vertraut werden Browser/OS im dokumentierten Versionsumfang, ausgelieferter Hostcode, Build-/Dependency-Kette und überprüfte Runner-Bootstrap-Bestandteile hinsichtlich ihrer Hostschnittstelle. Skripte im selben Runner-Realm können den Bootstrap manipulieren: seine Meldungen sind kein Nachweis korrekter Antworten, vollständiger Zustandserfassung oder ehrlicher Exportdaten. XSS in Hostcode, kompromittierter Browser/OS und lokale Person mit Zugriff auf dasselbe Profil liegen außerhalb der technischen Runner-Grenze; sie bleiben reale Betriebsrisiken. Nicht unterstützte Browser werden nicht durch schwächere Policies kompatibel gemacht.

## Kontexte und Vertrauensgrenzen

| Kontext / Grenze | Berechtigung und Regel |
|---|---|
| H: Host-Origin | Eigene UI/Dateiauswahl, später IndexedDB, bewusster Backup-/Download-/Share-Ablauf. Nur eigener ausgelieferter Code; fremde Strings als Text. Kein fremdes HTML via `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, DOM-Adoption oder Host-Renderbibliothek. |
| Datei → H | Vor Lesen Byte-Limit, danach striktes UTF-8 und Format-/Strukturvalidierung. Parser als Datenverarbeitung, kein Einfügen/Importieren in den Host-DOM. H darf String/Bytes/AST verarbeiten und ein vollständiges Runnerdokument zusammensetzen. |
| H → R: sandboxed iframe | Nur aktive Vorlage und ausschließlich eigener begrenzter State. Opaque Origin durch fehlendes `allow-same-origin`; ausschließlich `allow-scripts` als experimentelle Sandboxausnahme. Kein Zugriff auf H-DOM, H-Storage oder andere Instanzen. Ein anderer Pfad ist keine eigene Origin. |
| R → H: Sitzungskanal | Nachrichten sind untrusted Eingaben; Source-/Portbindung, Version, Sequenz und feste Limits. Portbesitz begründet nur Kanalzugehörigkeit, keine Authentizität des Adapters oder der Person. H legt Zielinstanz und zulässige Operation fest. |
| H → lokale DB | Nur hostseitig validierte Daten; atomare Transaktionen und erwartete Revision. R erhält weder DB-IDs als Auswahlrecht noch eine generische DB-/Datei-/URL-API. |
| R → Netzwerk / Navigation / Geräte | Verbotener Datenfluss einschließlich URLs in H-/R-Hostinglogs; CSP, Sandbox und Permissions-Policy müssen praktisch greifen. Navigationserkennung/Widerruf ist nur Schadensbegrenzung nach dem Ereignis. |
| H → Datei / System-Share | Ausschließlich bewusste Hostnutzeraktion mit hostbestimmtem Namen/Typ und Limits. Runner-Meldungen oder eigene Klicks im Runner autorisieren keine Hostaktion. |
| HTTPS-Auslieferung / Cache → H | Nur App-Artefakte. Hosting kann App-Zugriffslogs erzeugen; Antworten sind kein erlaubter Requestinhalt. Service Worker erst separat geprüft, fremdes HTML nie als aktive Hostroute ausliefern. |

## Erlaubte Datenflüsse

1. Nutzer wählt eine lokale Datei; H validiert Bytes/AST, zeigt sichere Textdiagnose und erzeugt eine neue Sitzung.
2. H übergibt den aktiven Vorlageninhalt an genau R. In der Persistenzphase darf H nur den Zustand derselben fest gebundenen Instanz restaurieren; im Sicherheitsprototyp ausschließlich synthetischer In-Memory-State.
3. R sendet begrenzten JSON-State beziehungsweise begrenzte Diagnosecodes. H prüft, ordnet die aktive Instanz zu und bestätigt erst tatsächlich erreichte Zustände. Es gibt keine Shell-, Fetch-, Speicherziel-, HTML- oder Exportbefehle in Bridge v1.
4. H speichert später eine validierte Revision lokal. H erzeugt Backups/Exporte nur nach eigener Nutzeraktion. Ein Import wird vollständig vor einem atomaren Commit validiert.
5. App-Auslieferung lädt kontrollierte App-Artefakte; lokale Inhalte erzeugen keinen Netzverkehr. Ein neu geöffneter Runner erhält keine Inhalte anderer Vorlagen, Tabs oder Instanzen.

## Bedrohungen und Zuordnung

| ID | Angriff / Auswirkung | Gegenmaßnahme und verbleibende Grenze | Nachweis |
|---|---|---|---|
| TH-01 | HTML-/Metadateninjektion in H | Fremdmaterial nur Bytes/AST/Text; kein Host-DOM-Import. Dateiname ebenso untrusted. | TEST-SEC-01, X04 / S06, S09 |
| TH-02 | Zugriff auf H-DOM, DB oder andere Instanz | Sandbox ohne same-origin, nur aktive Daten, keine generischen Bridgeprivilegien. Browserfehler bleiben außerhalb. | TEST-SEC-02, X04 / S09 |
| TH-03 | Exfiltration über Netzwerk, Ressourcen, CSS oder Referrer | Frühe CSP, keine externen Ressourcen, Referrer-Policy; instrumentierter Empfänger mit Kontrollen. | TEST-SEC-03, X01–X03 / S08 |
| TH-04 | Selbstnavigation, Formular, Link oder Popup | Parent-`frame-src`, Child-CSP und Sandbox gemeinsam testen. Portwiderruf verhindert keine schon erfolgte Anfrage. | TEST-SEC-03, X02 / S08 |
| TH-05 | Download/Berechtigungs-/Geräteaufruf | Keine Sandboxausnahme, explizite Permissions-Policy, keine Host-Delegation von Nutzeraktivierung. API-Abwesenheit kein universeller Beleg. | TEST-SEC-03, X10 / S09, G1b |
| TH-06 | Fremder opaque Frame, alte Sitzung, Replay | `origin null` nicht authentisch; Source, einmaliger Port, Sitzungs- und Sequenzbindung, Widerruf bei Dokumentwechsel. | TEST-BRIDGE-02, X04 / S07, S10 |
| TH-07 | R fordert fremde IDs/URLs/Hostaktionen an | Geschlossenes Nachrichtenschema, keine solchen Felder/Operationen. Hostzuordnung unveränderlich. | TEST-BRIDGE-01/02, X04 |
| TH-08 | Gefälschter gültiger State/Adapter/Export | State nur begrenzte Daten, niemals ausführbarer Hostinhalt. Keine Zusage über inhaltliche Ehrlichkeit einer fremden Vorlage. | TEST-STATE-04, TEST-PDF-05, X05/X09 |
| TH-09 | State-/Message-Flood, riesige Dateistruktur | Datei-, JSON-, Tiefen-, Häufigkeitslimits, Kanal schließen; Prüfung kann erst nach Browser-Kopie stattfinden. | TEST-SEC-04/05, TEST-BRIDGE-01/02, X06 |
| TH-10 | Endlosschleife, Speicherlast, DOM-/Layoutlast | Kleine Eingaben, begrenzte Sitzungen, Abbruch-/Wiederanlaufversuche im separaten Prozess. iframe bietet keine garantierte CPU-/RAM-Quote; H kann mit einfrieren. | TEST-SEC-04, X06 / S10 |
| TH-11 | Quota, Tabrennen, Abbruch und korrupter Import | Revision-CAS in Transaktion, bestätigte Revision behalten, vollständige Backupvalidierung, atomarer Merge. Browser-/OS-Löschung bleibt möglich. | TEST-SAVE-02–04, TEST-BACKUP-02, X08 |
| TH-12 | Profile gemeinsam genutzt / Gerät verloren | Keine Zugriffstrennung innerhalb eines Profils; Betriebs-/Lösch- und Backupkonzept vor Pilot. Lokales Label ist kein Konto. | TEST-PRIV-01, Q04–Q05 |
| TH-13 | Bösartige/veraltete Abhängigkeit oder Cacheversion | Kleine geprüfte Auswahl, exakte Lockdatei, keine CDN-Runtime, kontrollierte Updates; kein perfekter Supply-Chain-Schutz. | P08, S01/S02, U01, Q02 |
| TH-14 | Täuschende Oberfläche / Accessibility-Falle im Frame | Sichtbare Hostgrenze und außen erreichbarer Schließen-Befehl, keine Hostauthentifizierung in Vorlagen. Fremdinhalt kann weiterhin täuschen und Fokus stören. | TEST-UX-02, S05/S10, U08 |

## Grenzen der Aussage

REQ-SEC-02 ist ein Sicherheitsziel, aktuell unbewiesen. Ein erlaubter Skriptmarker plus blockierte einzelne Requests ist keine Garantie gegen beliebiges JavaScript. Starke Egress-/Navigationsisolation, Kompatibilität mit strikter Host-CSP, reale Geräte und Ressourcenverhalten bleiben G1a/G1b-Entscheidungen. Kein G0-Dokument erlaubt echte Schülerdaten im Versuchsbetrieb.
