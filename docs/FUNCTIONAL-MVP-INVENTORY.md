# Funktionaler MVP: UI-Inventur und nachgewiesener Umfang

Stand: 5. November 2026. Die Mockup-Inventur und frühere Zeilen mit „Nein“ beschreiben die historische Ausgangslage, nicht den heutigen Appstand. Der implementierte MVP und seine Teilprüfungen sind unten dokumentiert. Dies ist keine G1-, vollständige Offline-PDF- oder Gerätefreigabe.

## Referenz und wiederverwendbare Gestaltung

`docs/ui/references/ipad-worksheet-ui.zip` bleibt eine statische Referenz. Es enthält zwei `.dc.html`-Mockups, `support.js`, `github.md`, eine WebP-Vorschau und eine PNG-Zeichnung. Die Vorschau ist lokal als `/tmp/functional-ui-ref/.thumbnail` extrahiert; die Originalzeichnung ist `/tmp/functional-ui-ref/uploads/draw-d8ad33e3-75ac-4d7f-a698-a80c7afa13ca.png`. Keine Datei aus dem Archiv wurde ausgeführt.

Die gut übertragbaren Ideen sind eine linke Navigation mit persönlichen/sortierten Listen, eine Hierarchie Ordner → Arbeitsheft → Kapitel, Karten für Arbeitsblätter, sichtbare Öffnen-/Neu-Aktionen und ein klarer Bereich für lokalen Speicherstatus. Der visuelle Charakter nutzt warme Papierflächen, dunkle Tinte, großzügige Abstände, gerundete Karten und dezente Schatten. Das lässt sich mit gebündeltem CSS, Systemschriften und lokalen Inline-SVG- oder CSS-Icons nachbilden; weder externe Schrift- noch Icon-CDNs sind nötig.

Die Mock-Logik besteht aus Beispieldaten, Onboarding- und Navigationszuständen, Orientierung-/Schriftwahl, Overlay-/Menüaktionen und Demo-Karten. Sie implementiert weder echte Ablage noch CRUD, Autosave, Backup oder PDF. `support.js` verlangt Babel/React/ReactDOM von `unpkg.com`, lädt Code dynamisch und verwendet `Function`; es wird weder übernommen noch ausgeführt. Es gibt keinen produktiven Markup-/CSS-/Iconbaustein im Repository, der direkt wiederverwendet werden könnte. Wiederverwendbar ist das Layoutkonzept, neu umgesetzt in der vorhandenen lokalen Host-App.

## Historische Ausgangslage

Vor dem funktionalen MVP existierte nur das Sicherheitslabor mit enger Dateiannahme, Runner und volatilem RAM-State. Es fehlten Produktnavigation, Repository, PDF und App-Shell. Diese Baseline ist kein aktueller Mangelstand.

## Implementierter MVP und Funktionsmatrix

Implementiert sind die `strict-v1`-Arbeitsblatt-App mit Bibliothek, IDB-v1 für Vorlagen/Instanzen/Revisionen/Container, Session-/Konfliktbehandlung, bestätigtem Speichern und Wiederöffnen, Arbeitskopien, vollständigem Backupimport/-export, Service-Worker-Appcache und semantischem PDF mit lokalem Download. Das PDF ist ein Datenbericht, kein originales HTML-Layout.

| Nutzerkernablauf | Implementiert | Getestet | Praktisch belegt |
|---|---|---|---|
| Bibliothek, Container, Vorlage/Instanz und unterstützte Felder | Implementiert | Workflow 4/4, Smoke 2/2 | Lokale Online-App in Chromium belegt |
| IDB speichern, wiederöffnen, Revisionen/Konflikte behandeln | Implementiert | Native IDB 5/5, Modell 3/3, Workflow 4/4 | Onlinepersistenz und separater Offline-State-Profilneustart belegt |
| Backupimport/-export und Arbeitskopie | Implementiert | Smoke/Backup 2/2 und Workflowfälle | Lokaler Backupdownload/-import belegt; Sicherung enthält Antworten |
| Semantische PDF-Datei | Implementiert | PDF-Modell/Fehlerfälle 2/2 | Echter mehrseitiger Online-PDF-Download und Textextraktion belegt |
| App-Shell offline und persistente Antworten | Implementiert | Offline-State 1/1 | Server aus, ECONNREFUSED, Appnavigation nur via Service Worker, State nach Profilneustart wiederhergestellt |
| Voller Offlineablauf bis zum PDF-Download | Implementiert, E2E nicht abgeschlossen | Lokal blockiert: Chromium 154 schloss beim Blobdownload auch mit Textblob-Kontrolle | Kein Pass; Ursache nicht festgestellt |
| Browsermatrix und reale Geräte | Chromium/Firefox Full-Flow in CI; WebKit vor Stage 1 blockiert; Geräte offen | CI 42235649475 unabhängiger Rohreview: C/F je 5/5; WebKit wegen leerem aktivierten Worker-Cache blockiert, Diagnose offen | Kein WebKit-/iPad-/Android-Nachweis, native Share nicht praktisch geprüft |

Die spätere gezielte UI-Review-Prüfung bestätigt nun Layout auf 390/820/1440 px: alle 13 Aktionen je Ansicht innerhalb der Viewportgrenzen, echte Arbeitsblattfelder sichtbar, und mobile Navigation zu „Alle“, Arbeitsheft und Kapitel funktionsfähig. Details und kanonische Worksheet-Viewportbilder liegen im [UI-Reviewarchiv](reports/evidence/functional-ui-review-42116489219/manifest.json). Der integrierte CI-Lauf 42235649475 bestätigt den Full-Flow in Chromium und Firefox samt unabhängiger Rohprüfung. WebKit 26.0 blockierte vor Stage 1 wegen leerem aktivierten Worker-Cache; Ursache offen. Das ist kein Drei-Engine- oder Gerätepass.

## Umsetzungsschnittstelle

Die UI nutzt den bestätigten Core-Vertrag. Eine sichtbare Speicherbestätigung folgt erst auf abgeschlossene IDB-Transaktion; Appcache enthält nur Appdateien, keine Vorlagen oder Antworten.

Die statische Referenz bleibt Designinspiration. `support.js`, seine CDN-Abhängigkeiten und dynamische `Function` werden nicht in die App übernommen.

## Priorisierte MVP-Folge

1. Core-Vertrag und Nutzerdatenmodell bestätigen: lokale Datenbank, transaktionale Repository-API, Fehlerzustände und die Bedeutung bestätigter Speicherung.
2. Host-Shell mit responsiver linker Hierarchie und Hauptbereich umsetzen; Systemschriften und gebündelte Icons verwenden, Fokus und Tastaturbedienung von Anfang an berücksichtigen.
3. Ordner/Arbeitshefte/Kapitel über die freigegebene API auflisten und navigieren; erst nach passenden geprüften API-Operationen echte Anlegen-/Umbenennen-Aktionen anbieten.
4. Arbeitsblattliste an reale Vorlagen-/Instanzdaten anbinden und Öffnen an den freigegebenen Runner-Flow anschließen; Vorlagen und persönliche Instanzen getrennt halten.
5. Speicherstatus aus Repository-Bestätigungen und Fehlern anzeigen; danach Neustart-/Wiederöffnen und vollständigen Ablauf ohne Konto prüfen. Keine Offline- oder iPad-Zusage ohne zugehörige Tests.
6. Verschieben/Löschen, unabhängige Arbeitskopien, Sicherung, PDF und installierbare Offline-Funktion als getrennte, vertraglich definierte Erweiterungen nachziehen; sie gehören nicht in eine reine UI-Mockimplementierung.
