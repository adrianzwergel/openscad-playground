import assert from 'node:assert/strict';
import {fixture} from './mixed-space-fixture.mjs';
import {robustRoute} from '../src/mechanics/graph/robust-search.ts';
import {assessConstruction} from '../src/mechanics/graph/construction.ts';
import {resolveMechanism} from '../src/mechanics/graph/model.ts';
const g=fixture(4),original=structuredClone(g),abort=new AbortController();let streamed=0;
const result=await robustRoute(g,{target:120,tolerance:0,minStages:4,maxStages:4,budget:18000,beam:120,rules:g.relations.map(r=>r.rule)},abort.signal,undefined,(candidate,report,stats)=>{streamed++;assert.ok(resolveMechanism(candidate).valid);assert.ok(assessConstruction(candidate,1,false).valid);assert.ok(report.valid);assert.ok(stats.visited<=18000);candidate.bodies[0].frame.position[0]=9999;report.checks.length=0;abort.abort();});
assert.equal(streamed,1);assert.equal(result.status,'cancelled');assert.equal(result.solutions.length,1);assert.ok(assessConstruction(result.solutions[0],1,false).valid);assert.ok(result.reports[0].checks.length);assert.deepEqual(g,original);
console.log('Only validated solutions stream; cancellation retains results and callback copies cannot corrupt the search.');
