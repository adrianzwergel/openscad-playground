// Profile compatibility follows rules, never lists.
import assert from 'node:assert/strict';
import {compatible,reference,validateProfile} from '../../src/mechanics/kinematics/profiles.ts';
import {spurSurface,validateSurface,teeth,meanRadius} from '../../src/mechanics/kinematics/surfaces.ts';

const inv=(module,angle=20)=>({kind:'involute',module,pressureAngle:angle,backlash:.15});
const lego={kind:'library',id:'lego-m1',reference:{module:1,pressureAngle:20},tolerance:.03};
assert.ok(compatible(inv(2),inv(2)).ok,'same basic rack');
assert.ok(!compatible(inv(2),inv(1)).ok,'different module');
assert.ok(!compatible(inv(2),inv(2,25)).ok,'different pressure angle');
assert.ok(compatible(lego,inv(1)).ok,'library meshes with printed involute of its reference module');
assert.ok(compatible(lego,inv(1.02)).ok,'within library tolerance');
assert.ok(!compatible(lego,inv(1.1)).ok,'beyond library tolerance');
assert.ok(compatible(lego,lego).ok,'library with itself');
assert.ok(compatible({kind:'friction'},{kind:'friction'}).ok,'rollers');
assert.ok(!compatible({kind:'friction'},inv(1)).ok,'roller against teeth');
assert.ok(compatible({kind:'belt',pitch:2,toothed:true},{kind:'belt',pitch:2,toothed:true}).ok,'GT2 pulleys');
assert.ok(!compatible({kind:'belt',pitch:2,toothed:true},{kind:'belt',pitch:3,toothed:true}).ok,'belt pitch');
const worm={kind:'helical',lead:Math.PI*2,starts:1};
assert.equal(Math.abs(reference(worm).module-2)<1e-12,true,'worm module from lead');
assert.ok(compatible(worm,inv(2)).ok,'worm with module-2 wheel');
assert.ok(!compatible(worm,inv(1)).ok,'worm with wrong wheel');
assert.ok(!compatible(worm,worm).ok,'two worms');
const gen={kind:'generated',from:{element:'lego24',surface:'teeth'}};
const ids={a:{element:'lego24',surface:'teeth'},b:{element:'print',surface:'teeth'}};
assert.ok(compatible(lego,gen,ids).ok,'generated mate against its source');
assert.ok(!compatible(inv(1),gen,{a:{element:'other',surface:'teeth'},b:ids.b}).ok,'generated mate against anything else');
assert.ok(!compatible(lego,gen).ok,'generated without ids');
assert.throws(()=>validateProfile({kind:'involute',module:0,pressureAngle:20,backlash:0}),/Modul/);

// Surfaces: teeth follow from perimeter and module; non-integral perimeters are rejected.
const s=spurSurface('a',2,20,10);validateSurface(s);assert.equal(Math.round(teeth(s)),20);assert.equal(meanRadius(s),20);
assert.throws(()=>validateSurface({...s,pitch:{kind:'circle',r:20.3}}),/Vielfaches/);
validateSurface({id:'rack',pitch:{kind:'line',length:200},profile:inv(2),z:[0,10],side:'external'});
assert.throws(()=>validateSurface({id:'ring',pitch:{kind:'line'},profile:inv(2),z:[0,10],side:'internal'}),/Innenverzahnung/);
assert.throws(()=>validateSurface({id:'belt',pitch:{kind:'line'},profile:{kind:'belt',pitch:2,toothed:true},z:[0,6],side:'external'}),/rund/);
console.log('Kinematics profiles: basic-rack rule, library tolerance, generated mates, belts, worms and surface validation passed.');
