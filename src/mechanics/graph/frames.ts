export type V=[number,number,number];
export type Q=[number,number,number,number];
export type Frame={position:V;rotation:Q};
export const identity=():Frame=>({position:[0,0,0],rotation:[0,0,0,1]});
export const add=(a:V,b:V):V=>a.map((n,i)=>n+b[i]) as V;
export const scale=(a:V,s:number):V=>a.map(n=>n*s) as V;
export const norm=(a:V)=>Math.hypot(...a);
export const cross=(a:V,b:V):V=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const inverseQ=(q:Q):Q=>[-q[0],-q[1],-q[2],q[3]];
export function multiply(a:Q,b:Q):Q{return [a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];}
export function rotate(q:Q,v:V):V{const u:V=[q[0],q[1],q[2]],t=scale(cross(u,v),2);return add(v,add(scale(t,q[3]),cross(u,t)));}
export function axisAngle(axis:V,degrees:number):Q{const l=norm(axis);if(l<1e-12)throw Error('Rotationsachse fehlt.');const h=degrees*Math.PI/360,s=Math.sin(h)/l;return [axis[0]*s,axis[1]*s,axis[2]*s,Math.cos(h)];}
export const compose=(a:Frame,b:Frame):Frame=>({position:add(a.position,rotate(a.rotation,b.position)),rotation:multiply(a.rotation,b.rotation)});
export const inverse=(a:Frame):Frame=>({position:rotate(inverseQ(a.rotation),scale(a.position,-1)),rotation:inverseQ(a.rotation)});
export const axis=(f:Frame)=>rotate(f.rotation,[0,0,1]);
export const rotationError=(a:Q,b:Q)=>2*Math.acos(Math.min(1,Math.abs(a.reduce((s,n,i)=>s+n*b[i],0))))*180/Math.PI;
export function matrix(f:Frame){const x=rotate(f.rotation,[1,0,0]),y=rotate(f.rotation,[0,1,0]),z=axis(f);return [[x[0],y[0],z[0],f.position[0]],[x[1],y[1],z[1],f.position[1]],[x[2],y[2],z[2],f.position[2]],[0,0,0,1]];}
