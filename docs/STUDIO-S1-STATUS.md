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
Undo kann den geprüften Zustand zurückholen. Die aktuelle Darstellung sind weiterhin
konservative Hüllen, kein detaillierter CAD-Renderer.

Abnahme: check-studio-model.mjs, check-studio-browser.mjs und
check-studio-s1-browser.mjs. Letzterer prüft echte Mausinteraktion mit dem 3D-Griff,
Undo/Redo, Dateiimport, Download, Übernahme und Neuladen im Browser.

Noch getrennt auszubauen: zusätzliche frei anlegbare Anschlüsse/Routen und deren
interaktive Auswahl, globale Mehrkettensuche sowie genaue CAD-Vorschau im Studio.
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
  Stufenzahl und Bauteilanzahl. Der erste Treffer wird als Prüfhülle angezeigt;
  Ansehen wechselt die Vorschau, Übernehmen speichert sie als Baugruppe im Projekt.
  Änderungen an den Vorgaben verwerfen die alten Suchergebnisse.
- Zusätzlicher Browser-Regressionscheck: scripts/check-studio-editor-browser.mjs
  prüft Auswahl durch den Bauraum, Eckauswahl, Inspector/Undo, Katalogfilter und
  tatsächliche Suchfreigaben, Kontextmenü, Ergebnisvorschau, Übernahme und Layout.

Die oben genannten Grenzen bei Mehrfachrouten und detaillierter CAD-Darstellung
bleiben bestehen. Montage und generatives Gehäuse sind nicht Teil dieser Änderung.
