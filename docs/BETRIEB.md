# Repository und Hosting

## Repository

Repository: [TaughtMe/HTML-Worksheet](https://github.com/TaughtMe/HTML-Worksheet), vom Projektverantwortlichen bereitgestellt. Das Repository ist öffentlich. Der ursprüngliche lokale Arbeitsname war `html-arbeitshefte`. Planung liegt zusammen mit späterem Code in Git; keine echten Schülerantworten oder Zugangsdaten einchecken. Die bestehende Sichtbarkeit wird nicht verändert.

Vorgesehene Struktur, schrittweise anzulegen:

```text
docs/                  Anforderungen, ADRs, Bedrohungsmodell, Prüfberichte
apps/security-lab/     begrenzter Browser-Sicherheitsprototyp
apps/web/              spätere Host-PWA
packages/protocol/     versionierte Schemas und Adapterverträge
packages/storage/      spätere lokale Persistenz
tests/fixtures/        harmlose und bösartige synthetische Arbeitsblätter
tests/e2e/             Browser- und Offline-Regressionen
```

`main` enthält prüfbare Zwischenstände. Pro kleinem Arbeitspaket ein Branch/PR; kritische Änderungen mit gesondertem Review. CI erhält minimale Rechte, gepinnte Aktionen und niemals Produktionssecrets für Fremdcode-Tests. Automatisches Deployment bleibt zunächst ausgeschaltet. Branchschutz wird erst konfiguriert, wenn reale Prüfjobs existieren und der GitHub-Tarif dies unterstützt.

## Cloudflare-Entscheidung

**Jetzt nicht erforderlich.** Planung und lokale Desktop-Experimente benötigen kein externes Hosting. Für reale iPad-/Android-Tests von PWA, Service Worker und Teilen ist später eine stabile HTTPS-Origin nötig; `localhost` am Entwicklungsrechner ersetzt diesen Gerätetest nicht.

Vorgesehen ist ein statisches Cloudflare-Pages-Projekt nach bestandenem lokalem Sicherheitsgate. Vor Einrichtung vorhandenen Kontozugang und verfügbare Hosting-Funktionen prüfen. Keine kostenpflichtige Leistung, Domainregistrierung oder Datenbank ist für diesen Schritt vorgesehen.

Konkretes Hosting-Paket H01:

1. Sol medium: Build-Artefakt, CSP-/Permissions-Policy-/Referrer-Policy-Header und Origin-Aufteilung spezifizieren. Seiten mit fremdem HTML nicht frei auf der Host-Origin veröffentlichen.
2. Luna medium: dokumentierte statische Konfiguration und Deployment-Anleitung erstellen; Geheimnisse ausschließlich in der Plattformkonfiguration.
3. Sol high: Header, MIME-Typen, Cache-Regeln, fehlende Dateien und SPA-Fallback nach Deployment tatsächlich prüfen. Ein HTML-Fallback darf keine erwartete Skript-/Worker-Datei ersetzen.
4. Zugriff auf die Testumgebung kontrollieren; Authentifizierung mit Offline-Start und Cacheverhalten testen. Ein privates GitHub-Repository macht eine Pages-URL nicht automatisch privat.
5. Nur synthetische Testinhalte verwenden. App-Auslieferung erzeugt möglicherweise Hosting-Zugriffsprotokolle, auch ohne Übermittlung von Schülerantworten; Aufbewahrung und Datenschutz vor Pilotbetrieb prüfen.
6. Release und Rollback dokumentieren, anschließend Gate G1b auf realen Geräten durchführen.

Falls die Sicherheitsuntersuchung eine separate Runner-Origin erfordert, wird sie als eigene, datenarme Origin mit eigenen Cache-/Headerregeln geplant. Eine Subdomain oder zweites Deployment allein beweist keine Isolation und keine Offline-Funktion.

Eine Online-Vorlagenbibliothek mit Upload, Berechtigungen und Moderation bleibt ein späteres eigenes Projektpaket. Das statische App-Hosting begründet noch keinen Bedarf für Workers, R2, D1 oder Benutzerkonten.
