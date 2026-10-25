# Entwicklungsstand

Stand: 25. Oktober 2026. Dieser Status beschreibt belegte Ergebnisse; der Entwicklungsplan beschreibt Ziel und Reihenfolge.

| Abschnitt | Status | Evidenz / nächster Schritt |
|---|---|---|
| Repository und Entwicklungsplan | Erledigt | `main`, ursprünglicher Plancommit `72807f9` |
| P01 Anforderungen | Erledigt | [Anforderungen](spec/ANFORDERUNGEN.md), [Abdeckungsprüfung](reports/P01.md) |
| P02 Experimente | Reviewt | [Browserexperimente](spec/EXPERIMENTE.md), Ergebnisse noch offen |
| P03–P06, P08 Spezifikation | Reviewt | Bedrohungsmodell, Architektur- und Schnittstellenverträge; installiertes [Dependencyinventar](reports/DEPENDENCIES.md) vorhanden |
| P07 Testmatrix | Erledigt | [Testmatrix](spec/TESTMATRIX.md): 32 Anforderungen, 14 Bedrohungen, zehn Experimente zugeordnet |
| P09 / G0 | Begrenzt freigegeben | [Unabhängiges Review](reports/P09-G0.md), Commit `51c367f`; nur lokales Labor mit synthetischem RAM-State |
| S01, S03–S09 Sicherheitsprototyp | Begrenzter Kern implementiert | Typecheck, Build, 12 Unit-/Importtests und 28 Chromiumfälle bestanden; [Umfang und Grenzen](reports/SECURITY-LAB.md) |
| S02 CI | Ausstehend | Wiederholbare lokale Tests vorhanden, noch kein GitHub-Workflow |
| S10–S13 | Ausstehend | Ressourcenmissbrauch, Offline-Runner und vollständiger Sicherheitsreview bleiben erforderlich |
| G1a / G1b | Nicht freigegeben | Chromium-Teilnachweis vorhanden; weitere Engines, volle Versuchsmatrix, Offline-/Ressourcentests und reale Geräte fehlen |
| Speicherung, PDF und Produkt-PWA | Ausstehend | Nach den jeweiligen Gates |
| Cloudflare | Nicht eingerichtet | HTTPS-Testhosting erst nach G1a erforderlich |

Es gibt noch keine Sicherheitsfreigabe, keine Garantie für beliebiges fremdes JavaScript und keine Freigabe zur Verarbeitung echter Schülerdaten.

## Agentenzuordnung

Die Namen sind interne Aufgabenkennungen, keine separat zu verwaltenden Nutzerchats. Der Stand wird bei Meilensteinen aktualisiert und ist kein Live-Dashboard.

| Agent | Modell / Stufe | Zuletzt belegtes Ergebnis |
|---|---|---|
| `p01_requirements` | Luna / medium | Anforderungen, Testmatrix, Fixtures und Dependencyinventar |
| `technical_spec` | Sol / xhigh | Bedrohungsmodell, Architektur- und Daten-/Bridgeverträge |
| `security_prototype` | Sol / high | Lokaler Viewer, Regressionen und korrigierter Browserharness |
| `g0_review` | Sol / high | Unabhängiges G0-/Codereview und Abgleich der 28 Chromiumresultate |

Die Koordination integriert die Commits, führt gemeinsame Prüfungen aus und veröffentlicht die Ergebnisse. Routinekoordination erhält kurze Zusammenfassungen; technische Eskalationen werden getrennt von normaler Implementierung behandelt. Die verbindlichen Regeln zur Aufwandsbegrenzung stehen in [AGENTS.md](../AGENTS.md).
