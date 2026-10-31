// Shared vector and frame helpers for the kinematics core. Re-exports the
// model-independent math from the element graph so both cores agree bit for bit.
import type {V,Q,Frame} from '../graph/frames.ts';
import {norm,scale} from '../graph/frames.ts';
export type {V,Q,Frame};
export {identity,add,scale,norm,cross,multiply,inverseQ,rotate,axisAngle,compose,inverse,axis,rotationError} from '../graph/frames.ts';
export const TAU=2*Math.PI;
export const dot=(a:V,b:V)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export function unit(a:V):V{const l=norm(a);if(l<1e-12)throw Error('Nullvektor hat keine Richtung.');return scale(a,1/l);}
/** Quaternion of a right-handed orthonormal basis given as columns x, y, z. */
export function quaternionFromBasis(x:V,y:V,z:V):Q{
 const m00=x[0],m10=x[1],m20=x[2],m01=y[0],m11=y[1],m21=y[2],m02=z[0],m12=z[1],m22=z[2],trace=m00+m11+m22;
 if(trace>0){const s=Math.sqrt(trace+1)*2;return [(m21-m12)/s,(m02-m20)/s,(m10-m01)/s,s/4];}
 if(m00>m11&&m00>m22){const s=Math.sqrt(1+m00-m11-m22)*2;return [s/4,(m01+m10)/s,(m02+m20)/s,(m21-m12)/s];}
 if(m11>m22){const s=Math.sqrt(1+m11-m00-m22)*2;return [(m01+m10)/s,s/4,(m12+m21)/s,(m02-m20)/s];}
 const s=Math.sqrt(1+m22-m00-m11)*2;return [(m02+m20)/s,(m12+m21)/s,s/4,(m10-m01)/s];
}
export const frameFromBasis=(position:V,x:V,y:V,z:V):Frame=>({position,rotation:quaternionFromBasis(x,y,z)});
/** Deterministic generator for property tests and sampling. */
export function lcg(seed:number){let state=(seed>>>0)||1;return ()=>{state=(1664525*state+1013904223)>>>0;return state/4294967296;};}
