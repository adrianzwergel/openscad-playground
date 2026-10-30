import assert from 'node:assert/strict';
import {spaceExample,compoundExample} from '../src/mechanics/graph/examples.ts';
import {demoMechanism,resolveMechanism,mechanismCAD} from '../src/mechanics/graph/model.ts';
import {connectionVariants} from '../src/mechanics/graph/topology.ts';
import {robustRoute} from '../src/mechanics/graph/robust-search.ts';
import {assessConstruction} from '../src/mechanics/graph/construction.ts';
const source=demoMechanism(),goal=spaceExample();source.version=4;source.input.target=goal.input.target;source.output.target=goal.output.target;source.environment=goal.environment;
const before=structuredClone(source),r=await robustRoute(source,{target:1,tolerance:0,minStages:2,maxStages:2,budget:10000,beam:120,rules:['external-spur']});
const reused=r.solutions.filter(g=>g.relations[0].elements[1]===g.relations[1].elements[0]);assert.ok(reused.length,'Cold directed starts must find reusable output gears');
for(const g of reused){assert.equal(g.elements.length,3);assert.equal(mechanismCAD(g).parts.length,3,'CAD generates the shared gear once');assert.ok(resolveMechanism(g).valid);assert.ok(assessConstruction(g,1,false).valid);assert.deepEqual(g.output.target,goal.output.target);assert.equal(resolveMechanism(g).value,1);}
assert.deepEqual(source,before);
// Identical wheels can be merged; different tooth counts must stay separate.
const shared=reused[0],split=structuredClone(shared),id=split.relations[0].elements[1],wheel=split.elements.find(e=>e.id===id);wheel.binding='fixed';split.bodies.find(b=>b.id===wheel.body).motion='rotation';split.elements.push({...structuredClone(wheel),id:'duplicate',pose:{...structuredClone(wheel.pose),position:[0,0,wheel.pose.position[2]+30]}});split.relations[1].elements[0]='duplicate';
assert.ok(connectionVariants(split).some(g=>g.elements.length===3));split.elements.at(-1).params.teeth+=10;assert.ok(connectionVariants(split).every(g=>g.elements.length===4));
assert.ok(connectionVariants(compoundExample('gear-belt')).every(g=>g.elements.length===4));
console.log('Reusable intermediate output gear: cold search, 3 gears instead of 4, single CAD instance, fixed targets, collision gates and incompatible parts passed.',reused.length,'shared candidates');
