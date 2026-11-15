// The gearbox plan from linked shafts: two shafts with a z20 and a z40 (module 1) 30 mm apart mesh, the second turns
// at −½; two layers come from the bearings' heights, each joined by a web between the meshing shafts; a third shaft is
// joined by the shortest web; a wheel on a fourth shaft in the web's way is reported; wheels that touch without
// meshing, almost meshing, a locked triangle, belts with their length and the next stock length, shafts without
// bearings, a wheel too close to its own bearing, layers set by hand, webs removed and added, the file refuses nonsense.
import assert from 'node:assert/strict';
import {parseShaft,newShaft} from '../../src/shaft/model.ts';
import {rund} from '../../src/shaft/profile.ts';
import {parseGear,newGear} from '../../src/gear/model.ts';
import {planGear,hullDistance} from '../../src/gear/plan.ts';
const shaft=(name,items,length=60)=>({name,doc:parseShaft({...newShaft(),length,items})});
const bearing=(id,x)=>({id,part:'lager-608',x});
const gear=(id,x,teeth,extra={})=>({id,part:`stirnrad-m1-z${teeth}`,x,bore:rund(8),...extra});
const files={
 A:shaft('A',[bearing('l1',2),gear('g',20,20),bearing('l2',50)]),
 B:shaft('B',[bearing('l1',2),gear('g',20,40),bearing('l2',50)]),
 C:shaft('C',[bearing('l1',2),bearing('l2',50)]),
 D:shaft('D',[gear('g',2,40)],20),
};
const gearbox=o=>parseGear({...newGear(),...o});
const errors=p=>p.issues.filter(i=>i.level==='fehler').map(i=>i.message);
// Hull distance: a point beside two equal discs.
assert.ok(Math.abs(hullDistance([5,10],[0,0],3,[10,0],3)-7)<1e-9);assert.ok(hullDistance([5,0],[0,0],3,[10,0],3)<0);
// 1. Two shafts meshing.
{const p=planGear(gearbox({shafts:[{id:'a',shaft:'A',at:[0,0],z:0},{id:'b',shaft:'B',at:[30,0],z:0}]}),files);
 assert.deepEqual(errors(p),[]);assert.equal(p.meshes.length,1);assert.equal(p.rates.b,-.5,'z20 → z40');
 assert.equal(p.layers.length,2,'zwei Schichten aus den Lagerhöhen');assert.deepEqual(p.layers.map(l=>l.band),[[.5,9],[50,58.5]],'Anschlag nur außen');assert.deepEqual(p.layers.map(l=>[l.pair,...l.lips]),[[false,true,false],[false,false,true]]);assert.deepEqual(p.layers.map(l=>[l.z0,l.z1]),[[2,9],[50,57]]);
 for(const l of p.layers){assert.equal(l.bearings.length,2);assert.equal(l.webs.length,1);assert.ok(l.webs[0].forced,'Steg zwischen kämmenden Wellen');assert.equal(l.parts,1);void 0;}
 // Flipped, the same shaft stands upside down: its bearings stay at the same heights here, the gear moves to 30..40.
 const q=planGear(gearbox({shafts:[{id:'a',shaft:'A',at:[0,0],z:0,flip:true},{id:'b',shaft:'B',at:[30,0],z:0}]}),files);assert.equal(q.meshes.length,0,'umgedreht kämmt es nicht mehr');assert.deepEqual(q.wheels.find(w=>w.on==='a').z0,30);}
// 2. A third shaft joins by the shortest web; a wheel on a fourth shaft in the web's way.
{const doc=gearbox({shafts:[{id:'a',shaft:'A',at:[0,0],z:0},{id:'b',shaft:'B',at:[30,0],z:0},{id:'c',shaft:'C',at:[0,-40],z:0},{id:'d',shaft:'D',at:[25,-20],z:0}]}),p=planGear(doc,files);
 const l=p.layers[0];assert.deepEqual(l.webs.map(w=>[w.a,w.b]),[['a/l1','b/l1'],['a/l1','c/l1']]);
 assert.ok(errors(p).some(e=>/Schicht 1: der Steg 608 auf A – 608 auf C geht durch z40 m1 auf D/.test(e)),errors(p).join(' | '));assert.ok(!errors(p).some(e=>/Schicht 2/.test(e)),'oben ist das Rad nicht');
 assert.ok(p.issues.some(i=>/D: kein Lager/.test(i.message)));
 // Removed, the layer falls apart; another web added instead.
 let q=planGear({...doc,webs:{add:[],remove:[['a/l1','c/l1']]}},files);assert.ok(q.issues.some(i=>/Schicht 1 zerfällt in 2 Teile/.test(i.message)));
 q=planGear({...doc,webs:{add:[['b/l1','c/l1']],remove:[['a/l1','c/l1']]}},files);assert.deepEqual(q.layers[0].webs.map(w=>[w.a,w.b,w.auto]),[['a/l1','b/l1',true],['b/l1','c/l1',false]]);assert.equal(q.layers[0].parts,1);
 // Shaft D passes through layer 1 without a bearing: a hole.
 assert.ok(l.holes.some(h=>h.on==='d'));}
// 3. Touching without meshing, almost meshing, a locked triangle.
{let p=planGear(gearbox({shafts:[{id:'a',shaft:'A',at:[0,0],z:0},{id:'b',shaft:'B',at:[28,0],z:0}]}),files);assert.ok(errors(p).some(e=>/berühren sich, ohne zu kämmen/.test(e)));
 p=planGear(gearbox({shafts:[{id:'a',shaft:'A',at:[0,0],z:0},{id:'b',shaft:'B',at:[30.5,0],z:0}]}),files);assert.ok(p.issues.some(i=>/kämmen fast/.test(i.message)));
 const t=shaft('T',[bearing('l1',2),gear('g',20,20),bearing('l2',50)]),h=Math.sqrt(400-100);
 p=planGear(gearbox({shafts:[{id:'a',shaft:'T',at:[0,0],z:0},{id:'b',shaft:'T',at:[20,0],z:0},{id:'c',shaft:'T',at:[10,h],z:0}]}),{T:t});assert.equal(p.meshes.length,3);assert.ok(errors(p).some(e=>/klemmt/.test(e)));}
// 4. A belt: GT2 z20 and z20 60 mm apart, 160 mm long, stock 200.
{const P=shaft('P',[bearing('l1',2),{id:'r',part:'gt2-z20',x:20},bearing('l2',50)]),p=planGear(gearbox({shafts:[{id:'a',shaft:'P',at:[0,0],z:0},{id:'b',shaft:'P',at:[60,0],z:0}],belts:[{id:'r1',a:{on:'a',item:'r'},b:{on:'b',item:'r'}}]}),{P});
 assert.ok(Math.abs(p.belts[0].length-(120+2*Math.PI*20/Math.PI))<1e-9);assert.equal(p.belts[0].stock,200);assert.equal(p.rates.b,1);assert.ok(p.issues.some(i=>/Normriemen 200 mm und nichts zum Spannen: Achsabstand auf 80 mm stellen/.test(i.message)));assert.ok(Math.abs(p.belts[0].fit.center-80)<1e-9);
 const bad=planGear(gearbox({shafts:[{id:'a',shaft:'P',at:[0,0],z:0},{id:'b',shaft:'P',at:[60,0],z:20}],belts:[{id:'r1',a:{on:'a',item:'r'},b:{on:'b',item:'r'}}]}),{P});assert.ok(errors(bad).some(e=>/nicht auf gleicher Höhe/.test(e)));}
// 5. A wheel right against its own bearing: without a stop on the inside it is fine; clamped, the plate's rim reaches
// over the bearing and rubs it.
{const N=shaft('N',[bearing('l1',2),gear('g',9,40),bearing('l2',50)]),p=planGear(gearbox({shafts:[{id:'a',shaft:'N',at:[0,0],z:0}]}),{N});assert.ok(!errors(p).some(e=>/zu nah am Lager/.test(e)),'ohne Bord innen stört es nicht');const q=planGear(gearbox({shafts:[{id:'a',shaft:'N',at:[0,0],z:0}],settings:{...newGear().settings,clamp:true}}),{N});assert.ok(errors(q).some(e=>/z40 m1 auf N sitzt zu nah am Lager/.test(e)),'eingeklemmt reicht der Bord übers Lager');}
// A single layer clamps its bearings as a plate pair: nothing else holds the shafts the other way.
{const p=planGear(gearbox({shafts:[{id:'a',shaft:'A',at:[0,0],z:0},{id:'b',shaft:'B',at:[30,0],z:0}],layers:[{id:'nur',z0:0,z1:12}]}),files);assert.ok(p.layers[0].pair);assert.deepEqual(p.layers[0].lips,[true,true]);assert.deepEqual(p.layers[0].band,[-1.5,13.5],'Bord auf beiden Seiten der Schicht');}
// 6. Layers set by hand; bearings outside them are reported.
{const p=planGear(gearbox({shafts:[{id:'a',shaft:'A',at:[0,0],z:0},{id:'b',shaft:'B',at:[30,0],z:0}],layers:[{id:'unten',z0:0,z1:12,rim:5}]}),files);assert.equal(p.layers.length,1);assert.equal(p.layers[0].rim,5);assert.ok(p.issues.some(i=>/608 auf A liegt in keiner Schicht/.test(i.message)));}
// 7. A missing shaft file; the file refuses nonsense.
{const p=planGear(gearbox({shafts:[{id:'x',shaft:'fehlt',at:[0,0],z:0}]}),files);assert.ok(errors(p).some(e=>/Datei im Wellen-Generator fehlt/.test(e)));}
assert.throws(()=>parseGear({...newGear(),shafts:[{id:'a',shaft:'A',at:[0],z:0}]}),/Welle ungültig/);assert.throws(()=>parseGear({...newGear(),input:'x'}),/Eingang/);
console.log('Getriebe-Plan: Eingriff und Drehzahl, Schichten aus Lagerhöhen, Stege (kämmend, kürzeste, entfernt, hinzugefügt), Rad im Weg, Freiloch, Berühren, fast kämmen, Klemmen, Riemen mit Normlänge, Rad am eigenen Lager, Schichten von Hand.');
