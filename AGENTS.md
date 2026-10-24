# Arbeitsregeln

## Umfang und Reihenfolge

- Ausgangspunkt sind README.md und docs/PLAN.md. Aktuell ist nur die Planung abgeschlossen; keine technische Sicherheitsabnahme behaupten.
- Kleine Aufträge mit eigener ID, Abhängigkeiten, Dateibereich und beobachtbaren Abnahmekriterien verwenden. Ein Auftrag ist kein ganzer Meilenstein.
- Sicherheitsprototyp vor Persistenz; Persistenz vor PDF-Abnahme; PDF vor vollständiger Produktoberfläche.
- Sicherheitsmechanismen niemals für Kompatibilität lockern. Fehlgeschlagene Sicherheitskriterien blockieren die betroffene Freigabe.
- Untrusted HTML und Metadaten niemals in den privilegierten Host-DOM als ausführbaren Inhalt übernehmen.
- Keine Schülerdaten, Telemetrie, Secrets oder echten personenbezogenen Testdaten.

## Agenten

- Sol: gpt-6.1-sol. Standard medium, für Sicherheitscode und Persistenz high, für ungeklärte Isolations- und Browsergrenzen xhigh.
- Luna: gpt-6-luna. Standard low, für spezifizierte Testfixtures und abgegrenzte UI-Arbeit medium. Keine eigenständige Freigabe von Sicherheitsarchitektur, Migrationen oder Exportgrenzen.
- Astra: gpt-6-astra. Koordination nach Bedarf; technische Untersuchung nur bei dokumentierter Eskalation. Kein routinemäßiges Schreiben oder Review aller Dateien.
- Erst Luna → Sol eskalieren. Sol erhöht bei Bedarf von medium auf high/xhigh. Nach zwei erfolglosen, unterschiedlichen Lösungsversuchen oder einem ungelösten Architekturkonflikt an Astra übergeben. Keine riskanten Versuche erzwingen, um diese Zahl zu erreichen.
- Kritischen Code durch einen separaten Sol-Reviewauftrag prüfen. Das ersetzt weder unabhängige menschliche Sicherheitsprüfung noch reale Gerätetests.

## Zusammenarbeit und Abnahme

- Parallel nur nach festgelegtem Schnittstellenvertrag und mit getrennten Dateibereichen. Isolierte Branches/Worktrees verwenden; gemeinsame Schnittstellen sequenziell ändern.
- Zunächst höchstens zwei ausführende Agenten plus Koordination. Mehr Parallelität nur bei wirklich unabhängigen Aufgaben.
- Pro Auftrag Commit und Prüfbericht mit Befehlen, Ergebnissen, Browser-/Toolversionen und offenen Grenzen liefern. Nicht ausgeführte Tests ausdrücklich so kennzeichnen.
- Kritische Funktionen durch Regressionstests absichern. Screenshots und Dokumentation sind kein Sicherheitsnachweis.
- Abhängigkeiten und Lockfile gemeinsam ändern; CI-Aktionen auf überprüfte Commit-SHAs pinnen.
- Keine pauschale Aussage „sicher“, „offline-fähig“ oder „iPad-kompatibel“ ohne konkret zugehörige Testevidenz.
- Bei einer Eskalation unabhängige Arbeit fortsetzen; nur abhängige Aufgaben pausieren. Entscheidungen dokumentieren, keine zusätzliche Nutzerfreigabe für Routinearbeit erfinden.
