import assert from 'node:assert/strict';
import {linearExample,freeRotorExample} from '../src/mechanics/graph/examples.ts';
import {demoMechanism,resolveMechanism,parseMechanism,transformMechanism,context} from '../src/mechanics/graph/model.ts';
import {assessConstruction} from '../src/mechanics/graph/construction.ts';
import {robustRoute} from '../src/mechanics/graph/robust-search.ts';
import {axisAngle,axis,add,scale} from '../src/mechanics/graph/frames.ts';
import {initialProject,parseProject,serializeProject} from '../src/mechanics/model.ts';
import {rotors,metrics,graphTravel} from '../src/mechanics/inspection.ts';

const idler=freeRotorExample(),resolved=resolveMechanism(idler);
assert.ok(resolved.valid);assert.equal(resolved.ratio,1);assert.equal(resolved.speeds.B,0);assert.equal(resolved.elementSpeeds['spur-B'],-.5);
const freeOutput=structuredClone(idler);freeOutput.output={...freeOutput.output,body:'B',element:'spur-B',target:structuredClone(freeOutput.bodies[1].frame)};assert.ok(resolveMechanism(freeOutput).valid);assert.equal(resolveMechanism(freeOutput).ratio,2);
const fixed=structuredClone(idler);fixed.elements[1].binding='fixed';assert.equal(resolveMechanism(fixed).valid,false);
const disconnected=demoMechanism();disconnected.version=2;disconnected.elements[1].binding='free';assert.equal(resolveMechanism(disconnected).valid,false,'Free gear must not drive another gear on its carrier');
const sliding=demoMechanism();sliding.version=2;sliding.elements[1].binding='sliding';assert.ok(resolveMechanism(sliding).valid);assert.ok(resolveMechanism(sliding).checks.some(c=>c.id.endsWith('/sliding')&&c.state==='unknown'));
assert.throws(()=>parseMechanism({...idler,version:1}));

for(const kind of ['belt-screw','spur-rack','worm-belt-screw']){
 const g=transformMechanism(linearExample(kind),{position:[17,9,-23],rotation:axisAngle([1,2,3],31)}),a=resolveMechanism(g);
 assert.ok(a.valid);assert.ok(assessConstruction(g,1,false).valid);assert.equal(a.unit,'mm/U');assert.ok(Number.isNaN(a.ratio));
 assert.ok(Math.abs(a.value-(kind==='belt-screw'?4:kind==='spur-rack'?20*Math.PI:8/30))<1e-9);
 const p={...initialProject(),graph:g};assert.deepEqual(parseProject(serializeProject(p)).graph,g);assert.equal(metrics(p).unit,'mm/U');
 const start=rotors(p,0),moved=rotors(p,360),i=g.elements.length-1;
 assert.ok(Math.abs(Math.hypot(...moved[i].position.map((v,j)=>v-start[i].position[j]))-a.value)<1e-7);assert.equal(moved[i].angle,0);
 assert.ok(graphTravel(p,1e7).q<=g.output.stroke);
 const mismatch=structuredClone(g);mismatch.output.motion='rotation';delete mismatch.output.stroke;assert.equal(resolveMechanism(mismatch).valid,false);
 const stroke=structuredClone(g);stroke.output.stroke=500;stroke.relations.at(-1).params.stroke=500;assert.equal(resolveMechanism(stroke).valid,false);
 if(kind==='spur-rack'){const badPhase=structuredClone(g);badPhase.elements.at(-1).phase+=1;assert.equal(resolveMechanism(badPhase).valid,false);}
 // Foreign rotor placed at the end of the output stroke: reject the full swept volume.
 const blocked=structuredClone(g),out=blocked.bodies.at(-1),end=add(out.frame.position,scale(axis(out.frame),g.output.stroke));
 blocked.bodies.push({id:'obstacle',kind:'rigid',motion:'rotation',frame:{...out.frame,position:end}});
 blocked.elements.push({id:'obstacle-rotor',family:'gt2-pulley',body:'obstacle',binding:'fixed',pose:{position:[0,0,0],rotation:[0,0,0,1]},phase:0,params:{teeth:20,width:6,bore:5.1}});
 // The geometric checker can inspect an obstacle independently of its mounting type.
 assert.ok(assessConstruction(blocked).checks.some(c=>c.state==='fail'&&c.id.includes('obstacle-rotor')));
 const source=demoMechanism();source.version=2;source.input.target=g.input.target;source.output={...g.output,body:source.output.body};
 const rules=[...new Set(g.relations.map(r=>r.rule))];
 const found=await robustRoute(source,{target:a.value,tolerance:0,minStages:g.relations.length,maxStages:g.relations.length,budget:100000,beam:120,rules});
 assert.ok(found.solutions.length,kind+JSON.stringify(found.rejections));
 for(const s of found.solutions){const k=resolveMechanism(s);assert.ok(k.valid);assert.equal(k.unit,'mm/U');assert.ok(Math.abs(k.value-a.value)<1e-7);assert.deepEqual(s.output.target,g.output.target);assert.ok(assessConstruction(s,1,false).valid);}
 console.log(kind,found.solutions.length,'cold linear solutions',found.attempts,'starts');
}
console.log('Linear graph: typed quantities, bindings, free idler, sliding warning, stroke, sweeps, persistence and cold search passed.');
