// Acceptance A (solve only): solutions of the old search translate into the
// new model, close without residual and keep their ratio.
import assert from 'node:assert/strict';
import {robustRoute} from '../../src/mechanics/graph/robust-search.ts';
import {demoMechanism,transformMechanism,resolveMechanism} from '../../src/mechanics/graph/model.ts';
import {identity,axisAngle} from '../../src/mechanics/graph/frames.ts';
import {fixture as mixedFixture} from '../mixed-space-fixture.mjs';
import {fromGraph} from '../../src/mechanics/kinematics/adapter.ts';
import {solve} from '../../src/mechanics/kinematics/solver.ts';

const close=(a,b,tol,what)=>assert.ok(Math.abs(a-b)<=tol,`${what}: ${a} vs ${b}`);
async function accept(old,label){
 const expected=resolveMechanism(old);assert.ok(expected.valid,label+': old solution valid');
 const m=fromGraph(old,{range:{from:0,to:90,samples:4}}),s=await solve(m,{yield:false});
 const closure=s.checks.find(c=>c.id==='closure');assert.equal(closure.state,'pass',`${label}: ${closure.message}`);
 assert.equal(s.checks.find(c=>c.id==='mobility').state,'pass',`${label}: ${s.mobility.message}`);
 // The old value is the reduction ratio ω_in/ω_out; the transfer constant is ω_out/ω_in.
 close(1/Math.abs(s.transfer.constant),Math.abs(expected.value),1e-9,label+' ratio');
 const first=s.transfer.samples[0];for(const p of s.transfer.samples)close(p.output-first.output,s.transfer.constant*p.input,1e-5,label+' rolling at '+p.input);
 return s;
}
// Demo mechanism: spur + bevel.
await accept(demoMechanism(),'demo');
// Mixed fixture: spur, belt, worm, bevel.
await accept(mixedFixture(4),'mixed');
// Search results on the free-3 benchmark case in a rotated world.
{const world={position:[17,-23,9],rotation:axisAngle([1,2,3],37)},g=demoMechanism();g.output.target={...identity(),position:[102.4264068712,102.4264068712,60]};
 const r=await robustRoute(transformMechanism(g,world),{target:8,tolerance:0,minStages:3,maxStages:3,budget:20000,beam:120});assert.ok(r.solutions.length>=3,'search found solutions');
 for(const [i,sol] of r.solutions.slice(0,4).entries())await accept(sol,'free-3 #'+i);}
// LEGO: bevel 90° and worm.
{const g=demoMechanism();g.output.target={position:[70,45,55],rotation:axisAngle([1,0,0],90)};
 const r=await robustRoute(g,{target:5,tolerance:0,minStages:2,maxStages:3,budget:20000,beam:120,rules:['lego-spur','lego-bevel-90']});assert.ok(r.solutions.length>=1,'lego search found solutions');
 await accept(r.solutions[0],'lego-bevel');
 const w=await robustRoute(g,{target:24,tolerance:30,minStages:1,maxStages:2,budget:20000,beam:120,rules:['lego-worm','lego-spur']});if(w.solutions.length)await accept(w.solutions[0],'lego-worm');else console.log('(no lego-worm solution within budget; skipped)');}
// Linear outputs: spindle/nut closes a loop through a screw joint, a rack rolls as a follower; travel per input turn matches.
{const {linearExample}=await import('../../src/mechanics/graph/examples.ts');
 for(const kind of ['belt-screw','spur-rack','worm-belt-screw']){const old=linearExample(kind),expected=resolveMechanism(old);assert.ok(expected.valid,kind+' old valid');
  const m=fromGraph(old,{range:{from:0,to:360,samples:5}}),s=await solve(m,{yield:false});
  assert.equal(s.checks.find(c=>c.id==='closure').state,'pass',`${kind}: ${s.checks.find(c=>c.id==='closure').message}`);
  assert.equal(s.checks.find(c=>c.id==='mobility').state,'pass',`${kind}: ${s.mobility.message}`);
  const p=s.transfer.samples,perTurn=(p.at(-1).output-p[0].output)/(p.at(-1).input-p[0].input)*360;
  close(Math.abs(perTurn),Math.abs(expected.value),1e-4*Math.abs(expected.value),kind+' mm per turn');
  for(let i=1;i<p.length;i++)close((p[i].output-p[0].output)/(p[i].input-p[0].input)*360,perTurn,1e-4*Math.abs(perTurn),kind+' linear travel');}}
console.log('Kinematics adapter (linear): belt-screw, spur-rack and worm-belt-screw keep their travel per turn.');
console.log('Kinematics adapter: demo, mixed fixture, free-3 search results and LEGO pairings close in the new core with the old ratios.');
