# Räumliche Suche – Etappe C

## Eingaben und feste Achsen
Die Suchvorgaben bestehen aus zwei parallelen +Z-Wellenachsen (XY fest), Soll-Untersetzung,
zulässiger relativer Abweichung in Prozent, Drehsinn, maximal einer oder zwei Ebenen,
Ebenenabstand und Mindestfreiraum. Z der Eingangsachse definiert die erste Zahnradmittelebene;
die zweite liegt um den Ebenenabstand darüber. Eine Wellenachse ist eine Gerade, kein endlicher
Wellenkörper. Der gespeicherte Z-Referenzpunkt der Ausgangsachse fixiert deshalb keine Zahnradmitte.
Axiale Anschlussflächen, Wellenlängen und Lagerstellen sind Gegenstand von Etappe D.

Die Suche verändert das Projekt nicht. Erst „Übernehmen & rendern“ ersetzt Komponenten und
Verbindungen durch die gewählte Anordnung. Beide Achsen und alle Suchvorgaben bleiben erhalten.
Die Komponentenansicht erlaubt weiterhin manuelle Änderungen; abweichende Anschlusspositionen
werden als Regelverletzung angezeigt, niemals automatisch korrigiert.

## Arbeitsteilung
1. `catalog.pl` enumeriert kompatible Verzahnungen aus dem gemeinsamen Katalog. Vier Vorlagen:
   Direktpaar, ein Zwischenrad, zwei Zwischenräder, ein Doppelzahnrad auf einer Zwischenwelle.
   Bei Doppelzahnrädern dürfen die beiden Stufen unterschiedliche Module verwenden.
2. Prolog filtert Ebenen, Drehrichtung, Übersetzungsfehler und grobe Erreichbarkeit anhand der
   Summe und Differenz der Achsabstände. Der Zielwert ist Eingangsdrehzahl / Ausgangsdrehzahl.
3. `search.ts` setzt direkte Paare auf die vorgegebenen Achsen. Eine Zwischenwelle entsteht
   durch exakten Schnitt zweier Kreise; beide Spiegelanordnungen werden berücksichtigt.
   Zwei Zwischenwellen werden mit 24 Winkeln der ersten Verbindung relativ zur Eingangs-/
   Ausgangsrichtung gesucht (15°-Raster); die zweite Position folgt wiederum aus Kreisschnitten.
4. `resolveProject` prüft jede Anordnung mit denselben Regeln wie den manuell bearbeiteten Stand.
   Die Berechnung läuft in einem separaten Worker, der wie Prolog und OpenSCAD abbrechbar ist.
5. Ergebnisse werden nach Übersetzungsfehler, Wellenzahl, Ebenenzahl und XY-Hüllfläche sortiert.
   Bis zu 60 Varianten werden übertragen, darunter die beste jeder verfügbaren Bauart.
   Die Oberfläche kann diese Auswahl nach Fläche oder Wellenzahl umsortieren und nach Bauart filtern.
   Diese Sortierung ist kein globales Flächenoptimum über alle verworfenen/ausgeblendeten Varianten.

## Prüfung und Geometrie
Paarungen benötigen identischen Modul/Eingriffswinkel, korrekten Teilkreisabstand und dieselbe
Mittelebene. Zahnphasen werden entlang der gesamten Kette propagiert. Eine starre Verbindung
überträgt Drehzahl und Zahnstellung 1:1 und braucht eine gemeinsame XY-Achse.

Nicht miteinander kämmende Räder werden als umschließende Zylinder geprüft: Kopfkreisradius
und volle Zahnbreite, einschließlich Mindestabstand. Vorgesehene Verzahnungspaare sind davon
ausgenommen. Wellenkorridore werden durch alle Ebenen reserviert; bei Doppelzahnrädern wird
auch der Radius der verbindenden Nabe berücksichtigt. OpenSCAD verbindet die zwei Zahnräder
mit einer ringförmigen Nabe zu einem starren Körper. Bohrung 5,1 mm und Nabenwand 2 mm sind
noch keine geprüften Fertigungs-/Festigkeitsvorgaben.

Die Prüfung ist bewusst konservativ: keine Detailkollision der Zähne und keine Validierung von
Lagern, Gehäuse, Montage, Befestigung, Last oder Druckbarkeit. „Gültig“ bedeutet ausschließlich,
dass die implementierten Geometrie-/Kinematikregeln erfüllt sind.

## Suchgrenzen
Keine Kombination von Zwischenrad und Doppelzahnrad, keine zwei Doppelzahnräder und keine
geschlossenen Getriebeschleifen in dieser Etappe. Eingang liegt auf Ebene 1; Doppelzahnrad führt
zum Ausgang auf Ebene 2. Die gespiegelte axiale Anordnung wird nicht zusätzlich gesucht.
Koaxiale Eingangs-/Ausgangswellen sind nicht unterstützt. Das Winkelraster kann zulässige
Anordnungen übersehen. „Keine passende Anordnung“ gilt nur für diese Vorlagen und Stichproben.

## Reproduzierbares Beispiel
`examples/mechanics-compound.json`: Achsen bei (0,0) und (100,0), Soll/Ist 4:1, zwei Stufen
20→40 und 20→40, gemeinsame Zwischenwelle, Ebenen Z=0 und Z=15. Über JSON öffnen importieren,
rendern oder erneut suchen. Die spiegelbildliche Lösung liegt auf der anderen Seite der X-Achse.

## Tests
`node scripts/check-search.mjs`: Kreisschnitte, Phasen, vier Vorlagen, feste Achsen, Ebenen,
Drehrichtung, Kollisionsablehnung, unmögliche Abstände, Migration und Roundtrip.
`node scripts/check-search-browser.mjs`: tatsächliche Prolog/WASM-Enumeration und räumlicher
Worker, Doppelzahnrad als GLB/STL, Speichern/Wiederherstellen, Vergleich, Abbruch und Neustart.
