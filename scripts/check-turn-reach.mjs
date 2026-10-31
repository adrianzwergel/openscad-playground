// The single-turn reach test may only discard impossible chains. Build random
// valid chains with exactly one change of axis (random azimuths, cone angles,
// seats and world frames), use their actual end frames as goals and require
// that the test keeps their catalog choice. Then check that it prunes at all.
import assert from 'node:assert/strict';
import {registry} from '../src/mechanics/graph/registry.ts';
import '../src/mechanics/graph/robust-search.ts';
import {turnReach} from '../src/mechanics/graph/reach.ts';
import {reflow} from '../src/mechanics/graph/refine.ts';
import {identity,axisAngle,compose,cross,axis,add,scale,norm} from '../src/mechanics/graph/frames.ts';

let seed=91357;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
const pick=xs=>xs[Math.floor(random()*xs.length)];
const sets={printed:{straight:['external-spur','gt2-belt'],turns:['bevel-mesh','worm-mesh']},lego:{straight:['lego-spur'],turns:['lego-bevel-90','lego-worm']}};
const frame=()=>({position:[random()*80-40,random()*80-40,random()*80-40],rotation:axisAngle([random()-.5,random()-.5,random()+.1],random()*360)});
let kept=0,rejected=0;
for(let n=0;n<400;n++){
 const set=sets[random()<.5?'lego':'printed'],depth=2+Math.floor(random()*3),turnAt=Math.floor(random()*depth);
 const path=Array.from({length:depth},(_,i)=>{const rule=pick(i===turnAt?set.turns:set.straight);return {rule,choice:pick(registry.getRule(rule).search.catalog({}))};});
 const g={version:2,registryVersion:registry.version,bodies:Array.from({length:depth+1},(_,i)=>({id:'s'+i,kind:'shaft',frame:identity(),shaft:{diameter:5,start:-150,end:150}})),elements:[],relations:[],
  input:{body:'s0',local:identity(),target:frame(),constraint:'frame'},output:{body:'s'+depth,local:random()<.5?identity():frame(),target:identity(),constraint:random()<.7?'frame':'axis'}};
 path.forEach(({rule,choice},i)=>{
  choice.elements.forEach((e,j)=>g.elements.push({...structuredClone(e),id:`e${i}-${j}`,body:'s'+(i+j),pose:{...identity(),position:[0,0,random()*100-50]},phase:0}));
  const params={...choice.params};for(const v of registry.getRule(rule).search.variables)params[v.key]=v.lo+random()*(v.hi-v.lo);
  g.relations.push({id:'p'+i,rule,elements:[`e${i}-0`,`e${i}-1`],params});
 });
 let built;try{built=reflow(g);}catch{continue;}
 // The constructed chain closes exactly at this goal.
 g.output.target=compose(built.bodies.at(-1).frame,g.output.local);
 assert.ok(turnReach(g).reachable(path),`valid chain rejected: ${path.map(v=>v.rule).join(' > ')}`);kept++;
 // Moving the goal 1 m along w=u0×u1 must make the same chain unreachable.
 const test=turnReach(g);if(!test.applies(path.map(v=>v.rule)))continue;
 const w=cross(axis(g.input.target),axis(built.bodies.at(-1).frame)),far=structuredClone(g);
 far.output.target={...g.output.target,position:add(g.output.target.position,scale(w,1000/norm(w)))};
 if(!turnReach(far).reachable(path))rejected++;
}
assert.ok(kept>=300,`only ${kept} constructed chains`);
assert.ok(rejected>50,`reach test never prunes (${rejected})`);
console.log(`Single-turn reach: kept all ${kept} constructed chains; rejected ${rejected} far goals.`);
