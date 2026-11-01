import assert from 'node:assert/strict';
import {fixture} from './mixed-space-fixture.mjs';
import {demoMechanism,resolveMechanism} from '../src/mechanics/graph/model.ts';
import {robustRoute} from '../src/mechanics/graph/robust-search.ts';
import {assessConstruction} from '../src/mechanics/graph/construction.ts';
const target=fixture(4),cold=demoMechanism();cold.version=4;cold.input.target=target.input.target;cold.output.target=target.output.target;cold.environment=target.environment;
const result=await robustRoute(cold,{target:120,tolerance:0,minStages:4,maxStages:4,budget:40000,beam:120,rules:target.relations.map(r=>r.rule)});
assert.ok(result.solutions.length);for(const g of result.solutions){assert.equal(g.relations.length,4);assert.ok(new Set(g.relations.map(r=>r.rule)).size>=3);assert.ok(resolveMechanism(g).valid);assert.equal(resolveMechanism(g).value,120);assert.ok(assessConstruction(g,1,false).valid);assert.deepEqual(g.input.target,target.input.target);assert.deepEqual(g.output.target,target.output.target);assert.deepEqual(g.environment,target.environment);}
console.log('Cold mixed four-stage search with nonparallel frames and two obstacles:',result.solutions.length,'valid solutions.');
