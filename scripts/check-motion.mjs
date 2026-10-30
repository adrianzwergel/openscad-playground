import assert from 'node:assert/strict';
import {defaultMotion,resolveMotion,beltPitchLength,beltCenter,parseMotion,BELTS} from '../src/mechanics/motion.ts';
import {motionCAD} from '../src/mechanics/motion-cad.ts';
import {initialProject,serializeProject,parseProject} from '../src/mechanics/model.ts';
assert.ok(Math.abs(beltPitchLength(100,10,10)-(200+20*Math.PI))<1e-9);
for(const length of BELTS)for(const r of [16/Math.PI,60/Math.PI]){const R=40/Math.PI,c=beltCenter(length,r,R);if(Number.isFinite(c))assert.ok(Math.abs(beltPitchLength(c,r,R)-length)<1e-9);}
for(const kind of ['belt','screw','rack']){
 const m=defaultMotion(kind),a=resolveMotion(m);assert.equal(a.valid,true,kind);
 const p={...initialProject(),motion:m};assert.deepEqual(parseProject(serializeProject(p)),p);
 assert.ok(motionCAD(m).parts.length>=4);assert.ok(motionCAD(m).parts.every(p=>p.source.includes('$fn=48')));
 const invalid={...m,stroke:NaN};assert.throws(()=>parseMotion(invalid));
}
const belt=defaultMotion('belt');assert.equal(resolveMotion({...belt,travel:0}).valid,false);
assert.equal(resolveMotion({...belt,beltLength:800}).valid,false);
assert.ok(Math.abs(resolveMotion(belt).c-120)>0.01);assert.equal(belt.center,120);
assert.equal(resolveMotion(belt).ratio,2);
for(const kind of ['screw','rack']){
 const m=defaultMotion(kind),a=resolveMotion(m);
 assert.equal(resolveMotion({...m,stroke:250}).valid,false);
 assert.equal(resolveMotion({...m,stroke:250,guideLength:384}).valid,true);
 // Obstacle only in mid-travel: must be rejected independently of preview at either endpoint.
 const obstacle={x:50,y:15,z:34,sx:2,sy:2,sz:2};
 for(const position of [0,0.5,1])assert.equal(resolveMotion({...m,position,obstacle}).valid,false);
 assert.equal(resolveMotion({...m,obstacle:{...obstacle,y:300}}).valid,true);
 assert.equal(resolveMotion({...m,position:1}).valid,true);
 assert.equal(resolveMotion({...m,obstacle:{x:-60,y:30,z:24,sx:1,sy:1,sz:1}}).valid,false);
 assert.equal(a.ports[1].kind,'linear');
 if(kind==='rack'){assert.ok(a.rackLength>=m.stroke+40);assert.equal(a.rackTeeth%2,1);assert.equal(a.mmPerTurn,40*Math.PI);}
 else assert.equal(a.mmPerTurn,8);
}
assert.equal(resolveMotion({...defaultMotion('screw'),lead:2}).mmPerTurn,2);
assert.throws(()=>parseMotion({...belt,beltLength:333}));
console.log('Motion checks passed: exact belt length/inverse, bounded tension/install reserves, catalog and persistence, spindle lead, rack engagement, guide capture, continuous swept-volume rejection.');
