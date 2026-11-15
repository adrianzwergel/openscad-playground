# Getriebe-Generator

Eine eigene Seite neben Studio und Wellen-Generator. Fertige Wellen aus dem Wellen-Generator werden senkrecht auf eine
Ebene gestellt; was kämmt oder mit einem Riemen läuft, sagt man an, der Generator setzt die Achsabstände. Aus den Lagern
entsteht ein Gestell aus Flachmaterial: Ringe um die Lager, Stege dazwischen, Schicht für Schicht, mit Distanzbolzen
verschraubt. Ausgabe wie beim Wellen-Generator: STEP und STL je Platte, Baugruppe, ZIP.

Ziel wie dort: **einfach**. Nichts wird gezeichnet, was sich ableiten lässt.

## Stand

| Schritt | Stand |
|---|---|
| 1 | fertig: `getriebe.html` (Karte auf der Studio-Startseite), Getriebe als eigene Dateien (OPFS-Ordner `getriebe`, Format `gear-1`), Wellen verknüpft mit dem Ordner `wellen`; `src/gear/model.ts`, `plan.ts` (`planGear`: Welt aus den Wellen, Eingriffe, Riemen mit Normlänge, Drehzahlen, Klemmen, Schichten aus den Lagerhöhen, Stege kämmend/kürzeste/von Hand, Freilöcher, Platten gegen Räder, Riemen und Hülsen, Rad am eigenen Lager), `draw.ts` (Draufsicht je Schicht), zwei Beispiele, die ihre Wellen in den Wellen-Generator schreiben. Prüfung: `scripts/gear/check-plan.mjs`, `scripts/gear/check-page-browser.mjs` |
| 2 | fertig: `editor.ts`: Wellen aus der Liste ziehen oder klicken (ein Klick setzt die Welle gleich kämmend an ein passendes Rad), in der Draufsicht verschieben mit Einrasten im Eingriff im Winkelraster um das Partnerrad, sonst mm-Raster (`snap.ts`, Alt: frei); Winkel um den Partner, x/y/z, umgedreht, Eingang in den Eigenschaften; Riemen an Scheiben hinzufügen und entfernen; Stege anklicken und entfernen, in der Schicht hinzufügen oder wiederherstellen; Schichten von der Seite als Bänder (verschieben, Kanten ziehen; die erste Änderung macht aus den vorgeschlagenen Schichten feste), ＋ Schicht, „Schichten automatisch“; Rückgängig, Entf, Speichern. „Im Wellen-Generator öffnen“ geht über `welle.html#open=<id>` (ein Anker, weil der lokale Server die Query beim Umleiten verliert). Prüfung: `scripts/gear/check-snap.mjs`, `scripts/gear/check-page-browser.mjs` |
| 3 | fertig: `cad.ts`: je Schicht ein Umriss in 2D (Ringe, Tangenten-Stege, Bolzenaugen mit Steg zum nächsten Lager) minus Bord-Öffnungen, Freilöcher und Bolzenlöcher, einmal unten (Bandboden bis Trennfuge) und einmal oben extrudiert, dann je Lager die halbe Tasche (Ø + `fit`); Säulen zwischen den Schichten; die verknüpften Wellen mit allen Teilen aufrecht an ihrem Platz. Bolzen (`planBolts`): Plätze rund um jedes Lager, auch weiter außen, frei von Rädern, Riemen, Hülsen und Wellen über die ganze Höhe, die drei bis vier am weitesten verteilten; Schraube DIN 912 durch den ganzen Stapel, sonst Gewindestange. Vorschau, Dateien je Platte und Säulenspalt, Baugruppe, ZIP mit den Wellen, `stueckliste.csv` und `zusammenbau.txt`. Derselbe CAD-Worker wie beim Wellen-Generator (`gear: true`). Prüfung: `scripts/gear/check-cad.mjs`, `scripts/gear/check-cad-browser.mjs` |
| 4 | fertig: Steg im Weg wird rot gezeichnet und gemeldet; in den Eigenschaften des Stegs „Außen herum“ (Streben gleicher Breite über einen Punkt neben jedem Hindernis, die kürzere freie Seite, notfalls weiter außen), „In die Tiefe“ (der Steg nur so hoch, dass er unter bzw. über dem Teil bleibt, ab 2 mm; Hinweis mit der Dicke), „Gerade“ und „Steg entfernen“; gespeichert in `webs.route`. Die Platte baut Umweg-Streben in den Umriss und abgesenkte Stege als eigenes niedrigeres Stück. Bolzen hängen am nächsten Lager mit freiem Weg, Bolzenplätze ohne solchen Weg fallen weg; die Draufsicht zeigt die Bolzenaugen. Beispiel „Steg am Rad vorbei“. Prüfung: `scripts/gear/check-route.mjs`, Volumen Platte ∩ Rad in `check-cad.mjs`, Bedienung in `check-page-browser.mjs` |
| 5 | fertig: Ein Motor ist eine Motorwelle aus dem Katalog in einer verknüpften Welle; der Flansch liegt Steckungstiefe minus Motorwellenlänge vom Wellenende. Liegt er an der Außenseite einer Schicht (Körper nach außen), wird er Knoten dieser Platte: rundes Flanschfeld (Bohrbild + Rand), Zentrierloch und vier Schraublöcher aus NopSCADlib, keine Tasche. Sonst eine Warnung mit dem Versatz und der Knopf „Motor an die Platte setzen“. Treibt er einen Riemen, werden Zentrierung und Schraublöcher Langlöcher in Riemenrichtung (`slot`, Vorgabe 6 mm); die Riemenlänge wird über den Spannweg geprüft, `centerFor` gibt den Achsabstand für den Normriemen, Knopf „Auf Normriemen stellen“. Riemen ohne Spannweg müssen genau passen. Motorkörper in der Baugruppe. Beispiel „Motor mit Riemen“. Prüfung: `scripts/gear/check-motor.mjs` |
| 6 | fertig: „Welle bearbeiten“ und „＋ Neue Welle anlegen“ öffnen den Wellen-Generator als Fenster über dem Getriebe (`welle.html#open=<id>&embed=1` bzw. `#new=1&embed=1` im iframe; eingebettet ohne Studio-Link, „Alle Wellen“ und „Löschen“). Die Wellen-Seite meldet jedes Speichern und das Anlegen per `postMessage` (gleicher Ursprung); das Getriebe liest die Wellen dann neu und zieht mit. Eine neue Welle steht beim Schließen im Getriebe (wie ein Klick in der Liste). „In neuem Tab ↗“ bleibt. Prüfung: `scripts/gear/check-page-browser.mjs` |

**Platten (geändert 2026-11-15):** Vorgabe ist eine Platte je Schicht. Die Welle ist mit Rädern, Hülsen und Lagern für sich axial fest, also reichen Anschläge ganz außen: die unterste Schicht hat den Bord unten (Taschen von oben eingesetzt), die oberste oben, mittlere Schichten haben durchgehende Bohrungen ohne Anschlag. Bei nur einer Schicht hält sonst nichts die andere Richtung: sie wird das Plattenpaar, das die Lager einklemmt. „Lager einklemmen“ in den Regeln macht jede Schicht zum Plattenpaar. Prüfung in `check-plan.mjs` und `check-cad.mjs`.

**Sicherungsringe (2026-11-15):** Ein Ring aus dem Wellen-Generator (DIN 471 oder DIN 6799) ist im Getriebe ein Hindernis mit dem Platz, den er braucht: bei DIN 471 der Freiraum d4 (Laschen und Zange), bei DIN 6799 der Außen-Ø d3. Liegt er im Bord neben seinem Lager, öffnet sich der Bord dort auf diesen Platz plus Abstand. Hält der Bord dann den Außenring nicht mehr (Öffnung über D/2 − (D − d)/8), kommt eine Warnung; bei einem E-Ring im Bord der Hinweis, dass er vor der Platte auf die Welle muss. In einer Nabe ist ein Ring ein Fehler. Geht eine Welle mit Ring in der Plattenhöhe durch ein Freiloch, wird das Loch so weit wie der Ring. Ringe kommen nach dem Einsetzen der Welle drauf und öffnen deshalb kein Freiloch zum Rand. In der 3D-Vorschau ist der Ring als flache Scheibe in seiner Nut zu sehen, in der Seitenansicht als schmaler heller Streifen. Prüfung: `scripts/gear/check-clips.mjs`.

**Freilöcher:** Schneidet das Loch einer durchlaufenden Welle in die Platte (in einen Ring, Steg oder Umweg), bekommt die Platte vorher einen Ring Material darum (Loch + Rand der Schicht). Das gilt auch für die Stege zu den Bolzenaugen, die erst nach den Schichten geplant werden. So bleibt um das Loch immer Material und die Platte ein Stück; trifft dieser Ring ein Rad, einen Riemen oder eine Hülse, wird es gemeldet. **Offene Freilöcher:** Die unterste Platte nimmt die Wellen von oben auf, jede andere Platte wird von oben über die Wellen geschoben. Trägt eine durchlaufende Welle auf dieser Seite etwas, das größer als ihr Freiloch ist (Rad, Lager, Hülse), wird das Loch zum Schlitz in Lochbreite bis zum Rand der Platte; der Ring darum bleibt als Hufeisen. Gewählt wird der kürzeste Weg nach draußen, der am wenigsten Platte außerhalb des eigenen Rings wegschneidet, und nie durch einen Lager-Ring. Ein Hinweis nennt, was nicht durchpasst; geht es nirgends, eine Warnung. Sonst bleibt das Loch geschlossen. Prüfung: `scripts/gear/check-holes.mjs`.

**2D-Umriss robust:** Liegt ein Kreis in einem anderen oder berührt ihn innen (etwa ein Bolzenauge im Ring eines Lagers), ist die Hülle der größere Kreis; OpenCascade kann solche Berührungen nicht vereinigen. Die Naht jedes Kreises liegt nicht auf den Achsen (Raster-Treffer).

**Motorplatte:** Den Motor setzt man im Wellen-Editor an die Welle (Spur „Motor“); seine Lage legt den Flansch fest. Liegt der Flansch an der Außenseite einer Schicht, wird diese Platte genutzt; sonst bekommt der Motor eine eigene Motorplatte (Schicht ohne Lager, `LayerPlan.motor`) am Flansch, `motorPlate` dick (Vorgabe 5 mm), auf der dem Körper abgewandten Seite, mit Flanschfeld, Zentrierung und Schraublöchern (Langlöcher beim Riemen), über Bolzen und Säulen am Rest. Liegt der Flansch höchstens 6 mm neben einer Schicht, schlägt ein Hinweis vor, ihn dorthin zu setzen (Knopf an der Welle). Überschneidet die Motorplatte eine Schicht, ist das ein Fehler. Der Motorkörper kommt mit den Teilen der Welle. Prüfung: `scripts/gear/check-motor.mjs`.

**Bolzen von Hand:** In der Draufsicht greifbar (gestrichelter Ring ums Loch). Der erste Zug macht aus den vorgeschlagenen Plätzen feste (`bolts`, gleiche Reihenfolge), gezogen wird im mm-Raster (Alt: frei). Ein Bolzen auf einem Rad, Lager oder einer Welle wird rot und gemeldet; die Meldung wählt ihn aus. Eigenschaften: x/y, ＋ Bolzen, Bolzen entfernen, Bolzen automatisch. Nach dem Schließen des Wellen-Fensters gehört die Tastatur wieder dem Getriebe.

## Bewegliches (2026-11-15)

Bis hierher stand jede Welle fest und alles auf ihr war rund; wie weit sie dreht, war egal. Jetzt kennt der Plan, was sich gegen was bewegt.

- **Hebel:** ein gedrucktes Teil im Wellen-Generator (`docs/WELLE.md`), nicht rund, dreht mit seiner Welle. In der Ebene zeigt er bei Winkel 0° nach −x (längs der Welle wird x zu z), umgedreht gespiegelt; `PlacedShaft.turn` dreht die Welle, wie sie steht.
- **Drehbereich** (`GearDoc.turn`): an einer Welle gesetzt, von–bis in Grad ab der gezeichneten Stellung. Die anderen Wellen folgen über die Übersetzungen (`turnRate`), solange keine bewegte Schwinge dazwischen liegt. Ohne Bereich, oder ab 360°, dreht alles endlos.
- **Schwenkfläche:** ein Hebel überstreicht einen Fächer um seine Achse (endlos: den vollen Kreis). Er ist ein Hindernis wie Rad und Riemen (`Obstacle.spin`), also weichen ihm Ringe, Stege (außen herum, in die Tiefe), Freiloch-Ringe und Bolzen von selbst aus. Ein Hebel in der Höhe einer Platte an seiner eigenen Welle ist ein Fehler.
- **Schwinge** (`GearDoc.groups`): Wellen, die gemeinsam um die Achse einer Welle (`pivot`) schwenken, von–bis gegen den Uhrzeigersinn. Sie ist ein eigener Körper mit eigenen Platten, Bolzen und Säulen (`LayerPlan.body`, `Bolt.body`, `Columns.body`). Ihre Schichten entstehen aus den Lagern ihrer Wellen; Lager der Drehachse in derselben Höhe gehören zu ihr (dort hängt sie), die übrigen halten die Achse im Gestell. Schichten von Hand tragen `group`.
- **Eingriff über Körper hinweg:** um die Drehachse bleibt der Achsabstand, der Eingriff hält. Sonst kämmt es nur in der gezeichneten Stellung (Warnung); läuft das Rad beim Schwenken in den Partner, ist es ein Fehler. Ein Riemen zu einer schwenkenden Scheibe wird durch Schwenken gespannt (`BeltPlan.swing`), der Motor braucht dann keine Langlöcher. Eine Schwinge, die nur einen Motor trägt, bekommt seine Motorplatte mit dem Lager der Drehachse darin.
- **Jeder Körper sieht die anderen als das, was sie gegen ihn überstreichen** (`view` in `plan.ts`, Geometrie in `sweep.ts`): eine Scheibe wird zum Band entlang eines Bogens, ein Hebel auf der Drehachse zum weiteren Fächer (beides mit genauem Abstand), alles andere wird in Winkelschritten abgetastet. Aus Sicht der Schwinge schwenkt das Gestell rückwärts.
- **Ausschnitt im Bogen:** geht eine Welle durch die Platte eines Körpers, gegen den sie schwenkt, ist ihr Freiloch ein Langloch entlang des Bogens (`Hole.arc`), mit Materialrand, wo es in die Platte schneidet. Schwenkt sie durch ein Lager der Platte, ist es ein Fehler.
- **Zusätzlich geprüft:** alles, was sich gegeneinander bewegt, paarweise in gemeinsamer Höhe (Hebel, Räder, Hülsen, Lager, Wellen, Motorkörper): „stößt beim Drehen/Schwenken an“. Zwei Hebel, die gekoppelt drehen, werden Stellung für Stellung geprüft statt Fächer gegen Fächer. Platten verschiedener Körper in derselben Höhe; Säulen gegen fremde Platten; Schwinge hängt an der Drehachse, Drehachse im Gestell gelagert.
- **Stellung:** Regler über der Draufsicht (Drehung, je Schwinge) zeigen das Getriebe in einer Stellung, auch in 3D. Gespeichert und gefertigt wird immer die gezeichnete Stellung; ein Griff an eine Welle oder einen Bolzen stellt sie wieder her.
- **Bedienung:** Drehbereich und „＋ Schwinge um diese Welle“ an der Welle; die Schwinge mit Name, Drehachse, Bereich und ihren Wellen als eigenes Feld; Beispiele „Abtrieb mit Hebel“ und „Schwinge um die Antriebsachse“.
- **Nicht dabei:** Endanschläge (zweiter Schritt, bisher nur die Prüfung), Schieben (Zahnstange, Schlitten), Schwinge auf einer Schwinge, zwei Schwingen in derselben Höhe durch dieselbe Platte. Ein Hebel auf einer Schwingen-Welle gilt gegen andere Körper als Scheibe seiner Reichweite. Die Motor-Langlöcher drehen in der Stellungs-Ansicht nicht mit.

Die Hülle zweier Scheiben hat jetzt einen genauen Abstand (`capsuleDistance`) statt 64 Stützpunkten, und im Umriss wird erst das Tangenten-Viereck angefügt, dann die zweite Scheibe: ein Bolzenauge direkt am Ring berührt ihn nur, und diese Fast-Berührung vertragen die 2D-Booleans nicht als Kante.

Prüfung: `scripts/gear/check-swing.mjs` (Hebel, Drehbereich, Geometrie), `check-group.mjs` (Schwinge, Bogen-Ausschnitt, Volumen, Stellung), `check-moving-browser.mjs`.

## Glieder: Hebel fest, Losrad, Glied an Glied (2026-11-15)

Damit es am Hebel weitergeht, ist er ein Körper im Getriebe wie die Schwinge, nur anders gelagert.

- **Fest oder frei** (`Group.fixed`): ein festes Glied („Hebel“) sitzt mit einer **Nabe im Profil der Welle** auf seiner Drehachse und dreht mit ihr; ein freies („Schwinge“) hängt wie bisher an Lagern. Die Nabe ist ein Knoten der Platte wie ein Lager (`Bearing.hub`, Wand `HUB_WALL`), die Bohrung geht durch die Platte, gedreht wie die Welle steht. Auf rundem Sitz gibt es ein Kernloch für eine Madenschraube M3 und einen Hinweis auf „Abschnitt von Hand“. Reicht die Welle nicht durch die Platte, wird es gemeldet.
- **Glied an Glied:** die Drehachse darf eine Welle eines anderen Glieds sein (`GroupPlan.parent`); eine Kette, die an sich selbst hängt, ist ein Fehler. Was ein Körper vom anderen sieht, sind alle Bewegungen dazwischen nacheinander (`relative`, `sweepPrims`): die letzte genau, die davor in Schritten. Ein Ausschnitt im Bogen entsteht nur bei einer einzigen Bewegung dazwischen.
- **Losrad** (Wellen-Generator, `OnItem.free`): ein Rad oder eine Scheibe, die frei auf der Welle läuft, mit runder Bohrung als Gleitsitz. Im Getriebe ist es ein eigener Läufer. So bleiben mehrere Motoren im Gestell: das Losrad auf der Gelenkachse treibt durch das Gelenk hindurch ein Rad auf dem Hebel.
- **Drehzahlen als Löser** (`drive` im Plan): Läufer sind Wellen, Losräder und Glieder; jeder dreht als Summe der Antriebe. Ein Eingriff oder Riemen koppelt zwei Läufer aus Sicht des Körpers, der beide Achsen trägt, also rollt ein Rad auf dem Hebel am Rad seiner Drehachse ab, wenn der Hebel schwenkt. Antriebe: der Eingang, dann jede Motorwelle, die noch nichts dreht, dann jedes freie Glied („von Hand“). Daraus: je Gelenk, wovon es bewegt wird (gekoppelte Gelenke werden so genannt), und wie weit jeder Motor für alle Bereiche drehen muss (`needs`). Ein fester Hebel ohne Antrieb wird gemeldet. `rates` bleibt der Anteil des ersten Eingangs.
- **Bedienung:** an der Welle „＋ Hebel fest auf dieser Welle“ oder „＋ Schwinge frei um diese Welle“; im Feld des Glieds „Sitzt auf der Achse: fest/frei“ und „Bewegt von“. Ist das Feld offen, kommt eine Welle aus der Liste per Klick oder Ziehen gleich auf das Glied. Die Liste „Antrieb“ nennt Losräder, Gelenke und Motorwege. Beispiel „Zwei Gelenke, beide Motoren im Gestell“.
- **Nicht dabei:** die Regler stellen Gelenke, nicht Motoren (die Kopplung steht in der Liste, wird aber nicht vorgeführt); Bereiche gelten je Gelenk unabhängig.

Prüfung: `scripts/gear/check-links.mjs`, `check-links-browser.mjs`.

## Ansichten (2026-11-15)

- **Draufsicht:** alle Platten; die aktive deckend, die anderen durchsichtig darunter, jeder Körper in seiner Farbe (Gestell, dann jedes Glied; die Reiter tragen denselben Punkt). Ein Klick auf eine durchsichtige Platte macht sie aktiv.
- **Höhen von der Seite, wie die Zeitleiste des Wellen-Editors:** jede Welle ist eine Spur, seitlich gezogen verschiebt sie sich in der Höhe (`snapHeight` in `snap.ts`). Sie rastet ein, wo eines ihrer Räder auf der Höhe eines Rads liegt, mit dem es laufen kann (Mitte auf Mitte, dann Kante auf Kante; gleiches Modul oder zwei Scheiben), sonst Lager auf Lager, sonst im 0,5-mm-Raster; Alt: frei. Was kämmt oder am Riemen läuft, verbindet eine Linie zwischen den Spuren; unten die Skala. So entsteht eine Verbindung durch Ziehen: in der Höhe hier, im Abstand in der Draufsicht.

- **Teile als das, was sie sind (2026-11-15):** im 3D-Modell (`partSolid` in `src/shaft/cad.ts`, gilt auch im Wellen-Generator) Zahnräder mit Evolventenzähnen und ihrer Bohrung (Umriss aus `involute.ts`, wenige Punkte je Flanke), Kugellager aus ihrem Schnitt gedreht (Außenring, Rille, Innenring), Riemenscheiben mit Bordscheiben und Nabe, Motor mit runden Kanten und Zentrierbund; je Teil ein Körper ohne 3D-Boolean. Gekaufte Teile sind nicht mehr durchsichtig. Draufsicht: Zähne, Lager mit Kugeln, Motorkörper gestrichelt. Seitenansicht: jedes Teil maßstäblich dick mit Kurznamen (Lager mit Kugeln, Räder mit Zähnen, Scheiben mit Borden, Hülsen, Hebel, Motor). Die echten Zähne kosten je Rad etwa 1 MB Speicher pro Bau, der CAD-Worker startet entsprechend früher neu. Die Räder sind weiter Platzhalter für die Ansicht, keine Dateien zum Drucken.

- **Anordnung (2026-11-15):** Draufsicht und Seitenansicht nebeneinander; die Seitenansicht steht (z nach oben, eine Spalte je Welle, so hoch wie die Draufsicht, Schichten als Bänder mit Griff rechts; ein Klick auf ein Band wählt die Schicht, erst Ziehen macht die Schichten fest). Die Seite nutzt die volle Höhe ohne Scrollen: oben Draufsicht und Seitenansicht (die Draufsicht passt das Getriebe in ihren Kasten ein), unten die 3D-Vorschau. Die Regler der Stellung liegen klein und ohne Rahmen am unteren Rand der Draufsicht. Die Wellenliste ist eingeklappt (Leiste „Wellen ▸“, Zustand bleibt im Browser). Weg sind die Schicht-Reiter (Schichten wählt man an den Bändern oder an den durchsichtigen Platten), die Liste „Antrieb“ (was ein Hebel bewegt, steht an ihm, wie weit ein Motor dreht, an seiner Welle; die Normlänge am Riemen) und die Erklärtexte unter den Ansichten.

- **Originalmodelle in der Vorschau:** Kaufteile, für die das Projekt ein Modell mitbringt, zeigt die 3D-Vorschau im Original: LEGO-Räder als LDraw-Netz (`public/mechanics-assets/ldraw/meshes`), NEMA-Motoren als NopSCADlib-Netz (`public/mechanics-assets/parts`). Jedes `CadPart` trägt dafür `asset` (Datei und Lage als 4×4-Matrix); das Getriebe führt die Matrix mit denselben Drehungen und Verschiebungen wie den Platzhalter (umgedreht, gedreht, Stellung). Der Platzhalter bleibt für STEP und die Prüfungen. Lager, GT2-Scheiben und gedruckte Räder haben kein mitgeliefertes Modell und bleiben gerechnet. Prüfung: `scripts/gear/check-assets.mjs`.

**Offen:** die Einstellung „Dicke der Stege“ wirkt noch nicht (Stege sind so dick wie ihre Platte); Probedrucke für Taschenspiel und Bord; Schnecke und Kegelräder.

Der Katalog des Wellen-Generators kennt jetzt Zähne und Modul der Räder und Scheiben (`teeth`, `module`, `pulley`).

## Begriffe

- **Ebene:** x/y, die Draufsicht. Alle Wellen stehen senkrecht darauf (z nach oben). Die Lage einer Welle ist ihr Punkt
  (x, y), ihre Höhe z0 (wo ihr Ende liegt) und ob sie umgedreht steht. Längs der Welle wird so x zu z.
- **Verbindung:** Zahneingriff (zwei Räder, gleiches Modul, gleiche Höhe) oder Riemen (zwei GT2-Scheiben). Der Eingriff
  legt den Achsabstand fest; offen bleibt nur der Winkel um das Partnerrad.
- **Schicht:** ein Höhenbereich (z0 bis z1). Die Lager in diesem Bereich werden in ihr gehalten.
- **Platte:** das Flachmaterial einer Schicht. Eine Lagerschicht besteht aus einem Plattenpaar, das die Lager zwischen
  sich einklemmt.

## Bedienung

```
┌ Wellen ──────┐┌ Draufsicht (x/y) ──────────────────────────┐┌ Eigenschaften ┐
│ Welle A  ✎   ││   ○A ── z16·z40 ── ○B                       ││ Schicht 2     │
│ Welle B  ✎   ││        \            |                       ││ Dicke 4 mm    │
│ Motor+Welle C││         ○C ──────── ┘    (Stege der Schicht)││ Rand 3 mm     │
│ ＋ neue Welle ││                                             ││ Stege …       │
└──────────────┘└─────────────────────────────────────────────┘└───────────────┘
                ┌ Schichten (Höhe z, wie die Zeitleiste) ─────┐
                │ A  ──[626]────[z16]────[625]──               │
                │ B  ──[608]──[z40]──────[608]──               │
                │  ▓▓ Schicht 1 ▓▓        ▓▓ Schicht 2 ▓▓      │ ← Bänder ziehen
                └──────────────────────────────────────────────┘
```

- **Wellen** links: die gespeicherten Wellen des Wellen-Generators, **verknüpft** (eine Änderung dort ändert das Getriebe).
  ✎ öffnet den Wellen-Editor direkt hier als Fenster über der Seite, gespeichert wird in die Welle selbst. „＋ neue Welle“
  legt eine an und öffnet sie gleich.
- **Draufsicht:** Wellen hineinziehen. Auf einen Radkreis gezogen rastet die Welle im Eingriff ein (wie im Studio), dann
  um das Partnerrad im Winkelraster (Vorgabe 15°); ohne Partner im mm-Raster. Riemen: zwei Scheiben anwählen,
  „Riemen“; Länge und nächste Normlänge stehen dabei.
- **Schichten:** unten die Wellen von der Seite, wie die Zeitleiste gedreht. Der Generator schlägt Schichten aus den
  Lagerhöhen vor; Bänder lassen sich verschieben, teilen, zusammenlegen, ihre Dicke ziehen.
- **Stege:** In einer Schicht werden alle Lager automatisch verbunden (kürzeste Stege, die alles zusammenhalten, plus die
  Verbindungen zwischen kämmenden Wellen, weil dort der Achsabstand stimmen muss). Jeder Steg lässt sich wegnehmen, eigene
  lassen sich hinzufügen.

## Platten

```
 Ring    = Lager-Außen-Ø / 2 + Rand (einstellbar je Schicht, je Lager überschreibbar)
 Steg    = äußere Tangenten zweier Ringe (volle Lasche) oder Steg mit eigener Breite

      ___________________
    /   _               _  \
   |  ( ○ )-------------( ○ ) |
    \___________________ /
```

**Lager eingeklemmt (nur noch auf Wunsch und bei einer einzigen Schicht):** Jede Lagerschicht ist ein Plattenpaar. Jede Platte hat eine Tasche über die halbe Lagerbreite und
darunter einen Bord, der den Außenring hält (Bord-Ø kleiner als der Außenring, größer als der Innenring-Bund). Die
Schrauben der Distanzbolzen ziehen das Paar zusammen und klemmen das Lager.

```
   Platte oben   ████▏      ▕████   ← Bord hält den Außenring
                 ██  ┌────┐  ██     ← Tasche, halbe Lagerbreite
   ─ ─ ─ ─ ─ ─ ─ ─ ─ │ 608│ ─ ─ ─   (Trennfuge)
                 ██  └────┘  ██
   Platte unten  ████▏      ▕████
```

**Dicken:** Ringe sind so dick, wie ihr Lager es braucht (halbe Lagerbreite plus Bord), Stege haben die Dicke der
Schicht. Verschieden breite Lager in einer Schicht gehen also.

**Wellen ohne Lager in einer Schicht:** bekommen ein Freiloch mit Spiel. **Teile im Weg:** Ein Steg oder Ring, der in
seiner Höhe ein Rad, eine Scheibe oder einen Riemen schneidet, wird gemeldet, mit Lösungen zur Wahl:
1. **außen herum:** Der Steg läuft im Bogen um den Radkreis (mit Abstand),
2. **in die Tiefe:** Der Steg wird an der Stelle abgesenkt (Stufe), sodass er unter oder über dem Rad durchgeht,
3. **weglassen:** Der Steg entfällt, wenn die Platte auch ohne ihn zusammenhängt.

## Zusammenhalt

- **Distanzbolzen** zwischen den Schichten (Vorgabe M3, Sechskant-Abstandshalter in Normlängen, sonst gedruckte
  Säulen) an Punkten, die der Generator an den Rand der Platten legt; verschiebbar.
- **Befestigungslöcher** für eine Grundplatte als Element, frei setzbar.

## Antrieb

- **Motor (NEMA 14/17/23 aus dem Katalog)** auf einer Schicht: Flansch mit Bohrbild und Zentrierung. Steckt in einer
  verknüpften Welle eine Motorwelle (Wellen-Generator, „In der Welle“), steht der Motor dort von selbst.
- **Langlöcher zum Spannen:** Bei einem Riemen zeigen die Langlöcher des Motors (oder eines Spannlagers) in Richtung
  des Riemens, Länge einstellbar; die Prüfung rechnet die Riemenlänge über den ganzen Spannweg.

## Schnecke und Kegelräder (später)

Eine Schnecke dreht um eine Achse, die **in** der Ebene liegt, das Schneckenrad um eine senkrechte. Damit liegt die
Schneckenwelle quer: Sie wird von zwei **Lagerböcken** gehalten, die auf einer Platte stehen.

```
 Draufsicht                       Seitenansicht
   ┌─┐  ═══════════  ┌─┐            ┌─┐ ══(Schnecke)══ ┌─┐   ← Lagerböcke
   └─┘   (Schnecke)  └─┘            │ │      ◎         │ │
            ◎  ← Schneckenrad       ███████████████████████  ← Platte
```

Das braucht liegende Wellen im Wellen-Generator-Sinn und Lagerböcke als neues Element. Kegelräder genauso. Deshalb ein
eigener Schritt nach dem Rest.

## Schritte

| Schritt | Inhalt |
|---|---|
| 1 | Seite `getriebe.html`, Dokument (verknüpfte Wellen mit Lage, Verbindungen, Schichten, Stege, Bolzen), Planung ohne UI: Eingriffe und Riemen prüfen, Schichten aus den Lagerhöhen, Stege automatisch, Kollisionen; Prüfskript |
| 2 | Draufsicht mit Ziehen und Einrasten (Eingriff, Winkelraster, mm-Raster), Verbindungen ansagen, Schichten-Ansicht mit Bändern, Eigenschaften |
| 3 | Plattengeometrie: Umriss aus Ringen und Tangenten-Stegen, Taschen mit Bord, Freilöcher, Bolzenlöcher; Vorschau mit Wellen und Rädern, STEP/STL/ZIP |
| 4 | Teile im Weg: außen herum, Stufe in die Tiefe, weglassen |
| 5 | Motor mit Flansch, Langlöcher zum Spannen, Riemenlänge über den Spannweg |
| 6 | Wellen-Editor im Getriebe öffnen, neue Welle von hier |
| später | Schnecke und Kegelräder mit liegenden Wellen und Lagerböcken |
