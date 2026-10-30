import assert from 'node:assert/strict';
import {robustRoute} from '../src/mechanics/graph/robust-search.ts';
import {spaceExample} from '../src/mechanics/graph/examples.ts';
import {axisAngle} from '../src/mechanics/graph/frames.ts';
import {assessNearMiss,nearMissPreviewGraph} from '../src/mechanics/graph/near-misses.ts';
import {resolveMechanism,mechanismCAD} from '../src/mechanics/graph/model.ts';
import {assessConstruction} from '../src/mechanics/graph/construction.ts';
import {adoptSolution} from '../src/mechanics/studio-model.ts';
const g=spaceExample();g.environment.obstacles=[];g.output.target={position:[81,0,0],rotation:axisAngle([0,1,0],2)};const original=structuredClone(g),updates=[];
const result=await robustRoute(g,{target:1,tolerance:0,minStages:1,maxStages:2,budget:5000,beam:120,rules:['external-spur'],includeNearMisses:true},undefined,undefined,undefined,items=>updates.push(items));
assert.equal(result.solutions.length,0);assert.equal(result.nearMisses.length,3);assert.ok(updates.length);assert.deepEqual(g,original);
for(const [i,n] of result.nearMisses.entries()){assert.ok(assessNearMiss(n.graph));assert.ok(assessConstruction(n.graph,1,false).valid);assert.deepEqual(n.graph.output.target,g.output.target);assert.equal(resolveMechanism(n.graph).valid,false);if(i)assert.ok(result.nearMisses[i-1].score<=n.score);assert.ok(mechanismCAD(nearMissPreviewGraph(n.graph)).source);assert.throws(()=>adoptSolution({version:1,assemblies:[{id:'main',graph:g}],routes:[{id:'r',assembly:'main',source:'input',target:'output',ratio:1}]},'r',n.graph));}
const collision=structuredClone(result.nearMisses[0].graph);collision.environment.obstacles=[{id:'blocked',frame:collision.bodies[0].frame,size:[150,150,150]}];assert.equal(assessNearMiss(collision),undefined);assert.throws(()=>nearMissPreviewGraph(collision));
console.log('Top 3 near misses: ranked, streamed, target preserved, collision-filtered, renderable, adoption rejected.',result.nearMisses.map(n=>n.score));

const standard=await robustRoute(spaceExample(),{target:1,tolerance:1,minStages:2,maxStages:4,budget:5000,beam:120,includeNearMisses:true});assert.ok(standard.solutions.length>=3,'Near-miss probing must not crowd out exact directed starts');console.log('Exact solution diversity preserved:',standard.solutions.length);
