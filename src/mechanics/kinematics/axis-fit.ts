// Axes from picked geometry (triangle soups, 9 numbers per triangle):
//  - a click on a cylindrical surface (bore, shaft, joint housing) gives the
//    cylinder axis: the direction perpendicular to all nearby normals, through
//    the centre of a circle fitted to the nearby vertices;
//  - a click near a sharp edge gives the edge direction (linear axes).
import type {V} from './math.ts';
import {add,scale,norm,cross,dot,unit} from './math.ts';

export type AxisFit={point:V;direction:V;radius?:number;kind:'cylinder'|'edge'|'plane';quality:number};
type Tri={a:V;b:V;c:V;centroid:V;normal:V;area:number};
function triangles(p:Float32Array|number[]):Tri[]{
 const out:Tri[]=[];
 for(let i=0;i+8<p.length;i+=9){const a:V=[p[i],p[i+1],p[i+2]],b:V=[p[i+3],p[i+4],p[i+5]],c:V=[p[i+6],p[i+7],p[i+8]],n=cross(add(b,scale(a,-1)),add(c,scale(a,-1))),l=norm(n);if(l<1e-12)continue;
  out.push({a,b,c,centroid:scale(add(add(a,b),c),1/3),normal:scale(n,1/l),area:l/2});}
 return out;
}
/** Eigenvectors of a symmetric 3×3 matrix by Jacobi rotation, ascending eigenvalues. */
export function eigen3(m:number[][]):{values:number[];vectors:V[]}{
 const a=m.map(r=>[...r]),v=[[1,0,0],[0,1,0],[0,0,1]];
 for(let sweep=0;sweep<50;sweep++){let off=0;for(let i=0;i<3;i++)for(let j=i+1;j<3;j++)off+=a[i][j]**2;if(off<1e-24)break;
  for(let p=0;p<3;p++)for(let q=p+1;q<3;q++){if(Math.abs(a[p][q])<1e-30)continue;const theta=(a[q][q]-a[p][p])/(2*a[p][q]),t=Math.sign(theta||1)/(Math.abs(theta)+Math.sqrt(theta*theta+1)),c=1/Math.sqrt(t*t+1),s=t*c;
   for(let k=0;k<3;k++){const akp=a[k][p],akq=a[k][q];a[k][p]=c*akp-s*akq;a[k][q]=s*akp+c*akq;}
   for(let k=0;k<3;k++){const apk=a[p][k],aqk=a[q][k];a[p][k]=c*apk-s*aqk;a[q][k]=s*apk+c*aqk;}
   for(let k=0;k<3;k++){const vkp=v[k][p],vkq=v[k][q];v[k][p]=c*vkp-s*vkq;v[k][q]=s*vkp+c*vkq;}}}
 const order=[0,1,2].sort((i,j)=>a[i][i]-a[j][j]);
 return {values:order.map(i=>a[i][i]),vectors:order.map(i=>[v[0][i],v[1][i],v[2][i]] as V)};
}
/** Algebraic circle fit (Kåsa) in 2D. */
function circle2(points:[number,number][]){
 let sx=0,sy=0,sxx=0,syy=0,sxy=0,sxz=0,syz=0,sz=0;const n=points.length;
 for(const [x,y] of points){const z=x*x+y*y;sx+=x;sy+=y;sxx+=x*x;syy+=y*y;sxy+=x*y;sxz+=x*z;syz+=y*z;sz+=z;}
 // Solve [sxx sxy sx; sxy syy sy; sx sy n]·[A B C] = [sxz syz sz]; centre = (A/2, B/2).
 const M=[[sxx,sxy,sx,sxz],[sxy,syy,sy,syz],[sx,sy,n,sz]];
 for(let c=0;c<3;c++){let p=c;for(let r=c+1;r<3;r++)if(Math.abs(M[r][c])>Math.abs(M[p][c]))p=r;[M[c],M[p]]=[M[p],M[c]];if(Math.abs(M[c][c])<1e-18)return undefined;for(let r=0;r<3;r++)if(r!==c){const f=M[r][c]/M[c][c];for(let k=c;k<4;k++)M[r][k]-=f*M[c][k];}}
 const A=M[0][3]/M[0][0],B=M[1][3]/M[1][1],C=M[2][3]/M[2][2],cx=A/2,cy=B/2,r=Math.sqrt(Math.max(0,C+cx*cx+cy*cy));
 return {cx,cy,r};
}
const nearest=(tris:Tri[],p:V,k:number)=>tris.map(t=>({t,d:norm(add(t.centroid,scale(p,-1)))})).sort((x,y)=>x.d-y.d).slice(0,k).map(x=>x.t);
/** Distance from a point to a triangle (for finding the picked one). */
function distanceToTriangle(p:V,t:Tri){
 const d=dot(add(p,scale(t.a,-1)),t.normal),q=add(p,scale(t.normal,-d));
 const inside=[[t.a,t.b],[t.b,t.c],[t.c,t.a]].every(([x,y])=>dot(cross(add(y,scale(x,-1)),add(q,scale(x,-1))),t.normal)>=-1e-9);
 if(inside)return Math.abs(d);
 const seg=(x:V,y:V)=>{const xy=add(y,scale(x,-1)),u=Math.max(0,Math.min(1,dot(add(p,scale(x,-1)),xy)/(dot(xy,xy)||1)));return norm(add(add(x,scale(xy,u)),scale(p,-1)));};
 return Math.min(seg(t.a,t.b),seg(t.b,t.c),seg(t.c,t.a));
}
/** Surface patch around the picked triangle: grows across edges whose faces bend less than `bend` degrees. */
function patch(tris:Tri[],hit:V,bend=30,limit=4000){
 let start=0,best=Infinity;tris.forEach((t,i)=>{const d=distanceToTriangle(hit,t);if(d<best){best=d;start=i;}});
 const key=(p:V)=>p.map(x=>Math.round(x*1e4)).join(','),edgeKey=(p:V,q:V)=>[key(p),key(q)].sort().join('|'),byEdge=new Map<string,number[]>();
 tris.forEach((t,i)=>{for(const [p,q] of [[t.a,t.b],[t.b,t.c],[t.c,t.a]] as [V,V][]){const k=edgeKey(p,q),l=byEdge.get(k);if(l)l.push(i);else byEdge.set(k,[i]);}});
 const cos=Math.cos(bend*Math.PI/180),seen=new Set([start]),queue=[start];
 while(queue.length&&seen.size<limit){const i=queue.shift()!,t=tris[i];for(const [p,q] of [[t.a,t.b],[t.b,t.c],[t.c,t.a]] as [V,V][])for(const j of byEdge.get(edgeKey(p,q))??[]){if(seen.has(j)||dot(tris[j].normal,t.normal)<cos)continue;seen.add(j);queue.push(j);}}
 return [...seen].map(i=>tris[i]);
}

/** Cylinder axis near a picked point. Falls back to the plane normal for flat regions. */
export function fitCylinder(positions:Float32Array|number[],hit:V,neighbours=240):AxisFit{
 const all=triangles(positions);if(!all.length)throw Error('Keine Geometrie am Klickpunkt.');
 // The smooth surface patch around the click; capped to the nearest triangles on huge meshes.
 let near=patch(all,hit);if(near.length>neighbours*8)near=nearest(near,hit,neighbours*8);
 const axisOf=(ts:Tri[])=>{const M=[[0,0,0],[0,0,0],[0,0,0]];for(const t of ts)for(let i=0;i<3;i++)for(let j=0;j<3;j++)M[i][j]+=t.area*t.normal[i]*t.normal[j];return eigen3(M);};
 let e=axisOf(near);const total=e.values[0]+e.values[1]+e.values[2]||1;
 // Flat: one dominant normal direction.
 if(e.values[1]/total<.05)return {point:hit,direction:unit(e.vectors[2]),kind:'plane',quality:1-e.values[1]/total};
 let a=unit(e.vectors[0]);
 // Keep the side faces of the cylinder (normals perpendicular to the axis) and refit once.
 near=near.filter(t=>Math.abs(dot(t.normal,a))<.35);if(near.length>=6){e=axisOf(near);a=unit(e.vectors[0]);}
 const u=unit(Math.abs(a[0])<.9?cross(a,[1,0,0]):cross(a,[0,1,0])),w=cross(a,u),pts:[number,number][]=[];
 for(const t of near)for(const q of [t.a,t.b,t.c])pts.push([dot(q,u),dot(q,w)]);
 const c=circle2(pts);if(!c)throw Error('Kreis nicht bestimmbar.');
 const along=dot(hit,a),point=add(add(scale(u,c.cx),scale(w,c.cy)),scale(a,along));
 const residual=Math.sqrt(pts.reduce((s,[x,y])=>s+(Math.hypot(x-c.cx,y-c.cy)-c.r)**2,0)/pts.length);
 return {point,direction:a,radius:c.r,kind:'cylinder',quality:Math.max(0,1-residual/Math.max(c.r,1e-9))};
}
/** Direction of the sharp edge nearest to a picked point (dihedral angle above `sharp` degrees). */
export function fitEdge(positions:Float32Array|number[],hit:V,sharp=25,neighbours=400):AxisFit{
 const near=nearest(triangles(positions),hit,neighbours),key=(p:V)=>p.map(x=>Math.round(x*1e4)).join(','),edges=new Map<string,{a:V;b:V;normals:V[]}>();
 for(const t of near)for(const [p,q] of [[t.a,t.b],[t.b,t.c],[t.c,t.a]] as [V,V][]){const k=[key(p),key(q)].sort().join('|'),e=edges.get(k);if(e)e.normals.push(t.normal);else edges.set(k,{a:p,b:q,normals:[t.normal]});}
 let best:{a:V;b:V;d:number}|undefined;const cosSharp=Math.cos(sharp*Math.PI/180);
 for(const e of edges.values()){if(e.normals.length!==2||dot(e.normals[0],e.normals[1])>cosSharp)continue;
  const ab=add(e.b,scale(e.a,-1)),l2=dot(ab,ab);if(l2<1e-18)continue;const t=Math.max(0,Math.min(1,dot(add(hit,scale(e.a,-1)),ab)/l2)),d=norm(add(add(e.a,scale(ab,t)),scale(hit,-1)));if(!best||d<best.d)best={a:e.a,b:e.b,d};}
 if(!best)throw Error('Keine Kante in der Nähe. Näher an eine Kante klicken oder zwei Punkte wählen.');
 return {point:best.a,direction:unit(add(best.b,scale(best.a,-1))),kind:'edge',quality:1/(1+best.d)};
}
/** Axis through two picked points. */
export function fitTwoPoints(p:V,q:V):AxisFit{const d=add(q,scale(p,-1));if(norm(d)<1e-9)throw Error('Zwei verschiedene Punkte wählen.');return {point:p,direction:unit(d),kind:'edge',quality:1};}
