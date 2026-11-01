# Bauraum und Sperrzonen

Stand: 30.10.2026. Graphversion 4 ergänzt optionale `environment`-Vorgaben;
Projekte bleiben im bisherigen äußeren Speicherformat lesbar.

## Vorgaben

- Ein optionaler Bauraumquader (`bounds`) mit Zentrum, Orientierung und voller Größe in mm.
- Bis zu zwölf verbotene Quader (`obstacles`) mit eindeutigen IDs.
- Gemeinsamer Mindestabstand `margin` von 0 bis 10 mm.
- Zentrum und Größe im Editor, beliebige Orientierung als Quaternion im Graph-JSON.

Die Raumvorgaben gelten in Weltkoordinaten. Eine globale Transformation des gesamten
Graphen transformiert auch die Raumvorgaben. Während einer automatischen Suche
bleiben Raumvorgaben und Ein-/Ausgangsziele dagegen unverändert. Die explizite
Schaltfläche zum Anpassen des Bauraums ist eine Benutzeraktion, kein Suchschritt.
Alle Komponenten einschließlich der Anschlusswellen müssen vollständig hineinpassen;
es gibt noch keine Sonderdurchführungen durch die Raumgrenze.

## Suche und Prüfung

Katalog- und Verbindungsvarianten werden wie bisher erzeugt. Die kontinuierliche
Lageoptimierung berücksichtigt zusätzlich zu Anschlussposition und Achsrichtung
Verletzungen der Raumgrenzen und Sperrzonen. Sie verändert die freigegebenen
Paarungswinkel und axialen Positionen, keine Katalogabmessungen. Mehrere Startlagen
können unterschiedliche Umfahrungen finden. Verbindungsvarianten werden mit ihren
eigenen Hüllen optimiert, weil ein freier Verbund zusätzlichen Verbindungsraum benötigt.

Die abschließende Prüfung akzeptiert ausschließlich Lösungen mit gültiger Kinematik,
Übersetzung, internen Freiräumen und erfüllten Raumvorgaben. Geprüft werden konservative
orientierte Hüllquader für Rotoren, Wellen, Verbundverbindungen, Riemenräume,
Spann-/Verfahrbereiche und die bereits vorhandenen Lager-/Zugangsreservierungen.
Containment prüft die gesamte Hülle gegen alle sechs Bauraumflächen; Sperrzonen
verwenden den Separating-Axis-Test. Der Mindestabstand ist konservativ: knappe
Diagonalabstände können abgelehnt werden, obwohl die exakten Körper Platz hätten.

Die Suche bleibt eine begrenzte heuristische Suche mit lokaler Optimierung. Kein
Treffer ist kein Beweis, dass keine Lösung existiert. Enge Passagen und nichtkonvexe
Umfahrungen können weitere Startlagen oder ein höheres Suchbudget benötigen.
Keine exakte Zahnflanken-/Mesh-Kollisionserkennung, beliebigen Freiformräume,
Montagewegplanung oder generativen Gehäuse in diesem Schritt.

## Bedienung und Abnahme

Unter Graphmodus: „Bauraum & Sperrzonen“. Die schematische Ansicht zeigt den Bauraum
blau und Sperrzonen rot. Diese Hilfsgeometrie gehört nicht zum STL-Export.
Das Beispiel „Umfahrung einer Sperrzone“ beginnt absichtlich mit einem blockierten
Zwischenrad. Eine Suche mit Übersetzung 1 und zwei Stufen kann es versetzen.

- `node scripts/check-graph-space.mjs`: kontinuierliche Umfahrung bei identischen
  Katalogteilen, unabhängige Katalogsuche, unveränderte Ziele, gedrehte Räume,
  Mindestabstand, komplette Hub-/Riemenräume, Schema, Speicherung und zu kleiner Raum.
- `node scripts/check-graph-space-browser.mjs`: Beispiel, Suche, Übernahme,
  Speicherung/Neuladen, Sperrzoneneditor und räumliche Überlagerung.

Montage, konkrete Lagerauslegung und generatives Gehäuse bleiben spätere Schritte.

## Robustere Umfahrungen (30.10.2026)

Die Suche ergänzt zufällige Startlagen um geometrisch geführte Umfahrungsstarts:
Eine Verbindung zwischen den festen Anschlusszielen wird in acht Richtungen und
zwei Auslenkungen seitlich versetzt. Gegenüberliegende Seiten werden abwechselnd
versucht. Hindernisausdehnungen beeinflussen die Auslenkung; die Paarungsprovider
setzen daraus reale Katalogpaarungen über ihre freigegebenen Winkel auf. Diese
Startlagen sind noch keine geprüften Lösungen. Erst die anschließende kontinuierliche
Optimierung und die vollständige Endprüfung dürfen sie freigeben.

Pro neuem Katalogaufbau werden zunächst die ursprüngliche Lage und zwei geführte
Lagen versucht. Verbindungsvarianten werden dazwischen verteilt, damit nicht alle
Rechenzeit in ähnliche blockierte Lagen fließt. Ein vorhandener passender Aufbau
bekommt zusätzlich bis zu acht Umfahrungsstarts. Alle Versuche teilen dasselbe
Suchbudget; Abbruch bleibt möglich. Zwölf aufeinanderfolgende erfolglose lokale
Optimierungsschritte beenden einen festgefahrenen Versuch früher.

Jede Sperrzone hat jetzt einen eigenen Fehlerterm. Zusätzlich beeinflussen interne
Bauteil-/Lagerraumkollisionen die Lageoptimierung, statt nur am Ende eine ansonsten
passende Lösung zu verwerfen. Die Hüllenerzeugung und die erlaubten Kontaktpaare
werden zwischen Optimierung und Endprüfung geteilt. Der Suchbericht zeigt die Zahl
der gezielten Umfahrungsstarts. Graph- und Projektformat bleiben unverändert.

Zusätzliche Abnahme:

- `node scripts/check-graph-detours.mjs`: unabhängige Drei-/Vierstufensuche findet
  Lösungen auf beiden Seiten einer Sperrzone; Vierstufenfall mit gedrehten
  Anschlüssen und Raum. Eine zweite Sperrzone blockiert eine zunächst gültige
  Seite und erzwingt die andere. Prüfung von Katalog, Übersetzung, festen Zielen,
  gesamten Hüllen, Budget, unveränderten Eingaben und Abbruch.
- `node scripts/check-graph-detours-browser.mjs`: Dreistufensuche im Browser,
  Umfahrungsbericht, Übernahme und Speicherung/Neuladen.

Diese Testfälle verbessern die Abdeckung, sind aber kein Vollständigkeitsnachweis.
Komplexe Labyrinthe mit mehreren aufeinanderfolgenden Richtungswechseln können
weiterhin zusätzliche Suchstrategien benötigen. Montage und generatives Gehäuse
bleiben außerhalb dieses Schritts.

## Gemischte räumliche Umfahrungen (30.10.2026)

Suchprovider können mit `changesAxis` angeben, ob sie den Trägerrahmen drehen:
Kegelrad und Schnecke melden `true`, Stirnrad und GT2 `false`. Ein fehlender Wert
bleibt unbekannt und darf keine frühe Ablehnung rechtfertigen. Bei fest geforderten
unterschiedlichen Anschlussausrichtungen werden ausschließlich Ketten aus explizit
achsparallelen Providern vor der lokalen Optimierung verworfen. Lokale Anschlussrahmen
und die freie Rollrichtung einer reinen Achsvorgabe werden dabei berücksichtigt.

Bei Ketten mit Achswechsel verfolgt jeder Umfahrungsstart bis zu drei verschiedene
Zwischenlagen. Die diskreten Winkelproben verwenden weiterhin die Paarungsprovider.
Neben dem Zwischenpunkt bewertet die Auswahl die vom verbleibenden Kettenende
vorhergesagte Position/Ausrichtung sowie die Raumverletzungen der bereits platzierten
Trägerhüllen. Doppelte Lagen durch periodische Winkel werden zusammengefasst.
Die nachfolgende kontinuierliche Optimierung korrigiert Azimut, Kegelwinkel und axiale
Sitze gemeinsam. Katalogzähne und Katalogriemenlängen bleiben unverändert.

Abnahme ergänzt um:

- `node scripts/check-mixed-detours.mjs`: blockierte Dreistufenkette mit
  Stirnrad/GT2/Schnecke und Vierstufenkette mit zusätzlichem Kegelrad (73°),
  gedrehte Welt-/Anschlussrahmen, zusätzlicher blockierter Riemenraum, feste Ziele,
  Kinematik, vollständige Hüllraumprüfung, Speicherung und Abbruch. Zusätzlich
  Dreistufensuche aus einem unpassenden Ausgangsmodell und Prüfung der frühen
  Ausrichtungsablehnung.
- `node scripts/check-mixed-detours-cold.mjs`: Vierstufensuche aus einem anderen
  Ausgangsmodell, nicht parallele feste Anschlüsse und zwei Sperrzonen. Die Suche
  darf auch eine andere zulässige Mischung aus dem freigegebenen Katalog wählen.
- `node scripts/check-mixed-detours-browser.mjs`: Vierstufensuche im Browser,
  Übernahme und Speicherung der geprüften Lösung.

Die Orientierungsvorschau ist eine Heuristik, kein vollständiger räumlicher
Erreichbarkeitsbeweis. Die Suche kann bei mehreren Achswechseln deutlich länger
laufen als bei Stirnradketten. Gleiche Endausrichtung garantiert keinen geometrisch
möglichen Aufbau; nur die abschließende Gesamtprüfung gibt einen Kandidaten frei.
Montage und generatives Gehäuse bleiben spätere Schritte.

## Bedienbare Hintergrundsuche und Live-Ergebnisse (30.10.2026)

Die Graphsuche läuft im Browser nun in einem eigenen Web Worker. Der Hauptthread
rendert weiterhin die Oberfläche; auch synchrone Katalog-/Umfahrungsarbeit blockiert
nicht mehr die Abbruchschaltfläche. Abbruch und Übernahme terminieren diesen Worker
sofort. Bereits an die Oberfläche gelieferte, vollständig geprüfte Lösungen bleiben
nach einem Abbruch auswählbar. Nachrichten eines alten Workers werden nach einem
Neustart oder Projektwechsel ignoriert; beim Entfernen der Ansicht wird er beendet.

Die Solver-API besitzt einen optionalen Callback für jede neu akzeptierte Lösung.
Er wird erst nach Kinematik-, Übersetzungs- und vollständiger Freiraumprüfung aufgerufen.
Graph und Prüfbericht werden als Kopien übergeben. Der Worker sendet Lösungen sofort,
Fortschrittszahlen höchstens etwa zehnmal pro Sekunde und zum Abschluss den gesamten
sortierten Bericht. Während der Suche lässt sich eine Lösung mit „Übernehmen & Suche
beenden“ direkt übernehmen. Laufende Ablehnungsstatistiken werden noch nicht übertragen.

Das Suchbudget ist vor jedem Start wählbar: 5.000, 10.000, 25.000 (Standard), 50.000
oder 100.000 Rechenschritte. Es bleibt eine algorithmische Budgetgröße, keine Zeitangabe.
Fortschritt und Zahl der geprüften Lösungen werden laufend angezeigt. Kleinere Budgets
können weniger oder keine Lösungen liefern. Fehler beim Worker-Start entsperren die
Oberfläche ebenfalls.

Zusätzlich entfallen doppelte periodische Azimutproben und doppelt angebotene Kegelwinkel
bei Umfahrungsstarts. Ein lokaler Vergleich für vier gemischte Starts ergab etwa
1,08 s vorher und 0,56 s danach. Das betrifft die Starterzeugung, nicht die gesamte
Suchzeit; die Dauer der anschließenden Optimierung hängt weiterhin von der Aufgabe ab.

Abnahme:

- `node scripts/check-live-graph-search.mjs`: Nur geprüfte Lösungen werden gemeldet,
  API-Abbruch erhält Ergebnisse, Callback-Kopien schützen den internen Suchzustand.
- `node scripts/check-live-graph-search-browser.mjs`: Ergebnisse vor Suchende,
  bedienbare Oberfläche, sofortiger Abbruch mit erhaltenen Ergebnissen, Übernahme
  während der Suche, Neustart, gewähltes Budget und Worker-Ladefehler.
- Bestehende Tests für Hindernisumfahrung und räumliche gemischte Ketten bleiben relevant.

Montage und generatives Gehäuse weiterhin später.

## Suchlösungen vergleichen und in 3D prüfen (30.10.2026)

Die Live-Ergebnisse erscheinen als Vergleichstabelle. Sortiert werden kann auf- oder
absteigend nach benötigtem Hüllvolumen, Stufenzahl oder Bauteilanzahl. Stabile
Lösungsnummern halten die Zuordnung auch bei neuen Treffern, Abschluss-Rangfolge und
Umsortieren fest. Eine bereits gewählte Vorschau bleibt beim Sortieren ausgewählt.

Die Bauraumkennzahl ist die umschließende Box aller vorhandenen Konstruktionshüllen,
ausgerichtet am festen Eingangsrahmen. Sie enthält Wellen/Achsen, reservierte
Lager-/Zugangsbereiche, Riemenräume und den vollständigen linearen Hub. Angezeigt
werden drei Maße in mm und das Hüllvolumen in cm³. Es ist weder Materialvolumen
noch die Größe des vom Benutzer vorgegebenen Bauraums. Eine gemeinsame räumliche
Drehung von Mechanik und Anschlüssen verändert die Kennzahl nicht.

Bauteile zählen hier Katalogelemente plus Wellen/feste Achsen. Reservierte Lager,
Naben und Gehäuse werden nicht als fertige Teile gezählt; freie Verbundmitglieder
bleiben einzelne Katalogelemente. Dies ist noch keine Fertigungsstückliste.

„In 3D prüfen“ erzeugt eine separate OpenSCAD/GLB-Vorschau des gewählten Kandidaten.
Drehen und Zoomen erfolgen im vorhandenen model-viewer. Das Projekt wird dabei nicht
geändert und eine laufende Suche wird nicht beendet. Ein Wechsel/Schließen beendet
einen noch laufenden Renderworker; verspätete Ergebnisse werden ignoriert und
Blob-URLs freigegeben. Erst „Übernehmen“ ändert das Projekt. Die 3D-Ansicht zeigt
Bauteilgeometrie, keine zusätzlichen Körper für Sperrzonen und reservierte Räume;
diese Einschränkung steht direkt an der Ansicht. Montage und generatives Gehäuse
bleiben weiterhin später.

Abnahme: `node scripts/check-solution-comparison.mjs` prüft Maße, Zählung,
Drehungsinvarianz und Hubberücksichtigung. `node scripts/check-solution-comparison-browser.mjs`
prüft Sortierung, tatsächlich geladenes 3D-Modell, unverändertes Projekt bei Vorschau,
Auswahl beim Sortieren, schnellen Wechsel und Übernahme.

Lokal ansehen: http://localhost:4001/mechanics → Baugruppen-Vorlage „Freier Elementgraph“
→ „Anordnungen suchen“ → „Lösungen vergleichen“ → „In 3D prüfen“.

## Schaltbare 3D-Prüfebenen (30.10.2026)

Lösungsvorschau und Detailansicht des aktuellen Graphen verwenden dieselbe
3D-Prüfansicht. Drei separat schaltbare Ebenen ergänzen die Bauteilgeometrie:
Blau zeigt den vorgegebenen Bauraum, Rot die Sperrzonen, Gelb sämtliche konservativen
Konstruktionshüllen (Bauteile/Wellen, Lager-, Zugangs-, Verbindungs-, Riemen- und
Bewegungsräume über den gesamten Hub). Die vorhandenen orientierten Rahmen werden
unverändert verwendet. Ohne Raumvorgaben bleiben die entsprechenden Ebenen leer.

Die Hüllen werden als transparente Quader direkt in die GLB-Ansicht eingefügt.
Es findet keine zusätzliche OpenSCAD-Berechnung statt. Die Basisgeometrie und das
Projekt bleiben unverändert; SCAD/STL-Exporte enthalten keine Hilfsgeometrie.
Bauraum und Sperrzonen zeigen die vorgegebenen Maße, nicht um den Mindestabstand
vergrößerte Hüllen. Der Solver berücksichtigt diesen Abstand weiterhin unabhängig
von der Sichtbarkeit. Transparenz ist eine Orientierungshilfe, kein exakter
Kollisionsnachweis; konservative Quader können sich visuell überschneiden.

Beim Umschalten bleibt der Kameraausschnitt erhalten. „Alles einpassen“ setzt ihn
auf alle aktuell sichtbaren Geometrien zurück. Die Ansicht gibt alte Blob-URLs frei
und ignoriert veraltete Konvertierungen bei schnellem Umschalten oder Schließen.

Abnahme: `check-inspection-layers.mjs` prüft getrennte Geometrien, transparente
Materialien, räumliche Transformationen und Hubhüllen. `check-inspection-layers-browser.mjs`
prüft die tatsächlich geladenen GLB-Materialien, alle Schalter, unverändertes Projekt
und unveränderte Anzahl der CAD-Renderjobs. Vergleichsvorschau ebenfalls im Browser
regressionsgeprüft. Montage und generatives Gehäuse bleiben später.
