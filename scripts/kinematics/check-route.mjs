// Acceptance A: the route search on the new core finds at least as many
// solutions as the element-graph search on the benchmark corpus, every solution
// closes in the loop solver with the requested ratio and passes construction.
import assert from 'node:assert/strict';
import {cases,runOld,runNew} from './bench-route.mjs';
import {solve} from '../../src/mechanics/kinematics/solver.ts';

const close=(a,b,tol,what)=>assert.ok(Math.abs(a-b)<=tol,`${what}: ${a} vs ${b}`);
const selected=process.argv.slice(2).length?process.argv.slice(2):['free-3','free-4','detour-4','lego-angled-70','lego-angled-30','mixed-cold-4'];
let slower=0;
for(const name of selected){
 const {graph,options}=cases[name]();
 const old=await runOld(graph,options),fresh=await runNew(graph,options);
 console.log(JSON.stringify({case:name,old:{first:old.firstMs,total:old.totalMs,solutions:old.solutions},new:{first:fresh.firstMs,total:fresh.totalMs,solutions:fresh.solutions,rejections:fresh.rejections}}));
 assert.ok(fresh.solutions>=old.solutions,`${name}: ${fresh.solutions} solutions, old core found ${old.solutions}`);
 if(old.firstMs!==null&&fresh.firstMs!==null&&fresh.firstMs>old.firstMs*1.5+50)slower++;
 for(const [i,s] of fresh.result.solutions.entries()){
  close(s.ratio,options.target,options.target*1e-9,`${name} #${i} ratio`);
  assert.ok(s.checks.every(c=>c.state!=='fail'),`${name} #${i}: ${s.checks.filter(c=>c.state==='fail').map(c=>c.id).join(', ')}`);
  const m=structuredClone(s.mechanism);m.range={from:0,to:90,samples:3};
  const r=await solve(m,{yield:false});
  assert.equal(r.checks.find(c=>c.id==='closure').state,'pass',`${name} #${i}: ${r.checks.find(c=>c.id==='closure').message}`);
  assert.equal(r.checks.find(c=>c.id==='mobility').state,'pass',`${name} #${i}: ${r.mobility.message}`);
  close(1/Math.abs(r.transfer.constant),options.target,options.target*1e-9,`${name} #${i} transfer`);
 }
}
assert.ok(slower<=1,`first solution slower than 1.5× the old core in ${slower} cases`);
console.log('Kinematics route: benchmark corpus solved at least as well as the element graph; every solution closes, keeps its ratio and passes construction.');
