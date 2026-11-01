// Axis detection from picked geometry: tilted cylinders, bores in a block, box edges, flat faces.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {fitCylinder,fitEdge,fitTwoPoints} from '../../src/mechanics/kinematics/axis-fit.ts';

const soup=g=>{const n=g.index?g.toNonIndexed():g;return n.getAttribute('position').array;};
const close=(a,b,tol,what)=>assert.ok(Math.abs(a-b)<=tol,`${what}: ${a} vs ${b}`);
const parallel=(a,b,what)=>close(Math.abs(a[0]*b[0]+a[1]*b[1]+a[2]*b[2]),1,1e-3,what);
const distanceToLine=(p,point,dir)=>{const d=[p[0]-point[0],p[1]-point[1],p[2]-point[2]],t=d[0]*dir[0]+d[1]*dir[1]+d[2]*dir[2];return Math.hypot(d[0]-t*dir[0],d[1]-t*dir[1],d[2]-t*dir[2]);};
// Tilted shaft: radius 12, axis through (30,-20,5) along a rotated direction.
{const g=new THREE.CylinderGeometry(12,12,80,64,4);const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(.7,-.3,1.1)),m=new THREE.Matrix4().compose(new THREE.Vector3(30,-20,5),q,new THREE.Vector3(1,1,1));g.applyMatrix4(m);
 const axis=new THREE.Vector3(0,1,0).applyQuaternion(q).toArray(),side=new THREE.Vector3(12,10,0).applyMatrix4(m).toArray();
 const f=fitCylinder(soup(g),side);assert.equal(f.kind,'cylinder');parallel(f.direction,axis,'shaft axis');close(f.radius,12,.05,'shaft radius');close(distanceToLine([30,-20,5],f.point,f.direction),0,.05,'axis passes the centre');}
// A bore in a block: model as a box plus an inner cylinder (inverted normals do not matter for the axis).
{const box=new THREE.BoxGeometry(100,60,40),bore=new THREE.CylinderGeometry(8,8,40,48,2);bore.rotateX(Math.PI/2);bore.translate(20,5,0);
 const positions=new Float32Array([...soup(box),...soup(bore)]),f=fitCylinder(positions,[28,5,3]);parallel(f.direction,[0,0,1],'bore axis');close(f.radius,8,.05,'bore radius');close(distanceToLine([20,5,0],f.point,f.direction),0,.05,'bore centre');}
// Flat face: reports a plane with its normal.
{const f=fitCylinder(soup(new THREE.BoxGeometry(100,60,40)),[10,30,0]);assert.equal(f.kind,'plane');parallel(f.direction,[0,1,0],'face normal');}
// Box edges: the edge nearest to the click.
{const g=new THREE.BoxGeometry(200,30,20);g.rotateZ(.4);const p=soup(g),edge=fitEdge(p,new THREE.Vector3(10,15,10).applyAxisAngle(new THREE.Vector3(0,0,1),.4).toArray());
 parallel(edge.direction,[Math.cos(.4),Math.sin(.4),0],'long edge');}
{const f=fitTwoPoints([0,0,0],[0,0,5]);parallel(f.direction,[0,0,1],'two points');assert.throws(()=>fitTwoPoints([1,1,1],[1,1,1]));}
console.log('Kinematics axis fit: tilted shaft, bore in a block, flat face, box edge and two points detected.');
