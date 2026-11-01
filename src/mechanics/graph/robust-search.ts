import type {Mechanism,PairChoice,Motion} from './contracts.ts';
import {connectionVariants,sameRotor,connectionSummary} from './topology.ts';
import {registry} from './registry.ts';
import {detourSeed} from './detours.ts';
import {identity,compose,inverse,axis,add,scale,norm,rotationError} from './frames.ts';
import {parseMechanism,resolveMechanism} from './model.ts';
import {refineGraph,reflow} from './refine.ts';
import {assessConstruction} from './construction.ts';
import type {RouteOptions} from './search.ts';
export type RobustOptions=RouteOptions&{minStages?:number;seed?:number;rules?:string[]};
export async function robustRoute(input:Mechanism,o:RobustOptions,signal?:AbortSignal,onProgress?:(n:number)=>void,onSolution?:(graph:Mechanism,report:ReturnType<typeof assessConstruction>,stats:{visited:number;attempts:number;detourStarts:number})=>void){
 const source=parseMechanism(input),min=o.minStages??1,linear=source.output.motion==='translation';
 if((source.input.motion??'rotation')!=='rotation'||source.input.element||source.output.element)throw Error('Automatische Suche benötigt Trägeranschlüsse mit rotierendem Eingang; freie Anschlusselemente sind manuell prüfbar.');
 if(!Number.isFinite(o.target)||o.target<=0||o.target>1000||!Number.isFinite(o.tolerance)||o.tolerance<0||o.tolerance>100||!Number.isInteger(min)||min<1||!Number.isInteger(o.maxStages)||o.maxStages<min||o.maxStages>4||!Number.isInteger(o.budget)||o.budget<1||o.budget>100000||(o.seed!==undefined&&!Number.isInteger(o.seed)))throw Error('Ungültige Suchgrenzen.');
 let seed=(o.seed??73421)>>>0;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
 const signature=(g:Mechanism)=>JSON.stringify([g.bodies.map(b=>[b.motion,b.frame.position.map(n=>Math.round(n*10)),b.frame.rotation.map(n=>Math.round(n*1000))]),g.relations.map(r=>[r.rule,r.elements]),g.elements.map(e=>[e.id,e.binding,e.rotorGroup,e.family,e.params,e.pose.position.map(n=>Math.round(n*10))])]);
 const solutions:Mechanism[]=[],reports:ReturnType<typeof assessConstruction>[]=[],rejections:Record<string,number>={};let visited=0,attempts=0,detourStarts=0;
 const providers=[...registry.rules.values()].filter(r=>r.search&&r.arity===2&&(r.motion?.[0]??'rotation')==='rotation'&&(!o.rules||o.rules.includes(r.id)));
 if(!providers.length||o.rules?.some(id=>!providers.some(r=>r.id===id)))throw Error('Keine gültige Auswahl von Suchprovidern.');
 const allowed=(g:Mechanism)=>g.relations.every(r=>providers.some(p=>p.id===r.rule))&&Math.abs(resolveMechanism(g).value-o.target)/o.target<=o.tolerance/100+1e-9;
 const inputFrame=compose(source.input.target,inverse(source.input.local)),parallelOutput=compose(inputFrame,source.output.local);
 const needsAxisChange=!linear&&(source.output.constraint==='frame'?rotationError(parallelOutput.rotation,source.output.target.rotation)>1e-5:norm(add(axis(parallelOutput),scale(axis(source.output.target),-1)))>1e-7);
 const refined=new Map<string,Awaited<ReturnType<typeof refineGraph>>>();
 const geometryKey=(g:Mechanism)=>g.environment?JSON.stringify(g):JSON.stringify([g.bodies.map(({motion,...b})=>b),g.elements.map(({binding,rotorGroup,...e})=>e),g.relations,g.input,g.output]);
 async function attempt(g:Mechanism){if(signal?.aborted)return;const variables=g.relations.reduce((s,r)=>s+(registry.getRule(r.rule).search!.variables.length+1),0),iterations=Math.min(100,Math.floor((o.budget-visited)/Math.max(1,variables+2)));if(iterations<1){visited=o.budget;return;}attempts++;try{const keyGeometry=geometryKey(g),cached=refined.get(keyGeometry);let solved;
 if(cached){solved=structuredClone(cached);solved.graph.version=g.version;solved.graph.bodies.forEach(b=>{const motion=g.bodies.find(x=>x.id===b.id)!.motion;if(motion===undefined)delete b.motion;else b.motion=motion;});solved.graph.elements.forEach(e=>{const source=g.elements.find(x=>x.id===e.id)!;e.phase=source.phase;if(source.binding===undefined)delete e.binding;else e.binding=source.binding;if(source.rotorGroup===undefined)delete e.rotorGroup;else e.rotorGroup=source.rotorGroup;});solved.graph=reflow(solved.graph);visited++;}
 else{solved=await refineGraph(g,signal,iterations);if(!solved.cancelled)refined.set(keyGeometry,structuredClone(solved));visited+=Math.max(1,solved.iterations)*(variables+2);}onProgress?.(visited);if(solved.cancelled)return;const k=resolveMechanism(solved.graph);if(!k.valid||Math.abs(k.value-o.target)/o.target>o.tolerance/100+1e-9){rejections.closure=(rejections.closure??0)+1;return;}const c=assessConstruction(solved.graph);if(!c.valid){rejections.space=(rejections.space??0)+1;return;}if(!resolveMechanism(c.graph).valid)return;const key=signature(c.graph);if(solutions.some(g=>signature(g)===key))return;solutions.push(c.graph);reports.push(c);onSolution?.(structuredClone(c.graph),structuredClone(c),{visited,attempts,detourStarts});}catch{visited+=Math.max(1,variables);rejections.domain=(rejections.domain??0)+1;}}
 // Group catalog choices by transfer ratio. Memoized feasibility avoids enumerating
 // every belt length / family combination for each topology.
 const groups=new Map<string,{factor:number;motion:Motion;variants:{rule:string;choice:PairChoice}[]}>();
 for(const p of providers)for(const choice of p.search!.catalog({stroke:source.output.stroke})){
  const c={elements:choice.elements.map((e,i)=>({...e,id:String(i),body:String(i),pose:identity(),phase:0})),frames:[identity(),identity()],params:choice.params};
  try{p.validate(c);const transfers=p.transfers?.(c);if(choice.elements.length!==2||transfers?.length!==1||transfers[0].from!==0||transfers[0].to!==1)continue;const gain=transfers[0].gain;if(!gain||!Number.isFinite(gain))continue;const factor=1/Math.abs(gain),motion=p.motion?.[1]??'rotation',key=motion+':'+factor;groups.set(key,{factor,motion,variants:[...(groups.get(key)?.variants??[]),{rule:p.id,choice}]});}catch{/* Catalog combinations can be geometrically ineligible. */}
 }
 const memo=new Map<string,boolean>(),ratios=[...groups.keys()];
 const feasible=(remaining:number,ratio:number):boolean=>{
  if(!remaining)return Math.abs((linear?1/ratio:ratio)-o.target)/o.target<=o.tolerance/100+1e-9;
  const key=remaining+':'+ratio.toPrecision(12);if(memo.has(key))return memo.get(key)!;
  const result=ratios.some(r=>{const group=groups.get(r)!;return group.motion===(linear&&remaining===1?'translation':'rotation')&&feasible(remaining-1,ratio*group.factor);});memo.set(key,result);return result;
 };
 const active=()=>visited<o.budget&&solutions.length<8&&!signal?.aborted;
 async function explore(g:Mechanism,round:number,warm=false){
  const variants=connectionVariants(g);
  if(!g.environment){for(const variant of variants){if(!active())break;await attempt(variant);}return;}
  // Interleave layout and connection choices instead of spending the entire budget
  // on every binding variant of the same trapped initial layout.
  const count=warm?9:3;
  const sectors=[0,4,2,6,1,5,3,7,8,12,10,14,9,13,11,15];
  for(let j=0;j<count&&active();j++){
   const variant=variants[j%variants.length];
   if(j===0){await attempt(variant);continue;}
   try{visited++;detourStarts++;await attempt(detourSeed(variant,sectors[warm?j-1:(round*2+j-1)%16]));}
   catch{rejections.seed=(rejections.seed??0)+1;}
  }
  if(active()&&variants.length>1)await attempt(variants[1+round%(variants.length-1)]);
 }
 if(source.relations.length>=min&&source.relations.length<=o.maxStages&&allowed(source))await explore(source,0,true);
 for(let round=0;round<160&&visited<o.budget&&solutions.length<8;round++)for(let depth=min;depth<=o.maxStages&&visited<o.budget&&solutions.length<8;depth++){
  if(signal?.aborted)return {solutions,reports,rejections,visited,attempts,detourStarts,status:'cancelled'};if(!feasible(depth,1))continue;
  const choices:{rule:string;choice:PairChoice}[]=[];let ratio=1;
  for(let i=0;i<depth;i++){const possible=ratios.filter(r=>groups.get(r)!.motion===(linear&&i===depth-1?'translation':'rotation')&&feasible(depth-i-1,ratio*groups.get(r)!.factor)),r=possible[Math.floor(random()*possible.length)],variants=groups.get(r)!.variants;
   // Pick families first, so nine belt lengths do not crowd out gears.
   let pool=variants;
   if(round%2===0&&choices.length){const previous=choices.at(-1)!;const compatible=variants.filter(v=>registry.getRule(previous.rule).search?.sharedRotor&&registry.getRule(v.rule).search?.sharedRotor&&sameRotor(previous.choice.elements[1],v.choice.elements[0]));if(compatible.length)pool=compatible;}
   const rules=[...new Set(pool.map(v=>v.rule))],rule=rules[Math.floor(random()*rules.length)],same=pool.filter(v=>v.rule===rule);
   choices.push(same[Math.floor(random()*same.length)]);ratio*=groups.get(r)!.factor;
  }
  if(source.environment&&needsAxisChange&&choices.every(c=>registry.getRule(c.rule).search?.changesAxis===false)){visited++;rejections.orientation=(rejections.orientation??0)+1;continue;}
  const g:Mechanism={version:source.environment?4:2,...(source.environment?{environment:structuredClone(source.environment)}:{}),registryVersion:registry.version,bodies:Array.from({length:depth+1},(_,i)=>({id:`r${i}`,kind:linear&&i===depth?'rigid':'shaft',motion:linear&&i===depth?'translation':'rotation',frame:identity(),...(linear&&i===depth?{}:{shaft:{diameter:5,start:-40,end:150}})})),elements:[],relations:[],input:{...source.input,body:'r0'},output:{...source.output,body:`r${depth}`}};
  choices.forEach(({rule,choice},i)=>{
   choice.elements.forEach((e,j)=>g.elements.push({...structuredClone(e),id:`${j?'b':'a'}${i}`,body:`r${i+j}`,pose:{...identity(),position:[0,0,j?0:i?25+random()*40:random()*10]},phase:0,binding:'fixed'}));
   const params={...choice.params};for(const v of registry.getRule(rule).search!.variables)params[v.key]=v.lo+random()*(v.hi-v.lo);
   g.relations.push({id:`p${i}`,rule,elements:[`a${i}`,`b${i}`],params});
  });await explore(g,round);
 }
 const ranked=solutions.map((g,i)=>({g,report:reports[i],score:connectionSummary(g)})).sort((a,b)=>a.score.driveShafts-b.score.driveShafts||a.score.elements-b.score.elements);solutions.splice(0,solutions.length,...ranked.map(x=>x.g));reports.splice(0,reports.length,...ranked.map(x=>x.report));
 return {solutions,reports,rejections,visited,attempts,detourStarts,status:signal?.aborted?'cancelled':solutions.length>=8?'solution-limit':visited>=o.budget-20?'budget':'starts-exhausted'};
}
