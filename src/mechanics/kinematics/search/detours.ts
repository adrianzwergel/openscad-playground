// Geometric seeds on different sides of the endpoint chord. Not a path plan:
// refinement and the construction checks decide feasibility afterwards.
import type {Chain} from '../chain.ts';
import {cloneChain,reflow,endResidual,inputFrame,desiredFrame,place} from '../chain.ts';
import {hulls} from '../construction.ts';
import {regionCorners,spaceViolations} from '../../graph/space.ts';
import type {V} from '../math.ts';
import {add,scale,norm,cross,rotate} from '../math.ts';

export function detourSeed(input:Chain,sector:number):Chain{
 let c=cloneChain(input);
 const start=inputFrame(c).position,end=desiredFrame(c).position,delta=add(end,scale(start,-1)),length=norm(delta),forward:V=length>1e-8?scale(delta,1/length):rotate(c.input.target.rotation,[1,0,0]);
 const axes:V[]=[[0,0,1],[0,1,0],[1,0,0]].map(v=>rotate(c.input.target.rotation,v as V)),reference=axes.find(a=>norm(cross(forward,a))>.1)!;
 const side=scale(cross(forward,reference),1/norm(cross(forward,reference))),up=cross(forward,side);
 const theta=(sector%8)*Math.PI/4,direction=add(scale(side,Math.cos(theta)),scale(up,Math.sin(theta)));
 const dot=(a:V,b:V)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],obstacles=c.environment?.obstacles??[];
 const relevant=obstacles.filter(o=>{const t=dot(add(o.frame.position,scale(start,-1)),forward);return t>=-Math.max(...o.size)&&t<=length+Math.max(...o.size);});
 const radius=Math.max(30,length*.25,...relevant.flatMap(o=>regionCorners(o).map(p=>Math.abs(dot(add(p,scale(start,-1)),direction))+30+(c.environment?.margin??0))));
 const amplitude=Math.min(250,radius)*(sector>=8?.65:1),mixed=c.stages.some(s=>s.choice.changesAxis);
 let beam=[{chain:c,cost:0}];
 for(let i=0;i<c.stages.length;i++){
  const t=(i+1)/c.stages.length,waypoint=add(add(start,scale(delta,t)),scale(direction,amplitude*Math.sin(Math.PI*t)));
  const candidates:{chain:Chain;cost:number;rank:number}[]=[];
  for(const state of beam){
   const g=state.chain,s=g.stages[i],az=s.choice.variables.find(v=>v.key==='azimuth');
   if(!az){candidates.push({...state,rank:state.cost});continue;}
   const angle=s.choice.variables.find(v=>v.key==='angle'),angles=angle?[s.params.angle,angle.lo,(angle.lo+angle.hi)/2,angle.hi]:[undefined];
   let best=Infinity,params={...s.params};const original={...s.params},sampled=new Set<string>();
   for(const a of angles)for(let k=0;k<24;k++){
    const trial=cloneChain(g);trial.stages[i].params.azimuth=az.lo+(az.hi-az.lo)*k/24;if(a!==undefined)trial.stages[i].params.angle=a;
    const sample=JSON.stringify([((trial.stages[i].params.azimuth%360)+360)%360,a]);if(sampled.has(sample))continue;sampled.add(sample);
    try{const r=reflow(trial),distance=norm(add(r.drivens[i].position,scale(waypoint,-1)));
     if(!mixed){if(distance<best){best=distance;params={...trial.stages[i].params};}continue;}
     const tail=endResidual(trial,r),p=place(trial,r),placed=new Set([...Array.from({length:i+2},(_,k)=>'s'+k)]);
     const clearance=trial.environment?hulls(p).boxes.filter(b=>placed.has(b.owner)||placed.has(p.elements.find(e=>e.id===b.owner)?.body??'')).reduce((sum,b)=>sum+spaceViolations(b,trial.environment!).reduce((n,v)=>n+v*v,0),0):0;
     const cost=state.cost+distance*distance;
     candidates.push({chain:trial,cost,rank:cost+4*tail.slice(3).reduce((n,v)=>n+v*v,0)+.15*tail.slice(0,3).reduce((n,v)=>n+v*v,0)+2*clearance});
    }catch{/* a pair may reject a cone angle */}
   }
   if(!mixed){const chosen=cloneChain(g);chosen.stages[i].params=best<Infinity?params:original;candidates.push({chain:chosen,cost:state.cost+best*best,rank:best});}
  }
  const unique=new Set<string>();
  beam=candidates.sort((a,b)=>a.rank-b.rank).filter(x=>{const key=JSON.stringify(reflow(x.chain).shafts.map(f=>[f.position.map(v=>Math.round(v)),f.rotation.map(v=>Math.round(v*100))]));if(unique.has(key))return false;unique.add(key);return true;}).slice(0,mixed?3:1);
  if(!beam.length)throw Error('Keine gültige Umfahrungsstartlage.');
 }
 return beam[0].chain;
}
