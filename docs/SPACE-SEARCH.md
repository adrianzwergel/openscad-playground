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
