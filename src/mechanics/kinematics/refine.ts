// Continuous refinement of a chain: Levenberg–Marquardt over azimuths, cone
// angles, seats and the last element's seat and roll, closing the output
// terminal and, with an environment or a clearance aim, keeping hulls apart.
import type {Chain} from './chain.ts';
import {cloneChain,reflow,endResidual,place} from './chain.ts';
import {hulls,violations} from './construction.ts';

export type RefineOptions={clearance?:number;iterations?:number;signal?:AbortSignal;yield?:boolean};
export type Refined={chain:Chain;error:number;iterations:number;cancelled:boolean};
let lastYield=0;
async function yieldSometimes(){if(performance.now()-lastYield<16)return;await new Promise(r=>setTimeout(r,0));lastYield=performance.now();}
function solve(a:number[][],b:number[]){const m=a.map((r,i)=>[...r,b[i]]),n=b.length;for(let i=0;i<n;i++){let pivot=i;for(let j=i+1;j<n;j++)if(Math.abs(m[j][i])>Math.abs(m[pivot][i]))pivot=j;[m[i],m[pivot]]=[m[pivot],m[i]];if(Math.abs(m[i][i])<1e-14)return null;const d=m[i][i];for(let k=i;k<=n;k++)m[i][k]/=d;for(let j=0;j<n;j++)if(j!==i){const s=m[j][i];for(let k=i;k<=n;k++)m[j][k]-=s*m[i][k];}}return m.map(r=>r[n]);}

export type ChainVariable={read:(c:Chain)=>number;write:(c:Chain,v:number)=>void;lo:number;hi:number};
export function chainVariables(c:Chain):ChainVariable[]{
 const out:ChainVariable[]=[];
 c.stages.forEach((s,i)=>{
  for(const {key,lo,hi} of s.choice.variables)out.push({read:x=>x.stages[i].params[key],write:(x,v)=>{x.stages[i].params[key]=v;},lo,hi});
  if(s.join!=='shared')out.push({read:x=>x.stages[i].seat,write:(x,v)=>{x.stages[i].seat=v;},lo:-150,hi:150});
 });
 out.push({read:x=>x.lastSeat,write:(x,v)=>{x.lastSeat=v;},lo:-150,hi:150});
 // The roll is an angle: read it wrapped so a seed outside ±180° is not clamped into a stall.
 out.push({read:x=>((x.lastRoll%360)+540)%360-180,write:(x,v)=>{x.lastRoll=v;},lo:-180,hi:180});
 return out;
}
export const variableCount=(c:Chain)=>chainVariables(c).length;

export async function refineChain(input:Chain,o:RefineOptions={}):Promise<Refined>{
 const initial=cloneChain(input),variables=chainVariables(initial),iterations=o.iterations??100;
 const spatial=!!initial.environment||o.clearance!==undefined,aim=initial.environment?1:o.clearance!;
 const width=initial.environment?(initial.environment.bounds?6:0)+initial.environment.obstacles.length+1:1;
 // Keep residual dimensions stable even when a short compound has no gap hull yet.
 const hullKeys=spatial?[...new Set(hulls(place(initial)).boxes.map(b=>b.kind+':'+b.id))].sort():[];
 const residual=(c:Chain)=>{const r=reflow(c),end=endResidual(c,r);if(!spatial)return end;
  const p=place(c,r),v=violations(p,hulls(p).boxes,aim);
  return [...end,...hullKeys.flatMap(key=>v.get(key)??Array(width).fill(0))];
 };
 let best=initial,res=residual(best),cost=res.reduce((s,n)=>s+n*n,0),lambda=.01,used=0,stalled=0,cancelled=false;
 for(;used<iterations&&cost>1e-14;used++){
  if(o.signal?.aborted){cancelled=true;break;}if(o.yield!==false)await yieldSometimes();
  const jac:number[][]=[];
  for(const v of variables){const perturbed=cloneChain(best),old=v.read(best),step=old+.001<=v.hi?.001:-.001;v.write(perturbed,old+step);try{const next=residual(perturbed);jac.push(next.map((n,k)=>(n-res[k])/step));}catch{jac.push(res.map(()=>0));}}
  const normal=jac.map((a,i)=>jac.map((b,j)=>a.reduce((s,x,k)=>s+x*b[k],0)+(i===j?lambda:0))),rhs=jac.map(a=>-a.reduce((s,x,k)=>s+x*res[k],0)),d=solve(normal,rhs);if(!d)break;
  const trial=cloneChain(best);variables.forEach((v,i)=>v.write(trial,Math.min(v.hi,Math.max(v.lo,v.read(best)+Math.min(20,Math.max(-20,d[i]))))));
  try{const r=residual(trial),value=r.reduce((s,n)=>s+n*n,0);if(value<cost){stalled=0;best=trial;res=r;cost=value;lambda=Math.max(1e-9,lambda*.3);}else{stalled++;lambda=Math.min(1e9,lambda*10);}}catch{stalled++;lambda*=10;}
  if(spatial&&stalled>=12){used++;break;}
 }
 return {chain:best,error:Math.sqrt(cost),iterations:used,cancelled};
}
