# Etappe E — Zahnriemen und geführte Linearachsen

## Umfang
Drei parametrisierte Baugruppen-Vorlagen ergänzen das bisherige Stirnradgetriebe:
GT2-Riementrieb, Spindelachse und Zahnstangenachse. Auswahl über **Baugruppen-Vorlage**.
Sie besitzen eigene Eingangs-/Ausgangsanschlüsse und können gespeichert, gerendert und als
Einzelteil-STLs/ZIP exportiert werden. Die frühere Stirnrad-Anordnung bleibt im Projekt erhalten.
Eine automatische Suche nach gemischten Ketten aus Stirnrädern, Riemen und Linearwandlern
ist nicht enthalten. Die Prolog-Suche der Etappe C bleibt für Stirnradketten verfügbar.
Beim Wechsel einer Achsvorlage werden deren Standardparameter gesetzt; wichtige Varianten vorher speichern.

`motion.ts` definiert Parameter, Beispielkatalog, Kinematik und analytische Prüfungen.
`motion-cad.ts` erzeugt daraus CAD und Stücklisten. `MotionPanel.tsx` stellt Eingaben,
Prüfungen, Riemenvergleich, Vorschauposition und Einzelteil-Downloads bereit.
Projektformat **3** speichert die aktive Vorlage unter `motion`. Versionen 1 und 2 werden
automatisch migriert; fehlt `motion`, bleibt das Stirnradprojekt aktiv. Die neue Versionsnummer
verhindert, dass ältere Anwendungen ein Achsprojekt unbemerkt als Stirnradpaar interpretieren.
Der bestehende localStorage-Schlüssel bleibt zur Wiederherstellung alter Projekte erhalten.

## GT2-Riementrieb
Offener, ungekreuzter Endlosriemen: 2 mm Teilung, 6 mm Breite. Beispielkatalog der Scheiben:
16/20/30/40/60 Zähne; Riemenlängen 200/280/300/400/500/600/610/752/800 mm.
Dies sind konfigurierbare Katalogvorgaben, keine aktuelle Lieferbarkeitsliste.

Teilkreisradius `r = Z * 2 / (2π)`. Für Achsabstand C und Radien R, r gilt mit d = |R-r|:

```
L = 2 sqrt(C²-d²) + π(R+r) + 2 d asin(d/C)
```

Die Längenberechnung verwendet gerade Tangenten und beide Umschlingungsbögen.
Eine monotone Bisektion bestimmt C für jede Kataloglänge. Es gibt keine Rundung auf eine
nahe Länge ohne erneute Berechnung des Achsabstands. Übersetzung = Z_Ausgang / Z_Eingang,
Drehrichtung gleichläufig. Die kleine Scheibe muss in dieser Vorlage mindestens 120°
Umschlingung und sechs Zähne im Eingriff haben. Das sind Entwurfsregeln, keine Lastfreigabe.

Der Eingang bleibt bei (0,0). Die Ausgangs-Lagerbrücke darf sich ausschließlich im freigegebenen
Bereich `Nennabstand ± Stellweg/2` bewegen. Das ist eine ausdrücklich verstellbare Achse;
die festen Anschlussachsen des Stirnradprojekts werden nicht verändert.
Eine Kataloglänge ist nur zulässig, wenn von der rechnerischen Position mindestens 2 mm
Entspannweg nach innen und 1 mm Nachspannreserve nach außen bleiben. Ohne Stellweg gibt es
keine freigegebene Lösung. Die Flanschhüllen dürfen auch am kleinsten erlaubten Achsabstand
nicht kollidieren. Der Stellweg wird als Langloch in die Grundplatte übernommen.

Beispiel: 20/40 Zähne, 300-mm-Riemen, Nennabstand 120 mm und 20 mm Stellweg ergeben
**119,831 mm** Achsabstand. Das ist die unbelastete Teilkreisgeometrie, keine berechnete
Vorspannung. Nach Herstellervorgaben spannen und die beiden M3-Klemmschrauben sichern.

Die Vorlage verwendet gekaufte Scheiben mit Flanschpaket 8 mm und zusätzlicher Klemmnabe
Ø16 × 8 mm. Die Vorschau zeigt Teilkreis-/Flansch-/Nabenhüllen, kein erfundenes GT2-Zahnprofil.
Riemen und Scheiben werden nicht als Fertigungs-STL exportiert. Kaufteilmaße vor Beschaffung
abgleichen. Zwei Lagerplatten je Welle, zwei Lager 5 × 8 × 2,5 mm und zwei Metallhülsen
Ø5,1/6 × 3,85 mm halten das Scheibenpaket mit nominell 0,3 mm axialem Gesamtspiel.
Die Scheiben müssen auf den Wellen klemmbar und für das Einlegen des Riemens demontierbar sein.
Zwischen Scheibenpaket und Platten liegen 4 mm; größere Freiraumvorgaben werden abgelehnt.

## Gemeinsame Linearführung
Zwei Ø8-mm-Wellen im Abstand 60 mm und je zwei LM8UU (8 × 15 × 24 mm) führen den Schlitten
entlang +X und verhindern Mitdrehen. Antrieb und Führung übernehmen getrennte Aufgaben.
Die Führungswellen werden in geschlitzten Endträgern geklemmt. Die Schraubenseite des Schlitzes
hat eine Durchgangsbohrung, die Gegenseite ein M3-Pilotloch. Endträger sind von unten lösbar
mit der Grundplatte verschraubt. Zwei abnehmbare Schlittenkappen halten die Linearlager.

Hub 20–500 mm, Führungslänge 140–700 mm. **Führung auf Hub abstimmen** setzt die Länge
auf Hub + 134 mm. Die Länge wird sonst nicht stillschweigend verändert: zu großer Hub
blockiert Rendern/Export. Der Schlitten samt Kappen muss bei allen Positionen vollständig
geführt bleiben und darf Endhalter oder Grundplatte nicht berühren.
Die aktuelle Vorschauposition ist unabhängig von dieser Prüfung ein Wert zwischen 0 und Hub.

## Spindelachse
TR8-Vorlagen mit **2 oder 8 mm Vorschub je Eingangsumdrehung**. Vorschub und Gewindesteigung
sind nicht gleichzusetzen. Spindel und Mutter sind Kaufteile, als Hüllen dargestellt.
Die Mutter ist über vier M3-Schrauben am Schlitten gegen Rotation gesichert. Konkrete Vorlage:
Körper Ø10 × 11,5 mm, Flansch Ø22 × 3,5 mm, vier Löcher auf Ø16 mm, 45° versetzt.
Nicht jede TR8-Mutter entspricht diesen Maßen; vor Kauf und Fertigung abgleichen.

Die Spindel braucht glatte Ø8-mm-Lagerzapfen. Links liegt ein separater radialer 608-Lagerträger.
Zwei Axiallager (8 × 16 × 5 mm) sitzen beidseitig des linken Führungsträgers zwischen
Klemmringen. Dadurch erfolgt die axiale Abstützung in beiden Richtungen. Die radiale Lagerstelle
ist getrennt von den axialen Auflageflächen. Rechts läuft der glatte Zapfen im radialen Loslager;
er wird dort nicht zwischen zusätzlichen Wellenbünden eingespannt. Lagerdeckel sind abnehmbar.

Die Stückliste beschreibt einen passend bearbeiteten Spindelzuschnitt, keine beliebige durchgehend
gewindete Stange, auf deren Gewindegängen Kugellager laufen sollen. Muttergewindeeingriff,
Schlittenendlagen und Abstand zur axialen Sicherung werden geprüft. Axialspiel am Muster einstellen;
Klemmringe nicht so anziehen, dass die Lager verspannt werden. Knicken, kritische Drehzahl,
Motorleistung, Wirkungsgrad und zulässige Lasten sind nicht berechnet.

## Zahnstangenachse
Die Zahnstange bewegt sich seitlich mit dem Schlitten; das angetriebene Ritzel bleibt fest.
Modul 2, 20° Eingriffswinkel, geradverzahnt, Zahnbreite 10 mm. Ritzel mit 20 Zähnen:
**40π ≈ 125,664 mm je Eingangsumdrehung**. Das ist ein Weg, keine dimensionslose Untersetzung.
Ritzel und Zahnstange verwenden die vorhandene BOSL2-Verzahnung mit Profilverschiebung 0
und Backlash 0,15 mm. Die Ritzelphase folgt der linearen Position.

Die Zahnstangenlänge wird auf eine ungerade Zahnzahl aufgerundet und deckt Hub plus mindestens
40 mm ab. Der feste Kontaktpunkt bleibt so an beiden Endlagen mindestens 20 mm vom Rackende
entfernt. Zwei verschraubte Schlittenarme tragen den Rackrücken. Ein in zwei Platten gelagertes
Ritzel sitzt seitlich am Rahmen; Nabe, Metallhülsen und Madenschraube sichern seine Welle.
Rack und Arme haben 4 mm seitlichen Abstand zur festen Rahmen-/Ritzelhülle; höhere Vorgaben
werden abgelehnt. Die Grundplatte berücksichtigt die vollständige Ausladung der bewegten Zahnstange.

## Prüfung des gesamten Hubs
Bei geradliniger Bewegung ist die überstrichene achsparallele Hülle eines Bauteil-Hüllquaders
analytisch berechenbar: seine X-Ausdehnung wird um den Hub erweitert. Es werden Hüllen für
Schlitten/Kappen, Mutterflansch beziehungsweise Zahnstange und Montagearme geprüft.
Dies ist keine Stichprobe der gerade angezeigten Position. Die Körperhüllen selbst sind konservativ;
ein Treffer kann bei gekrümmten Teilen auch ein falsch positives Ergebnis sein.

Ein optionaler Sperrquader hat Mittelpunkt und Größe in XYZ. Gegen ihn werden sowohl die
vollständigen Bewegungshüllen als auch feste Rahmen-, Führungs- und Antriebshüllen geprüft,
jeweils mit Mindestabstand. Der Riemenantrieb verwendet eine konservative Gesamthülle über
den gesamten freigegebenen Stellweg. Sie kann auch leere Innenbereiche sperren.

Vorgesehene Lager-, Führungs-, Gewinde- und Zahnkontakte sind konstruktive Paarungen. Die Vorlage
prüft eigene Abstände zwischen Führung, Schlitten, Endträgern, Platten und Antrieb; sie ist kein
allgemeiner Kollisionslöser für beliebige importierte STL-Geometrie. Der Zahnkontakt des Racks
wird zusätzlich in Tests mit echten BOSL-Schnittgeometrien an mehreren Phasen überprüft.

## Export und Abnahme
ZIP: druckbare Rahmen-/Schlitten-/Lagerteile, bei Rack zusätzlich echte Zahnstange und Ritzel;
`project.json`, `parts.json`, `checks.json` mit Anschlüssen/Hüllen und `MONTAGE.txt`.
Einzelne STLs sind separat erzeugbar. Kaufteile werden nicht als Druckteile ausgegeben.
Alle STLs verwenden mm und eine Unterseite bei Z=0. Querbohrungen können Stützen oder
Nacharbeit benötigen. Lange Grundplatten und Racks werden nicht automatisch für kleine
Druckbetten segmentiert. Schrauben-Pilotlöcher müssen wie angegeben nachgeschnitten werden.

Motor, Kupplung, Endschalter und elastische Endanschläge sind noch keine parametrierten Teile.
Vor motorischem Betrieb ergänzen. Die Softwareprüfungen ersetzen keinen Passungs-, Druck-,
Montage- oder Lastversuch. Diese physische Abnahme bleibt wie in Etappe D offen.

Tests: `node scripts/check-motion.mjs`, `node scripts/check-motion-browser.mjs`.
Letzterer rendert alle drei Vorlagen, Endpositionen und sämtliche Einzelteile, prüft STL-Kanten,
Zusammenhang und Drucklage, ZIP-Inhalt, Persistenz, Sperrräume, zu kurzen Führungsweg,
Abbruch/Neustart und Rückkehr zum Stirnradprojekt.
