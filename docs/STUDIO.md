# Mechanics Studio: Oberfläche

Ein Projekt ist ein Gerät. Es liegt als eine Datei im Browser (OPFS, siehe `AUFBAU.md`) und wird in einer 3D-Szene
bearbeitet. Es gibt nur eine Art Projekt: Jedes beginnt leer, mit derselben Ansicht und derselben Bibliothek. Der alte
Getriebe-Sucher mit Baugruppe, Eingang, Ausgang und Bauraum ist entfernt; seine Aufgabe hat die Getriebesuche der
Antriebe übernommen. Die Expertenansicht ist aus dem Studio nicht mehr verlinkt.

## Startseite

`☰ Projekte` öffnet sie jederzeit, beim allerersten Start steht sie von selbst da.

- **＋ Neues Projekt:** leer. Ist das offene Projekt noch leer und trägt einen allgemeinen Namen, wird es genommen statt
  ein zweites anzulegen.
- **Beispiele aus Bauteilen** (`parts/examples.ts`): Zahnstangen-Schlitten, Spindel-Lineareinheit, Riemenantrieb GT2,
  Planetenstufe mit fester Sonne, Drehgeber auf der Welle, Schwenkarm. Sie sind aus denselben Wellen, Rädern, Teilen und
  Verbindungen gebaut, die man von Hand setzt: alles darin lässt sich anklicken und ändern, Regler und ③ (Lager, Struktur)
  gelten wie in jedem Projekt.
- **Weitere Beispiele:** Roboterarm, CNC-Portal, Schlitten, Handgetriebe, zwei Planetengetriebe, Arduino Uno im Gehäuse und die
  Kinematik-Vorlagen. Jedes Beispiel wird ein eigenes Projekt.
- **Deine Projekte:** öffnen. Umbenennen, Exportieren, Importieren und Löschen stehen im Menü `⋯`.

## Projekt

| Bereich | Inhalt |
|---|---|
| Kopfzeile | Projekte, Name, Speicherstand, Phasen, Rückgängig/Wiederholen, `⋯` |
| links oben | Bibliothek der Phase: in ① alles, was ein Gerät haben kann; in ② der Bestand für die Getriebesuche |
| links unten | Szene: in ① ein Baum wie die Ebenen eines Zeichenprogramms (Gruppen als Ordner, Ziehen ordnet um und legt in Gruppen, ein Klick ins Leere wählt nichts und zeigt das Projekt); in ② und ③, was die Phase bearbeitet |
| Mitte | 3D-Ansicht, Griff zum Verschieben/Drehen, Achsregler und die Bewegung über den ganzen Bereich |
| rechts | Eigenschaften der Auswahl, darunter „Was fehlt noch“ mit dem nächsten Schritt |

### Bibliothek

In jedem Projekt dieselbe, in dieser Reihenfolge: **3D-Modell laden**, **Bodenplatte**, die Teilegruppen (Controller,
Motoren, Module, …, Befestigung), **Zahnräder** (LEGO, gedrucktes Stirnrad, Planetenstufe) und **Eigenes Teil aus
Maßen**. Was im Projekt gerade nicht geht, bleibt sichtbar, ist gesperrt und sagt warum: Ein Projekt hat höchstens einen
Mechanismus, also gibt es mit Modell kein zweites Modell, keine Planetenstufe und kein „Als Mechanismus übernehmen“ für
Zahnräder.

### Ein Aufbau, ein Mechanismus

Platten, Teile und Zahnräder liegen in einem Aufbau (`builds`). Entsteht der Mechanismus des Projekts (Modell geladen,
Beispiel, Zahnräder übernommen), hängt der Aufbau sich an ihn; ein leerer Aufbau fällt weg. Ohne Mechanismus hat jedes
Projekt einen Aufbau zum Hineinziehen. Das hält `unify` in `studio.ts` nach jeder Änderung und beim Öffnen ein.
Übernommene Zahnräder werden der Mechanismus, im Aufbau bleiben sie nicht stehen.

### Bauteile, Verbindungen, Gruppen (wie in CAD)

Bewegung steckt nicht im Baum, sondern in **Verbindungen** zwischen jeweils zwei Dingen, wie Joints in Fusion 360 oder
Mates in Onshape. Logik: `parts/links.ts`, `parts/train.ts`; geprüft von `scripts/parts/check-links.mjs`.

- **Welle** ist ein eigenes Bauteil (Zeile im Baum, die Räder darunter): aus LEGO-Achse, gedruckt oder Stahl, mit Ø; sie
  **dreht** in ihrem Träger oder **steht fest** (Achse). Ein Rad sitzt **fest** auf ihr oder läuft **lose** (Losrad); auf
  einer feststehenden Achse laufen Räder lose. Eingänge (mit Antrieb) und Ausgänge setzt man an der Welle.
  Eine Welle oder Achse kann selbst **verbunden** sein mit einem bewegten Körper (einer anderen Welle, einem Teil, einer
  Platte): Dann fährt sie mit ihm, samt ihren Rädern, z. B. ein z36 auf einer Achse, die an der Welle des z24 sitzt.
  Fahren Wellen mit, rechnet das Studio alle Winkel aus einem Gleichungssystem (`solveMotion`): Eingriffe nach Willis
  (z_a·(θ_a − φ) + z_b·(θ_b − φ) = 0 mit dem Winkel φ des Trägers), so laufen Planeten auf einem Steg um eine feste oder
  angetriebene Sonne. Ein mitfahrendes Rad kämmt nur mit einem auf der Achse seines Trägers (sonst meldet die Prüfung es).
  In ③ sitzt eine mitfahrende Welle in einem Drehgelenk auf dem Körper ihres Trägers (ihre Lager dort), Räder feststehender
  Achsen gehören zum Gestell; Gehäuse bohren nur für Wellen, die nicht mitfahren.
- **Teile und Platten** sind **verbunden mit** der Welt, einem Glied des Modells, einer Welle, einem losen Rad, einem Teil
  oder einer Platte. Die Verbindung ist **fest**, **dreht** um X/Y/Z durch einen Drehpunkt oder **schiebt** entlang X/Y/Z
  (Richtungen dessen, womit verbunden), mit Bereich und auf Wunsch als **Eingang** mit Regler. Was daran hängt, fährt
  mit, über ganze Ketten. Ein Teil, das auf ein Zahnrad gezogen wird, ist fest mit dessen Welle verbunden.
- **Kopplungen** erkennt das Studio selbst. Zahneingriffe koppeln Wellen und Losräder; eine **Zahnstange** (Bibliothek
  „Zahnräder“, an ein Rad gezogen legt sie sich an seinen Teilkreis) schiebt r·π/180 mm je Grad, ein zweites Ritzel an ihr
  dreht gegenläufig. Eine **Gewindespindel TR8** ist eine Welle mit Steigung, die auch ohne Rad besteht; eine
  **Spindelmutter** (Bibliothek „Mechanik“) auf ihr gezogen sitzt auf der Achse und wandert je Umdrehung um die Steigung,
  ohne sich mitzudrehen (Verbindungsart „Spindelmutter“). Teile, die mit einer Zahnstange oder Mutter verbunden sind,
  fahren mit. Logik: `rackMeshes`/`rates` in `parts/train.ts`, `mutter` in `parts/links.ts`.
- **Riemen:** GT2-Riemenscheiben (Bibliothek „Zahnräder“, z16/z20/z40) kämmen nicht mit Zahnrädern. Auf der Seite einer
  Scheibe „Riemen zu …“ eine andere wählen: Beide drehen gleichsinnig im Verhältnis der Zähne; die Seite nennt die
  Riemenlänge und die nächste Standardlänge.
- **③ für alles, was am Getriebe hängt:** Der abgeleitete Mechanismus enthält Zahnräder, Riemen, Gewindespindeln (Lager)
  sowie Zahnstangen und Spindelmuttern als Schlitten auf Schiebegelenken; die Lagerplanung führt sie auf Stangen mit
  Linearlagern (LM8UU). Auch Teile und Platten mit eigener Dreh- oder Schiebeverbindung werden Körper auf Dreh- bzw.
  Schiebegelenken (auf der Welt oder auf einem anderen solchen Teil), mit Motor, wenn sie Eingang sind; ③ plant ihnen
  Lager, Naben, Motorflansche und Linearführungen (`parts/derive.ts`).
- **Gehäuse je starrer Gruppe mit Rädern:** In ③ steht je Gruppe „Gehäuse: …“. Zwei Lagerschilde neben den Rädern und ein
  Boden, Bohrungen genau in den Achsabständen (LEGO-Achse 4,8 mm, sonst Wellen-Ø, plus Spiel); Wand, Abstand, Spiel, Rand
  und Boden stehen in der Gruppe; Vorschau in der Ansicht, STL über OpenSCAD (`parts/gearcase.ts`).
- Im Szenenbaum stehen unten unter **Verbindungen** alle Wellen, Losräder und nicht festen Teile mit ihrer Verbindung.

**Gruppen** ordnen nur, wie Baugruppen im CAD-Browser. Eine **starre** Gruppe hält beim Bearbeiten ihre Abstände: Ziehst
du ein Stück, kommt die Gruppe mit, ein Rad rastet dabei an Räder außerhalb ein; der Griff sitzt in ihrer Mitte. Gruppiert
man Teile mit den Rädern einer Welle, verbindet das Studio die Teile fest mit dieser Welle (eine Verbindung wie jede
andere). Starre Gruppen gehen als Bausteine in die Bibliothek. Strg-Klick wählt mehrere, Strg+G gruppiert.

### Gestänge aus Gelenkpunkten (Fahrwerk)

Bei Aufhängungen wählt man die **Gelenkpunkte**, die Lenker folgen daraus, wie in Fahrwerksprogrammen mit Hardpoints.
Logik: `parts/linkage.ts`, Editor: `studio-linkage.ts`; geprüft von `scripts/parts/check-linkage.mjs` und
`scripts/check-studio-linkage-browser.mjs`.

- Ein **Lenker** hat Punkte; jeder Punkt verbindet ihn mit etwas anderem (der Welt = Chassis, einem anderen Lenker, einem
  Teil, einer Platte, einer Welle) als **Kugelgelenk** oder als **Drehachse** durch zwei Lagerpunkte. Drei Arten:
  **gedruckter Lenker** (Querlenker, Umlenkhebel, Radträger; seine Form entsteht aus allen Punkten an ihm, auch denen
  anderer, die auf ihm enden), **Stab** (gekauftes Spannschloss M3 mit zwei Kugelpfannen: fest ist nur der Abstand),
  **Federbein** (gekaufter Öldämpfer: hält nichts, seine Länge wird abgelesen und gegen den Hub geprüft).
- Punkte stehen in der **Konstruktionslage** (Regler auf 0) im Raum; dort ist der Rahmen jedes Lenkers die Identität. Sie
  sind Griffe in der Ansicht: gezogen rasten sie im 0,5-mm-Raster (Alt: frei), auf einem Punkt oder Rohr eines anderen
  Lenkers abgelegt hängen sie an ihm. Genau setzt man sie mit X/Y/Z auf der Seite des Lenkers.
- Eine Drehachse kann **Eingang** sein: Der Regler „Gestänge bewegen“ dreht dort (in Grad). Gelöst wird jede Stellung als
  geschlossene Schleife (Levenberg–Marquardt über die sechs Koordinaten jedes Lenkers, Stäbe als Abstände). Die Prüfung
  zählt die freien Bewegungen (6 je Lenker minus 3 je Kugel, 5 je Drehachse, 1 je Stab und Eingang): 0 heißt bestimmt.
- Abgelesen wird **Radhub, Sturz, Spur, Dämpferlänge** jetzt und über den ganzen Bereich, dazu die **Motion Ratio**.
  Räumlich: z oben, beim Auto x nach vorn, y nach links.
- Katalog „Fahrwerk 1:10“: Öldämpfer 55/65/75 mm, Kugelköpfe 5,8 und 6,8 mm M3, Räder Ø 56 und 64; Maße typisch und von
  Hand eingetragen (offene CAD-Daten mit klarer Lizenz gibt es kaum). Baustein **Pushrod-Ecke 1:10** und das Beispiel
  „Pushrod-Aufhängung 1:10“: Doppelquerlenker, Pushrod auf Umlenkhebel und Dämpfer, Spurstange (Spuränderung unter 0,01°
  über ±9 mm Federweg).
- **③:** „Gestänge · Druckteile & Halter“ gibt jeden gedruckten Lenker als STL aus (Rohre zwischen den Punkten, Hülse an
  Drehachsen mit Bohrung Ø 3,2 für M3, Kernloch Ø 2,5 für Kugelbolzen bzw. den Gewindestift der Pfanne) und die
  **Halter am Chassis** (Säule mit Fuß und Schraubloch bis zum einstellbaren Boden, Laschen an Drehachsen). Die Stückliste
  nennt Kugelbolzen, Pfannen, Spannschlösser mit Kugelmitte-Abstand, Dämpfer, Räder und Schrauben M3 nach Länge.

### Phasen

Alle drei sind immer offen. Was eine Phase für das Projekt nicht hat, sagt der Szenenbaum.

Zahnräder drehen sich in jeder Phase: Sobald Räder kämmen und ein Eingang gesetzt ist, steht unter der Ansicht der Regler
„Zahnräder drehen“ je Eingang; jedes Rad und Teil, das an einer Welle hängt, läuft mit, auch in Gruppen.

Aus den Zahnrädern eines Projekts ohne Modell entsteht nach jeder Änderung ein Mechanismus (`derive` in `studio.ts`,
`trainMechanism` in `parts/train.ts`): genau dort, wo die Räder in der Ansicht stehen, eine Antriebskette je Eingang. Er ist
keine eigene Szene. In ③ öffnen „Lager & Wellen“ und „Struktur je Glied“ seine Seiten im Mechanismus-Editor; die Räder
bleiben, wo sie gebaut werden, Gruppen und Zuordnungen bleiben erhalten. Einen Umwandlungsknopf gibt es nicht mehr.

| Phase | Mechanismus | Teile, Platten, Zahnräder |
|---|---|---|
| ① Aufbauen | Modell & Glieder | platzieren, Halter, Bohrungen, Räder einrasten |
| ② Bewegen | Achsen, Antriebe, Getriebesuche | Zahnräder: Eingang, Ausgang, Antrieb |
| ③ Fertigen | Lager & Wellen, Struktur je Glied | Platte als STL, Gehäuse, Baum-Netz; Zahnräder: Lager & Wellen, Struktur je Glied |

## Aufbau des Codes

- `studio.ts`: Hülle; Szenen und Phasen, Startseite, Projektdateien, Ansicht und Eingaben, `unify`.
- `studio-mechanism.ts`: der Mechanismus. `studio-build.ts`: Platten, Teile und (über `studio-train.ts`) Zahnräder in
  einem Aufbau. Die Editoren liefern Szenenbaum (`renderScene`/`renderPlaced`), Bibliothek (`renderStore`), Eigenschaften
  (`renderProperties`) und die Schritte für „Was fehlt noch“ (`todo`), die Hülle ordnet sie an.
- Gespeichert wird höchstens 0,3 s nach einer Änderung. Verlässt man die Seite, bevor das durch ist, bleibt eine Kopie im
  `localStorage`; beim Öffnen gewinnt die jüngere Fassung.

## Prüfen

Die Browser-Checks nutzen `scripts/studio-ui.mjs`: `newProject` legt ein leeres Projekt an (auf Wunsch mit Bodenplatte),
`goTo` sucht einen Eintrag im Szenenbaum und wechselt dafür die Phase, `example` und `start` öffnen Karten der
Startseite, `menu` Einträge von `⋯`.
