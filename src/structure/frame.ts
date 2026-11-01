// Space frame analysis for printed lattices: struts are round Euler–Bernoulli
// beams joined rigidly at the nodes (a printed node does not hinge). Used for
// sizing and the strength check after the truss layout has chosen topology.
// 6 degrees of freedom per node, dense Cholesky (networks of ~100 nodes).
import type {V} from './vec.ts';
import {sub,norm,scale,cross,unit} from './vec.ts';
import type {TrussNode,Strut,Material} from './truss.ts';

export type EndForces={N:number;V:number;T:number;M:number;length:number};

function localAxes(d:V):[V,V,V]{const x=unit(d),h:V=Math.abs(x[2])<.9?[0,0,1]:[1,0,0],y=unit(cross(h,x)),z=cross(x,y);return [x,y,z];}
/** Local 12×12 stiffness of a round beam (axes x along the strut). */
function beamLocal(L:number,r:number,E:number){
 const G=E/2.6,A=Math.PI*r*r,I=Math.PI*r**4/4,J=2*I,k=new Float64Array(144),set=(i:number,j:number,v:number)=>{k[i*12+j]+=v;if(i!==j)k[j*12+i]+=v;};
 const a=E*A/L,t=G*J/L,b12=12*E*I/L**3,b6=6*E*I/L**2,b4=4*E*I/L,b2=2*E*I/L;
 set(0,0,a);set(6,6,a);set(0,6,-a);set(3,3,t);set(9,9,t);set(3,9,-t);
 // Bending in the local x–y plane (v, θz) and x–z plane (w, θy).
 set(1,1,b12);set(7,7,b12);set(1,7,-b12);set(1,5,b6);set(1,11,b6);set(7,5,-b6);set(7,11,-b6);set(5,5,b4);set(11,11,b4);set(5,11,b2);
 set(2,2,b12);set(8,8,b12);set(2,8,-b12);set(2,4,-b6);set(2,10,-b6);set(8,4,b6);set(8,10,b6);set(4,4,b4);set(10,10,b4);set(4,10,b2);
 return k;
}
export function solveFrame(nodes:TrussNode[],struts:Strut[],cases:V[][],m:Material){
 const dof=new Int32Array(nodes.length).fill(-1);let n=0;nodes.forEach((x,i)=>{if(!x.fixed){dof[i]=n;n+=6;}});
 const K=new Float64Array(n*n),elements=struts.map(s=>{const d=sub(nodes[s.j].p,nodes[s.i].p),L=Math.max(norm(d),1e-6),r=Math.sqrt(s.area/Math.PI),R=localAxes(d),k=beamLocal(L,r,m.E);return {s,L,R,k};});
 // Global = Tᵀ k T with T = blockdiag(R,R,R,R); R rows are the local axes.
 const toGlobal=(e:typeof elements[number])=>{const g=new Float64Array(144);for(let bi=0;bi<4;bi++)for(let bj=0;bj<4;bj++)for(let a=0;a<3;a++)for(let b=0;b<3;b++){let v=0;for(let p=0;p<3;p++)for(let q=0;q<3;q++)v+=e.R[p][a]*e.k[(bi*3+p)*12+bj*3+q]*e.R[q][b];g[(bi*3+a)*12+bj*3+b]=v;}return g;};
 for(const e of elements){const g=toGlobal(e),ids=[dof[e.s.i],dof[e.s.j]];
  for(let p=0;p<2;p++)for(let q=0;q<2;q++){const I=ids[p],J=ids[q];if(I<0||J<0)continue;for(let r=0;r<6;r++)for(let c=0;c<6;c++)K[(I+r)*n+J+c]+=g[(p*6+r)*12+q*6+c];}}
 let dmax=0;for(let i=0;i<n;i++)dmax=Math.max(dmax,K[i*n+i]);for(let i=0;i<n;i++)K[i*n+i]+=dmax*1e-9+1e-9;
 for(let j=0;j<n;j++){let s=K[j*n+j];for(let k=0;k<j;k++)s-=K[j*n+k]*K[j*n+k];if(s<=0)return null;const l=Math.sqrt(s);K[j*n+j]=l;for(let i=j+1;i<n;i++){let t=K[i*n+j];const ri=i*n,rj=j*n;for(let k=0;k<j;k++)t-=K[ri+k]*K[rj+k];K[ri+j]=t/l;}}
 const us=cases.map(f=>{const y=new Float64Array(n);nodes.forEach((x,i)=>{if(dof[i]>=0)for(let c=0;c<3;c++)y[dof[i]+c]=f[i]?.[c]??0;});
  for(let i=0;i<n;i++){let s=y[i];for(let k=0;k<i;k++)s-=K[i*n+k]*y[k];y[i]=s/K[i*n+i];}
  for(let i=n-1;i>=0;i--){let s=y[i];for(let k=i+1;k<n;k++)s-=K[k*n+i]*y[k];y[i]=s/K[i*n+i];}
  return nodes.map((_,i)=>dof[i]<0?new Float64Array(6):y.subarray(dof[i],dof[i]+6));});
 // End forces per element and case in local axes: N axial, V shear, T torsion, M bending (largest end).
 const forces:EndForces[][]=elements.map(e=>us.map(u=>{const ue=new Float64Array(12);for(const [b,node] of [[0,e.s.i],[1,e.s.j]] as [number,number][])for(let blk=0;blk<2;blk++)for(let p=0;p<3;p++){let v=0;for(let q=0;q<3;q++)v+=e.R[p][q]*u[node][blk*3+q];ue[b*6+blk*3+p]=v;}
  const f=new Float64Array(12);for(let i=0;i<12;i++){let v=0;for(let j=0;j<12;j++)v+=e.k[i*12+j]*ue[j];f[i]=v;}
  return {N:f[6],V:Math.max(Math.hypot(f[1],f[2]),Math.hypot(f[7],f[8])),T:Math.abs(f[3]),M:Math.max(Math.hypot(f[4],f[5]),Math.hypot(f[10],f[11])),length:e.L};}));
 return {us,forces};
}
/** Stress of a round bar: axial plus bending plus torsion (von Mises), and Euler buckling ratio. */
export function barUtilisation(f:EndForces,r:number,m:Material){
 const A=Math.PI*r*r,I=Math.PI*r**4/4,sigma=Math.abs(f.N)/A+f.M*r/I,tau=f.T*r/(2*I)+4*f.V/(3*A),vm=Math.sqrt(sigma*sigma+3*tau*tau);
 const buckling=f.N<0?-f.N*m.bucklingFactor/(Math.PI**2*m.E*I/(f.length*f.length)):0;
 return Math.max(vm/m.sigma,buckling);
}
/** Radii so that every strut is used up to its strength (never below the printable minimum). */
export function sizeFrame(nodes:TrussNode[],struts:Strut[],cases:V[][],m:Material,rounds=5,cap?:(s:Strut)=>number){
 let result=solveFrame(nodes,struts,cases,m);if(!result)throw Error('Rahmen ist beweglich.');
 for(let r=0;r<rounds;r++){
  struts.forEach((s,i)=>{if(s.rigid)return;const c=cap?.(s)??40;let lo=Math.min(m.rMin,c),hi=Math.max(lo,c);const ok=(x:number)=>result!.forces[i].every(f=>barUtilisation(f,x,m)<=1);if(ok(lo)){s.area=Math.PI*lo*lo;return;}
   if(!ok(hi)){s.area=Math.PI*hi*hi;return;}for(let k=0;k<30;k++){const mid=(lo+hi)/2;if(ok(mid))hi=mid;else lo=mid;}s.area=Math.PI*hi*hi;});
  result=solveFrame(nodes,struts,cases,m);if(!result)throw Error('Rahmen ist beweglich.');
 }
 let util=struts.map((s,i)=>s.rigid?0:Math.max(...result!.forces[i].map(f=>barUtilisation(f,Math.sqrt(s.area/Math.PI),m))));
 // Load moves to what got thicker: grow the overloaded struts until everything holds.
 for(let extra=0;extra<12&&util.some(u=>u>1);extra++){
  struts.forEach((s,i)=>{if(s.rigid||util[i]<=1)return;const r=Math.sqrt(s.area/Math.PI),c=cap?.(s)??40;s.area=Math.PI*Math.min(c,r*Math.pow(util[i],1/3)*1.03)**2;});
  result=solveFrame(nodes,struts,cases,m);if(!result)throw Error('Rahmen ist beweglich.');
  util=struts.map((s,i)=>s.rigid?0:Math.max(...result!.forces[i].map(f=>barUtilisation(f,Math.sqrt(s.area/Math.PI),m))));}
 return {...result,util};
}
export {scale};
