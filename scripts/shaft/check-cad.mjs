// The shaft as solids: the brief's example (626 · LEGO z24 · 626) gives one closed shaft with the cross end and the
// collar, an adapter with the cross inside and Ø6 outside, STEP and STL files that open as such, and an assembly. The
// motor example has the D bore cut from its end. Volumes against hand counts; memory is freed after every build.
import assert from 'node:assert/strict';import fs from 'node:fs';
import opencascade from 'replicad-opencascadejs';
import {setOC,measureVolume} from 'replicad';
import {planShaft} from '../../src/shaft/plan.ts';
import {buildParts,meshParts,exportParts,profileDrawing} from '../../src/shaft/cad.ts';
import {shaftExamples} from '../../src/shaft/examples.ts';
const oc=await opencascade({print:()=>{},printErr:()=>{},wasmBinary:fs.readFileSync('node_modules/replicad-opencascadejs/dist/replicad_single.wasm')});setOC(oc);
const ex=k=>shaftExamples.find(x=>x.key===k).make(),near=(a,e,tol,what)=>assert.ok(Math.abs(a-e)<=tol,`${what}: ${a} statt ${e}`);
const area={rund:d=>Math.PI*d*d/4,kreuz:()=>{const r=2.4,b=1.8,h=Math.sqrt(r*r-(b/2)**2);/* two bars clipped by the circle, minus their overlap */const bar=2*(b/2*h+r*r*Math.asin(b/2/r));return 2*bar-b*b;}};
const expect=(doc,plan,s)=>{const g=doc.making==='druck'?doc.settings.play:0;return s.profile.kind==='rund'?area.rund(s.profile.d)*(s.x1-s.x0):s.profile.kind==='kreuz'?null:null;};
// 1. The example.
{const doc={...ex('lego-mitte'),settings:{...ex('lego-mitte').settings,chamfer:0}},plan=planShaft(doc),{parts,free}=buildParts(doc,plan);
 const shaft=parts.find(p=>p.kind==='welle'),adapter=parts.find(p=>p.kind==='adapter');assert.ok(shaft&&adapter,'Welle und Adapter');assert.equal(parts.filter(p=>p.kind==='kauf').length,3,'drei gekaufte Teile als Platzhalter');
 // Shaft volume: round pieces by π r² l, the cross pieces by the clipped cross shrunk by the play.
 const play=doc.settings.play,crossA=(()=>{const r=2.4-play,b=1.8-2*play,h=Math.sqrt(r*r-(b/2)**2),bar=2*(b/2*h+r*r*Math.asin(b/2/r));return 2*bar-b*b;})();
 const want=plan.sections.reduce((a,s)=>a+(s.profile.kind==='rund'?area.rund(s.profile.d):crossA)*(s.x1-s.x0),0);near(measureVolume(shaft.shape),want,want*.003,'Volumen der Welle');
 const box=shaft.shape.boundingBox.bounds;near(box[0][0],0,1e-6,'Welle beginnt bei 0');near(box[1][0],60,1e-6,'Welle endet bei 60');near(box[1][1]-box[0][1],Math.max(...plan.sections.map(s=>s.profile.kind==='rund'?s.profile.d:4.8)),1e-3,'größter Ø');
 const ad=plan.sleeves.find(s=>s.kind==='adapter'),adWant=ad.steps.reduce((a,st)=>a+area.rund(st.outer.d)*(st.x1-st.x0),0)-(()=>{const r=2.4+play,b=1.8+2*play,h=Math.sqrt(r*r-(b/2)**2),bar=2*(b/2*h+r*r*Math.asin(b/2/r));return 2*bar-b*b;})()*(ad.x1-ad.x0);
 near(measureVolume(adapter.shape),adWant,adWant*.005,'Volumen des Adapters');
 const files=await exportParts(parts);assert.deepEqual(files.map(f=>f.name).sort(),['adapter-1.step','adapter-1.stl','baugruppe.step','welle.step','welle.stl']);
 const step=new TextDecoder().decode(files.find(f=>f.name==='welle.step').data);assert.match(step,/^ISO-10303-21;/);assert.match(step,/MANIFOLD_SOLID_BREP|ADVANCED_BREP/);
 const stl=new DataView(files.find(f=>f.name==='welle.stl').data);assert.equal(stl.byteLength,84+50*stl.getUint32(80,true),'binäres STL');
 assert.match(new TextDecoder().decode(files.find(f=>f.name==='baugruppe.step').data),/Rillenkugellager 626/,'Baugruppe nennt die Teile');
 const meshes=meshParts(parts);assert.ok(meshes.every(m=>m.triangles.length>0&&m.vertices.length%3===0&&m.edges.length>0));
 free();}
// 2. Chamfers and the motor's D bore from the left end.
{const doc=ex('motor'),plan=planShaft(doc),{parts,free}=buildParts(doc,plan),shaft=parts[0].shape;
 const solid=plan.sections.reduce((a,s)=>a+area.rund(s.profile.d)*(s.x1-s.x0),0),dArea=(()=>{const r=2.5+doc.settings.play,h=r-(.5+doc.settings.play)*0-(.5-doc.settings.play)*1,a=Math.acos((2.5-.5+doc.settings.play)/r);return Math.PI*r*r-(r*r*a-(2.5-.5+doc.settings.play)*Math.sqrt(r*r-(2.5-.5+doc.settings.play)**2));})();
 const v=measureVolume(shaft);assert.ok(v<solid-dArea*15*.98&&v>solid-dArea*15-80,`D-Bohrung und Fasen abgezogen: ${v.toFixed(1)} (voll ${solid.toFixed(1)}, Bohrung ${(dArea*15).toFixed(1)})`);free();}
// Machining, each alone on a plain Ø10 shaft 40 long without chamfers: what it takes away against a hand count.
{const base={...shaftExamples[0].make(),length:40,items:[],inserts:[],works:[],collar:10,settings:{...shaftExamples[0].make().settings,chamfer:0}};
 const vol=works=>{const doc={...base,works},plan=planShaft(doc),b=buildParts(doc,plan),v=measureVolume(b.parts[0].shape);b.free();return {v,plan};};
 const full=vol([]).v;near(full,Math.PI*25*40,.5,'glatte Welle');
 const seg=(r,h)=>{const d=r-h,a=Math.acos(d/r);return r*r*a-d*Math.sqrt(r*r-d*d);};
 let k=vol([{id:'n',kind:'nut',x0:10,x1:30}]);const key=k.plan.machining[0].key;assert.deepEqual([key.b,key.t1],[3,1.8]);
 // A slot under a flat top would take (len−b)·b·t1 + π(b/2)²·t1; the round top leaves a sliver above the slot's floor.
 const slot=(20-3)*3*1.8+Math.PI*1.5**2*1.8;near(full-k.v,slot,slot*.12,'Passfedernut');
 k=vol([{id:'r',kind:'ring',x:20}]);near(full-k.v,Math.PI*(25-4.8**2)*1.1,.05,'Sicherungsring-Nut Ø9,6 × 1,1');
 k=vol([{id:'f',kind:'abflachung',x0:5,x1:15,depth:.5}]);near(full-k.v,seg(5,.5)*10,.05,'Abflachung');
 k=vol([{id:'g',kind:'gewinde',end:'rechts',m:4,depth:8}]);near(full-k.v,Math.PI*1.65**2*8,.05,'Kernloch M4 im Ende');
 k=vol([{id:'s',kind:'madenschraube',x:20,m:3}]);const hole=Math.PI*1.25**2*5;near(full-k.v,hole,hole*.06,'Kernloch M3 radial');
 k=vol([{id:'s',kind:'madenschraube',x:20,m:3,angle:90}]);near(full-k.v,hole,hole*.06,'gedreht');}
// A ring groove turned into the LEGO cross: over m the arms are cut down to the groove's Ø.
{const doc={...shaftExamples[0].make(),length:30,items:[],inserts:[],works:[],settings:{...shaftExamples[0].make().settings,chamfer:0,play:0},sections:[{x0:0,x1:30,profile:{kind:'kreuz'}}]};
 const cross=r=>{const b=1.8,h=Math.sqrt(r*r-(b/2)**2),bar=2*(b/2*h+r*r*Math.asin(b/2/r));return 2*bar-b*b;};
 const vol=works=>{const d={...doc,works},p=planShaft(d),b=buildParts(d,p),v=measureVolume(b.parts[0].shape);b.free();return v;};
 near(vol([])-vol([{id:'r',kind:'ring',x:15}]),(cross(2.4)-cross(1.9))*.5,.01,'Nut Ø3,8 × 0,5 im Kreuz');}
// 3. Profiles draw for every kind; memory stays flat over many builds.
for(const p of [{kind:'rund',d:5},{kind:'d',d:5,flat:.5},{kind:'kreuz'},{kind:'sechskant',sw:5}])assert.ok(profileDrawing(p).boundingBox.width>0,p.kind);
{const doc=ex('lego-mitte'),plan=planShaft(doc),heap=()=>oc.wasmMemory.buffer.byteLength;for(let i=0;i<3;i++){const b=buildParts(doc,plan);meshParts(b.parts);b.free();}const h0=heap();for(let i=0;i<40;i++){const b=buildParts(doc,plan);meshParts(b.parts);b.free();}assert.ok((heap()-h0)/40<2.5e6,`Speicher je Bau: ${((heap()-h0)/40/1e6).toFixed(2)} MB`);}
console.log('Wellen-CAD: Welle und Adapter als Volumen mit stimmenden Maßen, STEP, binäres STL und Baugruppe, D-Bohrung und Fasen, Passfedernut, Sicherungsring-Nut (auch im LEGO-Kreuz), Abflachung, Kernlöcher radial und im Ende, Speicher je Bau unter 2,5 MB (der Worker startet bei Bedarf neu).');
