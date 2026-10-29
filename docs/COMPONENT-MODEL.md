# Gemeinsames Komponentenmodell – Etappe B

## Datenfluss
`model.ts` enthält den versionierten Katalog und die Projekt-Typen. Die Oberfläche bearbeitet
das Projekt, `resolveProject` berechnet Anschlüsse und Paarungsprüfung. `generateScad` verwendet
exakt diese aufgelösten Instanzen. Der Prolog-Worker erhält Katalogfakten aus `solverCatalog()`;
Zähnezahlen und Modulwerte werden nicht mehr separat in Prolog gepflegt. Die Paarungsbeziehung
ist eine explizite Verbindung zwischen den `teeth`-Ports zweier Instanzen.

## Umfang und Koordinaten
- Genau zwei unverschobene, gerade außenverzahnte Stirnräder, eine Paarung.
- Katalog `mechanics10-spur-1`: Modul 2 oder 3; 20/30/40/50 Zähne; 20° Eingriffswinkel;
  10 mm Zahnbreite; 5,1 mm Bohrung; 0,15 mm Backlash als ungeprüfte Demo-Vorgabe.
- Position `[x,y,z]` in mm beschreibt die Zahnradmitte. Beide Wellenachsen zeigen nach +Z.
  Keine frei orientierten Achsen in Etappe B. Zahnstellung in Grad wird aus der Verbindungslinie
  der beiden Mittelpunkte abgeleitet, damit manuell gedrehte XY-Anordnungen passend rendern.
- `shaft`: Bohrungsanschluss mit Weltposition, Achse und Bohrungsdurchmesser.
- `teeth`: Außenverzahnung mit Weltposition, Achse, Modul, Eingriffswinkel, Teilkreisradius und Breite.
- Eingang und Ausgang referenzieren `shaft`. Die Paarung referenziert `teeth`.

## Regeln
Modul und Eingriffswinkel müssen übereinstimmen. Achsabstand = Summe der Teilkreisradien
(numerische Vergleichstoleranz 1e-6 mm, keine Fertigungstoleranz). Die Zahnbreiten müssen
axial überlappen. Ist-Untersetzung = Ausgangszähne / Eingangszähne; Drehsinn gegenläufig.
Fehler verhindern den Geometrieexport. Lagerung, Gehäuse, Fertigung, Montage und vollständige
Kollisionserkennung bleiben ausdrücklich `unknown`, auch wenn die Paarungsregeln erfüllt sind.

`Ausgang passend auf +X anordnen` ist ein ausdrücklicher Bearbeitungsschritt. Die manuelle
Vorschau korrigiert Positionen nicht. Die Prolog-Suche ist weiterhin die einfache Suche aus
Etappe A: sie ersetzt beide Katalogzuweisungen und setzt den Ausgang relativ zum unveränderten
Eingang auf +X. Sie löst noch keine festen Eingangs-/Ausgangspositionen (Etappe C).
Sortierung: relativer Übersetzungsfehler, Achsabstand, Zähnezahlen, Katalogindizes.

## Projektdatei
JSON, `format: mechanics10`, `version: 1`, `catalogVersion: mechanics10-spur-1`.
Gespeichert werden Name, Soll-Untersetzung, Komponenten-IDs und Katalogreferenzen, Positionen,
Eingang/Ausgang und Verbindungen. Berechnete Werte, Worker-Zustand, Code, Meshes und Blob-URLs
werden nicht gespeichert. Unbekannte Zusatzfelder werden beim Einlesen verworfen; unbekannte
Format-/Katalogversionen, Bauteile oder Anschlussreferenzen werden abgelehnt.
Der Parser validiert Zahlen, Grenzen, IDs und Paarungsstruktur und rekonstruiert ein neues Objekt.
Strukturell gültige Projekte mit falschen Achsabständen dürfen gespeichert und zur Korrektur
geladen werden. Diese Projekte können bis zur Korrektur nicht gerendert werden.

`Lokal speichern` speichert einen Projektstand im localStorage dieser Browser-Origin.
Er wird beim Öffnen wiederhergestellt. Dev-Port 4000 und Vorschau-Port 4001 sind verschiedene
Origins. JSON-Export/Import dient dem Austausch und der Ablage mehrerer Projekte.
Keine automatische Speicherung: `Neues Projekt` und Dateiimport ersetzen nur den Arbeitsstand;
der lokale Speicherstand bleibt bis zum nächsten expliziten Speichern erhalten.
Bei jeder Änderung werden Vorschau und STL-Link verworfen. Defekte Importe lassen den
Arbeitsstand unangetastet. Defekter lokaler Speicher wird gemeldet und nicht automatisch überschrieben.

## Beispiel
`examples/mechanics-pair.json` lässt sich über `JSON öffnen` importieren und direkt rendern.
Es zeigt zwei Räder entlang Y, um die Trennung von Instanzposition und Standardanordnung zu zeigen.

## Prüfung
`node scripts/check-model.mjs`: Roundtrip, Anschlüsse, XY-Phase, Achsabstände, axiale Überdeckung,
alle Katalogpaare und fehlerhafte Projekte.
`node scripts/check-project-browser.mjs`: manuelles Rendern, lokale Wiederherstellung, tatsächlicher
JSON-Download/Import, unbekannte Version, inkompatible Module, veraltete Ergebnisse und defekter Speicher.
