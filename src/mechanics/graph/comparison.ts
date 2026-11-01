import type {Mechanism} from './contracts.ts';
import {assessConstruction} from './construction.ts';
import {compose,inverse,rotate} from './frames.ts';
import type {V} from './frames.ts';
/** Envelope aligned to the fixed input frame: global rotation cannot change ranking.
 * Includes reserved bearings/access and full motion ranges, not the user workspace.
 */
export function solutionMetrics(graph:Mechanism){
 const frame=inverse(graph.input.target),boxes=assessConstruction(graph,1,false).boxes;
 const low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];
 for(const b of boxes){const center=compose(frame,{position:b.center,rotation:[0,0,0,1]}).position,axes=b.axes.map(a=>rotate(frame.rotation,a));
  for(let i=0;i<3;i++){const radius=axes.reduce((s,a,j)=>s+Math.abs(a[i])*b.half[j],0);low[i]=Math.min(low[i],center[i]-radius);high[i]=Math.max(high[i],center[i]+radius);}
 }
 const size=low.map((n,i)=>Number.isFinite(n)?high[i]-n:0) as V;
 const elements=graph.elements.length,shafts=graph.bodies.filter(b=>b.kind==='shaft').length;
 return {size,volume:size.reduce((v,n)=>v*n,1)/1000,stages:graph.relations.length,parts:elements+shafts,elements,shafts};
}
