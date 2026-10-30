import type {Mechanism} from './contracts.ts';
import type {V} from './frames.ts';
import {add,scale,norm,cross,rotate,compose,inverse} from './frames.ts';
import {proposeMate} from './model.ts';
import {registry} from './registry.ts';
import {reflow} from './refine.ts';
import {regionCorners} from './space.ts';

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
 for(let i=0;i<g.relations.length;i++){
  const t=(i+1)/g.relations.length,waypoint=add(add(start,scale(delta,t)),scale(direction,amplitude*Math.sin(Math.PI*t)));
  const r=g.relations[i],provider=registry.getRule(r.rule).search!,az=provider.variables.find(v=>v.key==='azimuth');
  if(!az)continue;
  const angle=provider.variables.find(v=>v.key==='angle'),angles=angle?[r.params.angle,angle.lo,(angle.lo+angle.hi)/2,angle.hi]:[undefined];
  let best=Infinity,params={...r.params};
  for(const a of angles)for(let k=0;k<24;k++){
   r.params.azimuth=az.lo+(az.hi-az.lo)*k/24;if(a!==undefined)r.params.angle=a;
   try{const proposed=proposeMate(g,r.id)[0],distance=norm(add(proposed.frame.position,scale(waypoint,-1)));
    if(distance<best){best=distance;params={...r.params};}
   }catch{/* A provider can reject an angle for a particular catalog pair. */}
  }
  r.params=params;g=reflow(g);
 }
 return g;
}
