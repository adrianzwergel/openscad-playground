# Räumliche Graphsuche – erster begrenzter Suchlauf

Im Elementgraph-Modus lassen sich jetzt Anordnungen zwischen den festen Zielrahmen
suchen. Die Auswahl verwendet zwei bis vier Paarungen (auch eine ist einstellbar),
gemeinsame Wellen und die vorhandenen Stirnrad-/Kegelradprovider. Referenzabnahme:
zweistufige Mischketten in frei gedrehten Weltkoordinaten, einschließlich eines
73°-Kegelwinkels außerhalb des ursprünglichen Rasters. Drei/vier Stufen sind ein
experimenteller Suchraum, noch kein umfassend abgenommener Autorouter.

Die Suche baut neue Graphen auf; sie verändert die Zielrahmen nicht. Einzelne Stufen
werden über analytische Provider-Vorschläge platziert. Zähnezahlen 20/30/40, Modul 2,
Winkelraster und axiale Sitzvorschläge werden mit aus dem Zielrahmen abgeleiteten
Winkeln und axialen Positionen kombiniert. Keine kontinuierliche Optimierung und
keine Vollständigkeitsgarantie. Allgemeine Anschlussorientierungen sind als Vorgabe
zulässig, aber nicht jede Orientierung ist mit diesem Suchraum erreichbar.

Eine begrenzte Beam-Suche bewertet Endlagenfehler und Restübersetzung. Unterschiedliche
erste Paarungen, Zähnezahlen und axiale Sitze werden bei der Auswahl berücksichtigt.
Budget wird auf die Stufentiefen verteilt. Status budget/beam-exhausted bedeutet
nicht, dass keine Lösung existiert. Maximal zwölf Lösungen werden angezeigt. Ein
Kandidat wird nur mit gültigen Paarungs-/Phasenregeln, axialer Belegung, bestimmter
Übersetzung und eingehaltenen Endanschlüssen angeboten. Die UI verwendet 1 %
Übersetzungstoleranz, 100.000 Versuche und eine Beam-Breite von 120.

Die Suche ist kooperativ unterbrechbar und gibt regelmäßig an den Browser zurück.
Übernommene Graphen werden mit Projektformat 6 gespeichert und können mit der
vorhandenen CAD-Vorschau und Animation geprüft werden.

Wichtig: Kinematisch passende Kandidaten sind keine Fertigungsfreigabe. Vollständige
3D-Kollisionen, Lagerplatz, Wellenkreuzungen, Befestigung und Montage sind weiterhin
ungeprüft. Die Oberfläche kennzeichnet das ausdrücklich. Generative Gehäuse bleiben
zurückgestellt. Nächste Schritte sind kontinuierliche Anpassung, bessere mehrstufige
Suche und konstruktive Ausschlussprüfungen, bevor weitere Familien integriert werden.

Tests: `node scripts/check-graph-search.mjs` und
`node scripts/check-graph-search-browser.mjs` (Produktionsbuild auf Port 4001).
