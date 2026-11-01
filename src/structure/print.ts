// Print orientation (LAGER-UND-STRUKTUR.md, B.3 step 5): the build direction
// among axes and diagonals that leaves the least overhanging surface, weighed
// against the flat area standing on the bed (a part on an edge is not stable),
// and the mesh turned so that it lies on the bed (z = 0) in that direction.
import type {V,Q} from './vec.ts';
import {dot,cross,sub,norm,rotate,conjugate,toward} from './vec.ts';
import type {Mesh} from './mesh.ts';

/** `up`: build direction in the part's frame; `overhang`: surface facing down steeper than `angle` from vertical
 * (needs support), `contact`: flat surface on the bed, `area`: whole surface (mm²); `height`: build height (mm). */
export type PrintPlan={up:V;label:string;overhang:number;contact:number;area:number;height:number;angle:number};

const candidates=():V[]=>{const out:V[]=[];for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)if(x||y||z){const l=Math.hypot(x,y,z);out.push([x/l,y/l,z/l]);}return out;};
const names:[V,string][]=[[[0,0,1],'+z'],[[0,0,-1],'−z'],[[1,0,0],'+x'],[[-1,0,0],'−x'],[[0,1,0],'+y'],[[0,-1,0],'−y']];
const labelOf=(u:V)=>names.find(([v])=>dot(v,u)>.999)?.[1]??`(${u.map(c=>c.toFixed(2)).join(', ')})`;

/** Overhang (less half the bed contact) decides; within 1 % of the surface the lower part wins. */
export const printScore=(x:PrintPlan)=>x.overhang-.5*x.contact;
/** How the part prints with `up` as build direction (`directions`: the candidates, default axes and diagonals). */
export function printPlans(m:Mesh,directions:V[]=candidates(),angle=45):PrintPlan[]{
 const n=m.indices.length/3,tri=new Float64Array(n*4),cos=Math.cos(angle*Math.PI/180)+1e-3,flat=Math.cos(5*Math.PI/180);let area=0;
 // Unit normal and area per triangle once. Faces at exactly the limit (surface nets make many 45° faces) print: a
 // small margin keeps rounding from flipping them.
 for(let t=0;t<n;t++){const p=[0,1,2].map(k=>{const i=m.indices[t*3+k]*3;return [m.vertices[i],m.vertices[i+1],m.vertices[i+2]] as V;}),c=cross(sub(p[1],p[0]),sub(p[2],p[0])),a=norm(c)/2;
  area+=a;tri.set(a>0?[c[0]/(2*a),c[1]/(2*a),c[2]/(2*a),a]:[0,0,0,0],t*4);}
 return directions.map(u=>{let lo=Infinity,hi=-Infinity;for(let i=0;i<m.vertices.length;i+=3){const h=m.vertices[i]*u[0]+m.vertices[i+1]*u[1]+m.vertices[i+2]*u[2];if(h<lo)lo=h;if(h>hi)hi=h;}
  let over=0,contact=0;
  for(let t=0;t<n;t++){const d=-(tri[t*4]*u[0]+tri[t*4+1]*u[1]+tri[t*4+2]*u[2]);if(d<=cos)continue;
   // Faces on the bed need no support; flat ones there hold the part.
   const i=m.indices[t*3]*3,h=m.vertices[i]*u[0]+m.vertices[i+1]*u[1]+m.vertices[i+2]*u[2];if(h-lo<.5){if(d>flat)contact+=tri[t*4+3];continue;}over+=tri[t*4+3];}
  return {up:u,label:labelOf(u),overhang:over,contact,area,height:hi-lo,angle};});
}
export function printOrientation(m:Mesh,angle=45):PrintPlan{
 let best:PrintPlan|undefined;
 for(const plan of printPlans(m,candidates(),angle)){const tol=.01*plan.area;if(!best||printScore(plan)<printScore(best)-tol||Math.abs(printScore(plan)-printScore(best))<=tol&&plan.height<best.height)best=plan;}
 return best!;
}
/** The mesh turned so that `up` points along +z, lying on z = 0, centred in x and y. */
export function orientForPrint(m:Mesh,up:V):Mesh{
 const q:Q=conjugate(toward(up)),v=new Float32Array(m.vertices.length);let lo:V=[Infinity,Infinity,Infinity],hi:V=[-Infinity,-Infinity,-Infinity];
 for(let i=0;i<v.length;i+=3){const p=rotate(q,[m.vertices[i],m.vertices[i+1],m.vertices[i+2]]);for(let k=0;k<3;k++){v[i+k]=p[k];lo[k]=Math.min(lo[k],p[k]);hi[k]=Math.max(hi[k],p[k]);}}
 const shift:V=[-(lo[0]+hi[0])/2,-(lo[1]+hi[1])/2,-lo[2]];for(let i=0;i<v.length;i+=3)for(let k=0;k<3;k++)v[i+k]+=shift[k];
 return {vertices:v,indices:m.indices};
}
