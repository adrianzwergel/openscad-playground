# Mechanics-10: Entwicklungsplan

Stand: 2026-10-30. Zunächst Geometrie und Kinematik, keine Kraft- oder Tragfähigkeitsauslegung.

## Aktueller Stand
Etappe B abgeschlossen: versionierter Katalog, Komponenteninstanzen, Wellen-/Verzahnungsports,
explizite Paarungsbeziehungen, manuelle XYZ-Positionierung bei parallelen +Z-Achsen,
gemeinsame Geometrieauflösung und Paarungsprüfung. Projekte werden lokal gespeichert und
als validierte JSON-Dateien importiert/exportiert. Siehe COMPONENT-MODEL.md.
Modelltests, TypeScript, Produktionsbuild und Browser-Tests bestanden.

Etappe A abgeschlossen: Prolog/WASM (Laufzeit 10.1.19, einschließlich CLP(FD)) sucht ein
Zahnradpaar, OpenSCAD/WASM erzeugt BOSL2-Geometrie, GLB-Vorschau und STL im Browser.
Produktionsbuild, TypeScript und Chrome-Browsertest bestanden. Abbruch beider Worker und
Wiederanlauf getestet. Beispiel Soll 2,1: Ist 2,0 mit 20/40 Zähnen, 60 mm Achsabstand.
Keine mechanische Montage- oder Kollisionsvalidierung in diesem technischen Durchstich.

## Architektur
Lokale Ableitung von openscad/openscad-playground, Basis-Commit
012111f06bb6d8dac2b8d30318512494d87d6932, Remote `upstream`, Branch `mechanics10`.
GitHub-Fork: https://github.com/adrianzwergel/openscad-playground (Remote `origin`).
React/TypeScript orchestriert ein versioniertes Projektmodell;
SWI-Prolog/WASM sucht diskrete Kombinationen in einem Worker, TypeScript berechnet Positionen,
OpenSCAD/WASM erzeugt Geometrie in einem separaten Worker. Keine serverseitige Berechnung nötig.
Langfristig eigene Three.js-Baugruppenansicht, zunächst vorhandener model-viewer und OFF/GLB-Konvertierung.
GPL-Hinweise des Originals erhalten. Abhängigkeiten und Geometriebibliotheken versionieren.

## Anforderungen
- Eingang: Wellenachse mit Position, Richtung und optionalem erlaubtem Positionsbereich.
- Ausgang: Wellenachse oder Verfahrachse mit Hub. Feste Vorgaben nicht automatisch verschieben.
- Soll-Untersetzung und Ist-Untersetzung getrennt; linearer Ausgang in mm/Eingangsumdrehung.
- Drehrichtung, erlaubte Komponenten, Stufen, Ebenen, Bauraum und maximale Abweichung.
- Katalog: Stirnräder, starre Doppel-/Mehrfachräder, Innenverzahnung, Kegelräder,
  Schnecke/Schneckenrad, Ritzel/Zahnstange, Zahnriemen und Spindel/Mutter.
- Jede Getriebewelle konstruktiv beidseitig lagern; Komponentenpaket zunächst zwischen Lagerstellen.
  Lagerbreite, Sicherungen, Schultern und Montagewege berücksichtigen. Spindel mit geeigneter
  axialer Abstützung und separat geführter, gegen Mitdrehen gesicherter Mutter.
- Zahnriemen zunächst offen über zwei Scheiben, mit verfügbaren Längen und Spannmechanismus.
- Abstände getrennt für Bewegung/Gehäuse, unabhängige Teile, Ebenen, Riemen und Montage.
  Passungen und vorgesehene Verzahnungskontakte sind eigene Beziehungen, keine pauschalen Ausnahmen.
- Hüllkörper für schnelle konservative Prüfungen; detaillierte Prüfung ausgewählter Lösungen.
  Bewegungsräume berücksichtigen; Stichproben sind kein vollständiger Kollisionsnachweis.
- Gehäuse zuerst aus zwei Lagerplatten, Abstandshaltern und abnehmbarer Abdeckung.
- Solver und Geometrie nutzen dieselben berechneten Maße. Ergebnisse: erfüllt/verletzt/ungeklärt.

## Etappen und Abnahme
A. Technischer Durchstich: Browser lädt Prolog und OpenSCAD; Prolog sucht Zahnradpaar,
   OpenSCAD erzeugt es; Vorschau und STL; Abbruch und Wiederanlauf; reproduzierbare Abhängigkeiten.
B. Gemeinsames Modell: Katalog, Anschlüsse, Paarungsregeln, speicherbare Projektdatei;
   manuell angeordnetes Stirnradpaar mit konsistenten Maßen.
C. Räumliche Suche: parallele Wellen, Zwischen- und Doppelzahnräder, höchstens zwei Ebenen;
   feste Anschlüsse eingehalten; unerfüllbare Vorgaben erklärt.
D. Konstruktiver MVP: beidseitige Lagerung, Sicherungen, Gehäuse, Freiräume, Montageansicht,
   Stückliste und Einzelteil-STLs. Ein Muster drucken und tatsächlich montieren.
E. Riemen und Linearachsen: Riemenlänge/Spannweg, Spindel/Mutter und Zahnstange,
   geführter Schlitten und Hubprüfung.
F. Räumliche Paarungen: Innenverzahnung, Kegelräder, Schneckenpaare mit Lager-/Gehäusevorlagen.
G. Webprodukt: Anschlusseditor, Variantenvergleich, Animation, Explosionsansicht,
   Import/Export und statische Veröffentlichung.

## Etappe A: Grenzen
Nur einstufige Stirnradpaare, Modul 2, 20 Grad, Zähne 20/30/40/50, ohne Profilverschiebung.
Prolog wählt minimale relative Übersetzungsabweichung, dann minimale Summe der Zähne.
Achsabstand wird daraus abgeleitet, nicht als feste Vorgabe gelöst. 5,1-mm-Bohrung und
0,15-mm-Backlash sind Demo-Parameter, keine validierten Fertigungsempfehlungen.
Keine Lager, kein Gehäuse, keine Kollisions-/Montagefreigabe. STL enthält beide Räder.
