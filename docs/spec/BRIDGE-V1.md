# Bridge v1 – begrenzter Sitzungskanal

Stand: 24. Oktober 2026; P05. Voraussetzung: [ADR 0001](../adr/0001-RUNNER-EXPERIMENT.md) und [Bedrohungsmodell](BEDROHUNGSMODELL.md). Normative Limits sind Startwerte, durch Grenzwerttests zu prüfen; Änderung erfordert Versions-/Reviewentscheidung.

## Bindung und Kanalaufbau

H hält intern `{frame, port, sessionId, instanceId, templateVersionId, revision, phase}`. R kann diese Zuordnung weder wählen noch ändern. `instanceId` und `templateVersionId` sind keine Bridgefelder. Ein neuer Runner erhält eine neue zufällige `sessionId` (128 Bit, hex), ein neues `MessageChannel` und Sequenzzähler. Token/Port authentisieren keine Vorlage und keine Person.

H setzt `srcdoc` vor dem Einhängen des neuen Frames und wartet genau auf dessen initiales `load`. Er sendet einmalig an genau dessen `contentWindow` ein kleines strukturiertes `INIT` mit `{v:1,type:"INIT",sessionId}` und genau einem transferierten Port. Wegen opaque Origin ist `targetOrigin="*"` erforderlich. INIT enthält **keinen** State, HTML oder sonstige Profildaten. H verarbeitet keine eingehenden Window-`message`-Nachrichten. Es gibt kein READY-Broadcast und kein Fallback auf `postMessage`-Kommunikation ohne Port.

Der Bootstrap akzeptiert INIT nur einmal, von `event.source === parent`, der beim Erzeugen festgelegten H-Origin, mit genau einem Port und korrektem Schema. Das ist defensive Bootstraplogik; Angreiferskripte im selben Frame können dennoch den Port erhalten oder den Adapter ersetzen. `event.origin === "null"` ist niemals ein Identitätsbeleg.

Ab INIT laufen alle Protokollnachrichten als **JSON-Strings** über den Port. Andere Typen und zusätzliche transferierte Ports werden abgewiesen. Eine Navigation kann zwischen Browserereignissen stattfinden: Kanal-/Loadprüfung beweist keine Dokumentauthentizität und verhindert keine Anfrage. Daher erhält S01–S10 nur synthetischen In-Memory-State; echte Wiederherstellungsdaten erst nach dem Isolationsgate. Ist Selbstnavigation möglich, kann dieser Vertrag die Datenfreigabe nicht retten.

## Umschlag und feste Datentypen

Jede Portnachricht hat genau `{v,sessionId,seq,type,payload}`. `v` ist 1, `sessionId` exakt die aktive ID, `seq` eine positive sichere Ganzzahl, beginnend mit 1 und je Richtung lückenlos um 1 steigend. Unbekannte Typen, Felder, Enumwerte, falsche Phase, Sequenzlücken und Replays sind Protokollverstöße. IDs für Requests/Changes sind laufende positive sichere Ganzzahlen, kein frei gewählter Text. Revisionen sind sichere Ganzzahlen von 0 bis `Number.MAX_SAFE_INTEGER`; ein Überlauf wird als Fehler behandelt.

JSON-Daten enthalten nur null, boolesche Werte, endliche Zahlen, Strings, Arrays und reine Objekte. `__proto__`, `prototype` und `constructor` als Schlüssel sind überall verboten. Nach `JSON.parse` strikt validieren; keine Objektmischung in Hostkonfigurationen und kein dynamischer Property-/Funktionsaufruf. URLs, HTML, Dateinamen oder Storageziele sind in keinem Befehl vorgesehen. Text im State bleibt untrusted und wird im Host nur als Text verarbeitet.

| Richtung / Typ | Exakte Payload | Erlaubte Phase / Wirkung |
|---|---|---|
| R→H `READY` | `{adapterId,adapterVersion}` | Einmal in `await-ready`; Adapter muss hostseitig unterstützt sein. |
| H→R `RESTORE_STATE` | `{requestId,revision,adapterId,adapterVersion,state}` | Einmal nach READY; nur eigener State, bei neuer Instanz gültiger leerer Adapterstate. Phase `await-restore`. |
| R→H `RESTORED` | `{requestId,revision}` | Muss genau Restore bestätigen, ohne neue Nutzlast; danach `active`. Keine Zusage, dass ein bösartiges Blatt ehrlich restaurierte. |
| R→H `STATE_CHANGED` | `{changeId,baseRevision,state}` | Nur `active`, ein unbestätigter Change gleichzeitig. Adapter ist sitzungsgebunden. H validiert vollständig und führt später CAS-Commit aus. |
| H→R `STATE_ACCEPTED` | `{changeId,revision,durability}` | `durability` ist `memory` im Labor oder `committed` nach erfolgreicher DB-Transaktion. Nur bestätigte Revision als neue Basis verwenden. |
| H→R `STATE_REJECTED` | `{changeId,code}` | `code`: `CONFLICT`, `STORAGE_ERROR`, `READ_ONLY`. Kanal danach schließen; H zeigt Fehler, bewahrt begrenzten ungespeicherten Kandidaten nur im RAM. Kein automatisches Überschreiben. |
| H→R `REQUEST_STATE` | `{requestId,reason}` | Nur `active`, kein H bereits bekannter offener Change/Request; ein noch ungesehener Crossing-Change ist unten geregelt. `reason`: `checkpoint`, `close`, `export`. Keine Export-/Dateiberechtigung. |
| R→H `STATE_SNAPSHOT` | `{requestId,baseRevision,state}` | Nur passender offener Request; dieselbe Validierung/CAS wie Change, dann `SNAPSHOT_ACCEPTED`. |
| H→R `SNAPSHOT_ACCEPTED` | `{requestId,revision,durability}` | Identischer State kann dieselbe Revision behalten; Commitgarantie wie oben. |
| H→R `SNAPSHOT_REJECTED` | `{requestId,code}` | `code`: `CONFLICT`, `STORAGE_ERROR`, `READ_ONLY`. Nur für passenden Snapshot; gleiche Fehleranzeige/RAM-Begrenzung wie STATE_REJECTED, danach Kanal schließen. |
| R→H `ADAPTER_ERROR` | `{code}` | Nur vor/innerhalb `active`; `code`: `UNSUPPORTED_FIELD`, `AMBIGUOUS_ID`, `RESTORE_FAILED`, `SERIALIZE_FAILED`. H stoppt als inkompatibel, keine freien Fehlermeldungen. |
| H→R `CLOSE` | `{code}` | Best Effort vor Portschluss; `code`: `USER_CLOSE`, `REPLACED`, `TIMEOUT`, `PROTOCOL`, `NAVIGATION`. Keine Empfangsbestätigung nötig. |

Die einzigen v1-Adapter sind `standard-fields` Version 1 und `drag-demo` Version 1, mit [P06-State-Schemas](DATENVERTRAG-V1.md). Keine freie Adapter-URL, kein dynamisches Plugin. Neue Adapter werden explizit registriert und reviewt.

### Crossing von Request und Change

Ein REQUEST_STATE kann einen bereits von R abgeschickten, bei H noch ungesehenen STATE_CHANGED kreuzen. Das ist allein kein Protokollverstoß. H hält genau einen Request offen und akzeptiert währenddessen höchstens diesen einen Crossing-Change nach den normalen Validierungs-/CAS-Regeln. H bestätigt ihn mit STATE_ACCEPTED oder beendet bei STATE_REJECTED den Kanal; kein zweiter Change wird gequeued.

Beim Empfang von REQUEST_STATE pausiert R weitere STATE_CHANGED. Ist ein Change unbestätigt, wartet R zuerst dessen STATE_ACCEPTED ab, übernimmt dessen Revision und sendet dann genau einen STATE_SNAPSHOT mit dieser neuen Basis und dem jüngsten lokalen State. Ohne offenen Change sendet R den Snapshot unmittelbar. R nimmt automatische Changes erst nach SNAPSHOT_ACCEPTED wieder auf; bei SNAPSHOT_REJECTED endet die Sitzung. H hält den Request bis Snapshotbestätigung oder Kanalabschluss offen.

Die Snapshotfrist bleibt **2 Sekunden ab REQUEST_STATE**, einschließlich eines Crossing-Commit-Wartens, und wird nicht verlängert. Ein legitimer langsamer Commit kann daher zum Timeout führen, obwohl seine separate Commitfrist 5 Sekunden beträgt. H schließt dann ohne Snapshot-Erfolgsbestätigung, versucht offene Transaktionen abzubrechen und meldet den Abschluss als unbestätigt. Eine bereits abgeschlossene/noch erfolgreich abschließende Change-Transaktion darf als tatsächlich lokal bestätigt erfasst werden, wird aber nicht als erfolgreicher Snapshot/Exportabschluss ausgegeben; nach Kanalabschluss kein ACK. Diese bewusst strenge Grenze vermeidet unbegrenztes Warten und Queueing.

## Größen, Häufigkeit und Zeit

| Grenze | v1-Wert / Reaktion |
|---|---|
| Datei vor Lesen | 2 MiB (`2 * 1024 * 1024` Bytes); zu groß vor FileReader/ArrayBuffer ablehnen. Striktes UTF-8, kein stiller Ersatz ungültiger Bytes. |
| Parser-AST | 20.000 Knoten, Tiefe 64, 64 Attribute/Element; Überschreitung ablehnen. Keine garantierte Parserlaufzeit. |
| Portnachricht | Vor JSON-Parsing Stringtyp und maximal 393.216 UTF-16-Codeunits; danach UTF-8 maximal 384 KiB (393.216 Bytes). Größenverletzung schließt Sitzung. Browser kann bereits vorher kopiert haben. |
| `state` | `JSON.stringify(state)` UTF-8 maximal 256 KiB (262.144 Bytes); zusätzliche adapterspezifische Grenzen gelten ebenfalls. |
| JSON-Struktur | Tiefe maximal 16 (Root Tiefe 1), insgesamt maximal 20.000 Werte einschließlich Container; 2.048 Einträge/Array, 1.024 Properties/Objekt, Schlüssel maximal 64 UTF-8-Bytes, einzelner String maximal 16 KiB UTF-8. |
| Eingang pro Sitzung | Token Bucket: 20 Tokens initial/maximal, 10 Tokens/Sekunde kontinuierlich nachfüllen; jede Portnachricht kostet vor Parsing 1 Token. Mehr als 4 MiB UTF-8 innerhalb eines rollenden 10-Sekunden-Fensters ebenfalls Verstoß. Kein Reset durch ungültige Daten. |
| Hostausgang | Gleiche Byte-/Strukturlimits und maximal 10 Nachrichten/Sekunde, Burst 20. Nur eine aktive Sitzung. |
| Handshake | READY binnen 3 Sekunden nach INIT, RESTORED binnen 3 Sekunden nach RESTORE_STATE; sonst schließen. Frist beginnt beim Senden mit monotoner Uhr. |
| Snapshot / Commit | Snapshot binnen 2 Sekunden; DB-Commit binnen 5 Sekunden ohne Erfolgsanzeige, bei Überschreitung Hostfehler/Transaktionsabbruch versuchen. Timeout ist keine Garantie, dass Browserthread bedienbar bleibt. |
| Änderungen | Runner coalesziert: 500 ms Ruhezeit, spätestens nach 2 Sekunden ohne offenen Change senden; während ACK aussteht nur jüngsten lokalen Kandidaten behalten. Kein unbeschränktes Queueing. |

## Lebenszyklus und Fehler

`created → await-load → await-ready → await-restore → active → closed`. Timeout auf initiales `load`: 5 Sekunden. Listener/Timer/Port werden beim Schließen entfernt, Frame entfernt und interne Bindung gelöscht. Eine geschlossene Sitzung wird niemals wiederverwendet. Jede weitere Dokument-`load`-Meldung widerruft die Sitzung; Fragmentänderung allein ist kein neues Dokument, muss aber X02 bestehen.

Ein Protokollverstoß, `messageerror`, weiterer Port, Größen-/Rateverletzung oder Adapterfehler schließt ohne Reflection der Angreifernutzlast. H zeigt einen festen Diagnosecode als Text. User-Close darf sofort abbrechen; für einen gewünschten Abschluss kann H zunächst REQUEST_STATE anfordern, bestätigt aber bei Timeout keine Speicherung. Dateiwechel öffnet erst nach Widerruf eine neue Sitzung. Auf `beforeunload` wird nicht als Speichermechanismus gebaut.

Ein Heartbeat kann Ressourcenstillstand nicht zuverlässig beheben und ist keine Pflicht. Ein Hosttimer kann gemeinsam mit R blockieren; das Entfernen eines Frames ist keine garantierte Prozessbeendigung. Tests für Endlosschleifen/allokationsbedingte Abstürze laufen unter externem Prozess-Timeout und ohne echte Daten.

## Erforderliche Grenztests

TEST-BRIDGE-01/02 müssen Grenzwert und Grenzwert+1 für Bytes/Struktur/Sequenz, fremde/alte Ports, zweite INIT, alte Sitzung, Replay, falsche Phase, Protokoll-/Adapterversion, falsche Payloads, Rate-Burst/Refill/Fenster, Commitfehler für Change und Snapshot, Crossing mit neuer Snapshot-Basis, langsamen Crossing-Commit mit 2-Sekunden-Timeout, Navigation vor/nach INIT und wiederholtes Öffnen/Schließen prüfen. Ein beliebiger gültiger State darf nur die fest gebundene aktive Instanz ändern; niemals eine URL, einen Download oder einen Host-DOM-Sink auslösen.
