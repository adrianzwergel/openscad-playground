# Etappe F: räumliche Verzahnungspaare

Drei parametrisierte Baugruppen im Mechanismus-Menü: Innenverzahnung, Kegelradpaar und
Schnecke/Schneckenrad. Geometrie, Anschlüsse, Lagerpositionen, Gehäuse, Stückliste und
Einzelteil-STLs werden aus derselben Vorlage abgeleitet. Projektformat 4 speichert die
Auswahl unter `spatial`; ältere Projektdateien bleiben lesbar.

## Katalog und Achsen

Alle Vorlagen verwenden Modul 2 und 20° Eingriffswinkel. Die 5-mm-Metallwellen haben
5,1-mm-Nabenbohrungen. Backlash 0,15 mm und die Druckpassungen sind Musterwerte.

| Paarung | Katalog | Achsbeziehung | Untersetzung |
| --- | --- | --- | --- |
| Innenverzahnung | Ritzel 20, Hohlrad 60/80 | parallel, Abstand Zähne Hohlrad − 20 mm | 3 / 4 |
| Kegelräder | Ritzel 20, Gegenrad 20/40 | 90°, gemeinsame Teilkegelspitze | 1 / 2 |
| Schneckenpaar | Schnecke Ø24, Länge 24, 1/2 Gänge; Rad 30/40 | 90°, windschief | 15 / 20 / 30 / 40 |

Beim Schneckenpaar ist Modul 2 der Normalmodul. Mit Gangzahl `s` gilt
`cos(beta) = sqrt(1 - (s * 2 / 24)^2)`, Radteilkreisradius `z / cos(beta)` und
Achsabstand `z / cos(beta) + 12`. Einfach die Stirnrad-Radien zu addieren wäre falsch.
Schnecke und Rad sind rechtsgängig und haben dieselbe Gangzahl. Selbsthemmung wird nicht berechnet.

Die Ports enthalten Weltposition, normierte Achse und Wellendurchmesser. Positive Winkel
beziehen sich auf diese Achsen. Beim Hohlrad zeigen die Ports gegeneinander: Der negative
Winkelfaktor bedeutet hier gleichsinnigen Lauf in Weltkoordinaten. Beim Kegelrad ist der
Faktor negativ, beim Schneckenpaar positiv. Die Zahnphasen werden gemeinsam transformiert;
der Drehungsregler bewegt auch die Naben und die Hohlrad-Mitnehmerscheibe.

## Lagerung und Montage

- Hohlrad und Kegelräder: je zwei rückseitige 625-Radiallager in einer verschraubten Kassette.
  Die Räder sind überhängend gelagert. Eine Welle durch die Teilkegelspitze oder durch den
  Hohlradboden würde das Gegenbauteil schneiden. Die endlichen Wellen enden deshalb davor.
- Schneckenpaar: pro Welle ein Radiallager außen in der Kassette und ein zweites in der
  gegenüberliegenden Gehäusewand. Die zweite Aufnahme der gemeinsamen Kassette bleibt leer,
  damit keine dritte radiale Lagerstelle entsteht. Am Gegenlager keine axiale Klemmung.
- Je Welle zwei gegenüberliegende Axiallager (Hüllmaß 5 × 10 × 4 mm) zwischen Deckeln und
  Klemmringen. Radiallager: insgesamt vier 625 (5 × 16 × 5 mm). Lagerdeckel sind abnehmbar.
  Lager-/Klemmringabmessungen vor Beschaffung abgleichen; axiales Spiel am Muster einstellen.
- Hohlrad und Mitnehmerscheibe sind getrennte Druckteile, verbunden mit sechs Schrauben und
  Distanzhülsen. Das Ritzel wird von der offenen Stirnseite eingesetzt.
- Sechs abnehmbare 8-mm-Gehäuseplatten; Kassettenflansche mit M4, Platten und Deckel mit M3.
  Räder und Wellen im offenen Gehäuse einsetzen, Naben über Madenschrauben auf abgeflachten
  Wellen sichern. Deckel zuletzt schließen. Die Montageansicht nimmt zwei Platten ab.

Kassetten, Deckel und Platten werden flach auf Z=0 exportiert. Verzahnungen mit Naben können
Druckstützen benötigen. Gewindepiloten müssen nachgeschnitten werden. Das ZIP enthält alle
unterschiedlichen STL-Teile, Mengen, Kaufteile, Projektdatei, Prüfungen und `MONTAGE.txt`.
Die Kaufteile erscheinen als vereinfachte Hüllen; Schraubenköpfe und Werkzeuge sind nicht
vollständig geometrisch modelliert. Montagezugang beruht auf dem geöffneten Gehäuse.

## Freiräume und Prüfung

Wählbarer Gehäusefreiraum: 1–3 mm. Konservative Rotationshüllen begrenzen alle Rotoren
einschließlich Naben und Mitnehmer. Der Abstand dieser Hüllen zu den inneren Gehäuseflächen
und der Abstand der endlichen Wellen werden numerisch geprüft. Verletzungen sperren die
Geometrieerzeugung. Beabsichtigte Zahnkontakte sowie Lager-/Wellenpassungen sind getrennt davon.

`check-spatial.mjs` prüft Katalogvarianten, Achsen, gemeinsame Kegelspitze, Gangzahlen,
Abstände, Lagerstellen, Projektmigration und ungültige Eingaben.
`check-spatial-contact.mjs` rendert mit dem echten OpenSCAD-WASM Schnittmengen zwischen
Rotoren sowie zwischen Rotoren und geschlossenem Gehäuse/Lagerung. Getestet werden mehrere
Drehstellungen der Standardpaare sowie alternative Zähnezahlen und zweigängige Schnecken
bei minimalem Gehäusefreiraum. Stichproben sind kein vollständiger Zahneingriffsnachweis.
`check-spatial-browser.mjs` prüft Vorschauen, Export, lokale Speicherung, Abbruch und Neustart.
Die 32 unterschiedlichen STL-Dateien der drei Standardvorlagen müssen geschlossen,
zusammenhängend und auf dem Druckbett ausgerichtet sein.

## Bewusste Grenzen

Etappe F ergänzt eigenständige, begrenzte Baugruppen-Vorlagen. Die Prolog-Kettensuche aus
Etappe C kombiniert diese Paare noch nicht mit anderen Stufen; beliebige Anschlusslagen,
Kegelwinkel, Planetensätze und automatische Optimierung sind nicht enthalten.
Kräfte, Durchbiegung, Lagerlebensdauer, Schmierung und Selbsthemmung werden nicht ausgelegt.
Insbesondere die überhängende Lagerung braucht eine Lastprüfung. Softwareprüfungen ersetzen
keinen realen Druck-, Passungs- und Montageversuch; die physische Abnahme steht aus.
