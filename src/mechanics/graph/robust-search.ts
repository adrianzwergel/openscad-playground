import {parseCatalog,catalogChoices,catalogAllows} from './catalog.ts';
import type {SearchCatalog} from './catalog.ts';
import {assessNearMiss} from './near-misses.ts';
import type {NearMiss} from './near-misses.ts';
import type {Mechanism,PairChoice,Motion} from './contracts.ts';
import {connectionVariants,sameRotor,connectionSummary} from './topology.ts';
import {registry} from './registry.ts';
import {detourSeed} from './detours.ts';
import {identity,compose,inverse,axis,add,scale,norm,rotate,multiply,inverseQ} from './frames.ts';
import {turnReach} from './reach.ts';
import {closureSeeds} from './closure.ts';
import {parseMechanism,resolveMechanism} from './model.ts';
import {refineGraph,reflow} from './refine.ts';
import {assessConstruction} from './construction.ts';
import type {RouteOptions} from './search.ts';
export type RobustOptions=RouteOptions&{catalog?:SearchCatalog;minStages?:number;seed?:number;rules?:string[];includeNearMisses?:boolean};
export async function robustRoute(input:Mechanism,o:RobustOptions,signal?:AbortSignal,onProgress?:(n:number)=>void,onSolution?:(graph:Mechanism,report:ReturnType<typeof assessConstruction>,stats:{visited:number;attempts:number;detourStarts:number})=>void,onNearMisses?:(candidates:NearMiss[])=>void){
 const stock=o.catalog?parseCatalog(o.catalog):undefined;
 const source=parseMechanism(input),min=o.minStages??1,linear=source.output.motion==='translation';
 if((source.input.motion??'rotation')!=='rotation'||source.input.element||source.output.element)throw Error('Automatische Suche benötigt Trägeranschlüsse mit rotierendem Eingang; freie Anschlusselemente sind manuell prüfbar.');
 if(!Number.isFinite(o.target)||o.target<=0||o.target>1000||!Number.isFinite(o.tolerance)||o.tolerance<0||o.tolerance>100||!Number.isInteger(min)||min<1||!Number.isInteger(o.maxStages)||o.maxStages<min||o.maxStages>4||!Number.isInteger(o.budget)||o.budget<1||o.budget>100000||(o.seed!==undefined&&!Number.isInteger(o.seed)))throw Error('Ungültige Suchgrenzen.');
 let seed=(o.seed??73421)>>>0;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
 const signature=(g:Mechanism)=>JSON.stringify([g.bodies.map(b=>[b.motion,b.frame.position.map(n=>Math.round(n*10)),b.frame.rotation.map(n=>Math.round(n*1000))]),g.relations.map(r=>[r.rule,r.elements]),g.elements.map(e=>[e.id,e.binding,e.rotorGroup,e.family,e.params,e.pose.position.map(n=>Math.round(n*10))])]);
 const nearMisses:NearMiss[]=[];const solutions:Mechanism[]=[],reports:ReturnType<typeof assessConstruction>[]=[],rejections:Record<string,number>={};let visited=0,attempts=0,detourStarts=0;
 const providers=[...registry.rules.values()].filter(r=>r.search&&r.arity===2&&(r.motion?.[0]??'rotation')==='rotation'&&(!o.rules||o.rules.includes(r.id)));
 if(!providers.length||o.rules?.some(id=>!providers.some(r=>r.id===id)))throw Error('Keine gültige Auswahl von Suchprovidern.');
 const allowed=(g:Mechanism)=>(!stock||catalogAllows(g,stock))&&g.relations.every(r=>providers.some(p=>p.id===r.rule))&&Math.abs(resolveMechanism(g).value-o.target)/o.target<=o.tolerance/100+1e-9;
 const inputFrame=compose(source.input.target,inverse(source.input.local)),parallelOutput=compose(inputFrame,source.output.local);
 const needsAxisChange=!linear&&norm(add(axis(parallelOutput),scale(axis(source.output.target),-1)))>2*Math.sin((source.output.tolerance?.angle??0)*Math.PI/360)+1e-7;
 // Single-turn reach and center distances, cached per catalog entry.
 const {centerDistance,turnOffset,turnSlack,across,reachable,applies:singleTurn}=turnReach(source);
 const refined=new Map<string,Awaited<ReturnType<typeof refineGraph>>>();
 const geometryKey=(g:Mechanism)=>g.environment?JSON.stringify(g):JSON.stringify([g.bodies.map(({motion,...b})=>b),g.elements.map(({binding,rotorGroup,...e})=>e),g.relations,g.input,g.output]);
 async function attempt(g:Mechanism){if(signal?.aborted)return;if(stock&&!catalogAllows(g,stock)){visited++;rejections.inventory=(rejections.inventory??0)+1;return;}const variables=2+g.relations.reduce((s,r)=>s+(registry.getRule(r.rule).search!.variables.length+1),0),iterations=Math.min(100,Math.floor((o.budget-visited)/Math.max(1,variables+2)));if(iterations<1){visited=o.budget;return;}attempts++;try{const keyGeometry=geometryKey(g),cached=refined.get(keyGeometry);let solved;
 if(cached){solved=structuredClone(cached);solved.graph.version=g.version;solved.graph.bodies.forEach(b=>{const motion=g.bodies.find(x=>x.id===b.id)!.motion;if(motion===undefined)delete b.motion;else b.motion=motion;});solved.graph.elements.forEach(e=>{const source=g.elements.find(x=>x.id===e.id)!;e.phase=source.phase;if(source.binding===undefined)delete e.binding;else e.binding=source.binding;if(source.rotorGroup===undefined)delete e.rotorGroup;else e.rotorGroup=source.rotorGroup;});solved.graph=reflow(solved.graph);visited++;}
 else{solved=await refineGraph(g,signal,iterations);if(!solved.cancelled)refined.set(keyGeometry,structuredClone(solved));visited+=Math.max(1,solved.iterations)*(variables+2);}onProgress?.(visited);if(solved.cancelled)return;const k=resolveMechanism(solved.graph);if(!k.valid||Math.abs(k.value-o.target)/o.target>o.tolerance/100+1e-9){rejections.closure=(rejections.closure??0)+1;
 if(o.includeNearMisses&&Math.abs(k.value-o.target)/o.target<=o.tolerance/100+1e-9){const candidate=assessNearMiss(solved.graph);if(candidate){const key=signature(candidate.graph);if(!nearMisses.some(n=>signature(n.graph)===key)){const previous=nearMisses.map(n=>signature(n.graph)).join('|');nearMisses.push(candidate);nearMisses.sort((a,b)=>a.score-b.score);nearMisses.splice(3);if(previous!==nearMisses.map(n=>signature(n.graph)).join('|'))onNearMisses?.(structuredClone(nearMisses));}}}
 return;}let c=assessConstruction(solved.graph);
 // Without an environment, refinement ignores internal clearance. A closed
 // chain that only collides gets a short second pass with collision residuals.
 if(!c.valid&&!solved.graph.environment&&c.checks.every(x=>x.state!=='fail'||x.id.startsWith('space/'))){
  const left=Math.min(60,Math.floor((o.budget-visited)/Math.max(1,variables+2)));
  if(left>=5){const repaired=await refineGraph(solved.graph,signal,left,{clearance:1.5});visited+=Math.max(1,repaired.iterations)*(variables+2);if(repaired.cancelled)return;
   const r=resolveMechanism(repaired.graph);if(r.valid&&Math.abs(r.value-o.target)/o.target<=o.tolerance/100+1e-9){const next=assessConstruction(repaired.graph);if(next.valid){c=next;rejections.repaired=(rejections.repaired??0)+1;}}}
 }
 if(!c.valid){rejections.space=(rejections.space??0)+1;return;}if(!resolveMechanism(c.graph).valid)return;const key=signature(c.graph);if(solutions.some(g=>signature(g)===key))return;solutions.push(c.graph);reports.push(c);onSolution?.(structuredClone(c.graph),structuredClone(c),{visited,attempts,detourStarts});}catch{visited+=Math.max(1,variables);rejections.domain=(rejections.domain??0)+1;}}
 // Group catalog choices by transfer ratio. Memoized feasibility avoids enumerating
 // every belt length / family combination for each topology.
 const groups=new Map<string,{factor:number;motion:Motion;variants:{rule:string;choice:PairChoice}[]}>();
 for(const p of providers)for(const choice of (stock?catalogChoices(p.id,stock,source.output.stroke):p.search!.catalog({stroke:source.output.stroke}))){
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
 // Directed starts must use the same connection alternatives as random starts.
 // First try the compact shared-rotor form, then retain the separate-layer form.
 async function attemptConnections(g:Mechanism){
  const variants=connectionVariants(g);
  for(const candidate of variants.slice(0,2)){if(!active())break;await attempt(candidate);}
 }
 // Chains with a change of axis rarely close from heuristic or random layouts.
 // Meet-in-the-middle starts close them first; clearance is refined afterwards.
 let closureRound=0;
 async function closureStarts(g:Mechanism){
  if(!active())return;
  for(const seed of closed(g,2)){if(!active())break;await attemptConnections(seed);}
 }
 function closed(g:Mechanism,count:number){
  if(!g.relations.some(r=>registry.getRule(r.rule).search?.changesAxis))return [];
  const {seeds,work}=closureSeeds(g,{count,samples:300,seed:((o.seed??73421)+(++closureRound)*7919)>>>0});visited+=Math.ceil(work/20);return seeds;
 }
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
 if(source.relations.length>=min&&source.relations.length<=o.maxStages&&allowed(source))await (source.relations.length>=3?explore(source,0,true):attemptConnections(source));
 // Budgeted, directed starts before the random tail. Enumerate pair families
 // and ratio-compatible catalogs, then vary signed layers on both sides of a shaft.
 // This also avoids belt lengths dominating the choice of transmission families.
 {
  const straight=providers.filter(p=>p.search?.changesAxis===false),turns=providers.filter(p=>p.search?.changesAxis===true);
  const patterns:string[][]=[];
  for(let depth=min;depth<=o.maxStages;depth++)for(const p of straight){
   if(!needsAxisChange||o.includeNearMisses)patterns.push(Array(depth).fill(p.id));
   for(const turn of needsAxisChange?turns:[])for(const index of [...new Set([Math.floor(depth/2),depth-1,0,...Array.from({length:depth},(_,i)=>i)])]){const pattern=Array(depth).fill(p.id);pattern[index]=turn.id;patterns.push(pattern);}
  }
  if(linear){
   patterns.length=0;
   const terminal=providers.filter(p=>p.motion?.[1]==='translation');
   for(let depth=min;depth<=o.maxStages;depth++)for(const end of terminal){
    if(depth===1){patterns.push([end.id]);continue;}
    for(const p of [...straight,...turns]){patterns.push([...Array(depth-1).fill(p.id),end.id]);}
   }
  }
  if(needsAxisChange){
   const extra:string[][]=[];
   for(let depth=min;depth<=o.maxStages;depth++)for(const turn of turns)for(let count=2;count<=Math.min(depth,3);count++){
    for(const p of straight.length?straight:turns){const pattern=Array(depth).fill(p.id);for(let i=0;i<count;i++)pattern[i]=turn.id;extra.push(pattern);}
   }
   // Several changes of axis can route around a blocked single-turn approach.
   patterns.push(...extra);
  }
  const desired=compose(source.output.target,inverse(source.output.local));
  const direction=rotate(inverseQ(inputFrame.rotation),axis(desired));
  const turnAzimuth=Math.atan2(direction[0],-direction[1])*180/Math.PI;
  const turnAngle=Math.acos(Math.max(-1,Math.min(1,direction[2])))*180/Math.PI;
  const chord=rotate(inverseQ(inputFrame.rotation),add(desired.position,scale(inputFrame.position,-1)));
  const heading=Math.atan2(chord[1],chord[0])*180/Math.PI;
  const dot=(a:number[],b:number[])=>a.reduce((sum,n,i)=>sum+n*b[i],0);
  const catalogs=new Map(providers.map(p=>[p.id,[...groups.values()].flatMap(g=>g.variants.filter(v=>v.rule===p.id).map(v=>({...v,factor:g.factor}))).sort((a,b)=>Math.abs(Math.log(a.factor))-Math.abs(Math.log(b.factor))||Math.max(...a.choice.elements.map(e=>e.params.teeth??0))-Math.max(...b.choice.elements.map(e=>e.params.teeth??0)))]));
  const routes:{rule:string;choice:PairChoice}[][]=[],fallbackRoutes:typeof routes=[];
  const planar=Math.hypot(chord[0],chord[1]),slack=(source.output.tolerance?.position??0)+1e-6;
  for(const pattern of patterns){let count=0,fallbackCount=0,sharedCount=0;const entryRatios=new Set<string>();
   // Parallel chains reach an annulus [2·max−sum, sum]. Bound the unplaced suffix
   // by its largest center distances to cut subtrees whose leaves all fail.
   const straightPattern=pattern.every(id=>registry.getRule(id).search?.changesAxis===false),turnPattern=singleTurn(pattern);
   const longestStage=pattern.map(id=>registry.getRule(id).search?.changesAxis===false?Math.max(0,...(catalogs.get(id)??[]).map(centerDistance)):0);
   const suffix=longestStage.map((_,i)=>longestStage.slice(i).reduce((a,b)=>a+b,0)).concat(0);
   const patternMemo=new Map<string,boolean>();
   const canFinish=(i:number,ratio:number):boolean=>{if(i===pattern.length)return Math.abs((linear?1/ratio:ratio)-o.target)/o.target<=o.tolerance/100+1e-9;const key=i+':'+ratio.toPrecision(12);if(patternMemo.has(key))return patternMemo.get(key)!;const result=[...new Set((catalogs.get(pattern[i])??[]).map(c=>c.factor))].some(f=>canFinish(i+1,ratio*f));patternMemo.set(key,result);return result;};
   if(!canFinish(0,1))continue;
   const ratioDiversity=Math.min(3,new Set((catalogs.get(pattern[0])??[]).filter(c=>canFinish(1,c.factor)).map(c=>c.factor)).size);
   const canShare=pattern.some((id,i)=>i>0&&registry.getRule(id).search?.sharedRotor&&registry.getRule(pattern[i-1]).search?.sharedRotor&&(catalogs.get(pattern[i-1])??[]).some(a=>(catalogs.get(id)??[]).some(b=>sameRotor(a.choice.elements[1],b.choice.elements[0]))));
   const enough=()=>count>=2&&(!canShare||sharedCount>0)&&entryRatios.size>=ratioDiversity;
   function choose(i:number,ratio:number,path:{rule:string;choice:PairChoice}[],sum=0,longest=0,offset?:ReturnType<typeof turnOffset>){
    if(enough())return;
    // Rejected leaves only matter while they can still become near-miss fallbacks.
    if(!(o.includeNearMisses&&fallbackCount<3)){
     if(straightPattern&&(needsAxisChange||planar>sum+suffix[i]+slack+1e-6||planar<2*longest-sum-suffix[i]-slack-1e-6))return;
     if(turnPattern&&offset!==undefined&&(offset===null||Math.abs(across-offset.offset)>sum+suffix[i]+turnSlack(offset)+1e-6))return;
    }
    if(i===pattern.length){if(Math.abs((linear?1/ratio:ratio)-o.target)/o.target<=o.tolerance/100+1e-9){
     if(path.every(v=>registry.getRule(v.rule).search?.changesAxis===false)){
      const distances=path.map(centerDistance);
      const distance=planar,total=distances.reduce((a,b)=>a+b,0);if(distance>total+(source.output.tolerance?.position??0)+1e-6||distance<2*Math.max(...distances)-total-(source.output.tolerance?.position??0)-1e-6||needsAxisChange){if(o.includeNearMisses&&fallbackCount<3){fallbackRoutes.push(path);fallbackCount++;}return;}
     }
     else if(!reachable(path)){if(o.includeNearMisses&&fallbackCount<3){fallbackRoutes.push(path);fallbackCount++;}return;}
     const reusable=path.some((p,i)=>i>0&&registry.getRule(p.rule).search?.sharedRotor&&registry.getRule(path[i-1].rule).search?.sharedRotor&&sameRotor(path[i-1].choice.elements[1],p.choice.elements[0]));
     const entryRatio=String((path[0] as {factor?:number}).factor??1);if(count<2||reusable&&sharedCount===0||entryRatios.size<ratioDiversity&&!entryRatios.has(entryRatio)){routes.push(path);entryRatios.add(entryRatio);count++;if(reusable)sharedCount++;}
    }return;}
    for(const c of catalogs.get(pattern[i])??[]){if(enough())break;if(canFinish(i+1,ratio*c.factor)){const straight=registry.getRule(c.rule).search?.changesAxis===false,d=straight&&(straightPattern||turnPattern)?centerDistance(c):0;choose(i+1,ratio*c.factor,[...path,c],sum+d,Math.max(longest,d),turnPattern&&!straight?turnOffset(c):offset);}}
   }choose(0,1,[]);
  }
  if(needsAxisChange&&source.environment?.obstacles.length){const middle=(p:typeof routes[number])=>p.length===3&&registry.getRule(p[1].rule).search?.changesAxis&&!registry.getRule(p[0].rule).search?.changesAxis&&!registry.getRule(p[2].rule).search?.changesAxis?0:1;routes.sort((a,b)=>middle(a)-middle(b));}
  routes.push(...fallbackRoutes);
 // Round-robin starts reserve time for a different topology instead of exhausting
  // all detours and bindings of the first candidate.
  const directedLimit=Math.floor(o.budget*.65);
  const unclosed:Mechanism[]=[];
  for(let layout=0;layout<4&&active()&&visited<directedLimit;layout++){for(const choices of routes){
   if(!active()||visited>=directedLimit)break;
   const depth=choices.length;
   const g:Mechanism={version:source.environment?4:2,registryVersion:registry.version,...(source.environment?{environment:structuredClone(source.environment)}:{}),bodies:Array.from({length:depth+1},(_,i)=>({id:'d'+i,kind:linear&&i===depth?'rigid':'shaft',motion:linear&&i===depth?'translation':'rotation',frame:identity(),...(linear&&i===depth?{}:{shaft:{diameter:5,start:-150,end:150}})})),elements:[],relations:[],input:{...source.input,body:'d0'},output:{...source.output,body:'d'+depth}};
   choices.forEach(({rule,choice},i)=>{
    const changes=registry.getRule(rule).search!.changesAxis;
    choice.elements.forEach((e,j)=>g.elements.push({...structuredClone(e),id:`d${i}-${j}`,body:'d'+(i+j),pose:{...identity(),position:[0,0,j?0:i?(changes&&i<depth-1?[40,60,-40,-60][layout]:[-60,60,-35,35][layout]):0]},phase:0,binding:'fixed'}));
    g.relations.push({id:'directed'+i,rule,elements:[`d${i}-0`,`d${i}-1`],params:{...choice.params,azimuth:changes?((turnAzimuth+(choices.filter(c=>registry.getRule(c.rule).search?.changesAxis).length>1?i*90+layout*90:0)+540)%360)-180:heading+(i%2?-1:1)*[-35,35,-70,70][layout],...(choice.params.angle===undefined?{}:{angle:Math.max(60,Math.min(120,turnAngle))})}});
   });
   try{
    let start=reflow(g);
    for(let i=1;i<start.relations.length;i++)if(registry.getRule(start.relations[i-1].rule).search?.changesAxis){const outgoing=start.elements.find(e=>e.id===start.relations[i].elements[0])!,carrier=start.bodies.find(b=>b.id===outgoing.body)!;outgoing.pose.position[2]=Math.max(-150,Math.min(150,dot(add(desired.position,scale(carrier.frame.position,-1)),axis(carrier.frame))+[20,-20,40,-40][layout]));start=reflow(start);}
    const end=start.bodies.at(-1)!.frame,last=start.elements.find(e=>e.id===start.relations.at(-1)!.elements[1])!;
    const clock=multiply(inverseQ(desired.rotation),end.rotation);
    if(!linear&&Math.hypot(clock[0],clock[1])<1e-6)last.pose.rotation=clock;
    last.pose.position[2]=Math.max(-150,Math.min(150,dot(add(end.position,scale(desired.position,-1)),axis(end))));
    start=reflow(start);const shift=dot(add(desired.position,scale(start.bodies.at(-1)!.frame.position,-1)),axis(inputFrame));
    start.elements.find(e=>e.id===start.relations[0].elements[0])!.pose.position[2]=Math.max(-150,Math.min(150,shift));
    const found=solutions.length;await attemptConnections(start);
    if(layout===0&&solutions.length===found)unclosed.push(start);
   }catch{rejections.seed=(rejections.seed??0)+1;visited++;}
  }
  // After one cheap heuristic pass over every route, close the failed ones
  // analytically before trying further heuristic layouts.
  if(layout===0)for(const start of unclosed){if(!active()||visited>=directedLimit)break;await closureStarts(start);}
  }
 }
 for(let round=0;round<160&&visited<o.budget&&solutions.length<8;round++)for(let depth=min;depth<=o.maxStages&&visited<o.budget&&solutions.length<8;depth++){
  if(signal?.aborted)return {solutions,reports,nearMisses,rejections,visited,attempts,detourStarts,status:'cancelled'};if(!feasible(depth,1))continue;
  const choices:{rule:string;choice:PairChoice}[]=[];let ratio=1;
  for(let i=0;i<depth;i++){const possible=ratios.filter(r=>groups.get(r)!.motion===(linear&&i===depth-1?'translation':'rotation')&&feasible(depth-i-1,ratio*groups.get(r)!.factor)),r=possible[Math.floor(random()*possible.length)],variants=groups.get(r)!.variants;
   // Pick families first, so nine belt lengths do not crowd out gears.
   let pool=variants;
   if(round%2===0&&choices.length){const previous=choices.at(-1)!;const compatible=variants.filter(v=>registry.getRule(previous.rule).search?.sharedRotor&&registry.getRule(v.rule).search?.sharedRotor&&sameRotor(previous.choice.elements[1],v.choice.elements[0]));if(compatible.length)pool=compatible;}
   const rules=[...new Set(pool.map(v=>v.rule))],rule=rules[Math.floor(random()*rules.length)],same=pool.filter(v=>v.rule===rule);
   choices.push(same[Math.floor(random()*same.length)]);ratio*=groups.get(r)!.factor;
  }
  if(needsAxisChange&&choices.every(c=>registry.getRule(c.rule).search?.changesAxis===false)){visited++;rejections.orientation=(rejections.orientation??0)+1;continue;}
  if(!reachable(choices)){visited++;rejections.reach=(rejections.reach??0)+1;continue;}
  const g:Mechanism={version:source.environment?4:2,...(source.environment?{environment:structuredClone(source.environment)}:{}),registryVersion:registry.version,bodies:Array.from({length:depth+1},(_,i)=>({id:`r${i}`,kind:linear&&i===depth?'rigid':'shaft',motion:linear&&i===depth?'translation':'rotation',frame:identity(),...(linear&&i===depth?{}:{shaft:{diameter:5,start:-40,end:150}})})),elements:[],relations:[],input:{...source.input,body:'r0'},output:{...source.output,body:`r${depth}`}};
  choices.forEach(({rule,choice},i)=>{
   choice.elements.forEach((e,j)=>g.elements.push({...structuredClone(e),id:`${j?'b':'a'}${i}`,body:`r${i+j}`,pose:{...identity(),position:[0,0,j?0:i?25+random()*40:random()*10]},phase:0,binding:'fixed'}));
   const params={...choice.params};for(const v of registry.getRule(rule).search!.variables)params[v.key]=v.lo+random()*(v.hi-v.lo);
   g.relations.push({id:`p${i}`,rule,elements:[`a${i}`,`b${i}`],params});
  });await explore(closed(g,1)[0]??g,round);
 }
 const ranked=solutions.map((g,i)=>({g,report:reports[i],score:connectionSummary(g)})).sort((a,b)=>a.score.elements-b.score.elements||a.score.driveShafts-b.score.driveShafts);solutions.splice(0,solutions.length,...ranked.map(x=>x.g));reports.splice(0,reports.length,...ranked.map(x=>x.report));
 return {solutions,reports,nearMisses,rejections,visited,attempts,detourStarts,status:signal?.aborted?'cancelled':solutions.length>=8?'solution-limit':visited>=o.budget-20?'budget':'starts-exhausted'};
}
