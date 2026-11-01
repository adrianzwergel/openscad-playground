import assert from 'node:assert/strict';
import {initialProject,serializeProject} from '../src/mechanics/model.ts';
import {defaultSpatial} from '../src/mechanics/spatial.ts';
import {spatialCAD} from '../src/mechanics/spatial-cad.ts';
import {defaultMotion} from '../src/mechanics/motion.ts';
import {motionCAD} from '../src/mechanics/motion-cad.ts';
import {metrics,rotors,rim,readVariants,snapshot} from '../src/mechanics/inspection.ts';
const p=initialProject(),s=snapshot(p);s.components[0].position[0]=12;assert.equal(p.components[0].position[0],0);
assert.throws(()=>readVariants('{}'));assert.throws(()=>readVariants(JSON.stringify(Array(9).fill(p))));assert.throws(()=>readVariants('[{"version":999}]'));
assert.deepEqual(readVariants(JSON.stringify([p])),[p]);assert.equal(metrics(p).unit,':1');
for(const kind of ['internal','bevel','worm']){const spatial=defaultSpatial(kind),project={...p,spatial},before=serializeProject(project),rs=rotors(project,90);assert.equal(rs.length,2);assert.ok(rs.every(r=>rim(r,0,35).every(Number.isFinite)));assert.equal(serializeProject(project),before);const c=spatialCAD(spatial,'housing'),e=spatialCAD(spatial,'exploded',60);assert.notEqual(c.source,e.source);assert.deepEqual(c.parts,e.parts);assert.deepEqual(c.bom,e.bom);}
for(const kind of ['screw','rack']){const motion=defaultMotion(kind),project={...p,motion};assert.equal(metrics(project).unit,'mm/U');assert.equal(metrics(project).ports[1].axis[0],1);const c=motionCAD(motion),e=motionCAD(motion,40);assert.notEqual(c.source,e.source);assert.deepEqual(c.parts,e.parts);}
assert.throws(()=>motionCAD(defaultMotion('rack'),NaN));assert.throws(()=>spatialCAD(defaultSpatial('bevel'),'exploded',-1));
console.log('Workbench model passed: immutable snapshots, validated imports, units, port axes, kinematic transforms and view-only explosions preserve manufacturing geometry.');
