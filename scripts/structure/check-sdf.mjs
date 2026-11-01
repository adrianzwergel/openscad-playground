// Structure core B1: primitives, smooth union, holes and surface nets give closed meshes with correct volume.
import assert from 'node:assert/strict';
import {Scene,primDistance} from '../../src/structure/sdf.ts';
import {surfaceNets,inspect} from '../../src/structure/mesh.ts';
import {apply,axisAngle,compose,inverse,rotate} from '../../src/structure/vec.ts';
const near=(a,b,t,w)=>assert.ok(Math.abs(a-b)<=t,`${w}: ${a} vs ${b}`);
// Frames.
const f={position:[1,2,3],rotation:axisAngle([0,0,1],90)};near(apply(f,[1,0,0])[1],3,1e-12,'rotate');near(apply(compose(f,inverse(f)),[5,6,7])[2],7,1e-12,'inverse');
// Round cone equals a capsule when radii match.
const p=[3,4,10];near(primDistance(p,{kind:'capsule',a:[0,0,0],b:[0,0,20],r:2,rb:2}),primDistance(p,{kind:'capsule',a:[0,0,0],b:[0,0,20],r:2}),1e-9,'cone');
near(primDistance([0,0,25],{kind:'capsule',a:[0,0,0],b:[0,0,20],r:4,rb:2}),3,1e-9,'cone tip');
// Sphere: volume 4/3 π r³.
const s=new Scene(0).solid({kind:'sphere',center:[0,0,0],r:10});let m=surfaceNets(p=>s.distance(p),[-11,-11,-11],[11,11,11],.5);let r=inspect(m);
assert.ok(r.closed,'sphere closed');assert.equal(r.components,1);near(r.volume,4/3*Math.PI*1000,4/3*Math.PI*1000*.01,'sphere volume');
// Plate with a hole: volume minus the hole.
const plate=new Scene(0).solid({kind:'box',frame:{position:[0,0,0],rotation:[0,0,0,1]},half:[20,20,3]}).hole({kind:'cylinder',frame:{position:[0,0,0],rotation:[0,0,0,1]},r:5,z0:-5,z1:5});
m=surfaceNets(p=>plate.distance(p),[-21,-21,-4],[21,21,4],.4);r=inspect(m);assert.ok(r.closed,'plate closed');near(r.volume,40*40*6-Math.PI*25*6,40*40*6*.015,'plate volume');
// Two capsules blended: one part.
const y=new Scene(3).solid({kind:'capsule',a:[0,0,0],b:[40,0,0],r:3}).solid({kind:'capsule',a:[40,0,0],b:[40,40,10],r:2,rb:4});
m=surfaceNets(p=>y.distance(p),...Object.values(y.bounds()),.5);r=inspect(m);assert.ok(r.closed&&r.components===1,'blend');
console.log('Struktur-Kern B1: Primitive, Verschnitt, Löcher, geschlossene Netze, Volumen auf 1–1,5 % genau.',r.triangles,'Dreiecke');
