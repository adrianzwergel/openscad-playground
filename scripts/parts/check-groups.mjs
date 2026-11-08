// Groups of a build: a shaft goes as one piece, groups nest, the outermost Körper or Träger is what moves. Wheels on one
// shaft with a part make a Körper: the part hangs on the shaft and turns with the input; wheels on several shafts make a
// Träger. Moving and turning keeps every distance and mesh; a part on a plate of the group rides along. Several inputs
// drive their own chains, two on one chain lock. A group goes into the library as a block standing on the floor and
// comes out again with new names; the file keeps the groups, old fest/frei files read as kinds, broken ones are refused.
import assert from 'node:assert/strict';
import {partById} from '../../src/mechanics/parts/catalog.ts';
import {newItem,newBuild,newPlateNode,parseBuild,worldOf} from '../../src/mechanics/parts/build.ts';
import {newTrain,meshes,legoGears,ratioOf,motion,shaftFrames,inputsOf,outputsOf,trainIssues} from '../../src/mechanics/parts/train.ts';
import {makeGroup,dissolve,setKind,unitOf,contents,childrenOf,moveGroup,centreOf,turnAxis,blockOf,insertBlock} from '../../src/mechanics/parts/groups.ts';
const lego=z=>legoGears.find(x=>x.teeth===z);
const wheel=(id,shaft,z,at=0)=>({id,shaft,z:at,teeth:z,module:1,width:lego(z).size[2],part:lego(z).id});
const make=()=>{const b={...newBuild('g','Gruppen'),plates:[{...newPlateNode('p1'),free:{frame:{position:[200,0,3],rotation:[0,0,0,1]}}}]};
 b.items.push({...newItem('a',partById('rpi4'),[0,0]),plate:'p1'},{...newItem('f',partById('d1-mini'),[0,0]),free:{frame:{position:[260,40,0],rotation:[0,0,0,1]}}});
 b.train={...newTrain(),shafts:[{id:'s1',at:[0,0]},{id:'s2',at:[28,0]},{id:'s3',at:[56,0]}],wheels:[wheel('w1','s1',16),wheel('w2','s2',40),wheel('w3','s2',16,9),wheel('w4','s3',40,9)],input:'s1',output:'s3'};return b;};
const ratio=b=>ratioOf(b.train);
// A shaft is one piece: grouping z40 brings the z16 on its shaft.
let b=make();const g1=makeGroup(b,[{kind:'wheel',id:'w2'}],'g1','Stufe');assert.equal(g1.along,1);assert.equal(g1.kind,'koerper','eine Welle: ein Körper');assert.deepEqual(contents(b,'g1').wheels.map(w=>w.id).sort(),['w2','w3']);
// Nested: the stage and the input wheel in a bigger, free group; the inner rigid one is what a member drags.
makeGroup(b,[{kind:'group',id:'g1'},{kind:'wheel',id:'w1'}],'g2','Getriebe','ordnung');assert.equal(b.groups.find(g=>g.id==='g1').parent,'g2');
assert.equal(unitOf(b,{kind:'wheel',id:'w3'}),'g1');assert.equal(unitOf(b,{kind:'wheel',id:'w1'}),undefined);
setKind(b,'g2','traeger');assert.equal(unitOf(b,{kind:'wheel',id:'w3'}),'g2','die äußere feste Gruppe zieht');
assert.deepEqual(childrenOf(b,'g2').map(m=>m.kind+':'+m.id),['group:g1','wheel:w1']);
{const c=structuredClone(b);makeGroup(c,[{kind:'wheel',id:'w1'},{kind:'item',id:'f'}],'x','Geber');assert.equal(c.groups.find(g=>g.id==='x').parent,'g2','aus verschiedenen Gruppen: dorthin, wo das Rad ist');assert.equal(c.items.find(i=>i.id==='f').group,'x');}
// Moved and turned about the shafts: still the same meshes and ratio; w4 outside no longer meshes, the shafts moved.
const before=meshes(b.train).length;assert.equal(before,2);assert.equal(turnAxis(b,'g2'),'y');
moveGroup(b,'g2',{delta:[10,5,-3],angle:90,axis:'y'},{});assert.equal(meshes(b.train).length,1,'w3→w4 außen ist getrennt');
const s=id=>b.train.shafts.find(x=>x.id===id).at;assert.ok(Math.abs(Math.hypot(s('s2')[0]-s('s1')[0],s('s2')[1]-s('s1')[1])-28)<1e-9);assert.equal(b.train.wheels.find(w=>w.id==='w1').z,5);
// The same move back by hand: everything meshes again.
const c=centreOf(b,'g2',{});moveGroup(b,'g2',{delta:[0,0,0],angle:-90,axis:'y',centre:c},{});moveGroup(b,'g2',{delta:[-10,-5,3]},{});assert.equal(meshes(b.train).length,2);assert.equal(ratio(b),6.25);
// A mixed group: the plate with its board and the free part; turned about z the board rides on the plate.
b=make();makeGroup(b,[{kind:'plate',id:'p1'},{kind:'item',id:'f'}],'m','Elektronik');assert.equal(contents(b,'m').items.length,2);assert.equal(turnAxis(b,'m'),'z');
const gap=()=>{const p=worldOf(b.plates[0].free,{}).position,f=b.items[1].free.frame.position;return Math.hypot(p[0]-f[0],p[1]-f[1],p[2]-f[2]);},g0=gap();
moveGroup(b,'m',{delta:[0,100,0],angle:90,axis:'z'},{});assert.ok(Math.abs(gap()-g0)<1e-9,'Abstand bleibt');assert.deepEqual(b.items[0].at,[0,0],'auf der Platte bleibt es liegen');
// A part of the group on a plate outside it slides on that plate.
b=make();makeGroup(b,[{kind:'item',id:'a'}],'k','Pi');moveGroup(b,'k',{delta:[5,-4,0]},{});assert.deepEqual(b.items[0].at.map(v=>Math.round(v*1e9)/1e9),[5,-4]);
// Into the library and out again: on the floor over the origin; a second copy has its own names and the same ratio.
b=make();assert.equal(makeGroup(b,[{kind:'wheel',id:'w1'},{kind:'wheel',id:'w2'},{kind:'wheel',id:'w4'}],'t','Zweistufig').kind,'traeger','mehrere Wellen: ein Träger');
const block=blockOf(b,'t',{});const low=Math.min(...block.wheels.map(w=>block.shafts.find(x=>x.id===w.shaft).at[1]-(lego(w.teeth).radius)));assert.ok(Math.abs(low)<1e-9,`steht auf dem Boden (${low})`);assert.equal(block.wheels.length,4);assert.deepEqual(block.inputs.map(i=>i.shaft),['s1']);assert.deepEqual(block.outputs,['s3']);
const into={...newBuild('h','Neu'),plates:[]},top=insertBlock(into,block,[0,0,0]);assert.equal(into.train.wheels.length,4);assert.equal(ratio(into),6.25);
const again=insertBlock(into,block,[0,0,120]);assert.notEqual(top,again);assert.equal(into.train.wheels.length,8);assert.equal(new Set(into.train.wheels.map(w=>w.id)).size,8);assert.equal(meshes(into.train).length,4);
// The file: groups kept, a member of a group that is gone stands alone, loops refused.
const parsed=parseBuild(JSON.parse(JSON.stringify(into)));assert.equal(parsed.groups.length,2);assert.ok(parsed.train.wheels.every(w=>w.group));
const lost=JSON.parse(JSON.stringify(into));lost.groups=lost.groups.slice(1);assert.equal(parseBuild(lost).train.wheels.filter(w=>w.group).length,4);
const loop=JSON.parse(JSON.stringify(into));loop.groups[0].parent=loop.groups[1].id;loop.groups[1].parent=loop.groups[0].id;assert.throws(()=>parseBuild(loop),/Kreis/);
// Dissolved: the members go one level up.
b=make();makeGroup(b,[{kind:'wheel',id:'w2'}],'g1','a');makeGroup(b,[{kind:'group',id:'g1'}],'g2','b');dissolve(b,'g1');assert.equal(b.train.wheels.find(w=>w.id==='w2').group,'g2');dissolve(b,'g2');assert.equal(b.groups,undefined);assert.ok(b.train.wheels.every(w=>!w.group));
// A sensor on the input shaft: grouped with the z16 it becomes one Körper, hangs on the shaft and turns with it.
b=make();const sensor=b.items.find(i=>i.id==='f'),seen=[...sensor.free.frame.position];const k=makeGroup(b,[{kind:'wheel',id:'w1'},{kind:'item',id:'f'}],'k1','Geber');assert.equal(k.kind,'koerper');assert.equal(sensor.free.body,'welle:s1');
const near=(a,e)=>assert.ok(Math.hypot(...a.map((v,i)=>v-e[i]))<1e-6,`${a} statt ${e}`);near(worldOf(sensor.free,shaftFrames(b.train)).position,seen);
near(worldOf(sensor.free,shaftFrames(b.train,{s1:90})).position,[0,40,-260]);
// Moving the Körper moves the shaft, the sensor rides on it; let go, it stays where it stands.
moveGroup(b,'k1',{delta:[10,0,0]},{});near(worldOf(sensor.free,shaftFrames(b.train)).position,[270,40,0]);dissolve(b,'k1');assert.equal(sensor.free.body,undefined);near(sensor.free.frame.position,[270,40,0]);
// A Körper on two shafts is refused.
b=make();assert.throws(()=>makeGroup(b,[{kind:'wheel',id:'w1'},{kind:'wheel',id:'w2'}],'x','x','koerper'),/eine Welle/);
// Several inputs and outputs: each input its chain; turned together; two inputs on one chain lock.
b=make();b.train.shafts.push({id:'s4',at:[0,100]},{id:'s5',at:[28,100]});b.train.wheels.push(wheel('w5','s4',16),wheel('w6','s5',40));b.train.inputs=[{shaft:'s1',drive:'lego-achse'},{shaft:'s4',drive:'lego-achse'}];b.train.outputs=['s3','s5'];delete b.train.input;delete b.train.output;
const m=motion(b.train,{s1:100,s4:-50});assert.equal(m.angle.get('s3'),16);assert.equal(m.angle.get('s5'),20);assert.deepEqual(m.clash,[]);assert.equal(ratioOf(b.train,'s4','s5'),-2.5);assert.deepEqual(trainIssues(b.train),[]);
b.train.inputs.push({shaft:'s3',drive:'lego-achse'});assert.ok(trainIssues(b.train).some(x=>/sperren sich/.test(x.message)),'zwei Eingänge auf einer Kette');
// Old files: one input and output become lists; fest groups with wheels on several shafts read as Träger, frei as Ordnung.
const old=JSON.parse(JSON.stringify(make()));old.train.wheels.forEach(w=>{w.group='alt';});old.groups=[{id:'alt',label:'Alt',rigid:true}];const read=parseBuild(old);assert.equal(read.groups[0].kind,'traeger');assert.deepEqual(inputsOf(read.train).map(i=>i.shaft),['s1']);assert.deepEqual(outputsOf(read.train),['s3']);assert.equal(read.train.input,undefined);
old.groups[0].rigid=false;assert.equal(parseBuild(old).groups[0].kind,'ordnung');
console.log('Gruppen: Welle als Stück, verschachtelt, äußere feste Gruppe zieht, Verschieben und Drehen halten Eingriffe, Baustein auf dem Boden, zweimal eingesetzt, Datei geprüft; Sensor dreht als Körper mit der Welle, zwei Eingänge, alte Dateien als Arten gelesen.');
