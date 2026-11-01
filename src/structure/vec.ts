// Vector and frame helpers of the structure core. Self-contained on purpose:
// the core knows nothing about mechanisms (LAGER-UND-STRUKTUR.md, Teil B).
export type V=[number,number,number];
export type Q=[number,number,number,number];
export type Frame={position:V;rotation:Q};

export const add=(a:V,b:V):V=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
export const sub=(a:V,b:V):V=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
export const scale=(a:V,s:number):V=>[a[0]*s,a[1]*s,a[2]*s];
export const dot=(a:V,b:V)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export const cross=(a:V,b:V):V=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const norm=(a:V)=>Math.hypot(a[0],a[1],a[2]);
export const unit=(a:V):V=>{const l=norm(a);return l<1e-12?[0,0,1]:scale(a,1/l);};
export const identity=():Frame=>({position:[0,0,0],rotation:[0,0,0,1]});
export function rotate(q:Q,v:V):V{
 const [x,y,z,w]=q,ix=w*v[0]+y*v[2]-z*v[1],iy=w*v[1]+z*v[0]-x*v[2],iz=w*v[2]+x*v[1]-y*v[0],iw=-x*v[0]-y*v[1]-z*v[2];
 return [ix*w+iw*-x+iy*-z-iz*-y,iy*w+iw*-y+iz*-x-ix*-z,iz*w+iw*-z+ix*-y-iy*-x];
}
export const multiply=(a:Q,b:Q):Q=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
export const conjugate=(q:Q):Q=>[-q[0],-q[1],-q[2],q[3]];
export const compose=(a:Frame,b:Frame):Frame=>({position:add(a.position,rotate(a.rotation,b.position)),rotation:multiply(a.rotation,b.rotation)});
export const inverse=(f:Frame):Frame=>{const r=conjugate(f.rotation);return {position:scale(rotate(r,f.position),-1),rotation:r};};
export const apply=(f:Frame,p:V):V=>add(f.position,rotate(f.rotation,p));
export const applyInverse=(f:Frame,p:V):V=>rotate(conjugate(f.rotation),sub(p,f.position));
export const axisOf=(f:Frame):V=>rotate(f.rotation,[0,0,1]);
export function axisAngle(axis:V,degrees:number):Q{const a=unit(axis),h=degrees*Math.PI/360,s=Math.sin(h);return [a[0]*s,a[1]*s,a[2]*s,Math.cos(h)];}
/** Quaternion turning +z onto `v`. */
export function toward(v:V):Q{const z:V=[0,0,1],c=cross(z,v),s=norm(c),d=v[2]/norm(v);if(s<1e-9)return d>0?[0,0,0,1]:[1,0,0,0];return axisAngle(scale(c,1/s),Math.atan2(s/norm(v),d)*180/Math.PI);}
/** Two unit vectors perpendicular to `z` (and to each other). */
export function basis(z:V):[V,V]{const a=unit(z),h:V=Math.abs(a[0])<.9?[1,0,0]:[0,1,0],x=unit(cross(h,a));return [x,cross(a,x)];}
export function lcg(seed:number){let s=(seed>>>0)||1;return ()=>{s=(1664525*s+1013904223)>>>0;return s/4294967296;};}
