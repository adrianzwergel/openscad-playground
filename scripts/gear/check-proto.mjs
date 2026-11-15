// A prototype of a gearbox: plain holes in the plates where the bearings go (the shaft's Ø plus play), no pockets, no
// bearings in the 3D model; the plan and its parts list keep the bearings. The LEGO rocker-bogie as the example.
import assert from 'node:assert/strict';import fs from 'node:fs';
import opencascade from 'replicad-opencascadejs';
import {setOC,measureVolume,localGC,makeCylinder} from 'replicad';
import {gearExamples} from '../../src/gear/examples.ts';import {planGear} from '../../src/gear/plan.ts';import {parseGear} from '../../src/gear/model.ts';import {buildGearParts} from '../../src/gear/cad.ts';import {gearNotes} from '../../src/gear/notes.ts';
const oc=await opencascade({print:()=>{},printErr:()=>{},wasmBinary:fs.readFileSync('node_modules/replicad-opencascadejs/dist/replicad_single.wasm')});setOC(oc);
const ex=gearExamples.find(e=>e.key==='rocker-lego'),files=Object.fromEntries(ex.shafts.map(s=>[s.key,{name:s.name,doc:s.doc}])),ids=Object.fromEntries(ex.shafts.map(s=>[s.key,s.key]));
const doc=parseGear(ex.make(ids)),proto=parseGear({...doc,settings:{...doc.settings,proto:true}}),a=planGear(doc,files),b=planGear(proto,files);
assert.deepEqual(b.bom,a.bom,'Stückliste gleich');assert.deepEqual(b.bearings.map(x=>x.key),a.bearings.map(x=>x.key),'Plan gleich');
const [keep,gc]=localGC(),final=buildGearParts(doc,a,files,keep),pro=buildGearParts(proto,b,files,keep);
const bearings=x=>x.filter(p=>p.bearing).length;assert.ok(bearings(final)>10,'final mit Kugellagern');assert.equal(bearings(pro),0,'Prototyp ohne Kugellager');
// At the rocker's pivot in the frame's lower plate: the ring from 2,6 to 5 mm round the shaft is material in the
// prototype (a hole of 4,8 + 0,2 for the LEGO cross), empty in the final (the bearing's pocket), over the bearing's
// height; inside 2,4 mm both empty.
const plate=x=>x.find(p=>p.file==='schicht-1').shape,[px,py]=a.shafts.find(s=>s.id==='p').at,[l0,l1]=a.layers[0].band,seat=a.bearings.find(x=>x.on==='p'&&x.z0>=l0-1e-6&&x.z1<=l1+1e-6),[z0,z1]=[seat.z0,seat.z1];
const ring=(shape,r0,r1)=>{const c=keep(makeCylinder(r1,z1-z0,[px,py,z0],[0,0,1]).cut(makeCylinder(r0,z1-z0,[px,py,z0],[0,0,1])));return measureVolume(keep(shape.clone().intersect(c)));};
const core=(shape)=>measureVolume(keep(shape.clone().intersect(keep(makeCylinder(2.4,z1-z0,[px,py,z0],[0,0,1])))));
const ringPro=ring(plate(pro),2.6,5),ringFinal=ring(plate(final),2.6,5);
assert.ok(ringPro>.8*Math.PI*(25-2.6**2)*(z1-z0)*.7,`Prototyp: Material um die Welle (${ringPro.toFixed(0)} mm³)`);assert.ok(ringFinal<1,`final: Lagertasche (${ringFinal.toFixed(1)} mm³)`);
assert.ok(core(plate(pro))<.5&&core(plate(final))<.5,'Loch für die Welle');
assert.match(gearNotes('x',proto,b),/Prototyp: Die Platten haben Löcher statt Lagertaschen \(Wellen-Ø \+ 0,2 mm\)/);
const vf=measureVolume(plate(final)),vp=measureVolume(plate(pro));gc();
console.log(`Prototyp: Löcher statt Lagertaschen (Ø 5 für das LEGO-Kreuz), keine Kugellager im Modell (final ${bearings(final)}), Plan und Stückliste unverändert, Platte 1 ${vf.toFixed(0)} → ${vp.toFixed(0)} mm³.`);
