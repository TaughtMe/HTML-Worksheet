# S10 – gesunde RSS-/PSS-Baseline

Stand: 26. Oktober 2026. Folgeauftrag auf Basis `bd21dfd`: enge CI-Zulassung mittels verifiziertem GitHub-OIDC. **Noch keine Live-OIDC-Abfrage und keine Browserkalibrierung ausgeführt; unabhängiger Review und zentrale CI-Ausführung stehen aus. Kein neues S10-Schutzbudget abgeleitet.** Im früheren Ressourcenlauf lagen bereits gesunde Pfade bei rund 859 MiB (Chromium) bzw. 788 MiB (Firefox) summierter RSS; dessen `inconclusive`-Ergebnisse bleiben unverändert.

## Nachweisgrenze und historischer Guard

Der erste Baseline-Entwurf behandelte einen cgroup-v2-Mountroot `/` irrtümlich als Beleg vollständiger Hierarchiesicht. Ein Cgroup-Namespace kann diese virtuelle Wurzel zeigen und reale Vorfahrenlimits verbergen; auch gleiche Namespace-Links für `/proc/self` und `/proc/1` beweisen in einem PID-Namespace nichts Unabhängiges. Die veröffentlichte Korrektur `3e3599d` verweigerte daher grundsätzlich jeden Browserstart. Actions-Lauf [40289382041](https://github.com/TaughtMe/HTML-Worksheet/actions/runs/40289382041) belegte nur synthetische Guard-/Messhilfsregressionen, keine Browsermessung.

Der jetzige Folgeentwurf verwendet ausdrücklich eine **Provider-/Launcherannahme**: Der unabhängig geprüfte Workflow läuft als offizieller GitHub-hosted `ubuntu-24.04`-Job direkt auf der Guest-VM, ohne Jobcontainer, Services oder Namespacewrapper. Verifiziertes OIDC bindet Repository, Workflow, Checkout und Lauf; es beweist weder vollständige Kernelhierarchie noch Hypervisorreserve oder die Abwesenheit konkurrierender Prozesse. Die feste Workflowkonfiguration und deren unabhängiger Review tragen diese Annahme mit. Lokale cgroup-Daten bleiben `known:false`/`observedOnly:true`; sie werden nicht zu einer vollständigen Hierarchieattestation umetikettiert.

Ohne die eng geprüfte CI-Zulassung bleibt die Ausführung vor App-Buildzugriff und Workerstart blockiert. Ein Slash-Mountroot, gleiche Namespace-Links, sichtbarer Headroom, gefälschtes `known:true`, reine erfolgreiche Signaturprüfung im Test oder frei gesetzte Umgebungsvariablen können keine Zulassung erzeugen. Nur der feste Produktionsabruf kann im selben Prozess eine zeitlich gültige interne Zulassung erzeugen. Fehlende Messwerte und sichtbar abgeschnittene cgroup-Vorfahren bleiben auch damit Verweigerungsgründe.

## Fester CI-Vertrag

Der separat gepflegte Workflow ist ausschließlich `TaughtMe/HTML-Worksheet/.github/workflows/baseline-observation.yml`, Repository-ID `1432048888`. Er verwendet Node 24, `runs-on: ubuntu-24.04`, Checkout exakt `${{ github.sha }}`, `contents: read` und nur im Beobachtungsjob `id-token: write`. Keine Wrapper, Container oder wiederverwendbaren Workflows. Er baut die App und installiert die benötigten Browser vor dem direkten Aufruf:

```sh
node apps/security-lab/test/baseline-context.test.mjs
node apps/security-lab/test/baseline.test.mjs
node apps/security-lab/test/baseline.mjs
```

Zulässige Ereignisse sind `workflow_dispatch` auf einem Branchref und eng begrenztes `pull_request`: offen, eigenes Repository für Head und Base, Headbranch exakt `feat/security-foundation`, Ref `refs/pull/<N>/merge`. Forkjobs und `pull_request_target` werden verweigert. Eine feste öffentliche GET-Abfrage von `https://api.github.com/repos/TaughtMe/HTML-Worksheet/pulls/<N>` prüft Repository-IDs/-Namen, Headbranch und die zum signierten Checkout passende Merge-SHA; OIDC-`repository`/`head_ref` allein würden einen Fork nicht ausschließen. Abweichende GitHub-Claims oder veraltete PR-Metadaten führen zur Verweigerung, nicht zum Wechsel auf eine schwächere Bindung.

Das Modul prüft den tatsächlichen sauberen Git-Checkout im tatsächlichen `GITHUB_WORKSPACE` mit absoluten, auf je zwei Sekunden begrenzten Git-Aufrufen; Hooks und fsmonitor sind deaktiviert. Signierte `sha` und `workflow_sha`, tatsächlicher HEAD, `GITHUB_SHA` und `GITHUB_WORKFLOW_SHA` müssen exakt übereinstimmen. Workflowpfad/-ref, Event, Ref, Run-ID, Attempt und Subject werden ebenfalls exakt gebunden; beim PR zusätzlich Head-/Baseref. Die Laufzeitangaben Linux, `github-hosted`, ImageOS `ubuntu24` sind notwendige Plausibilitätsbedingungen, allein aber keine Autorisierung. `NODE_OPTIONS`, zusätzliche Node-Startargumente und abgeschaltete TLS-Verifikation werden verweigert.

OIDC-Issuer ist fest `https://token.actions.githubusercontent.com`, Audience fest `https://github.com/TaughtMe/HTML-Worksheet/baseline-observation/v1`. Nur RS256/RSA mit 2.048–4.096 Bit, passendem eindeutigem JWKS-Key und PKCS#1-Verifikation wird akzeptiert. Gültigkeit, `iat`/`nbf`/`exp`, maximal zehn Minuten Tokenlaufzeit sowie Repository-ID und `runner_environment=github-hosted` werden geprüft. Unbekannte Header, alternative Algorithmen, doppelte JSON-Schlüssel, eingebettete/private Schlüssel, wiederverwendbare Workflows und unbekannte Keys werden verweigert. Keine unsignierten JWT-Fallbacks oder dynamischen Key-URLs.

Tokenendpoint aus der GitHub-Laufzeit ist auf HTTPS ohne Userinfo/Port/Fragment, feste GitHub-Actions-Hosts, UUID-Plan-/Jobpfad und allein `api-version=2.0` beschränkt; die feste Audience wird ergänzt. Erlaubt sind `pipelines.actions.githubusercontent.com` und eng begrenzte `run-actions-<Nummer>-<Region>.actions.githubusercontent.com`-Hosts. JWKS kommt nur vom festen Issuerpfad `/.well-known/jwks`. Jeder HTTP-Abruf hat fünf Sekunden einschließlich Body, keine Redirects/Retry-/Discovery-Fallbacks und höchstens 128 KiB JSON, die Tokenantwort höchstens 32 KiB. Dispatch benötigt zwei, PR drei Abrufe. Unerwartete tatsächliche Endpointformen verweigern mit festem Diagnosecode und benötigen Review; sie werden hier nicht als live verifiziert ausgegeben.

JWT und Request-Bearer werden nie geloggt oder archiviert. Fehler aus Abruf/Parsing/Verifikation werden auf feste Diagnosecodes reduziert. Im Rohbericht stehen nur ausgewählte öffentliche Kontextmetadaten, Ablaufzeit und explizite Providerannahme. Worker und Browser erben ausschließlich erlaubte Pfad-/Locale-/Proxy-/CA-Einstellungen; OIDC-URL/-Requesttoken, GitHub-/Cloudtokens und sonstige unbekannte Runtime-Credentials werden ausgeschlossen. Proxy-/CA-Konfiguration wird nicht still entfernt; Proxy-URLs mit Credentials/Query/Fragment werden verweigert.

## Messablauf und Grenzen

Der vorhandene Messablauf bleibt unverändert: ausschließlich **Chromium und Firefox mit je drei getrennten Browserläufen, streng seriell**. Jeder Worker startet einen kontrollierbaren BrowserServer und verwendet das bestehende startzeitgebundene `ProcessTree`-/Cleanup. Keine Angriffsfixture, Importdatei, Flood, Endlosschleife oder Allokationslast. Dateiscope dieses Folgepakets: `baseline*.mjs` und dieser Bericht; keine Änderungen an `resource*.mjs`, Host, Policy, Paketdateien oder Workflow.

Jeder Lauf hat drei Stufen, jeweils extern auf höchstens zehn Sekunden begrenzt:

1. **Browserstart:** neues Profil, Kontext und leere Seite; Browser-/Engineversion erfassen. Das Budget umfasst Worker-/Modulstart.
2. **Host geladen:** normale lokale Hostseite, Status `Bereit`, kein Runnerframe.
3. **Demo aktiv:** mitgelieferte Demo, JS-Interaktion, kleine synthetische Eingabe mit RAM-Annahme, genau ein Runner.

Jede gesunde Stufe wird nach der Operation eine Sekunde innerhalb ihres Budgets gehalten. Erst ein unabhängig bestätigter Speichercheckpoint erlaubt die nächste Stufe. Anschließend endet Browser und Server; nach zwei Sekunden greift nötigenfalls kontrolliertes Tree-Cleanup. Offene geerbte Pipes werden spätestens 250 ms nach Workerexit als unvollständiger Abschluss behandelt. Aktive Reste oder unvollständige Läufe verhindern weitere Browserstarts.

Die **bestehende S10-Grenze von 768 MiB bleibt unverändert**. Nur nach verifizierter CI-Zulassung und ausreichender sichtbarer Reserve gilt für diese gesunde Beobachtung die getrennte feste Obergrenze von **1.280 MiB summierter RSS**. Vor jedem Browserstart sind mindestens **2.304 MiB** sichtbarer freier Host- und cgroup-Headroom erforderlich; laufend wird unter **1.024 MiB** Reserve, bei OOM-Ereignissen, unbekannten Werten, abgelaufener Zulassung oder Überschreiten der RSS-Obergrenze abgebrochen. Fehlende oder abgeschnittene Daten bleiben unzulässig. Keine automatische Erhöhung oder Budgetableitung, keine exklusive Reservierung und keine harte Kernelquote; Schedulerlatenz und gemeinsame CI-Verbraucher bleiben Grenzen.

## Metriken und Rohbericht

`/proc/<pid>/stat` liefert summierte RSS. Zusätzlich liest der Supervisor `/proc/<pid>/smaps_rollup`: `Rss`, `Pss`, `Private_Clean`, `Private_Dirty` und optional `Private_Hugetlb`; KiB werden explizit in Bytes umgerechnet. RSS kann gemeinsame Seiten mehrfach zählen, PSS verteilt sie proportional. PID und Startzeit werden unmittelbar vor/nach Rollup erneut geprüft. Verschwundene/recycelte PIDs oder fehlende Werte sind Auslassung/Unbekannt, niemals null; ein unvollständiger Stufencheckpoint wird nicht bestätigt.

`apps/security-lab/test-results/baseline.json` enthält öffentliche Kontextmetadaten, Bundle-SHA-256, Node-/Browserversionen, Reservebeobachtungen, drei Stufencheckpoints je Lauf, RSS/PSS/private Bytes, Peaks, Zeitgrenzen, Abbruch und Cleanup-Reste. `automaticProtectionBudget` bleibt `null`. Exit 0 verlangt alle sechs vollständig gemessenen gesunden Läufe; Exit 1 bezeichnet Verweigerung/Fehler/unvollständige Messung, Exit 130 Signalabbruch mit Cleanupversuch. Kein Exitcode ist eine Sicherheitsfreigabe.

## Lokale Prüfungen und offene Ausführung

Mit Node `v24.19.0` ausgeführt: Syntaxchecks für die geänderten Module, `baseline-context.test.mjs` mit **73 synthetischen Fällen**, `baseline.test.mjs` und `git diff --check`. Die Kontexttests erzeugen lokale RSA-Testschlüssel und prüfen Signatur-/Claims-/Zeit-/Checkout-/PR-/Endpointfehler, doppelte Schlüssel, Token-/Bodygrößen, Transport-/Fehlerredaktion, einen tatsächlichen Fünf-Sekunden-Abbruch an einem synthetischen Stream sowie Credentialausschluss. Eine reine öffentliche Verifikationszusammenfassung kann den Reserveguard ausdrücklich nicht freischalten. Die vorhandenen Messhilfstests prüfen virtuelle Slash-Wurzel, gefälschtes `known:true`, fehlende/verborgene Zähler, Einheiten und PID-Identität.

Diese Tests starten keinen Browser und führen keine HTTP-/OIDC-Abfrage aus. Unveränderte Produkt-/Ressourcentests wurden nicht wiederholt. Unabhängiger Sol-Review, tatsächliche GitHub-Claim-/Endpointprüfung und zentraler gesunder Browserlauf sind noch offen. Bis zu deren Evidenz bleibt dies ein implementierter CI-Zulassungsentwurf, kein erledigter Baseline-Nachweis und keine G1a-Freigabe.

## Erster zentraler Zulassungsversuch und begrenzte Diagnose

Der nach Review zentral gestartete [CI-Lauf 40401527778](https://github.com/TaughtMe/HTML-Worksheet/actions/runs/40401527778) auf Remotecommit `40a4274` verweigerte vor jedem Browserstart: `context:null`, `OIDC_REQUEST_TARGET`, null Läufe. SHA-256 des unverändert aus Artefakt `12688672434` gelesenen `baseline.json`: `54509f97dfea74bfc87458a14ab24b45e0289b02ce6ffde0550512c6d2de956e`. Das belegt die geschlossene Ablehnung, noch keine tatsächlich passende Endpointform oder Kalibrierung.

Die am 26. Oktober gelesenen offiziellen Quellen [Runner ScriptHandler](https://github.com/actions/runner/blob/main/src/Runner.Worker/Handlers/ScriptHandler.cs) und [Toolkit OIDC-Client](https://github.com/actions/toolkit/blob/main/packages/core/src/oidc-utils.ts) liefern keine feste Host-/Pfadspezifikation: Der Runner übernimmt `GenerateIdTokenUrl` aus dem Serviceendpoint; das Toolkit verwendet die URL und ergänzt Audience. Daraus lässt sich der konkrete Ablehnungsgrund nicht zuverlässig bestimmen. Deshalb bleibt die Zielallowlist unverändert.

Der enge Folgepatch teilt ausschließlich die Ablehnung in feste Diagnosecodes auf: Parsefehler, Transport, Authority, nicht zugelassene Hostform, nicht erkannter Pfad oder Query. Eine numerische Actions-Shardform wird gesondert klassifiziert, aber weiterhin abgelehnt; andere Actions-Hosts und fremde Hosts bleiben ebenfalls gesperrt. Kein Code enthält eine tatsächliche URL, Hostname, Pfad, Query, Token oder Parserfehlermeldung. Acht zusätzliche synthetische Regressionen verlangen exakte Codes und prüfen die Nichtausgabe eingesetzter Marker. Kein weiterer Liveabruf durch den Implementierer; nächster Schritt ist nach engem Review genau ein zentraler Diagnoselauf, anschließend ein durch dessen Formbeleg begründeter Zielvalidator-Fix. Keine vorsorgliche Host-/Pfadlockerung und keine Budgetänderung.
