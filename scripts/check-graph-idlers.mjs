import assert from 'node:assert/strict';
import {demoMechanism,resolveMechanism,transformMechanism} from '../src/mechanics/graph/model.ts';
import {robustRoute} from '../src/mechanics/graph/robust-search.ts';
import {connectionVariants,connectionSummary} from '../src/mechanics/graph/topology.ts';
import {axisAngle,identity} from '../src/mechanics/graph/frames.ts';
import {assessConstruction} from '../src/mechanics/graph/construction.ts';
import {initialProject,parseProject,serializeProject} from '../src/mechanics/model.ts';
import {registry} from '../src/mechanics/graph/registry.ts';
import {freeRotorExample,driveExample} from '../src/mechanics/graph/examples.ts';
import {reflow} from '../src/mechanics/graph/refine.ts';

const options={tolerance:0,budget:100000,beam:120,rules:['external-spur']};
for(const depth of [2,3,4]){
 let source=demoMechanism();source.output.target={...identity(),position:depth===2?[120,0,0]:depth===3?[150,60,0]:[210,60,0]};
 source=transformMechanism(source,{position:[13,-9,27],rotation:axisAngle([1,2,3],31)});
 const before=JSON.stringify(source),result=await robustRoute(source,{...options,target:1,minStages:depth,maxStages:depth});
 const free=result.solutions.filter(g=>connectionSummary(g).freeIdlers===depth-1);
 assert.ok(free.length,`${depth}: ${JSON.stringify(result.rejections)}`);
 for(const g of free){
  const a=resolveMechanism(g);assert.ok(a.valid);assert.equal(g.elements.length,depth+1);assert.ok(Math.abs(a.ratio-1)<1e-8);assert.ok(assessConstruction(g,1,false).valid);
  assert.deepEqual(g.input.target,source.input.target);assert.deepEqual(g.output.target,source.output.target);
  for(const e of g.elements.filter(e=>e.binding==='free')){assert.equal(a.speeds[e.body],0);assert.ok(Math.abs(a.elementSpeeds[e.id])>0);assert.equal(g.relations.filter(r=>r.elements.includes(e.id)).length,2);assert.equal(e.pose.position[2],0);}
  assert.deepEqual(parseProject(serializeProject({...initialProject(),graph:g})).graph,g);
 }
 assert.equal(JSON.stringify(source),before);console.log(depth,'stages:',free.length,'solutions with fixed idler axes');
}
// A 4:1 two-stage reduction cannot be obtained by a single catalog idler (20..40 teeth).
const compound=demoMechanism();compound.output.target={...identity(),position:[120,0,30]};
const driven=await robustRoute(compound,{...options,target:4,minStages:2,maxStages:2});
assert.ok(driven.solutions.length);for(const g of driven.solutions){assert.equal(connectionSummary(g).freeIdlers,0);assert.equal(connectionSummary(g).driveShafts,1);assert.equal(g.elements.length,4);}
// Different families / separate belt loops must never be collapsed into one rotor.
assert.equal(connectionVariants(driveExample('worm-belt')).length,1);
const optedOut=registry.getRule('external-spur').search.sharedRotor;
const split=freeRotorExample(),incoming=split.elements[1];split.bodies[1].motion='rotation';incoming.binding='fixed';
split.elements.push({...structuredClone(incoming),id:'separate-gear',pose:{...identity(),position:[0,0,30]}});split.relations[1].elements[0]='separate-gear';
const original=JSON.stringify(split);assert.equal(connectionVariants(split).length,2);assert.equal(JSON.stringify(split),original);
try{registry.getRule('external-spur').search.sharedRotor=false;assert.equal(connectionVariants(split).length,1);}finally{registry.getRule('external-spur').search.sharedRotor=optedOut;}
const mismatch=structuredClone(split);mismatch.elements.at(-1).params.teeth=30;assert.equal(connectionVariants(mismatch).length,1);
// Mixed topology: one free idler, then an actual drive shaft carrying gear + worm.
let mixed=freeRotorExample();const previous=mixed.output.body;
mixed.bodies.push({id:'D',kind:'shaft',motion:'rotation',frame:identity(),shaft:{diameter:5,start:-70,end:150}});
const pair=registry.getRule('worm-mesh').search.catalog().find(c=>c.elements[0].params.starts===2&&c.elements[1].params.teeth===30);
pair.elements.forEach((e,i)=>mixed.elements.push({...structuredClone(e),id:'worm'+i,body:i?'D':previous,binding:'fixed',pose:{...identity(),position:[0,0,i?0:70]},phase:0}));
mixed.relations.push({id:'worm-pair',rule:'worm-mesh',elements:['worm0','worm1'],params:{azimuth:0}});mixed.output.body='D';mixed=reflow(mixed);mixed.output.target=structuredClone(mixed.bodies.at(-1).frame);
assert.ok(assessConstruction(mixed).valid);
const seed=demoMechanism();seed.output.target=mixed.output.target;
const found=await robustRoute(seed,{...options,target:15,minStages:3,maxStages:3,rules:['external-spur','worm-mesh']});
assert.ok(found.solutions.some(g=>connectionSummary(g).freeIdlers===1&&connectionSummary(g).driveShafts===1),JSON.stringify(found.rejections));
console.log('Compound reduction and mixed idler/drive-shaft selection passed.');
