import assert from 'node:assert/strict';
import {fixture} from './mixed-space-fixture.mjs';
import {robustRoute} from '../src/mechanics/graph/robust-search.ts';
import {detourSeed} from '../src/mechanics/graph/detours.ts';
import {demoMechanism,resolveMechanism} from '../src/mechanics/graph/model.ts';
import {assessConstruction} from '../src/mechanics/graph/construction.ts';
import {axis,add,scale,norm,identity,axisAngle,compose} from '../src/mechanics/graph/frames.ts';
import {initialProject,parseProject,serializeProject} from '../src/mechanics/model.ts';
function check(g,source,n){assert.equal(g.relations.length,n);assert.ok(resolveMechanism(g).valid);assert.ok(assessConstruction(g,1,false).valid);assert.deepEqual(g.environment,source.environment);assert.deepEqual(g.input.target,source.input.target);assert.deepEqual(g.output.target,source.output.target);assert.ok(Math.abs(resolveMechanism(g).value-(n===3?60:120))<1e-8);assert.deepEqual(parseProject(serializeProject({...initialProject(),graph:g})).graph,g);}
for(const n of [3,4]){
 const source=fixture(n),before=structuredClone(source),rules=source.relations.map(r=>r.rule);
 assert.ok(assessConstruction(source).checks.some(c=>c.state==='fail'&&c.id.startsWith('obstacle/')));
 assert.ok(norm(add(axis(source.input.target),scale(axis(source.output.target),-1)))>.1);
 const seed=detourSeed(source,0);assert.deepEqual(seed.output.target,source.output.target);assert.deepEqual(seed.environment,source.environment);assert.deepEqual(seed.elements.map(e=>e.params),source.elements.map(e=>e.params));
 const result=await robustRoute(source,{target:n===3?60:120,tolerance:0,minStages:n,maxStages:n,budget:18000,beam:120,rules});assert.ok(result.solutions.some(s=>s.relations.every((r,i)=>r.rule===rules[i])));assert.ok(result.detourStarts>0);for(const g of result.solutions)check(g,source,n);assert.deepEqual(source,before);
 console.log(n,'mixed stages rerouted:',result.solutions.length);
 if(n===3){const cold=demoMechanism();cold.version=4;cold.input.target=source.input.target;cold.output.target=source.output.target;cold.environment=source.environment;const found=await robustRoute(cold,{target:60,tolerance:0,minStages:3,maxStages:3,budget:40000,beam:120,rules});assert.ok(found.solutions.length);for(const s of found.solutions)check(s,source,3);console.log('Cold mixed search:',found.solutions.length);}
}
// Parallel-axis-only catalogs cannot satisfy a rotated fixed frame; reject them
// before costly local solves, but never infer impossibility for unknown providers.
const impossible=fixture(3);const rejected=await robustRoute(impossible,{target:4,tolerance:0,minStages:2,maxStages:2,budget:1000,beam:120,rules:['external-spur','gt2-belt']});assert.equal(rejected.solutions.length,0);assert.ok(rejected.rejections.orientation>0);assert.equal(rejected.attempts,0);
const controller=new AbortController();setTimeout(()=>controller.abort(),30);assert.equal((await robustRoute(fixture(4),{target:120,tolerance:0,minStages:4,maxStages:4,budget:100000,beam:120},controller.signal)).status,'cancelled');
console.log('Mixed fixed targets, catalog, obstacles, belt clearance, serialization, orientation pruning and cancellation passed.');

const local=demoMechanism();local.version=4;local.environment={margin:1,obstacles:[]};local.output.local={...identity(),rotation:axisAngle([0,1,0],25)};local.output.constraint='axis';local.output.target=compose({...local.output.local,position:[120,0,30]},{...identity(),rotation:axisAngle([0,0,1],37)});
const localResult=await robustRoute(local,{target:4,tolerance:0,minStages:2,maxStages:2,budget:20,beam:10,rules:['external-spur']});assert.ok(localResult.attempts>0);assert.equal(localResult.rejections.orientation,undefined);
console.log('Local terminal orientation and free roll are not incorrectly pruned.');
