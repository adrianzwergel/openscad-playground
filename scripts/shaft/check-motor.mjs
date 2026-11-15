// A motor in the shaft generator: the example "Auf den Motor gesteckt" has a NEMA 17 (shaft 20 mm) 15 mm deep in the left
// end; its flange lies at x = −5, its body from −45 to −5; it is in the parts list and stands as a bought part in the
// solids. From the right end the body lies beyond the shaft's length.
import assert from 'node:assert/strict';import fs from 'node:fs';
import opencascade from 'replicad-opencascadejs';
import {setOC,localGC} from 'replicad';
import {planShaft} from '../../src/shaft/plan.ts';
import {buildParts} from '../../src/shaft/cad.ts';
import {shaftExamples} from '../../src/shaft/examples.ts';
import {inParts,inGroups} from '../../src/shaft/catalog.ts';
const doc=shaftExamples.find(x=>x.key==='motor').make(),p=planShaft(doc),m=p.motors[0];
assert.equal(p.motors.length,1);assert.equal(m.face,-5);assert.equal(m.x0,-45);assert.equal(m.x1,-5);assert.equal(m.end,'links');assert.match(m.label,/NEMA 17/);
assert.ok(p.bom.some(b=>/NEMA 17/.test(b.what)),'in der Stückliste');assert.ok(inGroups.includes('Motoren')&&inParts.some(x=>x.group==='Motoren'));
{const q=planShaft({...doc,inserts:[{...doc.inserts[0],end:'rechts'}]}),r=q.motors[0];assert.equal(r.face,doc.length-15+20);assert.equal(r.x1,r.face+40);}
const oc=await opencascade({print:()=>{},printErr:()=>{},wasmBinary:fs.readFileSync('node_modules/replicad-opencascadejs/dist/replicad_single.wasm')});setOC(oc);
{const [keep,gc]=localGC(),parts=buildParts(doc,p,keep).parts,body=parts.find(x=>/NEMA 17/.test(x.name)&&x.kind==='kauf');assert.ok(body,'Motorkörper als Kaufteil');const b=body.shape.boundingBox.bounds;assert.equal(+b[0][0].toFixed(3),-45);assert.equal(+b[1][0].toFixed(3),-5);gc();}
console.log('Motor im Wellen-Generator: Flansch aus Steckungstiefe und Motorwellenlänge, Körper dahinter, Stückliste, Kaufteil im 3D-Modell.');
