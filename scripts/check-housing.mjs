import assert from 'node:assert/strict';
import fs from 'node:fs';
import {initialProject,parseProject,serializeProject} from '../src/mechanics/model.ts';
import {resolveHousing,printableParts,housingScad,assemblyInstructions} from '../src/mechanics/housing.ts';
for(const p of [initialProject(),parseProject(fs.readFileSync('examples/mechanics-compound.json','utf8'))]){
 const a=resolveHousing(p);assert.equal(a.valid,true);
 assert.equal(a.shafts.length,p.connections.filter(c=>c.kind==='external-spur-mesh').length+1);
 assert.equal(a.bom[0].quantity,a.shafts.length*2);
 for(const s of a.shafts){
  assert.ok(s.low>=a.lower+a.clearance-1e-9);assert.ok(s.high<=a.upper-a.clearance+1e-9);
  assert.ok(Math.abs(s.lowerSleeve+s.high-s.low+s.upperSleeve+a.h.endplay-a.gap)<1e-9);
  assert.ok(s.shaftStart<a.lower-a.h.plateThickness);assert.ok(s.shaftStart+s.shaftLength>a.upper+a.h.plateThickness);
 }
 const parts=printableParts(p);assert.equal(parts.length,3+a.shafts.length);assert.equal(parts.find(p=>p.id==='standoff').quantity,4);
 assert.match(parts.find(p=>p.id==='plate-top').source,/mirror\(\[0,1,0\]\)/);
 assert.match(parts.find(p=>p.id==='gear-1').source,/d=2.5/);
 assert.notEqual(housingScad(p),housingScad(p,true));assert.match(assemblyInstructions(p),/Gesamtspiel/);
 const changed={...p,housing:{...a.h,bearingFit:0.25,clearance:4}};
 assert.deepEqual(parseProject(serializeProject(changed)),changed);
 assert.ok(resolveHousing(changed).gap>a.gap);
 const invalid={...p,housing:{...a.h,plateThickness:2}};assert.throws(()=>parseProject(JSON.stringify(invalid)));
}
// Stage C can admit narrow cross-layer shaft corridors that D must reject for its wider hubs.
const tight=initialProject();tight.housing={plateThickness:6,clearance:20,bearingFit:0.15,endplay:0.3};
assert.equal(resolveHousing(tight).valid,false);assert.throws(()=>printableParts(tight));assert.throws(()=>housingScad(tight));
// Translation invariance and disconnected part names independent of user-controlled IDs.
const p=initialProject(),a=resolveHousing(p);for(const c of p.components)c.position=c.position.map((n,i)=>n+[19,-33,12][i]);
p.axes.input=[19,-33,12];p.axes.output=[79,-33,12];const shifted=resolveHousing(p);
assert.equal(shifted.valid,true);assert.equal(shifted.gap,a.gap);assert.equal(shifted.width,a.width);
console.log('Housing tests passed: paired bearings, sleeve stack/endplay, plate separation, hardware BOM, part generation, validation, blocked hub collisions, migration and translation.');
