import assert from 'node:assert/strict';
import {compoundExample,linearExample} from '../src/mechanics/graph/examples.ts';
import {demoMechanism,resolveMechanism,parseMechanism,transformMechanism} from '../src/mechanics/graph/model.ts';
import {connectionSummary,connectionVariants} from '../src/mechanics/graph/topology.ts';
import {robustRoute} from '../src/mechanics/graph/robust-search.ts';
import {assessConstruction} from '../src/mechanics/graph/construction.ts';
import {axisAngle,compose,identity} from '../src/mechanics/graph/frames.ts';
import {initialProject,parseProject,serializeProject} from '../src/mechanics/model.ts';
import {rotors} from '../src/mechanics/inspection.ts';
import {reflow} from '../src/mechanics/graph/refine.ts';
for(const kind of ['double-gear','gear-belt']){
 const g=transformMechanism(compoundExample(kind),{position:[11,-19,7],rotation:axisAngle([1,2,3],31)}),a=resolveMechanism(g),members=g.elements.filter(e=>e.rotorGroup);
 assert.ok(a.valid);assert.equal(a.ratio,4);assert.equal(a.speeds[members[0].body],0);assert.equal(a.elementSpeeds[members[0].id],a.elementSpeeds[members[1].id]);
 assert.equal(connectionSummary(g).freeCompounds,1);assert.equal(connectionSummary(g).freeIdlers,0);
 const project={...initialProject(),graph:g};assert.deepEqual(parseProject(serializeProject(project)).graph,g);
 const warm=await robustRoute(g,{target:4,tolerance:0,minStages:2,maxStages:2,budget:20,beam:10});assert.ok(warm.solutions.some(s=>connectionSummary(s).freeCompounds===1));assert.ok(warm.solutions.some(s=>connectionSummary(s).driveShafts===1));
 const before=rotors(project,0),after=rotors(project,120);for(const e of members){const i=g.elements.findIndex(x=>x.id===e.id);assert.ok(Math.abs(after[i].angle-before[i].angle+60)<1e-8);}
 const turned=structuredClone(g);turned.elements[0].phase+=37;const flowed=reflow(turned),rotor=flowed.elements.filter(e=>e.rotorGroup);assert.ok(Math.abs((rotor[1].phase-rotor[0].phase)-(members[1].phase-members[0].phase))<1e-8,'Reflow must retain rigid phase offsets');
 for(const mutate of [x=>x.version=2,x=>x.elements.find(e=>e.rotorGroup).binding='fixed',x=>delete x.elements.find(e=>e.rotorGroup).rotorGroup,x=>x.bodies.find(b=>b.id===members[0].body).motion='rotation']){const bad=structuredClone(g);mutate(bad);assert.throws(()=>parseMechanism(bad));}
 const separate=structuredClone(g);separate.elements.forEach(e=>delete e.rotorGroup);assert.equal(resolveMechanism(separate).valid,false,'Independent loose gears must not silently form a compound');
 const report=assessConstruction(g,1,false);assert.ok(report.valid);assert.equal(report.boxes.filter(b=>b.kind==='coupling').length,1);
 const blocked=structuredClone(g),h=report.boxes.find(b=>b.kind==='coupling');blocked.bodies.push({id:'obstacle',kind:'shaft',motion:'fixed',frame:{...identity(),position:h.center},shaft:{diameter:5,start:-10,end:10}});blocked.elements.push({id:'obstacle-gear',body:'obstacle',family:'spur',pose:identity(),phase:0,params:{teeth:20,module:2,width:10,bore:5.1}});assert.ok(assessConstruction(blocked).checks.some(c=>c.state==='fail'&&c.id.includes('coupling-')));
 const source=demoMechanism();source.input.target=g.input.target;source.output.target=g.output.target;
 const r=await robustRoute(source,{target:4,tolerance:0,minStages:2,maxStages:2,budget:100000,beam:120,rules:[...new Set(g.relations.map(r=>r.rule))]});
 assert.ok(r.solutions.some(g=>connectionSummary(g).freeCompounds===1));assert.ok(r.solutions.some(g=>connectionSummary(g).driveShafts===1),'Driven shaft alternative retained');
 for(const s of r.solutions){assert.ok(resolveMechanism(s).valid);assert.ok(assessConstruction(s,1,false).valid);assert.deepEqual(s.output.target,g.output.target);assert.deepEqual(parseProject(serializeProject({...initialProject(),graph:s})).graph,s);}
 console.log(kind,r.solutions.map(connectionSummary));
}
// A solid catalog spindle is not silently converted to a hollow free sleeve.
assert.ok(connectionVariants(linearExample('belt-screw')).every(g=>connectionSummary(g).freeCompounds===0));
console.log('Compound topology, independent axes, shared rates/phases, collision space, schema and cold search passed.');
