// Joint frames and coordinate projection are inverse to each other; residuals vanish at the projected coordinates.
import assert from 'node:assert/strict';
import {jointFrame,projectCoordinates,jointResidual,coordinateCount} from '../../src/mechanics/kinematics/joints.ts';
import {compose,axisAngle,lcg,norm} from '../../src/mechanics/kinematics/math.ts';

const random=lcg(11);
const path={kind:'path',points:[[0,0,0],[0,300,0],[200,300,0]],closed:false,cornerRadius:80,axis:[0,0,1]};
const joints=[{kind:'fixed'},{kind:'revolute'},{kind:'prismatic'},{kind:'cylindrical'},{kind:'screw',lead:8},{kind:'spherical'},{kind:'path',curve:path,roll:'locked'},{kind:'path',curve:path,roll:'free'}];
for(const j of joints)for(let n=0;n<30;n++){
 const q=Array.from({length:coordinateCount(j)},(_,i)=>j.kind==='path'&&i===0?random()*400:j.kind==='spherical'?(random()-.5)*300:(random()-.5)*360);
 if(j.kind==='screw')q[0]=(random()-.5)*2000;
 const X=jointFrame(j,q),back=projectCoordinates(j,X);
 const F=jointFrame(j,back),err=norm(F.position.map((v,i)=>v-X.position[i]))+Math.abs(Math.abs(F.rotation.reduce((s,v,i)=>s+v*X.rotation[i],0))-1);
 assert.ok(err<1e-6,`${j.kind}: round trip error ${err} for q=${q}`);
 const A={position:[random()*50,random()*50,random()*50],rotation:axisAngle([random()-.5,random()-.5,random()-.5],random()*360)},B=compose(A,X);
 const r=jointResidual(j,A,B,back);assert.ok(norm(r.slice(0,3))<1e-6&&r.slice(3).every(v=>Math.abs(v)<1e-5),`${j.kind}: residual ${r}`);
}
// A displaced b-side shows up as position residual; a twisted one as rotation residual.
{const A={position:[0,0,0],rotation:[0,0,0,1]};const r=jointResidual({kind:'revolute'},A,{position:[1,2,3],rotation:axisAngle([0,0,1],40)},[40]);assert.ok(Math.abs(norm(r.slice(0,3))-Math.sqrt(14))<1e-9,'position residual magnitude');
 const t=jointResidual({kind:'revolute'},A,{position:[0,0,0],rotation:axisAngle([1,0,0],10)},[0]);assert.ok(Math.abs(t[3]-10)<1e-9&&Math.abs(t[4])<1e-9,'rotation residual in degrees');}
console.log('Kinematics joints: frame/projection round trips and residuals for all joint kinds passed.');
