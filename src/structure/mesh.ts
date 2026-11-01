// Meshing of distance fields: naive surface nets on a sparse grid. Only blocks
// whose centre lies near the surface are sampled, so a 300 mm part at 0.7 mm
// costs the surface, not the volume. The result is a closed, indexed mesh.
import type {V} from './vec.ts';
import {sub,cross,dot} from './vec.ts';

export type Mesh={vertices:Float32Array;indices:Uint32Array};

/** Isosurface d = 0 of `f` inside [min, max] with cell size `h`. */
/** `activity`: a 1-Lipschitz field whose inside contains the surface of `f` (e.g. `f` before clipping). */
export function surfaceNets(f:(p:V)=>number,min:V,max:V,h:number,block=8,activity:(p:V)=>number=f):Mesh{
 const o:V=[min[0]-2*h,min[1]-2*h,min[2]-2*h],n=[0,1,2].map(i=>Math.ceil((max[i]-min[i])/h)+4),nb=n.map(x=>Math.ceil(x/block));
 const key=(i:number,j:number,k:number)=>i+n[0]*(j+n[1]*k);
 const values=new Map<number,number>(),point=(i:number,j:number,k:number):V=>[o[0]+i*h,o[1]+j*h,o[2]+k*h];
 const value=(i:number,j:number,k:number)=>{const q=key(i,j,k);let v=values.get(q);if(v===undefined){v=(i<=0||j<=0||k<=0||i>=n[0]||j>=n[1]||k>=n[2])?1:f(point(i,j,k));values.set(q,v);}return v;};
 // Active blocks: centre within reach of the surface (the field is 1-Lipschitz).
 const reach=block*h*Math.sqrt(3)/2+2*h,cells:number[][]=[];
 for(let bi=0;bi<nb[0];bi++)for(let bj=0;bj<nb[1];bj++)for(let bk=0;bk<nb[2];bk++){
  const c=point((bi+.5)*block,(bj+.5)*block,(bk+.5)*block),a=activity(c);if(a>reach||activity!==f&&a<-reach&&f(c)<-reach)continue;
  for(let i=bi*block;i<Math.min(n[0],(bi+1)*block);i++)for(let j=bj*block;j<Math.min(n[1],(bj+1)*block);j++)for(let k=bk*block;k<Math.min(n[2],(bk+1)*block);k++)cells.push([i,j,k]);
 }
 // One vertex per cell with a sign change: the mean of its edge crossings.
 const vertexOf=new Map<number,number>(),verts:number[]=[];
 const corners=[[0,0,0],[1,0,0],[0,1,0],[1,1,0],[0,0,1],[1,0,1],[0,1,1],[1,1,1]],edges=[[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]];
 for(const [i,j,k] of cells){
  const v=corners.map(([a,b,c])=>value(i+a,j+b,k+c));let inside=0;for(const x of v)if(x<0)inside++;if(inside===0||inside===8)continue;
  let sx=0,sy=0,sz=0,count=0;
  for(const [a,b] of edges){const va=v[a],vb=v[b];if((va<0)===(vb<0))continue;const t=va/(va-vb),ca=corners[a],cb=corners[b];sx+=ca[0]+t*(cb[0]-ca[0]);sy+=ca[1]+t*(cb[1]-ca[1]);sz+=ca[2]+t*(cb[2]-ca[2]);count++;}
  vertexOf.set(key(i,j,k),verts.length/3);verts.push(o[0]+(i+sx/count)*h,o[1]+(j+sy/count)*h,o[2]+(k+sz/count)*h);
 }
 // A quad for every grid edge with a sign change, between the four cells around it.
 const tris:number[]=[];
 for(const [i,j,k] of cells){
  if(!vertexOf.has(key(i,j,k)))continue;const v0=value(i,j,k);
  for(let axis=0;axis<3;axis++){
   const d=[0,0,0];d[axis]=1;const v1=value(i+d[0],j+d[1],k+d[2]);if((v0<0)===(v1<0))continue;
   const u=(axis+1)%3,w=(axis+2)%3,c=(du:number,dw:number)=>{const x=[i,j,k];x[u]-=du;x[w]-=dw;return vertexOf.get(key(x[0],x[1],x[2]));};
   const a=c(0,0),b=c(1,0),cc=c(1,1),dd=c(0,1);if(a===undefined||b===undefined||cc===undefined||dd===undefined)continue;
   // Orientation: normals point from inside (negative) to outside.
   if(v0<0)tris.push(a,b,cc,a,cc,dd);else tris.push(a,cc,b,a,dd,cc);
  }
 }
 return {vertices:Float32Array.from(verts),indices:Uint32Array.from(tris)};
}
/** Keeps the largest connected part; returns it with the volume share of what was dropped. */
export function largestPart(m:Mesh){
 const n=m.vertices.length/3,parent=Array.from({length:n},(_,i)=>i),find=(i:number):number=>parent[i]===i?i:(parent[i]=find(parent[i]));
 for(let t=0;t<m.indices.length;t+=3){const a=find(m.indices[t]),b=find(m.indices[t+1]),c=find(m.indices[t+2]);if(a!==b)parent[a]=b;const b2=find(b);if(find(c)!==b2)parent[find(c)]=b2;}
 const vol=new Map<number,number>();for(let t=0;t<m.indices.length;t+=3){const r=find(m.indices[t]),[a,b,c]=[0,1,2].map(k=>vtx(m,m.indices[t+k]));vol.set(r,(vol.get(r)??0)+dot(a,cross(b,c))/6);}
 if(vol.size<2)return {mesh:m,dropped:0};
 const total=[...vol.values()].reduce((s,v)=>s+Math.abs(v),0),keep=[...vol.entries()].sort((x,y)=>y[1]-x[1])[0][0],idx:number[]=[];
 for(let t=0;t<m.indices.length;t+=3)if(find(m.indices[t])===keep)idx.push(m.indices[t],m.indices[t+1],m.indices[t+2]);
 return {mesh:{vertices:m.vertices,indices:Uint32Array.from(idx)},dropped:1-Math.abs(vol.get(keep)!)/total};
}
export function soup(m:Mesh){const out=new Float32Array(m.indices.length*3);for(let t=0;t<m.indices.length;t++)for(let c=0;c<3;c++)out[t*3+c]=m.vertices[m.indices[t]*3+c];return out;}
const vtx=(m:Mesh,i:number):V=>[m.vertices[i*3],m.vertices[i*3+1],m.vertices[i*3+2]];
/** Closedness (every edge in exactly two triangles), volume, area and connected parts. */
export function inspect(m:Mesh){
 const edges=new Map<string,number>();let volume=0,area=0;
 const parent=Array.from({length:m.vertices.length/3},(_,i)=>i),find=(i:number):number=>parent[i]===i?i:(parent[i]=find(parent[i]));
 for(let t=0;t<m.indices.length;t+=3){
  const ids=[m.indices[t],m.indices[t+1],m.indices[t+2]],[a,b,c]=ids.map(i=>vtx(m,i));
  volume+=dot(a,cross(b,c))/6;const nrm=cross(sub(b,a),sub(c,a));area+=Math.hypot(...nrm)/2;
  for(let e=0;e<3;e++){const x=ids[e],y=ids[(e+1)%3],k=x<y?x+','+y:y+','+x;edges.set(k,(edges.get(k)??0)+1);const r1=find(x),r2=find(y);if(r1!==r2)parent[r1]=r2;}
 }
 // Odd counts are holes; four triangles on an edge (surface nets at a pinch) are closed but not manifold.
 let open=0,pinched=0;for(const c of edges.values()){if(c%2)open++;else if(c>2)pinched++;}
 const used=new Set<number>();for(const i of m.indices)used.add(find(i));
 return {triangles:m.indices.length/3,volume,area,openEdges:open,pinchedEdges:pinched,closed:open===0,components:used.size};
}
/** Binary STL. */
export function stlBinary(m:Mesh,name='structure'){
 const count=m.indices.length/3,buf=new ArrayBuffer(84+count*50),view=new DataView(buf);
 for(let i=0;i<Math.min(80,name.length);i++)view.setUint8(i,name.charCodeAt(i)&127);view.setUint32(80,count,true);
 for(let t=0;t<count;t++){const [a,b,c]=[0,1,2].map(k=>vtx(m,m.indices[t*3+k])),nr=cross(sub(b,a),sub(c,a)),l=Math.hypot(...nr)||1,base=84+t*50;
  [nr[0]/l,nr[1]/l,nr[2]/l,...a,...b,...c].forEach((x,i)=>view.setFloat32(base+i*4,x,true));view.setUint16(base+48,0,true);}
 return new Uint8Array(buf);
}
