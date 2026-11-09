// The examples of the start page: each reads back from a file, has no errors in its check, gives a derived mechanism
// that closes, and gets seats from the bearing planner. The planet example turns its planets 1 + 16/24 per carrier turn.
import assert from 'node:assert/strict';
import {newBuild,parseBuild} from '../../src/mechanics/parts/build.ts';
import {buildExamples} from '../../src/mechanics/parts/examples.ts';
import {trainIssues,solveMotion} from '../../src/mechanics/parts/train.ts';
import {deriveMechanism} from '../../src/mechanics/parts/derive.ts';
import {solve} from '../../src/mechanics/kinematics/solver.ts';
import {heldTrains} from '../../src/mechanics/kinematics/drive.ts';
import {planBearings} from '../../src/mechanics/kinematics/bearings.ts';
import {linkageIssues,freedomOf} from '../../src/mechanics/parts/linkage.ts';
const lines=[];
for(const x of buildExamples){const b={...newBuild('teile','Teile'),plates:[]};x.make(b);const read=parseBuild(JSON.parse(JSON.stringify(b)));
 // A linkage alone: determined, nothing to derive.
 if(read.linkage&&!read.train){assert.deepEqual(linkageIssues(read.linkage),[],x.key);assert.equal(freedomOf(read.linkage),0);lines.push(x.key+' bestimmt');continue;}
 if(read.linkage)assert.deepEqual(linkageIssues(read.linkage,new Set(read.items.map(i=>'teil:'+i.id))),[],x.key+': Gestänge');
 if(read.train)assert.deepEqual(trainIssues(read.train).map(i=>i.message),[],x.key);
 const got=deriveMechanism(read,x.title,`test-${x.key}`,read.items.filter(i=>i.free?.joint?.kind==='mutter').map(i=>({id:i.id,shaft:i.free.body.slice(6),along:i.free.frame.position[1],lead:i.free.joint.lead,min:i.free.joint.min,max:i.free.joint.max})));assert.ok(got,x.key+': abgeleiteter Mechanismus');
 const m=got.demo.mechanism,held=Object.fromEntries(got.demo.drives.map(d=>[d.axis,0]));const h=await solve({...structuredClone(m),range:{from:0,to:0,samples:1}},{yield:false,fixed:heldTrains(got.demo.drives,held)});
 assert.deepEqual(h.checks.filter(c=>c.state==='fail'&&!/frei|Bewegung/.test(c.message)).map(c=>c.message),[],x.key+': geht auf');
 const assets=id=>got.assets.find(a=>a.id===id),plan=planBearings(m,got.demo.drives,assets,got.demo.fabrication?.bearings??{});assert.ok(plan.seats.length>0,x.key+': Sitze');lines.push(`${x.key} ${plan.seats.length}`);}
{const b={...newBuild('teile','Teile'),plates:[]};buildExamples.find(x=>x.key==='planet-steg').make(b);assert.ok(Math.abs(solveMotion(b.train,{steg:90}).angle.get('p1')-90*(1+16/24))<1e-9);}
console.log(`Beispiele: ${lines.join(' · ')} Sitze.`);
