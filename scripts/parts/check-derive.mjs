// The derived mechanism of a build without gears: an arm turning about Z with a motor, a sledge sliding along X, a part
// on the arm. They become bodies on revolute and prismatic joints; it solves, and the bearing planner gives the arm its
// bearings (a hub on its motor) and the sledge its linear guide.
import assert from 'node:assert/strict';
import {partById} from '../../src/mechanics/parts/catalog.ts';
import {newItem,newBuild} from '../../src/mechanics/parts/build.ts';
import {deriveMechanism} from '../../src/mechanics/parts/derive.ts';
import {solve} from '../../src/mechanics/kinematics/solver.ts';
import {planBearings} from '../../src/mechanics/kinematics/bearings.ts';
const b={...newBuild('d','Abgeleitet'),plates:[]};
b.items.push({...newItem('arm',partById('rpi4'),[0,0]),free:{frame:{position:[0,0,40],rotation:[0,0,0,1]},joint:{kind:'drehen',axis:'z',at:[-40,0,40],min:-90,max:90,input:{drive:'nema17'}}}},
 {...newItem('geber',partById('d1-mini'),[0,0]),free:{frame:{position:[30,0,10],rotation:[0,0,0,1]},body:'teil:arm'}},
 {...newItem('schlitten',partById('l298n'),[0,0]),free:{frame:{position:[0,120,20],rotation:[0,0,0,1]},joint:{kind:'schieben',axis:'x',min:0,max:120}}});
const got=deriveMechanism(b,'Test','test-abgeleitet');assert.ok(got,'es bewegt sich etwas');const m=got.demo.mechanism;
assert.deepEqual(m.joints.map(j=>j.joint.kind).sort(),['prismatic','revolute']);assert.equal(got.demo.drives.length,1,'der Arm hat seinen Motor');assert.equal(got.assets.length,1);
const assets=id=>got.assets.find(a=>a.id===id);
const h=await solve({...structuredClone(m),range:{from:0,to:0,samples:1}},{yield:false});assert.ok(!h.checks.some(c=>c.state==='fail'&&!/frei|Bewegung/.test(c.message)),h.checks.map(c=>c.message).join(' | '));
const plan=planBearings(m,got.demo.drives,assets,{});const kinds=plan.seats.map(s=>`${s.line}:${s.kind}`);
assert.ok(plan.seats.some(s=>s.line==='Teil-1'&&['bearing','plain','hub'].includes(s.kind)),'Arm gelagert: '+kinds.join(', '));assert.ok(plan.seats.some(s=>s.kind==='flange'),'Motorflansch für den Arm');assert.ok(plan.seats.some(s=>s.line.startsWith('Teil-2')&&s.kind==='linear'),'Schlitten geführt: '+kinds.join(', '));
console.log(`Abgeleitet ohne Zahnräder: Arm dreht (Motor), Schlitten schiebt; ${plan.seats.length} Sitze: ${[...new Set(plan.seats.map(s=>s.kind))].join(', ')}.`);
