// Route search on chains (KINEMATIK-KERN.md 7): ratio patterns, directed
// starts, meet-in-the-middle closure, detour seeds, connection variants,
// refinement and the construction gate. A port of the element-graph search.
import type {Chain,Stage,FrameTerminal} from '../chain.ts';
import {reflow,inputFrame,desiredFrame,place,closes,chainRatio,signature,summary,axialChecks,toMechanism,cloneChain} from '../chain.ts';
import type {PairChoice,Provider} from '../catalog.ts';
import {selectProviders} from '../catalog.ts';
import {refineChain,variableCount} from '../refine.ts';
import type {Refined} from '../refine.ts';
import {assessConstruction} from '../construction.ts';
import type {Environment,Mechanism} from '../model.ts';
import {turnReach} from './reach.ts';
import {closureSeeds} from './closure.ts';
import {detourSeed} from './detours.ts';
import {connectionVariants} from './topology.ts';
import {compose,inverse,axis,add,scale,norm,rotate,multiply,inverseQ,lcg} from '../math.ts';
import type {Check} from '../conjugate.ts';

export type RouteRequest={input:FrameTerminal;output:FrameTerminal;environment?:Environment};
export type RouteOptions={target:number;tolerance:number;minStages?:number;maxStages:number;budget:number;seed?:number;rules?:string[];includeNearMisses?:boolean;yield?:boolean;trace?:(event:{phase:string;chain:Chain;outcome:string;error?:number})=>void};
export type RouteSolution={chain:Chain;mechanism:Mechanism;checks:Check[];ratio:number;summary:ReturnType<typeof summary>};
export type NearMiss={chain:Chain;mechanism:Mechanism;deviation:{position:number;angle:number};score:number};
export type RouteResult={solutions:RouteSolution[];nearMisses:NearMiss[];rejections:Record<string,number>;visited:number;attempts:number;detourStarts:number;status:'cancelled'|'solution-limit'|'budget'|'starts-exhausted'};

export async function route(request:RouteRequest,o:RouteOptions,signal?:AbortSignal,onProgress?:(n:number)=>void,onSolution?:(s:RouteSolution,stats:{visited:number;attempts:number;detourStarts:number})=>void):Promise<RouteResult>{
 const min=o.minStages??1;
 if(!Number.isFinite(o.target)||o.target<=0||o.target>1000||!Number.isFinite(o.tolerance)||o.tolerance<0||o.tolerance>100||!Number.isInteger(min)||min<1||!Number.isInteger(o.maxStages)||o.maxStages<min||o.maxStages>4||!Number.isInteger(o.budget)||o.budget<1||o.budget>100000||(o.seed!==undefined&&!Number.isInteger(o.seed)))throw Error('Ungültige Suchgrenzen.');
 const random=lcg(o.seed??73421),within=(ratio:number)=>Math.abs(ratio-o.target)/o.target<=o.tolerance/100+1e-9;
 const source={input:request.input,output:request.output,environment:request.environment};
 const solutions:RouteSolution[]=[],nearMisses:NearMiss[]=[],rejections:Record<string,number>={};let visited=0,attempts=0,detourStarts=0;
 const reject=(key:string)=>{rejections[key]=(rejections[key]??0)+1;};
 const providers=selectProviders(o.rules);
 const inF=inputFrame(source),parallelOutput=compose(inF,source.output.local);
 const needsAxisChange=norm(add(axis(parallelOutput),scale(axis(source.output.target),-1)))>2*Math.sin((source.output.tolerance?.angle??0)*Math.PI/360)+1e-7;
 const {centerDistance,turnOffset,turnSlack,across,reachable,applies:singleTurn}=turnReach(source);
 const refined=new Map<string,Refined>();
 // Compound and fixed joins share geometry, so variants reuse one refinement like the element graph.
 const geometryKey=(c:Chain)=>JSON.stringify([c.stages.map(s=>[s.choice.rule,s.choice.a.key,s.choice.b.key,s.join==='shared',s.params,s.seat]),c.lastSeat,c.lastRoll,!!c.environment]);
 const makeChain=(stages:Stage[]):Chain=>({input:source.input,output:source.output,stages,lastSeat:0,lastRoll:0,...(source.environment?{environment:source.environment}:{})});
 let phase='source';
 async function attempt(c:Chain){
  if(signal?.aborted)return;
  const variables=variableCount(c),iterations=Math.min(100,Math.floor((o.budget-visited)/Math.max(1,variables+2)));if(iterations<1){visited=o.budget;return;}attempts++;
  try{
   const key=geometryKey(c),cached=refined.get(key);let solved:Refined;
   if(cached){solved={...cached,chain:cloneChain(cached.chain)};solved.chain.stages.forEach((s,i)=>{s.join=c.stages[i].join;if(s.join==='shared')s.seat=0;});visited++;}
   else{o.trace?.({phase,chain:c,outcome:'start'});solved=await refineChain(c,{iterations,signal,yield:o.yield});if(!solved.cancelled)refined.set(key,solved);visited+=Math.max(1,solved.iterations)*(variables+2);}
   onProgress?.(visited);if(solved.cancelled)return;
   const ratio=chainRatio(solved.chain),r=reflow(solved.chain),axial=axialChecks(solved.chain,place(solved.chain,r));
   if(!closes(solved.chain,r)||!within(ratio)||axial.some(x=>x.state==='fail')){reject('closure');o.trace?.({phase,chain:solved.chain,outcome:!within(ratio)?'ratio':axial.some(x=>x.state==='fail')?'axial':'closure',error:solved.error});
    if(o.includeNearMisses&&within(ratio)&&axial.every(x=>x.state!=='fail')){const built=assessConstruction(place(solved.chain,r));if(built.valid){const f=compose(r.end,solved.chain.output.local),d=deviation(f,solved.chain.output),score=Math.hypot(Math.max(0,d.position-d.positionLimit),30*Math.max(0,d.angle-d.angleLimit)*Math.PI/180),sig=signature(solved.chain);
     if(!nearMisses.some(n=>signature(n.chain)===sig)){nearMisses.push({chain:solved.chain,mechanism:toMechanism(solved.chain,r),deviation:d,score});nearMisses.sort((a,b)=>a.score-b.score);nearMisses.splice(3);}}}
    return;}
   let built=assessConstruction(place(solved.chain,r)),chain=solved.chain;
   // Without an environment, refinement ignores internal clearance. A closed
   // chain that only collides gets a short second pass with collision residuals.
   if(!built.valid&&!chain.environment&&built.checks.every(x=>x.state!=='fail'||x.id.startsWith('space/'))){
    const left=Math.min(60,Math.floor((o.budget-visited)/Math.max(1,variables+2)));
    if(left>=5){const repaired=await refineChain(chain,{iterations:left,clearance:1.5,signal,yield:o.yield});visited+=Math.max(1,repaired.iterations)*(variables+2);if(repaired.cancelled)return;
     const rr=reflow(repaired.chain);if(closes(repaired.chain,rr)&&axialChecks(repaired.chain,place(repaired.chain,rr)).every(x=>x.state!=='fail')){const next=assessConstruction(place(repaired.chain,rr));if(next.valid){built=next;chain=repaired.chain;reject('repaired');}}}}
   if(!built.valid){reject('space');o.trace?.({phase,chain,outcome:'space:'+built.checks.filter(x=>x.state==='fail').map(x=>x.id).join(',')});return;}
   const sig=signature(chain);if(solutions.some(s=>signature(s.chain)===sig)){o.trace?.({phase,chain,outcome:'duplicate'});return;}
   o.trace?.({phase,chain,outcome:'solution'});
   const solution:RouteSolution={chain,mechanism:toMechanism(chain),checks:[...axialChecks(chain),...built.checks],ratio,summary:summary(chain)};
   solutions.push(solution);onSolution?.(solution,{visited,attempts,detourStarts});
  }catch{visited+=Math.max(1,variables);reject('domain');}
 }
 // Group catalog choices by reduction factor; memoised feasibility prunes topologies.
 const groups=new Map<string,{factor:number;variants:PairChoice[]}>();
 for(const p of providers)for(const choice of p.catalog()){const key=String(choice.factor);groups.set(key,{factor:choice.factor,variants:[...(groups.get(key)?.variants??[]),choice]});}
 const memo=new Map<string,boolean>(),ratios=[...groups.keys()];
 const feasible=(remaining:number,ratio:number):boolean=>{if(!remaining)return within(ratio);const key=remaining+':'+ratio.toPrecision(12);if(memo.has(key))return memo.get(key)!;const result=ratios.some(r=>feasible(remaining-1,ratio*groups.get(r)!.factor));memo.set(key,result);return result;};
 const active=()=>visited<o.budget&&solutions.length<8&&!signal?.aborted;
 async function attemptConnections(c:Chain){for(const candidate of connectionVariants(c).slice(0,2)){if(!active())break;await attempt(candidate);}}
 let closureRound=0;
 function closed(c:Chain,count:number){if(!c.stages.some(s=>s.choice.changesAxis))return [];const {seeds,work}=closureSeeds(c,{count,samples:300,seed:((o.seed??73421)+(++closureRound)*7919)>>>0});visited+=Math.ceil(work/20);return seeds;}
 async function closureStarts(c:Chain){if(!active())return;for(const seed of closed(c,2)){if(!active())break;await attemptConnections(seed);}}
 async function explore(c:Chain,round:number,warm=false){
  const variants=connectionVariants(c);
  if(!c.environment){for(const v of variants){if(!active())break;await attempt(v);}return;}
  const count=warm?9:3,sectors=[0,4,2,6,1,5,3,7,8,12,10,14,9,13,11,15];
  for(let j=0;j<count&&active();j++){const v=variants[j%variants.length];if(j===0){await attempt(v);continue;}try{visited++;detourStarts++;await attempt(detourSeed(v,sectors[warm?j-1:(round*2+j-1)%16]));}catch{reject('seed');}}
  if(active()&&variants.length>1)await attempt(variants[1+round%(variants.length-1)]);
 }
 // Directed starts: pair families and ratio-compatible catalogs, then vary layers.
 {
  const straight=providers.filter(p=>!p.changesAxis),turns=providers.filter(p=>p.changesAxis),patterns:Provider[][]=[];
  for(let depth=min;depth<=o.maxStages;depth++)for(const p of straight){
   if(!needsAxisChange||o.includeNearMisses)patterns.push(Array(depth).fill(p));
   for(const turn of needsAxisChange?turns:[])for(const index of [...new Set([Math.floor(depth/2),depth-1,0,...Array.from({length:depth},(_,i)=>i)])]){const pattern:Provider[]=Array(depth).fill(p);pattern[index]=turn;patterns.push(pattern);}
  }
  if(needsAxisChange)for(let depth=min;depth<=o.maxStages;depth++)for(const turn of turns)for(let count=2;count<=Math.min(depth,3);count++)for(const p of straight.length?straight:turns){const pattern:Provider[]=Array(depth).fill(p);for(let i=0;i<count;i++)pattern[i]=turn;patterns.push(pattern);}
  const desired=desiredFrame(source),direction=rotate(inverseQ(inF.rotation),axis(desired)),turnAzimuth=Math.atan2(direction[0],-direction[1])*180/Math.PI,turnAngle=Math.acos(Math.max(-1,Math.min(1,direction[2])))*180/Math.PI;
  const chord=rotate(inverseQ(inF.rotation),add(desired.position,scale(inF.position,-1))),heading=Math.atan2(chord[1],chord[0])*180/Math.PI,dot=(a:number[],b:number[])=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const teethOf=(c:PairChoice)=>Math.max(...[c.a,c.b].map(s=>Number(s.key.split(':')[2])||0));
  const catalogs=new Map(providers.map(p=>[p.id,[...groups.values()].flatMap(g=>g.variants.filter(v=>v.rule===p.id)).sort((a,b)=>Math.abs(Math.log(a.factor))-Math.abs(Math.log(b.factor))||teethOf(a)-teethOf(b))]));
  const routes:PairChoice[][]=[],fallbackRoutes:PairChoice[][]=[],planar=Math.hypot(chord[0],chord[1]),slack=(source.output.tolerance?.position??0)+1e-6;
  for(const pattern of patterns){let count=0,fallbackCount=0,sharedCount=0;const entryRatios=new Set<string>();
   const straightPattern=pattern.every(p=>!p.changesAxis),turnPattern=singleTurn(pattern);
   const longestStage=pattern.map(p=>p.changesAxis?0:Math.max(0,...(catalogs.get(p.id)??[]).map(centerDistance))),suffix=longestStage.map((_,i)=>longestStage.slice(i).reduce((a,b)=>a+b,0)).concat(0);
   const patternMemo=new Map<string,boolean>();
   const canFinish=(i:number,ratio:number):boolean=>{if(i===pattern.length)return within(ratio);const key=i+':'+ratio.toPrecision(12);if(patternMemo.has(key))return patternMemo.get(key)!;const result=[...new Set((catalogs.get(pattern[i].id)??[]).map(c=>c.factor))].some(f=>canFinish(i+1,ratio*f));patternMemo.set(key,result);return result;};
   if(!canFinish(0,1))continue;
   const ratioDiversity=Math.min(3,new Set((catalogs.get(pattern[0].id)??[]).filter(c=>canFinish(1,c.factor)).map(c=>c.factor)).size);
   const canShare=pattern.some((p,i)=>i>0&&p.sharedRotor&&pattern[i-1].sharedRotor&&(catalogs.get(pattern[i-1].id)??[]).some(a=>(catalogs.get(p.id)??[]).some(b=>a.b.key===b.a.key)));
   const enough=()=>count>=2&&(!canShare||sharedCount>0)&&entryRatios.size>=ratioDiversity;
   const choose=(i:number,ratio:number,path:PairChoice[],sum=0,longest=0,offset?:ReturnType<typeof turnOffset>)=>{
    if(enough())return;
    if(!(o.includeNearMisses&&fallbackCount<3)){
     if(straightPattern&&(needsAxisChange||planar>sum+suffix[i]+slack+1e-6||planar<2*longest-sum-suffix[i]-slack-1e-6))return;
     if(turnPattern&&offset!==undefined&&(offset===null||Math.abs(across-offset.offset)>sum+suffix[i]+turnSlack(offset)+1e-6))return;}
    if(i===pattern.length){if(within(ratio)){
     if(path.every(c=>!c.changesAxis)){const distances=path.map(centerDistance),total=distances.reduce((a,b)=>a+b,0);if(planar>total+(source.output.tolerance?.position??0)+1e-6||planar<2*Math.max(...distances)-total-(source.output.tolerance?.position??0)-1e-6||needsAxisChange){if(o.includeNearMisses&&fallbackCount<3){fallbackRoutes.push(path);fallbackCount++;}return;}}
     else if(!reachable(path)){if(o.includeNearMisses&&fallbackCount<3){fallbackRoutes.push(path);fallbackCount++;}return;}
     const reusable=path.some((c,k)=>k>0&&c.sharedRotor&&path[k-1].sharedRotor&&path[k-1].b.key===c.a.key),entryRatio=String(path[0].factor);
     if(count<2||reusable&&sharedCount===0||entryRatios.size<ratioDiversity&&!entryRatios.has(entryRatio)){routes.push(path);entryRatios.add(entryRatio);count++;if(reusable)sharedCount++;}}
     return;}
    for(const c of catalogs.get(pattern[i].id)??[]){if(enough())break;if(canFinish(i+1,ratio*c.factor)){const d=!c.changesAxis&&(straightPattern||turnPattern)?centerDistance(c):0;choose(i+1,ratio*c.factor,[...path,c],sum+d,Math.max(longest,d),turnPattern&&c.changesAxis?turnOffset(c):offset);}}
   };choose(0,1,[]);
  }
  if(needsAxisChange&&source.environment?.obstacles.length){const middle=(p:PairChoice[])=>p.length===3&&p[1].changesAxis&&!p[0].changesAxis&&!p[2].changesAxis?0:1;routes.sort((a,b)=>middle(a)-middle(b));}
  routes.push(...fallbackRoutes);
  const directedLimit=Math.floor(o.budget*.65),unclosed:Chain[]=[];phase='directed';
  for(let layout=0;layout<4&&active()&&visited<directedLimit;layout++){for(const choices of routes){
   if(!active()||visited>=directedLimit)break;
   const depth=choices.length,turnsInPath=choices.filter(c=>c.changesAxis).length;
   const stages:Stage[]=choices.map((choice,i)=>({choice,join:'fixed',seat:i?(choice.changesAxis&&i<depth-1?[40,60,-40,-60][layout]:[-60,60,-35,35][layout]):0,
    params:{...choice.params,azimuth:choice.changesAxis?((turnAzimuth+(turnsInPath>1?i*90+layout*90:0)+540)%360)-180:heading+(i%2?-1:1)*[-35,35,-70,70][layout],...(choice.params.angle===undefined?{}:{angle:Math.max(60,Math.min(120,turnAngle))})}}));
   try{
    const start=makeChain(stages);let r=reflow(start);
    for(let i=1;i<start.stages.length;i++)if(start.stages[i-1].choice.changesAxis){const carrier=r.shafts[i];start.stages[i].seat=Math.max(-150,Math.min(150,dot(add(desired.position,scale(carrier.position,-1)),axis(carrier))+[20,-20,40,-40][layout]));r=reflow(start);}
    const end=r.end,clock=multiply(inverseQ(desired.rotation),end.rotation);
    if(Math.hypot(clock[0],clock[1])<1e-6)start.lastRoll=2*Math.atan2(clock[2],clock[3])*180/Math.PI;
    start.lastSeat=Math.max(-150,Math.min(150,dot(add(end.position,scale(desired.position,-1)),axis(end))));
    r=reflow(start);const shift=dot(add(desired.position,scale(r.end.position,-1)),axis(inF));start.stages[0].seat=Math.max(-150,Math.min(150,shift));
    const found=solutions.length;await attemptConnections(start);
    if(layout===0&&solutions.length===found)unclosed.push(start);
   }catch{reject('seed');visited++;}
  }
  if(layout===0)for(const start of unclosed){if(!active()||visited>=directedLimit)break;await closureStarts(start);}}
 }
 // Random tail.
 phase='random';
 for(let round=0;round<160&&visited<o.budget&&solutions.length<8;round++)for(let depth=min;depth<=o.maxStages&&visited<o.budget&&solutions.length<8;depth++){
  if(signal?.aborted)return finish('cancelled');if(!feasible(depth,1))continue;
  const choices:PairChoice[]=[];let ratio=1;
  for(let i=0;i<depth;i++){const possible=ratios.filter(r=>feasible(depth-i-1,ratio*groups.get(r)!.factor)),r=possible[Math.floor(random()*possible.length)],variants=groups.get(r)!.variants;
   let pool=variants;if(round%2===0&&choices.length){const previous=choices[choices.length-1],compatible=variants.filter(v=>previous.sharedRotor&&v.sharedRotor&&previous.b.key===v.a.key);if(compatible.length)pool=compatible;}
   const rules=[...new Set(pool.map(v=>v.rule))],rule=rules[Math.floor(random()*rules.length)],same=pool.filter(v=>v.rule===rule);choices.push(same[Math.floor(random()*same.length)]);ratio*=groups.get(r)!.factor;}
  if(needsAxisChange&&choices.every(c=>!c.changesAxis)){visited++;reject('orientation');continue;}
  if(!reachable(choices)){visited++;reject('reach');continue;}
  // Draw the seat before the parameters, in the element graph's order, so seeded runs agree.
  const stages:Stage[]=choices.map((choice,i)=>{const seat=i?25+random()*40:random()*10,params={...choice.params};for(const v of choice.variables)params[v.key]=v.lo+random()*(v.hi-v.lo);return {choice,params,join:'fixed',seat};});
  const c=makeChain(stages);await explore(closed(c,1)[0]??c,round);
 }
 return finish(signal?.aborted?'cancelled':solutions.length>=8?'solution-limit':visited>=o.budget-20?'budget':'starts-exhausted');
 function finish(status:RouteResult['status']):RouteResult{
  solutions.sort((a,b)=>a.summary.elements-b.summary.elements||a.summary.driveShafts-b.summary.driveShafts);
  return {solutions,nearMisses,rejections,visited,attempts,detourStarts,status};
 }
}
function deviation(actual:{position:number[];rotation:number[]},t:FrameTerminal){
 const f=actual as Parameters<typeof compose>[0],delta=add(f.position,scale(t.target.position,-1));
 const position=t.constraint==='frame'?norm(delta):norm(scale(delta,1)),angle=Math.acos(Math.max(-1,Math.min(1,axis(f).reduce((s,n,i)=>s+n*axis(t.target)[i],0))))*180/Math.PI;
 return {position,angle,positionLimit:t.tolerance?.position??0,angleLimit:t.tolerance?.angle??0};
}
