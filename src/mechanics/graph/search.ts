import type {Mechanism,Element} from './contracts.ts';
import {registry} from './registry.ts';
import {parseMechanism,resolveMechanism,proposeMate} from './model.ts';
import {identity,compose,inverse,norm,add,scale,rotationError,axis} from './frames.ts';
export type RouteOptions={target:number;tolerance:number;maxStages:number;budget:number;beam:number};
export async function routeGraph(input:Mechanism,o:RouteOptions,signal?:AbortSignal,onProgress?:(n:number)=>void){
 const source=parseMechanism(input);if(!Number.isFinite(o.target)||o.target<=0||o.target>1000||!Number.isFinite(o.tolerance)||o.tolerance<0||o.tolerance>100||![1,2,3,4].includes(o.maxStages)||!Number.isInteger(o.budget)||o.budget<1||o.budget>100000||!Number.isInteger(o.beam)||o.beam<1||o.beam>200)throw Error('Ungültige Suchgrenzen.');
 const root=compose(source.input.target,inverse(source.input.local));
 const base:Mechanism={version:1,registryVersion:registry.version,bodies:[{id:'route-0',kind:'shaft',frame:root,shaft:{diameter:5,start:-12,end:12}}],elements:[],relations:[],input:{...source.input,body:'route-0'},output:{...source.output,body:'route-0'}};
 type State={graph:Mechanism;gain:number;score:number};let frontier:State[]=[{graph:base,gain:1,score:0}],visited=0,pruned=false;const solutions:Mechanism[]=[];
 for(let stage=0;stage<o.maxStages;stage++){
  const next:State[]=[];
  expand: for(const state of frontier)for(const family of ['spur','bevel'])for(const za of [20,30,40])for(const zb of [20,30,40])for(const azimuth of azimuths(state.graph,family))for(const angle of angles(state.graph,family))for(const offset of offsets(state.graph,family,za,zb,angle,stage)){

   if(signal?.aborted)return {solutions,visited,status:'cancelled' as const};
   if(visited>=o.budget)return {solutions,visited,status:'budget' as const};if(visited>=Math.max(1,Math.floor(o.budget*(stage+1)/o.maxStages))){pruned=true;break expand;}visited++;
   if(visited%200===0){onProgress?.(visited);await new Promise(r=>setTimeout(r,0));}
   const gain=state.gain*(-za/zb),ratio=Math.abs(1/gain),remaining=o.maxStages-stage-1;
   if(o.target*(1-o.tolerance/100)>ratio*2**remaining||o.target*(1+o.tolerance/100)<ratio/2**remaining)continue;
   const g=structuredClone(state.graph),from=g.bodies[g.bodies.length-1],to=`route-${stage+1}`;
   from.shaft!.end=Math.max(from.shaft!.end,offset+12);
   const make=(id:string,body:string,z:number,teeth:number,phase:number):Element=>({id,body,family,pose:{...identity(),position:[0,0,z]},phase,params:{teeth,module:2,width:family==='spur'?10:6,bore:5.1}});
   const a=make(`drive-${stage}`,from.id,offset,za,0),b=make(`driven-${stage}`,to,0,zb,family==='spur'?azimuth+90-180/zb-(90-azimuth)*za/zb:180/zb+azimuth*za/zb);
   g.elements.push(a,b);g.bodies.push({id:to,kind:'shaft',frame:identity(),shaft:{diameter:5,start:-12,end:12}});
   const rel={id:`pair-${stage}`,rule:family==='spur'?'external-spur':'bevel-mesh',elements:[a.id,b.id],params:{angle,azimuth}};g.relations.push(rel);g.output={...source.output,body:to};
   try{g.bodies[g.bodies.length-1].frame=proposeMate(g,rel.id)[0].frame;}catch{continue;}
   const actual=compose(g.bodies[g.bodies.length-1].frame,g.output.local),target=g.output.target;
   const position=norm(add(actual.position,scale(target.position,-1))),orientation=rotationError(actual.rotation,target.rotation);
   const resolved=resolveMechanism(g);if(resolved.checks.some(c=>c.state==='fail'&&!c.id.endsWith('/terminal')))continue;
   if(resolved.valid&&Math.abs(ratio-o.target)/o.target<=o.tolerance/100+1e-9){solutions.push(g);if(solutions.length===12)return {solutions,visited,status:'solution-limit' as const};}
   next.push({graph:g,gain,score:position+orientation*.5+20*Math.abs(Math.log(ratio/o.target))});
  }
  next.sort((a,b)=>a.score-b.score);if(next.length>o.beam)pruned=true;const representatives=new Map<string,State>();for(const s of next){const key=[s.graph.relations[0].rule,s.graph.elements[0].params.teeth,s.graph.elements[1].params.teeth,s.graph.elements[0].pose.position[2]].join('/');if(!representatives.has(key))representatives.set(key,s);}frontier=[...new Set([...representatives.values(),...next])].slice(0,o.beam);if(!frontier.length)break;
 }
 return {solutions,visited,status:pruned?'beam-exhausted' as const:'catalog-exhausted' as const};
}

function relativeTarget(g:Mechanism){return compose(inverse(g.bodies[g.bodies.length-1].frame),compose(g.output.target,inverse(g.output.local)));}
const unique=(xs:number[])=>[...new Set(xs.filter(Number.isFinite).map(n=>Math.round(n*1e8)/1e8))];
function azimuths(g:Mechanism,family:string){const t=relativeTarget(g),v=axis(t);return unique([family==='spur'?Math.atan2(t.position[1],t.position[0])*180/Math.PI:Math.atan2(v[0],-v[1])*180/Math.PI,0,45,90,135,180,225,270,315]);}
function angles(g:Mechanism,family:string){if(family==='spur')return [90];const a=Math.acos(Math.min(1,Math.max(-1,axis(relativeTarget(g))[2])))*180/Math.PI;return unique([a,60,90,120]).filter(n=>n>=60&&n<=120);}
function offsets(g:Mechanism,family:string,za:number,zb:number,angle:number,stage:number){const s=angle*Math.PI/180,d1=Math.atan2(Math.sin(s),zb/za+Math.cos(s)),height=family==='spur'?0:za/Math.tan(d1)-zb/Math.tan(s-d1)*Math.cos(s),z=relativeTarget(g).position[2]-height;return unique([z,...(stage?[20,30,40]:[0])]).filter(n=>n>=0&&n<=150);}
