// Search helpers on random chains: the single-turn reach test never discards a
// chain that closes, and meet-in-the-middle starts close at least as often as
// random starts (replaces check-turn-reach and check-closure-seeds).
import assert from 'node:assert/strict';
import {providers} from '../../src/mechanics/kinematics/catalog.ts';
import {reflow,cloneChain,closes} from '../../src/mechanics/kinematics/chain.ts';
import {turnReach} from '../../src/mechanics/kinematics/search/reach.ts';
import {closureSeeds} from '../../src/mechanics/kinematics/search/closure.ts';
import {refineChain} from '../../src/mechanics/kinematics/refine.ts';
import {identity,axisAngle,compose,cross,axis,add,scale,norm,lcg} from '../../src/mechanics/kinematics/math.ts';

const random=lcg(91357),pick=xs=>xs[Math.floor(random()*xs.length)];
const sets={printed:{straight:['external-spur','gt2-belt'],turns:['bevel-mesh','worm-mesh']},lego:{straight:['lego-spur'],turns:['lego-bevel-90','lego-worm']}};
const catalog=id=>providers.find(p=>p.id===id).catalog();
const frame=()=>({position:[random()*80-40,random()*80-40,random()*80-40],rotation:axisAngle([random()-.5,random()-.5,random()+.1],random()*360)});
function randomChain(turns){
 const set=sets[random()<.5?'lego':'printed'],depth=2+Math.floor(random()*3),at=new Set();while(at.size<Math.min(turns,depth))at.add(Math.floor(random()*depth));
 const stages=Array.from({length:depth},(_,i)=>{const choice=pick(catalog(pick(at.has(i)?set.turns:set.straight))),params={...choice.params};for(const v of choice.variables)params[v.key]=v.lo+random()*(v.hi-v.lo);return {choice,params,seat:random()*100-50,join:'fixed'};});
 const c={input:{kind:'frame',body:'s0',local:identity(),target:frame(),constraint:'frame'},output:{kind:'frame',body:'out',local:identity(),target:identity(),constraint:'frame'},stages,lastSeat:random()*60-30,lastRoll:random()*360-180};
 c.output.target=reflow(c).end;return c;
}
// Reach: every closing single-turn chain is kept; a goal moved 1 m along w is rejected.
let kept=0,rejected=0;
for(let n=0;n<300;n++){const c=randomChain(1),path=c.stages.map(s=>s.choice),test=turnReach(c);
 assert.ok(test.reachable(path),'closing chain rejected: '+path.map(p=>p.rule).join(' > '));kept++;
 if(!test.applies(path))continue;const w=cross(axis(c.input.target),axis(c.output.target)),far={...c,output:{...c.output,target:{...c.output.target,position:add(c.output.target.position,scale(w,1000/norm(w)))}}};
 if(!turnReach(far).reachable(path))rejected++;}
assert.ok(rejected>50,'reach test never prunes ('+rejected+')');
// Closure seeds: perturbed chains with a change of axis close from meet-in-the-middle starts.
let seeded=0,cold=0,total=0;
for(let n=0;n<30;n++){const truth=randomChain(1+Math.floor(random()*2));if(!truth.stages.some(s=>s.choice.changesAxis))continue;total++;
 const start=cloneChain(truth);start.stages.forEach(s=>{for(const v of s.choice.variables)s.params[v.key]=v.lo+random()*(v.hi-v.lo);s.seat=random()*60-30;});start.lastSeat=0;start.lastRoll=0;
 const r0=await refineChain(start,{iterations:100,yield:false});if(closes(r0.chain))cold++;
 const {seeds}=closureSeeds(start,{count:2,samples:400,seed:n+1});for(const s of seeds){const r=await refineChain(s,{iterations:100,yield:false});if(closes(r.chain)){seeded++;break;}}}
assert.ok(seeded>=cold&&seeded>=Math.ceil(.9*total),`closure seeds close ${seeded}/${total}, random starts ${cold}/${total}`);
console.log(`Kinematics search seeds: reach kept ${kept} closing chains and rejected ${rejected} far goals; closure seeds close ${seeded}/${total} (random starts ${cold}/${total}).`);
