import type {Environment,Region} from './contracts.ts';
import {rotate,add,scale,cross,norm} from './frames.ts';
import type {V} from './frames.ts';
export type Hull={center:V;axes:V[];half:V};
const dot=(a:V,b:V)=>a.reduce((s,n,i)=>s+n*b[i],0);
const radius=(b:Hull,u:V)=>b.axes.reduce((s,a,i)=>s+Math.abs(dot(a,u))*b.half[i],0);
export function regionHull(r:Region):Hull{return {center:r.frame.position,axes:[[1,0,0],[0,1,0],[0,0,1]].map(v=>rotate(r.frame.rotation,v as V)),half:r.size.map(n=>n/2) as V};}
/** Largest separating-axis gap; negative means conservative box penetration.
 * Stops once a gap of at least `enough` is proven: callers that only need
 * max(0, limit - gap) get identical results without testing all 15 axes. */
export function separation(a:Hull,b:Hull,enough=Infinity){
 const d0=b.center[0]-a.center[0],d1=b.center[1]-a.center[1],d2=b.center[2]-a.center[2];
 let best=-Infinity;
 const test=(v0:number,v1:number,v2:number)=>{
  const length=Math.hypot(v0,v1,v2);if(length<1e-9)return false;const s=1/length,u0=v0*s,u1=v1*s,u2=v2*s;
  let ra=0,rb=0;for(let i=0;i<3;i++){const x=a.axes[i],y=b.axes[i];ra+=Math.abs(x[0]*u0+x[1]*u1+x[2]*u2)*a.half[i];rb+=Math.abs(y[0]*u0+y[1]*u1+y[2]*u2)*b.half[i];}
  const gap=Math.abs(d0*u0+d1*u1+d2*u2)-ra-rb;if(gap>best)best=gap;return best>=enough;
 };
 for(const x of a.axes)if(test(x[0],x[1],x[2]))return best;
 for(const y of b.axes)if(test(y[0],y[1],y[2]))return best;
 for(const x of a.axes)for(const y of b.axes)if(test(x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]))return best;
 return best;
}
export function containment(b:Hull,region:Hull,margin:number){
 const delta=add(b.center,scale(region.center,-1));
 return region.axes.flatMap((u,i)=>{const c=dot(delta,u),r=radius(b,u);return [Math.max(0,c+r+margin-region.half[i]),Math.max(0,-c+r+margin-region.half[i])];});
}
export function spaceViolations(b:Hull,environment:Environment,extra=0){
 const margin=environment.margin+extra;
 return [...(environment.bounds?containment(b,regionHull(environment.bounds),margin):[]),
  ...environment.obstacles.map(o=>Math.max(0,margin-separation(b,regionHull(o),margin)))];
}
export function regionCorners(r:Region):V[]{const h=regionHull(r);return Array.from({length:8},(_,i)=>h.axes.reduce((p,a,k)=>add(p,scale(a,h.half[k]*(i&(1<<k)?1:-1))),h.center));}
export const regionEdges=Array.from({length:8},(_,i)=>[0,1,2].filter(k=>!(i&(1<<k))).map(k=>[i,i|(1<<k)])).flat();
