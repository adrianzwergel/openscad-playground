# Wellen-Generator

Eine eigene Seite neben dem Studio, mit demselben Katalog. Man setzt eine Welle aus dem zusammen, was auf ihr sitzt und was
in ihr steckt; der Generator legt Abschnitte, Absätze, Hülsen und Adapter so fest, dass sich alles montieren lässt, und gibt
Welle und Zusatzteile als **STEP** (CNC, Bambu Studio) und **STL** aus.

Ziel vor allem: **super einfach**. Bedient wird eine 2D-Zeitleiste wie in einem Videoschnittprogramm, die Zeitachse ist die
Position auf der Welle (mm). Dazu eine 3D-Vorschau, die nur zeigt.

## Stand

| Schritt | Stand |
|---|---|
| 1 | fertig: `welle.html` (Karte „Wellen-Generator“ auf der Studio-Startseite), Wellen als eigene Dateien im OPFS (Ordner `wellen`, Format `shaft-1`), Längsschnitt, Meldungen, Stückliste, drei Beispiele. Prüfung: `scripts/shaft/check-plan.mjs`, `scripts/shaft/check-page-browser.mjs` |
| 2 | fertig: Zeitleiste in `editor.ts` mit den Spuren Welle, Auf, Erzeugt, In, Bearbeitung, Abschnitte; Ziehen aus dem Katalog oder Klick (Teil in die Mitte, Steckung ans freie Ende), Verschieben, Kanten ziehen, Wellenende ziehen, Einrasten an Kanten und im 0,5-mm-Raster (`snap.ts`, Alt: frei), Teile weichen auf den nächsten freien Platz aus, Eigenschaften mit genauen Werten, Meldungen wählen ihr Teil, Entf, Strg+Z/Strg+Shift+Z, Zoom (Strg+Mausrad). Prüfung: `scripts/shaft/check-snap.mjs`, `scripts/shaft/check-page-browser.mjs` |
| 3 | fertig: replicad 1.2.0 mit OpenCascade 1.1.0 (`replicad-opencascadejs`, LGPL-2.1) im Worker `welle-cad-worker.js`; `cad.ts` baut Welle, Adapter, Hülsen und Platzhalter der Kaufteile; 3D-Vorschau (`preview.ts`), Dateien je Teil als STEP und binäres STL, Baugruppe als STEP. Prüfung: `scripts/shaft/check-cad.mjs` (Node), `scripts/shaft/check-cad-browser.mjs` |
| 4 | fertig: Bearbeitungen in der Geometrie (`machiningTools` in `cad.ts`): Kernloch der Madenschraube radial unter ihrem Winkel, Kernloch im Ende, Passfedernut Form A mit runden Enden, Nut für den Sicherungsring, Abflachung. Prüfung: Volumen je Bearbeitung in `scripts/shaft/check-cad.mjs` |
| 5 | fertig: „Alles als ZIP“ mit STEP und STL jedes gefertigten Teils, Baugruppe, `stueckliste.csv` und `fertigung.txt` (`notes.ts`): bei CNC die üblichen Passungen je Abschnitt (Lagersitz k6, Schiebesitz h7, Bohrung H7, Nut N9, sonst ISO 2768-m), beim Druck das eingerechnete Spiel, dazu jeder Arbeitsschritt und die offenen Meldungen. Prüfung: `scripts/shaft/check-notes.mjs`, ZIP in `check-cad-browser.mjs` |

**Offen:** Probedrucke für das Spiel (0,1 mm je Seite, Kreuz) stehen aus; Zahnräder mit Passfedernut in der Bohrung fehlen im Katalog; Abflachung der NEMA-Wellen von Hand angenommen; Passungen stehen in `fertigung.txt`, nicht als PMI in der STEP-Datei; Welle aus dem Studio öffnen und zurückgeben.

**Code:** `src/shaft/profile.ts` (Profile, `passes`, `largestPassing`), `din.ts`, `catalog.ts` (aus Lagerkatalog, LDraw,
Teilekatalog), `model.ts` (Dokument), `plan.ts` (`planShaft`), `draw.ts` (SVG), `page.ts`.

**So plant `planShaft`:** Teile von links sitzen alle links von denen von rechts, also wird jede Trennstelle probiert (feste
Seiten schränken ein). Je Seite geht es vom Bund nach außen und merkt sich die Bohrungen, die noch durch müssen: Ein freier
Abschnitt ist das stärkste Profil, das durch alle passt (`largestPassing`). Passt die Bohrung eines Teils nicht über
das, was nach innen noch durch muss, bekommt es einen Adapter. Hält nichts ein Teil nach innen, kommt eine Distanzhülse
dazu, bei einem Adapter dessen Bund. Der Bund ist um `shoulder` größer als die Nachbarn und berührt bei Lagern nur den
Innenring. Danach prüft ein eigener Durchgang alles unabhängig davon, wie es entstand, auch von Hand gesetzte Abschnitte.
Gewertet wird: Fehler ≫ Adapter > Warnungen > Hülsen.

**Geometrie (`cad.ts`):** Gleiche Profile nebeneinander werden ein Körper. Runde Abschnitte am Stück sind ein gedrehtes
Umrissprofil mit den Fasen darin, andere Profile werden entlang x extrudiert (Ebene YZ, die Abflachung einer D-Welle zeigt
nach +z). Gesteckte Wellen werden vom Ende her abgezogen. Druck: Bohrungen `play` je Seite größer, Kreuz/D/Sechskant als
Zapfen `play` kleiner, runde Sitze nennmaßig; CNC: alles nennmaßig.

**Speicher:** Boolesche Operationen von OpenCascade lassen je Aufruf etwas WASM-Speicher liegen (gemessen etwa 1,6 MB je
Bau des Beispiels, ohne Drehprofil waren es 8 MB). Daher so wenige Booleans wie möglich, `localGC` je Bau, und
`CadClient` ersetzt den Worker nach einer Antwort, wenn er über 700 MB liegt (`?cadlimit=` zum Prüfen).

## Bedienung

```
 ┌ Katalog ──────┐ ┌──────────────────────────────────────────────────────────────┐ ┌ Eigenschaften ┐
 │ Lager         │ │  Silhouette  ▁▁▁▁████▁▁▁▁▁▁▁▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃████▁▁▁       │ │ 626 Lager     │
 │ LEGO-Räder    │ │  0    10    20    30    40    50    60    70    80   mm      │ │ bei 4,0 mm    │
 │ Stirnräder    │ │  Auf     [626]   [Hülse 6]  [z24 LEGO]           [626]       │ │ von links ◀   │
 │ GT2-Scheiben  │ │  In      [D 5 ← Motor, 15 tief]                              │ │ Sitz Ø6 rund  │
 │ Wellen (in)   │ │  Bearb.     ▲M3 Madenschr.      ═══ Nut ═══      ▯ Ring      │ │ ...           │
 │ Hülsen        │ │  Abschn. │ Ø6 rund         │ Kreuz 4,8 ────────────────────│  │ └───────────────┘
 │ Bearbeitungen │ └──────────────────────────────────────────────────────────────┘
 └───────────────┘ ┌ 3D-Vorschau (nur Ansicht) ───────────────────────────────────┐
                   │  Welle, Hülsen, Adapter, gekaufte Teile halb durchsichtig    │
                   └──────────────────────────────────────────────────────────────┘
```

- **Spuren:**
  - **Auf** (was auf der Welle sitzt): Lager, Zahnräder, Riemenscheiben, Hülsen.
  - **In** (was von einem Ende in der Welle steckt): Motor-D-Welle, LEGO-Achse, Rundwelle, mit Tiefe und Wand.
  - **Bearbeitung:** Madenschraube, Nut, Sicherungsring-Nut, Gewinde, Abflachung, Fase.
  - **Abschnitte:** Ø und Profil je Stück. Sie werden abgeleitet, man kann sie aber überschreiben.
- **Ziehen** aus dem Katalog auf eine Spur legt ein Element ab. Ein Klip lässt sich verschieben. Bereiche wie Hülse, Nut,
  Abschnitt und Steckungstiefe lassen sich an ihren Kanten ziehen.
- **Einrasten:** Klips rasten an Kanten, Absätzen und Wellenenden ein, sonst im 0,5-mm-Raster. Alt schaltet das ab. Genaue
  Werte tippt man rechts ein.
- **Silhouette:** Die oberste Zeile zeigt den Längsschnitt der Welle. Dort sieht man sofort, wo Absätze entstehen.
- **Meldungen** sitzen direkt am Klip, z. B. „geht von keiner Seite drauf“ oder „Wand um D-Loch 0,8 mm < 1,5 mm“.

## Datenmodell (`src/shaft/model.ts`)

- **Profil** als gemeinsamer Begriff für Wellen und Bohrungen, gilt auch für Katalogteile:
  - `rund(d)`
  - `D(d, Fläche)`, z. B. NEMA 5 mm mit 0,5 mm Abflachung
  - `kreuz` (LEGO, 4,8 / 1,8)
  - `sechskant(SW)`
  - `passfeder(d, b×h nach DIN 6885)`
- Katalogteile bekommen `bore: Profil` und eine Breite: Lager aus `bearingCatalog`, LEGO-Räder (`mount:'cross'`), Stirnräder,
  GT2-Scheiben. Motoren bekommen ihr Wellenprofil.
- Das Dokument speichert nur Entscheidungen, wie im Aufbau:
  - Länge, Grund-Ø, Fertigung (Druck / CNC)
  - Elemente: Spur, Position, Länge, Parameter, Seite (`auto`, links oder rechts)
  - Überschriebene Abschnitte
- Gespeichert wird im OPFS wie die Studio-Projekte, als eigene Liste auf der Generator-Seite.

## Planung (`src/shaft/plan.ts`, ohne UI, mit Tests)

`planShaft(doc)` liefert:

1. **Sitz je Element:** Welches Profil die Welle dort braucht. Ein Lager auf Ø 6 braucht Ø 6 rund, ein LEGO-Rad braucht das
   Kreuz.
2. **Montageseite je Element:** Ein Teil kann von links drauf, wenn jeder Abschnitt links von ihm durch seine Bohrung passt.
   Gesucht wird die Belegung mit den wenigsten Adaptern. Daraus folgt die Abschnittsfolge, und an jedem Übergang entsteht ein
   Absatz als Anschlag.
3. **Adapter**, wo ein Sitz das falsche Profil hätte. Beispiel: Ein Lager Ø 6 auf dem Kreuz-Abschnitt bekommt eine Hülse mit
   Kreuz innen und Ø 6 außen.
4. **Distanzhülsen** zwischen Teilen, die keinen Absatz als Anschlag haben. Länge = Lücke, innen das Profil des Abschnitts.
   Man kann sie auch von Hand setzen.
5. **Prüfungen:**
   - Wand um Innenbohrungen
   - Kernloch und Wand der Madenschraube
   - Nut tiefer als erlaubt
   - Teile, die sich überlappen
   - ein Teil, das von keiner Seite montierbar ist
6. **Stückliste:**
   - Lager
   - Madenschrauben (DIN 913 / 916, Länge passend)
   - Gewindebohrer M…
   - Passfedern
   - Sicherungsringe (DIN 471)
   - gedruckte Teile

**Normtabellen** (`src/shaft/din.ts`):

| Was | Norm | Inhalt |
|---|---|---|
| Kernlöcher Regelgewinde | DIN 13 / ISO 2306 | M2 1,6 · M2,5 2,05 · M3 2,5 · M4 3,3 · M5 4,2 · M6 5,0 · M8 6,8 · M10 8,5 |
| Passfedernuten | DIN 6885 | b, t1 und t2 nach Wellen-Ø |
| Sicherungsring-Nuten | DIN 471 | Nut-Ø, Breite |
| Madenschrauben | DIN 913 / 916 | Längen |

**Passungen** hängen von der Fertigung ab:
- Druck: Zuschlag in mm, einstellbar.
- CNC: ISO-Toleranz am Abschnitt, z. B. Lagersitz k6, Gleitsitz h7. Sie kommt als Text in die STEP-Datei und in die
  Stückliste; die Geometrie ist das Nennmaß.

## Geometrie und Ausgabe (`src/shaft/cad.ts`, im Worker)

- **CAD-Kern:** [replicad](https://replicad.xyz) auf OpenCascade (WASM, LGPL-2.1). Er wird nur auf dieser Seite geladen
  (etwa 10 MB).
- **Welle:**
  1. Die Abschnitte werden als Profil gedreht (Revolve).
  2. Die Bearbeitungen werden abgezogen: Kreuz und D als Extrusion, Nuten, radiale Kernlöcher, Innenbohrungen, Fasen.
- Hülsen und Adapter entstehen genauso.
- **Ausgabe:**
  - je Teil ein STEP und ein STL
  - ein Baugruppen-STEP mit Platzhaltern der gekauften Teile
  - alles als ZIP
- Die Vorschau zeigt das Netz desselben Modells in three.js. Was man sieht, ist also das, was exportiert wird.

## Schritte

| Schritt | Inhalt |
|---|---|
| 1 | Seite `welle.html`, Datenmodell, Profile, DIN-Tabellen, `planShaft` mit Prüfskript (`scripts/shaft/check-plan.mjs`) |
| 2 | Zeitleiste: Spuren, Ziehen aus dem Katalog, Kanten ziehen, Einrasten, Silhouette, Eigenschaften |
| 3 | replicad im Worker, Welle als STEP/STL, 3D-Vorschau |
| 4 | Bearbeitungen: Madenschraube mit Kernloch, Gewinde am Ende, Passfeder- und Sicherungsring-Nut, Abflachung |
| 5 | Distanzhülsen und Adapter automatisch, ZIP mit allen Teilen und Stückliste |
| später | Welle aus dem Studio öffnen und zurückgeben; weitere Generatoren auf demselben Gerüst |
