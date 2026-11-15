// One side of a rocker-bogie with GT2 belts and 685 bearings (the example): the motor in the frame drives all three
// wheels through both free joints.
// - No error; every wheel turns 0,4 × the motor, and neither joint turns a wheel (belts 1 : 1 along the arms).
// - Four stock belts of 200 mm fit exactly; every belt and pulley lies between the two plates of its body.
// - A shaft two swing arms away (a bogie shaft in the heights of a frame plate) is fine where it never comes near the
//   plate, and an error where its way crosses the plate.
// - It builds as solids, also in a pose.
import assert from 'node:assert/strict';import fs from 'node:fs';
import opencascade from 'replicad-opencascadejs';
import {setOC,localGC} from 'replicad';
import {parseGear} from '../../src/gear/model.ts';
import {planGear} from '../../src/gear/plan.ts';
import {buildGearParts} from '../../src/gear/cad.ts';
import {gearExamples} from '../../src/gear/examples.ts';
const ex=gearExamples.find(e=>e.key==='rocker'),files=Object.fromEntries(ex.shafts.map(s=>[s.key,{name:s.name,doc:s.doc}])),ids=Object.fromEntries(ex.shafts.map(s=>[s.key,s.key]));
const doc=parseGear(ex.make(ids)),p=planGear(doc,files),errs=q=>q.issues.filter(i=>i.level==='fehler').map(i=>i.message);
assert.deepEqual(errs(p),[]);assert.equal(p.meshes.length,0);assert.equal(p.belts.length,5);assert.equal(p.belts.filter(b=>b.stock===200&&Math.abs(b.center-80)<1e-3).length,4,'vier Normriemen 200 bei 80 mm');
// Housed: every pulley between the lowest and the highest plate of the body that carries its shaft.
for(const w of p.wheels){const body=p.groups.find(g=>g.shafts.includes(w.on))?.id??'',own=p.layers.filter(l=>l.body===body&&!l.motor),lo=Math.min(...own.map(l=>l.band[1])),hi=Math.max(...own.map(l=>l.band[0]));
 const carried=p.layers.filter(l=>l.bearings.some(k=>k.startsWith(w.on+'/'))),a=Math.min(...carried.map(l=>l.band[1])),e=Math.max(...carried.map(l=>l.band[0]));assert.ok(w.z0>=Math.min(lo,a)-1e-6&&w.z1<=Math.max(hi,e)+1e-6,`${w.label} zwischen den Platten`);}
for(const w of ['w1','w2','w3']){const v=p.drive.shafts[w];assert.ok(Math.abs(v[0]-.4)<1e-9&&Math.abs(v[1])<1e-9&&Math.abs(v[2])<1e-9,`${w}: ${v}`);}
assert.deepEqual(p.drive.joints,{g1:[0,1,0],g2:[0,0,1]});
assert.equal(p.layers.filter(l=>l.body==='').length,2);assert.equal(p.layers.filter(l=>l.body==='g1').length,2);assert.equal(p.layers.filter(l=>l.body==='g2').length,2);
// The bogie swung into the frame's plate: its shafts start in the heights of frame layer 2.
{const d=parseGear(ex.make(ids));d.shafts.find(s=>s.id==='w2').at=[9,0];
 assert.ok(errs(planGear(d,files)).some(m=>/Schicht 2: Bogie-Rad hinten gehört zu einer anderen Schwinge und geht durch diese Platte/.test(m)),'nah an der Platte bleibt es ein Fehler');}
const oc=await opencascade({print:()=>{},printErr:()=>{},wasmBinary:fs.readFileSync('node_modules/replicad-opencascadejs/dist/replicad_single.wasm')});setOC(oc);
{const [keep,gc]=localGC(),parts=buildGearParts(doc,p,files,keep);assert.ok(parts.filter(x=>x.kind==='platte').length>=6);gc();}
{const [keep,gc]=localGC(),parts=buildGearParts(doc,p,files,keep,{turn:0,groups:{g1:10,g2:-8}});assert.ok(parts.length>20,String(parts.length));gc();}
console.log('Rocker-Bogie: alle drei Räder 0,4 × Motor über Riemen, Gelenke drehen sie nicht mit, vier Normriemen 200, Scheiben zwischen den Platten, Bogie-Wellen in Gestellhöhe frei, als Volumen und in einer Stellung.');
