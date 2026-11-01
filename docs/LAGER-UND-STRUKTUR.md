# Lagerung und generativer Struktur-Kern

Plan für die beiden nächsten Etappen nach den Antrieben (KINEMATIK-KERN.md 15):

- **Teil A – Lagerung:** Jede Achse und jede Getriebewelle bekommt automatisch
  ihre Lager aus einem Katalog, so gesetzt, dass sie auf der Achse liegen, nichts
  schneiden, Mindestabstände halten und montierbar bleiben. Ergebnis sind
  **Haltepunkte** (Lagersitze, Motorflansche, Wellenenden) mit den Aufnahmen, in
  die Kaufteile geklemmt werden.
- **Teil B – Struktur-Kern:** Ein eigenständiger Kern, der Haltepunkte durch
  optimierte Geometrie verbindet (Kräfte, Steifigkeit, Druckbarkeit), wie es
  Generative-Design-Systeme tun. Er kennt keine Zahnräder; die Mechanik ist nur
  ein Lieferant von Haltepunkten, Lasten und Sperrräumen. Derselbe Kern baut
  ein Arduino-Gehäuse auf eine Hutschiene.

## Stand (umgesetzt)

| Demo | Glieder | Lager (Teil A) | Strukturen (Teil B) | Zeit |
|---|---|---|---|---|
| Roboterarm | Sockel, Drehteller, Oberarm, Unterarm | 14× 625, 6× 608, 3 Wellen Ø5, 3 Gelenkwellen Ø8 | alle gültig, 15–64 Streben je Glied | ≈ 70 s |
| CNC-Portal | Rahmen, Portal, Wagen, Z | 6× 608 (Fest-/Loslager), 12× LM8UU auf 6 Rundstangen, 3 Flanschmuttern | alle gültig, 40–115 Streben | ≈ 90 s |
| Schlitten | Bahn, Wagen | 10× 625 (Getriebe, 4 Laufrollen) | alle gültig; Bahn als Brückenträger mit Füßen | ≈ 80 s |

Gültig heißt: alle Haltepunkte angebunden, ein geschlossenes Netz, frei von Sperrzonen,
kollisionsfrei gegen die Nachbarglieder über deren ganzen Achsbereich. Festigkeit und
Steifigkeit gegen die angenommenen Lasten (20 N je Haltepunkt in alle Richtungen plus
Torsion, PLA, Sicherheit 3, höchstens 0,5 mm Nachgeben) werden mit Ort und Wert als
Hinweis gemeldet; sie hängen von den Lastannahmen ab, die im Studio einstellbar sind.

Abweichungen vom Plan unten (nach Versuchen):
- **Topologie:** Statt Fachwerk-LP bzw. OC wächst ein Steiner-Baum von den Auflagern aus:
  jeder Haltepunkt (fernster zuerst) schließt über den kürzesten freien Weg an den
  nächsten Punkt des Baums an; Kanten mit wenig Freiraum kosten mehr (Wege laufen in die
  Mitte freier Räume). „Baum mit Querstreben“ gibt jedem Haltepunkt einen zweiten,
  weitgehend getrennten Weg und Querstreben zwischen Ästen; „netzartig“ mehr davon.
  Die OC-Verfahren (Fachwerk `optimizeAreas`, Rahmen `optimizeFrame`) bleiben im Kern,
  lieferten aber an Engstellen Mechanismen bzw. zu dichte Netze.
- **Statik:** Gedruckte Knoten sind steif: Bemessung und Nachweis am räumlichen
  Rahmenmodell (Balken mit Biegung und Torsion, `frame.ts`), Radius nach Festigkeit und
  Steifigkeit, nie dicker als der Freiraum.
- **Lagerplatten:** Sitze paralleler Getriebewellen und Motorflansche auf gleicher Höhe
  werden zu einer Platte (konvexe Hülle) verbunden, wie im Getriebegehäuse.
- **Freiraum exakt:** Das Abstandsfeld des Tragwerks wird beim Vernetzen mit dem
  Sperrfeld beschnitten; ein 4-mm-Lipschitz-Gitter hält das schnell.
- **Zugänge:** Lager eines Gelenks bekommen eine Zufahrtszone, Schienenhalter eine Zone
  darunter; das zuerst erzeugte Nachbarglied muss sie freilassen.
- **Reihenfolge und Nachbarn:** Glieder werden von der Spitze zur Basis erzeugt und
  meiden die Nachbarn über deren Gelenk; weiter entfernte Glieder werden nur geprüft
  (Hinweis bei Berührung in Extremstellungen – Achsgrenzen).
- **Schiene am Pfad:** Für den Wagen ist die Schiene ein festes Teil im Wagenrahmen
  (exakt auf Geraden, Krümmung nicht verfolgt).

Noch offen: SIMP/Schalenmodus (B5/B6, Arduino-Gehäuse auf Hutschiene), physikalisch
abgeleitete Lasten (Zahnkräfte, Spindelschub statt Pauschallast), Druckorientierung und
Überhang, Laufzeit unter 30 s.

Tests: `scripts/structure/check-sdf.mjs`, `check-frame.mjs`, `check-generate.mjs`,
`check-bearings.mjs`, `check-links.mjs [robot|cnc|sled]` (mit `OUT=…` STL und Bild),
`scripts/check-studio-structure-browser.mjs [robot|cnc|sled]`.

Das importierte 3D-Modell dient nur dazu, Glieder und Achsen zu setzen. Die
gedruckte Struktur je Glied wird erzeugt; das Modellteil wird dabei ersetzt
(wahlweise bleibt seine Hülle als Bauraum erhalten).

---

## Teil A – Lagerung

### A.1 Was gelagert wird

Lagerstellen entstehen an drei Orten:

1. **Getriebewellen** (`M1/s1`, `M1/s2`, …): Körper mit `shaft`, getragen vom
   Glied, auf dem der Motor sitzt. Die Motorwelle `M1/s0` ist im Motor gelagert;
   bei langem Überhang (Hinweis „Kupplung oder längere Welle“) bekommt sie ein
   Stützlager.
2. **Modellachsen** (Drehachse `Ellbogen`, Linearachse `X`, Pfad `Fahrt`): das
   Gelenk zwischen zwei Gliedern. Die Welle ist in einem Glied fest, das
   andere läuft auf Lagern; bei einer Gabel zwei Lager im Gabelglied.
3. **Linearachsen:** Rundführung mit Linearkugellagern oder gedruckten
   Gleitbuchsen; Spindel beidseitig mit Festlager/Loslager.

### A.2 Vertrag

Erweiterung von kinematics-1 (keine neue Dokumentart):

- `Interface` hat bereits `outer-ring`; neu `shaft-fixed` (Welle in Körper
  fest: Klemmung, Madenschraube, Presssitz).
- Neues Element-Herkunftsmerkmal: `source: {kind:'library', library:'bearing',
  part:'625-2RS'}` mit Wirkflächen leer (kein Abrollen) und Hülle = Außenring.
- `Body.shaft` bekommt `stock` (Kaufteil: Ø, Länge, Werkstoff, Anflachungen,
  Nuten) und `supports: Seat[]`.
- **Seat (Lagersitz)** – der Haltepunkt für Teil B:

  ```
  Seat = {id, body: 'Oberarm', shaft: 'M3/s1', bearing: '625', frame,
          kind: 'press-fit'|'clamp'|'sleeve'|'linear',
          seatDiameter, depth, shoulderBore, wall, retention:
          'circlip'|'spacer'|'setscrew'|'shoulder', access: 'axial+'|'axial-'|'split'}
  ```

- `Mechanism.bearingSettings`: Mindestabstand Lager–Zahnrad (2 mm), Lager–Lager
  (≥ 1,5 · d, mindestens 8 mm), Wandstärke hinter dem Sitz (2 mm), diametrales
  Aufmaß Presssitz (+0,15 mm, Druckprobe), Spiel Gleitlager (0,3 mm), Vorzug
  beidseitig/fliegend, erlaubte Lagerarten, Wellenwerkstoff.
- Prüfung `bearings-open` wird zu `bearings` mit pass/fail je Welle.

### A.3 Katalog

`src/mechanics/kinematics/bearings.ts`, Kaufteile mit d × D × B:

| Art | Teile | Einsatz |
|---|---|---|
| Rillenkugellager | 623 (3×10×4), 683, 625 (5×16×5), 605, 685, MR85 (5×8×2,5), 626, 686, 608 (8×22×7), 688 (8×16×5), 628, 6000, 6001; Flanschvarianten F623/F625/F688 | Getriebewellen, Modellachsen |
| Gleitlager | gedruckte Bohrung mit Spiel; Messing-/Polymerbuchse 5×7×5, 8×10×8 | langsame Achsen, kleine Kräfte, Bauraum |
| Linear | LM8UU (8×15×24), LM12UU, gedruckte Buchse auf 8-mm-Welle | Linearachsen |
| Axial | Anlaufscheibe, 51100 | Schnecken, Kegelräder (Axialkraft) |
| Welle | Silberstahl 3/5/6/8/10/12 mm, Länge nach Bedarf, Anflachung, Nut DIN 471 | alle |

Jeder Eintrag trägt Tragzahl (C, C0), zulässige Drehzahl, Preisstufe und
Montageart (Presssitz, Klemmhälften, Flansch mit Schrauben).

### A.4 Platzierung je Welle

1. **Belegung der Achse** als Intervalle entlang z: Elementhüllen (+Mindestabstand),
   Kupplungen, Schneckenreichweite, Wellenenden der 90°-Paarungen, plus alle
   Stellen, an denen ein Lagerzylinder (Ø D + 2 · Wand) andere Hüllen,
   Modellteile (außer dem tragenden Glied), Motoren oder Sperrzonen schneiden
   würde (Kapsel-gegen-Hülle entlang der Achse, auch über den Achsbereich der
   bewegten Glieder).
2. **Stützschema:** beidseitig (ein Sitz jenseits jeder Seite der Teilegruppe)
   bevorzugt; sonst fliegend (zwei Sitze auf einer Seite, Abstand ≥ 1,5 · d).
   Modellachsen: Gabel → zwei Sitze im Gabelglied; einfach → Sitz im einen,
   Welle fest im anderen Glied.
3. **Lagerwahl:** Welle-Ø → Kandidaten; Last aus Motormoment × Übersetzung und
   Zahnkräften (F_t = 2T/d, F_r = F_t·tan 20°) → C0-Reserve; Bauraum → D muss
   frei sein; Bewertung: kurze Welle, symmetrische Stützung, kleines D, wenige
   verschiedene Teilenummern im Projekt, Preis.
4. **Welle:** Länge = Sitze + Sicherung + Fase, Anflachungen unter Madenschrauben,
   Nuten für Sicherungsringe; wird Kaufteil in der Stückliste.
5. **Montierbarkeit:** Für jede Welle wird ein axialer Korridor (Radius = größte
   Hülle auf der Welle) jenseits eines Endes geprüft. Frei → „axial einschieben“,
   Sitz offen zu dieser Seite. Sonst → Gehäuseteilung: alle Achsen parallel und
   koplanar → Plattenbauweise (wie HOUSING.md), sonst Klemmhälften am Sitz
   (`kind:'clamp'`, zwei Schrauben). Zusammenhängende Druckteile müssen nach
   der Teilung zueinander zugänglich sein (Werkzeugkorridor für Schrauben,
   Sichtlinie zur Madenschraube).
6. **Aufnahmen:** je Sitz die Bohrung (D + Aufmaß, Tiefe B), Schulter
   (Ø d + 1,5 mm, damit der Innenring frei läuft), Wand (≥ 2 mm) und
   gegebenenfalls Klemmschrauben; Motorflansch (NEMA-Lochbild) ebenso. Diese
   Aufnahmen sind die Haltepunkte von Teil B.

### A.5 Studio

Schritt ⑥ „Lagerung“: Einstellungen (A.2), Tabelle je Welle (Lagerart, Sitze,
Welle, Montageweg, Prüfung), Lager aus dem Katalog überschreibbar, 3D zeigt
Ringe und die Wellenlängen; Stückliste (Lager, Wellen, Ringe, Schrauben).

### A.6 Abnahme

- `check-bearings.mjs`: auf den drei Demos bekommt jede Welle zwei Sitze, kein
  Sitz schneidet eine Hülle oder ein Modellteil (Rand 1 mm) in allen
  Achsstellungen, Mindestabstände eingehalten, jeder Sitz hat einen Montageweg.
- Browser: Schritt ⑥ sichtbar, Lager im 3D, Überschreiben aus dem Katalog.
- Druckprobe (manuell): Presssitz 625 mit +0,15 mm in PLA/PETG.

---

## Teil B – Struktur-Kern (generative Modellierung)

### B.1 Wie andere Systeme es machen

| System | Verfahren | Für uns |
|---|---|---|
| Autodesk Fusion Generative Design | Level-Set-Topologieoptimierung in der Cloud, Fertigungsregeln (additiv, fräsen, guss), Lastfälle, Halte-/Sperrgeometrie, Ergebnis-Explorer mit vielen Varianten | Vorbild für Vertrag (keep-in/keep-out/Haltepunkte/Lasten) und für die Varianten-Auswahl |
| Altair Inspire / OptiStruct | SIMP-Dichteoptimierung auf FE-Netz, danach PolyNURBS-Glättung | SIMP als zweiter Löser |
| nTopology | Implizite Modellierung (Signed Distance Fields), feldgesteuerte Dicken, Gitter, erst beim Export vernetzt | **Kernidee für unsere Geometrie:** alles als SDF, Boolesche Operationen und Verrundungen sind trivial, Vernetzung am Ende |
| Siemens NX, PTC Creo (Frustum), Ansys Discovery, CATIA (Tosca) | Level-Set oder SIMP, live auf GPU | bestätigt: Dichte-/Level-Set-Feld + implizite Nachbearbeitung |
| Layout-Optimierung (Michell, Gilbert & Tyas; LimitState Peregrine) | Grundstruktur aus Kandidatenstäben, lineares Programm liefert das Fachwerk minimalen Volumens | **unser erster Löser:** schnell, robust, parametrisch, ergibt organische Streben |
| DTU TopOpt-App, top88/top3d | 2D/3D-Lehrcodes, SIMP im Browser machbar | Referenz für Implementierung und Tests |
| Gehäuse-Generatoren (Ultimate Box Maker u. ä.) | parametrisch | derselbe Kern im Modus „Schale“ |

Gemeinsamer Nenner: **Haltepunkte + Lasten + Bauraum/Sperrraum + Fertigungsregeln
→ Feld (Dichte oder Abstand) → Glättung → Netz → Nachweis.** Genau so
bauen wir den Kern.

### B.2 Vertrag `structure-1`

Eigenständiges Modul `src/structure/`, ohne Abhängigkeit von `mechanics`:

```
Structure = {
  format: 'structure-1',
  bodies: [{id, mode: 'struts'|'shell'|'plate', material, print: {bed, orientation, nozzle, minWall, maxOverhang}}],
  anchors: [{id, body, frame, feature: BearingSeat|MotorFlange|ScrewBoss|Standoff|DinClip|ThroughHole|SnapFit|Contact, role: 'support'|'load'|'both'}],
  loads:   [{case, anchor, force: V, moment: V}],
  spaces:  {keepIn: Region[], keepOut: Region[]|Mesh[], moving: {hull, sweep: Frame[]}[], access: Corridor[], symmetry?: Frame},
  goals:   {objective: 'min-mass'|'max-stiffness', massBudget?, safetyFactor: 3, maxDeflection?},
}
```

- **Anchors** sind die Haltepunkte aus Teil A (Lagersitze, Flansche) oder frei
  gesetzte (PCB-Löcher, Hutschienen-Clip). Jedes Feature weiß, wie es sich als
  Volumen (Boss) und als Abzug (Bohrung, Sitz, Lochbild) im Feld darstellt.
- **moving** sind über den Achsbereich gewischte Hüllen (Zahnräder, Glieder):
  bei Mechanismen die wichtigste Sperrzone.
- **access** sind Korridore (Schraubendreher, Welle einschieben, Kabel).
- Ausgabe: je Körper ein wasserdichtes Netz (STL/3MF), Nachweis (Spannung,
  Durchbiegung, Sicherheit, Masse, Stützmaterial), Stückliste der Features.

### B.3 Pipeline

1. **Bauraum:** keep-in minus keep-out/moving/access als SDF (Sperrzonen mit
   Rand). Gitterauflösung 1–2 mm für die Optimierung, 0,3–0,5 mm für das Netz.
2. **Skelett (Löser 1, Grundstruktur):** Knoten = Haltepunkte + gesampelte
   freie Punkte (Roadmap); Kanten = Strecken ganz im Freiraum (Sichtbarkeit),
   um Hindernisse herum auch Bögen. Lineares Programm: minimiere Σ lᵢ·|qᵢ| unter
   Gleichgewicht an jedem Knoten je Lastfall → Stäbe mit Kräften, Querschnitt
   aus Spannung (voll ausgelastet) und Knicken. Streben ohne Kraft verschwinden.
   Ergebnis: verzweigte Streben zwischen den Haltepunkten.
3. **Dichtefeld (Löser 2, SIMP):** Voxel-FE (Hexaeder, PCG), Nachgiebigkeit
   minimieren bei Volumenanteil, Dichtefilter, Überhangfilter für den Druck
   (Langelaar), Symmetrie. Für Platten und Schalen und als Vergleich zum
   Fachwerk. 60³ Voxel laufen im Worker; größer später in WASM.
4. **Geometrie (implizit):** Stäbe → Kapseln/Kegel mit weichem Minimum
   (Verrundung an Knoten), Dichtefeld → Isofläche mit Glättung, Haltepunkte →
   Bosse und Abzüge (Sitz, Schulter, Lochbild, Senkung), Schale → Offset der
   Sperrhülle mit Wandstärke, Deckelteilung, Schnappverschluss. Alles ein
   SDF-Baum, auswertbar an jedem Punkt.
5. **Netz:** Dual Contouring / Marching Cubes auf 0,3–0,5 mm, wasserdicht,
   Export STL/3MF. OpenSCAD-WASM bleibt für exakte Kaufteil-Negativformen
   möglich, ist aber nicht der Hauptweg.
6. **Nachweis:** Voxel-FEM auf dem Ergebnis (gleicher Löser wie 3): Spannung,
   Durchbiegung, Sicherheit; Druckprüfung: Überhänge, Mindestwand (SDF-Erosion),
   Auflagefläche, Stützvolumen; Masse, Druckzeit grob.
7. **Schleife und Varianten:** voll ausgelastete Bemessung (Querschnitte nach
   Spannung nachziehen), dann Varianten über Regler „Material“, „Steifigkeit“,
   „ohne Stützen drucken“ → Liste zum Vergleichen wie bei Fusion.

### B.4 Phasen und Abnahme

| Phase | Inhalt | Abnahme |
|---|---|---|
| B1 | SDF-Kern (Primitive, Boolesch, Offset, weiches Minimum), Marching Cubes, STL | Primitive und Vereinigungen werden wasserdicht vernetzt; Volumen auf 1 % genau |
| B2 | Feature-Bibliothek: Lagersitz, NEMA-Flansch, M3-Boss mit Einpressmutter, PCB-Abstandshalter, Hutschienen-Clip 35 mm, Durchgangsloch, Schnappverschluss | jedes Feature als Boss und Abzug, Maße parametrisch, Druckprobe der Clips |
| B3 | Grundstruktur-Löser mit Sperrräumen; Kapsel-Vereinigung; erste Halterung: Schulter des Roboterarms (zwei Lagersitze + Motorflansch) | Streben liegen im Freiraum, alle Haltepunkte verbunden, Netz druckbar |
| B4 | Voxel-FEM und Prüfungen; Bemessungsschleife | Sicherheitsfaktor ≥ 3 bei Nennlast, Überhang ≤ 45°, Mindestwand eingehalten |
| B5 | SIMP mit Überhangfilter; Vergleich zu B3 auf denselben Fällen | gleiche Lasten, Masse und Steifigkeit beider Löser im Bericht |
| B6 | Modus Schale: Arduino Uno auf Hutschiene (eigenständige Demo ohne Mechanik) | Gehäuse mit Deckel, Lochbild, Aussparungen für USB/Netzteil, Clip rastet |
| B7 | Anbindung Mechanik: Gehäusekörper je Glied aus den Sitzen von Teil A, gewischte Hüllen als Sperrraum, Teilung aus dem Montageweg; Studio-Schritt ⑦ „Struktur“, STL je Glied, Stückliste | Roboterarm, CNC-Portal, Schlitten komplett als Druckteile + Kaufteile |

### B.5 Entscheidungen und Risiken

- **Erst Fachwerk, dann SIMP.** Die Grundstruktur liefert in Sekunden
  brauchbare Halterungen und ist leicht zu prüfen; SIMP ist das „Optimum“ für
  flächige Teile und braucht mehr Rechenzeit. Beide münden in dasselbe SDF.
- **Implizit statt CSG-Netz.** Verrundungen, Wände, Offsets und Abzüge sind in
  SDF robust; Netz-Boolesche Operationen sind es nicht. Vernetzt wird nur am Ende.
- **FEM ist ein Relativmaß.** Voxel-FEM mit PLA/PETG-Kennwerten und Sicherheit 3
  reicht für Halterungen; kein Festigkeitsnachweis im Sinne einer Norm.
- **Passungen** (Presssitz, Spiel, Clips) müssen gedruckt und gemessen werden;
  die Werte im Vertrag sind Startwerte.
- **Montierbarkeit** bleibt regelbasiert (axialer Korridor, Teilung). Eine
  vollständige Demontageplanung ist nicht Ziel.
- **Leistung:** Worker zuerst, WASM (Rust) für FEM und Marching Cubes, wenn
  Gitter > 60³ nötig werden.

### B.6 Reihenfolge

A komplett (die Sitze sind die Haltepunkte), dann B1–B3 bis zur ersten
gedruckten Halterung am Roboterarm, dann B4 (Nachweis), B6 (Gehäuse, zeigt die
Eigenständigkeit), B5 und B7.
