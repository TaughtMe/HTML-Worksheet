# Vorlage für einen Agentenauftrag

```text
ID / Titel:
Modell / Reasoning-Stufe:
Ziel: genau ein prüfbares Ergebnis
Voraussetzungen: akzeptierte Task-IDs und Schnittstellenversion
Eingaben: relevante Dokumente und Testfälle
Erlaubter Dateibereich:
Nicht Bestandteil:
Sicherheitsinvarianten:
Abnahmekriterien: beobachtbares Verhalten, einschließlich Fehlerfällen
Prüfbefehle / erforderliche Umgebung:
Abbruch- und Eskalationsbedingungen:
Prüfer: separater Auftrag bei kritischen Änderungen
Rückgabe: Commit, Dateien, Prüfergebnisse, Annahmen, Restrisiken
```

Zielgröße: ein zusammenhängender Patch, gewöhnlich 30–90 Minuten aktive Arbeit als Planungsheuristik, keine Laufzeitgarantie. Wird das Ergebnis breiter, vor der Implementierung aufteilen. Recherche endet mit einer Entscheidungsvorlage oder einem reproduzierbaren Experiment, nicht mit einer offenen Sammlung von Links.

Status: `offen → bereit → in Arbeit → im Review → erledigt`; alternativ `blockiert` mit Ursache und nächstem Entblockungsschritt. Eine Aufgabe ist erst erledigt, wenn ihr Ergebnis und die erforderlichen Prüfungen vorliegen.
