importScripts('./mechanics-assets/swipl/swipl-web.js');
self.onmessage = async ({data}) => {
  try {
    if (!Number.isFinite(data.target) || data.target <= 0 || data.target > 100) throw Error('Übersetzung muss zwischen 0 und 100 liegen.');
    const pl = await SWIPL({arguments:['-q'], locateFile:p=>`./mechanics-assets/swipl/${p}`});
    const r = await fetch('./catalog.pl'); if (!r.ok) throw Error('Katalog konnte nicht geladen werden.');
    pl.FS.writeFile('/catalog.pl', await r.text());
    pl.prolog.query("consult('/catalog.pl').").once();
    if(!Array.isArray(data.catalog)||data.catalog.length>100)throw Error('Ungültiger Katalog.');
    for(const g of data.catalog){
      if(![g.index,g.teeth,g.module,g.pressureAngle].every(Number.isFinite)||!Number.isInteger(g.index)||!Number.isInteger(g.teeth)||g.teeth<20||g.module<=0)throw Error('Ungültiger Katalogeintrag.');
      pl.prolog.query(`assertz(gear(${g.index},${g.teeth},${g.module},${g.pressureAngle})).`).once();
    }
    const version = pl.prolog.query('current_prolog_flag(version, Version).').once().Version;
    const solution = pl.prolog.query(`best_pair(${data.target}, IdA, IdB, A, B, Actual, Distance, Error).`).once();
    if (!solution) throw Error('Keine Lösung im Katalog.');
    self.postMessage({solution, version});
  } catch(e) { self.postMessage({error:String(e)}); }
};
