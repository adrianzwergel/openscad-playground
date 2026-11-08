# Mechanics Studio: Oberfläche

Ein Projekt ist ein Gerät. Es liegt als eine Datei im Browser (OPFS, siehe `AUFBAU.md`) und wird in einer 3D-Szene
bearbeitet. Es gibt nur eine Art Projekt: Jedes beginnt leer, mit derselben Ansicht und derselben Bibliothek. Der alte
Getriebe-Sucher mit Baugruppe, Eingang, Ausgang und Bauraum ist entfernt; seine Aufgabe hat die Getriebesuche der
Antriebe übernommen. Die Expertenansicht ist aus dem Studio nicht mehr verlinkt.

## Startseite

`☰ Projekte` öffnet sie jederzeit, beim allerersten Start steht sie von selbst da.

- **＋ Neues Projekt:** leer. Ist das offene Projekt noch leer und trägt einen allgemeinen Namen, wird es genommen statt
  ein zweites anzulegen.
- **Beispiele:** Roboterarm, CNC-Portal, Schlitten, Handgetriebe, zwei Planetengetriebe, Arduino Uno im Gehäuse und die
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

### Gruppen

Strg-Klick in der Ansicht oder im Szenenbaum wählt mehrere Dinge, Strg+G (oder „Gruppieren“) macht daraus eine Gruppe.
Gruppen sind gemischt (Räder, Teile, Platten) und dürfen in Gruppen stecken; im Baum sind sie Ordner. Eine Platte bringt die
Teile auf ihr mit, ein Rad die Räder auf seiner Welle: eine Welle ist ein Stück. Eine Gruppe sagt, was ihre Teile
zueinander sind:

| Art | Bedeutung | von selbst, wenn |
|---|---|---|
| ▣ Träger | hält Wellen in festen Achsabständen, die Räder drehen darin; dafür entstehen später Lager und Gehäuse | Räder auf mehreren Wellen |
| ◆ Körper | ein Stück; mit einem Rad hängt alles darin an dessen Welle und dreht mit (Sensor, Nocken, Arm) | sonst |
| ▢ Ordnung | hält nur im Baum zusammen | nur von Hand |

- Körper und Träger halten beim Bearbeiten ihre Abstände: Ziehst du ein Stück, kommt die Gruppe mit (die äußerste
  solche), ein Rad rastet dabei an Räder außerhalb ein. Auch die Felder eines Rads verschieben dann die ganze Gruppe;
  Zähne, Modul und Breite gedruckter Räder sind gesperrt.
- Liegen die Gewählten in verschiedenen Gruppen, kommt die neue Gruppe dorthin, wo das Rad ist: Ein Sensor mit dem z16
  eines Trägers wird ein Körper im Träger.
- Jede Welle ist ein Körper, an den man auch einzeln hängen kann („Hängt an: Welle von …“).
- Eingänge und Ausgänge setzt man an der Welle eines Rads, beliebig viele; jeder Eingang hat seinen Antrieb und unter
  der Ansicht seinen Regler. Zwei Eingänge, die dieselbe Kette treiben, meldet die Prüfung.
- Griff: Eine gewählte Gruppe trägt ihn in ihrer Mitte. Drehen geht mit Rädern nur um die Wellenrichtung, sonst um die
  Senkrechte.
- Bibliothek: „In die Bibliothek legen“ (Körper und Träger) speichert unter „Eigene Bausteine“ für jedes Projekt
  (OPFS `/bausteine`), mit ihren Eingängen und Ausgängen.

Logik: `parts/groups.ts` und `parts/train.ts` (geprüft von `scripts/parts/check-groups.mjs`), Bedienung: `studio-build.ts`,
`studio-train.ts`. Ältere Dateien: „fest“ wird Körper oder (mit Rädern auf mehreren Wellen) Träger, „frei“ Ordnung; ein
einzelner Eingang und Ausgang werden Listen.

### Phasen

Alle drei sind immer offen. Was eine Phase für das Projekt nicht hat, sagt der Szenenbaum.

Zahnräder drehen sich in jeder Phase: Sobald Räder kämmen und ein Eingang gesetzt ist, steht unter der Ansicht der Regler
„Zahnräder drehen“; jedes Rad, das am Eingang hängt, läuft mit seiner Übersetzung mit, auch in Gruppen. „Lager und
Gestell erzeugen“ in ③ macht aus den Rädern den Mechanismus des Projekts (vorher „Als Mechanismus übernehmen“ in ②).

| Phase | Mechanismus | Teile, Platten, Zahnräder |
|---|---|---|
| ① Aufbauen | Modell & Glieder | platzieren, Halter, Bohrungen, Räder einrasten |
| ② Bewegen | Achsen, Antriebe, Getriebesuche | Zahnräder: Eingang, Ausgang, Antrieb |
| ③ Fertigen | Lager & Wellen, Struktur je Glied | Platte als STL, Gehäuse, Träger aus Baum-Netz; Zahnräder: Lager und Gestell erzeugen |

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
