// Triangle meshes for generated parts: STL export and a watertightness check.
import type {V} from '../math.ts';
import {add,scale,cross,norm} from '../math.ts';

export type Mesh={positions:V[];triangles:[number,number,number][]};
export function stl(mesh:Mesh,name='part'){
 const lines=[`solid ${name}`];
 for(const [a,b,c] of mesh.triangles){const p=mesh.positions[a],q=mesh.positions[b],r=mesh.positions[c],n=cross(add(q,scale(p,-1)),add(r,scale(p,-1))),l=norm(n)||1;
  lines.push(` facet normal ${(n[0]/l).toExponential(6)} ${(n[1]/l).toExponential(6)} ${(n[2]/l).toExponential(6)}`,'  outer loop',...[p,q,r].map(v=>`   vertex ${v[0].toFixed(5)} ${v[1].toFixed(5)} ${v[2].toFixed(5)}`),'  endloop',' endfacet');}
 lines.push(`endsolid ${name}`);return lines.join('\n')+'\n';
}
/** Every edge is shared by exactly two triangles with opposite orientation. */
export function watertight(mesh:Mesh){
 const edges=new Map<string,number>();
 for(const [a,b,c] of mesh.triangles)for(const [x,y] of [[a,b],[b,c],[c,a]]){const key=x+'>'+y;edges.set(key,(edges.get(key)??0)+1);}
 for(const [key,count] of edges){const [x,y]=key.split('>');if(count!==1||edges.get(y+'>'+x)!==1)return false;}
 return true;
}
/** Signed volume; positive for outward-oriented closed meshes. */
export function volume(mesh:Mesh){let v=0;for(const [a,b,c] of mesh.triangles){const p=mesh.positions[a],q=mesh.positions[b],r=mesh.positions[c];v+=(p[0]*(q[1]*r[2]-q[2]*r[1])-p[1]*(q[0]*r[2]-q[2]*r[0])+p[2]*(q[0]*r[1]-q[1]*r[0]))/6;}return v;}
