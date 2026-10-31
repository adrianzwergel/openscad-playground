# Räumliche Graphsuche mit kontinuierlicher Anpassung

Die Browser-Suche erzeugt offene Ketten aus ein bis vier Stirnrad-, Kegelrad-, Schnecken- und GT2-Paarungen
auf gemeinsamen Wellen. Ein- und Ausgang behalten ihre festen Zielrahmen; frei
orientierte Weltkoordinaten sind möglich. Minimale und maximale Stufenzahl sind
getrennt einstellbar. Generative Gehäuse bleiben zurückgestellt.

## Suchverfahren

`robust-search.ts` gruppiert Provider-Katalogvarianten nach ihrer Drehübertragung.
Memoisierte Restübersetzungen begrenzen die Auswahl passender mehrstufiger Ketten. Reproduzierbare Mehrstarts wechseln fair zwischen Stufentiefen
und Typenfolgen. Ein vorhandener passender Graph ist ein zusätzlicher Startwert.
Die UI erlaubt 1 % Übersetzungsabweichung und maximal acht geprüfte Kandidaten.

`refine.ts` passt Azimute, Kegel-Achswinkel (60–120°) und axiale Sitze gemeinsam
kontinuierlich an. Gedämpfte kleinste Quadrate mit numerischer Jacobi-Matrix
minimieren den Anschlussfehler. Jede Auswertung baut die Kette mit analytischen
Paarungsregeln neu auf; Kontaktgeometrie und Zahnphasen bleiben dadurch gekoppelt.
Suchparameter und Zahnphase stammen aus dem jeweiligen Provider.
Zielrahmen werden nicht zur Fehlerkorrektur verschoben. Axiale Suchgrenzen:
erster Sitz 0–150 mm, weitere treibende Sitze 20–150 mm.

Diskrete Übersetzung und kontinuierliche Endlage werden getrennt gelöst. Gültige
Kinematik, feste Anschlüsse und konstruktive Hüllräume sind abschließende Filter.
Kollisionen werden derzeit durch andere Starts umgangen, nicht über Gradienten
im Optimierungsziel. Keine globale Vollständigkeitsgarantie: budget und
starts-exhausted bedeuten nicht, dass keine Lösung existiert. Das Budget von
100.000 zählt approximierte numerische Rechenarbeit, nicht verschiedene Graphen.
Kooperative Unterbrechung lässt Abbruch und Browserinteraktion zu.

## Konstruktive Filter

`construction.ts` prüft orientierte Hüllquader mittels Separating-Axis-Test mit
1 mm Mindestabstand. Die Hüllen umfassen drehende Rotoren, endliche Wellen,
Lager-/Deckelplätze (Radius 10 mm, axiale Breite 8 mm) und axialen Werkzeugzugang
(Radius 14 mm, Länge 19 mm). Wellenlängen werden an die reservierten Lagerstellen
angepasst. Bei späterer manueller Änderung prüft die UI die tatsächlich gespeicherte
Wellenlänge, ohne sie still zu ändern. Lagerpositionen und Ausschlussgründe werden
angezeigt und aus dem gespeicherten Graphen wieder berechnet.

Stirnradwellen erhalten Lagerplätze vor und hinter dem Elementpaket. Wellen mit
Kegelrädern verwenden vorerst zwei rückwärtige Lagerplätze mit überhängender
Verzahnung. Das ist eine geometrische Reservierung, kein Lastnachweis und keine
allgemein geeignete Lagerauslegung. Lager-/Werkzeughüllen werden nicht als fertige
CAD-Bauteile ausgegeben. Eigenwelle und zugehörige Sitze dürfen sich berühren;
ausdrücklich gepaarte Verzahnungen sind vom Rotor-Hüllvergleich ausgenommen.
Alle übrigen Hüllpaare müssen frei bleiben. Quadratische Hüllen sind konservativ
und können tatsächlich passende Anordnungen ablehnen.

Vollständige Einfädel-/Montagepfade, detaillierte Zahnkontaktprüfung über den
Bewegungszyklus, Nabenfixierung, Axiallager und Festigkeit bleiben ungeklärt und
werden so ausgewiesen. Kein Fertigungsnachweis. GT2 und Schnecken sind als individuelle Paarungen integriert; Riemenscheiben
werden als Kaufteil-Hüllen dargestellt. Geschlossene Schleifen sind nicht
Teil dieser offenen Kettensuche. Der alte Beam-Solver bleibt als Regression erhalten.

## Abnahme

`node scripts/check-robust-graph-search.mjs`: kalte Drei-/Vierstufensuche mit 8:1
und 16:1 in gedrehten Weltkoordinaten; kalte gemischte 6:1-/12:1-Suche mit schrägem
Ausgangsanschluss; gemischte Ketten mit gestörten Winkeln und
Positionen; feste Endanschlüsse, Übersetzung, Lagerlänge, Kollision und Abbruch.
Diese bekannten Fälle sind Regressionen, kein Vollständigkeitsbeweis.
`node scripts/check-graph-search-browser.mjs`: Übernahme, Speicherung und Abbruch
im Produktionsbuild auf Port 4001. `check-robust-graph-browser.mjs` prüft zusätzlich
die kalte Drei-/Vierstufensuche und gespeicherte Freiraumberichte im Browser.
`check-element-graph.mjs` und
`check-graph-search.mjs` sichern vorhandene Graph-/Paarungsfunktionen ab.


## Erweiterbare Suchprovider und Antriebe

`RelationRule.search` liefert den diskreten Katalog, kontinuierliche Parameter mit
Grenzen und die Phase des Gegenstücks. `transfers` liefert die Drehübertragung;
`mateFrames` die zulässige Partnerlage. Der Suchkern enthält keine Fallunterscheidung
für Stirnrad/Kegelrad/Schnecke/GT2. Er unterstützt gerichtete binäre Paarungen in
offenen Ketten. Geschlossene Schleifen und Mehrscheibenriemen benötigen weitere
Topologie- und Bewegungslogik; das ist keine allgemeine Gelenk-Synthese.

Familien liefern weiterhin Einzelteilgeometrie, Bohrung und Rotorhülle. Regeln
können zusätzliche Raumhüllen (`spaces`), Bewegungsreserven (`sweeps`), axiale
Freihaltezonen für Lager (`bearingSpans`) und verbindende CAD-Geometrie liefern.
Ein Platz für ein Zahnrad kann auf derselben Welle neben Schnecke, Schneckenrad
oder Riemenscheibe liegen. Die Suche setzt keine fertigen Getriebe aneinander.

- Schnecke: Modul 2, Durchmesser/Länge 24 mm, 1/2 Gänge, rechtshändig; Gegenrad
  20/30/40 Zähne, passende Gangzahl und Normalmodul. Rechtwinklige, windschiefe
  Achsen; Azimut kontinuierlich. Schneckenlager werden außerhalb der axial
  projizierten Gegenradhülle reserviert. Axiallager, Wirkungsgrad, Lasten und
  Rücktreibbarkeit bleiben ungeklärt.
- GT2: offene Zweischeibenführung, 20/30/40 Zähne, 6 mm Breite. Kataloglängen
  200/280/300/400/500/600/610/752/800 mm. Exakte Tangenten-Pitchlänge bestimmt den
  Betriebsachsabstand. Mindestens 120° Umschlingung und sechs Zähne im Eingriff.
  Standardreserve: 2 mm Entspannweg und 1 mm Nachspannweg; im JSON begrenzt auf
  2–10 bzw. 1–10 mm einstellbar. Die Scheiben erhalten keine vorgetäuschten
  druckbaren GT2-Zähne: CAD zeigt Kaufteil-, Flansch-, Naben- und Riemenhüllen.

Der Spannweg verschiebt keine festen Betriebsanschlüsse. Für den verstellbaren
Gegenkörper werden Rotoren, Welle, Lager und Zugang über den Stellweg konservativ
aufgeweitet. Der gesamte Riemenkorridor bleibt gegenüber fremden Teilen frei;
nur die zugehörigen Scheiben und ihre Wellen sind ausgenommen. Ein gemeinsamer
Träger mit weiteren Eingriffen kann zum Montieren zusätzliche Demontage benötigen.
Slack-Riemenverformung, vollständige Einfädelwege, Spannvorrichtung und Vorspannung
sind nicht nachgewiesen. Die Betriebsgeometrie bleibt von diesen Reserven getrennt.

Im Browser sind erlaubte Provider auswählbar. Drei neue Referenzen zeigen Schnecke
→ Stirnrad, Schnecke → GT2 und Stirnrad → GT2 → Schnecke. „Aktuelle Untersetzung als
Soll“ übernimmt ausdrücklich den Istwert; Variantenübernahme überschreibt das
gewünschte Soll nicht automatisch. Graphen bleiben mit Projektformat 6 speicherbar.

`node scripts/check-graph-drives.mjs` prüft einen zusätzlich registrierten Provider,
kalte gemischte Suche, gemeinsame Wellen, feste gedrehte Endrahmen, Übersetzungen,
Längen-/Spannregeln, Riemenkorridor-Kollisionen und JSON-Roundtrip.
`node scripts/check-graph-drives-browser.mjs` rendert alle drei Referenzen mit WASM,
prüft Speicherung und stichprobenartig tatsächliche Schnecken-Zahnüberschneidungen
bei verschiedenen Azimuten und Phasen. Stichproben sind kein Bewegungsnachweis.


## Lineare Endstufen und Bindungen

Spindel/Mutter und Ritzel/Zahnstange können jetzt die letzte Stufe einer gemischten
Kette bilden. Suche und Vergleich verwenden dann Vorschub in mm/U statt :1.
Neue Graphversion 2 trennt Trägerbewegung und Elementbindung; alte Graphen bleiben
lesbar. Hub, Bewegungshüllen, Referenzen und bewusst offene Führungsbedingungen:
[LINEAR-GRAPH.md](LINEAR-GRAPH.md).


## Automatische Wahl von Zwischenrad und Antriebswelle

Die Suche variiert nun auch die Verbindung zwischen benachbarten Stufen. Wenn
beide Provider `search.sharedRotor` freigeben und das getriebene Element der ersten
Paarung exakt dieselbe Familie und dieselben Katalogparameter wie das treibende
Element der nächsten Paarung hat, kann **ein einziges Element** beide Eingriffe
übernehmen. Es erhält `binding: free`; sein Träger wird `motion: fixed`. Die zwei
Relationen verweisen auf dieselbe Element-ID. Die Übersetzung läuft über diesen
freien Rotor, nicht über die feststehende Achse.

Aktuell ist diese Fähigkeit für externe Stirnradpaarungen freigegeben. Modul,
Zähnezahl, Breite, Bohrung und weitere Parameter müssen identisch sein.
Partnerabhängige Familien, verschiedene Elemente und Träger mit weiteren
unbeteiligten Elementen werden nicht zusammengelegt. Ein frei drehender starrer
Verbund verschiedener Elemente auf einer gemeinsamen Lagerhülse ist noch kein
Suchbaustein. Für solche Übergänge bleibt im aktuellen Modell die gemeinsame
Antriebswelle erhalten. Kegelrad-Geometrien und mehrere Riemen auf einer Scheibe
brauchen eigene Freigaberegeln.

`topology.ts` erzeugt die zulässigen Kombinationen unabhängiger Übergänge einer
geordneten offenen Kette. Bei vier Stufen sind das höchstens acht Varianten.
Die Variante mit Antriebswellen bleibt als Alternative erhalten. Ein Teil der
Katalogstarts bevorzugt kompatible Folgeelemente, damit Zwischenradmöglichkeiten
im begrenzten Budget nicht zufällig untergehen. Beide Topologien werden räumlich
verfeinert und auf Endanschlüsse, Übersetzung, Zahnphasen und Freiraum geprüft.

Ein gemeinsam verwendetes Element wird axial nicht ein zweites Mal unabhängig
optimiert. Seine Position und Phase ergeben sich bereits aus dem ersten Eingriff;
der zweite Eingriff verwendet genau diesen Zustand. Das verhindert einen
scheinbaren Freiheitsgrad und widersprüchliche Zahnphasen.

Deduplizierung berücksichtigt Bindungen, Trägerbewegung und Relationsanschlüsse.
Ergebnisse werden innerhalb der gefundenen Auswahl nach weniger antreibenden
Zwischenwellen, danach nach weniger Elementen geordnet. Der Browser zeigt freie
Zwischenräder, antreibende Zwischenwellen und Elementzahl je Kandidat. Das ist eine
kinematische Präferenz, kein Last-/Montageoptimum und keine Vollständigkeitsgarantie.

`node scripts/check-graph-idlers.mjs` prüft kalte Zwei-/Drei-/Vierstufensuchen mit
freien Zwischenrädern in gedrehten Weltkoordinaten, echte gemeinsame Element-IDs,
feststehende Achsen bei drehenden Rädern, feste Endanschlüsse, Freiräume und
Speicherung. Gegenproben: Zwei-Stufen-Untersetzung 4:1 benötigt mit diesem Katalog
eine Antriebswelle; verschiedene Teile und nicht freigegebene Provider bleiben
getrennt. Eine weitere kalte Suche kombiniert freies Zwischenrad und eine Welle
mit Zahnrad plus Schnecke.

`node scripts/check-graph-idlers-browser.mjs` prüft Suche, Ergebnisanzeige,
Übernahme, CAD, Speicherung, unabhängige Drehbewegung sowie tatsächliche
Zahnüberschneidungen beider Zwischenradkontakte in WASM-Stichproben. Führung,
Montage, reale Gleit-/Kugellager und Befestigung der festen Achsen bleiben offen.


## Freie starre Rotorverbünde (Graphversion 3)

Zwischen zwei Stufen kann die Suche jetzt drei Verbindungen prüfen: ein einzelnes
freies Zwischenrad, einen starren freien Verbund aus zwei Elementen oder eine
Antriebswelle. Ein Verbund behält beide Elemente und ihre axialen Plätze. Die
Elemente tragen `binding: free` und dieselbe `rotorGroup`; die Achse hat
`motion: fixed`. Ein eigener gemeinsamer Bewegungsknoten überträgt Drehmoment
zwischen den Mitgliedern, ohne die Achse oder andere lose Elemente anzutreiben.
Relative Winkelphasen bleiben bei Reflow und Animation konstant.

Neue Gruppen benötigen Graphversion 3. Versionen 1/2 bleiben lesbar. Import lehnt
Einzelmitglieder, achsübergreifende Gruppen, bewegte Gruppenachsen, feste Bindungen
innerhalb einer freien Gruppe und nicht freigegebene Familien ab. Eine Gruppe kann
nicht durch gleichzeitiges Drehen unabhängiger loser Elemente ersetzt werden.

Die Familienfreigabe `compoundRotor` gilt aktuell für Stirnrad, Kegelrad,
Schnecke/Schneckenrad, GT2-Scheibe und Zahnstangenritzel. Alle besitzen eine
Wellenbohrung im Modell. Eine massive TR8-Katalogspindel wird nicht stillschweigend
zu einer hohlen frei drehenden Spindel gemacht. Montage und Herstellbarkeit des
Verbunds sind durch diese kinematische Freigabe nicht nachgewiesen.

Bei höchstens vier Paarungen entstehen bis zu 27 Verbindungskombinationen. Die
vollständige Antriebswellenvariante wird unmittelbar nach der ersten freien
Variante geprüft. Gleiche Anfangsgeometrien nutzen die numerische Lageanpassung
wieder; Bindungen und Phasen werden anschließend erneut aufgebaut und alle
Kinematik-/Freiraumbedingungen geprüft. Deduplizierung und Speicherung unterscheiden
Gruppen von einzelnen freien Rotoren und Antriebswellen. Die begrenzte Suche
liefert weiterhin keine Vollständigkeits- oder Optimalitätsgarantie.

Zwischen den einander zugewandten Elementflächen wird eine konservative
Verbindungshülle reserviert: Radius mindestens 8 mm, bei größeren Bohrungen
mindestens Bohrungsradius plus 2 mm. Sie darf ihre Mitglieder und die eigene Achse
berühren, aber keine fremden Teile, Riemenkorridore oder Lager-/Werkzeugräume
schneiden. Der GT2-Stellweg bewegt auch diese Hülle. Die Hülle ist weder eine
konstruierte Nabe noch ein exportiertes Verbindungsteil. Die CAD-Ansicht zeigt
weiterhin die einzelnen Komponenten; der Browser benennt ihren Verbund.

Die Referenzen „Freies Doppelzahnrad“ und „Freier Zahnrad-GT2-Verbund“ haben jeweils
4:1. Diese Untersetzung benötigt zwei starr gekoppelte Elemente, aber nun keine
zwingend mitdrehende Achse mehr. Die frühere reine Zwischenrad-/Wellen-Gegenprobe
ist entsprechend erweitert: eine Antriebswelle bleibt eine gültige Alternative.

`check-graph-compounds.mjs` prüft kalte Suche mit beiden Alternativen, feste
Endanschlüsse, gemeinsame Drehzahlen, konstante Phasendifferenzen, stehende Achsen,
unabhängige lose Elemente, Verbindungshüllenkollisionen, Versionsprüfung und
Projekt-Roundtrip. `check-graph-compounds-browser.mjs` prüft beide CAD-Referenzen,
kalte Suche, Übernahme, Speicherung und gemeinsame Animation. Führung, konkrete
Verbindung, Lagerung und Montage bleiben später.


## Suchdurchsatz und Reichweite bei einem Achswechsel (31.10.2026)

Profiling zeigte drei Engpässe: Mit Sperrzonen lagen rund 95 % der Zeit in der
Lageoptimierung, davon etwa 60 % in paarweisen Separating-Axis-Tests, die für jede
Spalte der numerischen Jacobi-Matrix vollständig neu liefen. Ohne Sperrzonen lagen
rund 75 % in der Aufzählung der gerichteten Katalogketten. Die Optimierung wartete
außerdem alle fünf Iterationen auf einen Timer; im Browser-Worker werden solche
verschachtelten Timer gedrosselt.

- `separation` und `clearance` brechen ab, sobald ein Abstand von mindestens dem
  benötigten Wert bewiesen ist. Optimierung und Endprüfung brauchen nur
  `max(0, Grenze − Abstand)`; die Ergebnisse bleiben bitgenau gleich.
- Gerichtete Ketten: Achsabstände werden einmal pro Katalogpaar berechnet. Der
  Ringbereich paralleler Ketten schneidet Teilbäume schon während der Tiefensuche ab,
  wenn kein Blatt darin den Test bestehen kann. Reihenfolge und Auswahl der Routen
  bleiben gleich. Solange Beinahe-Treffer gesammelt werden, wird nicht abgeschnitten.
- Die Optimierung gibt zeitbasiert etwa alle 16 ms nach statt alle fünf Iterationen.
  Abbruch per `AbortSignal` bleibt möglich; der Worker wird ohnehin hart beendet.

**Reichweite bei genau einem Achswechsel** (`reach.ts`): Axiales Verschieben auf
Ein- und Ausgangswelle deckt die von beiden Achsen aufgespannte Ebene ab. Senkrecht
dazu, entlang w = u₀ × u₁, wirken nur die Achsabstände der parallelen Stufen und der
feste Versatz der Winkelpaarung (beim LEGO-Doppelkegelrad 0, bei Schnecken der
Achsversatz). Dieser Versatz hängt nicht vom Azimut ab. Ketten mit
|w·Δ − Versatz| > Summe der Achsabstände und Winkelpaarungen, die den geforderten
Achswinkel nicht erzeugen können, werden verworfen, bevor die Optimierung Budget
verbraucht. Das gilt für gerichtete und zufällige Starts (`rejections.reach`).
Es ist eine notwendige Bedingung: Axialgrenzen und Freiraum prüft weiterhin die
Optimierung. Bei Achs-Anschlüssen mit gedrehtem oder versetztem lokalem Rahmen, bei
linearen Ausgängen und bei mehreren Achswechseln greift der Test nicht.

Ohne diesen Test füllten bei rechtwinkligen LEGO-Zielen unerreichbare Kombinationen
die gerichteten Plätze; die Optimierung endete dort in echten stationären Punkten,
nicht am Iterationslimit.

**Endlage von beiden Enden** (`closure.ts`): Jede Welle trägt ein Zylindergelenk
aus axialem Sitz und Azimut, dazwischen liegen feste Paarungsversätze. Teilketten
werden vorwärts vom Eingang und rückwärts vom Ausgang gesampelt. Passt die Achse der
mittleren treibenden Welle zum Beginn der Rückwärtshälfte, folgen deren Sitz und
Azimut analytisch. Gesampelt wird in einem virtuellen Modell
`Welle·Tz(Sitz)·Rz(Azimut)·L(0)`. Bei Paarungen ohne Achswechsel dreht der Azimut
nur die Lage, nicht die Orientierung der Folgewelle. Dieser Rollversatz wird bei der
Umrechnung in echte Parameter an den nächsten Azimut und an die Endrolle
weitergegeben. Das Ergebnis ist ein Startwert; Endlage, Axialgrenzen und Freiraum
entscheiden weiterhin Optimierung und Endprüfung.

Eingesetzt wird das nur für Ketten mit Achswechsel:
- Gerichtete Routen: zuerst ein heuristischer Durchgang über alle Routen, danach
  Meet-in-the-Middle-Starts für die gescheiterten, vor weiteren heuristischen Lagen.
  Andernfalls verdrängen zusätzliche Versuche früher Routen die später passenden.
- Zufallsphase: Der Startwert ersetzt die rohe Zufallslage; die Umfahrungsstarts
  bauen auf der bereits geschlossenen Lage auf.

Benchmark `node scripts/bench-graph-search.mjs` (lokal; Zeit bis zur ersten Lösung /
Gesamtzeit / Lösungen):

| Fall | ursprünglich | Durchsatz + Reichweite | + beide Enden |
|---|---|---|---|
| free-4 | 0,83 s / 0,92 s / 8 | 0,03 s / 0,09 s / 8 | unverändert |
| detour-4 | 0,54 s / 25,6 s / 8 | 0,16 s / 8,6 s / 8 | unverändert |
| mixed-cold-4 | 113 s / 121 s / 1 | 16,5 s / 43 s / 2 | 0,63 s / 20 s / 8 |
| lego-angled-30 | – / 14 s / 0 | 0,04 s / 3,5 s / 8 | 0,03 s / 3,0 s / 8 |
| lego-angled-70 | – / 12,8 s / 0 | 0,05 s / 1,1 s / 8 | 0,04 s / 0,9 s / 8 |

free-4 und detour-4 liefern per Hash identische Lösungen wie ursprünglich.
`check-user-spatial-regression.mjs` liefert dieselben Lösungen bei gleichem Budget.

`node scripts/check-turn-reach.mjs` baut 400 zufällige gültige Ketten mit einem
Achswechsel (gedruckte und LEGO-Provider, zufällige Azimute, Kegelwinkel, Sitze und
Weltrahmen) und verlangt, dass jede davon erhalten bleibt. Um 1 m entlang w
verschobene Ziele müssen verworfen werden.

`node scripts/check-closure-seeds.mjs` konstruiert zufällige lösbare Ketten mit ein
oder zwei Achswechseln (gedruckt und LEGO) und verlangt, dass die Optimierung aus den
Meet-in-the-Middle-Starts mindestens so oft und fast immer schließt (lokal 36/36,
aus Zufallsstarts 28/36).
