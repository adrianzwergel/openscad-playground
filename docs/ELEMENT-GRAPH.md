# Elementgraph: H1 und Beginn H2

Der neue Modus „Freier Elementgraph · H1/H2“ ist eine eigenständige Grundlage für
die spätere räumliche Autoroutensuche. Er verkettet keine fertigen Getriebemodule.
Aktuell werden manuelle Graphen aufgelöst, geprüft, animiert und als Detailgeometrie
gerendert. Eine erste begrenzte Suche ist inzwischen verfügbar: [GRAPH-SEARCH.md](GRAPH-SEARCH.md).

## Domänenmodell

`graph/contracts.ts` trennt Trägerkörper, Elemente und Relationen:

- Ein `Body` ist eine endliche Welle oder ein allgemeiner starrer Träger. Sein Rahmen
  besteht aus Position und normiertem Quaternion in der Reihenfolge x/y/z/w.
- Ein `Element` referenziert seinen Träger, seine Familie, einen lokalen Rahmen,
  eine Phase und familienabhängige numerische Parameter. Mehrere Elemente können
  dieselbe Welle nutzen. Ihre Drehzahl wird über die Wellen-ID geteilt.
- Eine `Relation` referenziert eine registrierte Regel und eine Liste beteiligter
  Elemente. Die Anzahl der Teilnehmer wird von der Regel festgelegt, nicht im
  Projektformat auf zwei begrenzt. Das erlaubt spätere Riemen-/Kettenumläufe.
- Ein `Terminal` enthält einen lokalen Anschlussrahmen und einen unabhängig gespeicherten
  festen Zielrahmen. `frame` fixiert die ganze Lage; `axis` fixiert eine gerichtete
  Achslinie und lässt axiale Verschiebung sowie Verdrehung um die Achse frei.

Eine neue Familie muss nicht als neuer Sonderfall in das Projektmodell eingebaut werden.
`Registry` verwaltet Elementfamilien und Relationsregeln mit eindeutigen IDs. Unbekannte
IDs und Registry-Versionen werden beim Import abgelehnt; sie werden nicht stillschweigend
in ein anderes Bauteil umgedeutet. Erweiterungen sind Anwendungscode, kein ausführbarer
Inhalt einer Projektdatei.

## Erweiterungsvertrag

Eine Elementfamilie liefert Parameterprüfung, Trägeranforderungen, konservative lokale
Hülle und SCAD-Geometrie. Eine Bohrungsprüfung ist ein expliziter optionaler Adapter;
der Kern setzt keinen bestimmten Parameternamen für beliebige neue Familien voraus.
Partnerabhängige Geometrie, beispielsweise Kegelräder, verlangt zunächst genau eine
eindeutige Relation zur Ermittlung des Gegenrads.

Eine Relationsregel liefert:

- Kategorie `transmission`, `joint` oder `loop`, Teilnehmerzahl und freie Gelenk-DOFs.
- Kompatibilitätsprüfung und geometrische Prüfungen.
- Optional numerische Residuen mit Einheit, Toleranz und Vergleichsrichtung für einen
  späteren kontinuierlichen Solver. Die vorhandenen Regeln liefern Lage-/Phasenresiduen.
- Optional mehrere Drehzahlübertragungen zwischen Teilnehmern. Ohne diese Angaben
  wird keine starre oder 1:1-Drehübertragung erfunden.
- Optional analytische Gegenkörperlagen als Startwerte für die spätere Suche.

Damit können Ketten/Ritzel später eine eigene Umlaufregel erhalten; Helical/Herringbone
ergänzen Profil-, Schrägungs-, Händigkeit- und Paarungsregeln. Ein Kugelgelenk wird als
Gelenkrelation mit Freiheitsgraden behandelt. Es ist keine Zahnradfamilie und keine
automatisch starre Übertragung. Ein synthetischer Gelenkprovider im Test demonstriert,
dass der Kern eine unbekannte Ausgangsdrehzahl nicht zu 1:1 macht. Reale Kugelgelenk-,
Ketten-, Helical- oder Herringbone-Geometrie ist damit ausdrücklich noch nicht implementiert.

## Aktuell implementierte Familien

`spur` / `external-spur`: gerade Außenverzahnung mit parallelen Achsen, axialem
Paarungsniveau, Teilkreisabstand, Azimut und Zahnphase.

`bevel` / `bevel-mesh`: gerade Kegelräder mit gemeinsamem Teilkegelapex, aus Zähnezahlen
und Achswinkel abgeleiteten Teilkegeln, Azimut und Zahnphase. Der vorläufige Parserbereich
ist 60–120°; ungültige oder stumpfe Teilkegel werden verworfen. Exakte Geometrieproben
decken zunächst die Referenzpaare bei 60°, 90° und 120° ab, nicht jede mögliche Kombination
des Parameterraums. Druck- und Lasttauglichkeit sind damit nicht freigegeben.

Beide Regeln arbeiten in lokalen Rahmen. Eine beliebige gemeinsame Weltrotation oder
Translation ändert ihre Gültigkeit nicht. Winkel und Positionen sind keine fest
eingebauten globalen +X/+Z-Fälle mehr.

Der Referenzgraph besitzt drei Wellen und vier Elemente:

1. A trägt ein 20er Stirnrad.
2. B trägt ein 40er Stirnrad und ein 20er Kegelritzel, 30 mm axial versetzt.
3. C trägt das zugehörige 30er Kegelrad.

Die Drehzahl von B beträgt −0,5 relativ zu A; C dreht mit +1/3. Die Untersetzung ist
3:1. Es gibt keine Kupplung zwischen den Elementen auf B. Lager, Nabenbefestigung und
Gehäuse gehören noch nicht zu diesem Referenzaufbau.

## Browser und Speicherung

Der neue Modus zeigt Wellenbelegung, Drehzahlen, Prüfungen, Paarungsregeln und eine
echte OpenSCAD-Vorschau. Über das Auswahlfeld lassen sich die drei Referenzwinkel laden.
„Gesamten Aufbau räumlich drehen“ transformiert den Aufbau einschließlich der Zielrahmen;
es ist keine automatische Anpassung an andere feste Endanschlüsse.

Der JSON-Editor erlaubt eigene Belegungen, Parameter und Anschlussrahmen. Strukturfehler
werden ohne Verlust des aktiven Graphen abgelehnt. Geometrisch falsche, aber strukturell
gültige Graphen bleiben editierbar und sperren den CAD-Export. Ein analytischer Lagevorschlag
bewegt den ganzen Gegenkörper inklusive seiner anderen Elemente. Andere Relationen und
feste Endanschlüsse werden anschließend erneut geprüft; der Vorschlag ist kein Autorouter.

Die gemeinsame Werkbank unterstützt Graph-Varianten, Portanzeige und schematische
Animation. Für beliebige Achsen werden die Kreise in einer orthonormalen lokalen Basis
dargestellt. SCAD-Export liefert die Baugruppengeometrie, keine freigegebenen Fertigungsteile.

Projektformat 6 ergänzt `graph` mit eigenem Graphschema 1 und `registryVersion`.
Formate 1–5 werden weiter geladen. `graph`, `mixed`, `spatial` und `motion` schließen
sich als aktive Modi aus. Alte Modelle bleiben in ihrem bisherigen Modus; eine
stille Übersetzung in den neuen Graphen findet nicht statt.

## Prüfungen und nächste Arbeiten

`check-element-graph.mjs` prüft gemeinsame Wellen, Registry-Erweiterbarkeit, Gelenk-DOFs,
Numerik/Residuen, Welttransformationen, feste Terminals, axiale Belegung, Vorschläge
und Projektroundtrip. `check-element-graph-contact.mjs` prüft tatsächliche WASM-Schnittmengen
der Referenzpaare. `check-element-graph-browser.mjs` prüft Rendering, Winkelvarianten,
beliebige Weltrotation, Speicherung, Varianten, Animation, fehlerhafte Eingaben und Abbruch.

Noch offen sind unter anderem GT2-/Schneckenadapter für diese Registry, vollständige
Bauteil-/Wellenkollisionen, Phasen-/Bewegungsprüfung über den Arbeitsbereich, Lager- und
Montagebedingungen sowie die automatische Graphsuche. Geschlossene Getriebeschleifen
brauchen zusätzliche Phasen- und Freiheitsgradanalyse; reine Drehzahlkonsistenz reicht nicht.

Priorität gemäß Nutzerentscheidung: Autorouting, räumliche Anordnung, erweiterbare
Familien und belastbare geometrische/montageseitige Prüfungen ausreifen. Generative
Tragstruktur und physikalische Topologieoptimierung beginnen erst danach. Das ändert
nichts daran, dass Lager- und Montageplatz bereits während der Suche reserviert werden müssen.


Aktualisierung 30.10.2026: Offene Drei-/Vierstufenketten haben jetzt eine Mehrstart-
Suche mit kontinuierlicher Anpassung und konservativen Lager-/Montageraumfiltern.
Der aktuelle Prüfstand und verbleibende Grenzen stehen in [GRAPH-SEARCH.md](GRAPH-SEARCH.md).


Aktualisierung 30.10.2026: GT2 und Schnecke sind nun über Suchprovider angebunden.
Diese liefern Katalog, numerische Parameter, Phasen, zusätzliche Raumhüllen und
Lager-Freihaltezonen. Aktueller Stand: [GRAPH-SEARCH.md](GRAPH-SEARCH.md).


Aktualisierung 30.10.2026: Graphversion 2 trennt Trägerbewegung und Elementbindung.
Freie Rotoren übertragen ihre Bewegung nicht automatisch auf die Achse. Spindel
und Zahnstange ermöglichen lineare Ausgänge der freien Suche. Siehe
[LINEAR-GRAPH.md](LINEAR-GRAPH.md) für Einheiten, Migration und offene Bedingungen.
