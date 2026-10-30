# Lineare Ausgänge und explizite Elementbindungen

## Modell und Einheiten

Der Elementgraph unterstützt einen rotierenden Eingang und einen rotierenden oder
linearen Ausgang. `Body.motion` beschreibt `rotation`, `translation` oder `fixed`.
`Terminal.motion` beschreibt die gewünschte Anschlussbewegung; ein linearer
Anschluss enthält zusätzlich `stroke` in mm. Die lokale Z-Achse des linearen
Trägers ist die positive Verfahrrichtung. Der feste Zielrahmen ist die Referenzlage
bei Hubposition 0, nicht das Ende des Hubs.

Die numerischen Übertragungen sind dimensionsbehaftet: Rotation in Umdrehungen,
Translation in mm, jeweils pro Eingangsumdrehung. `RelationRule.motion` beschreibt
die Bewegungsarten beider Anschlüsse; fehlende Angaben bedeuten für alte Regeln
Rotation/Rotation. Ein Typwechsel ohne passende Paarung wird abgelehnt. `ratio`
bleibt nur für rotierende Ausgänge definiert. `mmPerTurn` ist der vorzeichenbehaftete
lineare Vorschub; `value` und `unit` liefern den vergleichbaren Betrag und die Einheit.
Die Suche vergleicht Beträge. Die gerichtete Ausgangsachse und das Vorzeichen zeigen,
in welche Richtung ein positiver Eingang dreht bzw. verfährt.

Neue Bewegungs- und Bindungsfelder benötigen **Graphversion 2**. Alte Graphen der
Version 1 bleiben lesbar und behalten ihre bisherige implizite feste Verbindung.
Projektformat 6 bleibt bestehen; ältere Anwendungen lehnen Graphversion 2 ab,
statt neue Freiheitsgrade unbemerkt zu verwerfen.

## Verbindungen zwischen Element und Träger

- `binding: fixed`: Element folgt der Bewegung seines Trägers. Bei einer Welle
  wird Drehung übertragen; bei einem linearen Träger wird das Element mitgenommen.
- `binding: free`: eigener rotatorischer Freiheitsgrad auf der Achse. Die Bewegung
  wird nicht an den Träger oder andere Elemente auf ihm weitergegeben. Mehrere
  Paarungen am selben freien Element teilen dessen Bewegung.
- `binding: sliding`: Drehung wird übertragen, axiale Verschiebung bleibt frei.
  Das Modell meldet die unbestimmte axiale Bewegung als offene Bedingung. Dies ist
  keine Führung und ergibt allein keinen linearen Vorschub.

Die Bewegungsgleichungen verwenden separate Knoten für freie Rotoren. Ein freies
Zahnrad auf einer feststehenden Achse kann daher als Zwischenrad wirken, ohne die
Achse anzutreiben. `Terminal.element` kann einen solchen Rotor ausdrücklich als
Anschluss auswählen. Die automatische Suche kann inzwischen identische Stirnräder als freie
Zwischenräder auf festen Achsen verbinden. Andere Übergänge verwenden gemeinsame
Antriebswellen; weitere freie/slidende Bindungen sind manuell konfigurierbar und
prüfbar. Siehe [GRAPH-SEARCH.md](GRAPH-SEARCH.md). Die Suche nimmt Trägeranschlüsse entgegen, keine freien Elementanschlüsse.

D-Profil, Rundwelle, Passfeder, Klemmnabe, Lager und Sicherung sind noch keine neuen
Montagekataloge. Die Bindung beschreibt zunächst die kinematische Absicht. Die
bekannten Bohrungs-/Wellenprüfungen bleiben bestehen.

## Spindel und Zahnstange

Der feste Katalog wurde um diese Familien erweitert; die Suche erzeugt keine
kundenspezifischen Zähnezahlen oder Längen:

- TR8-Spindel: 200 mm Länge, 2 oder 8 mm Vorschub/U. Passende Mutter mit 16 mm
  axialer Hülle und 22 mm Außendurchmesser. Referenzposition 30 mm ab Spindelbeginn,
  Hub 1–140 mm. Nutzlänge und Endreserve werden geprüft. CAD zeigt Kaufteil-Hüllen
  ohne Gewinde; reale Passungen, Befestigung und Axiallager bleiben offen.
- Ritzel/Zahnstange: Modul 2, Ritzel 20/30/40 Zähne, Zahnstange 41 Zähne, Breite
  10 mm. Hub 1–200 mm. Mindestüberdeckung von 20 mm an den Hubenden. Die
  Zahnstange verwendet eine rechteckige Querschnittshülle und einen axialen
  Zahnphasenversatz in mm. Rotatorische Elemente verwenden weiterhin Grad.

Beide Paarungen enden auf einem linearen Träger. Dessen Orientierung bleibt
konstant: die Mutter dreht nicht mit, die Zahnstange verschiebt sich entlang ihrer
Längsachse. Die erforderliche Führung und Verdrehsicherung sind ausdrücklich
**offene konstruktive Voraussetzungen**, keine erzeugten Bauteile.

Beispiel: GT2 20:40 und eine Spindel mit 8 mm/U ergeben 4 mm Vorschub pro
Eingangsumdrehung. Schnecke 2:30, GT2 20:40 und dieselbe Spindel ergeben 8/30 mm/U.
Eine vorangehende Stirnradpaarung kann das Vorzeichen des Vorschubs umkehren.

## Suche, Freiraum und Vorschau

Die Suche baut bis vier Stufen auf, mit der linearen Paarung als letzter Stufe.
Die Restübersetzungsprüfung berücksichtigt den Bewegungstyp; lineare Übertragungen
können nicht wie weitere Zahnradstufen mitten in einer rotierenden Kette stehen.
Der gewünschte Hub fließt in die Katalogprüfung ein. Drehstufen davor verwenden
weiterhin gemeinsame Wellen, analytische Paarungspositionen und kontinuierliche
Winkel-/Sitzoptimierung. Start und Endanschluss bleiben unverändert.

Die linearen Elementhüllen werden über den **gesamten Hub** erweitert. Fremde
Elemente, Wellen und reservierte Lager-/Werkzeugräume dürfen diese Hülle nicht
schneiden. Vorgesehene Paarungskontakte sind ausgenommen; bei der Spindelmutter
auch die zugehörige Spindel-Trägerwelle. Das sind konservative Geometrieprüfungen,
keine Last-, Führungs- oder Montageauslegung.

Im Browser gibt es Ausgangstyp und Hub als Suchvorgaben sowie Bindungs- und
Trägerbewegungseditoren. Eine geänderte Vorgabe kann einen bestehenden Aufbau
ungültig machen, bis eine neue Lösung übernommen wird. Sollwerte werden nicht bei
jeder Variantenübernahme durch den Istwert ersetzt. Die Vorschau zeigt einen
schematischen Hin-/Rücklauf: alle Drehbewegungen werden aus demselben wirksamen
Eingangswinkel berechnet. Ein Hubregler erlaubt die direkte Prüfung einer Position.
Die CAD-Detailansicht bleibt eine statische Referenzlage.

## Abnahme und Grenzen

`node scripts/check-graph-linear.mjs`: frei drehendes Zwischenrad, entkoppelte
Träger, freie Ausgangselemente, Sliding-Warnung, Einheitentrennung, Vorschub,
Hubgrenzen, Bewegungshüllenkollision, Animation, Projekt-Roundtrip und kalte Suche
für GT2/Spindel, Stirnrad/Zahnstange und Schnecke/GT2/Spindel in gedrehten Rahmen.

`node scripts/check-graph-linear-browser.mjs`: CAD aller Referenzen, Translation,
freies Zwischenrad, Suchen/Übernehmen/Speichern sowie reale WASM-Schnittmengen von
Ritzel und Zahnstange bei Hubpositionen 0/50/100 mm und Azimuten 0/37 Grad.
Stichproben sind kein lückenloser Zahnkontakt- oder Fertigungsnachweis.

Noch offen: konstruktive Führung, Montageverbindungen und Wellenprofile, konkrete
Lager, Lasten, vollständige Montagewege, frei gekoppelte Mehrkörper-/Gelenksynthese,
geschlossene Schleifen und lineare Eingänge. Generatives Gehäuse bleibt später.
