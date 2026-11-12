# Lokale PDF-Abhängigkeiten und Schrift

PDF wird ausschließlich aus semantischen Text-/Felddaten erzeugt; es gibt keinen HTML-Renderer oder CDN. Die direkten Versionen sind exakt gepinnt, alle transitiven Auflösungen stehen im Lockfile.

| Paket | installierte Version | deklarierte Lizenz |
|---|---|---|
| `pdf-lib` | `1.17.1` | MIT |
| `@pdf-lib/fontkit` | `1.1.1` | MIT |
| `@pdf-lib/standard-fonts` | `1.0.0` | MIT |
| `@pdf-lib/upng` | `1.0.1` | MIT |
| `pako` | `1.0.11` | (MIT AND Zlib) |
| `tslib` | `1.14.1` | 0BSD |

`pdf-lib` und seine Standardfonts/UPNG, pako und tslib liefern Lizenzdateien in den installierten Paketen. `@pdf-lib/fontkit` deklariert MIT in package.json und im mitgelieferten README (kein separates LICENSE im npm-Artefakt). Die beiden geprüften Upstream-LICENSE-Pfade lieferten 404; daraus wird kein zusätzlicher Lizenznachweis behauptet. Esbuild erhält vorhandene Lizenzkommentare im Bundle.

## Open Sans

Datei: `OpenSans-Regular.ttf`, 217360 Bytes; SHA-256 `e64e508b2aa2880f907e470c4550980ec4c0694d103a43f36150ac3f93189bee`. Quelle ist das lokal installierte Debian-Paket `fonts-open-sans` Version `1.11-2`, Pfad `/usr/share/fonts/truetype/open-sans/OpenSans-Regular.ttf`; Upstream laut Paketnachweis https://www.opensans.com/.

Der zugehörige Paket-Copyrightnachweis ist unverändert als `OpenSans-NOTICE.txt` beigefügt: Digitized data copyright (c) 2010–2011 Google Corporation, Apache-2.0. Der vollständige Lizenztext liegt als `Apache-2.0.txt` bei. Keine Schrift wird zur Laufzeit aus dem Netz geladen; das Bundle enthält die Fontbytes.

Fehlende Glyphen führen vor dem Export zu einem sichtbaren Fehler; es wird keine unvollständige PDF ausgeliefert. Der semantische Bericht ist auf 1 MiB Text und 250 Seiten begrenzt und verspricht kein originalgetreues Layout.
