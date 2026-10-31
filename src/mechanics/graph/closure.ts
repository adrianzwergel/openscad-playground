import type {Mechanism,Relation} from './contracts.ts';
import type {Frame} from './frames.ts';
import {registry} from './registry.ts';
import {identity,compose,inverse,axis,axisAngle,multiply,inverseQ,norm} from './frames.ts';

/* Meet-in-the-middle starts for an ordered open chain.
 *
 * Every shaft carries a cylindrical joint: the axial seat of the driving element
 * and the azimuth of its pairing. Between them sit fixed pair transforms. Prefixes
 * are sampled forward from the input, suffixes backward from the output. A pair of
 * halves fits when the middle driving shaft's axis line passes through the suffix
 * start; its seat and azimuth then follow analytically. These are starts for the
 * continuous refinement, not solutions: axial limits, clearance and the exact
 * closure are still decided by refinement and the final checks.
 *
 * Sampling uses a virtual chain body·Tz(seat)·Rz(azimuth)·L(0). Pairings whose
 * driven frame does not turn with the azimuth (parallel shafts) leave a roll about
 * the shaft axis; converting to real parameters carries that roll into the next
 * azimuth and the final element roll. */

const tz=(z:number):Frame=>({position:[0,0,z],rotation:[0,0,0,1]});
const rz=(degrees:number):Frame=>({position:[0,0,0],rotation:axisAngle([0,0,1],degrees)});
const dot=(a:number[],b:number[])=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
/** Angle of a rotation about local z, or undefined if it also tilts the axis. */
function roll(q:number[]){const tilt=Math.hypot(q[0],q[1]);if(tilt>1e-6)return undefined;return 2*Math.atan2(q[2],q[3])*180/Math.PI;}

function link(g:Mechanism,r:Relation,params:Record<string,number>){
 const elements=r.elements.map((id,j)=>({...g.elements.find(e=>e.id===id)!,id:String(j),body:String(j),pose:identity(),phase:0}));
 return registry.getRule(r.rule).mateFrames!({elements,frames:[identity(),identity()],params})[0];
}

export type ClosureOptions={count?:number;samples?:number;seed?:number};

export function closureSeeds(g:Mechanism,{count=2,samples=400,seed=1}:ClosureOptions={}):{seeds:Mechanism[];work:number}{
 const n=g.relations.length,none={seeds:[],work:0};
 if(!n||g.output.motion==='translation'||g.relations.some(r=>!registry.getRule(r.rule).mateFrames||!registry.getRule(r.rule).search))return none;
 // Ordered chain: relation i drives from the input side to the next body.
 const body=(id:string)=>g.elements.find(e=>e.id===id)?.body;
 for(let i=0;i<n;i++){const [a,b]=g.relations[i].elements.map(body);if(a!==(i?body(g.relations[i-1].elements[1]):g.input.body)||(i===n-1&&b!==g.output.body)||a===b)return none;}
 const local=g.output.local;
 if(g.output.constraint==='axis'&&!(norm(local.position)<1e-9&&Math.abs(Math.abs(local.rotation[3])-1)<1e-12))return none;
 let state=(seed>>>0)||1;const random=()=>{state=(1664525*state+1013904223)>>>0;return state/4294967296;};
 const inputFrame=compose(g.input.target,inverse(g.input.local)),desired=compose(g.output.target,inverse(g.output.local));
 const angleOf=(r:Relation)=>registry.getRule(r.rule).search!.variables.find(v=>v.key==='angle');
 const sampleParams=(r:Relation)=>{const v=angleOf(r);return {...r.params,azimuth:0,...(v?{angle:v.lo+random()*(v.hi-v.lo)}:{})};};
 const seat=()=>random()*200-100,turn=()=>random()*360-180;
 const m=Math.floor(n/2),forwardCount=m?samples:1,backwardCount=m?samples:Math.min(20000,samples*samples);
 type Half={frame:Frame;seats:number[];azimuths:number[];params:Record<string,number>[]};
 let work=0;
 const forward:Half[]=[];
 for(let k=0;k<forwardCount;k++){
  let frame=inputFrame;const seats:number[]=[],azimuths:number[]=[],params:Record<string,number>[]=[];
  try{for(let i=0;i<m;i++){const p=sampleParams(g.relations[i]),a=seat(),az=turn();frame=compose(compose(compose(frame,tz(a)),rz(az)),link(g,g.relations[i],p));work++;seats.push(a);azimuths.push(az);params.push(p);}}catch{continue;}
  forward.push({frame,seats,azimuths,params});
 }
 // Backward halves end at the middle driving element, before its seat/azimuth joint.
 const backward:(Half&{last:number;lastRoll:number})[]=[];
 for(let k=0;k<backwardCount;k++){
  const last=random()*120-60,lastRoll=turn();let e=compose(desired,compose(tz(last),rz(lastRoll)));
  const seats:number[]=[],azimuths:number[]=[],params:Record<string,number>[]=[];
  try{
   for(let i=n-1;i>m;i--){const p=sampleParams(g.relations[i]),a=seat(),az=turn();e=compose(compose(compose(e,inverse(link(g,g.relations[i],p))),rz(-az)),tz(-a));work++;seats.unshift(a);azimuths.unshift(az);params.unshift(p);}
   const p=sampleParams(g.relations[m]);e=compose(e,inverse(link(g,g.relations[m],p)));work++;params.unshift(p);
  }catch{continue;}
  backward.push({frame:e,seats,azimuths,params,last,lastRoll});
 }
 // Score: distance of the suffix start from the middle shaft line plus axis error.
 const best:{score:number;f:number;b:number}[]=[],keep=count*8;
 const fz=forward.map(f=>axis(f.frame)),bz=backward.map(b=>axis(b.frame));
 for(let i=0;i<forward.length;i++){const z=fz[i],p=forward[i].frame.position;
  for(let j=0;j<backward.length;j++){
   const w=bz[j],ang=Math.hypot(z[0]-w[0],z[1]-w[1],z[2]-w[2]);if(ang>.5)continue;
   const q=backward[j].frame.position,d=[q[0]-p[0],q[1]-p[1],q[2]-p[2]],along=dot(d,z);
   const score=Math.hypot(d[0]-z[0]*along,d[1]-z[1]*along,d[2]-z[2]*along)+30*ang+Math.max(0,Math.abs(along)-150);
   if(best.length<keep||score<best[best.length-1].score){best.push({score,f:i,b:j});best.sort((x,y)=>x.score-y.score);if(best.length>keep)best.pop();}
  }
 }
 work+=Math.ceil(forward.length*backward.length/2000);
 const seeds:Mechanism[]=[],seen=new Set<string>();
 for(const {f,b} of best){
  if(seeds.length>=count)break;
  // The remaining tilt is the matching error that refinement removes.
  const F=forward[f],B=backward[b],x=compose(inverse(F.frame),B.frame);
  const seats=[...F.seats,x.position[2],...B.seats],azimuths=[...F.azimuths,2*Math.atan2(x.rotation[2],x.rotation[3])*180/Math.PI,...B.azimuths],params=[...F.params,...B.params];
  const key=azimuths.map(a=>Math.round((((a%360)+540)%360-180)/30)).join(',')+'|'+seats.map(s=>Math.round(s/25)).join(',');if(seen.has(key))continue;seen.add(key);
  // Convert the virtual chain into provider parameters by carrying roll offsets.
  const s=structuredClone(g);let real=inputFrame,virtual=inputFrame,ok=true;
  for(let i=0;i<n&&ok;i++){
   const r=s.relations[i],offset=roll(multiply(inverseQ(real.rotation),virtual.rotation));if(offset===undefined){ok=false;break;}
   const az=azimuths[i]+offset;r.params={...params[i],azimuth:((az%360)+540)%360-180};
   const driver=s.elements.find(e=>e.id===r.elements[0])!;driver.pose={...driver.pose,position:[0,0,seats[i]],rotation:[0,0,0,1]};
   const driven=s.elements.find(e=>e.id===r.elements[1])!;if(i<n-1)driven.pose={...driven.pose,position:[0,0,0],rotation:[0,0,0,1]};
   virtual=compose(compose(compose(virtual,tz(seats[i])),rz(azimuths[i])),link(g,r,params[i]));
   real=compose(compose(real,tz(seats[i])),link(g,r,r.params));
  }
  if(!ok)continue;
  const offset=roll(multiply(inverseQ(real.rotation),virtual.rotation));if(offset===undefined)continue;
  const lastElement=s.elements.find(e=>e.id===s.relations[n-1].elements[1])!;
  lastElement.pose={position:[0,0,B.last],rotation:axisAngle([0,0,1],B.lastRoll-offset)};
  seeds.push(s);
 }
 return {seeds,work};
}
