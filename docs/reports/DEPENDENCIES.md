# Dependencyinventar – installierter Security-Lab-Stand

Erfasst am 25. Oktober 2026 in `/workspace/HTML-Worksheet` anhand von `package.json`, `package-lock.json`, lokal installierten Paketmetadaten/Lizenzdateien und `npm ls --all`. Es wurden keine Registry-Abfragen und keine Netzwerkzugriffe ausgeführt. Dieser Bericht bewertet Lizenzhinweise und Lockfile-Metadaten; er ist weder Sicherheitsfreigabe noch Advisory- oder Wartungsaudit.

## Direkt- und Laufzeitabhängigkeiten

| Paket | Rolle | Angeforderte / installierte Version | Deklarierte Lizenz | Lokal vorhandene Lizenz-/Hinweisquelle |
|---|---|---|---|---|
| `parse5` | Runtime, direkt | `7.3.0` / `7.3.0` | MIT | `node_modules/parse5/LICENSE` |
| `entities` | Runtime, transitiv über parse5 | `6.0.1` / `6.0.1` | BSD-2-Clause | `node_modules/entities/LICENSE` |
| `esbuild` | Dev, direkt | `0.25.12` / `0.25.12` | MIT | `node_modules/esbuild/LICENSE.md` |
| `@esbuild/linux-x64` | optionale plattformspezifische esbuild-Binärdatei, installiert auf Linux x64 | `0.25.12` / `0.25.12` | MIT | Paketmetadatum `node_modules/@esbuild/linux-x64/package.json`; dort liegt keine separate LICENSE-/NOTICE-Datei. Der zugehörige Upstream-Lizenztext ist lokal in `node_modules/esbuild/LICENSE.md` vorhanden. |
| `typescript` | Dev, direkt | `5.9.3` / `5.9.3` | Apache-2.0 | `node_modules/typescript/LICENSE.txt`; zusätzliche Drittanbieterhinweise in `node_modules/typescript/ThirdPartyNoticeText.txt` |
| `playwright` | Dev, direkt | `1.57.0` / `1.57.0` | Apache-2.0 | `node_modules/playwright/LICENSE`, `NOTICE` und `ThirdPartyNotices.txt` |
| `playwright-core` | Dev, transitiv über playwright | `1.57.0` / `1.57.0` | Apache-2.0 | `node_modules/playwright-core/LICENSE`, `NOTICE` und `ThirdPartyNotices.txt` |

Für alle sieben installierten Pakete stimmen angeforderte und installierte Versionen überein. Paketmetadaten nennen die obigen Lizenzen. Die lokalen Lizenz-/Hinweisdateien wurden auf Vorhandensein und Anfang/Inhalt geprüft; diese Bestandsaufnahme ersetzt keine rechtliche Prüfung der Einbindung oder Weitergabe. Für `@esbuild/linux-x64` wurde keine fehlende oder unzulässige Lizenz festgestellt: `package.json` deklariert MIT und die zugehörige esbuild-Distribution enthält den MIT-Text; eine eigene Lizenzdatei im Plattformpaket fehlt.

## Lockfile und Installation

- `package-lock.json` verwendet `lockfileVersion: 3` und enthält 34 Einträge inklusive Root: 33 Nicht-Root-Paketdatensätze.
- Alle 33 Nicht-Root-Datensätze haben ein `integrity`-Feld; davon 7 entsprechen derzeit installierten Paketen und 26 sind nicht installierte optionale Plattformvarianten bzw. optionale Pakete. 25 der fehlenden Datensätze sind andere esbuild-Plattformpakete; `fsevents@2.3.2` ist ein optionales Darwin-Paket.
- Die sieben aktuell installierten Datensätze enthalten jeweils einen SHA-512-SRI-Wert. Aufgeführt sind die im Lockfile gespeicherten Werte; sie wurden in diesem Auftrag nicht gegen Tarballbytes neu berechnet.

| Installierter Paketdatensatz | Version | Lockfile-SRI (`integrity`) |
|---|---:|---|
| `parse5` | `7.3.0` | `sha512-IInvU7fabl34qmi9gY8XOVxhYyMyuH2xUNpb2q8/Y+7552KlejkRvqvD19nMoUW/uQGGbqNpA6Tufu5FL5BZgw==` |
| `entities` | `6.0.1` | `sha512-aN97NXWF6AWBTahfVOIrB/NShkzi5H7F9r1s9mD3cDj4Ko5f2qhhVoYMibXF7GlLveb/D2ioWay8lxI97Ven3g==` |
| `esbuild` | `0.25.12` | `sha512-bbPBYYrtZbkt6Os6FiTLCTFxvq4tt3JKall1vRwshA3fdVztsLAatFaZobhkBC8/BrPetoa0oksYoKXoG4ryJg==` |
| `@esbuild/linux-x64` | `0.25.12` | `sha512-uqZMTLr/zR/ed4jIGnwSLkaHmPjOjJvnm6TVVitAa08SLS9Z0VM8wIRx7gWbJB5/J54YuIMInDquWyYvQLZkgw==` |
| `typescript` | `5.9.3` | `sha512-jl1vZzPDinLr9eUt3J/t7V6FgNEw9QjvBPdysz9KfQDD41fQrC2Y4vKQdiaUpFT4bXlb1RHhLpp8wtm6M5TgSw==` |
| `playwright` | `1.57.0` | `sha512-ilYQj1s8sr2ppEJ2YVadYBN0Mb3mdo9J0wQ+UuDhzYqURwSoW4n1Xs5vs7ORwgDGmyEh33tRMeS8KhdkMoLXQw==` |
| `playwright-core` | `1.57.0` | `sha512-agTcKlMw/mjBWOnD6kFZttAAGHgi/Nw0CZ2o6JqWSbMlI219lAFLZZCyqByTsvVAJq5XA5H8cA6PrvBRpBWEuQ==` |

`npm ls --all` zeigt die obigen sieben installierten Pakete und meldet die übrigen plattformabhängigen bzw. optionalen Pakete als `UNMET OPTIONAL DEPENDENCY`; es zeigt keine Versionsabweichung der installierten Pakete. `node_modules` enthält somit nicht jede für andere Betriebssysteme im Lockfile aufgeführte optionale Variante.

## Offene Prüfung

Es wurde kein Advisory-Datenbankabgleich ausgeführt und keine Wartungsaktivität, Releasehistorie oder Supportzusage geprüft. Diese Punkte bleiben ausdrücklich offen und sind vor einer weitergehenden Abhängigkeitsfreigabe separat zu belegen. Lizenzangaben und Lockfile-SRI sind kein Sicherheitsurteil. Der Bericht ändert weder Pakete noch Manifest oder Lockfile.

## Prüfprotokoll

Ausgeführt: `node --version` (v24.19.0), `npm --version` (11.9.0), `npm ls --all`, lokale `package.json`-/`package-lock.json`-Auswertung und Dateiprüfung der genannten Lizenz-/NOTICE-Quellen. Keine Tests, kein Build, keine Neuinstallation, kein Netzabruf. Im Arbeitsbaum waren `package.json` und `package-lock.json` bereits ungetrackt; sie wurden nicht bearbeitet oder committet. Dieser Commit enthält ausschließlich diesen Bericht.

## Nachtrag der Koordination: Registry-Advisoryabgleich

Nach der lokalen Bestandsaufnahme wurde `npm audit --json --fetch-retries=0 --fetch-timeout=10000 --cache=/tmp/worksheet-npm-cache` mit einem äußeren 20-Sekunden-Zeitlimit ausgeführt. Exitcode 0; die Registry meldete **0 bekannte Advisories** für diesen aufgelösten Stand. [Unveränderte JSON-Antwort](evidence/npm-audit.json). Das ist ein zeitpunktbezogener Datenbankabgleich, kein Nachweis der Abwesenheit unbekannter Schwachstellen. Eine gesonderte Wartungs-/Releasehistorienprüfung bleibt offen.

Lockdatei SHA-256 zum Abgleich: `b744736c521f7ab573471cc08de4e8b54042c93fff7dedc2ee7ec4311541cfbd`. Manifest und Lockdatei wurden gemeinsam in `11aa073` übernommen.
