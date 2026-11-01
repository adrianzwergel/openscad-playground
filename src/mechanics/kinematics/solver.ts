// Loop solver (KINEMATIK-KERN.md 6). Unknowns are the joint coordinates of
// every pose plus common design variables and rolling constants. Poses are
// solved sequentially with warm starts; design variables are then refined on
// the stacked system. Levenberg–Marquardt with numeric Jacobians.
import type {Frame} from './math.ts';
import {compose,inverse,rotate,add,scale,norm,dot,cross,axis} from './math.ts';
import type {Mechanism,Expanded,JointRelation,Terminal} from './model.ts';
import {parseMechanism,expand,mirrorFrame} from './model.ts';
import {jointFrame,projectCoordinates,coordinateCount,jointResidual} from './joints.ts';
import type {Resolved} from './contacts.ts';
import {resolveContact,checkContact,geometryResiduals,rollingTerm,constantRatio} from './contacts.ts';
import {describeMobility} from './mobility.ts';
import type {Mobility} from './mobility.ts';
import {pitchChecks} from './conjugate.ts';
import type {Check} from './conjugate.ts';
import {pitchFn} from './surfaces.ts';
import {curve} from './curves.ts';

export type Variable={id:string;get:(m:Expanded)=>number;set:(m:Expanded,v:number)=>void;lo:number;hi:number};
/** `fixed` holds joint coordinates at given values in every pose (one slider per axis). */
export type SolveOptions={variables?:Variable[];iterations?:number;signal?:AbortSignal;yield?:boolean;fixed?:Record<string,number[]>};
export type Pose={input:number;coordinates:Record<string,number[]>;bodies:Record<string,Frame>};
export type Transfer={constant?:number;samples:{input:number;output:number}[]};
export type Solution={mechanism:Expanded;poses:Pose[];transfer:Transfer;checks:Check[];mobility:Mobility;error:number;poseErrors:number[];iterations:number;cancelled:boolean};

let lastYield=0;
async function yieldSometimes(){if(performance.now()-lastYield<16)return;await new Promise(r=>setTimeout(r,0));lastYield=performance.now();}
/** Dense solve of a symmetric positive system by Gaussian elimination with pivoting. */
export function solveLinear(a:number[][],b:number[]):number[]|null{
 const n=b.length,m=a.map((r,i)=>[...r,b[i]]);
 for(let c=0;c<n;c++){let p=c;for(let i=c+1;i<n;i++)if(Math.abs(m[i][c])>Math.abs(m[p][c]))p=i;if(Math.abs(m[p][c])<1e-300)return null;[m[c],m[p]]=[m[p],m[c]];for(let i=c+1;i<n;i++){const f=m[i][c]/m[c][c];if(!f)continue;for(let k=c;k<=n;k++)m[i][k]-=f*m[c][k];}}
 const x=Array(n).fill(0);for(let i=n-1;i>=0;i--){let s=m[i][n];for(let k=i+1;k<n;k++)s-=m[i][k]*x[k];x[i]=s/m[i][i];}return x;
}

type Tree={order:{joint:JointRelation;child:string;forward:boolean}[];tree:Set<string>};
function spanningTree(m:Expanded):Tree{
 const ground=m.bodies.find(b=>b.ground)!,seen=new Set([ground.id,...m.bodies.filter(b=>b.mirror).map(b=>b.id)]),order:Tree['order']=[],tree=new Set<string>(),queue=[ground.id];
 const active=m.joints.filter(j=>!j.redundant);
 while(queue.length){const b=queue.shift()!;for(const j of active){if(tree.has(j.id))continue;const other=j.a.body===b?j.b.body:j.b.body===b?j.a.body:null;if(!other||seen.has(other))continue;seen.add(other);tree.add(j.id);order.push({joint:j,child:other,forward:j.a.body===b});queue.push(other);}}
 const missing=m.bodies.filter(b=>!seen.has(b.id));if(missing.length)throw Error(`Körper ohne Verbindung zum Gestell: ${missing.map(b=>b.id).join(', ')}`);
 return {order,tree};
}
/** Body frames from tree coordinates. */
function forward(m:Expanded,t:Tree,q:Record<string,number[]>){
 const frames:Record<string,Frame>={};const ground=m.bodies.find(b=>b.ground)!;frames[ground.id]=ground.frame;
 for(const {joint:j,child,forward:fwd} of t.order){const J=jointFrame(j.joint,q[j.id],j.shift);
  frames[child]=fwd?compose(compose(compose(frames[j.a.body],j.a.local),J),inverse(j.b.local)):compose(compose(compose(frames[j.b.body],j.b.local),inverse(J)),inverse(j.a.local));}
 for(const b of m.bodies)if(b.mirror)frames[b.id]=mirrorFrame(frames[b.mirror.source],b.mirror.plane);
 return frames;
}
const withFrames=(m:Expanded,frames:Record<string,Frame>):Expanded=>({...m,bodies:m.bodies.map(b=>({...b,frame:frames[b.id]}))});
function terminalResiduals(m:Expanded,t:Terminal):number[]{
 if(t.kind!=='frame')return [];
 const body=m.bodies.find(b=>b.id===t.body)!,f=compose(body.frame,t.local),target=t.target,z=axis(f),zt=axis(target),d=add(f.position,scale(target.position,-1));
 const dir=cross(z,zt),xt=rotate(target.rotation,[1,0,0]),yt=rotate(target.rotation,[0,1,0]);
 if(t.constraint==='axis'){const perp=add(d,scale(zt,-dot(d,zt)));return [perp[0],perp[1],perp[2],dot(dir,xt)*100,dot(dir,yt)*100];}
 return [d[0],d[1],d[2],dot(dir,xt)*100,dot(dir,yt)*100];
}
/** Signal coordinate of a terminal: the coordinate itself or the first coordinate of the body's tree joint. */
function terminalSignal(m:Expanded,t:Tree,term:Terminal){
 if(term.kind==='coordinate')return {joint:term.joint,index:term.coordinate};
 if(term.kind==='none')return undefined;
 const entry=t.order.find(o=>o.child===term.body);if(!entry||coordinateCount(entry.joint.joint)===0)return undefined;return {joint:entry.joint.id,index:0};
}

export async function solve(input:Mechanism,o:SolveOptions={}):Promise<Solution>{
 const m=expand(parseMechanism(input)),t=spanningTree(m),allContacts=m.contacts.map(c=>resolveContact(m,c)),contacts=allContacts.filter(c=>!c.contact.redundant);allContacts.forEach(checkContact);
 const active=m.joints.filter(j=>!j.redundant),loops=active.filter(j=>!t.tree.has(j.id)),redundant=m.joints.filter(j=>j.redundant);
 const inputSignal=terminalSignal(m,t,m.input),outputSignal=terminalSignal(m,t,m.output);
 if(m.input.kind==='coordinate'&&!inputSignal)throw Error('Eingang ohne Koordinate.');
 const samples=m.range.samples,inputs=Array.from({length:samples},(_,k)=>samples===1?m.range.from:m.range.from+(m.range.to-m.range.from)*k/(samples-1));
 const variables=o.variables??[],design=variables.map(v=>Math.min(v.hi,Math.max(v.lo,v.get(m))));
 // Pose unknown layout: coordinates of active joints, minus the swept input coordinate.
 const held=(id:string,i:number)=>o.fixed?.[id]?.[i]!==undefined&&Number.isFinite(o.fixed[id][i]);
 const slots:{joint:JointRelation;index:number}[]=[];for(const j of active)for(let i=0;i<coordinateCount(j.joint);i++)if(!(inputSignal&&inputSignal.joint===j.id&&inputSignal.index===i)&&!held(j.id,i))slots.push({joint:j,index:i});
 const initialCoordinates=()=>{const q:Record<string,number[]>={};for(const j of active){const A=compose(m.bodies.find(b=>b.id===j.a.body)!.frame,j.a.local),B=compose(m.bodies.find(b=>b.id===j.b.body)!.frame,j.b.local);q[j.id]=projectCoordinates(j.joint,compose(inverse(A),B),j.shift);}return q;};
 const applyDesign=(x:number[])=>{variables.forEach((v,i)=>v.set(m,x[i]));};
 const clampCoordinate=(j:JointRelation,i:number,v:number)=>{if(j.joint.kind==='path'&&i===0){const fn=curve(j.joint.curve);if(!fn.closed)return Math.max(-(j.shift??0),Math.min(fn.length-(j.shift??0),v));}return v;};
 // Residuals of one pose. `constants` holds the rolling constants; undefined omits rolling.
 const psiRefs:Record<string,number[]>[]=[];
 const unwrapAngle=(psi:number,ref:number|undefined)=>ref===undefined?psi:psi+2*Math.PI*Math.round((ref-psi)/(2*Math.PI));
 const rollingValue=(mm:Expanded,c:Resolved,refs?:Record<string,number[]>)=>{const term=rollingTerm(mm,c),psi=term.psi.map((p,i)=>term.periodic?.[i]===false?p:unwrapAngle(p,refs?.[c.contact.id]?.[i]));return {value:psi.reduce((s,p,i)=>s+term.coeff[i]*(term.arc?.[i]?term.arc[i]!(p):p),0),psi};};
 const poseResiduals=(q:Record<string,number[]>,constants?:number[],refs?:Record<string,number[]>)=>{
  const frames=forward(m,t,q),mm=withFrames(m,frames),out:number[]=[];
  for(const j of loops){const A=compose(frames[j.a.body],j.a.local),B=compose(frames[j.b.body],j.b.local);out.push(...jointResidual(j.joint,A,B,q[j.id],j.shift));}
  for(const c of contacts)out.push(...geometryResiduals(mm,c));
  if(constants)contacts.forEach((c,i)=>{out.push(rollingValue(mm,c,refs).value-constants[i]);});
  out.push(...terminalResiduals(mm,m.input),...terminalResiduals(mm,m.output));
  return out;
 };
 const pack=(q:Record<string,number[]>)=>slots.map(s=>q[s.joint.id][s.index]);
 const unpack=(q:Record<string,number[]>,x:number[],inputValue:number)=>{const out:Record<string,number[]>={};for(const j of active)out[j.id]=[...q[j.id]];slots.forEach((s,i)=>{out[s.joint.id][s.index]=clampCoordinate(s.joint,s.index,x[i]);});for(const j of active)for(let i=0;i<coordinateCount(j.joint);i++)if(held(j.id,i))out[j.id][i]=o.fixed![j.id][i];if(inputSignal)out[inputSignal.joint][inputSignal.index]=inputValue;return out;};
 const maxIterations=o.iterations??200;let used=0,cancelled=false;
 // Levenberg–Marquardt on a residual function of x.
 const lm=async(x0:number[],f:(x:number[])=>number[],bounds:(i:number)=>[number,number],budget:number)=>{
  let x=[...x0],res=f(x),cost=res.reduce((s,n)=>s+n*n,0),lambda=1e-3,stalled=0,it=0;
  for(;it<budget&&cost>1e-18;it++){if(o.signal?.aborted){cancelled=true;break;}if(o.yield!==false)await yieldSometimes();
   const n=x.length,jac:number[][]=[];for(let i=0;i<n;i++){const h=1e-4*Math.max(1,Math.abs(x[i])),xp=[...x];xp[i]+=h;let rp:number[];try{rp=f(xp);}catch{rp=res;}jac.push(rp.map((v,r)=>(v-res[r])/h));}
   const normal=jac.map((a,i)=>jac.map((b,j)=>{let s=0;for(let r=0;r<res.length;r++)s+=a[r]*b[r];return s+(i===j?lambda*(1+s):0);})),rhs=jac.map(a=>{let s=0;for(let r=0;r<res.length;r++)s-=a[r]*res[r];return s;});
   const d=solveLinear(normal,rhs);if(!d)break;
   const trial=x.map((v,i)=>{const [lo,hi]=bounds(i),step=Math.max(-50,Math.min(50,d[i]));return Math.min(hi,Math.max(lo,v+step));});
   let r2:number[];try{r2=f(trial);}catch{lambda*=10;stalled++;continue;}const c2=r2.reduce((s,n)=>s+n*n,0);
   if(c2<cost){x=trial;res=r2;cost=c2;lambda=Math.max(1e-12,lambda*.3);stalled=0;}else{lambda=Math.min(1e9,lambda*10);stalled++;}
   if(stalled>=15)break;}
  used+=it;return {x,res,cost};
 };
 const free=()=>[-Infinity,Infinity] as [number,number];
 // Pass 1: poses in sequence with warm starts. Between samples the input advances in
 // substeps that halve on failure, so loops with screws and long travels keep the branch.
 const solveAt=async(from:Record<string,number[]>,inputValue:number,constants?:number[],refs?:Record<string,number[]>)=>{
  const start=unpack(from,pack(from),inputValue);
  const r=await lm(pack(start),x=>poseResiduals(unpack(start,x,inputValue),constants,refs),free,maxIterations);
  return {q:unpack(start,r.x,inputValue),error:Math.sqrt(r.cost)};
 };
 // A coordinate that moves more than a quarter turn or a quarter path within one step may have changed branch.
 const branchJump=(a:Record<string,number[]>,b:Record<string,number[]>)=>slots.some(s=>{const d=Math.abs(b[s.joint.id][s.index]-a[s.joint.id][s.index]),k=s.joint.joint.kind;if(k==='prismatic')return false;if(k==='path')return s.index===0?d>curve(s.joint.joint.curve).length/4:d>90;if(k==='cylindrical')return s.index===0?d>90:false;return d>90;});
 const refsOf=(q:Record<string,number[]>,previous?:Record<string,number[]>)=>{const mm=withFrames(m,forward(m,t,q)),refs:Record<string,number[]>={};for(const c of contacts)refs[c.contact.id]=rollingValue(mm,c,previous).psi;return refs;};
 applyDesign(design);let q=initialCoordinates();const poses:Record<string,number[]>[]=[];let constants:number[]|undefined;const errors:number[]=[];let refs:Record<string,number[]>|undefined;
 // Matches the chain terminal slack (1e-5 mm, 1e-4°): a closed chain re-solves within 1e-4.
 const tolerance=1e-4;
 for(let k=0;k<samples&&!cancelled;k++){
  if(k===0){const r=await solveAt(q,inputs[0]);q=r.q;errors.push(r.error);refs=refsOf(q);const mm=withFrames(m,forward(m,t,q));constants=contacts.map(c=>rollingValue(mm,c,refs).value);}
  else{
   // Substeps never exceed 90 (degrees or mm): a screw or a rolling pair must not skip a turn.
   const limit=90,total=inputs[k]-inputs[k-1];let cur=inputs[k-1],step=Math.sign(total)*Math.min(Math.abs(total),limit),error=0;const minimum=Math.abs(total)/4096;
   while(cur!==inputs[k]&&!cancelled){
    const remaining=inputs[k]-cur,next=Math.abs(step)>=Math.abs(remaining)?inputs[k]:cur+step;
    const r=await solveAt(q,next,constants,refs),jumped=branchJump(q,r.q);
    if((r.error<=tolerance&&!jumped)||Math.abs(next-cur)<=minimum){q=r.q;cur=next;refs=refsOf(q,refs);error=Math.max(error,r.error);if(r.error<=tolerance)step=Math.sign(step)*Math.min(Math.abs(step)*2,limit);}
    else step/=2;
   }
   errors.push(error);
  }
  poses.push(q);psiRefs[k]=refs!;
 }
 // Pass 2: design variables on the stacked system.
 if(variables.length&&!cancelled){
  const nv=variables.length,x0=[...design,...poses.flatMap(p=>pack(p))];
  const f=(x:number[])=>{applyDesign(x.slice(0,nv));const out:number[]=[];for(let k=0;k<samples;k++){const qk=unpack(poses[k],x.slice(nv+k*slots.length,nv+(k+1)*slots.length),inputs[k]);out.push(...poseResiduals(qk,samples>1?constants:undefined,psiRefs[k]));}return out;};
  const r=await lm(x0,f,i=>i<nv?[variables[i].lo,variables[i].hi]:free(),maxIterations);
  applyDesign(r.x.slice(0,nv));for(let k=0;k<samples;k++){poses[k]=unpack(poses[k],r.x.slice(nv+k*slots.length,nv+(k+1)*slots.length),inputs[k]);errors[k]=Math.sqrt(r.cost);}
 }
 // Mobility from the first pose with rolling terms included.
 const q0=poses[0],zeros=contacts.map(()=>0),refs0=psiRefs[0];
 const base=poseResiduals(q0,zeros,refs0),jac:number[][]=[];
 for(let i=0;i<slots.length;i++){const x=pack(q0);const h=1e-5*Math.max(1,Math.abs(x[i]));x[i]+=h;let rp:number[];try{rp=poseResiduals(unpack(q0,x,inputs[0]),zeros,refs0);}catch{rp=base;}jac.push(rp.map((v,r)=>(v-base[r])/h));}
 const mobility=describeMobility(m,jac[0]?jac[0].map((_,r)=>jac.map(col=>col[r])):[],slots.length);
 // Report.
 const checks:Check[]=[],finalPoses:Pose[]=poses.map((qk,k)=>({input:inputs[k],coordinates:qk,bodies:forward(m,t,qk)}));
 const worst=Math.max(...errors);checks.push({id:'closure',state:worst<1e-4?'pass':'fail',message:`Größter Schließfehler über ${samples} Stellung(en): ${worst.toExponential(2)}.`});
 for(const j of redundant){let dev=0;for(const p of finalPoses){const A=compose(p.bodies[j.a.body],j.a.local),B=compose(p.bodies[j.b.body],j.b.local),qq=projectCoordinates(j.joint,compose(inverse(A),B),j.shift);dev=Math.max(dev,norm(jointResidual(j.joint,A,B,qq,j.shift).slice(0,3) as [number,number,number]));}
  checks.push({id:'redundant/'+j.id,state:dev<.05?'pass':'fail',message:`Abgeleitetes Gelenk ${j.id} weicht um ${dev.toFixed(3)} mm ab.`});}
 for(const c of allContacts.filter(c=>c.contact.redundant)){let dev=0;for(const p of finalPoses)dev=Math.max(dev,norm(geometryResiduals(withFrames(m,p.bodies),c).slice(0,3) as [number,number,number]));checks.push({id:'redundant/'+c.contact.id,state:dev<.05?'pass':'fail',message:`Abgeleiteter Kontakt ${c.contact.id} weicht um ${dev.toFixed(3)} ab.`});}
 checks.push({id:'mobility',state:mobility.freedom===0?'pass':'fail',message:mobility.message+` (Grübler ${mobility.grubler}, Rang ${mobility.rank} von ${mobility.unknowns}).`});
 for(const e of m.elements)for(const s of e.surfaces)for(const c of pitchChecks(pitchFn(s),s.profile))checks.push({...c,id:`${e.id}/${s.id}/${c.id}`});
 // Transfer: numeric from the pose sequence and analytic where the train is rigidly geared.
 const transfer:Transfer={samples:[]};
 if(outputSignal)transfer.samples=finalPoses.map(p=>({input:p.input,output:p.coordinates[outputSignal.joint][outputSignal.index]}));
 const constant=constantTransfer(m,t,contacts,inputSignal,outputSignal);if(constant!==undefined)transfer.constant=constant;
 if(m.target?.kind==='profile'&&transfer.samples.length){
  // Requested output over input, both relative to the first sample; linear interpolation between target samples.
  const t=[...m.target.samples].sort((a,b)=>a.input-b.input),at=(x:number)=>{if(x<=t[0].input)return t[0].output;for(let i=1;i<t.length;i++)if(x<=t[i].input){const w=(x-t[i-1].input)/(t[i].input-t[i-1].input);return t[i-1].output*(1-w)+t[i].output*w;}return t[t.length-1].output;};
  const base=transfer.samples[0],dev=Math.max(...transfer.samples.map(p=>Math.abs((p.output-base.output)-(at(p.input)-at(base.input)))));
  checks.push({id:'target',state:dev<=m.target.tolerance+1e-9?'pass':'fail',message:`Größte Abweichung vom Übersetzungsverlauf ${dev.toFixed(4)} (zulässig ${m.target.tolerance}).`});
 }
 if(m.target&&transfer.constant!==undefined&&(m.target.kind==='ratio'||m.target.kind==='stroke-per-turn')){const got=m.target.kind==='ratio'?1/Math.abs(transfer.constant):Math.abs(transfer.constant),dev=Math.abs(got-m.target.value)/m.target.value;checks.push({id:'target',state:dev<=m.target.tolerance+1e-9?'pass':'fail',message:`Übersetzung ${got.toFixed(4)} gegenüber Ziel ${m.target.value} (${(dev*100).toFixed(2)} %).`});}
 return {mechanism:withFrames(m,finalPoses[0].bodies),poses:finalPoses,transfer,checks,mobility,error:worst,poseErrors:errors,iterations:used,cancelled};
}
/** Constant ratio output/input through contacts between bodies that rotate on tree joints. */
function constantTransfer(m:Expanded,t:Tree,contacts:Resolved[],inp?:{joint:string;index:number},out?:{joint:string;index:number}){
 if(!inp||!out)return undefined;
 const bodyOf=(jointId:string)=>t.order.find(o=>o.joint.id===jointId)?.child;const start=bodyOf(inp.joint),goal=bodyOf(out.joint);if(!start||!goal)return undefined;
 const rates=new Map<string,number>([[start,1]]),queue=[start];
 while(queue.length){const b=queue.shift()!;for(const c of contacts){const ratio=constantRatio(c);if(ratio===undefined)return undefined;const ba=c.ea.mounts[0].body,bb=c.eb.mounts[0].body;const [from,to,g]=ba===b?[ba,bb,ratio]:bb===b?[bb,ba,1/ratio]:[null,null,0];if(!from||rates.has(to!))continue;rates.set(to!,rates.get(from)!*g);queue.push(to!);}}
 const r=rates.get(goal);return r;
}
