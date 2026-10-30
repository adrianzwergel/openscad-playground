# Gemeinsames Komponentenmodell

## Datenfluss
`model.ts` enthält den versionierten Katalog und die Projekt-Typen. `resolveProject` berechnet
Anschlüsse, Zahnphasen, Drehzahlen und Prüfungen. `generateScad` verwendet dieselben Instanzen.
Prolog erhält seine Fakten aus `solverCatalog()`. Geometrie und Regeln sind damit zentral definiert.

## Umfang und Koordinaten
- Zwei bis sechs gerade außenverzahnte Stirnräder ohne Profilverschiebung als unverzweigte Kette.
  Die Suche erzeugt bis zu vier Räder; manuelle Dateien können bis zu sechs enthalten.
- Katalog `mechanics10-spur-1`: Modul 2 oder 3, 20/30/40/50 Zähne, 20° Eingriffswinkel,
  10 mm Zahnbreite, 5,1 mm Bohrung, 0,15 mm Backlash als ungeprüfte Demo-Vorgabe.
- Position `[x,y,z]` in mm bezeichnet die Zahnradmitte. Wellenachsen sind parallele +Z-Geraden.
- `shaft`: Bohrungsanschluss mit Weltposition, Achse und Bohrungsdurchmesser.
- `teeth`: Außenverzahnung mit Position, Achse, Modul, Eingriffswinkel, Teilkreisradius und Breite.
- Eingang/Ausgang referenzieren shaft-Ports; Verzahnungen verbinden teeth-Ports.
- `rigid-shaft` verbindet zwei shaft-Ports auf derselben XY-Achse mit axialem Freiraum.

## Regeln
Verzahnungspaare benötigen gleichen Modul/Eingriffswinkel, gleiche Mittelebene und den
Achsabstand als Summe ihrer Teilkreisradien (Vergleichstoleranz 1e-6 mm, keine Fertigungstoleranz).
Drehzahl und Zahnphase werden entlang der Kette berechnet; starre Verbindungen übertragen 1:1.
Die Auflösung prüft feste Anschlussachsen, Ebenengrenzen, nicht kämmende Hüllkörper und
Wellen-/Nabenkorridore. Fehler verhindern den Geometrieexport. Lager, Gehäuse und Montage
bleiben unbekannt. Details und Suchgrenzen: [SPATIAL-SEARCH.md](SPATIAL-SEARCH.md).

## Projektdatei
JSON: `format: mechanics10`, `version: 5`, `catalogVersion: mechanics10-spur-1`.
Gespeichert werden Name, Soll-Untersetzung, Komponenten-IDs, Katalogreferenzen, Positionen,
Eingang/Ausgang, Verbindungen, feste Achsen (`axes`) und Suchvorgaben (`search`).
Berechnete Werte, Code, Worker-Zustand, Meshes und Blob-URLs werden nicht gespeichert.
Unbekannte Zusatzfelder werden verworfen; unbekannte Format-/Katalogversionen, Bauteile oder
Anschlussreferenzen abgelehnt. Der Parser prüft Zahlen, Grenzen, IDs und eine unverzweigte Kette.
Strukturell gültige Projekte mit geometrischen Regelverletzungen dürfen zur Korrektur geladen
und gespeichert werden, sind bis zur Korrektur aber nicht renderbar.

Version-1-Dateien werden beim Laden migriert: Achsen aus den bisherigen Anschlusspositionen,
Standardsuchvorgaben, anschließend Speicherung als Version 5. Auch Versionen 2 und 3 werden
in Version 5 übernommen. Der localStorage-Schlüssel bleibt
`mechanics10.project.v1`, damit vorhandene Projekte automatisch gefunden werden.

`Lokal speichern` speichert einen Projektstand im localStorage der jeweiligen Browser-Origin.
Dev-Port 4000 und Vorschau-Port 4001 sind verschiedene Origins. JSON-Export/Import dient dem
Austausch und der Ablage mehrerer Projekte. Keine automatische Speicherung: Neues Projekt
und Dateiimport ersetzen den Arbeitsstand; der Speicherstand bleibt bis zum expliziten Speichern.
Bei Änderungen werden Vorschau, STL-Link und Suchergebnisse verworfen. Bei Auswahl einer
Suchlösung bleibt die Vergleichsliste für dieselben Suchvorgaben erhalten. Defekte Importe
lassen den Arbeitsstand unangetastet. Defekter Speicher wird gemeldet und nicht überschrieben.

## Beispiele und Prüfung
`examples/mechanics-pair.json` zeigt die Migration eines Version-1-Paares entlang Y.
`examples/mechanics-compound.json` enthält ein Version-2-Doppelzahnradgetriebe mit 4:1.

`node scripts/check-model.mjs`: Roundtrip, Anschlüsse, Phasen, Abstände, alle Katalogpaare,
fehlerhafte Dateien. `node scripts/check-search.mjs`: räumliche Suche und Migration.
`node scripts/check-project-browser.mjs`: manuelles Rendern, lokale Wiederherstellung,
tatsächlicher JSON-Download/Import, unbekannte Version, inkompatible Module, veraltete
Ergebnisse und defekter Speicher. Such-/Renderablauf: `node scripts/check-search-browser.mjs`.

## Erweiterung Etappe D
Optionale Gehäuseparameter `housing` bleiben im Projekt erhalten (eingeführt in Version 2). Fehlende Werte
verwenden das Standardprofil. `housing.ts` ergänzt Lager, Platten, Naben, Hülsen und Hardware
als abgeleitete Konstruktion. Gehäusefehler blockieren dessen STL-Export, nicht die bisherige
Verzahnungsansicht. Konstruktion und Grenzen: [HOUSING.md](HOUSING.md).

## Projektformat 3 / Etappe E
Version 3 führte `motion` ein; aktuell wird als Version 5 gespeichert. Das optionale
`motion`-Objekt aktiviert eine Riemen-, Spindel- oder Rack-Vorlage;
die Stirnradkomponenten bleiben erhalten, bilden aber keine automatisch angekoppelte Kette.
Die Anschlüsse unterscheiden Wellenrotation und linearen Hub, mit passenden Einheiten.
Details, Maßvorlagen und Grenzen: [MOTION.md](MOTION.md).

## Projektformat 4 / Etappe F
Das optionale `spatial`-Objekt aktiviert Innenverzahnung (`internal`), Kegelräder (`bevel`)
oder Schneckenpaare (`worm`). Es enthält `teeth`, `starts`, `clearance` und `phase`.
`motion` und `spatial` dürfen nicht gleichzeitig gesetzt sein. Die Stirnradkette bleibt
als inaktiver Arbeitsstand erhalten; ihre festen Achsen bestimmen diese Vorlagen nicht.
`resolveSpatial` leitet eigene Weltanschlüsse, endliche Wellen, Übersetzung, Rotationshüllen
und Prüfungen ab. `spatialCAD` verwendet dieselben Maße für Baugruppe und Einzelteile.
Beispiele: `examples/mechanics-internal.json`, `mechanics-bevel.json`, `mechanics-worm.json`.
Katalog, Achskonventionen und Montage: [SPATIAL-PAIRS.md](SPATIAL-PAIRS.md).

## Projektformat 5 / gemischte Ketten
`mixed` speichert feste Ein-/Ausgangsachsen, Soll-Untersetzung, Toleranz, erlaubte
Oberstufe, axialen Platzierungsbereich und optional die gewählte Kette mit Position.
`motion`, `spatial` und `mixed` schließen sich gegenseitig aus. Auch Version 4 wird
migriert. Konstruktion und Suchraum: [MIXED-SEARCH.md](MIXED-SEARCH.md).
