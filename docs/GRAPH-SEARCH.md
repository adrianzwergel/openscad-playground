# Räumliche Graphsuche mit kontinuierlicher Anpassung

Die Browser-Suche erzeugt offene Ketten aus ein bis vier Stirnrad-, Kegelrad-, Schnecken- und GT2-Paarungen
auf gemeinsamen Wellen. Ein- und Ausgang behalten ihre festen Zielrahmen; frei
orientierte Weltkoordinaten sind möglich. Minimale und maximale Stufenzahl sind
getrennt einstellbar. Generative Gehäuse bleiben zurückgestellt.

## Suchverfahren

`robust-search.ts` gruppiert Provider-Katalogvarianten nach ihrer Drehübertragung.
Memoisierte Restübersetzungen begrenzen die Auswahl passender mehrstufiger Ketten. Reproduzierbare Mehrstarts wechseln fair zwischen Stufentiefen
und Typenfolgen. Ein vorhandener passender Graph ist ein zusätzlicher Startwert.
Die UI erlaubt 1 % Übersetzungsabweichung und maximal acht geprüfte Kandidaten.

`refine.ts` passt Azimute, Kegel-Achswinkel (60–120°) und axiale Sitze gemeinsam
kontinuierlich an. Gedämpfte kleinste Quadrate mit numerischer Jacobi-Matrix
minimieren den Anschlussfehler. Jede Auswertung baut die Kette mit analytischen
Paarungsregeln neu auf; Kontaktgeometrie und Zahnphasen bleiben dadurch gekoppelt.
Suchparameter und Zahnphase stammen aus dem jeweiligen Provider.
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
werden so ausgewiesen. Kein Fertigungsnachweis. GT2 und Schnecken sind als individuelle Paarungen integriert; Riemenscheiben
werden als Kaufteil-Hüllen dargestellt. Geschlossene Schleifen sind nicht
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


## Erweiterbare Suchprovider und Antriebe

`RelationRule.search` liefert den diskreten Katalog, kontinuierliche Parameter mit
Grenzen und die Phase des Gegenstücks. `transfers` liefert die Drehübertragung;
`mateFrames` die zulässige Partnerlage. Der Suchkern enthält keine Fallunterscheidung
für Stirnrad/Kegelrad/Schnecke/GT2. Er unterstützt gerichtete binäre Paarungen in
offenen Ketten. Geschlossene Schleifen und Mehrscheibenriemen benötigen weitere
Topologie- und Bewegungslogik; das ist keine allgemeine Gelenk-Synthese.

Familien liefern weiterhin Einzelteilgeometrie, Bohrung und Rotorhülle. Regeln
können zusätzliche Raumhüllen (`spaces`), Bewegungsreserven (`sweeps`), axiale
Freihaltezonen für Lager (`bearingSpans`) und verbindende CAD-Geometrie liefern.
Ein Platz für ein Zahnrad kann auf derselben Welle neben Schnecke, Schneckenrad
oder Riemenscheibe liegen. Die Suche setzt keine fertigen Getriebe aneinander.

- Schnecke: Modul 2, Durchmesser/Länge 24 mm, 1/2 Gänge, rechtshändig; Gegenrad
  20/30/40 Zähne, passende Gangzahl und Normalmodul. Rechtwinklige, windschiefe
  Achsen; Azimut kontinuierlich. Schneckenlager werden außerhalb der axial
  projizierten Gegenradhülle reserviert. Axiallager, Wirkungsgrad, Lasten und
  Rücktreibbarkeit bleiben ungeklärt.
- GT2: offene Zweischeibenführung, 20/30/40 Zähne, 6 mm Breite. Kataloglängen
  200/280/300/400/500/600/610/752/800 mm. Exakte Tangenten-Pitchlänge bestimmt den
  Betriebsachsabstand. Mindestens 120° Umschlingung und sechs Zähne im Eingriff.
  Standardreserve: 2 mm Entspannweg und 1 mm Nachspannweg; im JSON begrenzt auf
  2–10 bzw. 1–10 mm einstellbar. Die Scheiben erhalten keine vorgetäuschten
  druckbaren GT2-Zähne: CAD zeigt Kaufteil-, Flansch-, Naben- und Riemenhüllen.

Der Spannweg verschiebt keine festen Betriebsanschlüsse. Für den verstellbaren
Gegenkörper werden Rotoren, Welle, Lager und Zugang über den Stellweg konservativ
aufgeweitet. Der gesamte Riemenkorridor bleibt gegenüber fremden Teilen frei;
nur die zugehörigen Scheiben und ihre Wellen sind ausgenommen. Ein gemeinsamer
Träger mit weiteren Eingriffen kann zum Montieren zusätzliche Demontage benötigen.
Slack-Riemenverformung, vollständige Einfädelwege, Spannvorrichtung und Vorspannung
sind nicht nachgewiesen. Die Betriebsgeometrie bleibt von diesen Reserven getrennt.

Im Browser sind erlaubte Provider auswählbar. Drei neue Referenzen zeigen Schnecke
→ Stirnrad, Schnecke → GT2 und Stirnrad → GT2 → Schnecke. „Aktuelle Untersetzung als
Soll“ übernimmt ausdrücklich den Istwert; Variantenübernahme überschreibt das
gewünschte Soll nicht automatisch. Graphen bleiben mit Projektformat 6 speicherbar.

`node scripts/check-graph-drives.mjs` prüft einen zusätzlich registrierten Provider,
kalte gemischte Suche, gemeinsame Wellen, feste gedrehte Endrahmen, Übersetzungen,
Längen-/Spannregeln, Riemenkorridor-Kollisionen und JSON-Roundtrip.
`node scripts/check-graph-drives-browser.mjs` rendert alle drei Referenzen mit WASM,
prüft Speicherung und stichprobenartig tatsächliche Schnecken-Zahnüberschneidungen
bei verschiedenen Azimuten und Phasen. Stichproben sind kein Bewegungsnachweis.


## Lineare Endstufen und Bindungen

Spindel/Mutter und Ritzel/Zahnstange können jetzt die letzte Stufe einer gemischten
Kette bilden. Suche und Vergleich verwenden dann Vorschub in mm/U statt :1.
Neue Graphversion 2 trennt Trägerbewegung und Elementbindung; alte Graphen bleiben
lesbar. Hub, Bewegungshüllen, Referenzen und bewusst offene Führungsbedingungen:
[LINEAR-GRAPH.md](LINEAR-GRAPH.md).
