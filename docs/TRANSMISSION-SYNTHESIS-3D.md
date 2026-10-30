# Zielarchitektur: freie Synthese räumlicher Getriebe

Status: Plan, keine Implementierung. Grundlage: Commit `f70778c`, Branch `mechanics10`.
Der bisherige Stand war bei Erstellung sauber und mit origin synchronisiert.

## 1. Korrektur der bisherigen Richtung

Die aktuelle gemischte Suche verkettet zwei fertig konstruierte Getriebemodule mit
Kupplung und Brücke. Das demonstriert Geometrie, Speicherung und Prüfungen, bildet
aber nicht das gewünschte allgemeine System ab. Sie wird als Referenz erhalten;
zusätzliche Baugruppenschablonen sind nicht der nächste Entwicklungsschritt.

Ziel ist ein Getriebe aus gemeinsam genutzten Wellen, frei kombinierten Wellenbauteilen
und mechanischen Paarungen. Beispielsweise trägt dieselbe Zwischenwelle ein
Schneckenrad, ein Stirnrad und optional eine GT2-Scheibe an verschiedenen axialen
Positionen. Jeder belegte Paarungsanschluss bekommt ein kompatibles Gegenstück.
Eine Kupplung ist ein ausdrücklich gewähltes Bauteil und kein automatischer Übergang
zwischen Getriebetypen. Mehrere Elemente auf einer Welle müssen nicht ein einziges
Druckteil bilden: getrennte, verdrehsicher befestigte Teile sind zunächst einfacher montierbar.

Wir unterscheiden ausdrücklich:

1. Getriebegraph: Welche Elemente und Wellen übertragen Bewegung?
2. Räumliche Konstruktion: Wo liegen sie, passen sie zusammen und lassen sie sich montieren?
3. Tragstruktur: Wie werden Lager und äußere Befestigungen miteinander verbunden?
4. Spätere Strukturoptimierung: Wie viel Material ist bei gegebenen Lasten erforderlich?

## 2. Gemeinsames Datenmodell

Ein versioniertes Nachfolgemodell ersetzt die getrennten aktiven Vorlagen schrittweise.
Die folgenden Begriffe sind ein Schemaentwurf, keine bereits vorhandene API.

| Objekt | Wesentliche Daten und Bedeutung |
| --- | --- |
| DesignRequest | Ein-/Ausgang, Sollverhältnis, Drehsinn, erlaubte Familien/Parameterbereiche, Stufenlimit, Toleranzen, Suchbudget |
| Terminal | Vollständiger Anschlussrahmen: Position und Orientierung; zusätzlich festgelegte und freie Freiheitsgrade, Bezugsfläche, Wellendurchmesser und Einstecktiefe |
| Shaft | Achslinie, endliche Ausdehnung, Durchmesserprofil, axiale Belegungsintervalle, Drehvariable, Lager- und Sicherungskonzept |
| RotorElement | Typ, Parameter/Katalogreferenz, Wellen-ID, axialer Sitz, Orientierung relativ zur Welle, Phase, Nabe und Befestigung |
| PairRelation | Zwei kompatible Elemente, Kontaktart, Lagegleichungen, Übersetzungsrelation, Zahnphase und Kontaktbereich |
| BeltLoop | Scheiben und ggf. Spannrolle, Teilung/Breite, Kataloglänge, Umschlingung, Betriebslage, Spann-/Montageweg |
| BearingSupport | Lager, Sitz, Welle, axiale Position, radial/axial gesperrte Freiheitsgrade, Fest-/Loslagerfunktion |
| MountInterface | Befestigungsfläche bzw. Lochbild mit Normalenrichtung, Schrauben, Werkzeugraum und Verbindung zum äußeren Gestell |
| SpatialRegion | Erlaubter Raum, Hindernis, zwingend freier Raum oder zu erhaltendes Material; Referenzrahmen und Gültigkeitsphase |
| Structure | Lageraufnahmen, Streben/Rippen, Montagefüße, Deckel, Trennstellen und ihre Verbindungen |
| Candidate | Gewählter Graph, Parameter, Platzierung, Prüfbericht, Ziele/Metriken, Suchherkunft und Reproduktionsdaten |

Ein Punkt auf einer Achse ist nicht automatisch eine feste Anschlussstirnfläche.
Der Nutzer muss unterscheiden können: nur Achslinie fixiert; axiales Intervall erlaubt;
oder vollständiges Wellenende inklusive Phase/Einstecktiefe fixiert. So wird die bisherige
stillschweigende Freiheit entlang einer Achse zu einer ausdrücklichen Vorgabe.
Intern Transformationen mit Quaternion/Rotationsmatrix; Eulerwinkel nur als optionale UI.
DH-Parameter sind für eine Roboter-Kinematikkette hilfreich, reichen aber nicht als
Datenmodell für Verzahnungen, Riemen, gemeinsame Wellen, Gehäuse und Montage.

Stufen zählen als übertragende Paarungen, nicht als Anzahl der Bauteile auf einer Welle.
In der ersten Suche bleibt der Kraftfluss eine unverzweigte Kette, deren aufeinanderfolgende
Paare Wellen teilen. Später können Verzweigungen und geschlossene Übertragungsschleifen folgen.

## 3. Jede Paarung beschreibt erlaubte relative Lagen

Ein Bauteilgenerator muss neben der Geometrie seine Anschlussrahmen, Hüllkörper,
Montagekorridore und gültigen Parameterbereiche liefern. Die Paarungsregel liefert
analytische Platzierungsvorschläge oder Gleichungsreste für den numerischen Solver.

| Familie | Geometrische Bedingungen | Veränderliche Entscheidungen |
| --- | --- | --- |
| Stirnrad außen | Parallele Achsen, passende Zahnebenen, Teilkreisabstand bei geraden unverschobenen Rädern als Summe der Radien | Zähnezahlen, Modul, Breite, Umlaufwinkel um Partnerachse, axiale Position |
| Innenverzahnung | Parallele Achsen, Differenz der Teilkreisradien; zusätzliche Interferenz-/Zähnezahldifferenzregeln | Ring/Ritzel, Ringträger, axiale Zugänglichkeit |
| Kegelrad | Sich schneidende Achsen, gemeinsame Teilkegelspitze, abgestimmte Konuswinkel | Übersetzung, zulässiger Achswinkel, Azimut, Position der Spitze, Zahnbreite |
| Schneckenpaar | Windschiefe Achsen, passende Normalgeometrie, Händigkeit und Gangzahl | Gangzahl, Radzähne, Durchmesser, axialer Sitz; zunächst validierte 90°-Familie |
| GT2 | Zunächst parallele, koplanar angeordnete Scheibenachsen; gemeinsame Riemenebene | Zähnezahlen, Kataloglänge, Achsabstand, Umschlingung, separate Spannung |
| Zahnstange/Spindel | Rotatorisch-linearer Anschluss mit passenden Eingriffs-/Gewindebedingungen | Vorschub, Hub, Führung und Arbeitsraum; spätere Erweiterung derselben Architektur |

Ein beliebig gedrehtes Kegelrad passt nicht automatisch. Der Achswinkel muss zusammen
mit beiden Teilkegeln konstruiert werden. Bei sich nicht schneidenden Achsen ist ein
gewöhnliches Kegelradpaar keine gültige Verbindung; Hypoidverzahnungen wären eine eigene Familie.
Ebenso wird ein GT2-Riemen zunächst nicht beliebig durch den Raum verdreht geführt.

Katalog bedeutet künftig Parameterräume plus nachgewiesene Gültigkeitsgrenzen, nicht
nur die wenigen heutigen Zähnezahlen. Kaufteilabmessungen und Riemenlängen bleiben
diskret; gedruckte Zahnradparameter dürfen innerhalb validierter Grenzen generiert werden.
Grenzen für Unterschnitt, Zahneingriff, Zahnbreite und Naben werden pro Familie benötigt.
Die heutige BOSL2-Version bleibt gepinnt; neue Parameterbereiche erst nach Geometrieprüfung freigeben.

## 4. Sucharchitektur: diskrete Wahl und räumliche Anpassung

Empfohlen ist eine hybride Suche, keine reine Prolog-Geometriesimulation und keine
freie Wegsuche durch beliebige Punkte im Raum.

1. Vorgaben normalisieren: Anschlussrahmen, Toleranzen, erlaubte Parameter, Volumen,
   Hindernisse, Mountings, maximale Stufenzahl und Budget. Unklare Freiheitsgrade sichtbar machen.
2. Graphkandidaten erzeugen: Typenfolgen und gemeinsam genutzte Wellen; zuerst zwei,
   dann drei, später begrenzt vier Paarungen. Prolog übernimmt Kompatibilität und diskrete Domänen.
3. Übersetzung früh einschränken: mögliche Produkte/Intervalle der verbleibenden Stufen
   bestimmen. Unmögliche Verhältnisse früh verwerfen. Ganze Zähnezahlen und Gangzahlen
   als rationale Werte führen, nicht durch aufsummierte Rundungsfehler bewerten.
4. Von beiden Enden platzieren: erlaubte Anschlusslagen der nächsten Paarung berechnen,
   gemeinsame Zwischenwellen suchen und Teilketten zusammenführen. Analytische Lösungen
   bevorzugen, verbleibende Freiheitsgrade gezielt abtasten.
5. Kontinuierlich verfeinern: Positionen, Achsrichtungen, axiale Sitze und gegebenenfalls
   Teilkegelwinkel gemeinsam anpassen. Diskrete Bauteilwahl dabei festhalten. Gleichheits-
   und Ungleichheitsbedingungen getrennt behandeln und alle Restfehler danach nachprüfen.
6. Früh Bauraum, Lagerplätze und Wellenkorridore reservieren. Unbrauchbare Kandidaten
   verwerfen, bevor teure Zahngeometrie entsteht.
7. Lager-/Montagekonzept und Tragstruktur ergänzen. Falls sie nicht realisierbar sind,
   zum Graphen oder zur Platzierung zurückspringen; kein nachträglich aufgezwungenes Gehäuse.
8. Nur die besten unterschiedlichen Kandidaten detailliert rendern und prüfen.

Für den Start: begrenzte Best-First-/Beam-Suche mit mehreren Startwerten und einer
lokalen numerischen Anpassung. Sie ist unter einem Browserbudget praktisch, aber nicht
vollständig und garantiert kein globales Optimum. A* ist erst mit einer nachweisbar
zulässigen Heuristik eine entsprechende Optimalitätsaussage wert.

„Näher zum Ziel“ allein reicht nicht. Ein Kandidat darf zunächst weiter vom Ausgang
wegführen, um ein Hindernis zu umgehen oder die richtige Achsrichtung herzustellen.
Bewertet werden Positions-/Orientierungsfehler, Restübersetzung, verfügbare Bewegungs-
und Lagerkorridore, Stufenzahl und spätere Herstellbarkeit. Nichtvergleichbare Fehler
in mm, Winkel und Übersetzung müssen explizit skaliert werden. Harte Bedingungen
dürfen niemals durch gute weiche Bewertungen ausgeglichen werden.

Alternativen durch Graphsignatur, Lagerkonzept und räumliche Lage unterscheiden;
nicht 40 nahezu identische Verschiebungen anzeigen. Pareto-Auswahl für Stufenzahl,
Bauraum, Übersetzungsfehler und Fertigungsaufwand. Resultate müssen erklären:
„gefunden“, „im endlichen vollständig geprüften Teilraum ausgeschlossen“ oder
„Budget ausgeschöpft“. Ein abgebrochener numerischer Versuch beweist keine Unmöglichkeit.

## 5. Übersetzung und Drehrichtung

Für die erste unverzweigte Kette gilt: starre Wellenbelegung überträgt 1:1;
Paarungsfaktoren werden entlang des Graphen multipliziert. Zwei auf derselben Welle
angeordnete Elemente haben dieselbe Drehgeschwindigkeit, trotz unterschiedlicher Größe.
Der Faktor jeder Paarung wird relativ zu ihren gerichteten lokalen Achsen definiert.
Bei räumlichen Achsen ist „gleichläufig“ ohne solche Bezugssysteme mehrdeutig.
Ein rückwärts durchlaufener Übertragungsgraph erlaubt nicht automatisch den Rückantrieb
einer Schnecke; kinematische Invertierbarkeit und mechanische Rücktreibbarkeit sind getrennt.

Beispiel: A trägt ein 20er Stirnrad. Es treibt ein 40er Rad auf B. Auf B sitzt außerdem
ein Kegelritzel mit 20 Zähnen, das ein 30er Kegelrad auf C antreibt. C trägt eine GT2-Scheibe
mit 20 Zähnen; die 40er Scheibe auf D ist der Ausgang. Betrag der Untersetzung:
2 × 1,5 × 2 = 6. B und C sind jeweils echte gemeinsame Wellen, ohne Zwischenkupplung.
Ob die vorgegebenen Endanschlüsse erreichbar sind, entscheiden zusätzlich Achswinkel,
Achsabstände, Riemenlänge, axiale Belegung und Hindernisse. Das Zahlenbeispiel allein
ist ausdrücklich noch keine konstruktiv gültige Lösung.

Geschlossene Schleifen verlangen später zusätzliche Drehzahl- und Phasenbedingungen.
Planetensätze und Differenziale besitzen weitere Freiheitsgrade und dürfen nicht
durch einfaches Multiplizieren eines beliebigen Pfades abgehandelt werden.

## 6. Bauraum, Kollisionsfreiheit und Montage

Zunächst Kugeln, Quader, Zylinder und konvexe Kombinationen; danach geschlossene Meshes
mit eindeutigem Innen-/Außenraum und Beschleunigungsstruktur oder Distanzfeld.
Nicht wasserdichte importierte Meshes dürfen keine scheinbar exakten Volumenprüfungen liefern.

Getrennte Raumklassen:

- Designraum für Mechanik und Tragstruktur, bei Bedarf getrennt definiert.
- Statische Hindernisse und explizite Ausnahmen wie Anschlussdurchführungen.
- Arbeitsräume rotierender Teile, bewegter Riemen und später linearer Elemente.
- Werkzeug-, Montage- und Wartungsräume; diese müssen nicht dauerhaft innerhalb
  des Betriebsbauraums liegen, brauchen aber ausdrücklich verfügbaren Zugang.
- Zu erhaltendes Material an Lagerpassungen, Schraubenauflagen und Mountings.

Prüfkaskade: günstige Hüllkörper und Boxen → genauere Körperabstände → detaillierte
Geometrie. Eine Überschneidung konservativer Hüllen ist zunächst ein Verdacht und
kann genauer geprüft werden; sie ist nicht automatisch eine echte Kollision.
Sicherheitsabstände gehören in die Abstandsfunktion, nicht nur in einen Mesh-Schnitttest.
Beabsichtigter Zahneingriff ist eine eng definierte Kontaktbeziehung, keine pauschale
Kollisionsausnahme für zwei vollständige Bauteile. Naben, Ringträger und andere Zähne
müssen weiterhin geprüft werden. Stichproben dürfen nicht als lückenloser Nachweis erscheinen.

Jede gemeinsame Welle benötigt Platz für beide Lagerstellen, Naben, Hülsen, Sicherung
und Montagefolge. Möglichst Lager beidseits des Rotorpakets; überhängende Anordnungen
nur als ausdrücklich erlaubtes, später lastseitig zu prüfendes Konzept. Kegel- und
Schneckenpaare benötigen axiale Abstützung. Keine zusätzliche radiale Führung allein
deshalb hinzufügen, weil ein weiteres Element auf derselben Welle sitzt.

Zuerst Montagegrammatik: abnehmbare Lagerdeckel, geschraubte Elemente, axiales Einfädeln,
geteilte Träger, Wellenenden und Werkzeugkorridore. Erzeuge eine Reihenfolge mit
Abhängigkeiten. Danach kann ein Bewegungsplaner Ein-/Ausbaupfade prüfen. Ein solcher
Planer prüft nicht automatisch, ob die Verzahnung oder die Übersetzung sinnvoll ist.

## 7. Tragstruktur aus Mountings und Lagerstellen

Kein vorgeschriebener rechteckiger Gehäusekasten. Ausgangspunkte sind äußere Mountings
und die generierten Lageraufnahmen. Jede lasttragende Aufnahme muss konstruktiv an
das befestigte Tragwerk angeschlossen sein; eine lose Insel ist kein gültiges Ergebnis.

Erster Generator: geschraubte Lagerpods mit Auflage-/Schraubenvolumen, verbunden durch
Streben und Rippen innerhalb des erlaubten Materialraums. Kandidaten für deren Verbindungen
werden unter Ausschluss aller Bewegungs- und Werkzeugräume erzeugt. Mindestquerschnitte,
Wandstärken, Schraubenrandabstände, zusammenhängende Struktur, Druckrichtung und
zugängliche Trennstellen sind explizite Regeln. Abdeckungen sind eine eigene optionale
Schicht. Ein graphischer Verbindungspfad allein beweist keine ausreichende Steifigkeit.

Wenn eine Lagerstelle nicht sinnvoll mit den Mountings verbunden werden kann, muss
die Getriebeplatzierung geändert oder verworfen werden. Mountings beeinflussen somit
bereits die Suche, nicht nur den abschließenden Look.

Das ist regelbasierte generative Konstruktion. Eine echte strukturelle Topologieoptimierung
folgt erst mit Materialkennwerten, Lastfällen, Lagerreaktionen, Randbedingungen und
Zielen wie Steifigkeit bei begrenztem Volumen. Ohne diese Größen erzeugte organische
Formen dürfen nicht als tragfähig optimiert bezeichnet werden. Später: FEM, mehrere
Lastfälle, erzwungene Fest-/Leerräume und Fertigungsbedingungen; das Ergebnis anschließend
in bearbeitbare Geometrie überführen und erneut prüfen.

## 8. Technische Umsetzung und Wiederverwendung

- React, Projekt-/Variantenverwaltung, Abbruch-/Worker-Infrastruktur weiterverwenden.
- Prolog/WASM: diskrete Familien, Parameterkompatibilität und Verhältnisse.
- TypeScript zunächst für Transformationen, analytische Platzierung, Graphsuche und
  Hüllkörperprüfungen. Numerische Optimierung als austauschbarer Worker-Baustein.
- OpenSCAD/BOSL2: Detailgeometrie und STL, nicht Rendern bei jedem Suchknoten.
- Die bestehenden Generatoren schrittweise in gemeinsame Wellen-, Paarungs-, Lager-
  und Befestigungsbausteine zerlegen. Keine weiteren Sonderfälle in `mixed.ts` anhäufen.
- Tatsächliche Katalog-/Paarungsdaten müssen Solver, Vorschau und Export gemeinsam treiben.
- Profiling entscheidet über spätere WASM-Bibliotheken. OMPL ist insbesondere ein
  Kandidat für Montagepfade; keine pauschale Lösung der Getriebesynthese.
- Projekte 1–5 weiterhin lesen. Alte Vorlagen entweder ausdrücklich als Legacy öffnen
  oder nachvollziehbar in den neuen Graphen übersetzen. Keine stille semantische Umdeutung.
- Suchlauf speichert Bibliotheks-/Katalogversion, Zufallsstart, Budget, Parameter und
  erreichte Prüfstufen. UI trennt Kinematik, Geometrie, Montage und Festigkeitsstatus.

## 9. Umsetzungsreihenfolge mit Abnahme

| Etappe | Lieferumfang | Abnahme |
| --- | --- | --- |
| H1: Graph und Anschlussrahmen | Neues Domänenmodell, gemeinsame Wellenbelegung, feste/freie Anschluss-Freiheitsgrade, Legacy-Adapter | Von Hand definierte Mischwelle mit Stirnrad und Kegelritzel; Roundtrip, identische Maße in Preview und Export; noch keine automatische Suche |
| H2: Paarungsbausteine | Stirnrad, GT2, Kegelrad, Schnecke; validierte Parameterbereiche und lokale Transformationen | Referenzpaare in beliebiger Weltorientierung; mehrere Kegelwinkel und Übersetzungen; fehlerhafte Paarungen abgelehnt; globale Drehung/Translation ändert Gültigkeit nicht |
| H3: Räumliche Suche | Zwei bis drei Paarungen, gemeinsame Wellen, freie Terminalorientierungen, bidirektionale Platzierung und numerische Anpassung | Das 6:1-Beispiel als echte Mischwellenkonstruktion, weitere Schnecken-/GT2-Kombination; Endlagen innerhalb expliziter Toleranz; Alternativen und ehrlicher Budgetstatus |
| H4: Räume und Lagerung | Erlaubte/verbotene Volumen, Lagerintervalle, axiale Sicherung und Montagegrammatik in der Suche | Hindernis erzwingt anderen Getriebeweg; kinematisch passende Lösung ohne Lagerplatz wird verworfen; Starrkörperinvarianz und Grenzfälle getestet |
| H5: Mounting-getriebene Struktur | Lagerpods, Streben/Rippen, Trennstellen, Schrauben und abgeleitete STL-Teile | Gleiche Kinematik mit anderem Mounting erzeugt andere Struktur; alle Lager angebunden, Freiräume und Montagezugang gewahrt; reales Muster montieren |
| H6: Breiterer Suchraum | Größere validierte Parameterbereiche, Innenverzahnung, mehr Stufen; später lineare Ausgänge und explizite Verzweigungen | Reproduzierbarer Benchmarkkorpus; Qualitäts-/Laufzeitvergleich; keine Regression bei drei Stufen |
| H7: Physikalische Optimierung | Lastmodell, FEM, Material-/Druckeigenschaften und anschließend Topologieoptimierung | Nachgerechnete Steifigkeit/Festigkeit und Versuchsabgleich statt nur optischer Plausibilität |

H1/H2 sind die nächsten konkreten Arbeiten. H3 muss schon grobe Lager-/Hindernisräume
reservieren; H4 vertieft sie, statt sie erst nachträglich einzuführen. Freie Orientierung
der Anschlüsse bedeutet ab H3 eine frei formulierbare Vorgabe, nicht die Garantie,
dass jeder Winkel mit dem freigegebenen Katalog und Stufenlimit erreichbar ist.

## 10. Noch fehlende Grundlagen

Heute fehlen der allgemeine Wellen-/Elementgraph, konsistente vollständige Portrahmen,
ein gemeinsamer Satz geometrischer Paarungsregeln, kontinuierliche 3D-Anpassung,
explizite Hüllkörper mit Kontaktsemantik, Montagegraph, benutzerdefinierte Volumen und
Mounting-getriebene Tragstruktur. Vorhanden und wiederverwendbar sind Browser/WASM,
mehrere Geometriegeneratoren, Katalogteile, Export und die bisherigen Regressionstests.

Die technische Hauptrisiken sind die kombinatorische Explosion, numerisch schwer
schließbare Ketten, zu optimistische Kontakt-/Montageprüfungen und ein riesiger
Parameterraum ohne geprüfte Zahngeometrie. Deshalb zuerst einen kleinen Parameterraum
wirklich frei kombinieren und verifizieren, danach erweitern.

## Quellen und Einordnung

Die Architektur und Etappen oben sind unser Projektvorschlag, keine aus einer Quelle
übernommene fertige Lösung. Zur technischen Abgrenzung geprüft:

- [BOSL2 gears.scad](https://github.com/BelfrySCAD/BOSL2/wiki/gears.scad): dokumentiert
  Zahnradfamilien und unter anderem den Achswinkelparameter bei Kegelrädern. Das ersetzt
  keine Validierung unseres gepinnten Generators und der vorgesehenen Parameterbereiche.
- [OMPL Constrained Planning](https://ompl.kavrakilab.org/core/constrainedPlanning):
  Bewegung auf einem durch Gleichungen eingeschränkten Konfigurationsraum; gewöhnliches
  freies Sampling trifft solche Räume im Allgemeinen nicht zuverlässig. Relevanz für
  numerische Einschränkungen und spätere Montagepfade, nicht als fertiger Getriebesolver.
- [DTU TopOpt](https://www.topopt.mek.dtu.dk/da/Apps-and-software/Interactive-2D-TopOpt-App):
  demonstriert Optimierung mit Lasten, Lagerungen, Volumenanteil und vorgeschriebenen
  Fest-/Leerräumen. Diese physikalischen Eingaben fehlen unserem bisherigen Modell.
