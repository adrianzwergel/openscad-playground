# Aufbau: Teile-Store, Platzieren und Projektdateien

Der Aufbau ist eine eigene Schicht über dem bestehenden Kern. Mechanismen, Lager, Struktur und Gehäuse bleiben
unverändert; sie sollen später von hier aus angesprochen werden.

## Stand

| Schritt | Inhalt | Stand |
|---|---|---|
| 1 | Katalog, Platzieren, Bodenplatte, Projektdateien | fertig |
| 1b | Freie Lage im Raum, Teile am Modell, Platte als Element | fertig |
| 2 | Clip-Generator als weiterer Halter | offen |
| 3 | Zahnräder im Store, Übersetzung in das Mechanismus-Format | offen |
| 4 | Lage als Bereich oder Auto, das Tool sucht die Plätze | offen |
| 5 | Automatische Gehäuse, Getriebe-Vorschläge | offen |

## Katalog (`src/mechanics/parts/catalog.ts`)

Alles, was man platzieren kann, hat dasselbe Format `Part`: Maße, Hülle (`box`), Löcher, Stecker, Quelle.

- **Teilframe:** z = 0 ist die Fläche, mit der das Teil montiert wird (Unterseite der Platine, Flansch des Motors),
  x und y sind mittig. `body` sagt, auf welcher Seite dieser Fläche der Körper liegt.
- **Import:** `scripts/parts/import-nopscadlib.mjs` liest die Tabellen von NopSCADlib (GPL-3.0, auf einen Commit
  gepinnt) mit OpenSCAD selbst aus und schreibt `nopscadlib.generated.ts` sowie je ein STL nach
  `public/mechanics-assets/parts/`. Die Hülle kommt aus dem gerenderten Modell und enthält daher auch, was über die
  Platine hinausragt. Neue Teile: Typ in die Listen des Skripts eintragen und das Skript laufen lassen.
- **Von Hand:** Teile, die NopSCADlib nicht hat (Pi 5, D1 mini, HC-SR04, L298N, A4988, SG90, ESP32 DevKitC), stehen in
  `catalog.ts` mit `checked: false`. Der Store zeigt sie mit ⚠, bis jemand sie am echten Teil nachgemessen hat.
- **Eigene Teile** aus Maßen liegen im Aufbau selbst (`build.parts`) und wandern mit der Projektdatei.

## Halter-Generatoren (`src/mechanics/parts/generators.ts`)

Ein Generator beschreibt, wie ein Teil befestigt wird, und liefert dieselbe `FeatureGeometry` wie die Features des
Strukturkerns: Körper, Löcher, Freiräume, Ports. Ein Träger (heute die Platte, später Gehäuse und Gestell) sammelt
diese Geometrie ein und muss den Halter nicht kennen. Ein neuer Halter ist ein neuer Eintrag in `generators`:

| Generator | Wirkung |
|---|---|
| `dome` | Schraubdome, nutzt das `standoff`-Feature des Strukturkerns |
| `through` | Durchgangsbohrungen, bei Motoren mit Bohrung für den Bund |
| `none` | nur aufgelegt |

## Aufbau (`src/mechanics/parts/build.ts`)

Das Dokument speichert nur Entscheidungen: wo ein Teil liegt, welcher Halter, welche Änderungen an Löchern. Umriss im
Auto-Modus, Bohrungen und Dome werden daraus berechnet. Verschiebt man ein Teil, wandern seine Bohrungen mit.

Ein `Build` gehört zu einem Mechanismus (`mechanism`) oder steht allein. Das Studio zeigt die Teile eines Mechanismus
mit ihm zusammen; der Store steht unter seinem Baum.

- **Freie Lage:** Ein Teil hat entweder `plate` (dann gelten `at`, `angle`, `side` in den Koordinaten der Platte) oder
  `free`: einen Frame auf einem Glied oder im Raum. Der Frame gilt relativ zum Glied, das Teil fährt also mit.
- **Bodenplatte:** ein Element wie jedes andere, null bis viele je Build, selbst frei platziert. Alles Planare arbeitet
  auf einem `Sheet`, das ist eine Platte mit ihren Teilen.
- **Ablegen:** `onSurface` legt das Teil flach auf die Fläche unter dem Zeiger, der Körper zeigt zur Normalen, das Glied
  der Fläche wird zum Träger. Liegt eine Platte näher als das Modell, landet es auf der Platte. Feinjustieren geht mit
  dem Griff in der 3D-Ansicht. „Hängt an“ wechselt den Träger, das Teil bleibt dabei im Raum, wo es ist.
- **Befestigung:** `partSeats` macht aus jedem Loch eines Teils auf einem Glied einen Sitz: Die Struktur druckt den Dom
  ein und hält den Platz des Teils frei. Für importierte Modelle gibt `holderPiece` den Halter als Einzelteil aus.
- **Im Raum prüfen:** Hüllquader gegeneinander und gegen die Teile des Modells, in der aktuellen Stellung und per Knopf
  über den Fahrweg jeder Achse. Grenze: Die Modellprüfung arbeitet auf der Oberfläche. Ein Teil, das komplett im
  Inneren eines Körpers liegt, ohne eine Wand zu berühren, fällt nicht auf.

- **Prüfung:** Teile derselben Seite halten den größeren der beiden Mindestabstände, Stecker behalten 20 mm Freiraum,
  Motorbund und Welle zählen auf der Gegenseite. Hülle unter der Platine gegen Domhöhe.
- **Einrasten:** erst das Raster, dann im Umkreis von 2,5 mm die Kanten der Nachbarn, bündig oder im Mindestabstand.
  Alt schaltet beides ab. Beim Ablegen auf belegtem Platz sucht `nearestFree` auf Ringen nach außen den nächsten
  freien Platz.
- **Ausgabe:** `buildGeometry` ergibt Grundkörper des Strukturkerns, `scad.ts` macht daraus OpenSCAD. Der Render-Worker
  erzeugt das STL mit exakten Booleschen Operationen.

## Projektdateien (`src/mechanics/project-store.ts`)

Jedes Projekt ist eine JSON-Datei im privaten Dateisystem des Browsers (OPFS) unter `/projekte`, geschrieben atomar
über einen `createWritable`-Stream. Die Datei enthält das Studio-Dokument und die zuletzt offene Ansicht, nicht die
Kataloge. `geoeffnet.txt` merkt sich das offene Projekt.

- Jede Änderung wird nach 300 ms geschrieben, beim Projektwechsel sofort. Undo gehört zur geöffneten Datei.
- Ein Tab hält per Web Lock das Recht auf seine Datei. Ein zweiter Tab darf sie ansehen, schreibt aber nicht.
- Der alte Speicherplatz in `localStorage` wird einmalig in das erste Projekt übernommen. Der Knopf „Speichern“ legt
  dort weiter eine Kopie ab.
- Importierte 3D-Modelle liegen weiter in der IndexedDB, nicht in der Projektdatei. Sie überstehen einen Neustart,
  gehören aber nicht zur Datei und gehen beim JSON-Export nicht mit.
- Ohne OPFS (zum Beispiel über `http://` von einem anderen Rechner) läuft das Studio im Speicher und sagt das.

## Prüfen

```
node scripts/parts/check-parts.mjs
node scripts/parts/check-part-seats.mjs
node scripts/check-studio-build-browser.mjs
node scripts/check-studio-parts-on-model-browser.mjs
```
