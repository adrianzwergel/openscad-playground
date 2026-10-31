// Joint kinematics: the transform from side a to side b as a function of the
// joint coordinates, its inverse (coordinates from a relative pose) and the
// closure residual of a loop joint. The joint axis is the local z axis.
import type {V,Frame,Q} from './math.ts';
import {compose,inverse,axisAngle,multiply,rotate,norm,TAU} from './math.ts';
import type {Joint} from './model.ts';
import {curve} from './curves.ts';

const tz=(z:number):Frame=>({position:[0,0,z],rotation:[0,0,0,1]});
const rz=(deg:number):Frame=>({position:[0,0,0],rotation:axisAngle([0,0,1],deg)});
const rx=(deg:number):Frame=>({position:[0,0,0],rotation:axisAngle([1,0,0],deg)});
/** Rotation vector (degrees) to quaternion and back. */
export function expQ(v:V):Q{const a=norm(v);if(a<1e-12)return [v[0]/2*Math.PI/180,v[1]/2*Math.PI/180,v[2]/2*Math.PI/180,1];return axisAngle(v,a);}
export function logQ(q:Q):V{const s=Math.hypot(q[0],q[1],q[2]),w=q[3]<0?-q[3]:q[3],sign=q[3]<0?-1:1;if(s<1e-12)return [0,0,0];const a=2*Math.atan2(s,w)*180/Math.PI;return [q[0]*sign/s*a,q[1]*sign/s*a,q[2]*sign/s*a];}
const angleZ=(q:Q)=>2*Math.atan2(q[2],q[3])*180/Math.PI;

/** Transform from the a-side local frame to the b-side local frame. */
export function jointFrame(j:Joint,q:number[],shift=0):Frame{
 switch(j.kind){
  case 'fixed':return {position:[0,0,0],rotation:[0,0,0,1]};
  case 'revolute':return rz(q[0]);
  case 'prismatic':return tz(q[0]);
  case 'cylindrical':return compose(tz(q[1]),rz(q[0]));
  case 'screw':return compose(tz(j.lead*q[0]/360),rz(q[0]));
  case 'spherical':return {position:[0,0,0],rotation:expQ([q[0],q[1],q[2]])};
  case 'path':{const fn=curve(j.curve),f=fn.frame(q[0]+shift);return j.roll==='free'?compose(f,rx(q[1])):f;}
 }
}
/** Coordinates that bring the joint closest to a relative pose X (a-local to b-local). */
export function projectCoordinates(j:Joint,X:Frame,shift=0):number[]{
 switch(j.kind){
  case 'fixed':return [];
  case 'revolute':return [angleZ(X.rotation)];
  case 'prismatic':return [X.position[2]];
  case 'cylindrical':return [angleZ(X.rotation),X.position[2]];
  case 'screw':{const a=angleZ(X.rotation),turns=Math.round((X.position[2]/j.lead*360-a)/360);return [a+360*turns];}
  case 'spherical':return logQ(X.rotation);
  case 'path':{const fn=curve(j.curve);let best=0,bestD=Infinity;const n=256;for(let i=0;i<=n;i++){const s=fn.length*i/n,p=fn.point(s),d=Math.hypot(p[0]-X.position[0],p[1]-X.position[1],p[2]-X.position[2]);if(d<bestD){bestD=d;best=s;}}
   // Refine by golden section around the best sample.
   let lo=Math.max(0,best-fn.length/n),hi=Math.min(fn.length,best+fn.length/n);const dist=(s:number)=>{const p=fn.point(s);return Math.hypot(p[0]-X.position[0],p[1]-X.position[1],p[2]-X.position[2]);};
   for(let i=0;i<40;i++){const m1=lo+(hi-lo)*.382,m2=lo+(hi-lo)*.618;if(dist(m1)<dist(m2))hi=m2;else lo=m1;}const s=(lo+hi)/2;
   if(j.roll==='free'){const f=fn.frame(s),rel=compose(inverse(f),X);return [s-shift,2*Math.atan2(rel.rotation[0],rel.rotation[3])*180/Math.PI];}return [s-shift];}
 }
}
export const coordinateCount=(j:Joint)=>j.kind==='fixed'?0:j.kind==='spherical'?3:j.kind==='cylindrical'?2:j.kind==='path'?(j.roll==='free'?2:1):1;
/** Closure residual of a joint between world frames A (a-side) and B (b-side) at coordinates q:
 * position error and twice the vector part of the rotation error, in mm and degrees-equivalent. */
export function jointResidual(j:Joint,A:Frame,B:Frame,q:number[],shift=0):number[]{
 const X=compose(inverse(compose(A,jointFrame(j,q,shift))),B);
 if(j.kind==='spherical')return [X.position[0],X.position[1],X.position[2]];
 const r=logQ(X.rotation);
 return [X.position[0],X.position[1],X.position[2],r[0],r[1],r[2]];
}
export const residualCount=(j:Joint)=>j.kind==='spherical'?3:6;
export {multiply,rotate,TAU};
