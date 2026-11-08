// Gear trains built by hand: what meshes, the ratio, snapping, what is refused; the compiled mechanism turns at the
// ratio, closes, gets its bearings and its structures like the gearbox demos.
import assert from 'node:assert/strict';
import {newTrain,meshes,ratioOf,rates,trainIssues,snapWheel,compileTrain,trainMechanism,trainNotes,motion,shaftFrames,rackMeshes,rackBody,legoGears,parseTrain,gridPoints} from '../../src/mechanics/parts/train.ts';
import {solve} from '../../src/mechanics/kinematics/solver.ts';
import {heldTrains} from '../../src/mechanics/kinematics/drive.ts';
import {planBearings,applyBearings} from '../../src/mechanics/kinematics/bearings.ts';
import {linkStructures} from '../../src/mechanics/kinematics/link-structure.ts';
import {parseBuild} from '../../src/mechanics/parts/build.ts';
const lego=z=>{const p=legoGears.find(x=>x.teeth===z);assert.ok(p,`LEGO z${z}`);return p;};
const wheel=(id,shaft,z,at=0)=>({id,shaft,z:at,teeth:z,module:1,width:lego(z).size[2],part:lego(z).id});
// z16 → z40 at 28 mm: the hand gearbox.
const t=newTrain();t.shafts.push({id:'a',at:[0,0]},{id:'b',at:[28,0]});t.wheels.push(wheel('w1','a',16),wheel('w2','b',40));t.input='a';t.output='b';
assert.equal(meshes(t).length,1);assert.equal(ratioOf(t),-2.5);assert.deepEqual(trainIssues(t),[]);assert.equal(parseTrain(JSON.parse(JSON.stringify(t))).wheels.length,2);
// Off by a millimetre: no mesh, and they collide.
const off=structuredClone(t);off.shafts[1].at=[27,0];assert.equal(meshes(off).length,0);assert.ok(trainIssues(off).some(x=>/stößt/.test(x.message)));
// A third wheel between them turns the sense back: an idler changes nothing but the sign.
const idle=newTrain();idle.shafts.push({id:'a',at:[0,0]},{id:'m',at:[20,0]},{id:'b',at:[52,0]});idle.wheels.push(wheel('w1','a',16),wheel('w2','m',24),wheel('w3','b',40));idle.input='a';idle.output='b';assert.equal(ratioOf(idle),2.5);
// Compound: two stages over a shared shaft.
const two=newTrain();two.shafts.push({id:'a',at:[0,0]},{id:'m',at:[28,0]},{id:'b',at:[56,0]});two.wheels.push(wheel('w1','a',16),wheel('w2','m',40),wheel('w3','m',16,8.5),wheel('w4','b',40,8.5));two.input='a';two.output='b';assert.equal(ratioOf(two),6.25);assert.deepEqual(trainIssues(two),[]);
// A triangle of three external gears locks.
const tri=newTrain(),r=20;tri.shafts.push({id:'a',at:[0,0]},{id:'b',at:[2*r,0]},{id:'c',at:[r,r*Math.sqrt(3)]});tri.wheels.push(wheel('w1','a',20),wheel('w2','b',20),wheel('w3','c',20));tri.wheels.forEach(w=>{w.teeth=40;});tri.input='a';tri.output='b';assert.ok(rates(tri).locked);assert.ok(trainIssues(tri).some(x=>/sperren/.test(x.message)));
// Snapping: near a wheel to the mesh distance, on a shaft onto the shaft.
const w5=wheel('w5','neu',40),s=snapWheel(t,w5,[-6,28]);assert.ok(Math.abs(Math.hypot(...s.at)-28)<1e-9,'Kreis um z16');assert.equal(s.shaft,undefined);
const q=snapWheel(t,wheel('w6','neu',16),[28.5,.5]);assert.equal(q.shaft,'b');assert.ok(q.z>0);
assert.deepEqual(snapWheel(t,w5,[200.4,100.2]).at,[200,100]);
// In degree steps around the neighbour, the mesh distance exact; 90° lands exactly above it. The mm grid for a wheel
// alone; 0 means free.
const a15=snapWheel(t,w5,[-6,28],1,false,15);assert.equal(a15.angle,105);assert.equal(a15.partner,'w1');assert.ok(Math.abs(Math.hypot(...a15.at)-28)<1e-9);
assert.deepEqual(snapWheel(t,w5,[2,27.5],1,false,90).at,[0,28]);assert.equal(meshes({...t,shafts:[...t.shafts,{id:'neu',at:snapWheel(t,w5,[2,27.5],1,false,90).at}],wheels:[...t.wheels,{...w5,z:0}]}).length,2);
assert.deepEqual(snapWheel(t,w5,[201.4,98.2],5).at,[200,100]);assert.deepEqual(snapWheel(t,w5,[200.4,100.2],0).at,[200.4,100.2]);
assert.throws(()=>parseTrain({...t,angle:400}),/Raster/);
// Target grid: only grid points at exactly the mesh distance. 28 mm on 1 mm: the four on the axes; 20 mm: twelve.
assert.equal(gridPoints([0,0],28,1).length,4);assert.equal(gridPoints([0,0],20,1).length,12);assert.equal(gridPoints([0,0],28,8).length,0);
const tg=snapWheel(t,w5,[-3,27],1,false,15,true);assert.deepEqual(tg.at,[0,28]);assert.equal(tg.exact,4);assert.equal(tg.angle,90);
const none=snapWheel(t,w5,[-3,27],8,false,15,true);assert.equal(none.partner,'w1');assert.equal(none.exact,0);assert.equal(none.angle,90);
// Compiled: the two trains turn at their ratios, closed over the range, held by their rates.
for(const [name,x,ratio] of [['einstufig',t,2.5],['zweistufig',two,6.25],['Zwischenrad',idle,2.5]]){const d=compileTrain(x,name),m=d.mechanism,free=await solve({...structuredClone(m),range:{from:-180,to:180,samples:13}},{yield:false});
 assert.deepEqual(free.checks.filter(c=>c.state==='fail').map(c=>c.message),[],`${name} geht auf`);const sun=free.poses.map(p=>p.coordinates['H1/ground/s0'][0]),o=free.poses.map(p=>p.coordinates.Abtrieb[0]);assert.ok(Math.abs(Math.abs((sun.at(-1)-sun[0])/(o.at(-1)-o[0]))-ratio)<1e-6,`${name}: Übersetzung`);
 for(const v of [-90,60]){const h=await solve({...structuredClone(m),range:{from:v,to:v,samples:1}},{yield:false,fixed:heldTrains(d.drives,{Abtrieb:v})});assert.ok(h.checks.every(c=>c.state!=='fail'),`${name}: mit Raten bei ${v}°`);}
 const assets=id=>id===d.asset.id?d.asset:undefined,plan=planBearings(m,d.drives,assets,d.fabrication.bearings);assert.ok(plan.lines.every(l=>l.state==='pass'),plan.lines.map(l=>l.message).join(' | '));assert.ok(plan.seats.every(s=>s.kind!=='plain'||s.feature.d+s.feature.clearance===5));
 applyBearings(m,plan);const links=await linkStructures(m,d.drives,plan,assets,{});assert.ok(links.every(l=>l.skipped||l.result&&l.checks.every(c=>c.state!=='fail')),links.map(l=>`${l.link}: ${l.error??l.checks.filter(c=>c.state==='fail').map(c=>c.message).join(', ')}`).join(' | '));
 console.log(`${name}: 1 : ${ratio}, ${plan.seats.length} Sitze, ${links.filter(l=>l.result).map(l=>`${l.link} ${l.result.report.mass.toFixed(0)} g`).join(', ')}`);}
// A wheel no input reaches is no error: it stands still, and the note says so.
{const lonely=structuredClone(t);lonely.shafts.push({id:'z',at:[200,0]});lonely.wheels.push(wheel('w9','z',24));assert.deepEqual(trainIssues(lonely),[]);assert.match(trainNotes(lonely)[0],/z24 hängt an keinem Eingang und steht still/);}
// An idler on a fixed axle: z16 → z24 loose on its axle → z40. The axle stands, the idler turns, the ratio stays 2,5.
{const idl=structuredClone(idle);idl.shafts[1].fixed=true;idl.wheels[1].loose=true;assert.deepEqual(trainIssues(idl),[]);assert.equal(ratioOf(idl),2.5);const m=motion(idl,{a:100});assert.equal(m.angle.get('m'),undefined,'die Achse steht');assert.ok(Math.abs(m.angle.get('rad:w2')+100*16/24)<1e-9,'das Losrad dreht');
 const fr=shaftFrames(idl,{a:100});assert.ok(fr['rad:w2'],'Losrad ist ein Körper');const d=trainMechanism(idl,'Losrad',false,'test-los');assert.equal(d.mechanism.joints.length,3);
 const jam=structuredClone(idle);jam.shafts[1].fixed=true;assert.ok(trainIssues(jam).some(x=>/feststehende Achse hält/.test(x.message)),'fest auf feststehender Achse sperrt');}
// A rack under a z16 (pitch radius 8): 90° turn it 8·π/2 mm towards -x; a second pinion on the other side turns the other way.
{const r=newTrain();r.shafts.push({id:'a',at:[0,0]},{id:'b',at:[40,-16]});r.wheels.push(wheel('p1','a',16),wheel('p2','b',16));r.racks=[{id:'z',at:[0,-8],dir:'x',z:0,length:120,module:1,width:8,min:-50,max:50}];r.inputs=[{shaft:'a',drive:'lego-achse'}];r.outputs=['b'];
 assert.equal(rackMeshes(r).length,2);const m=motion(r,{a:90});assert.ok(Math.abs(m.angle.get(rackBody('z'))+4*Math.PI)<1e-9,'Zahnstange schiebt');assert.ok(Math.abs(m.angle.get('b')+90)<1e-9,'Ritzel gegenüber gegenläufig');
 assert.ok(Math.abs(shaftFrames(r,{a:90})[rackBody('z')].position[0]+4*Math.PI)<1e-9);assert.equal(shaftFrames(r,{a:3600})[rackBody('z')].position[0],-50,'am Anschlag');assert.equal(parseTrain(JSON.parse(JSON.stringify(r))).racks.length,1);}
// Derived live: two inputs, two chains, two drives; the shafts stay where the Studio shows them; it closes and is borne.
const dual=structuredClone(t);dual.shafts.push({id:'c',at:[0,80]},{id:'d',at:[28,80]});dual.wheels.push(wheel('w7','c',16),wheel('w8','d',40));dual.inputs=[{shaft:'a',drive:'lego-achse'},{shaft:'c',drive:'lego-achse'}];dual.outputs=['b','d'];delete dual.input;delete dual.output;
{const d=trainMechanism(dual,'Zwei',false,'test-zwei'),m=d.mechanism;assert.deepEqual(d.drives.map(x=>x.axis),['Abtrieb-1','Abtrieb-2']);assert.deepEqual(m.bodies.find(x=>x.id==='Abtrieb-2').frame.position,[28,0,80]);
 for(const [p,q] of [[30,-60],[-90,45]]){const h=await solve({...structuredClone(m),range:{from:p,to:p,samples:1}},{yield:false,fixed:heldTrains(d.drives,{'Abtrieb-1':p,'Abtrieb-2':q})});assert.deepEqual(h.checks.filter(c=>c.state==='fail').map(c=>c.message),[],`zwei Achsen bei ${p}/${q}`);}
 const plan=planBearings(m,d.drives,id=>id===d.asset.id?d.asset:undefined,d.fabrication.bearings);assert.ok(plan.lines.every(l=>l.state==='pass'),plan.lines.map(l=>l.message).join(' | '));console.log(`abgeleitet: 2 Eingänge, ${plan.seats.length} Sitze`);}
// A train with printed wheels on a motor.
const p=newTrain();p.drive='nema17';p.shafts.push({id:'a',at:[0,0]},{id:'b',at:[50,0]});p.wheels.push({id:'p1',shaft:'a',z:0,teeth:20,module:1.5,width:10},{id:'p2',shaft:'b',z:0,teeth:46.67,module:1.5,width:10});p.wheels[1].teeth=46;p.shafts[1].at=[49.5,0];p.input='a';p.output='b';assert.deepEqual(trainIssues(p),[]);assert.equal(compileTrain(p,'x').drives[0].spec,'nema17');
// Mixed is refused for now; a refused train does not compile.
const mixed=structuredClone(t);mixed.wheels[1]={...mixed.wheels[1],part:undefined};assert.ok(trainIssues(mixed).some(x=>/mischen/.test(x.message)));assert.throws(()=>compileTrain(mixed,'x'),/mischen/);
assert.equal(parseBuild({id:'g',label:'G',plates:[],items:[],parts:[],grid:1,train:t}).train.wheels.length,2);
console.log('Getriebe aus dem Store: Eingriffe, Übersetzung, Einrasten, Sperre, Mechanismus, Lager und Struktur geprüft.');
