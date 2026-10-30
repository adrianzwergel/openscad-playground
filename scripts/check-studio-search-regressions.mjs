import assert from 'node:assert/strict';
import {robustRoute} from '../src/mechanics/graph/robust-search.ts';
import {spaceExample} from '../src/mechanics/graph/examples.ts';
import {axisAngle} from '../src/mechanics/graph/frames.ts';
import {resolveMechanism} from '../src/mechanics/graph/model.ts';
import {assessConstruction} from '../src/mechanics/graph/construction.ts';
for(const name of ['default','turn-y','block','turn-x','clock-z']){
 const g=spaceExample();if(name.startsWith('turn-'))g.output.target.rotation=axisAngle(name==='turn-y'?[0,1,0]:[1,0,0],90);if(name==='clock-z')g.output.target.rotation=axisAngle([0,0,1],90);if(name==='block')g.environment.obstacles[0].frame.position=[50,0,0];
 const before=structuredClone(g),t=Date.now();let streamed=0;
 const r=await robustRoute(g,{target:1,tolerance:1,minStages:2,maxStages:4,budget:25000,beam:120},undefined,undefined,()=>streamed++);
 assert.ok(r.solutions.length>= (name==='default'?3:1),`${name}: ${JSON.stringify(r.rejections)}`);assert.equal(streamed,r.solutions.length);assert.deepEqual(g,before);assert.ok(r.visited<=25000);
 for(const s of r.solutions){assert.ok(resolveMechanism(s).valid);assert.ok(assessConstruction(s,1,false).valid);assert.deepEqual(s.input.target,g.input.target);assert.deepEqual(s.output.target,g.output.target);assert.deepEqual(s.environment,g.environment);assert.ok(Math.abs(resolveMechanism(s).value-1)<=.010000001);}
 if(name==='default')assert.ok(new Set(r.solutions.map(g=>g.relations.length)).size>1);
 console.log(name,`${r.solutions.length} valid variants; ${r.visited} budget; ${Date.now()-t} ms`);
}
