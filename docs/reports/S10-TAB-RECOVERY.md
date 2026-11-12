# S10 – begrenzter Tab-Recovery-Folgeversuch

Stand: 26. Oktober 2026; Implementierungsbasis `23b780a`. Der CI-WebKit-26.0-Loop blockierte Host-Proben; ein separater neuer Browser war nur Harness-Recovery. Dieser neue Versuch untersucht drei getrennte Stufen nach positivem `while(true)`-Startmarker, ohne Produkt-, CSP-, Paket- oder Workflowänderung.

1. Tatsächlichen Host-Schließenbutton klicken und zusätzlich null Frames sowie `closed · USER_CLOSE` nachweisen (1,5 s).
2. Unabhängig davon `page.close({runBeforeUnload:false})` versuchen (3 s), API-Bestätigung und geschlossene alte Page getrennt von späten Ereignissen festhalten.
3. Auch bei unbestätigtem Tabclose ein neues Tab ausschließlich im **selben laufenden BrowserContext und BrowserServer** öffnen (5 s). Synthetischer localStorage-Marker, gleiche Kontext-/Prozessidentität, Demo-JS und angenommene RAM-Eingabe sind erforderlich. Ein neues funktionierendes Tab ohne bestätigtes altes Tabclose ist keine bestätigte Tab-Recovery.

Das sind Playwright-Protokollaktionen, **keine manuelle Browseroberfläche, kein iPad/Safari-Test und keine Appfunktion**. Derselbe BrowserContext bedeutet dieselbe lebende Storagepartition; es wird weder ein neues Profil erzeugt noch ein Browserneustart mit dauerhaftem Profil geprüft. API-Timeouts können Aufrufe nicht abbrechen; spätere Abschlüsse werden separat protokolliert und ändern das Fristergebnis nicht. Tabclose bestätigt keine CPU-/RAM-Freigabe des alten Renderers.

`resource-supervisor.mjs` wird unverändert über `supervise('loop',{workerUrl,wallMs:35000})` wiederverwendet: eigener detached Worker, bestehendes Linux-ProcessTree-/PID-Startzeit-Cleanup und 768-MiB-RSS-Abbruchbudget aus `resource-config.mjs`. Keine alternative Prozess-Signalisierung. RSS-Abbruch bleibt `inconclusive`; die parallele Kalibrierung wird hier nicht vorweggenommen. Ein Resultat wird bereits vor potenziell blockierendem Browsercleanup gesendet. Cleanup erhält 3 s, danach wird notwendiges Supervisor-Cleanup ausdrücklich markiert; es erfolgt kein Browserneustart als Recoveryersatz. Der äußere 35-s-Stop begrenzt auch hängen gebliebene Stufen. Browsercrash/-disconnect vor Cleanup und externer SIGKILL bleiben getrennte Felder.

Ausführung nach unabhängigem Review und zentralem Build, keine neue Paketinstallation nötig:

```sh
BROWSER_ENGINE=webkit node apps/security-lab/test/tab-recovery.mjs
```

Weitere Engines über denselben bestehenden Selektor; Artefakt: `apps/security-lab/test-results/tab-recovery-<engine>.json`. `summary` enthält Einzelkriterien/Prozessunterbrechung; `run` erhält rohe Supervisor-Ereignisse und RSS-/CPU-/PID-Samples. Selbst eine bestätigte API-Tab-Recovery hebt einen gescheiterten Host-Close nicht auf. Exit 0 bedeutet nur abgeschlossene responsive Beobachtung, Exit 2 einen Risikobefund, Exit 1 unklare/fehlgeschlagene Messung und Exit 130 Unterbrechung. `securityGate` bleibt `not-evaluated`.

Lokale Checks mit Node 24.19.0: Syntax der vier neuen Module und `git diff --check` bestanden. `node apps/security-lab/test/tab-recovery-control.test.mjs` bestand abschließend mit vier einzeln benannten Tests: Belegkombinationen, externer Kill/Cleanup, späte API-Antworten und unveränderter Supervisor; null erfasste aktive Restprozesse beim Fakeworker. Eine anfängliche 500-ms-Fakeworkerfrist lieferte unter Last keinen Start-/Vorabbeleg; nur diese Hilfstestfrist wurde auf 2 s angehoben, keine Browsergrenze. Nur Node-Hilfslogik, kein Browser. Direkter Aufruf statt umgebungsabhängigem `node --test`-Kindwrapper liefert die vier einzeln benannten Resultate. Browser-/Recovery-/Gerätefälle wurden hier nicht ausgeführt; Root übernimmt sie nach Review. G1a/S13 bleiben offen.

## Zentrale CI-Ausführung und Ergebnis

Actions-Lauf [40289382039](https://github.com/TaughtMe/HTML-Worksheet/actions/runs/40289382039), Quelle `3e3599d` (Tree `e4cbf5754d14f5fc913139462f0ef78b6d5327a9`), wurde gezielt zweimal versucht. Attempt 1 endete während des langsamen WebKit-/Systempaketdownloads an der Zehn-Minuten-Jobfrist; der Browserfall startete nicht. Für Attempt 2 wurde nur Job `121679862642` erneut gestartet. Kein Code und kein Zeitbudget wurden geändert.

Attempt 2 verwendete Playwright WebKit 26.0. Der Loop-Startmarker kam nach 4.957 ms. Der tatsächliche Host-Schließenbutton lief in sein 1.500-ms-Timeout. Danach bestätigten die Rohereignisse `page.close` nach 3 ms und `attacked-page-closed` bei 6.462 ms. Das Summary-Feld `apiTabCloseConfirmed:false` reflektiert das fehlende vollständige Recovery-Ergebnis; es widerspricht nicht dieser API-Schließbeobachtung. Der Versuch, im selben noch laufenden BrowserContext ein neues Tab zu öffnen, begann unmittelbar danach, lieferte jedoch weder Abschluss noch Profilmarker oder Demo-Funktionalität vor dem RSS-Stopp.

Summierte RSS erreichte 845.422.592 Bytes (806,26 MiB) und überschritt damit das unveränderte 768-MiB-Budget. Externes SIGKILL stoppte den Versuch; aktive und Zombie-Restprozesse waren danach null. Das ist `inconclusive` durch RSS-Budget-Stopp, keine Same-Profile-Recoveryfreigabe und kein spontaner Browsercrash. Ein API-Tab-Schließen ersetzt weder bestätigtes Host-Schließen noch den fehlenden Same-Context-Recoverybeleg. Der Bericht wertet `securityGate` nicht aus; G1a/S13 bleiben offen.

Der rohe Playwright-Bericht wurde bytegleich zum bereitgestellten Actions-Artefakt archiviert und deterministisch gzip-komprimiert: [Manifest](evidence/s10/tab-ci-40289382039/manifest.json), [Rohbericht gzip](evidence/s10/tab-ci-40289382039/tab-recovery-webkit.json.gz). Standard-CI [40289381931](https://github.com/TaughtMe/HTML-Worksheet/actions/runs/40289381931) und Baseline-Guard-CI [40289382041](https://github.com/TaughtMe/HTML-Worksheet/actions/runs/40289382041) waren erfolgreich; Ressourcen-CI [40289381929](https://github.com/TaughtMe/HTML-Worksheet/actions/runs/40289381929) blieb fehlerhaft. Der Guard-CI-Lauf testet nur Verweigerungs-/Messhilfslogik, keine Browserkalibrierung. Es wurden im Dokumentationsauftrag keine Browser- oder Testläufe wiederholt.
