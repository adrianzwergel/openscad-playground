import assert from 'node:assert/strict';
import {inspectionMesh} from '../src/mechanics/graph/inspection-mesh.ts';
import {spaceExample,linearExample} from '../src/mechanics/graph/examples.ts';
import {constructionHulls} from '../src/mechanics/graph/construction.ts';
import {transformMechanism} from '../src/mechanics/graph/model.ts';
import {axisAngle,compose,identity} from '../src/mechanics/graph/frames.ts';
const base={vertices:[{x:1,y:2,z:3}],faces:[],colors:[[.2,.3,.4,1]]},before=structuredClone(base),g=spaceExample();
assert.deepEqual(inspectionMesh(base,g,{bounds:false,obstacles:false,clearances:false}),base);
for(const key of ['bounds','obstacles','clearances']){const m=inspectionMesh(base,g,{bounds:false,obstacles:false,clearances:false,[key]:true}),count=key==='clearances'?constructionHulls(g,false).boxes.length:1;assert.equal(m.vertices.length,1+count*8);assert.equal(m.faces.length,count*12);assert.ok(m.colors.slice(1).every(c=>c[3]>0&&c[3]<1));}
const frame={position:[13,-9,5],rotation:axisAngle([1,2,3],37)},rotated=transformMechanism(g,frame),m=inspectionMesh({vertices:[],faces:[],colors:[]},g,{bounds:true,obstacles:true,clearances:true}),r=inspectionMesh({vertices:[],faces:[],colors:[]},rotated,{bounds:true,obstacles:true,clearances:true});m.vertices.forEach((v,i)=>{const expected=compose(frame,{...identity(),position:[v.x,v.y,v.z]}).position;expected.forEach((n,k)=>assert.ok(Math.abs(n-[r.vertices[i].x,r.vertices[i].y,r.vertices[i].z][k])<1e-7));});
const linear=linearExample('belt-screw'),hulls=constructionHulls(linear,false).boxes;assert.ok(hulls.find(b=>b.owner==='l2').half[2]>50);assert.equal(inspectionMesh(base,linear,{bounds:true,obstacles:true,clearances:true}).faces.length,12*hulls.length);assert.deepEqual(base,before);
console.log('3D layers: separate groups, transparent materials, oriented geometry, full travel and immutable source passed.');
