# Lokaler Start – Etappe G

Node.js >=22, npm und Git. Keine native OpenSCAD-/Prolog-Installation erforderlich.

```sh
npm ci
npm run prepare:mechanics
npm run dev:mechanics
```

Öffnen: http://localhost:4000/mechanics.html

`npm run build:mechanics` erzeugt `dist/`. Statisch per HTTP ausliefern, nicht per file:// öffnen.
Der ursprüngliche Playground und seine Build-Konfiguration bleiben erhalten. Die schlanke
Etappe-A-Vorbereitung lädt nur OpenSCAD und BOSL2; für den Original-Playground sind dessen
zusätzliche Bibliotheksarchive nötig. Unter Windows umgeht der neue Setup-Pfad die Unix-
Werkzeuge und Symlinks des ursprünglichen Library-Builds.

## Abhängigkeiten
- Playground-Basis: siehe PLAN.md.
- OpenSCAD-Binary: feste URL in libs-config.json (2025.03.25).
- BOSL2: 9eb555a08f38cabb8a6c9761d18ec7517c36321c.
- swipl-wasm npm-Paket: 8.2.5; Paketversion ist nicht die SWI-Prolog-Laufzeitversion.
  Die tatsächliche Laufzeitversion zeigt die Oberfläche nach einer Suche.
- npm-Abhängigkeiten: package-lock.json.

Vorbereitung braucht Netzwerk; danach werden die Laufzeiten und BOSL2 vom lokalen Server geladen.
BOSL2-Lizenz ist im erzeugten Asset enthalten, SWI-Lizenzen in dessen kopierter Distribution.
Siehe zusätzlich LICENSE.md im Repository.

## Verifikation
`npx tsc --noEmit` prüft TypeScript. Für den Browser-Smoke-Test:
`npm run build:mechanics`, in einem zweiten Terminal `npx serve dist -l 4001`,
dann `node scripts/check-browser.mjs`.
Der Test verwendet Chrome unter dem Windows-Standardpfad; alternativ `CHROME_PATH` setzen.
Der Test prüft die Etappe-C-Suche und ein gerendertes Doppelzahnradgetriebe, feste Achsen,
GLB/STL, Vergleich, unmögliche Vorgaben sowie Abbruch und Neustart. WASM-Größenwarnungen
beim Build sind erwartbar. Keine mechanische Fertigungsfreigabe durch diesen Test.

Zusätzlich `node scripts/check-model.mjs`, `node scripts/check-search.mjs` und
`node scripts/check-project-browser.mjs` (Browser mit statischem Server auf Port 4001).
Die Modelltests verwenden Node Type Stripping; getestet mit Node 24.19.
Projektformat und Speicherverhalten: [COMPONENT-MODEL.md](COMPONENT-MODEL.md).

Etappe D: `node scripts/check-housing.mjs` und `node scripts/check-housing-browser.mjs`.
Letzterer prüft die tatsächlichen Einzelteil-STLs aus dem ZIP einschließlich geschlossener
Netze, Zusammenhang und Drucklage. Details: [HOUSING.md](HOUSING.md).

Etappe E: `node scripts/check-motion.mjs` und `node scripts/check-motion-browser.mjs`.
Browserprüfung einschließlich aller drei Vorlagen, Zahneingriffs-Schnittprüfung,
Einzelteilnetze und durchgängiger Hub-/Sperrraumprüfung. Siehe [MOTION.md](MOTION.md).

Etappe F: `node scripts/check-spatial.mjs`, `node scripts/check-spatial-contact.mjs`
und `node scripts/check-spatial-browser.mjs`. Die beiden Browsertests benötigen den
Produktionsbuild auf Port 4001 und Chrome. Sie prüfen echte WASM-Schnittmengen,
32 unterschiedliche Einzelteil-STLs, Vorschauen, Speicherung und Abbruch/Wiederanlauf.
Katalog, Lagerung und Grenzen: [SPATIAL-PAIRS.md](SPATIAL-PAIRS.md).

Etappe G: `node scripts/check-workbench.mjs` und `node scripts/check-workbench-browser.mjs`.
Der Browsertest benötigt ebenfalls den Build auf Port 4001. Details: [WORKBENCH.md](WORKBENCH.md).

Gemischte Suche: `node scripts/check-mixed.mjs`, `node scripts/check-mixed-contact.mjs`
und `node scripts/check-mixed-browser.mjs`. Browserprüfungen verwenden denselben Server
und echte Prolog-/OpenSCAD-WASM-Laufzeiten. Siehe [MIXED-SEARCH.md](MIXED-SEARCH.md).

Elementgraph: `node scripts/check-element-graph.mjs`,
`node scripts/check-element-graph-contact.mjs` und
`node scripts/check-element-graph-browser.mjs`. Browser weiterhin auf Port 4001.
Registry-Vertrag und aktueller Umfang: [ELEMENT-GRAPH.md](ELEMENT-GRAPH.md).
