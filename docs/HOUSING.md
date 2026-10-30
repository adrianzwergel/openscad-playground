# Etappe D — beidseitige Lagerung und Plattengehäuse

## Stand und Bedienung
Der konstruktive Softwareentwurf ist implementiert. Der im Plan vorgesehene reale Druck- und
Montageversuch steht noch aus. Es gibt keinen Festigkeits- oder Lebensdauernachweis.

Nach Auswahl einer Getriebeanordnung im Abschnitt **Lagerung & Gehäuse**:
- Plattendicke, Gehäusefreiraum, diametrales Lagersitz-Aufmaß und axiales Gesamtspiel einstellen.
- **Gehäuse montiert** zeigt Druckteile, Wellen, Lager, Hülsen und vereinfachte M4-Befestigung.
- **Platten abheben** verschiebt Platten, Lager und äußere Befestigung um jeweils 35 mm nach außen.
  Diese Ansicht zeigt die Öffnungsrichtung; sie ist keine vollständige Demontageanimation.
- Einzelne STLs erzeugen oder alle Druckteile als ZIP exportieren. Anschließend den Download-Link
  anklicken. Abbruch verwirft den unvollständigen Export. Projektänderungen verwerfen alte Dateien.

Die bisherige Verzahnungsvorschau bleibt verfügbar. Ihre Sammel-STL enthält keine Naben oder
Gehäuseteile und ist nicht der Fertigungsexport. Für den Aufbau die Einzelteile verwenden.
Die montierte Baugruppe enthält Kontaktflächen und Kaufteile und wird nicht als Druck-STL angeboten.

## Konstruktion
`housing.ts` verwendet die aufgelösten Wellen und Zahnradgruppen aus `model.ts`.
Ein starres Doppelzahnrad bildet ein gemeinsames Druckteil auf einer Welle.

Jede Welle wird oberhalb und unterhalb der gesamten Mechanik durch ein Lager **5 × 8 × 2,5 mm**
geführt. Beide Platten haben von innen zugängliche, 2,5 mm tiefe Lagersitze. Die äußere Schulter
hat eine 6,2-mm-Durchgangsbohrung für die 5-mm-Welle. Die Plattendicke beträgt standardmäßig
6 mm, mindestens 4 mm: hinter dem Lager bleiben mindestens 1,5 mm Material.
Der Sitzdurchmesser ist 8 mm plus einstellbares diametrales Aufmaß (Standard 0,15 mm).
Diese Werte sind Druck-/Passprobenparameter, keine bereits erprobten Passungen.

Vier gedruckte Abstandshalter (außen 12 mm, Bohrung 4,5 mm) bestimmen den Platteninnenabstand.
Vier M4-Gewindestangen verbinden die Platten; acht Muttern und acht Scheiben liegen außen und
sind zugänglich. Stangenlängen werden aus Abstand, Platten, nominalen Scheiben-/Mutternhöhen
und Überstand berechnet und auf 5 mm aufgerundet. Die Hardwarevorschau zeigt Hüllgeometrie
ohne Gewinde; die Maße der tatsächlich beschafften Schraubteile sind beim Zuschnitt zu prüfen.
Das Gehäuse ist ein offener Rahmen ohne Seitenwände oder Berührschutz.

## Wellen, Naben und axiale Positionierung
Jedes Zahnradpaket bekommt oberhalb seiner höchsten Zahnscheibe eine Nabe Ø14 × 8 mm.
Ein Ø2,5-mm-Radialloch dient als Pilot für ein nachträglich geschnittenes M3-Gewinde.
Eine M3 × 4 Madenschraube greift auf eine lokal abgeflachte 5-mm-Metallwelle. Die Schraube ist
versenkt; eine Auslegung des Gewindes oder der Klemmkraft wird nicht behauptet. Die Wellen-
und Nabensicherung muss beim physischen Versuch geprüft werden. Lagerlaufflächen bleiben rund.
Eine durchgehende Ø5,1-mm-Bohrung wird nach der Vereinigung aller Zahnrad-/Nabenkörper geschnitten.

Zwei zugeschnittene Metallhülsen je Welle (innen Ø5,1 / außen Ø6 mm) füllen die Abstände zwischen
Zahnradpaket und Lagerinnenringen. Diese dünnwandigen Hülsen sind **keine FDM-Druckteile**.
Die Summe aus unterer Hülse, Paket und oberer Hülse ist um das Gesamtspiel (Standard 0,3 mm)
kürzer als der Platteninnenabstand. Dadurch wird die Lagerung bei korrekten tatsächlichen Maßen
nicht axial vorgespannt. Die Hülse muss am gewählten Lager nur den Innenring berühren; Kontakt
zu Dichtung oder Außenring ist am konkreten Kaufteil auszuschließen.

Die verschraubten Zahnradpakete und Hülsen bilden eine zwischen den Lagern gefangene Kette.
Die äußeren Plattenschultern begrenzen den Lagerweg nach außen; das begrenzte innere Spiel
verhindert ein vollständiges Herauswandern der Lager nach innen. Die axiale Sicherung hängt
damit von fest sitzenden Zahnradnaben ab. Es werden keine zusätzlichen Sicherungsringe simuliert.
Wellen haben auf beiden Außenseiten 10 mm Anschlussüberstand; die Stückliste gibt Zuschnittlängen an.

## Freiräume und Montageweg
- Die Platten liegen außerhalb des gesamten Zahnrad-/Nabenpakets. Freiraum ist das Maximum
  aus Such-Mindestabstand und Gehäusefreiraum (Standard 2 mm).
- Kopfkreis-Hüllkörper der Räder und vier äußere Abstandshalter bleiben getrennt.
- Der bestehende Wellenkorridor wird auf den Nabenradius 7 mm plus Freiraum erweitert.
  Diese konservative Prüfung über die volle Höhe kann Varianten aus Etappe C ablehnen,
  obwohl die reine Verzahnung passt. Gehäuseexport und Gehäusevorschau sind dann gesperrt.
- Zwischen Lagersitzen bleiben mindestens 3 mm Material. Spiel muss kleiner als eine halbe
  Lagertiefe sein, Hülsenlängen müssen positiv und größer als 0,5 mm sein.
- Die obere Platte hat einen geraden axialen Weg über die Wellen. Alle Lagerbohrungen sind offen
  in Montagerichtung; keine geschlossenen Seitenwände verhindern das Einsetzen der Mechanik.

Die Getriebekette wird außerhalb des Rahmens auf den Wellen ausgerichtet und als gemeinsame
Gruppe in die unteren Lager eingesetzt. Gerade bei zwei Ebenen dürfen einzelne große Zahnräder
nicht durch bereits montierte Zahnräder geschoben werden. Obere Hülsen und Lager auffädeln,
obere Platte aufsetzen, M4-Verbindungen über Kreuz schließen. Bei mehreren Wellen kann eine
Montagehilfe nötig sein. Leichtlauf, Spiel und Passungen vor Betrieb prüfen.

Dies ist ein expliziter Montageweg für die offenen Stirnradketten, kein allgemeiner automatischer
Montageplaner mit Werkzeug- oder Handzugangssimulation. Detailkollision, Drucktoleranzen,
Lagerwahl unter Last und physische Funktionsfähigkeit bleiben offen.

## Druckdateien und Persistenz
Der ZIP enthält:
- `plate-bottom.stl`, `plate-top.stl`: je einmal, flache Außenseite unten, Taschen nach oben.
  Die obere Platte ist für diese Drucklage gespiegelt; bei der Montage umdrehen.
- `standoff.stl`: viermal drucken.
- `gear-N.stl`: ein vollständiges Zahnrad-/Nabenpaket je Welle, einschließlich starrer Verbindungen.
- `project.json`, `parts.json` (Druckmengen und Kauf-/Zuschnittteile), `MONTAGE.txt`.

STLs sind in Millimetern, mit Unterseite bei Z=0. Doppelzahnräder und horizontale Pilotbohrungen
können Stützmaterial oder Nacharbeit benötigen. Es wird keine stützfreie Druckbarkeit behauptet.

Projektformat bleibt Version 2 mit optionalem `housing`-Objekt: `plateThickness`, `clearance`,
`bearingFit`, `endplay`. Alte Version-1/2-Dateien verwenden die dokumentierten Standardwerte;
bei einer Änderung der Gehäuseparameter werden diese explizit mitgespeichert. Alle Längen mm.

## Verifikation
`node scripts/check-housing.mjs` prüft Lagerzahl, axiale Maßketten und Spiel, Freiräume,
Einzelteildefinitionen, ungültige Parameter, kollidierende Naben, Persistenz und Translation.
`node scripts/check-housing-browser.mjs` prüft die tatsächlichen WASM-Renderings beider Ansichten,
ZIP und Einzelteil-Downloads, Einstellungswiederherstellung, Abbruch/Neustart und Exportsperren.
Beim Doppelzahnrad-Beispiel werden alle sechs exportierten STL-Dateien auf geschlossene Kanten,
einen zusammenhängenden Körper und eine nichtnegative Z-Drucklage geprüft.

Noch ausstehende Abnahme: Passprobe drucken, Hardware beschaffen, vollständiges Muster montieren,
Spiel und Leichtlauf messen, Erfahrungen in Parameter und Montagehinweise zurückführen.
