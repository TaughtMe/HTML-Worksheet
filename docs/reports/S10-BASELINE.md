# S10 – gesunde RSS-/PSS-Baseline

Stand: 26. Oktober 2026. Enger Kalibrierungsauftrag auf Basis `23b780a`; Guardkorrektur veröffentlicht in `3e3599d` (Tree `e4cbf5754d14f5fc913139462f0ef78b6d5327a9`, identisch mit lokalem Checkout `fe59019`). **Ausführung blockiert: Der Guard verweigert derzeit grundsätzlich vor jedem Browserstart. Noch keine Browsermessung ausgeführt, keine neue S10-Schutzgrenze abgeleitet.** Der ursprüngliche CI-Lauf erreichte bereits auf gesunden Pfaden rund 859 MiB (Chromium) bzw. 788 MiB (Firefox) summierte RSS. Die dortigen `inconclusive`-Ergebnisse bleiben unverändert.

## CI-Guardregression

Actions-Lauf [40289382041](https://github.com/TaughtMe/HTML-Worksheet/actions/runs/40289382041) ist erfolgreich. Er führt `node apps/security-lab/test/baseline.test.mjs` ohne Browserinstallation oder Browserstart aus und prüft nur die synthetischen Verweigerungs- und Messhilfsfälle: keine Zulassung aus einer virtuellen Slash-Wurzel oder gefälschtem `known:true`, Behandlung fehlender/verborgener Zähler, Speicherrollup-Einheiten sowie PID-Identität und Fehler beim Lesen. Das ist keine Browserkalibrierung, keine externe Namespace-Attestation und kein Nachweis für gesundes RSS/PSS-Verhalten in Chromium oder Firefox. Der Guard bleibt geschlossen; keine Schutzgrenze wurde abgeleitet oder geändert.

## Messablauf und Dateiscope

Direkter Node-Einstieg für den aktuellen Verweigerungsbericht; er startet keinen Browser und benötigt dafür keinen App-Build:

```sh
node apps/security-lab/test/baseline.mjs
```

Der implementierte, derzeit gesperrte Messablauf sieht ausschließlich **Chromium und Firefox mit je drei getrennten Browserläufen, streng seriell** vor. Er wird erst nach einer neuen, unabhängig geprüften Integration vertrauenswürdiger externer Namespace-/Hierarchieevidenz ausführbar; dann sind App-Build und Browserbinaries erforderlich. Jeder Worker startet einen kontrollierbaren BrowserServer; die bestehende startzeitgebundene `ProcessTree`-/Cleanup-Implementierung wird unverändert importiert. Keine Angriffsfixture, keine Importdatei, kein Flood, Loop oder Allokationsversuch. Geändert/ergänzt werden nur `baseline*.mjs` und dieser Bericht; `resource*.mjs`, Host, Policy, Paketdateien und Workflow bleiben unverändert.

Jeder Lauf hat drei Stufen, jeweils extern auf höchstens zehn Sekunden begrenzt:

1. **Browserstart:** neues Browserprofil, Kontext und leere Seite; Browser-/Engineversion erfassen. Der erste Zeitrahmen umfasst auch den Worker-/Modulstart.
2. **Host geladen:** normale lokale Hostseite, Status `Bereit`, kein Runnerframe.
3. **Demo aktiv:** ausschließlich mitgelieferte Demo, JS-Interaktion, eine kleine synthetische Eingabe und deren RAM-Annahme, genau ein Runner.

Nach jeder Operation hält der Worker die gesunde Stufe eine Sekunde innerhalb ihres Zeitbudgets. Er geht erst nach Bestätigung des unabhängigen Speichercheckpoints zur nächsten Stufe über. Nach der letzten Stufe beendet er Browser und Server; bei ausbleibendem Abschluss greift nach zwei Sekunden das vorhandene kontrollierte Tree-Cleanup. Offene geerbte Pipes werden spätestens 250 ms nach Workerexit als unvollständiger Abschluss behandelt. Aktive Restprozesse oder ein unvollständiger Lauf verhindern weitere Browserstarts.

## Reserveprüfung und getrennte Kalibrierungsobergrenze

Die **bestehende S10-Grenze von 768 MiB wird nicht geändert**. Nur für diesen gesunden Kalibrierungsharness ist eine feste, separate Beobachtungsobergrenze von **1.280 MiB summierter RSS** vorgesehen. Sie wird im aktuellen Stand nicht aktiviert; sie ist weder Produktbudget noch OS-Speicherquote.

Der erste Entwurf behandelte einen cgroup-v2-Mountroot `/` irrtümlich als Beleg einer vollständig sichtbaren Hierarchie. Ein Cgroup-Namespace kann aber genau diese virtuelle Slash-Wurzel zeigen, während reale Vorfahrenlimits verborgen bleiben. Auch gleiche Namespace-Links für `/proc/self` und `/proc/1` wären in einem PID-Namespace kein unabhängiger Nachweis.

**Aktueller Guard:** Alle lokal beobachteten Werte bleiben `known:false`/`observedOnly:true`. `assessReserve` liefert grundsätzlich `ok:false`, selbst bei großem sichtbarem Headroom oder künstlichem `known:true`. Slash-Wurzeln werden als `cgroup-namespace-unproven`, offensichtlich abgeschnittene Vorfahren als `hidden-cgroup-ancestors` ausgewiesen. Fehlende Werte bleiben unbekannt. Kein Environment-Schalter, Flag oder selbst behaupteter JSON-Wert kann den Guard freigeben. Die Verweigerung erfolgt vor App-Buildzugriff und Worker-Fork; der Rohbericht enthält null Browserläufe.

**Konkreter Blocker:** Dieser Ausführungskontext hat keine vertrauenswürdige externe Attestation, die den initialen/Host-Cgroup-Namespace oder sämtliche tatsächlichen Vorfahrenlimits und deren Verbrauch belegt. Daher wird keine vollständige Reserve behauptet. Für einen Folgeauftrag muss eine außerhalb der möglicherweise eingeschränkten PID-/Cgroup-Namespaces vertrauenswürdig gestartete Messinstanz den vollständigen Kontext liefern bzw. die Baseline selbst dort ausführen; Herkunft, Aktualität und Bindung an den konkreten Lauf wären unabhängig zu reviewen. Eine weitere In-Container-Heuristik ist kein Ersatz.

Die bisher vorgesehenen numerischen Anforderungen bleiben lediglich Entwurf: vor jedem Browserstart mindestens **2.304 MiB** nachgewiesene freie Host- und tatsächliche Cgroup-Reserve (1.280 MiB Beobachtungsobergrenze plus 1.024 MiB Sicherheitsabstand), laufender Abbruch unter 1.024 MiB Reserve, bei OOM-Ereignissen, unbekannten Messwerten oder Überschreiten der Obergrenze. Ihre Arithmetik kann fehlenden Namespace-/Vorfahrennachweis nicht heilen. Es gibt keine automatische Erhöhung oder Ableitung eines Schutzbudgets.

Auch eine künftig belegte Reserve wäre eine beobachtete Zulassungsprüfung mit laufender Kontrolle, keine exklusive Reservierung gegen konkurrierende Prozesse und keine harte Kernelquote. Mess-/Schedulerlatenz und gemeinsame CI-Verbraucher bleiben sichtbar. Unklare Bedingungen werden nicht als gesunde Baseline gewertet.

## Speichermetriken und Rohbericht

`/proc/<pid>/stat` liefert die zu S10 vergleichbare summierte RSS. Zusätzlich liest der Supervisor `/proc/<pid>/smaps_rollup`: `Rss`, `Pss`, `Private_Clean`, `Private_Dirty` und optional `Private_Hugetlb`. Die privaten Anteile werden addiert; KiB werden explizit in Bytes umgerechnet. RSS kann gemeinsame Seiten mehrfach zählen, PSS verteilt sie proportional. Beide sind Beobachtungsmetriken und keine automatische Quotengrundlage.

Die vorhandene Prozesszuordnung bleibt PID-/Startzeitgebunden. Unmittelbar vor und nach dem Rollup-Lesen wird die Startzeit erneut geprüft. Verschwundene oder wiederverwendete PIDs werden als ausgelassene Messung ausgewiesen; ein Stufencheckpoint mit Auslassungen wird nicht bestätigt. Fehlende Berechtigung oder fehlende PSS-/Private-Felder werden nicht als null interpretiert, sondern beenden die Messung als unbekannt.

Ausgabe: `apps/security-lab/test-results/baseline.json`. Enthalten sind Bundle-SHA-256, Node-/Browserversionen, Reservebelege vor jedem Lauf und während der Stichproben, drei positive Stufencheckpoints, prozessweise RSS/PSS/private Bytes, Peaks, Zeitgrenzen, Abbruchgrund und Cleanup-Reste. `automaticProtectionBudget` bleibt ausdrücklich `null`. Exit 0 wäre nur nach sechs vollständig gemessenen gesunden Läufen zulässig und ist mit dem aktuellen verweigernden Guard unerreichbar; Exit 1 bedeutet Verweigerung/Fehler/unvollständige Messung, Exit 130 einen Signalabbruch mit Cleanupversuch. Kein Exitcode ist eine Sicherheitsfreigabe.

## Lokale Checks und offene zentrale Ausführung

Ausgeführt: Syntaxchecks und `node apps/security-lab/test/baseline.test.mjs` sowie Whitespaceprüfung. Die korrigierte Regression verweigert ausdrücklich eine virtuelle Slash-Wurzel mit `/`-Mitgliedschaft und großem sichtbarem Speicherabstand; auch ein gefälschtes `known:true` lässt nicht zu. Offensichtlich verborgene oder fehlende cgroup-Daten, RSS-/PSS-/Private-Einheiten, PID-Wechsel und unlesbare Messdaten bleiben abgedeckt. Die Tests verwenden synthetische Dateiinhalte und starten keinen Browser oder Netzserver. Unveränderte Produkt- und Ressourcenchecks wurden nicht wiederholt.

Die lokale Kontextinspektion zeigte zwar einen Mountroot `/..`; entscheidend ist aber der allgemein fehlende unabhängige Beleg, der auch bei sichtbarem `/` fehlen würde. Kein Nachweis wurde erfunden, kein Schwellwert angehoben und kein Browserlauf ausgeführt. Die Baseline-Kalibrierung bleibt bis zur extern belegten, erneut reviewten Ausführungsarchitektur blockiert. Daraus folgt keine G1a-Aussage.

Ein separates Sol-Review hält als mögliche Folgeuntersuchung einen direkt auf einer GitHub-hosted VM gestarteten Job unter einer ausdrücklich dokumentierten Provider-/Launcherannahme für prüfbar. Für eine automatische Zulassung schlug es verifiziertes GitHub-OIDC mit festem Issuer/Audience, Signatur und Gültigkeit sowie erwarteter Repository-ID, Workflowbezug, Run und Attempt vor. Das könnte den Ausführungskontext belegen, aber weder die vollständige Kernelhierarchie noch eine Hypervisor-Reserve. Es ist ein nicht implementierter Vorschlag für ein eigenes Folgepaket; der aktuelle Guard bleibt geschlossen, es entsteht kein neuer Baseline- oder G1-Nachweis.
