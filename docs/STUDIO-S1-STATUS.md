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
