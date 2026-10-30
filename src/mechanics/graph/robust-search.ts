import type {Mechanism,PairChoice} from './contracts.ts';
import {registry} from './registry.ts';
import {identity} from './frames.ts';
import {parseMechanism,resolveMechanism} from './model.ts';
import {refineGraph} from './refine.ts';
import {assessConstruction} from './construction.ts';
import type {RouteOptions} from './search.ts';
export type RobustOptions=RouteOptions&{minStages?:number;seed?:number;rules?:string[]};
export async function robustRoute(input:Mechanism,o:RobustOptions,signal?:AbortSignal,onProgress?:(n:number)=>void){
 const source=parseMechanism(input),min=o.minStages??1;
 if(!Number.isFinite(o.target)||o.target<=0||o.target>1000||!Number.isFinite(o.tolerance)||o.tolerance<0||o.tolerance>100||!Number.isInteger(min)||min<1||!Number.isInteger(o.maxStages)||o.maxStages<min||o.maxStages>4||!Number.isInteger(o.budget)||o.budget<1||o.budget>100000||(o.seed!==undefined&&!Number.isInteger(o.seed)))throw Error('Ungültige Suchgrenzen.');
 let seed=(o.seed??73421)>>>0;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
 const signature=(g:Mechanism)=>JSON.stringify([g.bodies.map(b=>[b.frame.position.map(n=>Math.round(n*10)),b.frame.rotation.map(n=>Math.round(n*1000))]),g.relations.map(r=>r.rule),g.elements.map(e=>[e.family,e.params,e.pose.position.map(n=>Math.round(n*10))])]);
 const solutions:Mechanism[]=[],reports:ReturnType<typeof assessConstruction>[]=[],rejections:Record<string,number>={};let visited=0,attempts=0;
 const providers=[...registry.rules.values()].filter(r=>r.search&&r.arity===2&&(!o.rules||o.rules.includes(r.id)));
 if(!providers.length||o.rules?.some(id=>!providers.some(r=>r.id===id)))throw Error('Keine gültige Auswahl von Suchprovidern.');
 const allowed=(g:Mechanism)=>g.relations.every(r=>providers.some(p=>p.id===r.rule))&&Math.abs(resolveMechanism(g).ratio-o.target)/o.target<=o.tolerance/100+1e-9;
 async function attempt(g:Mechanism){if(signal?.aborted)return;const variables=g.relations.reduce((s,r)=>s+(registry.getRule(r.rule).search!.variables.length+1),0),iterations=Math.min(100,Math.floor((o.budget-visited)/Math.max(1,variables+2)));if(iterations<1){visited=o.budget;return;}attempts++;try{const solved=await refineGraph(g,signal,iterations);visited+=Math.max(1,solved.iterations)*(variables+2);onProgress?.(visited);if(solved.cancelled)return;const k=resolveMechanism(solved.graph);if(!k.valid||Math.abs(k.ratio-o.target)/o.target>o.tolerance/100+1e-9){rejections.closure=(rejections.closure??0)+1;return;}const c=assessConstruction(solved.graph);if(!c.valid){rejections.space=(rejections.space??0)+1;return;}if(!resolveMechanism(c.graph).valid)return;const key=signature(c.graph);if(solutions.some(g=>signature(g)===key))return;solutions.push(c.graph);reports.push(c);}catch{visited+=Math.max(1,variables);rejections.domain=(rejections.domain??0)+1;}}
 // Group catalog choices by transfer ratio. Memoized feasibility avoids enumerating
 // every belt length / family combination for each topology.
 const groups=new Map<number,{rule:string;choice:PairChoice}[]>();
 for(const p of providers)for(const choice of p.search!.catalog()){
  const c={elements:choice.elements.map((e,i)=>({...e,id:String(i),body:String(i),pose:identity(),phase:0})),frames:[identity(),identity()],params:choice.params};
  try{p.validate(c);const transfers=p.transfers?.(c);if(choice.elements.length!==2||transfers?.length!==1||transfers[0].from!==0||transfers[0].to!==1)continue;const gain=transfers[0].gain;if(!gain||!Number.isFinite(gain))continue;const ratio=1/Math.abs(gain);groups.set(ratio,[...(groups.get(ratio)??[]),{rule:p.id,choice}]);}catch{/* Catalog combinations can be geometrically ineligible. */}
 }
 const memo=new Map<string,boolean>(),ratios=[...groups.keys()];
 const feasible=(remaining:number,ratio:number):boolean=>{
  if(!remaining)return Math.abs(ratio-o.target)/o.target<=o.tolerance/100+1e-9;
  const key=remaining+':'+ratio.toPrecision(12);if(memo.has(key))return memo.get(key)!;
  const result=ratios.some(r=>feasible(remaining-1,ratio*r));memo.set(key,result);return result;
 };
 if(source.relations.length>=min&&source.relations.length<=o.maxStages&&allowed(source))await attempt(source);
 for(let round=0;round<160&&visited<o.budget&&solutions.length<8;round++)for(let depth=min;depth<=o.maxStages&&visited<o.budget&&solutions.length<8;depth++){
  if(signal?.aborted)return {solutions,reports,rejections,visited,attempts,status:'cancelled'};if(!feasible(depth,1))continue;
  const choices:{rule:string;choice:PairChoice}[]=[];let ratio=1;
  for(let i=0;i<depth;i++){const possible=ratios.filter(r=>feasible(depth-i-1,ratio*r)),r=possible[Math.floor(random()*possible.length)],variants=groups.get(r)!;
   // Pick families first, so nine belt lengths do not crowd out gears.
   const rules=[...new Set(variants.map(v=>v.rule))],rule=rules[Math.floor(random()*rules.length)],same=variants.filter(v=>v.rule===rule);
   choices.push(same[Math.floor(random()*same.length)]);ratio*=r;
  }
  const g:Mechanism={version:1,registryVersion:registry.version,bodies:Array.from({length:depth+1},(_,i)=>({id:`r${i}`,kind:'shaft',frame:identity(),shaft:{diameter:5,start:-40,end:150}})),elements:[],relations:[],input:{...source.input,body:'r0'},output:{...source.output,body:`r${depth}`}};
  choices.forEach(({rule,choice},i)=>{
   choice.elements.forEach((e,j)=>g.elements.push({...structuredClone(e),id:`${j?'b':'a'}${i}`,body:`r${i+j}`,pose:{...identity(),position:[0,0,j?0:i?25+random()*40:random()*10]},phase:0}));
   const params={...choice.params};for(const v of registry.getRule(rule).search!.variables)params[v.key]=v.lo+random()*(v.hi-v.lo);
   g.relations.push({id:`p${i}`,rule,elements:[`a${i}`,`b${i}`],params});
  });await attempt(g);
 }
 return {solutions,reports,rejections,visited,attempts,status:signal?.aborted?'cancelled':solutions.length>=8?'solution-limit':visited>=o.budget-20?'budget':'starts-exhausted'};
}
