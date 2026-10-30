import assert from 'node:assert/strict';
import {driveExample} from '../src/mechanics/graph/examples.ts';
import {demoMechanism,resolveMechanism,parseMechanism,mechanismCAD,context,transformMechanism} from '../src/mechanics/graph/model.ts';
import {registry} from '../src/mechanics/graph/registry.ts';
import {beltDimensions} from '../src/mechanics/graph/drives.ts';
import {assessConstruction} from '../src/mechanics/graph/construction.ts';
import {robustRoute} from '../src/mechanics/graph/robust-search.ts';
import {axisAngle} from '../src/mechanics/graph/frames.ts';
// A registered binary provider works without editing the router or optimizer.
const custom={...registry.getRule('external-spur'),id:'test-provider'};registry.rule(custom);
try{
 const g=demoMechanism();g.bodies=g.bodies.slice(0,2);g.elements=g.elements.slice(0,2);g.relations=g.relations.slice(0,1);g.relations[0].rule=custom.id;g.output={...g.output,body:g.bodies[1].id,target:structuredClone(g.bodies[1].frame)};
 const found=await robustRoute(g,{target:2,tolerance:0,minStages:1,maxStages:1,budget:1000,beam:10,rules:[custom.id]});
 assert.ok(found.solutions.length);assert.equal(found.solutions[0].relations[0].rule,custom.id);
}finally{registry.rules.delete(custom.id);}
for(const kind of ['worm-spur','worm-belt','spur-belt-worm']){
 const g=transformMechanism(driveExample(kind),{position:[13,-7,22],rotation:axisAngle([1,2,3],31)}),resolved=resolveMechanism(g);
 assert.ok(resolved.valid);assert.equal(resolved.ratio,kind==='spur-belt-worm'?60:30);
 assert.ok(assessConstruction(g,1,false).valid);assert.deepEqual(parseMechanism(JSON.parse(JSON.stringify(g))),g);
 assert.match(mechanismCAD(g).source,/worm_gear/);
 if(kind.includes('belt')){
  assert.match(mechanismCAD(g).source,/linear_extrude/);
  const rel=g.relations.find(r=>r.rule==='gt2-belt'),dims=beltDimensions(context(g,rel));assert.ok(dims.center>100&&dims.center<130);
  const driven=g.elements.find(e=>e.id===rel.elements[1]),swept=assessConstruction(g,1,false).boxes.find(b=>b.id===driven.body&&b.kind==='shaft');
  assert.ok(swept.half[0]>g.bodies.find(b=>b.id===driven.body).shaft.diameter/2+.1||swept.half[1]>g.bodies.find(b=>b.id===driven.body).shaft.diameter/2+.1,'Tension sweep must reserve more than the operating shaft');
  for(const params of [{length:301},{release:0},{tension:0}]){const bad=structuredClone(g);Object.assign(bad.relations.find(r=>r.id===rel.id).params,params);assert.equal(resolveMechanism(bad).valid,false);}
  // A foreign component crossing the belt corridor must be rejected.
  const blocked=structuredClone(g),space=registry.getRule(rel.rule).spaces(context(g,rel))[0];
  blocked.bodies.push({id:'obstacle',kind:'shaft',frame:space.frame,shaft:{diameter:5,start:-20,end:20}});
  blocked.elements.push({id:'blocker',family:'gt2-pulley',body:'obstacle',pose:{position:[0,0,0],rotation:[0,0,0,1]},phase:0,params:{teeth:20,width:6,bore:5.1}});
  assert.ok(assessConstruction(blocked).checks.some(c=>c.state==='fail'&&c.id.includes('space-0')));
 }
 const source=demoMechanism();source.input.target=g.input.target;source.output.target=g.output.target;
 const rules=[...new Set(g.relations.map(r=>r.rule))];
 const found=await robustRoute(source,{target:resolved.ratio,tolerance:0,minStages:g.relations.length,maxStages:g.relations.length,budget:100000,beam:120,rules});
 assert.ok(found.solutions.length,`${kind}: ${JSON.stringify(found.rejections)}`);
 for(const solution of found.solutions){assert.ok(resolveMechanism(solution).valid);assert.ok(assessConstruction(solution,1,false).valid);assert.deepEqual(solution.output.target,g.output.target);assert.ok(solution.relations.every(r=>rules.includes(r.rule)));}
 console.log(kind,found.solutions.length,'cold solutions',found.attempts,'starts');
}
console.log('Graph drives: ratios, fixed frames, cold routing, catalog lengths, tension, belt collision, CAD and roundtrip passed.');
