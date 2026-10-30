import type {Mechanism} from './contracts.ts';
import type {V} from './frames.ts';
import {add,scale,norm,cross,rotate,compose,inverse} from './frames.ts';
import {proposeMate} from './model.ts';
import {registry} from './registry.ts';
import {reflow,endResidual} from './refine.ts';
import {constructionHulls} from './construction.ts';
import {regionCorners,spaceViolations} from './space.ts';

/** A geometric seed, not a collision-free path or a change to the fixed goals.
 * Sample different sides of the endpoint chord; providers still place every mate.
 * Optimisation and the complete construction gate decide feasibility afterwards.
 */
export function detourSeed(input:Mechanism,sector:number):Mechanism{
 let g=reflow(input);
 const start=compose(g.input.target,inverse(g.input.local)).position;
 const end=compose(g.output.target,inverse(g.output.local)).position;
 const delta=add(end,scale(start,-1)),length=norm(delta),forward:V=length>1e-8?scale(delta,1/length):rotate(g.input.target.rotation,[1,0,0]);
 const axes:V[]=[[0,0,1],[0,1,0],[1,0,0]].map(v=>rotate(g.input.target.rotation,v as V));
 const reference=axes.find(a=>norm(cross(forward,a))>.1)!;
 const side=scale(cross(forward,reference),1/norm(cross(forward,reference))),up=cross(forward,side);
 const theta=(sector%8)*Math.PI/4,direction=add(scale(side,Math.cos(theta)),scale(up,Math.sin(theta)));
 const dot=(a:V,b:V)=>a.reduce((s,n,i)=>s+n*b[i],0);
 const obstacles=g.environment?.obstacles??[];
 const relevant=obstacles.filter(o=>{const t=dot(add(o.frame.position,scale(start,-1)),forward);return t>=-Math.max(...o.size)&&t<=length+Math.max(...o.size);});
 const radius=Math.max(30,length*.25,...relevant.flatMap(o=>regionCorners(o).map(p=>Math.abs(dot(add(p,scale(start,-1)),direction))+30+(g.environment?.margin??0))));
 const amplitude=Math.min(250,radius)*(sector>=8?.65:1);
 const mixed=g.relations.some(r=>registry.getRule(r.rule).search?.changesAxis);
 let beam=[{graph:g,cost:0}];
 for(let i=0;i<g.relations.length;i++){
  const t=(i+1)/g.relations.length,waypoint=add(add(start,scale(delta,t)),scale(direction,amplitude*Math.sin(Math.PI*t)));
  const candidates:{graph:Mechanism;cost:number;rank:number}[]=[];
  for(const state of beam){
   g=state.graph;const r=g.relations[i],provider=registry.getRule(r.rule).search!,az=provider.variables.find(v=>v.key==='azimuth');
   if(!az){candidates.push({...state,rank:state.cost});continue;}
   const angle=provider.variables.find(v=>v.key==='angle'),angles=angle?[r.params.angle,angle.lo,(angle.lo+angle.hi)/2,angle.hi]:[undefined];
   let best=Infinity,params={...r.params};
   const original={...r.params};
   const sampled=new Set<string>();
   for(const a of angles)for(let k=0;k<24;k++){
    r.params.azimuth=az.lo+(az.hi-az.lo)*k/24;if(a!==undefined)r.params.angle=a;
    const sample=JSON.stringify([((r.params.azimuth%360)+360)%360,a]);if(sampled.has(sample))continue;sampled.add(sample);
    try{const proposed=proposeMate(g,r.id)[0],distance=norm(add(proposed.frame.position,scale(waypoint,-1)));
     if(!mixed){if(distance<best){best=distance;params={...r.params};}continue;}
     const trial=reflow(g),tail=endResidual(trial),placed=new Set(trial.relations.slice(0,i+1).flatMap(rel=>[rel.id,...rel.elements.map(id=>trial.elements.find(e=>e.id===id)!.body)]));
     const clearance=trial.environment?constructionHulls(trial).boxes.filter(b=>placed.has(b.owner)).reduce((sum,b)=>sum+spaceViolations(b,trial.environment!).reduce((n,v)=>n+v*v,0),0):0;
     const cost=state.cost+distance*distance;
     // Keep several prefixes. The suffix predicts the final orientation, so a
     // locally short bend cannot silently discard a necessary axis change.
     const rank=cost+4*tail.slice(3).reduce((n,v)=>n+v*v,0)+.15*tail.slice(0,3).reduce((n,v)=>n+v*v,0)+2*clearance;
     candidates.push({graph:trial,cost,rank});
    }catch{/* Providers may reject a cone angle for a particular catalog pair. */}
   }
   r.params=mixed?original:params;
   if(!mixed)candidates.push({graph:reflow(g),cost:state.cost+best*best,rank:best});
  }
  const unique=new Set<string>();
  beam=candidates.sort((a,b)=>a.rank-b.rank).filter(c=>{
   // +/-360 are the same orientation; retain genuinely different prefixes.
   const key=JSON.stringify(c.graph.bodies.map(b=>[b.frame.position.map(v=>Math.round(v)),b.frame.rotation.map(v=>Math.round(v*100))]));
   if(unique.has(key))return false;unique.add(key);return true;
  }).slice(0,mixed?3:1);
  if(!beam.length)throw Error('Keine gültige Umfahrungsstartlage.');

 }
 return beam[0].graph;
}
