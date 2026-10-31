// Meet-in-the-middle starts for a chain (KINEMATIK-KERN.md 6.2). Prefixes are
// sampled forward from the input, suffixes backward from the output; a pair of
// halves fits when the middle shaft's axis passes through the suffix start.
// Pairings whose driven frame does not turn with the azimuth leave a roll
// about the shaft axis that is carried into the next azimuth.
import type {Chain,Stage} from '../chain.ts';
import {inputFrame,desiredFrame,cloneChain,stageGeometry} from '../chain.ts';
import {mateFrame} from '../contacts.ts';
import type {Frame,Q} from '../math.ts';
import {compose,inverse,axis,axisAngle,multiply,inverseQ,lcg} from '../math.ts';

const tz=(z:number):Frame=>({position:[0,0,z],rotation:[0,0,0,1]});
const rz=(deg:number):Frame=>({position:[0,0,0],rotation:axisAngle([0,0,1],deg)});
const dot=(a:number[],b:number[])=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
function roll(q:Q){if(Math.hypot(q[0],q[1])>1e-6)return undefined;return 2*Math.atan2(q[2],q[3])*180/Math.PI;}
const link=(s:Stage,params:Record<string,number>)=>mateFrame(stageGeometry({...s,params}),{...params,azimuth:0});

export type ClosureOptions={count?:number;samples?:number;seed?:number};
export function closureSeeds(c:Chain,{count=2,samples=400,seed=1}:ClosureOptions={}):{seeds:Chain[];work:number}{
 const n=c.stages.length,none={seeds:[] as Chain[],work:0};if(!n)return none;
 const local=c.output.local;if(c.output.constraint==='axis'&&!(Math.hypot(...local.position)<1e-9&&Math.abs(Math.abs(local.rotation[3])-1)<1e-12))return none;
 const random=lcg(seed),inF=inputFrame(c),desired=desiredFrame(c);
 const sampleParams=(s:Stage)=>{const v=s.choice.variables.find(v=>v.key==='angle');return {...s.params,azimuth:0,...(v?{angle:v.lo+random()*(v.hi-v.lo)}:{})};};
 const seat=()=>random()*200-100,turn=()=>random()*360-180;
 const m=Math.floor(n/2),forwardCount=m?samples:1,backwardCount=m?samples:Math.min(20000,samples*samples);
 type Half={frame:Frame;seats:number[];azimuths:number[];params:Record<string,number>[]};
 let work=0;const forward:Half[]=[];
 for(let k=0;k<forwardCount;k++){let frame=inF;const seats:number[]=[],azimuths:number[]=[],params:Record<string,number>[]=[];
  try{for(let i=0;i<m;i++){const s=c.stages[i],p=sampleParams(s),a=s.join==='shared'?0:seat(),az=turn();frame=compose(compose(compose(frame,tz(a)),rz(az)),link(s,p));work++;seats.push(a);azimuths.push(az);params.push(p);}}catch{continue;}
  forward.push({frame,seats,azimuths,params});}
 const backward:(Half&{last:number;lastRoll:number})[]=[];
 for(let k=0;k<backwardCount;k++){const last=random()*120-60,lastRoll=turn();let e=compose(desired,compose(tz(last),rz(lastRoll)));const seats:number[]=[],azimuths:number[]=[],params:Record<string,number>[]=[];
  try{for(let i=n-1;i>m;i--){const s=c.stages[i],p=sampleParams(s),a=s.join==='shared'?0:seat(),az=turn();e=compose(compose(compose(e,inverse(link(s,p))),rz(-az)),tz(-a));work++;seats.unshift(a);azimuths.unshift(az);params.unshift(p);}
   const p=sampleParams(c.stages[m]);e=compose(e,inverse(link(c.stages[m],p)));work++;params.unshift(p);}catch{continue;}
  backward.push({frame:e,seats,azimuths,params,last,lastRoll});}
 const best:{score:number;f:number;b:number}[]=[],keep=count*8,fz=forward.map(f=>axis(f.frame)),bz=backward.map(b=>axis(b.frame));
 for(let i=0;i<forward.length;i++){const z=fz[i],p=forward[i].frame.position;
  for(let j=0;j<backward.length;j++){const w=bz[j],ang=Math.hypot(z[0]-w[0],z[1]-w[1],z[2]-w[2]);if(ang>.5)continue;
   const q=backward[j].frame.position,d=[q[0]-p[0],q[1]-p[1],q[2]-p[2]],along=dot(d,z),score=Math.hypot(d[0]-z[0]*along,d[1]-z[1]*along,d[2]-z[2]*along)+30*ang+Math.max(0,Math.abs(along)-150);
   if(best.length<keep||score<best[best.length-1].score){best.push({score,f:i,b:j});best.sort((x,y)=>x.score-y.score);if(best.length>keep)best.pop();}}}
 work+=Math.ceil(forward.length*backward.length/2000);
 const seeds:Chain[]=[],seen=new Set<string>();
 for(const {f,b} of best){if(seeds.length>=count)break;
  const F=forward[f],B=backward[b],x=compose(inverse(F.frame),B.frame);
  const seats=[...F.seats,c.stages[m].join==='shared'?0:x.position[2],...B.seats],azimuths=[...F.azimuths,2*Math.atan2(x.rotation[2],x.rotation[3])*180/Math.PI,...B.azimuths],params=[...F.params,...B.params];
  const key=azimuths.map(a=>Math.round((((a%360)+540)%360-180)/30)).join(',')+'|'+seats.map(s=>Math.round(s/25)).join(',');if(seen.has(key))continue;seen.add(key);
  const s=cloneChain(c);let real=inF,virtual=inF,ok=true;
  for(let i=0;i<n&&ok;i++){const st=s.stages[i],offset=roll(multiply(inverseQ(real.rotation),virtual.rotation));if(offset===undefined){ok=false;break;}
   const az=azimuths[i]+offset;st.params={...params[i],azimuth:((az%360)+540)%360-180};st.seat=seats[i];
   virtual=compose(compose(compose(virtual,tz(seats[i])),rz(azimuths[i])),link(st,params[i]));
   real=compose(compose(real,tz(seats[i])),mateFrame(stageGeometry(st),st.params));}
  if(!ok)continue;const offset=roll(multiply(inverseQ(real.rotation),virtual.rotation));if(offset===undefined)continue;
  s.lastSeat=B.last;s.lastRoll=(((B.lastRoll-offset)%360)+540)%360-180;seeds.push(s);}
 return {seeds,work};
}
