// Compaction: parts on a shaft end up at the requested axial gap (default 1 mm,
// configurable) where the chain allows it; every solution still closes and passes.
import assert from 'node:assert/strict';
import {cases,request} from './bench-route.mjs';
import {route} from '../../src/mechanics/kinematics/search/route.ts';
import {place} from '../../src/mechanics/kinematics/chain.ts';
import {robustRoute} from '../../src/mechanics/graph/robust-search.ts';

const gaps=chain=>{const p=place(chain),out=[];for(const b of p.bodies){const es=p.elements.filter(e=>e.body===b.id).sort((x,y)=>x.z-y.z);for(let i=1;i<es.length;i++)out.push((es[i].z+es[i].envelope.min)-(es[i-1].z+es[i-1].envelope.max));}return out;};
for(const gap of [1,3]){
 for(const name of ['free-3','free-4']){
  const {graph,options}=cases[name](),r=await route(request(graph),{tolerance:0,yield:false,...options,axialGap:gap});
  assert.ok(r.solutions.length>=4,name+' solutions');
  const all=r.solutions.flatMap(s=>gaps(s.chain));
  assert.ok(all.every(g=>g>=gap-1e-6),`${name}: gap below ${gap}: ${all.map(g=>g.toFixed(2))}`);
  const tight=all.filter(g=>g<=gap+.05).length;
  assert.ok(tight>=.8*all.length,`${name} (${gap} mm): ${tight}/${all.length} gaps compacted: ${all.map(g=>g.toFixed(2)).join(' ')}`);
  for(const s of r.solutions)assert.ok(s.checks.every(c=>c.state!=='fail'),name+': '+s.checks.filter(c=>c.state==='fail').map(c=>c.id));
  console.log(`${name}, ${gap} mm: ${tight}/${all.length} gaps at the target, max ${Math.max(...all).toFixed(2)} mm`);
 }
}
// The element-graph API passes the option through and keeps its 1 mm minimum.
{const {graph,options}=cases['free-3']();const r=await robustRoute(graph,{tolerance:0,beam:120,...options,axialGap:2});assert.ok(r.solutions.length>=4);
 await assert.rejects(()=>robustRoute(graph,{tolerance:0,beam:120,...options,axialGap:.5}),/Axialer Abstand/);}
console.log('Kinematics compaction: parts on each shaft pulled to the requested axial gap; checks still pass.');
