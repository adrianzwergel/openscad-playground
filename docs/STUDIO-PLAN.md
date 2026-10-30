# Mechanics Studio – Interaktions- und Architekturplan

Stand: 30.10.2026. Entwurf, noch keine implementierte Studio-Oberfläche.
Montage, Lagerauslegung und generatives Gehäuse bleiben zurückgestellt.

## Entscheidung

Eine eigene Studio-Ansicht mit Three.js als interaktivem Szenenrenderer aufbauen.
Die bestehende Mechanics-Ansicht bleibt während der Migration als Prüf-/Expertenansicht.
Das Studio ist kein allgemeiner Solid-Modeller: Es modelliert zunächst Anschlüsse,
Bewegungsvorgaben, Räume, Katalogelemente und mechanische Verbindungsabsichten.
OpenSCAD bleibt Geometriegenerator, die bestehende Graphsuche bleibt Teilsolver.
Three.js ersetzt weder einen CAD-Kernel noch mechanische Zwangsbedingungen.

Bedienvorbild: CAD-Modellbaum und kontextbezogene Eigenschaften; lokale Anschlussrahmen
ähnlich Onshape Mate Connectors; direkte Transformationsgriffe wie in 3D-Editoren.
Numerische Eingabe bleibt für präzise Maße vorhanden, aber am ausgewählten Objekt.
Keine langen, voneinander getrennten Formulare als primärer Arbeitsablauf.

## Arbeitsfläche

- Oben: Auswählen, Verschieben, Drehen, Anschluss setzen, Raum erzeugen, Verbinden,
  Import, Rückgängig/Wiederholen. Aktiver Modus eindeutig erkennbar; Esc bricht ab.
- Links: Modellbaum mit Baugruppen, Importen, Anschlüssen, Räumen und Verbindungen.
  Sichtbarkeit, Sperren, Mehrfachauswahl; Katalog als umschaltbarer Tab.
- Mitte: dauerhaft sichtbare 3D-Szene mit Raster, Achsen, Orientierungshilfe,
  Auswahlkonturen, transparenten Prüfhüllen und gestrichelten Verbindungsabsichten.
- Rechts: nur Eigenschaften und Aktionen der aktuellen Auswahl. Leere Auswahl zeigt
  kurze Hinweise, nicht sämtliche Projektparameter.
- Unten: Suchaufträge, Fortschritt, Konflikte und kompakte Varianten. Vorschau einer
  Variante als temporäre Szene; erst Übernehmen ändert das Projekt.

Alle Kontextmenüaktionen auch per sichtbarer Aktion erreichbar; Rechtsklick ist keine
Voraussetzung. Tastaturauswahl, Löschen, Escape, Undo/Redo und bedienbare Zahlenfelder.
Mausziehen ist eine Undo-Operation; keine hunderten Einträge pro Pointer-Bewegung.

## Beispielablauf: importierter Roboterkörper

1. Körper importieren, Einheiten/Skalierung bestätigen und im Modellbaum benennen.
2. Bohrung/Zylinderfläche wählen → Anschluss erzeugen. Zentrum und Achse werden
   vorgeschlagen; Richtung, Ursprung, Rolle und Freiheitsgrad werden sichtbar bestätigt.
3. Vier Beinausgänge setzen oder eine Baugruppe mit lokalen Anschlüssen viermal
   instanzieren. Kopien haben eigene Instanz-IDs und gemeinsame Vorlagendefinition.
4. Erlaubte Räume aufziehen, Gehäusewände/Akkus als Sperrbereiche markieren.
5. Eingang mit Ausgang verbinden: gestrichelte Linie mit Pfeil und Sollübersetzung.
6. Rechtsklick/Toolbar „Mechanik dafür finden“; lokal erlaubte Katalogsets und
   Stufengrenzen wählen. Die Linie ist eine Absicht, kein kollisionsgeprüfter Pfad.
7. Lösungen live in der Szene vergleichen, Konflikte hervorheben und eine übernehmen.
8. Bei globaler Mehrfachsuche erst einen zusammen geprüften Gesamtkandidaten übernehmen.

Verbindungsstatus auch per Symbol/Text: offen, sucht, Kandidaten, gelöst, Konflikt,
veraltet. Veränderung eines beteiligten Anschlusses macht abhängige Lösungen veraltet.
Keine stillschweigende Weiterverwendung einer früheren Freigabe.

## Szenenmodell als neue Ebene

Nicht `output` einfach durch `outputs[]` im bestehenden Solver ersetzen.
Neue Studio-Dokumentversion mit folgenden getrennten Entitäten:

- Asset: importierte Quelldatei, Inhaltshash, Format, Einheit, Version und Metadaten.
- Assembly/Instance: stabile ID, Parent, lokaler Rahmen, Vorlagen-/Assetbezug.
- Port: stabile ID, Besitzer, lokaler Rahmen, Rotation/Translation, Sollrolle,
  Achs-/Rahmenzwang, Hub und optionale geometrische Referenz.
- Region: Besitzerrahmen, Rolle erlaubt/verboten, Form/Quelle, Abstand und Geltungsbereich.
- RouteIntent: Quelle, Ziel, Übersetzung/Vorschub samt Einheit, Richtung,
  ggf. relative Phase, Katalogsets, Stufengrenzen und Raumzuordnung.
- DriveNetwork: mehrere RouteIntents, gemeinsame Elemente/Wellen, Motoren und
  Koppelbedingungen; Realisierung als mechanischer Graph mit mehreren Ports.
- Realization: gewählte Elemente/Körper/Relationen mit stabilen IDs und Herkunft
  aus einem Suchauftrag. Geprüfte Revision und Prüfumfang speichern.
- CatalogSet: versionierte Daten für freigegebene Familien und Kombinationen.
- SearchJob: Dokumentrevision, Abhängigkeiten, Budget, Teilresultate und Status.

Modellbaum (Besitz/Koordinaten), mechanischer Graph (Bewegungsübertragung) und
Three.js-Szenengraph (Darstellung) sind verschiedene Strukturen. Das Dokument ist die
Wahrheit; Renderobjekte und temporäre Lösungen dürfen es nicht unkontrolliert mutieren.
Command-/Transaction-Schicht für alle Änderungen, Undo/Redo und Abhängigkeitsinvalidierung.
Arbeitskonvention mm, normierte Quaternionen intern; präzise lokale/weltweite Eingabe.

## Mehrere Ketten und mehrere Ausgänge

A. Mehrere unabhängige Ketten in derselben Szene:
Bestehenden Ein-/Ausgangssolver über Adapter aufrufen. Ein globaler Koordinator prüft
Kollisionen zwischen sämtlichen Ketten, Importen, Räumen und Bewegungsreservierungen.
Nicht einfach vier isolierte Suchergebnisse nebeneinander als gültig markieren.
Zunächst priorisierte Reihenfolge mit alternativen Kandidaten; bei Konflikt betroffene
Ketten zurücknehmen und neu routen. Varianten unterschiedlicher Reihenfolge untersuchen.
Bereits festgelegte Baugruppen dürfen explizit gesperrt werden.

B. Ein gemeinsamer Antrieb mit mehreren Ausgängen:
Verzweigte Topologien und gemeinsame Zwischenwellen/Rotorknoten im Solver zulassen.
Gemeinsame Teile nur einmal anlegen und zählen. Alle Übertragungen, Drehrichtungen
und vorgegebenen Phasen müssen gleichzeitig passen. Kandidaten gemeinsam im Raum
optimieren und prüfen. Ein einfacher Zusammenbau unabhängig gelöster Pfade genügt nicht.
Forschungspunkt: Kandidatenbeam über Verzweigungsstellen plus globale Lageoptimierung;
keine Vollständigkeitsgarantie für die kombinatorische Suche versprechen.

C. Vierbeiniger Roboter:
Vier unabhängige Aktoren und vier Ausgänge eines Motors sind getrennte Vorlagen.
Ein Motor kann seine Ausgänge über feste Übersetzungen/Phasen koppeln, aber nicht vier
Beine unabhängig steuern. Eine komplette Gehbewegung benötigt Gelenkmodell,
Bewegungsprogramme und ggf. geschlossene kinematische Schleifen. Das ist ein eigener
Ausbau, nicht automatisch durch die bisherige Getriebesuche abgedeckt.
Anfangs räumliche Antriebsanordnung in definierten Posen plus explizite Bewegungsreserven;
kein behaupteter Kollisionsnachweis über einen unbekannten kompletten Gangzyklus.

## Interaktive Geometrie und Import

Three.js: Auswahl/Picking, Transformationsgriffe, Orbit-Kamera, Raster-/Winkelsnap,
Hit-Test auf Anschlüsse, transparente und separat pickbare Raumobjekte.
Verschieben/Drehen des Besitzers führt angehängte Anschlüsse und Räume mit.
Skalierung bei Importen explizit; keine freie Skalierung kataloggebundener Zahnräder.
Für Räume parametrische Griffpunkte statt beliebiger Mesh-Verformung.

STL/GLB zunächst als Referenznetze:
- Einheiten bei STL ausdrücklich erfragen/setzen; keine stillschweigende Annahme.
- Punkt, Dreieck und erkannte ebene Bereiche können als Referenz dienen.
- Mesh-Kanten sind nicht automatisch konstruktive CAD-Kanten. Bohrungs-/Kreiserkennung
  ist eine geometrische Schätzung mit Güteanzeige und Bestätigung, nicht garantiert.
- Ein Import ist zunächst sichtbar, nicht automatisch ein Sperrkörper.

STEP als separater Importpfad mit einem OCCT-basierten CAD-Kernel im Worker:
- B-Rep-Flächen/Kanten und ihre Zuordnung zur triangulierten Anzeige erhalten.
- Zylinderfläche → Achse/Radius, Kreisrand → Zentrum/Normalenrichtung,
  ebene Fläche → Ebene, gerade Kante → Richtung.
- Nicht jeder Zylinder ist eine Bohrung; Innen-/Außenrolle und gewünschte Verwendung
  bleiben nachvollziehbar. Offene Flächen allein definieren keinen Bauraum.
- Konkrete WASM-Anbindung erst nach Import-/Topologie-Probe, Lizenz-, Speicher- und
  Kompatibilitätsprüfung auswählen. Ein reiner Triangulationsimport reicht nicht.

Referenzen tragen Assetversion, Entity-ID, lokalen Rahmen und geometrische Signatur.
Nach Austausch/Reimport können Flächen-IDs wechseln. Nicht eindeutig wiedergefundene
Referenzen markieren und neu zuordnen lassen, niemals an eine andere Kante hängen.

## Import als Sperr- oder Bauraum

Sichtbare Oberfläche, belegtes Volumen und erlaubtes Innenvolumen getrennt behandeln.
Ein Gehäuse ist nicht automatisch innen vollständig verboten. Nutzer wählt Körper,
Hohlraum oder eine selbst erzeugte Raumregion. Beliebige Freiformregionen benötigen
neue Constraints; derzeit prüft der Solver nur orientierte Quader.

Stufenweise Geometrieprüfung:
1. Bestehende Quader/Primitive, konservative Schranken und klare Kennzeichnung.
2. BVH/Breitphase für Meshes, robuste Nähe-/Schnittprüfung in der Feinphase.
3. Volumen-/Abstandsprüfung gegen geschlossene Körper; Randkontakt und Margin.
   Konkave Räume, Löcher und vollständig eingeschlossene Teile prüfen – reine
   Dreiecksüberschneidung reicht nicht für Innen/Außen-Containment.

Offene, selbstschneidende oder ungeeignete Netze nicht stillschweigend als gültigen
Solid verwenden. Referenzmodus oder explizit bestätigte konservative Näherung anbieten.
Eine äußere Bounding Box eines konkaven Bauraums ist keine sichere erlaubte Region.
Sichtbarkeit schaltet die Solverwirkung einer Region nicht aus.

## Katalog im Studio

Bauteilfamilien, konkrete Einträge, Sets, Anschlussprofile und Suchfreigaben trennen.
Bestehende Daten in einem Katalogpanel durchsuchen, kopieren, bearbeiten und versionieren.
Sets legen die bei einer Route verfügbaren Teile fest; Riemenlängen und Zahnzahlen sind
zunächst konkrete zulässige Werte. „Eigenes Teil erfinden“ bleibt eine spätere Suchoption.
Neue Datensätze für bekannte Familien validieren: Einheiten, Grenzen, Paarungsparameter,
Anschlüsse und Freigaben. Vorschau und Kompatibilitätsprüfung vor Veröffentlichung im Set.
Neue physikalische Familien/Regeln bleiben registrierter Anwendungscode; importierte
Katalogdateien enthalten kein eval, JavaScript oder ausführbare Suchregeln.
Verwendete Versionen im Projekt festhalten, Änderungen nicht rückwirkend übernehmen.

## Laufzeit und Speicherung

Persistente Three.js-Szene, keine komplette GLB-Neuerzeugung bei jeder Mausbewegung.
Leichte Hüll-/Katalogvorschau während des Ziehens; genaue CAD-Geometrie nach Bestätigung.
Separate Worker für Suche, Import und CAD; begrenzte Parallelität/Speicherbudgets.
Editieren während einer Suche möglich, aber Auftrag revisionsgebunden: betroffene Jobs
abbrechen oder Ergebnisse als veraltet ablegen. Fremde Teilgraphen nicht überschreiben.

Neues versioniertes Studio-Projektpaket mit Manifest und referenzierten Assets,
Catalog-Snapshots, IDs und Instanzdaten. Bestehendes JSON-Limit von 100 KB passt nicht
zu CAD-Assets. IndexedDB für lokale Entwürfe; expliziter vollständiger Projekt-Export.
Keine Renderobjekte/Worker/Blob-URLs serialisieren. Alte Projekte verlustarm als
Ein-Ketten-Studio-Projekt importieren; Rückexport nur bei unterstütztem Umfang.

## Umsetzung in prüfbaren Etappen

S1 – Studio-Grundlage und interaktive Ein-Ketten-Suche:
Neue Studio-Route, Dokument/Commands/Undo, 3D-Szene, Baum und Auswahl. Anschlüsse frei
setzen/verschieben/drehen; Quader als Räume; Verbindungsabsicht als gestrichelte Linie;
Kontextaktion startet bisherigen Solver, Live-Vorschau und Übernahme. Bestehende
Projekte migrieren, Paket speichern/laden. Noch keine behaupteten Mehrfachausgänge.
Abnahme: Zwei Anschlüsse und Sperrquader komplett in der Szene erstellen, Route finden,
Vorgabe ändern → Lösung veraltet, Undo und Speichern/Neuladen erhalten Identität.

S2 – Katalog und Referenzimporte:
Editierbare validierte Sets, STL/GLB-Import, Einheitenauswahl, Referenzpunkte und lokale
Anschlüsse. Große Assets auslagern. Klar getrennte Darstellung/Solverrolle.
Abnahme: Import transformieren, angehängten Anschluss verfolgen, Projekt auf anderem
Browserprofil wieder öffnen; ungültiger Katalogeintrag wird abgewiesen.

S3 – Mehrere Ketten gemeinsam routen:
Mehrere RouteIntents, globale Kollisionsprüfung, Alternativkombinationen und Neuplanung.
Abnahme: Vier unabhängige Antriebswege, einzeln lösbar aber gemeinsam kollidierend;
System findet eine alternative Kombination oder meldet ungelösten Gesamtkonflikt.

S4 – Topologischer CAD-Import und Freiformräume:
OCCT-Importprobe, STEP-Flächen/Kanten-Picking, verlässliche Referenzbindung,
Mesh-/Solid-Prüfbackend. Separate Meilensteine für Auswahl und Solverwirkung.
Abnahme: Anschluss auf geneigter Bohrungsachse; konkaver erlaubter Raum, Durchbruch,
Abstandsgrenze, offenes Netz und kaputte Referenz nach Reimport.

S5 – Verzweigte Antriebsnetze / mehrere gekoppelte Ausgänge:
Gemeinsame Wellen und Teile, globale Übersetzungs-/Phasenbedingungen und Optimierung.
Abnahme: Ein Eingang, vier unterschiedliche Ausgangsvorgaben; gemeinsame Teile korrekt
gezählt, unmögliche Kopplungen erklärt, alle Zweige räumlich gemeinsam geprüft.

S6 – Bewegte Roboterbaugruppen:
Gelenk-/Posenmodell, definierte Bewegungsbereiche und später Zyklen/Schleifen prüfen.
Nicht mit Montage oder generativem Gehäuse vermischen.

## Quellen für die technische Einordnung

- Three.js TransformControls: https://threejs.org/docs/pages/TransformControls
- Three.js STLLoader: https://threejs.org/docs/pages/STLLoader.html
- Onshape Mate Connectors: https://cad.onshape.com/help/Content/Assembly/assembly_mate_connector.htm
- OCCT STEP Translator: https://occt3d.com/dev/doc/overview/html/occt_user_guides__step.html

Bestandsprüfung: graph/contracts.ts hat genau input/output; graph/refine.ts setzt eine
gerichtete offene Kette voraus; model.ts (Project v6) erlaubt nur eine aktive
Baugruppen-Vorlage. Das Studio und globale Mehrfachsuche sind neue Arbeit, kein bloßes
Layout-Update der vorhandenen Formulare.
