// One side of a rocker-bogie from LEGO z16/z40 and 685 bearings (the example): the motor in the frame drives all three
// wheels through both free joints.
// - No error; every wheel turns −0,4 × the motor, and neither joint turns a wheel (odd idlers between the z40).
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
assert.deepEqual(errs(p),[]);assert.equal(p.meshes.length,13);
for(const w of ['w1','w2','w3']){const v=p.drive.shafts[w];assert.ok(Math.abs(v[0]+.4)<1e-9&&Math.abs(v[1])<1e-9&&Math.abs(v[2])<1e-9,`${w}: ${v}`);}
assert.deepEqual(p.drive.joints,{g1:[0,1,0],g2:[0,0,1]});
assert.equal(p.layers.filter(l=>l.body==='').length,2);assert.equal(p.layers.filter(l=>l.body==='g1').length,2);assert.equal(p.layers.filter(l=>l.body==='g2').length,2);
// The bogie swung into the frame's plate: its shafts start in the heights of frame layer 2.
{const d=parseGear(ex.make(ids));d.shafts.find(s=>s.id==='j2').at=[9,0];
 assert.ok(errs(planGear(d,files)).some(m=>/Schicht 2: Bogie-Zwischenrad z16 gehört zu einer anderen Schwinge und geht durch diese Platte/.test(m)),'nah an der Platte bleibt es ein Fehler');}
const oc=await opencascade({print:()=>{},printErr:()=>{},wasmBinary:fs.readFileSync('node_modules/replicad-opencascadejs/dist/replicad_single.wasm')});setOC(oc);
{const [keep,gc]=localGC(),parts=buildGearParts(doc,p,files,keep);assert.ok(parts.filter(x=>x.kind==='platte').length>=6);gc();}
{const [keep,gc]=localGC(),parts=buildGearParts(doc,p,files,keep,{turn:0,groups:{g1:10,g2:-8}});assert.ok(parts.length>20);gc();}
console.log('Rocker-Bogie: alle drei Räder −0,4 × Motor, Gelenke drehen sie nicht mit, Bogie-Wellen in Gestellhöhen frei, als Volumen und in einer Stellung.');
