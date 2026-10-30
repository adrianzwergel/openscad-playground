import assert from 'node:assert/strict';
import {spaceExample} from '../src/mechanics/graph/examples.ts';
import {robustRoute} from '../src/mechanics/graph/robust-search.ts';
import {resolveMechanism,parseMechanism} from '../src/mechanics/graph/model.ts';
import {assessConstruction} from '../src/mechanics/graph/construction.ts';
import {axisAngle,compose} from '../src/mechanics/graph/frames.ts';
import {terminalDeviation} from '../src/mechanics/graph/terminals.ts';
import {adoptSolution,serializeStudio,importStudio} from '../src/mechanics/studio-model.ts';
const g=spaceExample();g.environment.obstacles=[];g.output.target={position:[81,0,0],rotation:axisAngle([0,1,0],2)};
const opts={target:1,tolerance:0,minStages:1,maxStages:1,budget:5000,beam:120,rules:['external-spur']};
assert.equal((await robustRoute(g,opts)).solutions.length,0);
g.output.tolerance={position:2,angle:3};const original=structuredClone(g);
const r=await robustRoute(g,opts);assert.ok(r.solutions.length,JSON.stringify(r.rejections));
for(const solution of r.solutions){
 assert.ok(resolveMechanism(solution).valid);assert.ok(assessConstruction(solution,1,false).valid);
 const d=terminalDeviation(compose(solution.bodies.find(b=>b.id===solution.output.body).frame,solution.output.local),solution.output);
 assert.ok(d.position>0.9&&d.position<=2.00001);assert.ok(d.angle>=1.999&&d.angle<=3.0001);
 assert.deepEqual(solution.output.target,g.output.target);assert.deepEqual(solution.environment,g.environment);
 const strict=structuredClone(solution);delete strict.output.tolerance;assert.equal(resolveMechanism(strict).valid,false);
}
assert.deepEqual(g,original);
const doc={version:1,assemblies:[{id:'main',graph:g}],routes:[{id:'r',assembly:'main',source:'input',target:'output',ratio:1}]};
const adopted=adoptSolution(doc,'r',r.solutions[0]);assert.deepEqual(importStudio(serializeStudio(adopted)),adopted);
const widened=structuredClone(r.solutions[0]);widened.output.tolerance.position=10;assert.throws(()=>adoptSolution(doc,'r',widened));
for(const tolerance of [{position:-1,angle:0},{position:0,angle:46},{position:Infinity,angle:0},{position:2}])assert.throws(()=>parseMechanism({...g,output:{...g.output,tolerance}}));
console.log('Target tolerance: discrete catalog near miss accepted only with explicit mm/degree limits, collisions still checked, roundtrip and adoption protected.');
