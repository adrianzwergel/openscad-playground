import assert from 'node:assert/strict';
import {demoMechanism,resolveMechanism,parseMechanism,transformMechanism,proposeMate,context} from '../src/mechanics/graph/model.ts';
import {standardRegistry} from '../src/mechanics/graph/registry.ts';
import {axisAngle,identity} from '../src/mechanics/graph/frames.ts';
import {initialProject,parseProject,serializeProject} from '../src/mechanics/model.ts';
for(const angle of [60,90,120]){const g=demoMechanism(angle),a=resolveMechanism(g);assert.ok(a.valid);assert.equal(a.ratio,3);assert.equal(g.bodies.length,3);assert.equal(g.elements.filter(e=>e.body==='B').length,2);assert.equal(a.speeds.B,-.5);assert.equal(a.speeds.C,1/3);for(const rel of g.relations){const residuals=standardRegistry().getRule(rel.rule).residuals(context(g,rel));assert.ok(residuals.every(r=>Math.abs(r.value)<=r.tolerance));}
 for(const rotation of [axisAngle([1,2,3],35),axisAngle([1,0,0],180)]){const moved=transformMechanism(g,{position:[30,-70,10],rotation});assert.ok(resolveMechanism(moved).valid);assert.deepEqual(parseMechanism(moved),moved);}
 const p={...initialProject(),graph:g};assert.deepEqual(parseProject(serializeProject(p)),p);
 const bad=structuredClone(g);bad.bodies[2].frame.position[0]+=2;assert.ok(!resolveMechanism(bad).valid);const pose=proposeMate(bad,'mesh-BC')[0];bad.bodies[2].frame=pose.frame;assert.ok(resolveMechanism(bad).valid);
 const packed=structuredClone(g);packed.elements[2].pose.position[2]=0;assert.ok(resolveMechanism(packed).checks.some(c=>c.id.includes('/axial')&&c.state==='fail'));
}
const g=demoMechanism();assert.throws(()=>parseMechanism({...g,registryVersion:'unknown'}));const invalid=structuredClone(g);invalid.bodies[0].frame.rotation=[0,0,0,2];assert.throws(()=>parseMechanism(invalid));const unknown=structuredClone(g);unknown.elements[0].family='herringbone';assert.throws(()=>parseMechanism(unknown));
// A new rule family does not require changes to the graph parser or velocity solver.
const registry=standardRegistry();registry.family({id:'test-joint-end',carrier:'any',validate:()=>{},envelope:()=>({radius:1,min:-1,max:1}),scad:()=>''});registry.rule({id:'test-ball-joint',category:'joint',arity:2,dofs:3,validate:()=>{},evaluate:()=>[]});const joints=structuredClone(g);joints.elements.push(...['A','C'].map(body=>({id:'joint-'+body,family:'test-joint-end',body,pose:identity(),phase:0,params:{}})));joints.relations=[{id:'joint',rule:'test-ball-joint',elements:['joint-A','joint-C'],params:{}}];const result=resolveMechanism(joints,registry);assert.equal(result.speeds.C,undefined);assert.ok(result.checks.some(c=>c.id==='joint/mobility'&&c.state==='unknown'));assert.equal(result.valid,false);
registry.rule({id:'test-three-wheel-loop',category:'loop',arity:3,dofs:0,validate:()=>{},evaluate:()=>[],transfers:()=>[{from:0,to:1,gain:.5},{from:1,to:2,gain:.25}]});
const loop={...g,bodies:g.bodies.map(b=>({id:b.id,kind:'rigid',frame:b.frame})),elements:g.bodies.map(b=>({id:'loop-'+b.id,body:b.id,family:'test-joint-end',pose:identity(),phase:0,params:{}})),relations:[{id:'loop',rule:'test-three-wheel-loop',elements:['loop-A','loop-B','loop-C'],params:{}}]};assert.equal(resolveMechanism(loop,registry).ratio,8);assert.equal(resolveMechanism(loop,registry).valid,true);
for(const version of [1,2,3,4,5])assert.equal(parseProject(JSON.stringify({...initialProject(),version})).version,6);
console.log('Element graph passed: shared shaft, extensible registry, joint DOFs without false transfer, frames, arbitrary global rotations, placement proposals, overlap/phase checks and persistence.');
