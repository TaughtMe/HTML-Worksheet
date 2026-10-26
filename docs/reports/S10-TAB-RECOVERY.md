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
