// The gearbox as solids: the example "Eine Stufe" gives two plate pairs, three columns and both shafts upright where
// they stand. A lower plate is its outline extruded minus the pocket for the lower half of each bearing; the plates sit
// in their bands; the columns fill the gap between the layers; a flipped shaft stands upside down; the files are one per
// plate, one per column gap, the shafts' parts by shaft name, and the assembly.
import assert from 'node:assert/strict';import fs from 'node:fs';
import opencascade from 'replicad-opencascadejs';
import {setOC,measureVolume,localGC} from 'replicad';
import {parseShaft} from '../../src/shaft/model.ts';
import {exportParts} from '../../src/shaft/cad.ts';
import {parseGear} from '../../src/gear/model.ts';
import {planGear} from '../../src/gear/plan.ts';
import {buildGearParts,plateOutline} from '../../src/gear/cad.ts';
import {gearExamples} from '../../src/gear/examples.ts';
const oc=await opencascade({print:()=>{},printErr:()=>{},wasmBinary:fs.readFileSync('node_modules/replicad-opencascadejs/dist/replicad_single.wasm')});setOC(oc);
const near=(a,e,tol,what)=>assert.ok(Math.abs(a-e)<=tol,`${what}: ${a} statt ${e}`);
const ex=gearExamples.find(x=>x.key==='stufe'),files={},ids={};for(const s of ex.shafts){ids[s.key]=s.key;files[s.key]={name:s.name,doc:parseShaft(s.doc)};}
const build=doc=>{const plan=planGear(doc,files),[keep,gc]=localGC();return {plan,parts:buildGearParts(doc,plan,files,keep),gc,keep};};
{const doc=parseGear(ex.make(ids)),{plan,parts,gc,keep}=build(doc);
 const kinds=k=>parts.filter(p=>p.kind===k);assert.equal(kinds('platte').length,4);assert.equal(kinds('saeule').length,3);assert.ok(parts.some(p=>p.kind==='welle'&&/Antrieb z20/.test(p.name)));
 const l=plan.layers[0],low=parts.find(p=>p.file==='schicht-1-unten').shape,box=low.boundingBox.bounds;near(box[0][2],l.band[0],1e-6,'unten ab');near(box[1][2],l.split,1e-6,'bis Trennfuge');
 const flat=measureVolume(keep(plateOutline(doc,plan,l).sketchOnPlane('XY',0).extrude(l.split-l.band[0]))),s=doc.settings,pocket=Math.PI*((11+s.fit)**2-(11-s.lipIn)**2)*(l.split-2);
 near(measureVolume(low),flat-2*pocket,1,'Platte = Umriss minus zwei halbe Taschen');
 const col=kinds('saeule')[0].shape.boundingBox.bounds;near(col[0][2],plan.layers[0].band[1],1e-6,'Säule ab Schicht 1');near(col[1][2],plan.layers[1].band[0],1e-6,'bis Schicht 2');
 const shaft=parts.find(p=>p.kind==='welle'&&/Abtrieb/.test(p.name)).shape.boundingBox.bounds;near(shaft[0][2],0,.01,'Welle steht auf z 0');near(shaft[1][2],60,.01,'bis 60');near((shaft[0][0]+shaft[1][0])/2,30,.01,'bei x 30');
 const out=await exportParts(parts);const names=out.map(f=>f.name);for(const n of ['schicht-1-unten.step','schicht-2-oben.stl','saeule-1.step','antrieb-z20-welle.step','abtrieb-z40-welle.stl','baugruppe.step'])assert.ok(names.includes(n),`${n} fehlt: ${names}`);
 assert.equal(names.filter(n=>/^saeule-1\./.test(n)).length,2,'eine Säule je Spalt');assert.equal(new Set(names).size,names.length,'keine doppelten Dateien');gc();}
// Flipped: its gear moves from 20..30 to 30..40, its left end on top.
{const doc=parseGear({...ex.make(ids),shafts:[{id:'a',shaft:'an',at:[0,0],z:0,flip:true}]}),{parts,gc}=build(doc);const g=parts.find(p=>p.kind==='kauf'&&/z20/.test(p.name)).shape.boundingBox.bounds;near(g[0][2],30,.01,'umgedreht: Rad ab 30');near(g[1][2],40,.01,'bis 40');gc();}
console.log('Getriebe-CAD: Plattenpaare aus Umriss minus Taschen in ihren Bändern, Säulen im Spalt, Wellen aufrecht an ihrem Platz und umgedreht, Dateien je Platte, Spalt und Welle.');
