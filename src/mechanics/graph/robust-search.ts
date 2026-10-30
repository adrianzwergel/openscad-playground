import type {Mechanism,Element} from './contracts.ts';
import {registry} from './registry.ts';
import {identity} from './frames.ts';
import {parseMechanism,resolveMechanism} from './model.ts';
import {refineGraph} from './refine.ts';
import {assessConstruction} from './construction.ts';
import type {RouteOptions} from './search.ts';
export type RobustOptions=RouteOptions&{minStages?:number;seed?:number};
export async function robustRoute(input:Mechanism,o:RobustOptions,signal?:AbortSignal,onProgress?:(n:number)=>void){
 const source=parseMechanism(input),min=o.minStages??1;
 if(!Number.isFinite(o.target)||o.target<=0||o.target>1000||!Number.isFinite(o.tolerance)||o.tolerance<0||o.tolerance>100||!Number.isInteger(min)||min<1||!Number.isInteger(o.maxStages)||o.maxStages<min||o.maxStages>4||!Number.isInteger(o.budget)||o.budget<1||o.budget>100000||(o.seed!==undefined&&!Number.isInteger(o.seed)))throw Error('Ungültige Suchgrenzen.');
 let seed=(o.seed??73421)>>>0;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
 const signature=(g:Mechanism)=>JSON.stringify([g.bodies.map(b=>[b.frame.position.map(n=>Math.round(n*10)),b.frame.rotation.map(n=>Math.round(n*1000))]),g.relations.map(r=>r.rule),g.elements.map(e=>[e.family,e.params,e.pose.position.map(n=>Math.round(n*10))])]);
 const solutions:Mechanism[]=[],reports:ReturnType<typeof assessConstruction>[]=[],rejections:Record<string,number>={};let visited=0,attempts=0;
 const allowed=(g:Mechanism)=>{const ratio=g.relations.reduce((p,r)=>{const [a,b]=r.elements.map(id=>g.elements.find(e=>e.id===id)!);return p*b.params.teeth/a.params.teeth;},1);return Math.abs(ratio-o.target)/o.target<=o.tolerance/100+1e-9;};
 async function attempt(g:Mechanism){if(signal?.aborted)return;const variables=g.relations.reduce((s,r)=>s+(r.rule==='bevel-mesh'?3:2),0),iterations=Math.min(100,Math.floor((o.budget-visited)/Math.max(1,variables+2)));if(iterations<1){visited=o.budget;return;}attempts++;try{const solved=await refineGraph(g,signal,iterations);visited+=Math.max(1,solved.iterations)*(variables+2);onProgress?.(visited);if(solved.cancelled)return;const k=resolveMechanism(solved.graph);if(!k.valid){rejections.closure=(rejections.closure??0)+1;return;}const c=assessConstruction(solved.graph);if(!c.valid){rejections.space=(rejections.space??0)+1;return;}if(!resolveMechanism(c.graph).valid)return;const key=signature(c.graph);if(solutions.some(g=>signature(g)===key))return;solutions.push(c.graph);reports.push(c);}catch{visited+=Math.max(1,variables);rejections.domain=(rejections.domain??0)+1;}}
 // Fair, round-robin depth schedule: longer chains cannot be starved by two-stage expansion.
 const catalogs=new Map<number,{za:number;zb:number}[][]>();
 for(let depth=min;depth<=o.maxStages;depth++){const all:{za:number;zb:number}[][]=[];const enumerate=(path:{za:number;zb:number}[],ratio:number)=>{if(path.length===depth){if(Math.abs(ratio-o.target)/o.target<=o.tolerance/100+1e-9)all.push(path);return;}for(const za of [20,30,40])for(const zb of [20,30,40])enumerate([...path,{za,zb}],ratio*zb/za);};enumerate([],1);catalogs.set(depth,all);}
 if(source.relations.length>=min&&source.relations.length<=o.maxStages&&allowed(source))await attempt(source);
 for(let round=0;round<160&&visited<o.budget&&solutions.length<8;round++)for(let depth=min;depth<=o.maxStages&&visited<o.budget&&solutions.length<8;depth++){
  if(signal?.aborted)return {solutions,reports,rejections,visited,attempts,status:'cancelled'};const choices=catalogs.get(depth)!;if(!choices.length)continue;const teeth=choices[Math.floor(random()*choices.length)];
  const families=Array.from({length:depth},(_,i)=>round%4===0?'spur':round%4===1?(i===depth-1?'bevel':'spur'):random()<.55?'spur':'bevel');
  const g:Mechanism={version:1,registryVersion:registry.version,bodies:Array.from({length:depth+1},(_,i)=>({id:`r${i}`,kind:'shaft',frame:identity(),shaft:{diameter:5,start:-40,end:150}})),elements:[],relations:[],input:{...source.input,body:'r0'},output:{...source.output,body:`r${depth}`}};
  teeth.forEach((t,i)=>{const family=families[i];const element=(id:string,body:string,teeth:number,z:number):Element=>({id,body,family,pose:{...identity(),position:[0,0,z]},phase:0,params:{teeth,module:2,width:family==='spur'?10:6,bore:5.1}});g.elements.push(element(`a${i}`,`r${i}`,t.za,i?25+random()*40:random()*10),element(`b${i}`,`r${i+1}`,t.zb,0));g.relations.push({id:`p${i}`,rule:family==='spur'?'external-spur':'bevel-mesh',elements:[`a${i}`,`b${i}`],params:{azimuth:random()*300-150,angle:70+random()*40}});});await attempt(g);
 }
 return {solutions,reports,rejections,visited,attempts,status:signal?.aborted?'cancelled':solutions.length>=8?'solution-limit':visited>=o.budget-20?'budget':'starts-exhausted'};
}
