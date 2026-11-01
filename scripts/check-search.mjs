import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initialProject,resolveProject,generateScad,parseProject,serializeProject} from '../src/mechanics/model.ts';
import {placeCandidates,intersections} from '../src/mechanics/search.ts';
const p=initialProject();p.targetRatio=4;p.search.maxError=0;p.axes.output=[100,0,87];
const compound={kind:'compound',ids:[0,2,0,2]};
const found=placeCandidates(p,[compound]);
assert.equal(found.solutions.length,2);
for(const s of found.solutions){
 assert.deepEqual(s.project.axes,p.axes);assert.equal(s.ratio,4);assert.equal(s.shafts,3);assert.equal(s.layers,2);
 assert.equal(s.project.components[3].position[0],100);assert.equal(s.project.components[3].position[2],15);
 assert.equal(resolveProject(s.project).valid,true);assert.match(generateScad(s.project),/cylinder/);
 assert.deepEqual(parseProject(serializeProject(s.project)),s.project);
}
const one=structuredClone(p);one.search.maxLayers=1;assert.equal(placeCandidates(one,[compound]).valid,0);
const narrow=structuredClone(p);narrow.search.layerSpacing=10;assert.equal(placeCandidates(narrow,[compound]).valid,0);
const direction=structuredClone(p);direction.search.direction='opposite';assert.equal(placeCandidates(direction,[compound]).valid,0);
const far=structuredClone(p);far.axes.output[0]=500;assert.equal(placeCandidates(far,[compound]).valid,0);
const close=structuredClone(p);close.axes.output[0]=10;assert.equal(placeCandidates(close,[compound]).valid,0);
const idler=structuredClone(p);idler.targetRatio=2;
const middle=placeCandidates(idler,[{kind:'idler',ids:[0,1,2]}]);assert.equal(middle.valid,2);
for(const s of middle.solutions){
 const r=resolveProject(s.project);assert.equal(r.stages,2);assert.equal(r.layers,1);
 // All mesh phases agree modulo a tooth pitch, including the second mesh of an idler.
 for(let i=0;i<r.components.length-1;i++){
  const a=r.components[i],b=r.components[i+1];const angle=Math.atan2(b.position[1]-a.position[1],b.position[0]-a.position[0])*180/Math.PI;
  const phase=(b.spin-angle-90)*b.gear.teeth+(a.spin-angle+90)*a.gear.teeth+180;
  assert.ok(Math.abs(phase)<1e-7);
 }
}
const chain=structuredClone(p);chain.targetRatio=1;chain.axes.output[0]=120;
assert.ok(placeCandidates(chain,[{kind:'two_idlers',ids:[0,0,0,0]}]).valid>0);
const direct=initialProject();direct.targetRatio=2;direct.search.maxError=0;
assert.equal(placeCandidates(direct,[{kind:'direct',ids:[0,2]}]).valid,1);
direct.axes.output[0]=61;assert.equal(placeCandidates(direct,[{kind:'direct',ids:[0,2]}]).valid,0);
assert.equal(intersections([0,0,0],[10,0,0],5,5).length,1);
assert.equal(intersections([0,0,0],[0,0,0],5,5).length,0);
const legacy=JSON.parse(readFileSync('examples/mechanics-pair.json','utf8'));
assert.equal(parseProject(JSON.stringify(legacy)).version,6);
console.log('Spatial model passed: fixed axes, exact/tangent/mirrored placement, phases, 4 topologies, ratios, direction, layers, collisions, unreachable axes, v1 migration, roundtrip.');
