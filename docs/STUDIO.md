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
| links unten | Szene: was die Phase bearbeitet; bei älteren Projekten mit mehreren Szenen die Umschaltung |
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

### Phasen

Alle drei sind immer offen. Was eine Phase für das Projekt nicht hat, sagt der Szenenbaum.

| Phase | Mechanismus | Teile, Platten, Zahnräder |
|---|---|---|
| ① Aufbauen | Modell & Glieder | platzieren, Halter, Bohrungen, Räder einrasten |
| ② Bewegen | Achsen, Antriebe, Getriebesuche | Getriebe aus Zahnrädern: Übersetzung, Antrieb, übernehmen |
| ③ Fertigen | Lager & Wellen, Struktur je Glied | Platte als STL, Gehäuse, Träger aus Baum-Netz |

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
