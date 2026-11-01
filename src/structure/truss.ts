// Truss layout optimisation of the structure core (LAGER-UND-STRUKTUR.md B.3):
// a ground structure of candidate struts, minimum compliance over several load
// cases (optimality criteria), pruning, fully stressed sizing with buckling
// and a Weiszfeld relaxation that moves free nodes to shorten the force paths.
// Units: mm, N, MPa.
import type {V} from './vec.ts';
import {sub,norm,scale,add,dot} from './vec.ts';

export type TrussNode={p:V;fixed:boolean;anchor?:number;load?:boolean};
/** `keep`: never pruned (the only way to an anchor). */
export type Strut={i:number;j:number;rigid?:boolean;keep?:boolean;area:number};
export type Material={E:number;sigma:number;density:number;rMin:number;bucklingFactor:number};
export const PLA:Material={E:3500,sigma:50/3,density:1.24e-3,rMin:2.5,bucklingFactor:3};

/** Dense Cholesky on the free degrees of freedom; one factorisation serves all load cases. */
export function solveTruss(nodes:TrussNode[],struts:Strut[],cases:V[][],E:number):V[][]|null{
 const dof=new Int32Array(nodes.length).fill(-1);let n=0;nodes.forEach((x,i)=>{if(!x.fixed){dof[i]=n;n+=3;}});
 const K=new Float64Array(n*n);
 for(const s of struts){const a=nodes[s.i].p,b=nodes[s.j].p,d=sub(b,a),L=norm(d);if(L<1e-9)continue;const e=scale(d,1/L),k=E*s.area/L;
  const ids=[dof[s.i],dof[s.j]];
  for(let p=0;p<2;p++)for(let q=0;q<2;q++){const I=ids[p],J=ids[q];if(I<0||J<0)continue;const sg=p===q?k:-k;for(let r=0;r<3;r++)for(let c=0;c<3;c++)K[(I+r)*n+J+c]+=sg*e[r]*e[c];}}
 // Rigid joints carry what pin joints cannot: a small regularisation keeps unloaded kinks solvable.
 let dmax=0;for(let i=0;i<n;i++)dmax=Math.max(dmax,K[i*n+i]);const reg=dmax*1e-7+1e-9;for(let i=0;i<n;i++)K[i*n+i]+=reg;
 for(let j=0;j<n;j++){let s=K[j*n+j];for(let k=0;k<j;k++)s-=K[j*n+k]*K[j*n+k];if(s<=0)return null;const l=Math.sqrt(s);K[j*n+j]=l;
  for(let i=j+1;i<n;i++){let t=K[i*n+j];const ri=i*n,rj=j*n;for(let k=0;k<j;k++)t-=K[ri+k]*K[rj+k];K[ri+j]=t/l;}}
 return cases.map(f=>{const y=new Float64Array(n);nodes.forEach((x,i)=>{if(dof[i]>=0){y[dof[i]]=f[i]?.[0]??0;y[dof[i]+1]=f[i]?.[1]??0;y[dof[i]+2]=f[i]?.[2]??0;}});
  for(let i=0;i<n;i++){let s=y[i];for(let k=0;k<i;k++)s-=K[i*n+k]*y[k];y[i]=s/K[i*n+i];}
  for(let i=n-1;i>=0;i--){let s=y[i];for(let k=i+1;k<n;k++)s-=K[k*n+i]*y[k];y[i]=s/K[i*n+i];}
  return nodes.map((_,i)=>dof[i]<0?[0,0,0] as V:[y[dof[i]],y[dof[i]+1],y[dof[i]+2]] as V);});
}
/** Axial force of a strut (tension positive) from displacements. */
export function axialForce(nodes:TrussNode[],s:Strut,u:V[],E:number){const d=sub(nodes[s.j].p,nodes[s.i].p),L=norm(d);return E*s.area/L*dot(scale(d,1/L),sub(u[s.j],u[s.i]));}
export const compliance=(cases:V[][],us:V[][])=>cases.reduce((c,f,k)=>c+f.reduce((s,v,i)=>s+(v?dot(v,us[k][i]):0),0),0);

/** Minimum compliance at fixed volume: optimality criteria with a bisection on the multiplier. */
export function optimizeAreas(nodes:TrussNode[],struts:Strut[],cases:V[][],o:{E:number;iterations?:number;move?:number;minArea?:number;onIteration?:(k:number,c:number)=>void}){
 const free=struts.filter(s=>!s.rigid),len=(s:Strut)=>norm(sub(nodes[s.j].p,nodes[s.i].p)),volume=free.reduce((v,s)=>v+len(s),0),minA=o.minArea??1e-3;
 for(const s of free)s.area=1;
 let last=Infinity;
 for(let it=0;it<(o.iterations??30);it++){
  const us=solveTruss(nodes,struts,cases,o.E);if(!us)throw Error('Grundstruktur ist kinematisch unbestimmt.');
  const c=compliance(cases,us);o.onIteration?.(it,c);
  // dC/dA = -Σ E/L (e·Δu)²; per unit volume divide by L.
  const sens=free.map(s=>{const d=sub(nodes[s.j].p,nodes[s.i].p),L=norm(d),e=scale(d,1/L);let g=0;for(const u of us){const x=dot(e,sub(u[s.j],u[s.i]));g+=o.E/L*x*x;}return g/L;});
  let lo=1e-30,hi=1e30;const move=o.move??.4,next=new Float64Array(free.length);
  for(let b=0;b<200&&hi/lo>1+1e-9;b++){const lambda=Math.sqrt(lo*hi);let v=0;free.forEach((s,i)=>{const a=s.area*Math.sqrt(Math.max(1e-30,sens[i])/lambda);next[i]=Math.max(minA,Math.max(s.area*(1-move),Math.min(s.area*(1+move),a)));v+=next[i]*len(s);});if(v>volume)lo=lambda;else hi=lambda;}
  free.forEach((s,i)=>{s.area=next[i];});
  if(Math.abs(last-c)/c<1e-4&&it>8)break;last=c;
 }
}
/** Areas from forces: tension and compression to the allowed stress, compression also against Euler buckling. */
export function sizeStruts(nodes:TrussNode[],struts:Strut[],cases:V[][],m:Material,rounds=6){
 let forces:number[][]=[];
 for(let r=0;r<rounds;r++){
  const us=solveTruss(nodes,struts,cases,m.E);if(!us)throw Error('Struktur ist nach dem Ausdünnen beweglich.');
  forces=struts.map(s=>us.map(u=>axialForce(nodes,s,u,m.E)));
  struts.forEach((s,i)=>{if(s.rigid)return;const L=norm(sub(nodes[s.j].p,nodes[s.i].p)),t=Math.max(0,...forces[i]),c=Math.max(0,...forces[i].map(x=>-x));
   const rStress=Math.sqrt(Math.max(t,c)/m.sigma/Math.PI),rBuckle=Math.pow(4*m.bucklingFactor*c*L*L/(Math.PI**3*m.E),.25);s.area=Math.PI*Math.max(m.rMin,rStress,rBuckle)**2;});
 }
 return forces;
}
export const radiusOf=(s:Strut)=>Math.sqrt(s.area/Math.PI);
/** Utilisation per strut: stress and buckling against their limits (≤ 1 is fine). */
export function utilisation(nodes:TrussNode[],struts:Strut[],forces:number[][],m:Material){
 return struts.map((s,i)=>{if(s.rigid)return 0;const L=norm(sub(nodes[s.j].p,nodes[s.i].p)),r=radiusOf(s),I=Math.PI*r**4/4,t=Math.max(0,...forces[i]),c=Math.max(0,...forces[i].map(x=>-x));
  return Math.max(t/(s.area*m.sigma),c/(s.area*m.sigma),c*m.bucklingFactor/(Math.PI**2*m.E*I/(L*L)));});
}
/** Keeps struts carrying at least `ratio` of the largest area; drops nodes left without struts. */
export function prune(nodes:TrussNode[],struts:Strut[],ratio:number){
 const top=Math.max(...struts.filter(s=>!s.rigid).map(s=>s.area)),kept=struts.filter(s=>s.rigid||s.area>=ratio*top);
 const used=new Set<number>();for(const s of kept){used.add(s.i);used.add(s.j);}nodes.forEach((x,i)=>{if(x.anchor!==undefined)used.add(i);});
 const map=new Map<number,number>(),out:TrussNode[]=[];nodes.forEach((x,i)=>{if(used.has(i)){map.set(i,out.length);out.push({...x});}});
 return {nodes:out,struts:kept.map(s=>({...s,i:map.get(s.i)!,j:map.get(s.j)!}))};
}
/** Removes free nodes with a single strut (dead ends) until none is left. */
export function trimDeadEnds(nodes:TrussNode[],struts:Strut[]){
 let list=struts;for(;;){const deg=new Map<number,number>();for(const s of list){deg.set(s.i,(deg.get(s.i)??0)+1);deg.set(s.j,(deg.get(s.j)??0)+1);}
  const dead=new Set(nodes.map((x,i)=>i).filter(i=>nodes[i].anchor===undefined&&(deg.get(i)??0)===1));if(!dead.size)return list;list=list.filter(s=>!dead.has(s.i)&&!dead.has(s.j));}
}
/** Weiszfeld step for every free node: towards the point minimising Σ|N|·L of its struts. */
export function relax(nodes:TrussNode[],struts:Strut[],forces:number[][],valid:(i:number,p:V)=>boolean,damping=.6){
 const acc=new Map<number,{num:V;den:number}>();
 struts.forEach((s,k)=>{if(s.rigid)return;const w=Math.max(1e-6,...forces[k].map(Math.abs));for(const [a,b] of [[s.i,s.j],[s.j,s.i]]){if(nodes[a].anchor!==undefined)continue;const d=norm(sub(nodes[b].p,nodes[a].p));if(d<1e-6)continue;const x=acc.get(a)??{num:[0,0,0] as V,den:0};x.num=add(x.num,scale(nodes[b].p,w/d));x.den+=w/d;acc.set(a,x);}});
 let moved=0;
 const neighbours=new Map<number,number[]>();for(const s of struts){(neighbours.get(s.i)??neighbours.set(s.i,[]).get(s.i)!).push(s.j);(neighbours.get(s.j)??neighbours.set(s.j,[]).get(s.j)!).push(s.i);}
 for(const [i,x] of acc){const target=scale(x.num,1/x.den),from=nodes[i].p;let step=damping;
  for(let t=0;t<4;t++,step/=2){const p=add(from,scale(sub(target,from),step));if((neighbours.get(i)??[]).some(j=>norm(sub(nodes[j].p,p))<4))continue;if(valid(i,p)){moved=Math.max(moved,norm(sub(p,from)));nodes[i].p=p;break;}}}
 return moved;
}
