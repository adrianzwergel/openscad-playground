// The element-graph search API on the kinematics core (KINEMATIK-KERN.md 10,
// phase 6). Studio, workbench and their tests keep calling `robustRoute` with
// element-graph documents; the search runs on chains and every result is
// translated back, checked by the element-graph construction gate and
// reported in the old shape.
import type {Mechanism as Old,Element as OldElement,Relation as OldRelation,PairChoice as OldChoice} from '../graph/contracts.ts';
import {parseMechanism,resolveMechanism} from '../graph/model.ts';
import {reflow as reflowGraph} from '../graph/refine.ts';
import {assessConstruction} from '../graph/construction.ts';
import {assessNearMiss} from '../graph/near-misses.ts';
import type {NearMiss as OldNearMiss} from '../graph/near-misses.ts';
import {parseCatalog,catalogChoices,catalogAllows} from '../graph/catalog.ts';
import type {SearchCatalog} from '../graph/catalog.ts';
import type {Chain,Stage,FrameTerminal} from './chain.ts';
import {reflow,linearOutput} from './chain.ts';
import type {PairChoice} from './catalog.ts';
import {providers} from './catalog.ts';
import type {Provider,ElementSpec} from './catalog.ts';
import {registry} from '../graph/registry.ts';
import {identity} from './math.ts';
import {route} from './search/route.ts';
import {detourSeed as detourChain} from './search/detours.ts';
import {refineChain} from './refine.ts';
import type {RouteSolution} from './search/route.ts';

export type RouteOptions={target:number;tolerance:number;maxStages:number;budget:number;beam:number};
export type RobustOptions=RouteOptions&{catalog?:SearchCatalog;minStages?:number;seed?:number;rules?:string[];includeNearMisses?:boolean};
type Report=ReturnType<typeof assessConstruction>;

const sameParams=(a:Record<string,number>,b:Record<string,number>)=>Object.keys(a).length===Object.keys(b).length&&Object.entries(a).every(([k,v])=>b[k]===v);
const sameLegacy=(spec:{legacy:{family:string;params:Record<string,number>}},e:Pick<OldElement,'family'|'params'>)=>spec.legacy.family===e.family&&sameParams(spec.legacy.params,e.params);
const terminal=(t:Old['input']):FrameTerminal=>({kind:'frame',body:t.body,local:t.local,target:t.target,constraint:t.constraint,...(t.tolerance?{tolerance:t.tolerance}:{})});
const element=(id:string,spec:PairChoice['a'],body:string,z:number,roll=0):OldElement=>({id,family:spec.legacy.family,params:{...spec.legacy.params},body,binding:'fixed',pose:{position:[0,0,z],rotation:[0,0,Math.sin(roll*Math.PI/360),Math.cos(roll*Math.PI/360)]},phase:0});

/** A chain as an element-graph document; frames and phases come from the element-graph reflow. */
export function toGraph(c:Chain,source:Old):Old{
 const n=c.stages.length,r=reflow(c),linear=linearOutput(c),compound=c.stages.some(s=>s.join==='compound');
 const g:Old={version:source.environment?4:compound?3:2,registryVersion:source.registryVersion,...(source.environment?{environment:structuredClone(source.environment)}:{}),
  bodies:Array.from({length:n+1},(_,i)=>linear&&i===n?{id:'d'+i,kind:'rigid' as const,motion:'translation' as const,frame:r.shafts[i]}:{id:'d'+i,kind:'shaft' as const,motion:'rotation' as const,frame:r.shafts[i],shaft:{diameter:5,start:-150,end:150}}),
  elements:[],relations:[],input:{...source.input,body:'d0'},output:{...source.output,body:'d'+n}};
 c.stages.forEach((s,i)=>{
  let driver=`d${i}-0`;
  if(s.join==='shared'){driver=`d${i-1}-1`;const keep=g.elements.find(e=>e.id===driver)!,cross=s.choice.a.mount==='technic-cross';keep.binding=cross?'fixed':'free';g.bodies[i].motion=cross?'rotation':'fixed';}
  else g.elements.push(element(driver,s.choice.a,'d'+i,s.seat));
  if(s.join==='compound'){const group='rotor-'+i;for(const id of [`d${i-1}-1`,driver]){const e=g.elements.find(x=>x.id===id)!;e.binding='free';e.rotorGroup=group;}g.bodies[i].motion='fixed';}
  const last=i===n-1;g.elements.push(element(`d${i}-1`,s.choice.b,'d'+(i+1),last&&!s.choice.linear?c.lastSeat:0,last&&!s.choice.linear?c.lastRoll:0));
  g.relations.push({id:'p'+i,rule:s.choice.rule,elements:[driver,`d${i}-1`],params:{...s.params}});
 });
 return reflowGraph(g);
}
/** An ordered element-graph chain as a search chain, or undefined if it is not one. */
export function chainFromGraph(input:Old):Chain|undefined{
 try{
  const g=parseMechanism(input),stages:Stage[]=[];let body=g.input.body,previous:OldElement|undefined;
  for(let i=0;i<g.relations.length;i++){
   const rel=g.relations.find(r=>g.elements.find(e=>e.id===r.elements[0])!.body===body&&!stages.some((_,k)=>g.relations[k]===r));if(!rel)return undefined;
   const [a,b]=rel.elements.map(id=>g.elements.find(e=>e.id===id)!);
   if(Math.hypot(a.pose.position[0],a.pose.position[1])>1e-9||Math.hypot(a.pose.rotation[0],a.pose.rotation[1],a.pose.rotation[2])>1e-9)return undefined;
   const provider=providers.find(p=>p.id===rel.rule);if(!provider)return undefined;
   const choice=provider.catalog({stroke:g.output.stroke}).find(c=>sameLegacy(c.a,a)&&sameLegacy(c.b,b)&&(c.params.length===undefined||c.params.length===rel.params.length));if(!choice)return undefined;
   const join=previous&&previous.id===a.id?'shared':previous&&a.rotorGroup&&a.rotorGroup===previous.rotorGroup?'compound':'fixed';
   stages.push({choice,params:{...choice.params,...rel.params},seat:a.pose.position[2],join});previous=b;body=b.body;
   g.relations.splice(g.relations.indexOf(rel),1,rel);
  }
  if(body!==g.output.body||!stages.length)return undefined;
  const last=previous!,roll=2*Math.atan2(last.pose.rotation[2],last.pose.rotation[3])*180/Math.PI;
  return {input:terminal(g.input),output:terminal(g.output),stages,lastSeat:last.pose.position[2],lastRoll:roll,...(g.environment?{environment:g.environment}:{})};
 }catch{return undefined;}
}

/** A search provider for an element-graph rule the catalog does not know (registered at runtime).
 * Mate frames, ratio and envelopes come from the rule and its families. */
export function legacyProvider(id:string):Provider|undefined{
 const rule=registry.rules.get(id);if(!rule?.search||rule.arity!==2||!rule.mateFrames||(rule.motion?.[1]??'rotation')!=='rotation')return undefined;
 const known=providers.flatMap(p=>p.catalog()).flatMap(c=>[c.a,c.b]);
 const spec=(e:{family:string;params:Record<string,number>}):ElementSpec=>{const hit=known.find(s=>sameLegacy(s,e));if(hit)return hit;const family=registry.getFamily(e.family),env=family.envelope({...e,id:'x',body:'x',pose:identity(),phase:0});
  return {key:`${e.family}:${JSON.stringify(e.params)}`,label:e.family,source:{kind:'printed'},surfaces:[],interfaces:[{id:'bore',kind:'bore',diameter:5,z:[env.min,env.max]}],envelope:env,mount:'bore',compoundRotor:!!family.compoundRotor,legacy:{family:e.family,params:{...e.params}}};};
 const context=(c:OldChoice,params:Record<string,number>)=>({elements:c.elements.map((e,j)=>({...e,id:String(j),body:String(j),pose:identity(),phase:0})),frames:[identity(),identity()],params});
 const search=rule.search;
 return {id,changesAxis:!!search.changesAxis,sharedRotor:!!search.sharedRotor,variables:search.variables,catalog:()=>search.catalog({}).flatMap(c=>{
  try{const t=rule.transfers?.(context(c,c.params));if(t?.length!==1||!t[0].gain)return [];const gain=t[0].gain;
   return [{rule:id,kind:'roll' as const,a:spec(c.elements[0]),b:spec(c.elements[1]),params:{...c.params},variables:search.variables,changesAxis:!!search.changesAxis,sharedRotor:!!search.sharedRotor,ratio:Math.abs(gain),factor:1/Math.abs(gain),mate:(params:Record<string,number>)=>rule.mateFrames!(context(c,params))[0]}];
  }catch{return [];}})};
}
export async function robustRoute(input:Old,o:RobustOptions,signal?:AbortSignal,onProgress?:(n:number)=>void,onSolution?:(graph:Old,report:Report,stats:{visited:number;attempts:number;detourStarts:number})=>void,onNearMisses?:(candidates:OldNearMiss[])=>void){
 const stock=o.catalog?parseCatalog(o.catalog):undefined;
 const source=parseMechanism(input),min=o.minStages??1,linear=source.output.motion==='translation';
 if((source.input.motion??'rotation')!=='rotation'||source.input.element||source.output.element)throw Error('Automatische Suche benötigt Trägeranschlüsse mit rotierendem Eingang; freie Anschlusselemente sind manuell prüfbar.');
 if(!Number.isFinite(o.target)||o.target<=0||o.target>1000||!Number.isFinite(o.tolerance)||o.tolerance<0||o.tolerance>100||!Number.isInteger(min)||min<1||!Number.isInteger(o.maxStages)||o.maxStages<min||o.maxStages>4||!Number.isInteger(o.budget)||o.budget<1||o.budget>100000||(o.seed!==undefined&&!Number.isInteger(o.seed)))throw Error('Ungültige Suchgrenzen.');
 const rules=o.rules??providers.filter(p=>!['generated-mate'].includes(p.id)).map(p=>p.id);
 const extra=rules.filter(id=>!providers.some(p=>p.id===id)).map(id=>legacyProvider(id));
 if(extra.some(p=>!p))throw Error('Keine gültige Auswahl von Suchprovidern.');
 // Stock: only catalog pairs whose parts are released, and quantities checked on every result.
 const inStock=stock?(()=>{const keys=new Map<string,Set<string>>();const key=(rule:string,elements:{family:string;params:Record<string,number>}[],length?:number)=>JSON.stringify([rule,elements.map(e=>[e.family,Object.entries(e.params).sort(([a],[b])=>a.localeCompare(b))]),length??null]);
  for(const id of rules){const set=new Set<string>();for(const c of catalogChoices(id,stock,source.output.stroke) as OldChoice[])set.add(key(id,c.elements,c.params.length));keys.set(id,set);}
  return (c:PairChoice)=>keys.get(c.rule)?.has(key(c.rule,[c.a.legacy,c.b.legacy],c.params.length))??false;})():undefined;
 const graphs=new Map<RouteSolution,{graph:Old;report:Report}>();
 const accept=(s:RouteSolution)=>{
  const graph=toGraph(s.chain,source);
  if(stock&&!catalogAllows(graph,stock))return 'inventory';
  const report=assessConstruction(graph);if(!report.valid)return 'space';
  const k=resolveMechanism(report.graph);if(!k.valid||Math.abs(k.value-o.target)/o.target>o.tolerance/100+1e-9)return 'closure';
  graphs.set(s,{graph:report.graph,report});return undefined;
 };
 const start=source.relations.length>=min&&source.relations.length<=o.maxStages?chainFromGraph(source):undefined;
 const nearMisses:OldNearMiss[]=[];
 const r=await route({input:terminal(source.input),output:terminal(source.output),...(source.environment?{environment:source.environment}:{}),...(linear?{motion:'translation' as const,stroke:source.output.stroke}:{})},
  {target:o.target,tolerance:o.tolerance,minStages:min,maxStages:o.maxStages,budget:o.budget,seed:o.seed,rules,extraProviders:extra as Provider[],includeNearMisses:o.includeNearMisses,filter:inStock,accept,starts:start?[start]:[],
   onNearMisses:list=>{nearMisses.length=0;for(const n of list){const c=assessNearMiss(toGraph(n.chain,source));if(c)nearMisses.push(c);}onNearMisses?.(structuredClone(nearMisses));}},
  signal,onProgress,(s,stats)=>{const {graph,report}=graphs.get(s)!;onSolution?.(structuredClone(graph),structuredClone(report),stats);});
 const solved=r.solutions.map(s=>graphs.get(s)!);
 return {solutions:solved.map(x=>x.graph),reports:solved.map(x=>x.report),nearMisses,rejections:r.rejections,visited:r.visited,attempts:r.attempts,detourStarts:r.detourStarts,status:r.status};
}
export type {OldRelation};

/** Detour seed on an element-graph chain (see search/detours.ts). */
export function detourSeed(input:Old,sector:number):Old{
 const c=chainFromGraph(input);if(!c)throw Error('Umfahrungsstart braucht eine gerichtete offene Kette.');
 return toGraph(detourChain(c,sector),parseMechanism(input));
}
/** Continuous refinement of an element-graph chain (see refine.ts). */
export async function refineGraph(input:Old,signal?:AbortSignal,iterations=100){
 const c=chainFromGraph(input);if(!c)throw Error('Optimierung benötigt eine gerichtete offene Kette.');
 const r=await refineChain(c,{iterations,signal});
 return {graph:toGraph(r.chain,parseMechanism(input)),error:r.error,iterations:r.iterations,cancelled:r.cancelled};
}
/** The element graph's simple router: spur and bevel pairs only, on the kinematics search. */
export async function routeGraph(input:Old,o:RouteOptions,signal?:AbortSignal,onProgress?:(n:number)=>void){
 if(!Number.isFinite(o.target)||o.target<=0||o.target>1000||!Number.isFinite(o.tolerance)||o.tolerance<0||o.tolerance>100||![1,2,3,4].includes(o.maxStages)||!Number.isInteger(o.budget)||o.budget<1||o.budget>100000||!Number.isInteger(o.beam)||o.beam<1||o.beam>200)throw Error('Ungültige Suchgrenzen.');
 if(signal?.aborted)return {solutions:[] as Old[],visited:0,status:'cancelled' as const};
 const r=await robustRoute(input,{...o,minStages:1,rules:['external-spur','bevel-mesh']},signal,onProgress);
 return {solutions:r.solutions,visited:r.visited,status:r.status==='cancelled'?'cancelled' as const:r.status==='budget'?'budget' as const:r.status==='solution-limit'?'solution-limit' as const:'catalog-exhausted' as const};
}
