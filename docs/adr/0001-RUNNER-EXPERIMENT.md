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

## S11-Vorbereitung: kalter Offline-Neustart

Stand: 25. Oktober 2026, Basis `1dea63e`. **Erste umzusetzende Versuchvariante nach S10-Review**, noch kein Offline-Nachweis und keine Implementierung in diesem Auftrag. Lokal geprüft: `apps/security-lab/server.mjs`, `build.mjs` und `src/host.ts`. Der Build erzeugt ein einziges `host.js` mit eingebettetem Runner; H liest seinen Nonce von `document.currentScript.nonce`. Damit braucht der Offline-Versuch keinen anderen Runner und keine Zustands-/Bridgeerweiterung.

Ein ausschließlich vertrauenswürdiger Service Worker (SW) unter der festen Originroute `/offline-sw.js`, Scope `/`, übernimmt kontrollierte Hostnavigationen. Erstbereitstellung weiterhin über den vorhandenen Node-Server auf vertrauenswürdigem Loopback bzw. später HTTPS. Secure Context, SW und CacheStorage sind Voraussetzungen; statischer Erststart auf Cloudflare ist damit noch nicht gelöst, H01 bleibt offen.

### Policy und Dokumenterzeugung

- Einzige notwendige Änderung der **Host-CSP**: `worker-src 'none'` wird zur exakt festgelegten absoluten SW-URL derselben Origin; Origin aus vertrauenswürdiger Serverkonfiguration, nicht ungeprüftem Hostheader. Host-`connect-src 'none'`, Nonce-Script-/Stylequellen, `frame-src 'none'`, Sandbox und alle übrigen Regeln bleiben bestehen. Kein generisches `script-src 'self'`, `unsafe-eval` oder fixer Build-Nonce.
- Das SW-Script ist selbstständig, ohne Imports, und erhält eine eigene Header-CSP, beim festen lokalen Beispielorigin vollständig: `default-src 'none'; script-src 'none'; worker-src 'none'; connect-src http://127.0.0.1:4173/offline-shell.txt http://127.0.0.1:4173/host.js`. Tatsächliche Origin/Port stammen aus vertrauenswürdiger Konfiguration; beide festen Asset-URLs müssen ausdrücklich enthalten sein, sonst blockiert `default-src 'none'` die Installationsfetches. Keine Lockerung der Host- oder Child-Connect-Policy; keine vom Runner übermittelte Fetch-/Cache-URL und kein SW-Nachrichtenbefehl.
- Bei jeder neuen Dokumentnavigation erzeugt der SW mit `crypto.getRandomValues` 24 frische Zufallsbytes als Base64-Nonce. Aus einem ausschließlich buildseitigen Shell-Template entstehen HTML und passende Response-CSP gemeinsam; Header einschließlich Referrer-/Permissions-Policy, nosniff und `Cache-Control: no-store` wie beim Server. Nur die feste Nonce-Markierung in Style/Script wird ersetzt. Noncehaltige fertige HTML-Responses werden nicht gecacht.
- H übernimmt diesen Nonce unverändert wie bisher. Frühe Child-Meta-CSP, `sandbox="allow-scripts"`, opaque Origin, Portbindung und AST-Normalisierung bleiben unverändert; insbesondere Child-`worker-src 'none'`, externe Script-/Styleverbote und `connect-src 'none'`. Die geerbte synthetische Response-CSP und Selbstnavigation sind erneut zu messen, nicht aus bisherigen Serverantworten abzuleiten.

### Vertrauenswürdiger Cache und Fehler-/Updateverhalten

- Ein buildversionierter Cache enthält ausschließlich das feste Shell-Template und das gebündelte `host.js`, einschließlich Demo/Bootstrap. Ein buildseitiges Manifest pinnt Bytes per SHA-256 und MIME-Typ; Installation prüft beide vollständig ohne Redirects, bevor sie als erfolgreich gilt. Keine Importdateien, Antworten, Dateinamen, Instanzdaten, Diagnose-/Receiverlogs oder fremden Ressourcen im Cache/IndexedDB.
- Fetchhandler: nur GET auf exakt `/` ohne Query mit `request.mode === 'navigate'` und `request.destination === 'document'` erzeugt HTML. `/host.js` verlangt Destination `script`, nichtleere `event.clientId` und einen über diese ID aufgelösten WindowClient mit `frameType === 'top-level'` und exakter Host-URL; zusätzlich muss die ID in `clients.matchAll({type:'window',includeUncontrolled:false})` vorkommen, denn `clients.get` allein beweist keine Kontrolle. Keine iframe-/Runnerziele, Queryvarianten, beliebigen Pfade oder SPA-Fallbacks. Unbekannte Requests ablehnen; fehlende/falsche Cachebytes liefern feste nicht ausführbare Fehlerantwort mit `default-src 'none'`, ohne Netzfallback oder gemischte Buildversionen. Cacheintegrität vor Auslieferung prüfen.
- Registrierung und vollständige Installation allein sind noch keine Startzusage: erst eine kontrollierte Hostnavigation auf derselben fertigen Buildversion gilt als vorbereitet. Kein `skipWaiting`, kein `clients.claim`, kein Austausch einer laufenden RAM-Sitzung. CacheStorage bietet keinen atomaren Mehrschritt-Installcommit: aktiven Cache unverändert lassen, neue Version in einen eindeutig buildversionierten eigenen Cache schreiben und über `install`/`event.waitUntil` sämtliche Schreib- und Validierungsschritte vollständig abwarten. Bei Fehler ausschließlich diesen neuen Kandidatencache verwerfen, alte aktive Version unverändert behalten. Aktivierung erst nach Ende der alten Clients; alte Appcaches erst danach gezielt entfernen, nie fremde Origin-Caches löschen.
- Bei SW-/Cacheverweigerung, Quota, unterbrochener Installation oder gelöschtem Bestand keine Offlinebereitschaft anzeigen. Ohne Erstinstallation ist Offline-Neustart nicht möglich. Browserinterne SW-Updateprüfungen separat als feste Appartefaktabrufe protokollieren; der Start darf nicht von deren Netzantwort abhängen. RAM-Antworten bleiben nach Browserende verloren; ausschließlich synthetische Daten, keine Persistenz-/PWA-/G1-Freigabe.

### Fünf geplante Nachweise

1. **Kalter Start:** online vollständig installieren/kontrolliert navigieren; gesamten Browserprozess schließen, gleiches persistentes Profil mit abgeschaltetem Hostserver und gesperrtem Netz neu starten. `/` und Demo/Dateiimport funktionieren aus Appcache; kein warmer Tab/Renderer, keine benötigte Netzantwort, RAM-State neu. Chromium/Firefox/WebKit getrennt; reale Geräte bleiben G1b.
2. **Frische Policy:** zwei neue Offline-Dokumentnavigationen liefern unterschiedliche Nonces; Header und sämtliche vorgesehenen Nonceelemente stimmen pro Dokument überein. Demo-JS, Felder und RAM-Snapshot funktionieren; fehlender/geänderter Nonce scheitert. SW-Responseheader und tatsächliche Child-Vererbung erfassen.
3. **Unveränderte Grenzen:** erlaubte Registrierung der exakten SW-URL und Ablehnung anderer Workerpfade unter Host-CSP messen; Navigationen mit falschem Mode/Destination sowie Scriptrequests mit leerer/fremder/uncontrolled/iframe-clientId ablehnen. Im SW-kontrollierten Betrieb mit erreichbar positiv kontrolliertem unabhängigem Empfänger den bestehenden Egress-/Selbstnavigationskorpus wiederholen, zusätzlich Worker-/SW-Registrierung aus R versuchen. Kein verbotener Receiverhit, keine Cacheantwort als Umgehung; Child darf keine Worker-/Cachefähigkeit erhalten.
4. **Aktivierungswechsel:** alten kontrollierten Client offenhalten, vollständige und absichtlich unvollständige neue Buildinstallation versuchen. Alte HTML-/JS-Version und Cachebytes bleiben zusammen unverändert nutzbar; Fehlversuch aktiviert nichts und verwirft nur den Kandidatencache. Erfolgreiche Version erst nach vollständig abgeschlossenem Install und alten Clients aktivieren und offline kalt mit passender CSP starten; kein vorzeitiges Cachelöschen.
5. **Fehler schließen:** Cacheeintrag löschen/verfälschen, Installation abbrechen und Storage-/SW-Zugriff verweigern. Kein stiller Netz-/Policyfallback, keine falsche Bereitschaft, feste Fehleranzeige bzw. Browserfehler bei völlig fehlendem SW. Nach bewusster erneuter Onlinebereitstellung vollständigen Neustart erneut prüfen.

Prüfung dieses Docs-Auftrags: lokale Quelllektüre und `git diff --check`; keine SW-/Offline-/Browserfälle ausgeführt. Falls eine Engine kontrollierten Kaltstart, frische Header-CSP oder die Childgrenzen nicht erfüllt, bleibt S11 dort blockiert; keine CSP-Lockerung als Ersatz.

## Offene Auswahl: zusätzlicher strikter Modus oder zuerst Fremd-JS weiterprüfen

Stand: 27. Oktober 2026, Basis `283b86c`. **Entscheidung ausstehend; Nutzerauswahl und unabhängiger Review vor abhängiger Umsetzung.** Dies ist eine prüfbare Versuchsvorlage, keine Änderung des Produktumfangs. Die bereits vorgesehenen zwei Unterstützungsebenen [allgemeines HTML und optimiertes Arbeitsblattformat](../ARCHITEKTUR.md#kompatibilitätsziel-für-den-ersten-versuch) bleiben Ausgangspunkt; JavaScript-Unterstützung wird nicht still entfernt.

Der [S10-Befund](../reports/S10.md) zeigt beim gestarteten WebKit-Loop blockierten Host-JS-Roundtrip und Host-Schließen. Im [Tab-Folgeexperiment](../reports/S10-TAB-RECOVERY.md) wurde Playwright-Tabclose bestätigt; funktionierendes Wiederöffnen im selben Profil blieb nach 806,26 MiB summierter RSS über dem unveränderten 768-MiB-Budget unbelegt. Dies ist keine manuelle Browser-/iPad-Recovery oder App-Abbruchfunktion. Der [Baselineversuch](../reports/S10-BASELINE.md) blieb vor Browserstart blockiert; OIDC-Diagnose ist beendet. Keine Budgeterhöhung oder Freigabe aus fehlenden Resultaten.

| Zur Auswahl | Begrenzter nächster Schritt und notwendige Grenze |
|---|---|
| A: zusätzlichen strikten Modus experimentell prüfen | Separater, ausdrücklich gewählter Importmodus: fremdes JS vollständig abweisen; ausschließlich festgelegte deklarative Eingaben/Interaktionen über vertrauenswürdige Adapter. Vorhandener Fremd-JS-Laborpfad bleibt gesondert bestehen. Kein Filter nur gegen bekannte Schleifen, keine automatische Umwandlung mit vorgetäuschter Kompatibilität. |
| B: zunächst Fremd-JS-Pfad weiter untersuchen | Kritische G1-Lücken unter bestehenden Grenzen schließen. Ein möglicher Recoveryvertrag müsste Einfrieren, fehlende garantierte App-Abbruchzeit und Verlust unbestätigter Arbeit ausdrücklich benennen; später höchstens letzte tatsächlich bestätigte Revision restaurieren und problematische Vorlage nicht automatisch starten. Ein solcher Vertrag ist weder beschlossen noch belegt und ersetzt keine Sicherheitsanforderung. |

**Kleinster vorgeschlagener A-Versuch, nur nach Auswahl:** eine synthetische deklarative Vorlage mit Standardfeldern und genau einer Interaktion eines festen vertrauenswürdigen Adapters sowie die vorhandene Schleifenvorlage als Gegenprobe. Noch keine Persistenz, PDF, Produktoberfläche oder allgemeine Custom-JS-Schnittstelle. Vor Umsetzung genaue erlaubte Syntax und Adapterkonfiguration festlegen/reviewen; Host-DOM-Grenze, CSP, Sandbox und Bridgeprivilegien keinesfalls lockern.

Abnahme dieses Versuchs: deklarative Vorlage lässt sich bedienen und liefert erwarteten begrenzten RAM-State; Schleifenvorlage wird im strikten Modus **vor Frameerzeugung und Skriptausführung** sichtbar als inkompatibel abgewiesen, ohne Teilübernahme. Nur vertrauenswürdiger Adaptercode erhält Ausführungsberechtigung; keine importierten Script-/Handler-/JS-URL-Ausführungspfade. Die Ergebnisse begründen allein den zusätzlichen Versuchsumfang, keine vollständige Ressourcenisolation: DOM-/CSS-Last und echte Geräte bleiben eigene Grenzen.

Bis zur Auswahl keine Implementierung beider Alternativen. Unabhängig dürfen laufende Engineprüfungen abgeschlossen, Evidenz konsolidiert und abgegrenzte kritische CSP-/Navigations-/Berechtigungsfälle bearbeitet werden. G1a/G1b/S13 bleiben offen. Prüfung dieses Ergänzungsauftrags ausschließlich `git diff --check`, keine neuen Tests.
