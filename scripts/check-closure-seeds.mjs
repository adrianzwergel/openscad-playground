// Meet-in-the-middle closure starts: random solvable chains with one or two
// changes of axis (printed and LEGO providers) must close from the starts at
// least as often as from random continuous parameters, and almost always.
import assert from 'node:assert/strict';
import {registry} from '../src/mechanics/graph/registry.ts';
import '../src/mechanics/graph/robust-search.ts';
import {closureSeeds} from '../src/mechanics/graph/closure.ts';
import {reflow,refineGraph,endResidual} from '../src/mechanics/graph/refine.ts';
import {identity,axisAngle,compose} from '../src/mechanics/graph/frames.ts';
let seed=4242;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
const pick=xs=>xs[Math.floor(random()*xs.length)];
const sets=[{straight:['external-spur','gt2-belt'],turns:['bevel-mesh','worm-mesh']},{straight:['lego-spur'],turns:['lego-bevel-90','lego-worm']}];
const frame=()=>({position:[random()*80-40,random()*80-40,random()*80-40],rotation:axisAngle([random()-.5,random()-.5,random()+.1],random()*360)});
function chain(rules,set){
 const depth=rules.length;
 const g={version:2,registryVersion:registry.version,bodies:Array.from({length:depth+1},(_,i)=>({id:'s'+i,kind:'shaft',frame:identity(),shaft:{diameter:5,start:-150,end:150}})),elements:[],relations:[],input:{body:'s0',local:identity(),target:frame(),constraint:'frame'},output:{body:'s'+depth,local:identity(),target:identity(),constraint:'frame'}};
 rules.forEach((rule,i)=>{const search=registry.getRule(rule).search,choice=pick(search.catalog({}));
  choice.elements.forEach((e,j)=>g.elements.push({...structuredClone(e),id:`e${i}-${j}`,body:'s'+(i+j),pose:{...identity(),position:[0,0,j?(i===depth-1?random()*60-30:0):random()*120-60]},phase:0}));
  const params={...choice.params};for(const v of search.variables)params[v.key]=v.lo+random()*(v.hi-v.lo);
  g.relations.push({id:'p'+i,rule,elements:[`e${i}-0`,`e${i}-1`],params});});
 return g;
}
const err=g=>Math.hypot(...endResidual(reflow(g)));
const stats={};
for(let n=0;n<36;n++){
 const set=pick(sets),depth=2+n%3,turnsCount=1+Math.floor(random()*2);
 const rules=Array.from({length:depth},()=>pick(set.straight));for(let t=0;t<Math.min(turnsCount,depth);t++)rules[Math.floor(random()*depth)]=pick(set.turns);
 const truth=chain(rules,set);let built;try{built=reflow(truth);}catch{continue;}
 truth.output.target=built.bodies.at(-1).frame;
 // Cold: same catalog, different continuous parameters.
 const cold=structuredClone(truth);cold.relations.forEach(r=>{for(const v of registry.getRule(r.rule).search.variables)r.params[v.key]=v.lo+random()*(v.hi-v.lo);});cold.elements.forEach(e=>e.pose.position[2]=random()*60-30);
 const key=`${depth} stages, ${rules.filter(r=>registry.getRule(r).search.changesAxis).length} turns`;const s=stats[key]??={n:0,random:0,seeded:0,seedErr:[],ms:0};s.n++;
 const r0=await refineGraph(cold,undefined,100);if(r0.error<1e-3)s.random++;
 const t=performance.now();const {seeds}=closureSeeds(cold,{count:2,samples:400,seed:n+1});s.ms+=performance.now()-t;
 let ok=false;for(const sd of seeds){s.seedErr.push(err(sd));const r=await refineGraph(sd,undefined,100);if(r.error<1e-3){ok=true;break;}}if(ok)s.seeded++;
}
let total=0,closedRandom=0,closedSeeded=0;
for(const [k,s] of Object.entries(stats)){total+=s.n;closedRandom+=s.random;closedSeeded+=s.seeded;console.log(k.padEnd(20),`random ${s.random}/${s.n}, closure starts ${s.seeded}/${s.n}, median start residual ${s.seedErr.sort((a,b)=>a-b)[s.seedErr.length>>1]?.toFixed(1)}`);}
assert.ok(total>=30,`only ${total} chains`);
assert.ok(closedSeeded>=closedRandom&&closedSeeded>=total*.95,`closure starts ${closedSeeded}/${total}, random ${closedRandom}/${total}`);
console.log(`Closure starts close ${closedSeeded}/${total} chains (random starts ${closedRandom}/${total}).`);
