# Gemischte Kettensuche

Im Menü „Gemischte Kettensuche“ werden zwei konstruktive Kettenfamilien gesucht:
Schnecke → Stirnradpaar und Schnecke → GT2-Riemen. Beide Stufen haben eigene Lagerungen
und getrennte Wellen. Eine koaxiale Kupplung überträgt die Bewegung zwischen ihnen.
Eine verschraubte Brücke verbindet Schneckengehäuse und obere Antriebsstufe.

## Feste Anschlüsse und Suchraum

Eingangsachse +X, Ausgangsachse +Z. Die Positionen sind Punkte auf den Achsen, keine
vorgegebenen Wellenstirnflächen. Die Ausgangs-Z-Koordinate legt zusätzlich die Ebene
der oberen Zahnräder beziehungsweise Riemenscheiben fest. Die Eingangs-Z-Koordinate
legt die Schneckenebene fest. Globale Translation und die Orientierung der oberen
Stufe um Z werden berücksichtigt; beliebige Port-Richtungen sind noch nicht enthalten.

Die Schneckenstufe darf innerhalb des eingegebenen Bereichs (standardmäßig ±100 mm,
maximal ±150 mm) entlang der unveränderten Eingangsachse positioniert werden. Der
Solver löst die beiden möglichen Schnittpunkte des erforderlichen Achsabstands mit
dieser Geraden. Er verschiebt keine der vorgegebenen Achsen. Ein Bereich von 0 fixiert
auch die axiale Position der Schnecke am angegebenen Eingangspunkt.

Katalog:

- Schnecke: Normalmodul 2, Ø24, Länge 24, rechtsgängig, 1 oder 2 Gänge; Rad 30/40 Zähne.
- Stirnradstufe: Modul 2, 20°; 20/30/40/50 Zähne, ein Paar auf zwei parallelen Wellen.
- GT2: 16/20/30/40/60 Zähne, 6 mm Breite; vorhandener Riemenlängenkatalog.
- Soll-Untersetzung >0 bis 100, relative Toleranz 0–1000 %.

Prolog enumeriert die diskreten Kombinationen und filtert nach Gesamtübersetzung.
TypeScript löst die Positionen und prüft die gemeinsame Konstruktion. Gesamtübersetzung
ist `(Schneckenradzähne / Gänge) × (Ausgangszähne / Eingangszähne)`.
An den definierten Portachsen ist der Drehzahlfaktor bei nachgeschalteten Stirnrädern
negativ, beim offenen Riemen positiv. Die schematische Animation zeigt alle vier Rotoren.

Die Ergebnisliste sortiert nach Übersetzungsfehler, XY-Fläche der Brücke und axialer
Verschiebung. Maximal 40 Ergebnisse werden angezeigt; Gesamtzahl und Ablehnungsgründe
bleiben sichtbar. Geometrisch ungültige Ketten sind nicht auswählbar. Änderung der
Anschluss- oder Suchvorgaben verwirft die Auswahl und die vorherige Ergebnisliste.

## Gemeinsame Konstruktion

Die untere Stufe verwendet die Schneckenpaar-Vorlage aus Etappe F. Ihre Ausgangswelle
wird berechnet verlängert, maximal um 150 mm. Sie bleibt an ihren zwei radialen
Lagerstellen geführt. Die obere Stufe hat ebenfalls zwei Lager je Welle. Am Kupplungsstoß
wird kein zusätzliches Radiallager eingeführt. Die beiden axial gesicherten Wellen
müssen bei der Montage fluchten und dürfen durch die Kupplung nicht verspannt werden.

Kupplungsvorlage: Metall-Kaufteil, Bohrungen Ø5/5, Hülle Ø14 × 12 mm, 1 mm Stoßspalt
und jeweils 5,5 mm Einstecktiefe. Das konkrete Kaufteil, seine Klemmung und seine
Tragfähigkeit müssen vor Fertigung abgeglichen werden. Die Brückenplatte hat dafür
eine Ø18-Freiraumöffnung. Die untere Klemmung wird vor Einsetzen der Platte befestigt.

Vier 12–150 mm hohe Stützen verbinden den modifizierten Schneckengehäusedeckel mit
einer 6-mm-Brückenplatte. Vier weitere 10-mm-Distanzstücke tragen die Oberstufe.
Ihre Taschen nehmen die vorhandenen Muttern/Unterlegscheiben der Stirnradstufe auf.
Alle zusätzlichen Befestigungen und verlängerten Wellen/Stangen stehen in der Stückliste.
Die Riemenbasis erhält vier passende Befestigungsbohrungen und eine verlängerte Eingangswelle.

Beim Riemen entspricht der berechnete Betriebsachsabstand exakt den festen Ausgangsvorgaben
(numerische Toleranz 0,00001 mm, keine Fertigungstoleranz). Nur zum Auflegen und Spannen
wird die Ausgangs-Lagerbrücke in ihrem vorgesehenen Bereich ±4 mm gelöst. Mindestens
2 mm Entspannweg und 1 mm Nachspannreserve werden wie in Etappe E geprüft. Danach die
vorgegebene Betriebsposition wieder einstellen und klemmen. Es wird keine beliebige
Kataloglänge durch Verschieben der festen Betriebsachse passend gemacht.

Die Konstruktion prüft die Regeln beider Stufen, exakte Achsabstände, Brückenhöhe,
Wellenverlängerung, Wellen-/Kupplungskorridore und Abstände der Befestigungen.
Die Montageansicht öffnet das Schneckengehäuse und trennt Teile der oberen Konstruktion.
Sie ist keine berechnete Ausbau-Trajektorie. Die obere Stufe bleibt ein offenes
Lagerplattengehäuse; ein zusätzlicher Berührschutz wird nicht erzeugt.

## Speicherung und Export

Projektformat 5 ergänzt das optionale `mixed`-Objekt. Versionen 1–4 werden migriert.
Nur eine der Vorlagen `motion`, `spatial` oder `mixed` kann aktiv sein. Suchvorgaben
und gewählter Katalogsatz einschließlich axialer Position werden gespeichert;
Konstruktion und Prüfungen werden beim Laden neu berechnet. Die Variantenablage aus
Etappe G unterstützt auch gemischte Projekte.

Die Baugruppe bietet CAD-Vorschau, Montageansicht, einzelne STL-Dateien und ZIP mit
allen Druckteilen, Mengen/Kaufteilen, Projektdatei, Prüfungen und Montageanleitung.
Beispiele: `examples/mechanics-mixed-worm-spur.json` und
`examples/mechanics-mixed-worm-belt.json`.

## Abnahme und Grenzen

- `check-mixed.mjs`: beide Familien, Übersetzung, unveränderte Achsen, Platzierung,
  Grenzen, unerreichbare Vorgaben, Translation, Animation, Migration und Speicherung.
- `check-mixed-contact.mjs`: echte OpenSCAD-Schnittmengen zwischen unterer Stufe,
  oberer Stufe, Brücke und Kupplung. Zusätzlich größere zweigängige Schnecken und
  gedrehte Oberstufen. Befestigungen sind teilweise nur als Hüllen dargestellt.
- `check-mixed-browser.mjs`: echte Prolog-Suche, Übernahme, Vorschauen, alle 35
  Einzelteil-STLs der beiden getesteten Ketten, Speicherung, fehlende Lösungen,
  ungültig gewordene Ansichten sowie Abbruch und Neustart. STL-Netze müssen geschlossen,
  zusammenhängend und am Druckbett ausgerichtet sein.

Dies ist eine begrenzte Suche über zwei konstruktive Kettenfamilien, noch keine freie
Graphsuche über sämtliche Komponenten. Kegelräder, Innenverzahnung, lineare Ausgänge,
dritte Stufen, Zwischenräder in der oberen Stufe und beliebige Anschlussorientierungen
sind hier noch nicht kombinierbar. Schnittproben ersetzen keinen vollständigen
Bewegungs- oder Werkzeugzugangsnachweis. Kräfte, Durchbiegung der Brücke und langen
Wellen, Lagerlebensdauer sowie reale Druck-/Montageabnahme bleiben offen.
