// Acceptance A, random part: seeded tasks with rotated, offset shafts and a
// solvable chain behind each target. The route must solve at least as many tasks
// as the element-graph API (since phase 6 a wrapper on the same core). Usage: node check-route-random.mjs [count] [seed]
import assert from 'node:assert/strict';
import {registry} from '../../src/mechanics/graph/registry.ts';
import '../../src/mechanics/graph/robust-search.ts';
import {demoMechanism,resolveMechanism} from '../../src/mechanics/graph/model.ts';
import {reflow} from '../../src/mechanics/graph/refine.ts';
import {identity,axisAngle} from '../../src/mechanics/graph/frames.ts';
import {runOld,runNew} from './bench-route.mjs';

const count=+(process.argv[2]??12),seed0=+(process.argv[3]??777);
let seed=seed0;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
const pick=xs=>xs[Math.floor(random()*xs.length)];
const sets={printed:{straight:['external-spur','gt2-belt'],turns:['bevel-mesh','worm-mesh']},lego:{straight:['lego-spur'],turns:['lego-bevel-90','lego-worm']}};
const frame=()=>({position:[random()*200-100,random()*200-100,random()*200-100],rotation:axisAngle([random()-.5,random()-.5,random()-.5],random()*360)});
let oldSolved=0,newSolved=0;const rows=[];
for(let n=0;n<count;n++){
 const kind=n%2?'lego':'printed',set=sets[kind],depth=2+Math.floor(random()*3),turns=Math.min(depth,Math.floor(random()*3));
 const rules=Array.from({length:depth},()=>pick(set.straight));const at=new Set();while(at.size<turns)at.add(Math.floor(random()*depth));for(const i of at)rules[i]=pick(set.turns);
 const input=frame();
 const g={version:2,registryVersion:registry.version,bodies:Array.from({length:depth+1},(_,i)=>({id:'s'+i,kind:'shaft',frame:i?identity():input,shaft:{diameter:5,start:-150,end:150}})),elements:[],relations:[],input:{body:'s0',local:identity(),target:input,constraint:'frame'},output:{body:'s'+depth,local:identity(),target:identity(),constraint:'frame'}};
 rules.forEach((rule,i)=>{const search=registry.getRule(rule).search,choice=pick(search.catalog({}));
  choice.elements.forEach((e,j)=>g.elements.push({...structuredClone(e),id:`e${i}-${j}`,body:'s'+(i+j),pose:{...identity(),position:[0,0,random()*80-40]},phase:0}));
  const params={...choice.params};for(const v of search.variables)params[v.key]=v.lo+random()*(v.hi-v.lo);
  g.relations.push({id:'p'+i,rule,elements:[`e${i}-0`,`e${i}-1`],params});});
 let built;try{built=reflow(g);}catch{n--;continue;}
 const task=demoMechanism();task.input.target=input;task.output.target=built.bodies.at(-1).frame;
 const ratio=Math.round(Math.abs(resolveMechanism(built).value)*1e6)/1e6,options={tolerance:1,target:ratio,minStages:depth,maxStages:depth,budget:12000,rules:[...set.straight,...set.turns]};
 if(process.env.ONLY!==undefined&&+process.env.ONLY!==n)continue;
 const counts={};const trace=process.env.TRACE?ev=>{const key=ev.chain.stages.map(s=>s.choice.rule+':'+s.choice.a.key.split(':').slice(1,3).join('/')+'-'+s.choice.b.key.split(':').slice(1,3).join('/')+(s.join==='shared'?'S':s.join==='compound'?'C':'')).join(' > ');counts[key]??={};const k=ev.phase+':'+(process.env.TRACE==='full'?ev.outcome:ev.outcome.split(':')[0]);counts[key][k]=(counts[key][k]??0)+1;}:undefined;
 const old=await runOld(task,options),fresh=await runNew(task,{...options,trace});
 if(trace){console.log('old solutions:',old.solutions);for(const [k,v] of Object.entries(counts))console.log(' ',k,JSON.stringify(v));}
 oldSolved+=old.solutions>0?1:0;newSolved+=fresh.solutions>0?1:0;
 rows.push({n,kind,rules:rules.join('>'),old:old.solutions,new:fresh.solutions,oldMs:old.firstMs,newMs:fresh.firstMs});
 console.log(JSON.stringify(rows.at(-1)));
}
console.log(`old core solved ${oldSolved}/${count}, new core solved ${newSolved}/${count}`);
assert.ok(newSolved>=oldSolved,'new core must solve at least as many random tasks');
console.log('Kinematics route (random tasks): new core solves at least as many seeded random shaft tasks as the element graph.');
