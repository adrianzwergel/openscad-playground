# Mechanics-10: Entwicklungsplan

Stand: 2026-10-30. Zunächst Geometrie und Kinematik, keine Kraft- oder Tragfähigkeitsauslegung.

## Aktueller Stand
Begrenzte räumliche Graphsuche begonnen: feste Zielrahmen, gemeinsame Wellen,
Stirnrad-/Kegelradprovider und explizite Budgetzustände. Zweistufige Referenzen geprüft;
drei/vier Stufen experimentell, konstruktive Kollisions-/Lagerprüfung noch offen.
Siehe [GRAPH-SEARCH.md](GRAPH-SEARCH.md). Generative Gehäuse bleiben zurückgestellt.

H1 implementiert, H2 begonnen: erweiterbarer Element-/Relationsgraph, gemeinsame Wellen,
Quaternion-Rahmen, gerichtete feste Anschlüsse, Registry-Vertrag für Übertragungen,
Umläufe und Gelenke. Erste Stirnrad-/Kegelradadapter, analytische Lagevorschläge und
Browser-Referenzaufbau mit drei Wellen. Noch kein allgemeiner Autorouter.
Details und Grenzen: [ELEMENT-GRAPH.md](ELEMENT-GRAPH.md).

**Prioritätskorrektur:** Suche und räumliche Anordnung zuerst ausreifen, inklusive
Familienerweiterungen, Lager-/Montageplatz und Hindernissen. Generative Tragstrukturen
(H5) und Topologieoptimierung (H7) werden hinter diese Arbeiten einschließlich H6 gestellt.
„Näher zum Ziel“ ist keine vorgegebene Heuristik; Suchverfahren werden nach Eignung gewählt.

**Neue Zielrichtung, nur geplant:** Freie räumliche Getriebesynthese aus einzelnen
Paarungen und gemeinsam belegten Wellen statt weiterer verketteter Fertigmodule.
Freie Anschlussrahmen, Suchräume/Hindernisse, Montage und eine aus Mountings abgeleitete
Tragstruktur gehören zum neuen Konzept. Architektur, fehlende Grundlagen und Etappen
H1–H7: [TRANSMISSION-SYNTHESIS-3D.md](TRANSMISSION-SYNTHESIS-3D.md).
Der ursprüngliche Architekturplan wurde ohne Codeänderung erstellt; der Stand der
inzwischen begonnenen Umsetzung ist oben und in ELEMENT-GRAPH.md dokumentiert.

Gemischte Kettensuche ergänzt: Schnecke → Stirnräder oder GT2, diskrete Prolog-Suche,
analytische Platzierung entlang einer festen Eingangsachse und feste Ausgangsachse.
Getrennte Lagerungen, koaxiale Kupplung, gemeinsame Gehäusebrücke, Montageansicht und
STL-/ZIP-Export. Projektformat 5. Begrenzte Zweistufenfamilien; allgemeine Graphsuche
und physische Abnahme bleiben offen. Siehe [MIXED-SEARCH.md](MIXED-SEARCH.md).

Etappe G: Browser-Werkbank für Anschlussvorgaben, schematische Live-Kinematik mit
Projektionsansichten, persistente Variantenablage mit JSON-Austausch und erweiterte
CAD-Explosionsansichten implementiert. Fertigungsteile bleiben von Ansichtszuständen
unberührt. Freie Baugruppenkopplung, animierte CAD-Zahngeometrie und öffentliche
Bereitstellung bleiben offen. Bedienung und Tests: [WORKBENCH.md](WORKBENCH.md).

Etappe F als Softwareentwurf implementiert: Innenverzahnung, 90°-Kegelräder und rechtwinklige
Schneckenpaare mit Katalogvarianten, expliziten Portachsen, radialer/axialer Lagerung,
abnehmbaren Gehäusen und Einzelteil-/ZIP-Export. Rotationshüllen und endliche Wellen werden
geprüft; OpenSCAD-Schnittproben ergänzen die Prüfung. Projektformat 4 migriert Versionen 1–3.
Eigenständige Vorlagen, noch keine gemischte Kettensuche. Hohl-/Kegelräder sind rückseitig
zweifach und überhängend gelagert; physische Abnahme offen. Siehe [SPATIAL-PAIRS.md](SPATIAL-PAIRS.md).

Etappe E als Softwareentwurf implementiert: GT2-Kataloglängen mit exakter Teilkreislänge und
freigegebenem Stellweg; separat geführte TR8-/Zahnstangenachsen, vollständige Bewegungshüllen,
Sperrraumprüfung, Montagevorlagen und Einzelteil-/ZIP-Exporte. Projektformat 3 migriert ältere
Projekte. Drei eigenständige Vorlagen, noch keine automatische Suche gemischter Ketten.
Physische Abnahme und Lastauslegung bleiben offen. Siehe [MOTION.md](MOTION.md).

Etappe D als Softwareentwurf implementiert: zwei Lager je Welle, zwei abnehmbare Lagerplatten,
Abstandshalter, Nabenfixierung und axiale Hülsen, Freiraumprüfungen, Montageansicht,
Stückliste und Einzelteil-STLs/ZIP. Der reale Druck-/Montageversuch ist noch offen;
Etappe D ist deshalb konstruktiv noch nicht abgenommen. Siehe [HOUSING.md](HOUSING.md).

Etappe C abgeschlossen: feste parallele Anschlussachsen, vier Kettenvorlagen mit Zwischen-
und Doppelzahnrädern, bis zu zwei Ebenen, konservative Freiraumprüfung, Variantenvergleich
und Projektformat 2 mit Migration. Prolog enumeriert, ein TypeScript-Worker positioniert.
Grenzen, Beispiel und Abnahme: [SPATIAL-SEARCH.md](SPATIAL-SEARCH.md).
Modell-/Suchtests, TypeScript, Produktionsbuild und Browserprüfungen bestanden.

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
