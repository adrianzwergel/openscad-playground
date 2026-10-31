// Document parsing, parameter expressions, mirroring and pattern expansion.
import assert from 'node:assert/strict';
import {parseMechanism,evaluate,mirrorFrame,expand} from '../../src/mechanics/kinematics/model.ts';
import {compose,axisAngle,rotate,norm,cross,dot,identity,lcg} from '../../src/mechanics/kinematics/math.ts';

assert.equal(evaluate('2*(3+4)^2/7-1',{}),13);
assert.equal(evaluate('h/3 - 2*rand',{h:2100,rand:30}),640);
assert.ok(Math.abs(evaluate('max(sin(30), cos(60))',{})-.5)<1e-12);
assert.throws(()=>evaluate('h+',{h:1}),/unvollständig|nicht verstanden/);
assert.throws(()=>evaluate('foo(1)',{}),/Unbekannte Funktion/);
assert.throws(()=>evaluate('x',{}),/Unbekannter Parameter/);

const ground={id:'ground',frame:identity(),ground:true};
const base=()=>({format:'kinematics-1',parameters:[{id:'h',value:2100},{id:'p',value:{expr:'h/3'}}],bodies:[ground,{id:'b',frame:{position:[0,0,{expr:'p'}],rotation:[0,0,0,1]}}],elements:[],joints:[{id:'j',joint:{kind:'revolute'},a:{body:'ground',local:identity()},b:{body:'b',local:identity()}}],contacts:[],patterns:[],input:{kind:'coordinate',joint:'j',coordinate:0},output:{kind:'coordinate',joint:'j',coordinate:0},range:{from:0,to:90,samples:4}});
{const m=parseMechanism(base());assert.equal(m.bodies[1].frame.position[2],700,'expression resolved from parameter');assert.equal(m.parameters[1].value,700);}
assert.throws(()=>parseMechanism({...base(),bodies:[{id:'a',frame:identity()}]}),/Gestell/);
assert.throws(()=>parseMechanism({...base(),joints:[{id:'j',joint:{kind:'revolute'},a:{body:'ground',local:identity()},b:{body:'nope',local:identity()}}]}),/Körper fehlt/);
assert.throws(()=>parseMechanism({...base(),input:{kind:'coordinate',joint:'j',coordinate:1}}),/Koordinate/);
assert.throws(()=>parseMechanism({...base(),range:{from:0,to:0,samples:3}}),/Bereich/);

// Mirroring keeps frames right handed and is an involution.
{const random=lcg(3),plane={position:[10,-5,3],rotation:axisAngle([1,2,0],33)};
 for(let i=0;i<20;i++){const f={position:[random()*100-50,random()*100-50,random()*100-50],rotation:axisAngle([random()-.5,random()-.5,random()-.5],random()*360)};
  const m=mirrorFrame(f,plane),back=mirrorFrame(m,plane);
  assert.ok(norm(back.position.map((v,k)=>v-f.position[k]))<1e-9,'mirror twice restores position');
  assert.ok(Math.abs(Math.abs(back.rotation.reduce((s,v,k)=>s+v*f.rotation[k],0))-1)<1e-9,'mirror twice restores rotation');
  const x=rotate(m.rotation,[1,0,0]),y=rotate(m.rotation,[0,1,0]),z=rotate(m.rotation,[0,0,1]);assert.ok(dot(cross(x,y),z)>.999999,'mirrored frame is right handed');
  // A point on the plane stays; the frame origin's distance to the plane flips sign.
  const n=rotate(plane.rotation,[0,0,1]),d0=dot(f.position.map((v,k)=>v-plane.position[k]),n),d1=dot(m.position.map((v,k)=>v-plane.position[k]),n);assert.ok(Math.abs(d0+d1)<1e-9,'distance flips');}}

// Array and mirror patterns expand into derived, redundant copies.
{const doc={...base(),bodies:[ground,{id:'b',frame:{position:[0,0,0],rotation:[0,0,0,1]}}],joints:[{id:'j',joint:{kind:'revolute'},a:{body:'ground',local:{position:[5,0,0],rotation:[0,0,0,1]}},b:{body:'b',local:identity()}}],
  patterns:[{kind:'array',count:3,step:{position:[0,100,0],rotation:[0,0,0,1]},source:['b','j']},{kind:'mirror',plane:{position:[0,0,0],rotation:axisAngle([0,1,0],90)},source:['b','j']}]};
 const m=expand(parseMechanism(doc));
 assert.equal(m.bodies.length,1+1+2+3,'two array copies, each mirrored together with the source');assert.ok(m.bodies.some(b=>b.id==='b#0.2#1.1'),'copies of copies');
 assert.deepEqual(m.bodies.find(b=>b.id==='b#0.2').frame.position,[0,200,0]);
 const j2=m.joints.find(j=>j.id==='j#0.2');assert.ok(!j2.redundant&&j2.b.body==='b#0.2'&&j2.a.body==='ground','array copies get solved joints on the derived body');
 assert.deepEqual(j2.a.local.position,[5,200,0],'ground side local moves with the copy');
 const jm=m.joints.find(j=>j.id==='j#1.1');assert.ok(jm.redundant&&Math.abs(jm.a.local.position[0]+5)<1e-9,'mirror copies are redundant and flip x');assert.equal(m.bodies.find(b=>b.id==='b#1.1').mirror.source,'b');
 assert.equal(m.patterns.length,0);}
console.log('Kinematics model: expressions, validation, mirroring and pattern expansion passed.');
