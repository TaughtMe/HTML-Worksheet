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

## STRICT01-DESIGN – zusätzlicher strikter Labormodus

Stand: 27. Oktober 2026, Entwurfsbasis `77ca3e5`. **Das zusätzliche Experiment ist durch die erneuten Weiter-Anweisungen autorisiert; vor Code ist ein separater Sol-Review durch `g0_review` erforderlich.** Keine finale Produkt-/Formatentscheidung. Die bereits vorgesehenen zwei Unterstützungsebenen [allgemeines HTML und optimiertes Arbeitsblattformat](../ARCHITEKTUR.md#kompatibilitätsziel-für-den-ersten-versuch) bleiben Ausgangspunkt. Der bisherige Fremd-JS-Laborpfad samt Standardauswahl, Policy und Tests bleibt erhalten und weiterhin ohne Produktfreigabe; keine stille Entfernung oder automatische Konvertierung von JS-Unterstützung.

Der [S10-Befund](../reports/S10.md) zeigt beim gestarteten WebKit-Loop blockierten Host-JS-Roundtrip und Host-Schließen. Im [Tab-Folgeexperiment](../reports/S10-TAB-RECOVERY.md) wurde Playwright-Tabclose bestätigt; funktionierendes Wiederöffnen im selben Profil blieb nach 806,26 MiB summierter RSS über dem unveränderten 768-MiB-Budget unbelegt. Dies ist keine manuelle Browser-/iPad-Recovery oder App-Abbruchfunktion. Der [Baselineversuch](../reports/S10-BASELINE.md) blieb vor Browserstart blockiert; OIDC-Diagnose ist beendet. Keine Budgeterhöhung oder Freigabe aus fehlenden Resultaten.

Der Versuch prüft ausschließlich Standardformfelder und **eine** feste deklarative Aktion. Die zweite Option, Fremd-JS mit bewusst akzeptierter Ausfall-/Recoverygrenze, bleibt eine offene Produktfrage: Einfrieren, fehlende garantierte App-Abbruchzeit und Verlust unbestätigter Arbeit wären ausdrücklich zu bewerten; Wiederherstellung höchstens einer tatsächlich bestätigten Revision wäre später separat zu belegen. Weder dieser Vertrag noch die Freigabe eines der Modi ist beschlossen.

### Eingabe- und Fehlervertrag `strict-v1`

- H wählt den zusätzlichen Modus ausdrücklich, etwa über einen getrennten Labor-Öffnenbutton, und bindet ihn unveränderlich an Import und Sitzung. Quelldatei/State/Bridge können ihn nicht wählen oder auf Fremd-JS zurückstufen. Bisheriges Öffnen und JS-Demo bleiben unverändert. Keine PWA, DB, PDF, Produktnavigation oder neue Bibliothek/Budgetgrenze.
- Verarbeitung nur Bytes und parse5-AST; niemals Host-DOM-Import. Bestehende Grenzen gelten unverändert: 2 MiB, striktes UTF-8, 20.000 AST-Knoten, Tiefe 64, 64 Attribute/Element, 1.024 Felder und sämtliche Bridge-/Statebudgets. Parsergemeldete Fehler außer fehlendem Doctype ablehnen; keine Regex-Scriptbereinigung. Verbotene AST-Inhalte führen zum Gesamtfehler, niemals entfernen und danach als kompatibel öffnen.
- Erlaubte HTML-Namespace-Tags ausschließlich `html,head,body,h1,h2,p,div,span,br,label,fieldset,legend,input,textarea,select,option,button`; die Parserwrapper `html/head/body` haben keine Attribute, `head` bleibt leer. Doctype nur HTML, Kommentare und Text sind inert. Keine fremden Namespaces, Custom Elements oder sonstigen Tags; keine Quell-Scripts, Quell-Styles, Medien, Links, Frames, Forms oder Templates.
- Attributallowlist: `id` auf Inhaltselementen nach bestehender IDsyntax, überall eindeutig; `label[for]` nur zu vorhandenen Input-/Textarea-/Select-IDs; `input[type]` explizit `text|checkbox|radio`, `name` ausschließlich bei Radio gleich seiner Feldgruppen-ID; `fieldset[data-ws-radio-group=""]` mit ID, ohne verschachtelte Gruppe; `select[multiple=""]`; `option[value]` explizit/eindeutig nach bestehenden Optionslimits, nur direkt im Select; `textarea/option/button` enthalten nur Text. Keine anderen Attribute, insbesondere keine Eventhandler, URLs, `style`, `nonce`, `autofocus` oder frei wählbaren `data-*`. Checkbox/Text/Radio/Select verwenden den bestehenden Feldvertrag; keine Quell-Defaultwerte/checked/selected, da H den Anfangsstate setzt.
- Genau ein Button pro Datei: `id`, `type="button"`, `data-ws-action="toggle-checkbox"`, `data-ws-target="<ID>"`; Ziel muss genau ein validiertes Checkboxfeld derselben Vorlage sein. Fehlender/mehrfacher Button, unbekannte Aktion, fehlendes/fremdes/falsch typisiertes Ziel oder uneindeutige IDs ergeben Importfehler. Ziel ist eine geprüfte IDreferenz, kein CSS-Selektor, Ausdruck, URL, Ereignisname oder Funktionsname.
- Erst nach vollständiger Prüfung dürfen Session und iframe erzeugt werden. Fehler schließen nach bestehendem Öffnenablauf die alte Sitzung, zeigen festen Textcode `IMPORT_REJECTED` und lassen null neue Frames/Ports/Teilstate zurück; kein automatischer Fremd-JS-Fallback. Sourcebytes bleiben untrusted. Escaped HTML als Feldtext ist weiterhin zulässig und inert.

### Vertrauenswürdiger Adapter und Policy

H übergibt nur validierte Konfiguration `{mode:"strict-v1",action:{kind:"toggle-checkbox",buttonId,targetId}}` zusammen mit dem bestehenden Feldmanifest; nicht als neues Bridgefeld. Ein eigener reiner Strict-Validator darf keine Quell-Scriptnonces erzeugen. Der Runner prüft vor READY zusätzlich Button-/Zieltyp und Inventar, bindet genau einen festen Handler und ignoriert ihn außerhalb `active`. Klick invertiert ausschließlich `checked` des gebundenen Ziels und ruft den bestehenden `changed()`-Pfad auf; keine Codeauswertung, dynamischen Handler, HTML-Sinks oder synthetischen Nutzerereignisse. Unerwartete Laufzeitstruktur ergibt `ADAPTER_ERROR/UNSUPPORTED_FIELD` und Kanalabschluss.

State bleibt unverändert `standard-fields` Version 1: allein der Checkbox-Boolean ändert sich; kein Aktions-/HTML-/Pluginstate. RESTORE_STATE stellt sämtliche Werte einschließlich Checkbox ohne Aktion/Event wieder her; danach kann der echte Button erneut toggeln. Coalescing, Sequenzen, Revisionen und REQUEST_STATE/SNAPSHOT samt `durability:"memory"` bleiben gleich. Neuöffnen im echten RAM-Labor beginnt weiterhin leer; nichtleerer Restore wird über den vorhandenen vertrauenswürdigen Restoreharness belegt, ohne Persistenz vorzutäuschen.

Host-CSP, `sandbox="allow-scripts"` ohne weitere Ausnahmen und alle Herkunfts-/Portprüfungen bleiben bestehen. Nur die feste ausgelieferte Bootstrap-/Adapterquelle bekommt den Nonce. Die bisherige vollständige Child-Meta-CSP bleibt **unverändert erhalten**; zusätzlich folgt eine zweite CSP-Meta mit `script-src 'nonce-{N}'; style-src 'none'; img-src 'none'`. **Beide Metas stehen vor dem Bootstrap** und wirken als Schnittmenge. Die erste Policy verbietet externe Scripts weiterhin auch dann, wenn sie den bekannten Nonce tragen; die zusätzliche Nonce-Policy darf die bisherige `script-src 'unsafe-inline'`-Policy keinesfalls ersetzen. Keine importierte CSS-Quelle; Browser-Defaultdarstellung genügt, ein später benötigter fester Stil wäre ausschließlich vertrauenswürdiger Appcode und separat zu reviewen. Parser-/DOM-/Layoutkosten durch große Texte/Strukturen bleiben möglich; keine CPU-/RAM-Quote oder garantierte Hostbedienbarkeit aus Scriptfreiheit ableiten.

### Kleine Folgeaufträge nach Designreview

1. **STRICT01-I:** reiner Strict-AST-/Aktionsvalidator in eigenem `strict-import.ts`, modegebundene Importdaten und synthetische Fixture; vorhandene Feld-/Stateverträge wiederverwenden, Legacy-Normalisierung nicht still verschärfen. Abnahme C1–C3 als begrenzte Import-/Hilfstests.
2. **STRICT01-R:** minimale ausdrückliche Laboraktivierung in Host/Server, validierte Sessionkonfiguration und fester Runnerhandler/strengere Childpolicy. Gemeinsame Dateien sequenziell ändern; keine Bridgeerweiterung. Abnahme C4/C5, danach separater Sol-Code-/Methodenreview.
3. **STRICT01-T:** höchstens sechs feste Zielcases, vorhandene Browser-/Restore-/Receiverinstrumentierung wiederverwenden; zentrale Engineausführung erst nach Review. C6 verwendet bestehende Kontrollen statt neuer Egresspermutationen. Root integriert und protokolliert Resultate in bestehenden Berichten.

| Case | Beobachtbares Orakel |
|---|---|
| C1 – Loop vor Frame ablehnen | Reines Parsing verwirft auch sofortige Inline-Endlosschleife; im Browser die bestehende klickgestartete S10-Schleifenfixture laden, aber niemals deren Angriff klicken. Importfehler, **null iframe-Erzeugungen und Einhängungen** über den ganzen Versuch (Instrumentierungszähler), kein INIT/Port. So wird bei einer Regression keine unbeschränkte Last neu gestartet. |
| C2 – aktive Quellpfade ablehnen | Kleiner festgelegter Importkorpus: Eventhandler, Quellstyle mit URL, URL-Ressourcentag und SVG. Gesamtfehler vor Frame; Parserfehler/unerlaubte Attribute werden nicht still bereinigt. Keine Browser-Permutationsmatrix daraus ableiten. |
| C3 – deklarative Referenzen/Modus | Feste ungültige Beispiele: unbekannte Aktion, zweiter Button, fehlendes/falsch typisiertes Ziel, Source versucht Moduswahl. Ablehnung ohne Frame oder Legacy-Fallback; ursprüngliches Template-/Sessionziel unverändert. |
| C4 – echter Host und RAM-Checkpoint | Sichere Fixture mit allen Standardfeldarten und einem Togglebutton; echte Eingaben plus Buttonklick ändern genau erwarteten Checkbox-Boolean. Vollständiger State und bestätigter RAM-Snapshot stimmen; beide Child-CSP-Metas vor dem einzigen vertrauenswürdigen Script prüfen. Host-Schließen entfernt Frame. |
| C5 – nichtleerer Restore | Tatsächliches Runnerbundle im vertrauenswürdigen Restoreharness, Strict-Konfiguration und identische Policy: Revision 7 mit gefüllten Standardfeldern/Checkbox true ohne STATE_CHANGED restaurieren; danach Button toggelt false, ACK und Checkpoint liefern exakte Werte/Revision, keine zusätzliche Feld-/Aktionsstateform. |
| C6 – Legacy-/Netzkontrollen erhalten | Bestehende JS-Demo und bereits vorhandene dynamische Netzwerkfälle mit positiv kontrolliertem Receiver unter unveränderter Legacy-Policy wiederverwenden. Strictablehnung allein ist kein CSP-Egressnachweis; kein grüner Strictfall ersetzt bestehende G1-Lücken. |

G1a/G1b/S13 und endgültiger Produktumfang bleiben offen. Prüfung dieses Entwurfs nur Quelllektüre und `git diff --check`; keine Implementierung, neuen Tests, Browserläufe, Netz-/Paket-/Budgetänderungen. Nächster Schritt: unabhängiger Sol-Designreview, danach begrenzte Folgeaufträge im autorisierten Experimentumfang.
