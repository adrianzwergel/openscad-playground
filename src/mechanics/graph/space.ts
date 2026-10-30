import type {Environment,Region} from './contracts.ts';
import {rotate,add,scale,cross,norm} from './frames.ts';
import type {V} from './frames.ts';
export type Hull={center:V;axes:V[];half:V};
const dot=(a:V,b:V)=>a.reduce((s,n,i)=>s+n*b[i],0);
const radius=(b:Hull,u:V)=>b.axes.reduce((s,a,i)=>s+Math.abs(dot(a,u))*b.half[i],0);
export function regionHull(r:Region):Hull{return {center:r.frame.position,axes:[[1,0,0],[0,1,0],[0,0,1]].map(v=>rotate(r.frame.rotation,v as V)),half:r.size.map(n=>n/2) as V};}
/** Largest separating-axis gap; negative means conservative box penetration. */
export function separation(a:Hull,b:Hull){
 const delta=add(b.center,scale(a.center,-1)),directions=[...a.axes,...b.axes,...a.axes.flatMap(x=>b.axes.map(y=>cross(x,y)))];
 return Math.max(...directions.map(v=>{const length=norm(v);if(length<1e-9)return -Infinity;const u=scale(v,1/length);return Math.abs(dot(delta,u))-radius(a,u)-radius(b,u);}));
}
export function containment(b:Hull,region:Hull,margin:number){
 const delta=add(b.center,scale(region.center,-1));
 return region.axes.flatMap((u,i)=>{const c=dot(delta,u),r=radius(b,u);return [Math.max(0,c+r+margin-region.half[i]),Math.max(0,-c+r+margin-region.half[i])];});
}
export function spaceViolations(b:Hull,environment:Environment,extra=0){
 const margin=environment.margin+extra;
 return [...(environment.bounds?containment(b,regionHull(environment.bounds),margin):[]),
  Math.max(0,...environment.obstacles.map(o=>margin-separation(b,regionHull(o))))];
}
export function regionCorners(r:Region):V[]{const h=regionHull(r);return Array.from({length:8},(_,i)=>h.axes.reduce((p,a,k)=>add(p,scale(a,h.half[k]*(i&(1<<k)?1:-1))),h.center));}
export const regionEdges=Array.from({length:8},(_,i)=>[0,1,2].filter(k=>!(i&(1<<k))).map(k=>[i,i|(1<<k)])).flat();
