# Etappe G: Konfiguration und Prüfung im Browser

Die gemeinsame Werkbank oberhalb der CAD-Vorlage verbindet Anschlusseditor,
kinematische Ansicht und eine Variantenablage. Sie unterstützt Stirnradketten,
Riemenantriebe, Spindel-/Zahnstangenachsen und die räumlichen Paarungen aus Etappe F.

## Anschlüsse

Eingang oder Ausgang über das Auswahlfeld oder den Port in der Grafik auswählen.
Die Tabelle zeigt Weltpositionen in mm und normierte Achsrichtungen.
Bei Stirnradketten lassen sich die festen XYZ-Anschlussvorgaben bearbeiten.
XY verschiebt auch das zugehörige Endrad; Eingangs-Z verschiebt die bestehenden Ebenen.
Ausgangs-Z definiert die geforderte Ausgangsebene. Anschließend neu suchen oder die
Komponentenpositionen korrigieren; geometrisch unpassende Vorgaben bleiben als Fehler sichtbar.

Bei Riemen sind Nenn-Achsabstand und Spannweg editierbar, bei Linearachsen der Hub.
Die Führungslänge wird bewusst nicht stillschweigend geändert: Die Prüfung zeigt an,
ob sie zum neuen Hub passt. Bei räumlichen Paaren werden die Anschlüsse aus Zähnezahl
und Gangzahl im Vorlageneditor abgeleitet. Freie Richtungsänderungen oder das Verbinden
beliebiger Baugruppen sind noch nicht möglich.

## Bewegung und Ansicht

Die interaktive SVG-Ansicht zeigt schematische Teilkreise, Wellenrichtungen und bei
Linearachsen den Schlitten auf seiner Bahn. Auswahl zwischen Isometrie, XY, XZ und YZ.
Start/Pause, Winkelregler, Rücksetzen und vorzeichenbehaftete Geschwindigkeit wirken
ohne OpenSCAD-Neuberechnung. Stirnradgeschwindigkeiten stammen aus der aufgelösten
Kette einschließlich starrer Doppelräder, räumliche Paare aus ihren Port-Winkelfaktoren.
Bei Linearachsen folgt der Weg dem Vorschub pro Umdrehung; an den Hubenden erfolgt
ein schematischer Rücklauf. Die eingestellte Vorschauposition ist der Startpunkt.

Diese Ansicht ist keine animierte CAD-Zahngeometrie und kein Kollisionsnachweis.
Die schematische Explosion versetzt Rotoren entlang ihrer Achsen beziehungsweise
hebt den Schlitten an. Anschlüsse bleiben zur Orientierung in Einbaulage.
Animation stoppt bei Projektänderungen und während CAD-Berechnungen; sie verändert
weder Projektparameter noch den gespeicherten Projektstand.

Die genaue OpenSCAD-Vorschau bleibt separat verfügbar. Zusätzlich zur bestehenden
Stirnrad-Explosionsansicht gibt es:

- Räumliche Paare: alle sechs Gehäuseplatten entlang ihrer Normalen absetzen,
  einstellbar von 0 bis 80 mm. Lager und Wellen bleiben in Einbaulage.
- Riemen: Grundplatte nach unten und obere Lagerplatten nach oben absetzen.
- Linearachsen: Grundplatte absenken, Führungsträger und Schlitten-Enddeckel seitlich
  absetzen. Kaufteile bleiben in Einbaulage.

Nach Änderung des CAD-Explosionsabstands die Vorschau neu erzeugen. Das ist eine
Montageübersicht, keine berechnete kollisionsfreie Ausbau-Trajektorie.
Explosionswerte sind reine Ansichtszustände: Einzelteil-STLs, Stücklisten, Passungen
und Prüfergebnisse bleiben unverändert.

## Varianten vergleichen

„Aktuellen Stand merken“ speichert eine unabhängige Kopie des gesamten Projekts.
Bis zu acht Stände bleiben unter `mechanics10.variants.v1` im localStorage erhalten.
Die Tabelle vergleicht Vorlage, Ist-Untersetzung beziehungsweise Vorschub, wesentliche
Geometrieparameter sowie verletzte und offene Regeln. :1 und mm/U werden getrennt
beschriftet und nicht in einer gemeinsamen Rangfolge bewertet. Die vorhandene
Solver-Vergleichsliste mit Sortierung bleibt für automatisch gesuchte Stirnradketten erhalten.

„Übernehmen“ ersetzt den aktuellen Arbeitsstand, ohne die gemerkte Kopie zu verändern.
Zum dauerhaften Wiederöffnen als aktives Projekt weiterhin „Lokal speichern“ verwenden.
Einzelne Varianten lassen sich entfernen. JSON-Export/Import überträgt die gesamte Ablage;
Import ersetzt sie nach erfolgreicher Prüfung. Maximal acht Projekte und 800 KB.
Ungültige Importe ändern die Ablage nicht. Defekter lokaler Speicher wird gemeldet und
beim Laden nicht überschrieben. Aktuelles Projektformat ist Version 5, Varianten sind ein Array
solcher Projektdateien; ältere Versionen werden migriert. Die Ablage ist wie der Projektspeicher an den Browser-Origin gebunden.

## Prüfung und Grenzen

`node scripts/check-workbench.mjs`: unabhängige Kopien, Importgrenzen, Einheiten,
Portachsen, kinematische Transformationen und identische Fertigungsteile trotz Explosion.
`node scripts/check-workbench-browser.mjs`: Anschlussbearbeitung, alle Vorlagen,
Winkelverhältnisse, linearer Vorschub, Start/Pause, echte CAD-Explosionsvorschauen,
Speichern/Wiederherstellen, JSON-Download/Import, Ablehnung defekter Dateien und Speicherfehler.
Die bisherigen Modell-, Such-, Projekt-, Motion- und Spatial-Browsertests bleiben relevant.

Nicht enthalten sind allgemeine Kopplung mehrerer Baugruppen, freie 3D-Portausrichtung,
automatische Montagepfadplanung und physische Funktionsabnahme. Die öffentliche Bereitstellung
aus dem ursprünglichen Etappe-G-Plan ist mit dieser lokalen Browser-Erweiterung nicht erfolgt.
