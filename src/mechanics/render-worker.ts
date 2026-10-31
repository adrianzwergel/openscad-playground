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
    // Only bundled, explicitly referenced LEGO assets are loaded into the CAD filesystem.
    const legoFiles=[...new Set([...String(data.source).matchAll(/import\("\/lego\/([a-z0-9]+)\.stl"\)/g)].map(m=>m[1]))];
    if(legoFiles.length){cad.FS.mkdir('/lego');for(const id of legoFiles){const asset=await fetch('./mechanics-assets/ldraw/meshes/'+id+'.stl');if(!asset.ok)throw Error('LEGO-Geometrie fehlt: '+id);cad.FS.writeFile('/lego/'+id+'.stl',new Uint8Array(await asset.arrayBuffer()));}}
    cad.FS.writeFile('/pair.scad',data.source);
    const code = cad.callMain(['/pair.scad','--backend=manifold','-o','/pair.off','-o','/pair.stl']);
    if (logs.some(s=>/^ERROR:/.test(s))) throw Error('OpenSCAD konnte nicht alle Geometrien verarbeiten: '+logs.filter(s=>/ERROR:|NotManifold/.test(s)).join('\n'));
    if (code && code !== 0) throw Error(`OpenSCAD exit ${code}: ${logs.join('\n')}`);
    self.postMessage({off:new TextDecoder().decode(cad.FS.readFile('/pair.off')),stl:cad.FS.readFile('/pair.stl'),logs});
  } catch(e) { self.postMessage({error:String(e)}); }
};
