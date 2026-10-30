import assert from 'node:assert/strict';
import {demoMechanism,resolveMechanism,transformMechanism} from '../src/mechanics/graph/model.ts';
import {robustRoute} from '../src/mechanics/graph/robust-search.ts';
import {detourSeed} from '../src/mechanics/graph/detours.ts';
import {assessConstruction} from '../src/mechanics/graph/construction.ts';
import {identity,axisAngle,inverse,compose} from '../src/mechanics/graph/frames.ts';
import {regionHull,spaceViolations} from '../src/mechanics/graph/space.ts';
export function fixture(n){
 const g=demoMechanism();g.version=4;g.output.target={...identity(),position:[n===3?120:160,0,n*30]};
 g.environment={margin:1,bounds:{id:'space',frame:{...identity(),position:[90,0,45]},size:[320,300,250]},obstacles:[{id:'block',frame:{...identity(),position:[n===3?60:80,0,30]},size:[10,10,180]}]};return g;
}
for(const n of [3,4]){
 const world=n===4?{position:[21,-13,8],rotation:axisAngle([1,2,3],31)}:identity();
 const g=transformMechanism(fixture(n),world),original=structuredClone(g);
 const r=await robustRoute(g,{target:2**n,tolerance:0,minStages:n,maxStages:n,budget:40000,beam:120,rules:['external-spur']});
 assert.ok(r.solutions.length,`${n}: ${JSON.stringify(r.rejections)}`);assert.ok(r.detourStarts>0);assert.ok(r.visited<=40000);assert.deepEqual(g,original);
 const sides=new Set();
 for(const s of r.solutions){assert.equal(s.relations.length,n);assert.ok(resolveMechanism(s).valid);assert.ok(assessConstruction(s,1,false).valid);assert.deepEqual(s.environment,g.environment);assert.deepEqual(s.input.target,g.input.target);assert.deepEqual(s.output.target,g.output.target);assert.equal(resolveMechanism(s).value,2**n);sides.add(Math.sign(compose(inverse(world),s.bodies[1].frame).position[1]));}
 assert.ok(sides.has(-1)&&sides.has(1),'Both sides of the obstacle must be explored successfully');
 // Block one successful side. A previous valid arrangement must now be rerouted.
 if(n===3){const blocked=structuredClone(r.solutions[0]);blocked.environment.obstacles.push({id:'second',frame:{...identity(),position:[60,-75,45]},size:[90,35,200]});
 const retry=await robustRoute(blocked,{target:8,tolerance:0,minStages:3,maxStages:3,budget:20000,beam:120,rules:['external-spur']});assert.ok(retry.solutions.length);for(const s of retry.solutions){assert.ok(assessConstruction(s,1,false).valid);assert.ok(s.bodies[1].frame.position[1]>0);}}
 // Seed generation must preserve goals, catalog and constraints, including rotated frames.
 const seed=detourSeed(r.solutions[0],4);assert.deepEqual(seed.environment,g.environment);assert.deepEqual(seed.output.target,g.output.target);assert.deepEqual(seed.elements.map(e=>e.params),r.solutions[0].elements.map(e=>e.params));
 console.log(n,'stages:',r.solutions.length,'solutions on both sides;',r.detourStarts,'detour starts');
}
const box={id:'box',frame:identity(),size:[10,10,10]},env={margin:1,obstacles:[box,{...box,id:'second',frame:{...identity(),position:[8,0,0]}}]};
const violations=spaceViolations(regionHull(box),env);assert.equal(violations.length,2);assert.ok(violations.every(v=>v>0));
const controller=new AbortController();setTimeout(()=>controller.abort(),20);const aborted=await robustRoute(fixture(4),{target:16,tolerance:0,minStages:4,maxStages:4,budget:100000,beam:120},controller.signal);assert.equal(aborted.status,'cancelled');
console.log('Independent obstacle residuals and cancellation passed.');
