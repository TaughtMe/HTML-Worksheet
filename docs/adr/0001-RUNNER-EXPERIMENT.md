# ADR 0001 – Erster lokaler Runner-Versuch

Stand: 24. Oktober 2026; P04. Status: **Entscheidung für den begrenzten Versuch, keine Produkt-/Sicherheitsfreigabe**. Voraussetzung zur Implementierung: unabhängiges G0-Review. Kontext: [P02](../spec/EXPERIMENTE.md), [P03](../spec/BEDROHUNGSMODELL.md).

## Entscheidung und Reihenfolge

Erster Kandidat ist ein vom Host erzeugtes `srcdoc`-iframe mit `sandbox="allow-scripts"`, ohne weitere Sandboxausnahmen. Es erlaubt ausdrücklich nur einen begrenzten Inline-Classic-Script-/Style-Korpus. Ein lokaler HTTP-Server liefert für jedes Hostdokument einen neuen kryptographischen Nonce (mindestens 128 Zufallsbits) und die zugehörige Header-CSP. Damit werden tatsächliche Skriptinteraktion, eine strikte Host-Policy und deren Vererbung zusammen untersucht. Das ist ein lokales Labor mit synthetischen Daten und In-Memory-State.

Der Nonce ist im Runner sichtbar und kein Authentisierungstoken. Die Origin-/DOM-Grenze und die Schnittstellenbegrenzung müssen den Host auch bei Kenntnis des Nonce schützen. Die Child-CSP muss verhindern, dass ein Angreifer mit diesem Nonce externe Scripts nachlädt.

Nach G0 werden zuerst X01/X02 als kleine ausführbare Versuche gebaut. Scheitert `srcdoc` unter der vorgesehenen Policy, folgt genau ein Blob-Vergleich unter derselben strikten Host-Policy. Blob ist kein angenommenes Sicherheitsupgrade. Scheitert auch dieser Ansatz oder irgendein Egress-/Navigationsfall, stoppt die Freigabe skriptfähiger Inhalte. Als nächste Entscheidungsvorlage dient ein deklarativer, nicht skriptfähiger Arbeitsblattstandard mit hosteigenem Adapter; alternativ eine stärkere Ausführungsarchitektur. Eine separate Origin ist ein Vergleichsexperiment, kein automatisch freigegebener Fallback.

## Kandidatenvergleich

| Variante | Isolation / CSP | Offline / Betrieb | Entscheidung |
|---|---|---|---|
| `srcdoc`, opaque iframe | Parent-CSP geerbt; frühe Meta-CSP verschärft. Parent-`frame-src 'none'` und Selbstnavigation praktisch prüfen. | Dokument aus lokalem String; dynamische Header-Nonce passt noch nicht zu rein statischem Hosting. | Erster lokaler Kandidat; kein arbitrary-JS-Claim. |
| Blob-URL, opaque iframe | CSP-Vererbung und Source-Matching separat messen; URL nach Gebrauch widerrufen. `frame-src blob:` könnte Navigationsraum erweitern. | Lokal erzeugbar; CSP-/Lifecycle-Verhalten engineabhängig. | Nur Vergleich nach Fehlschlag/Abweichung von `srcdoc`; kein stiller Policywechsel. |
| Normale Seite auf separater Origin R | Eigene Response-CSP, aber Parent muss initiale R-URL erlauben. Erlaubte Navigation zu R mit Query/Pfad kann bereits Daten in Serverlogs übertragen; Portwiderruf kommt zu spät. | Zweite Auslieferung/Cache und eigene SW-Grenze; Erststart/Offline-Neustart ungeklärt. | Kein erster Produktkandidat; nur kontrollierter X01/X02-Vergleich. |
| Deklaratives Format ohne fremdes JS | Nur vertrauenswürdiger Adapter interpretiert begrenzte Daten; geringerer Kompatibilitätsumfang. | Statischer Betrieb eher erreichbar, weiterhin separat zu prüfen. | Architektur-Fallback bei unlösbarem JS-/Netzkonflikt; neu spezifizieren/reviewen. |

## Konkrete Policies des ersten Kandidaten

Host liefert CSP als HTTP-Header, vor jeder aktiven Verarbeitung:

```text
default-src 'none'; script-src 'nonce-{N}'; style-src 'nonce-{N}';
img-src data:; connect-src 'none'; frame-src 'none'; child-src 'none';
worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none';
frame-ancestors 'none'
```

Eigene Host-Script-/Styleelemente tragen N; externe Hostdateien werden nur mit Nonce eingebunden und lokal ausgeliefert. Kein `unsafe-inline`, `unsafe-eval`, CDN oder generisch freigegebenes `self` in `script-src`. Der erste Versuch benötigt keinen Service Worker. Host-Metadaten und Dateinamen werden als Text dargestellt.

Das erzeugte Runnerdokument beginnt mit fester Struktur, Charset und folgender CSP-Meta vor Bootstrap und importiertem Inhalt:

```text
default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';
img-src data:; connect-src 'none'; frame-src 'none'; child-src 'none';
worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'
```

Die Policies wirken als Schnittmenge: Child-`unsafe-inline` lockert die geerbte Nonce-Anforderung nicht. Host-Nonce gestattet nur ausdrücklich markierte Inline-Scripts/Styles; Child-Policy verbietet externe Scripts/Styles auch mit Nonce und blockiert `eval`. Inline-Handler/Styleattribute haben keinen Nonce und gehören nicht zum unterstützten Erstkorpus. Ob Browser diese erwartete Wirkung tatsächlich zeigen, ist X01, keine bereits bestätigte Eigenschaft. `navigate-to` wird mangels verlässlicher Unterstützung nicht als Schutz angesetzt.

Weitere Hostheader: `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store` für dynamisches Labor-HTML. Permissions-Policy verweigert mindestens Kamera, Mikrofon, Geolocation, Clipboard, Fullscreen, Payment, USB, Serial, Bluetooth, Bildschirmaufnahme und Web Share, soweit die Engine diese Direktiven kennt; das iframe delegiert keine Features. Unbekannte Direktiven sind kein Schutzbeleg. Sandbox verweigert insbesondere Forms, Popups, Downloads, Top-Navigation, Modals und Pointer Lock. X10 prüft tatsächliches API-Verhalten inklusive Nutzerklick.

## Verarbeitung und Lebenszyklus

1. Vor Lesen maximal 2 MiB Datei, danach striktes UTF-8. Reiner HTML-AST-Parser ohne Host-DOM; nach Parsing maximal 20.000 Knoten, Tiefe 64, 64 Attribute pro Element. Parserkosten vor der Strukturprüfung bleiben durch das Bytebudget nur begrenzt, nicht zeitlich garantiert.
2. Der Parser normalisiert die Dokumentstruktur; Host baut den festen Policy-/Bootstrap-Präfix und serialisiert den Inhalts-AST. Kein Regex-Sanitizer als Isolationsbeweis. CSP/Bootstrapposition muss mit malformed HTML getestet werden; ein importierter String darf den Präfix nicht beenden oder umordnen.
3. Unterstützt: HTML-Standardfelder mit IDs, Inline-Classic-Scripts ohne `src`, `<style>` und begrenzte `data:`-Bilder. Externe Ressourcen, Module, eigene Nonces, Event-/Styleattribute, base, fremde Frames, object/embed und HTTP-equiv-Metadaten werden im normalen Import als inkompatibel abgewiesen. Originalbytes bleiben getrennt, unverändert und untrusted. HTML-Angriffsfixtures dürfen über erlaubte Inline-Scripts verbotene Elemente dynamisch erzeugen, damit CSP nicht nur die Importablehnung testet.
4. H setzt frische Nonces auf die zugelassenen Inline-Script-/Style-AST-Knoten und den eigenen Bootstrap. Kein Nachladen von Bibliotheken, keine Sanitizer-Kompatibilitätslockerung. Dynamische Skripte bleiben Angreifercode im selben Realm; ihre erfolgreichen Versuche sind kein Vertrauensnachweis.
5. Nur eine aktive Sitzung/ein Runner. Dateiwechsel, Schließen, jeder weitere Dokument-`load`, unerwarteter Kanal oder Protokollmissbrauch widerruft die Sitzung und entfernt das Frame. Das ist keine präventive Netzsperre und keine garantierte Beendigung einer Endlosschleife.

## Bewusst offene Grenzen

Die dynamische Nonce-Laborvariante ist noch keine Lösung für statisches Cloudflare-Hosting oder Offline-Neustart. S11 muss eine ohne Netz frisch startbare Policy-/Dokumenterzeugung nachweisen; H01/U01 benötigen gegebenenfalls eine neue ADR. Ein fixer Build-Nonce ist kein ungeprüfter Ersatz. Wird eine andere Policy benötigt, muss sie mit X01–X04 neu geprüft werden.

G1a verlangt funktionierende erlaubte Interaktion **und** keine verbotenen Ausgänge unter der finalen dokumentierten Policy in jeder freizugebenden Engine. Selbst dann gilt die Aussage nur für die geprüften Szenarien. Ressourcen- und echte Gerätefragen bleiben separat. Keine Persistenz, kein PDF und keine Produktoberfläche in diesem Versuch.
