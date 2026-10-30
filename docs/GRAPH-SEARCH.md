# Räumliche Graphsuche mit kontinuierlicher Anpassung

Die Browser-Suche erzeugt offene Ketten aus ein bis vier Stirnrad-/Kegelradpaarungen
auf gemeinsamen Wellen. Ein- und Ausgang behalten ihre festen Zielrahmen; frei
orientierte Weltkoordinaten sind möglich. Minimale und maximale Stufenzahl sind
getrennt einstellbar. Generative Gehäuse bleiben zurückgestellt.

## Suchverfahren

`robust-search.ts` enumeriert passende Zähnezahlprodukte (20/30/40, Modul 2) für die
Soll-Untersetzung. Reproduzierbare Mehrstarts wechseln fair zwischen Stufentiefen
und Typenfolgen. Ein vorhandener passender Graph ist ein zusätzlicher Startwert.
Die UI erlaubt 1 % Übersetzungsabweichung und maximal acht geprüfte Kandidaten.

`refine.ts` passt Azimute, Kegel-Achswinkel (60–120°) und axiale Sitze gemeinsam
kontinuierlich an. Gedämpfte kleinste Quadrate mit numerischer Jacobi-Matrix
minimieren den Anschlussfehler. Jede Auswertung baut die Kette mit analytischen
Paarungsregeln neu auf; Kontaktgeometrie und Zahnphasen bleiben dadurch gekoppelt.
Zielrahmen werden nicht zur Fehlerkorrektur verschoben. Axiale Suchgrenzen:
erster Sitz 0–150 mm, weitere treibende Sitze 20–150 mm.

Diskrete Übersetzung und kontinuierliche Endlage werden getrennt gelöst. Gültige
Kinematik, feste Anschlüsse und konstruktive Hüllräume sind abschließende Filter.
Kollisionen werden derzeit durch andere Starts umgangen, nicht über Gradienten
im Optimierungsziel. Keine globale Vollständigkeitsgarantie: budget und
starts-exhausted bedeuten nicht, dass keine Lösung existiert. Das Budget von
100.000 zählt approximierte numerische Rechenarbeit, nicht verschiedene Graphen.
Kooperative Unterbrechung lässt Abbruch und Browserinteraktion zu.

## Konstruktive Filter

`construction.ts` prüft orientierte Hüllquader mittels Separating-Axis-Test mit
1 mm Mindestabstand. Die Hüllen umfassen drehende Rotoren, endliche Wellen,
Lager-/Deckelplätze (Radius 10 mm, axiale Breite 8 mm) und axialen Werkzeugzugang
(Radius 14 mm, Länge 19 mm). Wellenlängen werden an die reservierten Lagerstellen
angepasst. Bei späterer manueller Änderung prüft die UI die tatsächlich gespeicherte
Wellenlänge, ohne sie still zu ändern. Lagerpositionen und Ausschlussgründe werden
angezeigt und aus dem gespeicherten Graphen wieder berechnet.

Stirnradwellen erhalten Lagerplätze vor und hinter dem Elementpaket. Wellen mit
Kegelrädern verwenden vorerst zwei rückwärtige Lagerplätze mit überhängender
Verzahnung. Das ist eine geometrische Reservierung, kein Lastnachweis und keine
allgemein geeignete Lagerauslegung. Lager-/Werkzeughüllen werden nicht als fertige
CAD-Bauteile ausgegeben. Eigenwelle und zugehörige Sitze dürfen sich berühren;
ausdrücklich gepaarte Verzahnungen sind vom Rotor-Hüllvergleich ausgenommen.
Alle übrigen Hüllpaare müssen frei bleiben. Quadratische Hüllen sind konservativ
und können tatsächlich passende Anordnungen ablehnen.

Vollständige Einfädel-/Montagepfade, detaillierte Zahnkontaktprüfung über den
Bewegungszyklus, Nabenfixierung, Axiallager und Festigkeit bleiben ungeklärt und
werden so ausgewiesen. Kein Fertigungsnachweis. GT2 und Schnecken sind noch nicht
in diesem neuen Graph-Suchprovider integriert. Geschlossene Schleifen sind nicht
Teil dieser offenen Kettensuche. Der alte Beam-Solver bleibt als Regression erhalten.

## Abnahme

`node scripts/check-robust-graph-search.mjs`: kalte Drei-/Vierstufensuche mit 8:1
und 16:1 in gedrehten Weltkoordinaten; kalte gemischte 6:1-/12:1-Suche mit schrägem
Ausgangsanschluss; gemischte Ketten mit gestörten Winkeln und
Positionen; feste Endanschlüsse, Übersetzung, Lagerlänge, Kollision und Abbruch.
Diese bekannten Fälle sind Regressionen, kein Vollständigkeitsbeweis.
`node scripts/check-graph-search-browser.mjs`: Übernahme, Speicherung und Abbruch
im Produktionsbuild auf Port 4001. `check-robust-graph-browser.mjs` prüft zusätzlich
die kalte Drei-/Vierstufensuche und gespeicherte Freiraumberichte im Browser.
`check-element-graph.mjs` und
`check-graph-search.mjs` sichern vorhandene Graph-/Paarungsfunktionen ab.
