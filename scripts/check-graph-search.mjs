import assert from 'node:assert/strict';
import {routeGraph} from '../src/mechanics/graph/search.ts';
import {demoMechanism,transformMechanism,resolveMechanism} from '../src/mechanics/graph/model.ts';
import {axisAngle} from '../src/mechanics/graph/frames.ts';
for(const angle of [90,73]){const g=transformMechanism(demoMechanism(angle),{position:[17,22,5],rotation:axisAngle([1,2,3],37)}),before=JSON.stringify(g);const r=await routeGraph(g,{target:3,tolerance:1,maxStages:2,budget:100000,beam:120});assert.ok(r.solutions.length);for(const s of r.solutions){assert.ok(resolveMechanism(s).valid);assert.deepEqual(s.input.target,g.input.target);assert.deepEqual(s.output.target,g.output.target);assert.equal(s.bodies.length,3);}assert.equal(JSON.stringify(g),before);}
const abort=new AbortController();abort.abort();assert.equal((await routeGraph(demoMechanism(),{target:3,tolerance:1,maxStages:3,budget:10,beam:10},abort.signal)).status,'cancelled');
assert.equal((await routeGraph(demoMechanism(),{target:3,tolerance:1,maxStages:3,budget:1,beam:10})).status,'budget');
console.log('Graph routing passed: fixed arbitrary world frames, non-grid cone angle, shared shaft, ratio, immutability, budget and cancellation.');
