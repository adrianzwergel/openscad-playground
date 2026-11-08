# Mechanics Studio: Oberfläche

Ein Projekt ist ein Gerät. Es liegt als eine Datei im Browser (OPFS, siehe `AUFBAU.md`) und wird in einer 3D-Szene
bearbeitet. Der alte Getriebe-Sucher mit Baugruppe, Eingang, Ausgang und Bauraum ist entfernt; seine Aufgabe hat die
Getriebesuche der Antriebe übernommen. Die Expertenansicht ist aus dem Studio verlinkt nicht mehr.

## Startseite

`☰ Projekte` öffnet sie jederzeit; ohne Inhalt im Projekt steht sie von selbst da.

- **Neues Projekt:** aus einem 3D-Modell, Teile auf einer Bodenplatte, Teile frei im Raum, Getriebe aus Zahnrädern.
- **Beispiele:** Roboterarm, CNC-Portal, Schlitten, Handgetriebe, zwei Planetengetriebe, Arduino Uno im Gehäuse und die
  Kinematik-Vorlagen. Jedes Beispiel wird ein eigenes Projekt.
- **Deine Projekte:** öffnen. Umbenennen, Exportieren, Importieren und Löschen stehen im Menü `⋯`.

Ist das offene Projekt noch leer, nimmt es den neuen Inhalt auf, statt ein zweites anzulegen.

## Projekt

| Bereich | Inhalt |
|---|---|
| Kopfzeile | Projekte, Name, Speicherstand, Phasen, Rückgängig/Wiederholen, `⋯` |
| links oben | Bibliothek der Phase: in ① Teile (bzw. Zahnräder), in ② der Bestand für die Getriebesuche |
| links unten | Szene: was die Phase bearbeitet, bei mehreren Szenen eines Projekts die Umschaltung |
| Mitte | 3D-Ansicht, Griff zum Verschieben/Drehen, Achsregler und die Bewegung über den ganzen Bereich |
| rechts | Eigenschaften der Auswahl, darunter „Was fehlt noch“ mit dem nächsten Schritt |

### Phasen

| Phase | Mechanismus | Aufbau (Platte / frei) | Getriebe |
|---|---|---|---|
| ① Aufbauen | Modell & Glieder, Teile am Modell | Teile und Platten platzieren | Zahnräder |
| ② Bewegen | Achsen, Antriebe, Getriebesuche | – | Übersetzung, Antrieb, übernehmen |
| ③ Fertigen | Lager & Wellen, Struktur je Glied | Platte als STL, Gehäuse, Baum-Netz | – |

Eine Phase ohne Inhalt für die Szene ist gesperrt. Der Aufbau zeigt Druckdateien, Gehäuse und Netz erst in ③.

## Aufbau des Codes

- `studio.ts`: Hülle; Szenen und Phasen, Startseite, Projektdateien, Ansicht und Eingaben.
- `studio-mechanism.ts`, `studio-build.ts`, `studio-train.ts`: die Editoren. Sie liefern Szenenbaum
  (`renderScene`/`renderPlaced`), Bibliothek (`renderStore`), Eigenschaften (`renderProperties`) und die Schritte für
  „Was fehlt noch“ (`todo`), die Hülle ordnet sie an.
- Gespeichert wird höchstens 0,3 s nach einer Änderung. Verlässt man die Seite, bevor das durch ist, bleibt eine Kopie im
  `localStorage`; beim Öffnen gewinnt die jüngere Fassung.

## Prüfen

Die Browser-Checks nutzen `scripts/studio-ui.mjs`: `goTo` sucht einen Eintrag im Szenenbaum und wechselt dafür die
Phase, `example` und `start` öffnen Karten der Startseite, `menu` Einträge von `⋯`.
