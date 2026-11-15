// The gearbox as solids: the example "Eine Stufe" gives two plate pairs, three columns and both shafts upright where
// they stand. A lower plate is its outline extruded minus the pocket for the lower half of each bearing; the plates sit
// in their bands; the columns fill the gap between the layers; a flipped shaft stands upside down; the files are one per
// plate, one per column gap, the shafts' parts by shaft name, and the assembly.
import assert from 'node:assert/strict';import fs from 'node:fs';
import opencascade from 'replicad-opencascadejs';
import {setOC,measureVolume,localGC} from 'replicad';
import {parseShaft} from '../../src/shaft/model.ts';
import {exportParts} from '../../src/shaft/cad.ts';
import {parseGear,newGear as newGearDoc} from '../../src/gear/model.ts';
import {planGear} from '../../src/gear/plan.ts';
import {buildGearParts,plateOutline} from '../../src/gear/cad.ts';
import {gearExamples} from '../../src/gear/examples.ts';
const oc=await opencascade({print:()=>{},printErr:()=>{},wasmBinary:fs.readFileSync('node_modules/replicad-opencascadejs/dist/replicad_single.wasm')});setOC(oc);
const near=(a,e,tol,what)=>assert.ok(Math.abs(a-e)<=tol,`${what}: ${a} statt ${e}`);
const ex=gearExamples.find(x=>x.key==='stufe'),files={},ids={};for(const s of ex.shafts){ids[s.key]=s.key;files[s.key]={name:s.name,doc:parseShaft(s.doc)};}
const build=doc=>{const plan=planGear(doc,files),[keep,gc]=localGC();return {plan,parts:buildGearParts(doc,plan,files,keep),gc,keep};};
// One plate per layer: the lowest with its stop below and each pocket open upwards, the highest the other way round.
{const doc=parseGear(ex.make(ids)),{plan,parts,gc,keep}=build(doc),kinds=k=>parts.filter(p=>p.kind===k);assert.equal(kinds('platte').length,2);
 const l=plan.layers[0],one=parts.find(p=>p.file==='schicht-1').shape,box=one.boundingBox.bounds;assert.deepEqual(l.lips,[true,false]);assert.deepEqual(plan.layers[1].lips,[false,true]);near(box[0][2],.5,1e-6,'unten ab');near(box[1][2],9,1e-6,'bis zum Lager oben');
 const flat=measureVolume(keep(plateOutline(doc,plan,l).sketchOnPlane('XY',0).extrude(8.5))),s=doc.settings,pocket=Math.PI*((11+s.fit)**2-(11-s.lipIn)**2)*7;near(measureVolume(one),flat-2*pocket,1,'Platte = Umriss minus Taschen von oben');
 assert.ok(plan.bom.some(b=>/Platte Schicht 1 \(gedruckt\)/.test(b.what)&&/Anschlag unten/.test(b.note)));gc();}
// Clamped: every layer a plate pair.
{const doc=parseGear({...ex.make(ids),settings:{...ex.make(ids).settings,clamp:true}}),{plan,parts,gc,keep}=build(doc);
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
// Webs past a wheel: straight the plates of layer 1 cut into the wheel on shaft D; round it or in the depth it
// does not (the wheel's stand-in and the plate share no volume).
{const {rund}=await import('../../src/shaft/profile.ts'),{newShaft}=await import('../../src/shaft/model.ts');
 const sh=(name,items,length=60)=>({name,doc:parseShaft({...newShaft(),length,items})}),bearing=(id,x)=>({id,part:'lager-608',x}),gear=(id,x,t)=>({id,part:`stirnrad-m1-z${t}`,x,bore:rund(8)});
 const F={A:sh('A',[bearing('l1',2),gear('g',20,20),bearing('l2',50)]),B:sh('B',[bearing('l1',2),gear('g',20,40),bearing('l2',50)]),C:sh('C',[bearing('l1',2),bearing('l2',50)]),D:sh('D',[gear('g',2,30)],20),E:sh('E',[gear('g',14,30)],30)};
 const shared=(d,route)=>{const doc=parseGear({...newGearDoc(),shafts:[{id:'a',shaft:'A',at:[0,0],z:0},{id:'b',shaft:'B',at:[30,0],z:0},{id:'c',shaft:'C',at:[0,-40],z:0},{id:'d',shaft:d,at:[-25,-20],z:d==='E'?-8:0}],bolts:[[45,-20]],...(route?{webs:{add:[],remove:[],route}}:{})}),plan=planGear(doc,F),[keep,gc]=localGC(),parts=buildGearParts(doc,plan,F,keep);
  const wheel=parts.find(p=>p.kind==='kauf'&&/auf D|auf E|· D|· E/.test(p.name)&&/z30/.test(p.name)).shape,v=parts.filter(p=>/^schicht-1(-|$)/.test(p.file)).reduce((t,p)=>t+measureVolume(keep(p.shape.intersect(wheel))),0);gc();return v;};
 assert.ok(shared('D')>10,'gerade: Platte im Rad');near(shared('D',{'a/l1|c/l1':'aussen'}),0,1e-3,'außen herum: frei');near(shared('E',{'a/l1|c/l1':'tiefe'}),0,1e-3,'in der Tiefe: frei');assert.ok(shared('E')>1,'ohne Tiefe: Platte im Rad');}
console.log('Getriebe-CAD: Stege außen herum und in der Tiefe frei vom Rad, Plattenpaare aus Umriss minus Taschen in ihren Bändern, Säulen im Spalt, Wellen aufrecht an ihrem Platz und umgedreht, Dateien je Platte, Spalt und Welle.');
