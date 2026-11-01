// Space frame analysis for printed lattices: struts are round Euler–Bernoulli
// beams joined rigidly at the nodes (a printed node does not hinge). Used for
// sizing and the strength check after the truss layout has chosen topology.
// 6 degrees of freedom per node, skyline Cholesky in reverse Cuthill–McKee order.
import type {V} from './vec.ts';
import {sub,norm,scale,cross,unit} from './vec.ts';
import type {TrussNode,Strut,Material,Section} from './truss.ts';

/** `energy`: uᵀKu of the element, `axial`: its axial share (for sensitivities). */
export type EndForces={N:number;V:number;T:number;M:number;length:number;energy:number;axial:number};

/** Local axes: x along the strut; z towards `normal` where given (a plate section), else any perpendicular. */
function localAxes(d:V,normal?:V):[V,V,V]{const x=unit(d);if(normal){const y0=cross(normal,x);if(norm(y0)>1e-6){const y=unit(y0);return [x,y,cross(x,y)];}}const h:V=Math.abs(x[2])<.9?[0,0,1]:[1,0,0],y=unit(cross(h,x)),z=cross(x,y);return [x,y,z];}
/** Local 12×12 stiffness of a beam (axes x along the strut): a round bar of radius r, or the given section. */
function beamLocal(L:number,r:number,E:number,section?:Section){
 const G=E/2.6,A=section?.A??Math.PI*r*r,Ir=Math.PI*r**4/4,Iz=section?.Iz??Ir,Iy=section?.Iy??Ir,J=section?.J??2*Ir,k=new Float64Array(144),set=(i:number,j:number,v:number)=>{k[i*12+j]+=v;if(i!==j)k[j*12+i]+=v;};
 const a=E*A/L,t=G*J/L;let b12=12*E*Iz/L**3,b6=6*E*Iz/L**2,b4=4*E*Iz/L,b2=2*E*Iz/L;
 set(0,0,a);set(6,6,a);set(0,6,-a);set(3,3,t);set(9,9,t);set(3,9,-t);
 // Bending in the local x–y plane (v, θz) and x–z plane (w, θy).
 set(1,1,b12);set(7,7,b12);set(1,7,-b12);set(1,5,b6);set(1,11,b6);set(7,5,-b6);set(7,11,-b6);set(5,5,b4);set(11,11,b4);set(5,11,b2);
 b12=12*E*Iy/L**3;b6=6*E*Iy/L**2;b4=4*E*Iy/L;b2=2*E*Iy/L;
 set(2,2,b12);set(8,8,b12);set(2,8,-b12);set(2,4,-b6);set(2,10,-b6);set(8,4,b6);set(8,10,b6);set(4,4,b4);set(10,10,b4);set(4,10,b2);
 return k;
}
export function solveFrame(nodes:TrussNode[],struts:Strut[],cases:V[][],m:Material){
 // Free nodes in reverse Cuthill–McKee order: the stiffness matrix becomes a narrow band (skyline storage).
 const adj=nodes.map(()=>[] as number[]);for(const s of struts){adj[s.i].push(s.j);adj[s.j].push(s.i);}
 const order:number[]=[],seen=new Uint8Array(nodes.length);nodes.forEach((x,i)=>{if(x.fixed)seen[i]=1;});
 const free=nodes.map((_,i)=>i).filter(i=>!seen[i]).sort((a,b)=>adj[a].length-adj[b].length);
 for(const s0 of free){if(seen[s0])continue;seen[s0]=1;const q=[s0];for(let h=0;h<q.length;h++){order.push(q[h]);for(const j of adj[q[h]].filter(j=>!seen[j]).sort((a,b)=>adj[a].length-adj[b].length)){seen[j]=1;q.push(j);}}}
 order.reverse();
 const dof=new Int32Array(nodes.length).fill(-1);let n=0;for(const i of order){dof[i]=n;n+=6;}
 // Skyline: row r stores columns first[r]..r.
 const first=new Int32Array(n);for(let r=0;r<n;r++)first[r]=r;
 for(const s of struts){const a=dof[s.i],b=dof[s.j];if(a<0||b<0)continue;const lo=Math.min(a,b),hi=Math.max(a,b);for(let r=hi;r<hi+6;r++)first[r]=Math.min(first[r],lo);}
 for(let i=0;i<nodes.length;i++){const a=dof[i];if(a<0)continue;for(let r=a;r<a+6;r++)first[r]=Math.min(first[r],a);}
 const off=new Int32Array(n+1);for(let r=0;r<n;r++)off[r+1]=off[r]+(r-first[r]+1);
 const K=new Float64Array(off[n]),at=(r:number,c:number)=>off[r]+(c-first[r]);
 const elements=struts.map(s=>{const d=sub(nodes[s.j].p,nodes[s.i].p),L=Math.max(norm(d),1e-6),r=Math.sqrt(s.area/Math.PI),R=localAxes(d,s.section?.normal),k=beamLocal(L,r,m.E,s.section);return {s,L,R,k};});
 // Global = Tᵀ k T with T = blockdiag(R,R,R,R); R rows are the local axes.
 const toGlobal=(e:typeof elements[number])=>{const g=new Float64Array(144);for(let bi=0;bi<4;bi++)for(let bj=0;bj<4;bj++)for(let a=0;a<3;a++)for(let b=0;b<3;b++){let v=0;for(let p=0;p<3;p++)for(let q=0;q<3;q++)v+=e.R[p][a]*e.k[(bi*3+p)*12+bj*3+q]*e.R[q][b];g[(bi*3+a)*12+bj*3+b]=v;}return g;};
 for(const e of elements){const g=toGlobal(e),ids=[dof[e.s.i],dof[e.s.j]];
  for(let p=0;p<2;p++)for(let q=0;q<2;q++){const I=ids[p],J=ids[q];if(I<0||J<0)continue;for(let r=0;r<6;r++)for(let c=0;c<6;c++){const R=I+r,C=J+c;if(C<=R)K[at(R,C)]+=g[(p*6+r)*12+q*6+c];}}}
 // Regularise each degree of freedom relative to its own stiffness: an absolute spring would hold slender parts in
 // place that nothing else holds (with very stiff anchor ties it reached the stiffness of a thin column).
 for(let i=0;i<n;i++)K[at(i,i)]+=K[at(i,i)]*1e-10+1e-9;
 for(let i=0;i<n;i++){const fi=first[i],oi=off[i]-fi;
  for(let j=fi;j<=i;j++){const fj=first[j],oj=off[j]-fj;let t=K[oi+j];for(let k=Math.max(fi,fj);k<j;k++)t-=K[oi+k]*K[oj+k];
   if(j<i)K[oi+j]=t/K[off[j]+j-fj];else{if(t<=0)return null;K[oi+i]=Math.sqrt(t);}}}
 const us=cases.map(f=>{const y=new Float64Array(n);nodes.forEach((x,i)=>{if(dof[i]>=0)for(let c=0;c<3;c++)y[dof[i]+c]=f[i]?.[c]??0;});
  for(let i=0;i<n;i++){const fi=first[i],oi=off[i]-fi;let t=y[i];for(let k=fi;k<i;k++)t-=K[oi+k]*y[k];y[i]=t/K[oi+i];}
  for(let i=n-1;i>=0;i--){const fi=first[i],oi=off[i]-fi;y[i]/=K[oi+i];const v=y[i];for(let k=fi;k<i;k++)y[k]-=K[oi+k]*v;}
  return nodes.map((_,i)=>dof[i]<0?new Float64Array(6):y.subarray(dof[i],dof[i]+6));});
 // End forces per element and case in local axes: N axial, V shear, T torsion, M bending (largest end).
 const forces:EndForces[][]=elements.map(e=>us.map(u=>{const ue=new Float64Array(12);for(const [b,node] of [[0,e.s.i],[1,e.s.j]] as [number,number][])for(let blk=0;blk<2;blk++)for(let p=0;p<3;p++){let v=0;for(let q=0;q<3;q++)v+=e.R[p][q]*u[node][blk*3+q];ue[b*6+blk*3+p]=v;}
  const f=new Float64Array(12);for(let i=0;i<12;i++){let v=0;for(let j=0;j<12;j++)v+=e.k[i*12+j]*ue[j];f[i]=v;}
  let energy=0;for(let i=0;i<12;i++)energy+=ue[i]*f[i];const d=ue[6]-ue[0],ax=e.k[0]*d*d;
  return {N:f[6],V:Math.max(Math.hypot(f[1],f[2]),Math.hypot(f[7],f[8])),T:Math.abs(f[3]),M:Math.max(Math.hypot(f[4],f[5]),Math.hypot(f[10],f[11])),length:e.L,energy,axial:ax};}));
 return {us,forces};
}
/** Stress of a round bar: axial plus bending plus torsion (von Mises), and Euler buckling ratio. */
export function barUtilisation(f:EndForces,r:number,m:Material){
 const A=Math.PI*r*r,I=Math.PI*r**4/4,sigma=Math.abs(f.N)/A+f.M*r/I,tau=f.T*r/(2*I)+4*f.V/(3*A),vm=Math.sqrt(sigma*sigma+3*tau*tau);
 const buckling=f.N<0?-f.N*m.bucklingFactor/(Math.PI**2*m.E*I/(f.length*f.length)):0;
 return Math.max(vm/m.sigma,buckling);
}
/** Radii so that every strut is used up to its strength (never below the printable minimum). */
/** `floor`: a strut's smallest radius besides the material's (e.g. a slenderness limit). */
export function sizeFrame(nodes:TrussNode[],struts:Strut[],cases:V[][],m:Material,rounds=5,cap?:(s:Strut)=>number,floor?:(s:Strut)=>number){
 let result=solveFrame(nodes,struts,cases,m);if(!result)throw Error('Rahmen ist beweglich.');
 for(let r=0;r<rounds;r++){
  struts.forEach((s,i)=>{if(s.rigid)return;const c=cap?.(s)??40;let lo=Math.min(Math.max(m.rMin,floor?.(s)??0),c),hi=Math.max(lo,c);const ok=(x:number)=>result!.forces[i].every(f=>barUtilisation(f,x,m)<=1);if(ok(lo)){s.area=Math.PI*lo*lo;return;}
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
/** Minimum compliance of a rigid-jointed frame at fixed volume (optimality criteria). Axial stiffness grows with A,
 * bending and torsion with A², so dC/dA = -(E_axial + 2·E_bending)/A. Areas start uniform at `start`. */
export function optimizeFrame(nodes:TrussNode[],struts:Strut[],cases:V[][],m:Material,o:{iterations:number;start:number;minArea:number;maxArea?:(s:Strut)=>number;move?:number;onIteration?:(k:number)=>void}){
 const free=struts.filter(s=>!s.rigid),len=(s:Strut)=>norm(sub(nodes[s.j].p,nodes[s.i].p)),cap=new Map(free.map(s=>[s,Math.max(o.minArea,o.maxArea?.(s)??Infinity)]));for(const s of free)s.area=Math.min(o.start,cap.get(s)!);
 const volume=free.reduce((v,s)=>v+s.area*len(s),0),move=o.move??.35;let last=Infinity;
 for(let it=0;it<o.iterations;it++){
  const r=solveFrame(nodes,struts,cases,m);if(!r)throw Error('Grundstruktur ist beweglich.');o.onIteration?.(it);
  const c=r.forces.reduce((x,fs)=>x+fs.reduce((y,f)=>y+f.energy,0),0);
  const sens=struts.map((s,i)=>s.rigid?0:r.forces[i].reduce((x,f)=>x+Math.max(0,f.axial)+2*Math.max(0,f.energy-f.axial),0)/s.area/len(s));
  let lo=1e-30,hi=1e30;const next=new Map<Strut,number>();
  for(let b=0;b<200&&hi/lo>1+1e-9;b++){const lambda=Math.sqrt(lo*hi);let v=0;struts.forEach((s,i)=>{if(s.rigid)return;const a=s.area*Math.sqrt(Math.max(1e-30,sens[i])/lambda),x=Math.min(cap.get(s)!,Math.max(o.minArea,Math.max(s.area*(1-move),Math.min(s.area*(1+move),a))));next.set(s,x);v+=x*len(s);});if(v>volume)lo=lambda;else hi=lambda;}
  for(const [s,a] of next)s.area=a;
  if(Math.abs(last-c)/c<1e-4&&it>6)break;last=c;
 }
}
export {scale};
