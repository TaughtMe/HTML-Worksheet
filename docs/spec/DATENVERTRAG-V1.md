# Daten-, State- und Backupvertrag v1

Stand: 24. Oktober 2026; P06. [Bridge v1](BRIDGE-V1.md) und [Anforderungen](ANFORDERUNGEN.md) sind Voraussetzungen. Implementierung erst nach den jeweiligen Gates: Sicherheitslabor nur RAM, IndexedDB nach G1a, vollständige Organisation nach G3. Alle importierten Daten bleiben untrusted.

## Entitäten und Versionen

Alle Entitäten haben `schemaVersion:1`. IDs erzeugt ausschließlich H als zufällige UUIDv4; Dateinamen und fremde IDs bestimmen keine DB-/Dateipfade. Textmetadaten: maximal 256 UTF-8-Bytes, Darstellung als Text, keine URL-/HTMLauswertung. Zeitstempel sind streng validierte ISO-UTC-Strings; sie ersetzen keine Revision. Unbekannte Properties/Versionen werden abgewiesen, nicht still migriert.

| Entität / Store | v1-Felder und Invarianten |
|---|---|
| `TemplateVersion` / `templates` | `id, schemaVersion, sourceBytes, sourceHash, mediaType:"text/html", encoding:"utf-8", title, adapterId, adapterVersion, adapterManifest, createdAt`. Originalbytes maximal 2 MiB, strikt UTF-8; SHA-256 über **Originalbytes**, einschließlich vorhandener BOM. Quelle, Hash, Adapter und Manifest sind nach Import unveränderlich. Normalisierte Runnerquelle nur abgeleitet, niemals Original überschreiben. Hash bedeutet keine Sicherheit. |
| `WorksheetInstance` / `instances` | `id, schemaVersion, templateVersionId, containerId, title, status, headRevision, metadataRevision, createdAt, updatedAt`. `metadataRevision` sichere Ganzzahl ≥0, initial 0, hostseitiger CAS-Zähler für Titel/Status/Container. `containerId` UUID oder null (Wurzel). `status` genau `draft`, `in-progress`, `completed`. Verweis auf bestehende exakte Vorlagenversion, keine automatische Aktualisierung auf neuere Vorlage. |
| `StateRevision` / `revisions` | `schemaVersion, instanceId, revision, adapterId, adapterVersion, state, stateHash, committedAt`. Schlüssel `[instanceId,revision]`, Revision sichere Ganzzahl ≥0. Adapter muss zur Vorlage passen; vollständiger begrenzter JSON-Snapshot, keine ausführbare Funktion/HTMLauswertung. `stateHash`: SHA-256 der unten definierten kanonischen Adapterserialisierung. |
| `Notebook` / `Folder` / `containers` | `id, schemaVersion, kind, parentId, title, metadataRevision, createdAt, updatedAt`; `metadataRevision` sichere Ganzzahl ≥0, initial 0, CAS-Zähler für Titel/Parent. `kind` genau `notebook` oder `folder`, `parentId` UUID oder null. Gemeinsamer Baum: beide Typen können Container enthalten. Jeder Parent existiert; keine Zyklen, keine Tiefe >16, genau ein Parent. Instanz hat genau einen Container oder Wurzel. |
| `DatabaseMeta` / `meta` | `key:"schema", dbVersion:1, schemaVersion:1`. IDB-Versionsnummer und Format-/Adapterversion sind getrennte Verträge. Unbekannte DB-Version nicht überschreiben/zurücksetzen. |

Ein Import erzeugt eine unveränderliche Vorlage und bei Bedarf eine neue unabhängige Instanz mit gültigem Anfangsstate Revision 0. Eine Arbeitskopie erhält eine neue Instanz-ID und eine Kopie des gewählten bestätigten Snapshots als eigene Revision 0; Vorlage darf geteilt werden, State und Historie nicht. `completed` ist schreibgeschützt; neue Bearbeitung erfolgt über explizite Arbeitskopie oder bewusstes Wiederöffnen mit Revisionsprüfung. Metadatenänderungen und Statuswechsel beachten ebenfalls eine hostseitige Versions-/Konfliktprüfung.

## Standardadapter `standard-fields` Version 1

State: `{schemaVersion:1,fields:[...]}`. Höchstens 1.024 Einträge, jeder mit exakt `id,kind,value`; nach ASCII-ID sortiert. IDs passen auf `[A-Za-z][A-Za-z0-9_-]{0,63}`, sind dokumentweit eindeutig und bleiben über dieselbe Vorlagenversion stabil. Keine automatische Positions-ID. Fehlende/mehrdeutige IDs oder dynamisch verändertes Feldinventar bedeuten sichtbar inkompatibel.

| `kind` | Zugehörige Elemente und `value` |
|---|---|
| `text` | `input type=text` und `textarea`; String maximal 16 KiB UTF-8, einschließlich leerem String. |
| `checkbox` | Einzelnes `input type=checkbox`; Boolean. |
| `radio` | Expliziter `fieldset` mit ID und `data-ws-radio-group`, enthaltene Radios haben eindeutige IDs und `name` gleich Gruppen-ID; keine verschachtelte Gruppe. Wert ist gewählte Radio-ID oder null; nicht jeder Radio ist ein eigener Stateeintrag. |
| `select-one` | `select` ohne multiple; eindeutige, explizite Optionswerte, jeweils maximal 128 UTF-8-Bytes. Wert ist ein vorhandener Optionswert oder null bei keiner Auswahl. |
| `select-many` | `select multiple`; Array vorhandener eindeutiger Optionswerte, maximal 128, in Optionsreihenfolge. |

Das hostseitig aus dem Daten-AST erzeugte `adapterManifest` nennt genau diese Felder, Kinds und zulässigen Radio-/Optionswerte, maximal 128 Optionen pro Feld; es ist Datenbeschreibung, kein Plugin. State muss genau dieses Inventar enthalten. File, Password, Hidden, andere Inputtypen, Canvas, Shadow DOM und beliebige JS-Objekte sind nicht automatisch speicherbar und werden als nicht unterstützt gemeldet. Der Adapter erfasst keine Passwörter/Dateiinhalte. Restauration setzt Werte ohne künstliche Nutzerereignisse; eine Vorlage darf über eigenen geprüften Adapter darauf reagieren, nicht über Hostrechte.

## Demoadapter `drag-demo` Version 1

Nur für eine mitgelieferte synthetische, vorab per Hash festgelegte Demovorlage. Manifest: feste `itemIds` (maximal 128) und `zoneIds` (maximal 32), gleiche IDsyntax. State: `{schemaVersion:1,placements:[{itemId,zoneId,position}]}`; jeder Item genau einmal, `zoneId` ist vorhandene Zone oder null für den Pool, `position` Ganzzahl ≥0, je Zone lückenlos und eindeutig. Nach `itemId` sortieren. Keine DOM-Fragmente, Koordinaten als Code oder beliebigen Objekte. Andere komplexe Vorlagen benötigen eine neue ausdrücklich unterstützte Adapterdefinition; kein „universeller“ Custom-JS-Vertrag.

Für beide Adapter: kanonische UTF-8-JSON ohne Whitespace, Top-Level-Schlüssel `schemaVersion` dann `fields`/`placements`, Eintragsschlüssel in der oben genannten Reihenfolge, festgelegte Arraysortierung, Stringescaping durch `JSON.stringify`. Werte bestehen nur aus Strings, Booleans, null und Ganzzahlen; keine uneinheitliche Floatserialisierung. Allgemeine Bridge-State-Limits gelten zusätzlich. Der Hash ist Korruptionserkennung, keine Signatur oder Ehrlichkeitsgarantie des Arbeitsblatts.

## Atomare Revisionen und Konflikte

Eine neue Revision entsteht in **einer** IDB-Readwrite-Transaktion über `instances` und `revisions`: aktuelle `headRevision` lesen, mit `baseRevision` vergleichen, vollständigen validierten Snapshot als Revision `head+1` einfügen, Head und Zeitstempel setzen. Bei Abweichung kein Write (`CONFLICT`), kein Last-Write-Wins. Ein identischer kanonischer State darf ohne neue Revision denselben bestätigten Head zurückmelden. Status `completed`, Vorlage und aktive Sitzung werden vor Transaktionsstart geprüft; ein nachträglich geschlossener Kanal erhält kein ACK.

Erst `transaction.complete` erlaubt `durability:"committed"` und eine sichtbare lokale Speicherbestätigung. `put`-Erfolg allein reicht nicht. Wo verfügbar `durability:"strict"` anfordern; auch dies garantiert keinen Schutz gegen OS-/Geräteverlust. Bei Fehler/Abort/Quota keine Erfolgsanzeige, kein Headwechsel; letzter gültiger Snapshot bleibt. Ein unbestätigter Kandidat darf höchstens einmal im Host-RAM gehalten und als ungespeichert angezeigt werden. Kein unbegrenztes Retry/Queueing, kein automatisches Überschreiben nach Konflikt. Bei Konflikt neue Ansicht des bestätigten Heads oder bewusste unabhängige Arbeitskopie anbieten.

Mindestens Head und unmittelbar vorige gültige Revision behalten; ältere interne Historie darf später kontrolliert bereinigt werden, keine Nutzerhistorie versprechen. Revision 0 und erster Instanzdatensatz entstehen atomar. Für jede explizite Metadatenänderung an Instanz oder Container muss die erwartete `metadataRevision` im selben Readwrite-Commit übereinstimmen und um genau 1 steigen; sonst CONFLICT ohne Write. State-Commits ändern nur Head/Statezeit und erhalten bestehende Metadaten samt Zähler durch Lesen des aktuellen Datensatzes in derselben Transaktion. Status muss auch innerhalb der State-Transaktion noch schreibbar sein. Kein Ganzzahlüberlauf. Tabs bekommen nur Invalidierungshinweise, niemals Vertrauen in einen Broadcast als Commitbeweis; DB-CAS ist maßgeblich. Bei `versionchange` Verbindungen schließen, bei blockierter Migration verständlich pausieren. Migrationen pro bekanntem Vorgänger atomar testen; v1 importiert noch keinen unbekannten Altstand.

## Struktur, Verschieben und Löschen

Verschieben liest betroffene Container/Instanzen innerhalb einer Transaktion, prüft existierenden Zielcontainer, Zyklen, Tiefe und Metadatenrevision, dann genau einen Parent/Container ändern. Wurzel ist ein gültiges Ziel. Kein implizites Kopieren von Antworten.

Standard-Löschen erlaubt nur leere Container. Nichtleere Inhalte zuerst verschieben oder später einen expliziten „Teilbaum löschen“-Ablauf mit Anzahl betroffener Instanzen und bewusster Bestätigung verwenden; dieser löscht Container, Instanzen und Revisionen atomar. Geteilte Vorlagen werden dabei nicht automatisch gelöscht. Eine Vorlage mit Referenzen darf nicht gelöscht werden. Instanzlöschen entfernt deren Revisionen in derselben Transaktion. Kein verwaister Head, Parent oder Vorlagenverweis ist zulässig.

## Backup v1: unkomprimiertes JSON

Datei: UTF-8-JSON, `format:"html-worksheet-backup", formatVersion:1, createdAt, templates, instances, containers, revisions`. Keine Archive, externen Referenzen, Dateipfade, ausführbaren Migrationsskripte oder Anhänge. `templates[].sourceBytes` wird ausschließlich als `{encoding:"base64",data}` repräsentiert; Hash wird nach strikter Base64-Dekodierung neu geprüft. Andere Entitäten entsprechen obigen Schemas, einschließlich verpflichtender `metadataRevision` für Instanzen und Container; `revisions` enthält genau den bestätigten Head pro Instanz. Beim Merge als neue Kopie werden Metadatenrevisionen nach validiertem Einlesen auf 0 initialisiert. Interne ältere Wiederherstellungsrevisionen sind kein Nutzerbestand und nicht Teil von Backup v1.

Limits vor Lesen/Parsing: Datei maximal 32 MiB; höchstens 32 Vorlagen, 256 Instanzen, 64 Notebooks, 256 Folder; Summe dekodierter Originalquellen maximal 16 MiB, Summe kanonischer States maximal 8 MiB. Je Vorlage/State gelten weiterhin 2 MiB/256 KiB. JSON-Tiefe maximal 32; Metadaten und IDs streng prüfen. Das große Base64-Quellfeld ist ausdrücklich eine Backup-Ausnahme zum 16-KiB-Bridge-Stringlimit. Bytebudget begrenzt Parserkosten nur grob; reale mobile Speicherprüfung bleibt G2/G4-Aufgabe. Keine Kompression bedeutet keine Dekompressionsbombe; spätere Archive erfordern neuen Vertrag.

Export liest einen konsistenten bestätigten Snapshot aller Stores in einer Readonly-Transaktion und serialisiert erst danach. Nicht bestätigter RAM-State wird nicht still als gesichert exportiert. Bei laufenden Änderungen Zeitpunkt/Stand im Host anzeigen; nur bewusste Dateiaktion, hostgewählter Dateiname und MIME-Typ.

Import ist **Merge als neue Kopie**, kein Überschreiben: gesamte Datei und alle Limits, Versionen, eindeutigen IDs, Hashes, Adaptermanifest-/Statebezüge, Heads, Zyklen und vollständige Referenzintegrität vor dem ersten Write prüfen. Dann hostseitig frische IDs vergeben und alle Referenzen konsistent remappen. Identische Vorlagen dürfen nur bei gleichen Bytes, Adapter und Manifest wiederverwendet werden; Hash allein genügt nicht. Kein fremder Pfad oder ID wird ein Speicherziel. Erst danach ein Readwrite-Commit über alle betroffenen Stores; Fehler/Quota/Abort lässt den bestehenden Bestand unverändert. Erfolg erst nach Complete. Keine teilweise sichtbaren Stagingdatensätze. Bei unbekannter Version: lesbare Ablehnung, kein „best effort“-Import. D07 prüft Roundtrip auf frischem Profil und Import in gefüllten Bestand.

## Vorlagenaustausch und Betriebsgrenzen

Der spätere T01-Dateityp `html-worksheet-template` Version 1 enthält nur Originalvorlage, öffentliche Vorlagenmetadaten, Adapterversion und Manifest, niemals Instanzen, State, interne Organisationsdaten oder Revisionen. Vorhandene personenbezogene Inhalte innerhalb einer selbst gewählten HTML-Quelldatei lassen sich dadurch nicht automatisch erkennen/entfernen; der Export darf keine gespeicherten Antworten in die Vorlage zurückschreiben. Austausch- und Backupformate dürfen nicht verwechselt werden.

Kein Konto, keine Synchronisierung und kein Server-Backup. IndexedDB kann durch Browser/OS oder Personen desselben Profils gelesen/gelöscht werden. „Lokal bestätigt“ ist keine dauerhafte Sicherung; heruntergeladene Backups sind ebenfalls sensitive Dateien. Realer Speicherverlust, gemeinsame Geräte und Wiederherstellung bleiben Q03/Q04- und menschliche Testaufgaben.
