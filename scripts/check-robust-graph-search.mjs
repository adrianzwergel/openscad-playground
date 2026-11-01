import assert from 'node:assert/strict';
import {robustRoute} from '../src/mechanics/graph/robust-search.ts';
import {refineGraph,reflow} from '../src/mechanics/graph/refine.ts';
import {assessConstruction} from '../src/mechanics/graph/construction.ts';
import {demoMechanism,transformMechanism,resolveMechanism} from '../src/mechanics/graph/model.ts';
import {identity,axisAngle} from '../src/mechanics/graph/frames.ts';
const options={target:3,tolerance:0,minStages:2,maxStages:4,budget:100000,beam:120};
// Cold starts: input contains a different two-stage mechanism, not the answer.
for(const n of [3,4]){
 let g=demoMechanism();
 g.output.target={...identity(),position:n===3?[102.4264068712,102.4264068712,60]:[60,144.8528137424,90]};
 g=transformMechanism(g,{position:[17,-23,9],rotation:axisAngle([1,2,3],37)});
 const before=JSON.stringify(g),result=await robustRoute(g,{...options,target:2**n,minStages:n,maxStages:n});
 assert.ok(result.solutions.length,`${n} stages: ${JSON.stringify(result.rejections)}`);
 for(const s of result.solutions){
  assert.equal(s.relations.length,n);assert.equal(s.bodies.length,n+1);
  const k=resolveMechanism(s);assert.ok(k.valid);assert.ok(Math.abs(k.ratio-2**n)<1e-8);
  assert.deepEqual(s.input.target,g.input.target);assert.deepEqual(s.output.target,g.output.target);
  assert.ok(assessConstruction(s,1,false).valid);
 }
 assert.equal(JSON.stringify(g),before);
 console.log(`${n} stages cold: ${result.solutions.length} solutions, ${result.attempts} starts`);
}
// Mixed three/four stages: perturb both continuous angles and axial positions.
for(const n of [3,4]){
 let g=demoMechanism(73),body=g.output.body;
 for(let i=2;i<n;i++){
  const next=`extra${i}`;
  g.bodies.push({id:next,kind:'shaft',frame:identity(),shaft:{diameter:5,start:-40,end:100}});
  g.elements.push(...[[`from${i}`,body,20,50],[`to${i}`,next,40,0]].map(([id,body,teeth,z])=>({id,body,family:'spur',pose:{...identity(),position:[0,0,z]},phase:0,params:{teeth,module:2,width:10,bore:5.1}})));
  g.relations.push({id:`pair${i}`,rule:'external-spur',elements:[`from${i}`,`to${i}`],params:{azimuth:60}});body=next;
 }
 g.output.body=body;g.output.local=identity();g=reflow(g);g.output.target=structuredClone(g.bodies.find(b=>b.id===body).frame);
 const cold=demoMechanism(73);cold.output.target=structuredClone(g.output.target);
 const routed=await robustRoute(cold,{...options,target:3*2**(n-2),minStages:n,maxStages:n});
 assert.ok(routed.solutions.length,`Cold mixed ${n} stages`);
 for(const candidate of routed.solutions){assert.ok(resolveMechanism(candidate).valid);assert.ok(assessConstruction(candidate,1,false).valid);assert.deepEqual(candidate.output.target,cold.output.target);assert.equal(candidate.relations.length,n);}
 for(const r of g.relations){r.params.azimuth+=2;if(r.rule==='bevel-mesh')r.params.angle+=1;g.elements.find(e=>e.id===r.elements[0]).pose.position[2]+=2;}
 const refined=await refineGraph(g);assert.ok(refined.error<1e-5);assert.ok(resolveMechanism(refined.graph).valid);
 assert.ok(assessConstruction(refined.graph).valid);
 console.log(`${n} mixed stages: ${routed.solutions.length} cold solutions; continuous refinement passed`);
}
const valid=assessConstruction(demoMechanism());assert.ok(valid.valid);
const short=structuredClone(valid.graph);short.bodies[0].shaft.start=0;
assert.ok(assessConstruction(short,1,false).checks.some(c=>c.id.endsWith('bearing-length')&&c.state==='fail'));
const collision=structuredClone(valid.graph);collision.bodies[2].frame=structuredClone(collision.bodies[0].frame);
assert.equal(assessConstruction(collision).valid,false);
const abort=new AbortController();abort.abort();
assert.equal((await robustRoute(demoMechanism(),options,abort.signal)).status,'cancelled');
assert.equal((await robustRoute(demoMechanism(),{...options,budget:1})).status,'budget');
const mid=new AbortController();setTimeout(()=>mid.abort(),10);
assert.equal((await robustRoute(demoMechanism(),{...options,minStages:4,maxStages:4},mid.signal)).status,'cancelled');
console.log('Clearance, bearing length, fixed targets, ratio, immutability, budgets and cancellation passed.');
