# Kinematik-Kern: Abrollen, Gelenke und Suche (Entwurf, 31.10.2026)

Dieses Dokument beschreibt den neuen Kern der Mechanik-Werkbank. Er ersetzt den
Elementgraphen in `src/mechanics/graph/` und wird daneben aufgebaut, nicht an
dessen Stelle. Der alte Kern bleibt lauffähig, bis der neue die Abnahmefälle in
Abschnitt 11 besteht.

Der Kern beantwortet drei Fragen für beliebige Formen, nicht nur für Zahnräder:

1. **Was passt zusammen?** Zwei Wirkflächen kämmen, wenn ihre Profile konjugiert
   sind. Das ergibt sich aus Regeln, nie aus Listen einzelner Teilepaare.
2. **Wie bewegt sich das Ganze?** Körper, Gelenke und Rollkontakte bilden einen
   Mechanismus mit Schleifen. Der Löser findet die Stellung für jede
   Eingangsstellung und liefert die Übersetzung als Verlauf.
3. **Welche Teile fehlen?** Die Suche wählt Antriebsstränge und erzeugt
   Gegenstücke, die zu vorhandenen Teilen aus beliebigen Bibliotheken passen.

---

## 1. Ziel und Abgrenzung

**Ziel**

- Alles, was abrollt, in einem Modell: Stirnräder, Kegelräder, Zahnstangen,
  Rollen in Führungen, unrunde Räder, gebogene Zahnstangen, Riemen, Schnecken.
- Teile aus Bibliotheken (LEGO, Kaufteile) und gedruckte Teile gleichberechtigt.
  Ein gedrucktes Gegenstück zu einem Bibliotheksteil ist der Normalfall.
- Mechanismen mit mehreren Körpern, Gelenken und geschlossenen Schleifen,
  einschließlich Mustern (Spiegelung, Reihe) und Bezügen zwischen Parametern.
- Übersetzung als Zahl **oder** als Verlauf über den Eingangsweg.
- Automatische Suche nach Antriebssträngen in diesem Modell, mit den heute
  erreichten Verfahren: Reichweitentest, Endlage von beiden Enden,
  Levenberg-Marquardt, Freiraum.

**Nicht Ziel (bewusst weggelassen)**

- Kräfte, Momente, Gewicht, Federn, Reibungsverluste. Die Richtung einer
  Bewegung ist dem Kern egal.
- Spiel und Toleranzketten. Toleranzen gibt es nur als Prüfschwellen.
- Allgemeine Flächenkontakte (Nocken auf Stößel). Sie lassen sich später als
  Kontaktart ergänzen, brauchen aber nichts im Vertrag.
- Elastische Teile. Ein Riemen ist ein Umschlingungskontakt mit Längenbedingung,
  keine Simulation.

---

## 2. Warum ein neuer Kern

Der heutige Elementgraph beruht auf drei Annahmen, die alle fallen:

| Annahme heute | Folge | Neu |
|---|---|---|
| Übersetzung ist eine Zahl (`transfers → gain`) | nur Kreise und Geraden | Übersetzung ist eine Funktion, die Zahl ist der Sonderfall |
| Jeder Körper hat genau einen Freiheitsgrad gegenüber dem Gestell | nur offene Ketten, keine Scharniere, keine Schleifen | Gelenke zwischen beliebigen Körpern, Schleifen werden gelöst |
| Eine Paarung verbindet zwei Elemente derselben Familie | LEGO nur mit LEGO, Stufenrad nur als zwei Teile | Paarung zwischen Wirkflächen; ein Teil hat beliebig viele |

Diese Annahmen stecken in `model.ts`, `registry.ts`, `refine.ts`,
`robust-search.ts` und `construction.ts`. Sie dort umzubauen hieße, fast jede
Zeile zu ändern, während alles weiterlaufen muss. Deshalb ein neuer Kern.

Vom Modell unabhängig und deshalb zu übernehmen: `frames.ts` (Rahmen),
`space.ts` (Trennachsentest), LEGO-Teiledaten und OpenSCAD-Generatoren, die
Werkbank und das Studio, die 67 Testskripte als Abnahmetests sowie die
Verfahren in `reach.ts`, `closure.ts` und `refine.ts`.

---

## 3. Das Grundgesetz: gleiche Bogenlänge

Abrollen ohne Schlupf bedeutet, dass beide Seiten dieselbe Bogenlänge zurücklegen:

```
s_a(q_a) = s_b(q_b) + c
```

`q` ist die Gelenkkoordinate des Körpers (Winkel oder Weg), `s` die Bogenlänge
auf seiner Wälzkurve, `c` der Versatz beim Einbau (Zahnphase). Das ist die
einzige kinematische Gleichung des Kontakts. Alles andere sind Spezialfälle:

| Wälzkurven | ds | Übersetzung i = dq_b/dq_a |
|---|---|---|
| Kreis r_a, Kreis r_b | r·dφ | r_a / r_b, konstant |
| Kreis r, Gerade | r·dφ = dx | 2π·r pro Umdrehung, konstant |
| unrund r_a(θ), unrund r_b(θ) | √(r² + r'²)·dθ | r_a / r_b am Kontaktpunkt, **Funktion** |
| Kreis r, Pfad in 3D | r·dφ = ds_Pfad | 2π·r pro Umdrehung, Richtung ändert sich |

Bei festen Achsen liegt der Kontaktpunkt auf der Verbindung der beiden Achsen.
Für unrunde Räder ist die Wälzkurve polar um die Achse parametrisiert, r(θ).
Das setzt voraus, dass jeder Strahl von der Achse die Kurve genau einmal
schneidet (sternförmig um die Achse). Das ist eine Prüfbedingung, keine
Einschränkung des Modells.

Ein Zahnrad ist also **kein** Kreis mit Radius 0, sondern ein Kreis mit dem
Wälzradius m·z/2. Die Zähne sind eine zweite Schicht auf der Wälzkurve. Eine
Rolle ist dieselbe Wälzkurve ohne diese Schicht.

---

## 4. Bausteine

Alle Typen in TypeScript-Notation. Vektoren `V2`, `V3`, Rahmen `Frame` wie in
`frames.ts`.

### 4.1 Kurven

Die Wälzkurve ist das universelle Grundelement. Sie liegt in der lokalen Ebene
der Wirkfläche (z = Achse) oder, für Pfade, im Raum.

```ts
type Curve2=
 | {kind:'circle';r:number}
 | {kind:'line'}
 | {kind:'polyline';points:V2[];closed:boolean;cornerRadius:number}
 | {kind:'polar';samples:number[];closed:true};        // r(θ) in gleichen Winkelschritten
type Curve3={kind:'path';points:V3[];closed:boolean;cornerRadius:number;axis?:V3};
type Curve=Curve2|Curve3;
```

Jede Kurve bietet dieselbe Schnittstelle, nach Bogenlänge parametrisiert:

```ts
interface CurveFn{
 length:number;closed:boolean;
 point(s:number):V3;tangent(s:number):V3;normal(s:number):V3;curvature(s:number):number;
 frame(s:number):Frame;          // Pfade: rotationsminimierender Rahmen entlang des Pfads
 polarRadius?(theta:number):number; // nur geschlossene ebene Kurven, sternförmig um den Ursprung
}
```

Regeln:

- Polylinien werden an jeder Ecke mit `cornerRadius` verrundet. Eine Ecke mit
  Radius 0 ist ungültig, weil dort die Krümmung unendlich wäre und sich kein
  Zahn erzeugen lässt.
- Kreis und Gerade sind geschlossene Formeln. Alle anderen Kurven werden einmal
  abgetastet (Tabelle über s) und dann interpoliert. Die Abtastung ist so fein,
  dass die Sehnenabweichung unter 0,01 mm bleibt.
- Pfade im Raum tragen ein Rahmenfeld: Tangente plus eine Normalebene, die sich
  entlang des Pfads minimal dreht. `axis` erzwingt optional eine feste Lage der
  Normalebene, zum Beispiel senkrecht für eine Torführung.

### 4.2 Profile

Das Profil ist das, was auf der Wälzkurve sitzt und Kraft überträgt.

```ts
type Profile=
 | {kind:'involute';module:number;pressureAngle:number;backlash:number}   // Bezugsprofil
 | {kind:'library';id:string;reference:{module:number;pressureAngle:number};tolerance:number}
 | {kind:'generated';from:{element:string;surface:string}}               // durch Abdrücken erzeugt
 | {kind:'belt';pitch:number;toothed:boolean}                              // GT2: pitch 2, toothed
 | {kind:'helical';lead:number;starts:number}                               // Schnecke, Spindel
 | {kind:'friction'};                                                        // Rolle
```

- `involute` ist das Bezugsprofil. Zwei Wirkflächen mit demselben Bezugsprofil
  kämmen, **egal welche Wälzkurve** sie haben. Das ist der Satz, der Listen
  überflüssig macht: Alles, was mit demselben Werkzeugprofil erzeugt wurde, ist
  zueinander konjugiert.
- `library` ist ein nicht exakt bekanntes Profil, zum Beispiel LEGO. Es wird
  einmal gegen ein Bezugsprofil gemessen (Gitternetz-Prüfung wie in
  `check-lego-contact-mesh.py`) und mit einer Toleranz freigegeben. Danach
  verhält es sich wie das Bezugsprofil.
- `generated` ist exakt konjugiert zu genau einer anderen Wirkfläche, weil es
  durch Abrollen aus ihr entstanden ist (Abschnitt 5.3). Es passt zu nichts
  anderem.
- `belt` und `helical` sind keine Rollkontakte im engen Sinn, folgen aber
  demselben Bogenlängengesetz (Abschnitt 4.7).

### 4.3 Wirkflächen

```ts
type Surface={
 id:string;
 pitch:Curve2;              // in der Ebene z = 0 des Elements, Ursprung auf der Achse
 profile:Profile;
 z:[number,number];         // axiale Ausdehnung der Verzahnung
 side:'external'|'internal';
 cone?:number;              // Kegelwinkel in Grad, 0 = Stirnrad, 90 = Planrad
 helix?:number;             // Schrägungswinkel, 0 = gerade
};
```

Ein Teil hat eine oder mehrere Wirkflächen. Ein Stufenrad mit Modul 2 und
Modul 1 ist ein Element mit zwei Wirkflächen in verschiedenen z-Bereichen. Ein
LEGO-Doppelkegelrad hat eine Stirn-Wirkfläche und eine Kegel-Wirkfläche.

### 4.4 Elemente, Herkunft, Montageflächen

```ts
type Interface=
 | {kind:'bore';diameter:number;z:[number,number]}
 | {kind:'technic-cross';z:[number,number]}
 | {kind:'outer-ring';diameter:number;z:[number,number]}   // Lageraußenring
 | {kind:'flange';frame:Frame};                             // Anschraubfläche
type Element={
 id:string;
 source:{kind:'printed'}|{kind:'library';library:string;part:string};
 surfaces:Surface[];
 interfaces:Interface[];
 envelope:Envelope;         // Hülle für Freiraum, wie heute
 mounts:{interface:string;body:string;pose:Frame}[];       // auf welchem Körper es sitzt
 phase:number;              // Drehlage um die eigene Achse
};
```

- Die **Herkunft** ist der Passung egal. Ein LEGO-24er ist ein Element mit
  `source: library` und einer Wirkfläche `{circle 12, library lego-m1}`.
- Ein Element kann auf **zwei Körpern** sitzen. Dann impliziert es das Gelenk,
  das seine Montageflächen zulassen: Ein Kugellager (Innenring auf der Achse,
  Außenring am Paneel) **ist** das Drehgelenk. Niemand trägt es zusätzlich ein.
- Elemente auf demselben Körper mit gemeinsamer Achse bilden automatisch einen
  Rotorverbund. Das ersetzt `rotorGroup` und `sharedRotor`.

### 4.5 Körper

```ts
type Body={id:string;frame:Frame;ground?:boolean;shaft?:{diameter:number;start:number;end:number}};
```

Ein Körper hat keine eingebaute Bewegung mehr. Wie er sich bewegt, ergibt sich
aus seinen Gelenken. `shaft` bleibt als Zeichnungs- und Freiraumangabe. Genau
ein Körper ist `ground`.

### 4.6 Gelenke

```ts
type Joint=
 | {kind:'fixed'}                                   // 0 DOF
 | {kind:'revolute'}                                // 1: Drehung um lokale z
 | {kind:'prismatic'}                               // 1: Verschiebung entlang lokaler z
 | {kind:'cylindrical'}                             // 2: Drehung und Verschiebung um z
 | {kind:'screw';lead:number}                       // 1: Drehung und gekoppelte Verschiebung
 | {kind:'path';curve:Curve3;roll:'free'|'locked'}  // 1 (+1): Läufer auf Pfad
 | {kind:'spherical'};                              // 3
type JointRelation={
 id:string;joint:Joint;
 a:{body:string;local:Frame};b:{body:string;local:Frame};
 derived?:string;           // gesetzt, wenn ein Muster oder Element das Gelenk erzeugt hat
 redundant?:boolean;        // nur prüfen, nicht lösen (Abschnitt 4.8)
};
```

Die Gelenkachse ist immer die lokale z-Achse beider Rahmen. Koordinaten:

| Gelenk | Koordinaten | Residuen (6 minus DOF) |
|---|---|---|
| fixed | – | Position 3, Rotation 3 |
| revolute | φ | Position 3, Achsrichtung 2 |
| prismatic | x | Achsrichtung 2, Querversatz 2, Verdrehung 1 |
| cylindrical | φ, x | Achsrichtung 2, Querversatz 2 |
| screw | φ (x = lead·φ/360) | Position 3 minus Kopplung, Achsrichtung 2 |
| path | s (+ ρ bei roll free) | Position auf Pfad 3, Rahmen 2 oder 3 |
| spherical | 3 Winkel | Position 3 |

**Läufer auf Pfad:** Körper b sitzt am Punkt `curve.point(s)` mit dem Rahmen
`curve.frame(s)`, Körper a trägt den Pfad. `roll: free` erlaubt zusätzlich die
Drehung um die Pfadtangente; `locked` nicht. Eine Rolle in einer C-Schiene ist
`locked`, ein Seil über eine Rolle `free`.

### 4.7 Kontakte

Ein Kontakt koppelt zwei Wirkflächen. Er trägt keine eigenen Koordinaten; er
verknüpft die Gelenkkoordinaten der beteiligten Körper.

```ts
type Contact={
 id:string;
 kind:'roll'|'belt'|'helical';
 a:{element:string;surface:string};b:{element:string;surface:string};
 mode:'fixed-axes'|'follower';
 params:{offsetA:number;offsetB:number;azimuth?:number;angle?:number;length?:number};
};
```

Residuen je Art:

- **roll, fixed-axes:** beide Achsen stehen fest (über Gelenke zum Gestell oder
  zu anderen Körpern). Residuen: Wälzkurven berühren sich (Achsabstand bzw.
  Kegelspitzen fallen zusammen), Bogenlängengleichheit `s_a − s_b − c = 0`,
  Zahnphase. Konjugation der Wälzkurven ist Prüfbedingung (Abschnitt 5).
- **roll, follower:** eine Achse wandert entlang der anderen Wälzkurve (Rolle
  auf Pfad, Ritzel auf gebogener Zahnstange). Residuen: Achse liegt in der
  Normalebene des Pfads im Abstand r, Bogenlängengleichheit. Der Körper mit der
  wandernden Achse braucht ein `path`-Gelenk oder eine Schleife, die seine Lage
  bestimmt.
- **belt:** zwei Kreise, Übersetzung r_a/r_b, Längenbedingung
  `L(a, r_a, r_b) = length` mit Achsabstand a. Riemenlängen aus dem Katalog wie
  heute (`BELTS`).
- **helical:** Schnecke oder Spindel. Die Schnecke ist eine Zahnstange auf einer
  Schraubenlinie: Übersetzung `starts / z` bei 90° Achskreuz, Achsabstand
  r_Schnecke + r_Rad. Spindel/Mutter ist das `screw`-Gelenk und braucht keinen
  Kontakt.

`azimuth` und `angle` sind die heutigen Suchvariablen (Lage des Gegenstücks um
die Achse, Achswinkel bei Kegelrädern) und bleiben in `params`.

### 4.8 Muster und Bezüge

```ts
type Pattern=
 | {kind:'mirror';plane:Frame;source:string[]}
 | {kind:'array';count:number;step:Frame|{alongJoint:string;offset:number};source:string[]};
type Parameter={id:string;value:number|{expr:string};unit?:'mm'|'deg'|'1'};
```

- Ein Muster erzeugt aus Quellkörpern, -elementen, -gelenken und -kontakten
  abgeleitete Kopien mit `derived` gesetzt. Abgeleitete Objekte sind
  schreibgeschützt und folgen der Quelle.
- **Gelenke aus Mustern sind redundant.** Die gespiegelte Führung eines Tors
  schränkt das Tor nicht zusätzlich ein, sie wiederholt dieselbe Einschränkung.
  Würde der Löser beide lösen, wäre die Schleife überbestimmt und schlösse
  wegen Rundungsfehlern nie. Abgeleitete Gelenke werden daher nur **geprüft**:
  Ihr Residuum muss innerhalb der Toleranz liegen, es geht nicht in die
  Normalgleichungen ein.
- Parameter mit `expr` sind einfache arithmetische Ausdrücke über andere
  Parameter (`torHoehe/3`, `paneelHoehe-2*rand`). Kein Skripting. Sie werden vor
  dem Lösen ausgewertet; Zyklen sind ein Fehler.

### 4.9 Anschlüsse, Bereich, Ziel

```ts
type Terminal=
 | {kind:'frame';body:string;local:Frame;target:Frame;constraint:'frame'|'axis';tolerance?:{position:number;angle:number}}
 | {kind:'coordinate';joint:string;coordinate:0|1|2};
type Range={from:number;to:number;samples:number};          // Eingangsweg, über den alles gelten muss
type Target=
 | {kind:'ratio';value:number;tolerance:number}            // Zahl, wie heute
 | {kind:'stroke-per-turn';value:number;tolerance:number}
 | {kind:'profile';samples:{input:number;output:number}[];tolerance:number};  // Verlauf
```

- `frame`-Anschlüsse sind die heutigen Ein- und Ausgänge. `coordinate`-Anschlüsse
  sitzen auf einer Gelenkkoordinate: Motor auf der Spindeldrehung, Ausgang auf
  dem Torweg s.
- Der `Range` ersetzt die eine Stellung von heute. Für Rahmenziele ohne
  Schleifen ist `samples: 1` ausreichend und entspricht dem heutigen Verhalten.

### 4.10 Umgebung

Bauraum, Sperrzonen und Randabstand bleiben wie heute (`Environment`). Neu ist
nur, dass die Hülle eines Körpers über den gesamten `Range` vereinigt wird
(Abschnitt 7.5).

### 4.11 Das Dokument

```ts
type Mechanism={
 format:'kinematics-1';
 parameters:Parameter[];
 bodies:Body[];elements:Element[];joints:JointRelation[];contacts:Contact[];patterns:Pattern[];
 input:Terminal;output:Terminal;range:Range;target?:Target;
 environment?:Environment;
};
```

---

## 5. Passung, Konjugation und Erzeugung

### 5.1 Wann zwei Wirkflächen passen

Zwei Wirkflächen a und b kämmen genau dann, wenn eine der Bedingungen gilt:

1. Beide Profile haben dasselbe Bezugsprofil: gleicher Modul, gleicher
   Eingriffswinkel (bei `library` innerhalb der Toleranz). Zusätzlich müssen
   Kegelwinkel und Schrägungswinkel zusammenpassen (Summe bzw. Gegenwinkel).
2. Ein Profil ist `generated` aus dem anderen.
3. Beide sind `friction`, oder beide `belt` mit gleicher Teilung, oder a ist
   `helical` und b hat das passende Bezugsprofil (Schneckenrad).

Diese Prüfung kennt keine Teilenummern und keine Familien. Deshalb kämmt ein
LEGO-Rad mit jedem gedruckten Rad mit Modul 1, und ein gedrucktes Rad mit Modul 2
mit jedem anderen Modul-2-Rad, auch wenn beide unrunde Wälzkurven haben.

### 5.2 Konjugierte Wälzkurven bei festen Achsen

Für Kontakte `fixed-axes` müssen die Wälzkurven zueinander passen. Gegeben
r_a(θ) und der Achsabstand a:

```
r_b(ψ) = a − r_a(θ)
ψ(θ)   = ∫₀^θ r_a(t) / (a − r_a(t)) dt
```

Die Gegenkurve ist geschlossen, wenn ψ(2π) = 2π·p/q für ganze p, q ist (b macht
p/q Umdrehungen je Umdrehung von a). Für vorgegebenes p/q wird a durch
Bisektion gelöst; ψ(2π) ist in a streng monoton fallend. Für Kreise reduziert
sich das auf a = r_a + r_b.

Daraus folgt: Bei festen Achsen darf man **eine** Wälzkurve frei wählen, die
zweite ist bestimmt. Bei `follower`-Kontakten ist der Pfad frei und die
Wälzkurve des Läufers ein Kreis.

### 5.3 Gegenstück erzeugen: Abdrücken

Die Zahnform von b ist der Rohling von b minus die Vereinigung aller Lagen von a
während des Abrollens (Hüllkurve). So entstehen reale Zahnräder beim Wälzfräsen,
und das Verfahren ist Profil und Form gleichgültig:

- Ritzel auf einem gebogenen Pfad abrollen → gebogene Zahnstange (Rail).
- LEGO-Rad (echtes Gitternetz) auf einem Kreisrohling abrollen → gedrucktes
  Gegenstück mit beliebiger Zähnezahl, exakt zum LEGO-Profil.
- Kreisrad auf einem verrundeten Dreieck → Dreieckszahnrad.

Durchführung:

1. Relative Bewegung aus dem Bogenlängengesetz abtasten, Schrittweite so, dass
   der Kontaktpunkt um höchstens 0,05 mm springt.
2. Eben: Zahnkontur von a als Polygon in jeder Lage, boolesche Vereinigung,
   vom Rohlingpolygon abziehen, extrudieren. Für Kegelräder auf der Kugel
   (sphärisch), für Pfade die 2D-Kontur entlang des Pfads sweepen.
3. Räumlich (Rail, LEGO-Gitternetz): Vereinigung der Volumen in jeder Lage,
   vom Rohling abziehen. Das ist teuer und geschieht nur für gewählte
   Lösungen, mit Cache je Wirkflächenpaar.

Bezugsprofil-Räder auf Kreisen werden weiterhin direkt von OpenSCAD erzeugt
(`spur_gear`, `bevel_gear`). Die Hüllkurve ist der allgemeine Weg, nicht der
einzige.

### 5.4 Prüfbedingungen je Kontakt

| Bedingung | Regel | Fehler |
|---|---|---|
| Sternförmig | jeder Strahl von der Achse schneidet die Wälzkurve einmal | `pitch/star` |
| Mindestkrümmung | ρ ≥ ρ_min; Richtwert 4·m mit Profilverschiebung, 8,5·m ohne; endgültig entscheidet die Hinterschnittprüfung der Hüllkurve | `pitch/curvature` |
| Neigung | μ = atan(r'/r) ≤ 15° bei 20° Eingriffswinkel, damit der wirksame Eingriffswinkel zwischen 5° und 35° bleibt | `pitch/slope` |
| Schluss | konjugierte Gegenkurve schließt (5.2) | `pitch/closure` |
| Durchdringung | über einen Umlauf keine Überschneidung der Zahnkonturen außer im Eingriff | `mesh/interference` |
| Läufer | Rollenradius < kleinster Krümmungsradius des Pfads auf der Innenseite | `path/roller` |

---

## 6. Der Löser

### 6.1 Konfiguration und Residuen

Unbekannte sind alle Gelenkkoordinaten q (ohne redundante Gelenke) plus die
Kontaktparameter, die als Suchvariablen freigegeben sind. Residuen sind:

- Gelenkresiduen (Tabelle 4.6) für alle nicht redundanten Gelenke,
- Kontaktresiduen (4.7),
- Anschlussresiduen: Eingang auf dem vorgegebenen Wert, Ausgang auf dem Ziel,
- Umgebungs- und Freiraumresiduen wie heute (`max(0, Abstand_soll − Abstand)`).

Der Mechanismus wird einmal je Abtaststellung des `Range` aufgestellt und die
Residuen werden gestapelt. Bei Schleifen muss die Kette **in jeder Stellung**
schließen, nicht nur in einer. Die Suchvariablen (Zähnezahlen sind diskret,
`azimuth`, `angle`, Sitze) sind über alle Stellungen gemeinsam; die
Gelenkkoordinaten sind je Stellung eigene Unbekannte.

### 6.2 Verfahren

Levenberg-Marquardt wie in `refine.ts`, mit folgenden Ergänzungen:

- **Analytische Ableitungen** für Gelenk- und Kreis/Kreis-Kontaktresiduen.
  Nur Hüllen- und Tabellenkurven werden numerisch abgeleitet. Das war im alten
  Kern der zweitgrößte Zeitfresser.
- **Dünn besetzte Normalgleichungen.** Je Stellung ein Block; die gemeinsamen
  Suchvariablen koppeln die Blöcke. Schur-Komplement über die Stellungen.
- **Startwerte:** Endlage von beiden Enden (`closure.ts`) verallgemeinert auf
  Ketten aus Gelenken und Kontakten; für Schleifen wird die Schleife an einem
  Gelenk aufgeschnitten und der Schnitt als Residuum geführt.
- **Zeitbasiertes Nachgeben** im Worker wie heute (`yieldSometimes`).

### 6.3 Beweglichkeit

Vor dem Lösen:

1. Grübler-Zählung: F = 6·(n−1) − Σ(6 − f_i) über alle nicht redundanten
   Gelenke, n Körper einschließlich Gestell. Kontakte zählen als 1 Bindung.
2. Numerischer Rang der Jacobimatrix in der Startstellung. Weicht er von der
   Zählung ab, liegt eine Sonderstellung oder eine stillschweigend redundante
   Bindung vor.

Ergebnis muss F = 1 sein (ein Eingang). Andernfalls meldet der Kern, welche
Schleife über- oder unterbestimmt ist, mit den beteiligten Gelenken. Das
ersetzt das heutige Raten, warum eine Kette nicht schließt.

### 6.4 Ergebnis

```ts
type Solution={
 mechanism:Mechanism;                       // mit festen Werten für alle Suchvariablen
 poses:{input:number;bodies:Record<string,Frame>;joints:Record<string,number[]>}[];  // je Stellung
 transfer:{constant?:number;samples:{input:number;output:number}[]};
 checks:Check[];                            // wie heute: pass / fail / unknown
 envelope:Box[];                            // vereinigte Hüllen über den Range
};
```

---

## 7. Die Suche

Die Suche wählt Antriebsstränge zwischen Eingang und Ausgang. Alles, was im
Dokument schon steht (Paneele, Führungen, Scharniere), ist vorgegeben; gesucht
werden fehlende Kontakte, Elemente und ihre Parameter.

### 7.1 Was aufgezählt wird

- **Kontaktketten** vom Eingangskörper zum Ausgangskörper, wie heute die
  Muster über Paarungsarten (`choose`-Tiefensuche über Übersetzungsmuster).
- **Wirkflächen-Kandidaten** je Kontakt:
  - vorhandene Elemente aus dem Teilevorrat (Bibliotheken, Studio-Katalog),
  - erzeugte Gegenstücke: zu einer gegebenen Wirkfläche ein gedrucktes Rad mit
    demselben Bezugsprofil, Zähnezahl als **diskreter Suchparameter** in einem
    Bereich (z. B. 8 bis 60), oder ein `generated`-Profil per Hüllkurve, wenn
    das Bezugsprofil nicht bekannt ist.
- **Kontinuierliche Variablen** je Kontakt wie heute: `azimuth`, `angle`,
  axialer Sitz, bei Riemen die Katalogslänge.

### 7.2 Übersetzung in der Mustersuche

Die Mustersuche rechnet mit der **mittleren** Übersetzung eines Kontakts:
Verhältnis der Wälzkurvenlängen bei geschlossenen Kurven, Länge je Umdrehung bei
Läufern. Damit bleiben die heutigen Verfahren unverändert: Gruppierung nach
Übersetzung, Reichweitentest, Annulus-Schranken. Erst für fertige Kandidaten
wird der Verlauf gegen ein `profile`-Ziel verglichen.

### 7.3 Reichweite

`reach.ts` bleibt für offene Ketten mit einem Achswechsel. Zusätzlich:

- Pfadgelenke und Läuferkontakte tragen mit ihrer Pfadlänge zur Reichweite bei.
- Für zwei Achswechsel wird der Test auf die Ebene der beiden Achsen erweitert
  (offener Punkt aus der Suchoptimierung).

### 7.4 Budget und Reihenfolge

Unverändert: gerichtete Starts, Zufallsrest, Endlage von beiden Enden,
Reparaturstufe bei Kollisionen. Budget und Rückweisungsgründe (`closure`,
`space`, `reach`, `repaired`) werden wie heute gemeldet, damit
`bench-graph-search.mjs` und der Zufallstest weiter vergleichbar bleiben.

### 7.5 Freiraum über den Bewegungsbereich

Die Hülle jedes Körpers wird über alle Stellungen des `Range` vereinigt
(orientierte Boxen je Stellung, Trennachsentest mit `enough` wie heute). Die
heutigen `sweeps` (gerade Bewegungen) sind der Sonderfall mit zwei Stellungen.
Lager- und Zugangsräume bleiben offene Hinweise, keine Fehler.

---

## 8. Bibliotheken

Eine Bibliothek ist eine Liste von Elementen mit `source: library`, ihren
Wirkflächen, Montageflächen, Hüllen und Darstellungen. LEGO ist die erste, aber
nichts im Kern bezieht sich auf sie.

```ts
type Library={id:string;version:string;parts:{part:string;name:string;element:Omit<Element,'id'|'mounts'|'phase'>;mesh?:string}[]};
```

Für LEGO entstehen die Wirkflächen aus `lego-parts.ts`: Stirnräder als
`{circle z/2, library lego-m1}`, Doppelkegelräder zusätzlich mit
`{cone 45, library lego-m1}` und dem per Gitternetz freigegebenen Winkelbereich,
Schnecken als `helical`. Die Freigabe eines `library`-Profils gegen ein
Bezugsprofil ist ein einmaliger Prüfschritt (`check-lego-contact-mesh.py`), der
die Toleranz ins Profil schreibt.

---

## 9. Geometrieerzeugung

- Kreisräder mit Bezugsprofil: OpenSCAD wie heute.
- Alles andere: Hüllkurve (5.3). Eben mit Polygon-Booleschen-Operationen im
  Worker, räumlich mit einem Netz-Boolean (manifold). Die Ergebnisse werden je
  Wirkflächenpaar gecacht, weil sie bei gleicher Wälzkurve und gleichem Profil
  identisch sind.
- Rails: 2D-Zahnkontur der Zahnstange entlang des Pfads mit dem Rahmenfeld
  gesweept, dann Hüllkurve des Ritzels abgezogen, damit Innen- und
  Außenkurven korrekt sind.
- Ausgabe wie heute: STL je Teil, Baugruppe mit Posen je Stellung.

---

## 10. Adapter und Migration

- `adapter.ts` übersetzt heutige `Mechanism`-Dokumente (Version 1 bis 4) in
  `kinematics-1`:

| Heute | Neu |
|---|---|
| Körper `shaft` | Körper + `revolute`-Gelenk zum Gestell |
| Element `spur` | Element, Wirkfläche `{circle m·z/2, involute m 20°}` |
| Element `bevel` | Wirkfläche mit `cone` aus der Paarung |
| `external-spur`, `bevel-mesh`, `lego-spur`, `lego-bevel-90` | Kontakt `roll fixed-axes` |
| `gt2-belt` | Kontakt `belt` |
| `worm-mesh`, `lego-worm` | Kontakt `helical` |
| `screw-nut` | Gelenk `screw` |
| `rack-drive` | Wirkfläche `{line, involute}` und Kontakt `roll follower` |
| `rotorGroup` | mehrere Elemente auf einem Körper, implizit |
| `input`, `output` als Rahmen | `frame`-Anschlüsse, `range.samples = 1` |

- Rückrichtung für die UI: `Solution` liefert Körper, Elemente, Hüllen und
  Prüfungen in der Form, die Werkbank und Studio heute erwarten. Die 16
  Importstellen außerhalb von `graph/` werden auf den Adapter umgehängt, erst
  wenn Abnahmefall A besteht.
- Studio-Projekte (`StudioDocument`) bleiben; ihr `graph` wird beim Laden
  übersetzt und beim Speichern im neuen Format geschrieben.

---

## 11. Abnahmefälle

### A. Das heutige Getriebe

Alle Fälle aus `bench-graph-search.mjs` und dem Zufallstest mit festem Seed
(`random-shafts`, Seed 777) laufen durch den Adapter im neuen Kern.

Abnahme:

- Gleiche Anzahl Lösungen oder mehr, gleiche Lösungsmenge für `free-3`,
  `free-4`, `detour-4` (Hash der Lösungen).
- Zeit bis zur ersten Lösung höchstens 1,5× der heutigen Werte.
- Alle 33 heute bestehenden Node-Tests bestehen über den Adapter.

### B. Das Garagentor

Parameter: `torHoehe=2100`, `torBreite=2400`, `paneele=3`,
`paneelHoehe=torHoehe/paneele`, `kurvenRadius=300`, `rollenRadius=20`,
`lagerAbstand=paneelHoehe-120`, `spindelSteigung=8`.

Körper: `ground`, `paneel1`, `rolle1a`, `rolle1b`, `spindel`, `mutter`,
`koppel`. Paneele 2 und 3 mit ihren Rollen entstehen aus einem `array`-Muster
entlang des Pfads mit Versatz `paneelHoehe`.

Elemente: je Rolle ein Kugellager (`library`, Außenring am Paneel, Innenring auf
der Rollenachse) und die Rolle selbst (`printed`, Wirkfläche
`{circle rollenRadius, friction}`). Spindel `{helical lead 8}`, Mutter.

Gelenke:

- `fuehrung`: `path` mit `curve` = Gerade (senkrecht, `torHoehe`), Bogen
  (`kurvenRadius`, 90°), Gerade (waagrecht, `torHoehe`); `roll: locked`;
  Läufer `rolle1a` und `rolle1b` auf demselben Pfad (zwei Gelenke, der zweite
  Läufer je Paneel ist redundant).
- Lagergelenke `revolute` Rolle ↔ Paneel, aus den Lagerelementen impliziert.
- `scharnier12`, `scharnier23`: `revolute` Paneel ↔ Paneel, Achse waagrecht an
  der Paneelkante.
- `spindellager`: `revolute` Spindel ↔ Gestell. `spindel-mutter`: `screw`.
- `mutter-koppel`, `koppel-paneel1`: `revolute`, Achsen waagrecht.

Muster: `mirror` an der Mittelebene des Tors für Führung, Lager und Rollen.
Alle gespiegelten Gelenke sind redundant.

Anschlüsse: Eingang `coordinate` auf `spindellager`, Ausgang `coordinate` s auf
`fuehrung` (Läufer `rolle1a`). `Range`: s von 0 bis `torHoehe + π/2·kurvenRadius
+ torHoehe`, 40 Stellungen.

Abnahme:

- Beweglichkeit F = 1, keine Meldung über unterbestimmte Schleifen; die
  redundanten Gelenke liegen in allen Stellungen unter 0,05 mm.
- Übersetzung Motor → Torweg als Verlauf: konstant auf den Geraden, im Bogen
  durch die Koppel verändert; der Verlauf ist stetig.
- Vereinigte Hülle der Paneele kollidiert nicht mit einem Bauraum, dessen Decke
  `kurvenRadius + 60` über der Führungsoberkante liegt.
- Die Suche findet, mit vorgegebenem Motorrahmen und leerem Antriebsstrang,
  mindestens eine Lösung Motor → Spindel über Stirnräder oder Riemen.
- Läuferbedingung: `rollenRadius < kurvenRadius`.

### C. Bibliotheksteil mit erzeugtem Gegenstück

Ein LEGO-24er (`library lego-m1`) als Eingang, Ausgang 37 mm parallel versetzt,
Übersetzung 1:1,5 ± 1 %. Erwartet: ein gedrucktes Rad mit 36 Zähnen, Modul 1,
Wirkfläche `involute`, Achsabstand 30 mm plus zweite Stufe, oder ein Rad mit
`generated`-Profil, wenn die Toleranz von `lego-m1` überschritten wird.

Abnahme: Lösung mit genau einem gedruckten Teil, Zähnezahl nicht aus einer
Liste, Hüllkurven-Durchdringungsprüfung besteht.

### D. Unrundes Paar (zweite Phase)

Wälzkurve a: verrundetes Dreieck (Eckradius 12 mm, Umkreis 40 mm). Feste
Achsen, Verhältnis 1:1. Erwartet: Achsabstand per Bisektion, Gegenkurve
geschlossen, Zahnform per Hüllkurve, Übersetzungsverlauf mit drei Perioden je
Umdrehung.

---

## 12. Modulaufbau

```
src/mechanics/kinematics/
  curves.ts        Kurven, Abtastung, Rahmenfeld, Verrundung
  profiles.ts      Profile, Passung (5.1)
  surfaces.ts      Wirkflächen, Kegel, Schrägung
  conjugate.ts     Gegenkurven, Schluss, Prüfbedingungen (5.2, 5.4)
  model.ts         Dokument, Parameter, Muster, Validierung
  joints.ts        Gelenkresiduen und analytische Ableitungen
  contacts.ts      Kontaktresiduen (roll, belt, helical)
  mobility.ts      Grübler, Rang, Schleifenmeldung
  solver.ts        Konfiguration je Stellung, LM, Schur-Komplement
  envelope.ts      Hüllen über den Range, Freiraum
  search/
    patterns.ts    Übersetzungsmuster, mittlere Übersetzung
    reach.ts       Reichweite (übernommen und erweitert)
    closure.ts     Endlage von beiden Enden (übernommen)
    route.ts       Suche, Budget, Rückweisungsgründe
  generate/
    involute.ts    OpenSCAD-Aufrufe
    hull.ts        Hüllkurve eben und räumlich
    rail.ts        Sweep entlang Pfad
  libraries/
    lego.ts        LEGO-Teile als Elemente
  adapter.ts       alte Dokumente → kinematics-1, Solution → UI-Form
```

Tests in `scripts/kinematics/`: je Modul ein Eigenschaftstest (Zufall mit
Seed), dazu die Abnahmefälle A bis D als eigene Skripte. Die bestehenden 67
Tests bleiben unverändert und laufen über den Adapter.

---

## 13. Phasen und Abnahmekriterien

| Phase | Inhalt | Abnahme |
|---|---|---|
| 0 | Designdokument (dieses), Commit des aktuellen Stands | Einverständnis |
| 1 | `curves`, `profiles`, `surfaces`, `conjugate` mit Eigenschaftstests | Kreis/Kreis und Kreis/Gerade liefern die heutigen Formeln bitgenau; Dreieck-Gegenkurve schließt |
| 2 | `model`, `joints`, `contacts`, `mobility`, `solver` ohne Suche | Abnahmefall A über Adapter mit vorgegebenen Lösungen (nur Lösen, nicht Suchen); Garagentor löst über den Range |
| 3 | `search/` übernommen und auf das neue Modell umgestellt | Abnahmefall A vollständig, Benchmark und Zufallstest |
| 4 | Pfadgelenke, Läuferkontakte, `generate/rail` | Abnahmefall B einschließlich gedrucktem Rail |
| 5 | erzeugte Gegenstücke, `library`-Profile, `generate/hull` eben | Abnahmefall C |
| 6 | UI umhängen, alten Kern löschen | alle Browser-Tests |
| 7 | unrunde Paare, `profile`-Ziele | Abnahmefall D |

Jede Phase endet mit einem Commit und grünen Tests. Der alte Kern wird nach
Phase 0 nicht mehr weiterentwickelt.

### 13.1 Stand der Umsetzung (01.11.2026)

Alle Phasen sind umgesetzt; die Abnahmetests liegen in `scripts/kinematics/`.

| Phase | Commit | Abnahmetests |
|---|---|---|
| 1 | `14ebf26` | `check-curves`, `check-profiles`, `check-conjugate` |
| 2 | `c7b63bd` | `check-joints`, `check-model`, `check-solver`, `check-adapter`, `check-garage` |
| 3 | `3bc80d7` | `check-route` (Benchmark), `check-route-random` (24 Aufgaben, Seed 777: 21/24 wie der alte Kern) |
| 4 | `8edff1f` | `check-rail`, Linearteil von `check-adapter` |
| 5 | `4e5f63e` | `check-mates` |
| 6, 7 | `ae7430c` | alle bisherigen Node- und Browser-Tests, `check-search-seeds`, `check-noncircular` |

**Abweichungen von diesem Entwurf, die beim Bauen entschieden wurden:**

- *Phase 6, Umfang:* Studio und Werkbank behalten das Elementgraph-Dokument als
  Austauschformat. Die Suche, die Optimierung, die Umweg- und Endlagen-Starts
  laufen auf dem neuen Kern; `graph/robust-search.ts`, `graph/search.ts`,
  `graph/detours.ts` und `refineGraph` sind dünne Weiterleitungen auf
  `kinematics/legacy.ts`, der in beide Richtungen übersetzt (`chainFromGraph`,
  `toGraph`). `graph/closure.ts` und `graph/reach.ts` sind gelöscht. Darstellung,
  CAD-Ausgabe und Inspektion arbeiten weiter auf dem Elementgraphen; sie auf
  `kinematics-1` umzustellen ist ein eigener Schritt.
- *Zur Laufzeit registrierte Paarungsregeln* des Elementgraphen werden über
  `legacyProvider` zu Suchprovidern: Mate-Frame, Übersetzung und Hüllen kommen
  aus der Regel selbst.
- *Lager- und Zugangsräume* zählen weder bei Kollisionen noch bei Bauraum und
  Sperrzonen als Fehler, sondern als offener Punkt `bearings-open` (auch im
  Elementgraph-Gate).
- *Übersetzungsziel* `ratio` ist ω_ein/ω_aus wie im Elementgraphen; bei linearem
  Ausgang Millimeter je Eingangsumdrehung.
- *Läuferkontakte* haben `side` (Ritzel auf der +/−Normalenseite der Kurve);
  Wirkflächen dürfen offene Wälzkurven und Raumpfade tragen.
- *Rollbedingung* bei unrunden Kurven über die echte Bogenlänge `arcAt` statt
  r·ψ; Kreise bleiben bitgleich.
- *Hüllkurve* eben in Kurven- bzw. Polarkoordinaten (`generate/rail.ts`,
  `generate/hull.ts`) ohne Polygon-Bibliothek; ein räumliches Netz-Boolean ist
  noch nicht nötig gewesen.

---

## 14. Offene Fragen

- **Bezugsprofil für LEGO:** Ob `lego-m1` mit Evolvente m1 bei 20° innerhalb
  einer brauchbaren Toleranz liegt, entscheidet die Gitternetz-Prüfung. Falls
  nicht, laufen LEGO-Gegenstücke immer über `generated`.
- **Kegelräder unrund:** Konjugation auf der Kugel ist für Phase 7 vorgesehen,
  aber nicht ausgearbeitet. Bis dahin nur Kreiskegel.
- **Schrägverzahnung:** `helix` ist im Vertrag, die Hüllkurve dafür
  (Schraubbewegung statt ebener Bewegung) nicht. Vorerst gerade Zähne.
- **Mehrere Eingänge:** F > 1 ist ein Fehler. Differenziale und Planetengetriebe
  brauchen zwei Eingänge; der Löser kann das, die Suche nicht. Später.
- **Hüllkurve räumlich:** Welches Netz-Boolean im Worker läuft (manifold-wasm
  oder OpenSCAD-Union) wird in Phase 4 entschieden; die Schnittstelle ist in
  beiden Fällen dieselbe.
