# Studio S1 – erster Implementierungsstand

Eigenständiger Einstieg: /studio.html. Three.js-Arbeitsfläche mit zwei verschiebbaren/
drehbaren Anschlussrahmen, skalierbarem Bauraum, zusätzlichen Sperrquadern, gestrichelter
Verbindung, Suche per Rechtsklick oder Schaltfläche, Abbruch, Hüllenvorschau der Treffer
und lokaler Speicherung. Dokument enthält assemblies[] und routes[]; derzeit wird nur
die erste Baugruppe/Route bearbeitet und gesucht. Keine globale Mehrkettensuche.

## Ergänzungen abgeschlossen

Undo/Redo für Griffzüge (jeweils eine Transaktion), Sperrzonen, Übersetzung, Import
und Lösungsübernahme. Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z bzw. Ctrl+Y; Escape verwirft einen
laufenden Griffzug. Eine neue Änderung verwirft den Redo-Zweig. Historie umfasst bis
zu 100 Schritte und gilt für die aktuelle Sitzung; sie wird nicht exportiert.

Validierter JSON-Import/-Export des vollständigen Studio-Dokuments (max. 2 MB).
Mehrere Baugruppen/Routen werden validiert und verlustfrei erhalten; bearbeitet wird
weiter die Baugruppe der ersten Route. Mechanics-Projekte mit Elementgraph werden
migriert; andere historische Baugruppen-Vorlagen werden ausdrücklich abgewiesen.
Ungültiger Import verändert das Dokument nicht. Import ist selbst rückgängig machbar.
Bei zwischenzeitlicher Änderung während des Dateilesens wird der Import verworfen.

Suchlösungen können nach erneuter Prüfung von Anschlüssen, Raumvorgaben, Übersetzung,
Kinematik und Freiräumen übernommen werden. Dabei endet die Suche und die realisierte
Baugruppe wird im Dokument gespeichert. Undo stellt den vorherigen Entwurf wieder her.
Änderungen machen die Übernahmefreigabe ungültig und entfernen die Baugruppendarstellung;
Undo kann den geprüften Zustand zurückholen. Die Detailvorschau verwendet jetzt OpenSCAD-Geometrie; konservative Prüfhüllen
sind separat zuschaltbar (siehe Ergänzung unten).

Abnahme: check-studio-model.mjs, check-studio-browser.mjs und
check-studio-s1-browser.mjs. Letzterer prüft echte Mausinteraktion mit dem 3D-Griff,
Undo/Redo, Dateiimport, Download, Übernahme und Neuladen im Browser.

Noch getrennt auszubauen: zusätzliche frei anlegbare Anschlüsse/Routen und deren
interaktive Auswahl, globale Mehrkettensuche sowie weitere CAD-Details der Kaufteile.
Die bestehende Mechanics-Ansicht bleibt verfügbar. Montage/Gehäuse bleiben später.

## Eigenständigkeit und Lizenz

Ein eigener Einstieg/Produktname löst keine Rechte an übernommenem Code ab.
LICENSE.md bezeichnet den Playground als GPL v2 oder neuer (Deployment GPL v3).
Die bestehenden Hinweise wurden nicht geändert. Der gegenwärtige Gesamtstand ist
nicht als proprietär freigegeben. Ein eigenständiges privates Repository ist separat
anzulegen; die aktuellen Studio-Änderungen werden nicht öffentlich gepusht.
Für ein proprietäres Produkt ist eine abgegrenzte Neuentwicklung bzw. Rechteklärung
und Prüfung der verbleibenden Abhängigkeiten nötig; insbesondere Browser-WASM ist
bei Auslieferung nicht einfach nur ein interner Serverprozess.

Quelle: https://www.gnu.org/licenses/gpl-faq.en.html

## Editor-Aufteilung und Auswahl (30.10.2026)

- Explorer und Suchkatalog links, 3D-Arbeitsfläche in der Mitte, Eigenschaften rechts,
  Suchergebnisse in einem eigenen scrollbaren Bereich unten. Projektaktionen oben,
  Rückmeldungen in der Statusleiste. Einstieg: http://localhost:4001/studio.
- Räume sind Linien mit acht Eckgriffen. Nur diese Ecken sind im Viewport anklickbar
  (11 Pixel Toleranz); Raumflächen und Kanten blockieren keine Anschlüsse. Anschlüsse
  haben beim Anklicken Vorrang. Alle Objekte sind auch im Explorer auswählbar.
- Position und XYZ-Drehung lassen sich im Inspector numerisch ändern, Raumgrößen
  zusätzlich skalieren. Räume können angelegt und entfernt werden. Diese Änderungen
  verwenden dieselbe Undo/Redo-Historie wie die 3D-Griffe.
- Der durchsuchbare Katalog liest die tatsächlichen Paarungsangebote aus der Registry.
  Familien können für die nächste Suche aktiviert/deaktiviert werden. Diese Auswahl
  gilt für die Sitzung; neue Katalogdatensätze werden hier noch nicht angelegt.
- Rechtsklick auf die gestrichelte Verbindung öffnet das Suchmenü. Alternativ startet
  die Schaltfläche im Ergebnisbereich. Suchbudget und Abbruch bleiben erreichbar.
- Geprüfte Treffer erscheinen während der Suche, sortierbar nach Hüllvolumen,
  Stufenzahl und Bauteilanzahl. Der erste Treffer wird automatisch als Detailgeometrie geladen;
  Ansehen wechselt die Vorschau, Übernehmen speichert sie als Baugruppe im Projekt.
  Änderungen an den Vorgaben verwerfen die alten Suchergebnisse.
- Zusätzlicher Browser-Regressionscheck: scripts/check-studio-editor-browser.mjs
  prüft Auswahl durch den Bauraum, Eckauswahl, Inspector/Undo, Katalogfilter und
  tatsächliche Suchfreigaben, Kontextmenü, Ergebnisvorschau, Übernahme und Layout.

Die oben genannten Grenzen bei Mehrfachrouten bleiben bestehen. Montage und generatives Gehäuse sind nicht Teil dieser Änderung.

## Detaillierte Studio-Vorschau (30.10.2026)

Suchtreffer und übernommene/importierte Baugruppen werden über mechanismCAD und den
bestehenden OpenSCAD-WASM-Worker als STL erzeugt und im Three.js-Viewport dargestellt.
Zahnräder und Wellen folgen den realen CAD-Generatoren inklusive Welttransformationen;
Riemen erscheinen als durchgehende Bänder mit Scheiben und Naben. GT2-Kaufteile bleiben
im bestehenden Generator vereinfacht, ohne exaktes Zahnprofil; die Oberfläche nennt
bei solchen Baugruppen diese Grenze. Keine neue Fertigungs- oder Montagefreigabe.

Die Detailberechnung läuft unabhängig von der Suche. Ladezustand, Fehler und erneutes
Laden stehen im Explorer. Beim Wechsel/Ändern wird der alte Worker beendet, verspätete
Antworten werden verworfen. Drei CAD-Ergebnisse werden für erneutes Anzeigen gepuffert.
Die Prüfhüllen sind standardmäßig aus und lassen sich zusätzlich einschalten.
Bauraum und jede einzelne Sperrzone haben eigene Sichtbarkeitsschalter. Ausgeblendete
Räume bleiben Teil der Solver-Vorgaben, sind aber im Viewport nicht anklickbar.
Sichtbarkeit ist eine Sitzungseinstellung und verändert weder Dokument noch Historie.

Abnahme zusätzlich: check-studio-detail-browser.mjs (echtes OpenSCAD-WASM für Stirnrad/
Welle und Zahnrad-Riemen-Verbund, Sichtbarkeit, Abbruch bei Änderung, Undo, Renderfehler
und erneutes Laden). Montage und Gehäuse bleiben ausdrücklich außerhalb dieses Schritts.

## Suche und explizite Zieltoleranzen (30.10.2026)

Die Suche verteilt einen Teil des Budgets auf gerichtete Startanordnungen aus echten
Katalogpaarungen. Familien, passende Übersetzungen, mehrere Stufenzahlen und positive/
negative Wellenebenen werden vor den zufälligen Restarts ausprobiert. Rein parallele
Ketten erhalten einen Reichweitentest; eine Verdrehung um die Achse erfordert keine
winkeländernde Paarung. Die Suche bleibt heuristisch, mit maximal acht Treffern.
Kein Treffer innerhalb eines Budgets ist ausdrücklich kein Unmöglichkeitsnachweis.
Die Ergebnisleiste nennt Treffer, Startlagen und verwendetes Budget.

Die kontinuierliche Optimierung darf axiale Sitze beidseits des Wellenursprungs
verschieben und den letzten Rotor axial verschieben sowie um die Wellenachse drehen.
Koaxialität bedeutet dabei gleiche Achsrichtung; eine Verdrehung um diese Achse ist
zulässig, eine Verkippung weiterhin nicht. Zahnphase und lokaler Montagerahmen sind
getrennte Größen. Kollisions-, Lagerraum- und Übersetzungsprüfungen bleiben bestehen.

Unter Ausgang → Zieltoleranz stehen Positionsradius (0–100 mm) und maximale Drehung
(0–45°). Standard ist jeweils null. Der Positionsradius ist eine euklidische Kugel,
keine separate +/- Toleranz je Koordinate. Bei Rahmenanschlüssen gilt der Winkel für
die vollständige Orientierung; bei importierten Achslinien-Anschlüssen gelten Abstand
zur Zielachse und Winkel der Achsrichtung. Nominalziel und Toleranzen bleiben erhalten;
der Solver verändert sie nicht. Die reale Lage entsteht aus der gefundenen Mechanik.
Die Ergebnisliste nennt tatsächliche und erlaubte Abweichung, die Vorschau zeigt ein
zusätzliches Achskreuz an der erreichten Ausgangslage und eine Verbindung zum Ziel.

Toleranzen sind Teil des validierten Graphen, der Undo-Historie und des JSON-Projekts.
Übernahme verweigert Kandidaten mit anderen Toleranzvorgaben. Bauraum, Sperrzonen,
Mindestabstände und Sollübersetzung werden dadurch nicht aufgeweicht. Toleranzen
beschreiben Konstruktionsfreiheit, keine Fertigungsgenauigkeit oder elastische Verformung.

Neue Checks: check-studio-search-regressions.mjs (Standardvarianten, 90° um X/Y,
90° Verdrehung um Z, versetztes Hindernis), check-target-tolerance.mjs (exakter
Katalog-Nichttreffer vs. zulässige Annäherung, Grenzen und Übernahme) und
check-studio-tolerance-browser.mjs (Bearbeitung, Undo/Redo, Ergebnisabweichung,
Übernahme und Neuladen). Montage und generatives Gehäuse bleiben später.

## Drei nahe Kandidaten trotz Zielverfehlung

Studio fordert zusätzlich die bis zu drei nächsten gefundenen Ziel-Nichttreffer an.
Sie werden während der Suche aktualisiert und als eigene, bernsteinfarbene Gruppe
mit „Ziel nicht erreicht“ angezeigt. Positions- und Winkelabweichung sowie die
jeweiligen erlaubten Werte bleiben sichtbar. Die Sortierung verwendet die euklidische
Kombination der Toleranzüberschreitungen: Millimeter Positionsfehler und Winkel als
Bogenlänge bei 30 mm Bezugsradius. Keine globale Optimalitätsgarantie.

Nur output/terminal darf fehlschlagen: Eingang, Paarungen, Übersetzung, Bauraum,
Sperrzonen und reservierte Freiräume müssen die bisherigen Prüfungen bestehen.
Die Kandidaten können angesehen, aber nicht als gültige Lösung übernommen werden.
Die CAD-Vorschau verwendet eine geprüfte Kopie mit dem tatsächlich erreichten Ziel;
das Original mit der verfehlten Vorgabe bleibt unverändert. Suchabbruch erhält die
bereits gefundenen Kandidaten, Änderungen an Vorgaben verwerfen sie.

Abnahme: check-near-misses.mjs; check-studio-near-browser.mjs (echter Worker,
Warnkennzeichnung, keine Übernahme, OpenSCAD-Vorschau und Verwerfen bei Änderung).

## Wiederverwendung des getriebenen Rads zwischen Stufen

Auch gerichtete Katalog-Startanordnungen und kurze übernommene Ketten prüfen jetzt
connectionVariants: Das getriebene Rad einer Stufe kann unmittelbar das antreibende
Rad der Folgestufe sein. Beide Paarungsrelationen referenzieren dieselbe Element-ID,
sodass die CAD-Ausgabe das Rad genau einmal erzeugt. Die kompakte Variante wird vor
der Alternative mit getrennten Rädern geprüft; die Ergebnisrangfolge berücksichtigt
zunächst die Elementzahl. Die Studio-Sortierung nach Bauraum/Stufen/Bauteilen bleibt.

Die gerichtete Katalogauswahl reserviert zusätzlich eine Kombination mit kompatiblen
Anschlussrädern, statt nur die ersten zwei beliebigen Übersetzungsfolgen zu betrachten.
Wiederverwendung erfordert die explizite sharedRotor-Freigabe beider Paarungsprovider,
identische Familie und vollständige Katalogparameter sowie einen geeigneten gemeinsamen
Träger. Beide Eingriffe, Zahnphasen, Endanschlüsse und Freiräume werden erneut geprüft.
Unterschiedliche Zähnezahlen oder Familien werden nicht zusammengelegt. Getrennte
Räder bleiben zulässig, wenn die räumliche Anordnung verschiedene Ebenen erfordert.

Abnahme: check-shared-output-gear.mjs prüft eine kalte Suche mit drei statt vier
Zahnrädern, drei CAD-Elementen, unveränderten Anschlüssen/Übersetzung und gültigen
Freiräumen sowie die Ablehnung unpassender Zusammenlegungen. Bestehende Verbund- und
Mehrstufentests prüfen weiterhin Alternativen mit getrennten Rädern.
