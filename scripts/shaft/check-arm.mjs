// A printed arm on a shaft. Its bore follows what can be put together where it sits: between two parts with a bore of Ø8
// it is innermost on its side and becomes a D two mm larger (the bearing's seat goes through it, it is a shoulder for
// the bearing); at the shaft's end outside a bearing a D of the bearing's Ø; beyond a LEGO gear the cross; with a round
// bore of its own a set screw in the hub holds it. In the solids: as thick as set, as long as set in the direction of its
// angle, the bore cut out, the tap drill in the hub.
import assert from 'node:assert/strict';import fs from 'node:fs';
import opencascade from 'replicad-opencascadejs';
import {setOC,localGC,measureVolume} from 'replicad';
import {parseShaft,newShaft} from '../../src/shaft/model.ts';
import {planShaft,ARM_WALL} from '../../src/shaft/plan.ts';
import {buildParts} from '../../src/shaft/cad.ts';
import {shaftExamples} from '../../src/shaft/examples.ts';
import {onGroups,onParts} from '../../src/shaft/catalog.ts';
import {rund} from '../../src/shaft/profile.ts';
const near=(a,e,t,w)=>assert.ok(Math.abs(a-e)<=t,`${w}: ${a} statt ${e}`),errors=p=>p.issues.filter(i=>i.level==='fehler').map(i=>i.message);
assert.ok(onGroups.includes('Hebel')&&onParts.some(p=>p.arm));
const doc=parseShaft(shaftExamples.find(x=>x.key==='hebel').make()),p=planShaft(doc),h=p.placed.find(t=>t.id==='h');
assert.deepEqual(errors(p),[]);assert.ok(h.arm,'der Hebel ist geplant');assert.deepEqual(h.bore,{kind:'d',d:10,flat:1},'innen vor dem Lager Ø8: D10, das Ø8 durchlässt');
assert.equal(h.arm.hub,10+2*ARM_WALL);assert.equal(h.part.outer,h.arm.hub);assert.ok(p.bom.some(b=>/Hebel \(gedruckt\): D10/.test(b.what)));assert.ok(!h.arm.screw);
// The arm survives the file format.
assert.deepEqual(parseShaft(JSON.parse(JSON.stringify(doc))).items.find(i=>i.id==='h').arm,{length:35,width:10,angle:0,hole:4});
assert.throws(()=>parseShaft({...doc,items:[{id:'h',part:'hebel',x:3,arm:{length:-1,width:8,angle:0,hole:0}}]}));
// At the end, outside the bearing: a D of the bearing's Ø.
{const q=planShaft({...newShaft(),length:60,items:[{id:'a',part:'lager-608',x:10},{id:'b',part:'lager-608',x:40},{id:'h',part:'hebel',x:52}]}),t=q.placed.find(x=>x.id==='h');assert.deepEqual(errors(q),[]);assert.equal(t.bore.kind,'d');assert.equal(t.bore.d,8);}
// Beyond a LEGO gear: the cross.
{const q=planShaft({...newShaft(),length:60,items:[{id:'z',part:'lego-3648b',x:20},{id:'h',part:'hebel',x:40}]}),t=q.placed.find(x=>x.id==='h');assert.equal(t.bore.kind,'kreuz',JSON.stringify(q.placed.map(x=>[x.id,x.side,x.bore])));assert.deepEqual(errors(q),[]);}
// A round bore of its own: the set screw, and the hint.
{const q=planShaft({...doc,items:doc.items.map(i=>i.id==='h'?{...i,bore:rund(8)}:i)}),t=q.placed.find(x=>x.id==='h');assert.ok(t.arm.screw);assert.ok(q.issues.some(i=>/nur die Madenschraube M3 in seiner Nabe/.test(i.message)));assert.ok(q.bom.some(b=>/Madenschraube DIN 913 M3/.test(b.what)));
 const flat=planShaft({...doc,items:doc.items.map(i=>i.id==='h'?{...i,bore:rund(8)}:i),works:[{id:'f',kind:'abflachung',x0:34,x1:40,depth:.5}]});assert.ok(!flat.issues.some(i=>/nur die Madenschraube/.test(i.message)),'mit Abflachung kein Hinweis');}
// A hole that leaves no wall.
assert.ok(planShaft({...doc,items:doc.items.map(i=>i.id==='h'?{...i,arm:{...i.arm,hole:9.5}}:i)}).issues.some(i=>/lässt in .* Breite keine Wand/.test(i.message)));
// Solids.
const oc=await opencascade({print:()=>{},printErr:()=>{},wasmBinary:fs.readFileSync('node_modules/replicad-opencascadejs/dist/replicad_single.wasm')});setOC(oc);
const solid=d=>{const q=planShaft(d),[keep,gc]=localGC(),part=buildParts(d,q,keep).parts.find(x=>x.kind==='hebel');assert.ok(part&&part.made,'Hebel als gemachtes Teil');const b=part.shape.boundingBox.bounds,v=measureVolume(part.shape);gc();return {b,v,file:part.file};};
{const {b,v,file}=solid(doc);assert.equal(file,'hebel-h');near(b[0][0],34,1e-3,'ab x');near(b[1][0],40,1e-3,'bis x');near(b[1][2],35+5,1e-2,'bei 0° nach oben bis Länge + halbe Breite');near(b[0][2],-8,1e-2,'unten die Nabe');near(b[1][1],8,1e-2,'seitlich die Nabe');
 // Hub, end disc and the bar between minus the bore (D10 with play) and the hole.
 const r0=8,r1=5,L=35,f=Math.acos((r0-r1)/L),hull=(Math.PI-f)*r0*r0+f*r1*r1+L*Math.sin(f)*(r0+r1),bore=Math.PI*5.1**2-(5.1**2*Math.acos(4.1/5.1)-4.1*Math.sqrt(5.1**2-4.1**2));near(v,(hull-bore-Math.PI*2**2)*6,(hull*6)*.01,'Volumen');}
{const {b}=solid({...doc,items:doc.items.map(i=>i.id==='h'?{...i,arm:{...i.arm,angle:90}}:i)});near(b[0][1],-40,1e-2,'bei 90° zeigt er nach −y (wie der Winkel einer Madenschraube)');near(b[1][2],8,1e-2,'oben nur noch die Nabe');}
{const round=solid({...doc,items:doc.items.map(i=>i.id==='h'?{...i,bore:rund(8),arm:{...i.arm,hole:0}}:i)}),r0=7,r1=5,L=35,f=Math.acos((r0-r1)/L),hull=(Math.PI-f)*r0*r0+f*r1*r1+L*Math.sin(f)*(r0+r1);
 // The tap drill Ø2.5 through the hub's wall of 3 mm takes a little more.
 const plain=(hull-Math.PI*4.1**2)*6;assert.ok(round.v<plain-Math.PI*1.25**2*2.5&&round.v>plain-Math.PI*1.25**2*3.6,`Kernloch in der Nabe: ${round.v} gegen ${plain}`);}
console.log('Hebel: Bohrung folgt dem Sitz (D größer vor einem Lager, D am Ende, Kreuz am LEGO-Rad), runde Bohrung mit Madenschraube, Stückliste, Dateiformat; als Volumen mit Länge, Dicke, Winkel, Bohrung und Kernloch.');
