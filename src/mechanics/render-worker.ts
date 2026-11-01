import OpenSCAD from '../wasm/openscad.js';
self.onmessage = async ({data}) => {
  try {
    const logs:string[] = [];
    const cad = await OpenSCAD({noInitialRun:true, print:(s:string)=>logs.push(s), printErr:(s:string)=>logs.push(s)});
    const r = await fetch('./mechanics-assets/bosl.json'); if (!r.ok) throw Error('BOSL2 konnte nicht geladen werden.');
    const sources = await r.json();
    cad.FS.mkdir('/BOSL2');
    for (const [path, text] of Object.entries(sources)) {
      const parts = path.split('/'); parts.pop();
      let dir = '/BOSL2';
      for(const part of parts) { dir += '/'+part; try {cad.FS.mkdir(dir);} catch {} }
      cad.FS.writeFile('/BOSL2/'+path,text);
    }
    cad.FS.writeFile('/pair.scad',data.source);
    const code = cad.callMain(['/pair.scad','--backend=manifold','-o','/pair.off','-o','/pair.stl']);
    if (code && code !== 0) throw Error(`OpenSCAD exit ${code}: ${logs.join('\n')}`);
    self.postMessage({off:new TextDecoder().decode(cad.FS.readFile('/pair.off')),stl:cad.FS.readFile('/pair.stl'),logs});
  } catch(e) { self.postMessage({error:String(e)}); }
};
