# UI-Referenzen: iPad-Arbeitsblatt-App

Stand: 27. Oktober 2026. Diese Notiz ordnet ein geliefertes Mockup den geplanten Produktphasen zu. Es ist eine visuelle Ideensammlung, kein freigegebener Entwurf und kein Implementierungs- oder Sicherheitsnachweis.

## Herkunft und Inventar

Quelle: [unverändertes ZIP-Designarchiv](references/ipad-worksheet-ui.zip), ursprünglich `iPad-Anwendung für Arbeitsblätter.zip`, 128.821 Byte, SHA-256 `531dcb8add3b7aa92d77ecd339e11d7ed18e0cd94f0c9c6c52142a895979d2bf`. Das Archiv wird ausschließlich als statische Designreferenz aufbewahrt, nicht als App- oder Laufzeitabhängigkeit; externe Skripte daraus wurden nicht ausgeführt. Es enthält sechs reguläre Einträge ohne absolute oder traversierende Pfade und ohne Symlinks: `.thumbnail` (11.658 B, WebP), `github.md` (348 B), zwei `.dc.html`-Mockups (78.904 B und 70.109 B), `support.js` (69.150 B) und eine PNG-Zeichnung (62.425 B). Die Bilder wurden lokal betrachtet; Einzeldateien wurden nicht als ausführbarer App-Code übernommen. Das Originalarchiv liegt unverändert bei.

Beide HTML-Dateien verwenden eigene `x-dc`-/`sc-if`-/`sc-for`-Syntax und laden `./support.js`. Dieses Skript verlangt Babel, React und ReactDOM von `unpkg.com`, verwendet `fetch` und dynamische `Function`-Erzeugung. Die Mockups sind deshalb nicht eigenständig und passen nicht zu den Offline-, Sicherheits- und Abhängigkeitszielen. Nichts daraus wurde installiert, ausgeführt oder extern geladen. Beispielinhalte sind Mockdaten, keine reale Datenquelle.

## Verwendbare UI-Ideen und Zeitpunkt

| Mockup-Bereich | Wiederverwendbare Idee | Einordnung und Anpassung |
|---|---|---|
| „Meine Blätter“ mit Navigation und Inhaltsbereich | Klarer Einstieg in persönliche Arbeitsblätter und übersichtliche Navigation | Produktoberfläche erst in Abschnitt 4 nach G3. Das aktuelle Sicherheitslabor bleibt eine minimale Datei-/Demo-Oberfläche. |
| Arbeitshefte, Ordner, Kapitel und Blattkarten | Sichtbare Hierarchie mit Titel, Fach, Datum und Bearbeitungsstatus | U03–U05 nach G3: an geprüfte lokale Repository-API anbinden; Verschieben/Löschen mit bestätigten Datenregeln. Keine Mockdaten in echte Listen übernehmen. |
| „Neu“-Menü für Ordner, Heft, Kapitel und Öffnen | Handlungen an einer Stelle auffindbar machen | Interaktionskonzept für U03/U04. Erst nach Definition der Hierarchie-, Lösch- und Zuordnungsregeln umsetzen. |
| Arbeitsblatt öffnen, „Deine Antwort“, Arbeitskopie und Erneut teilen | Vorlage und persönliche Bearbeitung als getrennte Abläufe erkennbar machen | Import- und Runnerablauf hängt von G1a ab; unabhängige Instanz und bestätigter Autosave von G2. Mockup belegt keine dieser Funktionen. |
| Statuskarten und „Auf diesem iPad“-Hinweis | Speicher-/Sicherungsstatus sichtbar und ohne falsche Zusage darstellen | U02 in Abschnitt 4 nach G3, aufbauend auf den Speichernachweisen aus G2. Fehler und noch nicht bestätigte Speicherung müssen wahrheitsgemäß erscheinen; keine Aussage „gespeichert“ allein aufgrund eines UI-Ereignisses. |
| Quer-/Hochformat, Seitenleiste/Regal und Schriftwahl | Layoutanpassung an Tablet-Ausrichtung und Lesbarkeit | Als spätere UI-Option prüfen; Geräteverhalten unter G1b und Touch-/Tastatur-/Screenreader-Ablauf U08 real testen. |
| PDF-, Teilen- und ZIP-Beschriftungen | Nutzeraktion und Exportformat klar benennen | PDF-Ansicht, Datei und Web Share gehören zu Abschnitt 3/G3; vollständiger Vorlagenaustausch zu Abschnitt 5/G5. Die Mockup-Labels sind keine vorhandene Exportfunktion. |

## Abgrenzung zum vorhandenen Stand

Das Repository enthält derzeit das lokale Sicherheitslabor mit Dateiauswahl, „Öffnen“, „Synthetische Demo“, „RAM-Snapshot“ und „Schließen“ ([Laboranleitung](../../apps/security-lab/README.md)). Es gibt noch keine Produktnavigation, IndexedDB, Wiederherstellung, Arbeitsheftverwaltung, PDF-Ausgabe oder installierbare Offline-PWA. Das Mockup darf diese Lücken nicht als bereits gelöst erscheinen lassen.

Die Reihenfolge bleibt: Sicherheitsnachweis G1a und Geräteprüfung G1b für die jeweilige Freigabe, danach Speicherung/Wiederherstellung G2, PDF G3, erst anschließend Produktoberfläche und vollständiger lokaler Ablauf G4. Echte personenbezogene Schülerdaten sind von diesem synthetischen Technik- und UI-Prototyp ausgeschlossen. Link-/QR-Import und öffentliche Bibliothek bleiben spätere Funktionen außerhalb des MVP.

Für eine spätere Umsetzung werden Gestaltung und Interaktionen neu in die Host-PWA übertragen. Der Mockup-Lader, seine CDN-Abhängigkeiten und sein dynamischer Ausführungspfad werden nicht als Laufzeitbasis übernommen. Vorlagen und Antworten bleiben getrennt; Status-, Export- und Speicheranzeigen müssen sich an tatsächlich bestätigten lokalen Zuständen orientieren.
