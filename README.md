# HTML-Worksheet

Planungsgrundlage für eine lokale, kontofreie Offline-PWA für interaktive HTML-Arbeitsblätter.

Repository: [TaughtMe/HTML-Worksheet](https://github.com/TaughtMe/HTML-Worksheet).

**Stand: 25. Oktober 2026 — technische Spezifikation und begrenzter lokaler Sicherheitsprototyp. Noch keine Produkt- oder Unterrichtsfreigabe.**

Die Plattform soll Vorlagen und persönliche Bearbeitungen trennen, unterstützte Antworten lokal sichern und später PDF-Abgabe sowie Arbeitsheftverwaltung ermöglichen. Importiertes HTML bleibt grundsätzlich nicht vertrauenswürdig.

- [Entwicklungsplan und Agentenaufteilung](docs/PLAN.md)
- [Offene Architekturentscheidungen](docs/ARCHITEKTUR.md)
- [GitHub und Hosting](docs/BETRIEB.md)
- [Auftragsvorlage für Agenten](docs/AUFTRAG.md)
- [Regeln für die weitere Entwicklung](AGENTS.md)
- [Aktueller Entwicklungsstand](docs/STATUS.md)
- [Technische Anforderungen](docs/spec/ANFORDERUNGEN.md)
- [Unabhängiges Spezifikationsreview und G0-Entscheidung](docs/reports/P09-G0.md)

Der erste technische Kern ist in [apps/security-lab](apps/security-lab/README.md) implementiert: lokaler HTML-Import, isolierter Runner und validierte Zustandsübertragung mit ausschließlich synthetischen Daten im Arbeitsspeicher. Installation, Start und Prüfungen sind in der Laboranleitung dokumentiert. Der [Prüfbericht](docs/reports/SECURITY-LAB.md) unterscheidet bestandene Einzeltests von noch offenen Sicherheitsgates.

Es gibt noch keine dauerhafte Antwortspeicherung, Arbeitsheftverwaltung, PDF-Erzeugung, installierbare Offline-PWA oder gehostete Testversion. Firefox, WebKit und reale iPad-/Android-Prüfungen sowie Ressourcen- und Offlineversuche bleiben offen. Die nächsten Phasen beginnen erst nach den zugehörigen Nachweisen.

Keine Schülerdaten, Zugangsdaten oder vertraulichen Unterrichtsmaterialien in dieses Repository aufnehmen. Eine Softwarelizenz ist noch nicht festgelegt; die spätere Abhängigkeitsprüfung ist davon getrennt.
