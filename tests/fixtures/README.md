# S03/S04 synthetischer Fixture-Korpus

Diese Dateien sind Versuchsinputs für das begrenzte lokale Runner-Labor, keine Sicherheitsnachweise. Alle Beispiele und Antworten sind frei erfunden. Kein Fixture enthält personenbezogene Daten oder echte Zielserver.

## Zielplatzhalter

Nur der Harness ersetzt zur Laufzeit `__RECEIVER__` (Origin des separaten kontrollierten Empfängers einschließlich Schema/Port) und `__CASE__` (synthetischen, pro Lauf eindeutigen Marker). Die Fixtures kontaktieren keine echten Hosts. Vor jedem negativen Egressfall muss eine unabhängige positive Kontrollanfrage denselben Receiver nachweislich erreichen. Ohne erfolgreiche Positivkontrolle ist „kein Request“ kein gültiges Ergebnis.

## Fixtures und erwartete Beobachtung

| Datei | Importerwartung | Beobachtung |
|---|---|---|
| `demo-standard-fields.html` | Positiv: eigenständiges HTML, Inline-Classic-Script, keine externen Ressourcen, Handler, Module oder `eval`. | Sichtbarer Scriptstatus; stabile IDs für Text, Textarea, Checkbox, Radiogruppe, Select-one und Select-multiple. Texteingabe löst eine kleine lokale Reaktion aus. Standardadapter-Roundtrip ist geplant. |
| `demo-drag-adapter.html` | Positiv nur für den fest registrierten `drag-demo` v1-Adapter. | Drei synthetische Items lassen sich per Drag-and-Drop oder Schaltfläche zwischen Pool und zwei Zonen verschieben. Angezeigter JSON-State folgt `placements` in `DATENVERTRAG-V1.md`. Harness muss genau diese Datei-Bytes/Hash und das Manifest festlegen und pinnen. |
| `attack-parent-storage.html` | Positiv: Inline-Script prüft lesend Host-DOM-/Storagezugriff mit `try/catch`. | Ergebnis als Text im Runner. Verweigerung ist die erwartete Einzelbeobachtung, kein allgemeiner Isolationsbeweis. |
| `attack-egress-dynamic.html` | Positiv: erlaubtes Inline-Script erzeugt dynamisch fetch, Image und Beacon zum Platzhalterziel. | Receiver und Browser-Netzwerklog prüfen. Jede verbotene Anfrage ist ein Verstoß; ohne positive Receiverkontrolle ist der Lauf ungültig. |
| `attack-navigation-location.html` | Positiv: verzögerter Versuch der Selbstnavigation zu markiertem Receiver. | Frame-URL, `load`, Portlebenszyklus und Receiverlog erfassen. Jeder Request ist Verstoß; Sitzung kann enden. |
| `attack-navigation-self-link.html` | Positiv: Script erzeugt/klickt dynamisch Link mit `target="_self"`. | Jeder markierte Request ist Verstoß; Fragment-/Dokumentwechsel getrennt protokollieren. |
| `reject-meta-refresh.html` | **Importablehnung erwartet**: statisches `http-equiv`-Refresh-Metadatum ist inkompatibel. | Parser/Validator lehnt vor Runnerstart ab. Kein Laufzeitverhalten behaupten. |
| `attack-popup-download.html` | Positiv: zwei getrennte Schaltflächen lösen Popup- und Downloadversuch nach Nutzerklick aus. | Popup, Download und Receiverrequest protokollieren. Unerwartete Wirkung ist Verstoß. |

## Ausführungsgrenzen

Positivfixtures liegen im begrenzten Korpus: einzelne HTML-Dateien, Inline-Classic-Script und stabile Felder. Angriffe erzeugen Elemente dynamisch, damit nicht allein Importablehnung beobachtet wird. `reject-meta-refresh.html` ist absichtlich anders: korrekt ist die Ablehnung vor Ausführung.

Alle Beobachtungen sind geplant und **noch nicht ausgeführt**. Spätere Laufberichte erfassen Commit/Build, Browser/OS-Version, Gerät/Installationsmodus, Fixture-Hash, Policyheader, Sandboxattribute, Konsolen-/Receiverlogs und Pass/Fail/Blockiert. Chromium, Firefox und Playwright-WebKit sind getrennte Engine-Läufe; Playwright-WebKit ersetzt keinen realen iPad/Safari-Test. DoS-Versuche gehören nicht in diese HTML-Dateien, sondern in separate Browserprozesse mit externem Timeout.
