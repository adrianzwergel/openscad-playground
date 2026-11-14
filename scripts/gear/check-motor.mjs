// Motors and belt tension. The example "Motor mit Riemen": a NEMA 17 whose D shaft carries the z16 shaft; its flange
// lies on the underside of layer 1 and becomes a node of that plate, its slots point along the belt; the stock belt
// 200 mm lies within the slots' range. Raised 2 mm the flange lies on no plate and the plan says by how much to move it.
// Further away the stock belt no longer fits the slots: the plan says which centre distance it needs; set there it fits.
// In the solids: the slots take more out of the plate than round holes would, and the motor's body hangs below.
import assert from 'node:assert/strict';import fs from 'node:fs';
import opencascade from 'replicad-opencascadejs';
import {setOC,measureVolume,localGC} from 'replicad';
import {parseShaft} from '../../src/shaft/model.ts';
import {parseGear} from '../../src/gear/model.ts';
import {planGear,centerFor} from '../../src/gear/plan.ts';
import {buildGearParts} from '../../src/gear/cad.ts';
import {gearExamples} from '../../src/gear/examples.ts';
const ex=gearExamples.find(x=>x.key==='riemen'),files={},ids={};for(const s of ex.shafts){ids[s.key]=s.key;files[s.key]={name:s.name,doc:parseShaft(s.doc)};}
const doc=o=>parseGear({...ex.make(ids),...o}),near=(a,e,t,w)=>assert.ok(Math.abs(a-e)<=t,`${w}: ${a} statt ${e}`);
const base=ex.make(ids);
{const p=planGear(doc({}),files),m=p.motors[0];assert.equal(p.motors.length,1);near(m.face,.5,1e-9,'Flansch');assert.ok(m.down);assert.equal(m.layer,'s1');assert.deepEqual(m.slot,[1,0]);assert.equal(m.travel,6);
 assert.ok(p.layers[0].bearings.includes('motor:a'),'Motor ist Knoten der Platte');assert.equal(p.layers[0].webs.length,1);
 const b=p.belts[0];assert.equal(b.stock,200);assert.ok(b.tension.range[0]<200&&b.tension.range[1]>200);assert.ok(p.issues.some(i=>/Normriemen 200 mm passt, gespannt über die Langlöcher/.test(i.message)));
 assert.ok(!p.issues.some(i=>/Motorwelle z16: kein Lager/.test(i.message)),'der Motor hält seine Welle');assert.ok(p.bom.some(x=>/NEMA 17/.test(x.what)));
 {const r1=16/Math.PI,r2=40/Math.PI,c=centerFor(200,r1,r2);near(2*c+Math.PI*(r1+r2)+(r1-r2)**2/c,200,1e-9,'Achsabstand für 200 mm');}}
// Raised by 2: no plate; the offset puts it back.
{const shafts=base.shafts.map(s=>s.id==='a'?{...s,z:7.5}:s),p=planGear(doc({shafts}),files),m=p.motors[0];assert.equal(m.layer,undefined);near(m.offset,-2,1e-9,'Versatz');assert.ok(p.issues.some(i=>/2 mm tiefer setzt ihn an die Unterseite von Schicht 1/.test(i.message)));
 const back=planGear(doc({shafts:shafts.map(s=>s.id==='a'?{...s,z:s.z+m.offset}:s)}),files);assert.equal(back.motors[0].layer,'s1');}
// Too far for the slots: the stock 280 belt needs another distance; set there it fits.
{let shafts=base.shafts.map(s=>s.id==='b'?{...s,at:[85,0]}:s),p=planGear(doc({shafts}),files);const b=p.belts[0];assert.equal(b.stock,280);assert.ok(p.issues.some(i=>/Normriemen 280 mm braucht .* die Langlöcher reichen von 82 mm bis 88 mm/.test(i.message)),p.issues.map(i=>i.message).join(' | '));
 shafts=shafts.map(s=>s.id==='b'?{...s,at:[b.fit.center,0]}:s);p=planGear(doc({shafts}),files);assert.ok(p.issues.some(i=>/Normriemen 280 mm passt/.test(i.message)));}
// Solids: slots against round holes; the body below the flange.
{const oc=await opencascade({print:()=>{},printErr:()=>{},wasmBinary:fs.readFileSync('node_modules/replicad-opencascadejs/dist/replicad_single.wasm')});setOC(oc);
 const lower=settings=>{const d=doc({settings:{...base.settings,...settings}}),p=planGear(d,files),[keep,gc]=localGC(),parts=buildGearParts(d,p,files,keep),v=measureVolume(parts.find(x=>x.file==='schicht-1-unten').shape),body=parts.find(x=>/NEMA 17/.test(x.name)).shape.boundingBox.bounds;gc();return {v,body};};
 const round=lower({slot:0}),slotted=lower({slot:6});const t=5,area=2*(11+.5)*6+4*2*1.7*6;near(round.v-slotted.v,area*t,area*t*.03,'Langlöcher nehmen mehr weg');
 near(slotted.body[1][2],.5,1e-6,'Motor bis zum Flansch');near(slotted.body[0][2],.5-40,1e-6,'Körper darunter');}
console.log('Motor und Riemen: Flansch an der Schicht als Knoten der Platte, Langlöcher in Riemenrichtung, Normriemen im Spannweg, Versatz an die Platte, Achsabstand für den Normriemen, Langlöcher im Volumen, Motorkörper unter dem Flansch.');
