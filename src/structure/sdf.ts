// Signed distance fields of the structure core: a few exact primitives, a
// smooth union of solids minus sharp holes, and a spatial hash so that a scene
// with hundreds of primitives costs only the handful near a point. Negative is
// inside. Geometry is meshed only at the very end (mesh.ts).
import type {V,Frame} from './vec.ts';
import {sub,dot,norm,applyInverse,scale,add,cellKey} from './vec.ts';

export type Prim=
 |{kind:'sphere';center:V;r:number}
 |{kind:'capsule';a:V;b:V;r:number;rb?:number}
 |{kind:'cylinder';frame:Frame;r:number;z0:number;z1:number}
 |{kind:'box';frame:Frame;half:V;round?:number}
 /** Convex polygon (2D in the frame's xy, counter-clockwise) extruded between z0 and z1. */
 |{kind:'slab';frame:Frame;points:[number,number][];z0:number;z1:number};

export function primDistance(p:V,s:Prim):number{
 switch(s.kind){
  case 'sphere':return norm(sub(p,s.center))-s.r;
  case 'capsule':{
   const ab=sub(s.b,s.a),ap=sub(p,s.a),l2=dot(ab,ab);
   if(s.rb===undefined||Math.abs(s.rb-s.r)<1e-9){const t=l2<1e-12?0:Math.max(0,Math.min(1,dot(ap,ab)/l2));return norm(sub(ap,scale(ab,t)))-s.r;}
   // Round cone: exact distance (Quilez).
   const r1=s.r,r2=s.rb,rr=r1-r2,a2=l2-rr*rr,il2=1/l2,y=dot(ap,ab),z=y-l2,w=sub(scale(ap,l2),scale(ab,y)),x2=dot(w,w),y2=y*y*l2,z2=z*z*l2,k=Math.sign(rr)*rr*rr*x2;
   if(Math.sign(z)*a2*z2>k)return Math.sqrt(x2+z2)*il2-r2;if(Math.sign(y)*a2*y2<k)return Math.sqrt(x2+y2)*il2-r1;return (Math.sqrt(x2*a2*il2)+y*rr)*il2-r1;}
  case 'cylinder':{const q=applyInverse(s.frame,p),mid=(s.z0+s.z1)/2,h=(s.z1-s.z0)/2,dr=Math.hypot(q[0],q[1])-s.r,dz=Math.abs(q[2]-mid)-h;return Math.min(Math.max(dr,dz),0)+Math.hypot(Math.max(dr,0),Math.max(dz,0));}
  case 'slab':{const q=applyInverse(s.frame,p),P=s.points;let d=-Infinity;for(let i=0;i<P.length;i++){const a=P[i],b=P[(i+1)%P.length],ex=b[0]-a[0],ey=b[1]-a[1],l=Math.hypot(ex,ey)||1;d=Math.max(d,((q[0]-a[0])*ey-(q[1]-a[1])*ex)/l);}const dz=Math.abs(q[2]-(s.z0+s.z1)/2)-(s.z1-s.z0)/2;return Math.min(Math.max(d,dz),0)+Math.hypot(Math.max(d,0),Math.max(dz,0));}
  case 'box':{const q=applyInverse(s.frame,p),r=s.round??0,d=[Math.abs(q[0])-s.half[0]+r,Math.abs(q[1])-s.half[1]+r,Math.abs(q[2])-s.half[2]+r];return Math.min(Math.max(d[0],d[1],d[2]),0)+Math.hypot(Math.max(d[0],0),Math.max(d[1],0),Math.max(d[2],0))-r;}
 }
}
/** Axis-aligned bounds of a primitive. */
export function primBounds(s:Prim):{min:V;max:V}{
 const around=(c:V,r:number)=>({min:[c[0]-r,c[1]-r,c[2]-r] as V,max:[c[0]+r,c[1]+r,c[2]+r] as V});
 switch(s.kind){
  case 'sphere':return around(s.center,s.r);
  case 'capsule':{const r=Math.max(s.r,s.rb??s.r);return {min:[0,1,2].map(i=>Math.min(s.a[i],s.b[i])-r) as V,max:[0,1,2].map(i=>Math.max(s.a[i],s.b[i])+r) as V};}
  case 'cylinder':{const c=add(s.frame.position,scale(rotateZ(s.frame),(s.z0+s.z1)/2)),r=Math.hypot(s.r,(s.z1-s.z0)/2);return around(c,r);}
  case 'box':return around(s.frame.position,norm(s.half));
  case 'slab':{const r=Math.max(...s.points.map(([x,y])=>Math.hypot(x,y)))+Math.max(Math.abs(s.z0),Math.abs(s.z1));return around(s.frame.position,r);}
 }
}
const rotateZ=(f:Frame):V=>{const [x,y,z,w]=f.rotation;return [2*(x*z+w*y),2*(y*z-w*x),1-2*(x*x+y*y)];};
/** Polynomial smooth minimum: blends within `k`, exact far apart. */
export const smin=(a:number,b:number,k:number)=>{if(k<=0)return Math.min(a,b);const h=Math.max(k-Math.abs(a-b),0)/k;return Math.min(a,b)-h*h*k/4;};

/** Primitives bucketed in a uniform hash grid; queries see only nearby ones. */
export class PrimIndex{
 readonly prims:Prim[]=[];private cells=new Map<number,number[]>();readonly cell:number;readonly reach:number;
 private lo:V=[Infinity,Infinity,Infinity];private hi:V=[-Infinity,-Infinity,-Infinity];
 constructor(cell:number,reach:number){this.cell=cell;this.reach=reach;}
 add(s:Prim){const i=this.prims.length;this.prims.push(s);const b=primBounds(s);for(let k=0;k<3;k++){this.lo[k]=Math.min(this.lo[k],b.min[k]);this.hi[k]=Math.max(this.hi[k],b.max[k]);}const lo=b.min.map(n=>Math.floor((n-this.reach)/this.cell)),hi=b.max.map(n=>Math.floor((n+this.reach)/this.cell));
  for(let x=lo[0];x<=hi[0];x++)for(let y=lo[1];y<=hi[1];y++)for(let z=lo[2];z<=hi[2];z++){const k=cellKey(x,y,z),l=this.cells.get(k);if(l)l.push(i);else this.cells.set(k,[i]);}}
 near(p:V){return this.cells.get(cellKey(Math.floor(p[0]/this.cell),Math.floor(p[1]/this.cell),Math.floor(p[2]/this.cell)));}
 /** Distance to the nearest primitive; `reach` when none is within reach. */
 /** Distance to the box around all primitives (a lower bound of the true distance). */
 outside(p:V){if(!this.prims.length)return Infinity;let s=0;for(let k=0;k<3;k++){const d=Math.max(this.lo[k]-p[k],0,p[k]-this.hi[k]);s+=d*d;}return Math.sqrt(s);}
 distance(p:V){const far=this.outside(p);if(far>this.reach)return far;const l=this.near(p);if(!l)return this.reach;let d=this.reach;for(const i of l)d=Math.min(d,primDistance(p,this.prims[i]));return d;}
 get size(){return this.prims.length;}
}

/** Solids blended smoothly, holes cut sharply. */
export class Scene{
 readonly solids:PrimIndex;readonly holes:PrimIndex;readonly hard:PrimIndex;readonly pieces:PrimIndex;readonly blend:number;private group:number[]=[];private groups=0;
 constructor(blend:number,cell=10){this.blend=blend;this.hard=new PrimIndex(cell,cell);this.solids=new PrimIndex(cell,cell+blend);this.holes=new PrimIndex(cell,cell);this.pieces=new PrimIndex(cell,cell+blend);}
 /** Round cones end to end (a tapered strut): joined sharply among themselves (a blend would bulge at every joint),
  * blended with everything else. Only the pieces near a point are evaluated. */
 chain(points:V[],radii:number[]){const g=this.groups++;for(let i=0;i+1<points.length;i++){this.pieces.add({kind:'capsule',a:points[i],b:points[i+1],r:radii[i],rb:radii[i+1]});this.group.push(g);}return this;}
 solid(s:Prim){this.solids.add(s);return this;}
 /** Joined without blending (features that must keep their exact outline). */
 hardSolid(s:Prim){this.hard.add(s);return this;}
 hole(s:Prim){this.holes.add(s);return this;}
 distance(p:V){
  const l=this.solids.near(p);let d=this.solids.reach;
  if(l)for(const i of l)d=smin(d,primDistance(p,this.solids.prims[i]),this.blend);
  const c=this.pieces.near(p);if(c){const best=new Map<number,number>();for(const i of c){const g=this.group[i],v=primDistance(p,this.pieces.prims[i]);if(v<(best.get(g)??Infinity))best.set(g,v);}for(const v of best.values())d=smin(d,v,this.blend);}
  const k=this.hard.near(p);if(k)for(const i of k)d=Math.min(d,primDistance(p,this.hard.prims[i]));
  const h=this.holes.near(p);if(h)for(const i of h)d=Math.max(d,-primDistance(p,this.holes.prims[i]));
  return d;
 }
 bounds(){let min:V=[Infinity,Infinity,Infinity],max:V=[-Infinity,-Infinity,-Infinity];for(const s of [...this.solids.prims,...this.hard.prims,...this.pieces.prims]){const b=primBounds(s);min=min.map((n,i)=>Math.min(n,b.min[i])) as V;max=max.map((n,i)=>Math.max(n,b.max[i])) as V;}return {min,max};}
}
