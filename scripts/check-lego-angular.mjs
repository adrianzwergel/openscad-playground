import assert from 'node:assert/strict';
import fs from 'node:fs';
import {registry} from '../src/mechanics/graph/registry.ts';
import {legoPart} from '../src/mechanics/graph/lego.ts';
import {defaultCatalog,catalogAllows} from '../src/mechanics/graph/catalog.ts';
import {identity,axisAngle,axis} from '../src/mechanics/graph/frames.ts';
import {reflow} from '../src/mechanics/graph/refine.ts';
import {resolveMechanism,context,demoMechanism,transformMechanism} from '../src/mechanics/graph/model.ts';
import {assessConstruction} from '../src/mechanics/graph/construction.ts';
import {robustRoute} from '../src/mechanics/graph/robust-search.ts';
const choose=(id,a,b)=>registry.getRule(id).search.catalog().find(c=>legoPart(c.elements[0].params).id===a&&legoPart(c.elements[1].params).id===b);
function chain(stages){
 const terminal=i=>({body:'b'+i,local:identity(),target:identity(),constraint:'frame'});
 let g={version:2,registryVersion:registry.version,bodies:Array.from({length:stages.length+1},(_,i)=>({id:'b'+i,kind:'shaft',motion:'rotation',frame:identity(),shaft:{diameter:5,start:-100,end:100}})),elements:[],relations:[],input:terminal(0),output:terminal(stages.length)};
 stages.forEach(({rule,choice},i)=>{choice.elements.forEach((e,j)=>g.elements.push({...e,id:'e'+i+j,body:'b'+(i+j),binding:'fixed',pose:{...identity(),position:[0,0,i&&!j?-60:0]},phase:0}));g.relations.push({id:'r'+i,rule,elements:['e'+i+'0','e'+i+'1'],params:choice.params});});g=reflow(g);g.output.target=structuredClone(g.bodies.at(-1).frame);return g;
}
for(const id of ['lego-bevel-90','lego-worm']){
 const rule=registry.getRule(id);for(const choice of rule.search.catalog()){
  const g=chain([{rule:id,choice}]),report=resolveMechanism(g);assert.ok(report.valid,JSON.stringify(report.checks.filter(c=>c.state==='fail')));const c=context(g,g.relations[0]);assert.throws(()=>rule.validate({...c,params:{...c.params,angle:80}}));const a=axis(g.bodies[0].frame),b=axis(g.bodies[1].frame);assert.ok(Math.abs(a.reduce((s,x,i)=>s+x*b[i],0))<1e-6);
  if(id==='lego-worm')assert.throws(()=>rule.validate({...c,elements:[...c.elements].reverse()}));
 }
}
for(const [id,a,b] of [['lego-bevel-90','32270','32269'],['lego-worm','4716','3648b'],['lego-worm','27938','3648b'],['lego-worm','15457','3648b'],['lego-worm','32905','3648b']]){
 const g=chain([{rule:id,choice:choose(id,a,b)}]),construction=assessConstruction(g);assert.ok(construction.valid,JSON.stringify(construction.checks));assert.ok(assessConstruction(construction.graph,1,false).valid);if(id==='lego-worm'){const segments=construction.boxes.filter(x=>x.kind==='shaft'&&x.owner==='b0');assert.equal(segments.length,3);assert.ok(!segments[0].exempt.length&&!segments[2].exempt.length);assert.equal(segments[1].exempt[0].id,'e01');}
 if(id==='lego-bevel-90'){const bad=structuredClone(construction.graph);bad.bodies[0].shaft.end+=10;assert.ok(!assessConstruction(bad,1,false).valid);assert.deepEqual(g.bodies[1].frame.position,[0,8,12]);}
 const goal=transformMechanism(g,{position:[12,-17,28],rotation:axisAngle([1,2,3],37)});const source=demoMechanism();source.input.target=goal.input.target;source.output.target=goal.output.target;const catalog=defaultCatalog();catalog.whitelist=true;for(const p of catalog.parts)if(['lego-'+a,'lego-'+b].includes(p.id)){p.listed=true;p.quantity=a===b?2:1;}
 const results=await robustRoute(source,{target:resolveMechanism(g).value,tolerance:0,minStages:1,maxStages:1,budget:15000,beam:120,rules:[id],catalog});assert.ok(results.solutions.length,id+' '+a+': '+JSON.stringify(results.rejections));assert.ok(results.solutions.every(s=>catalogAllows(s,catalog)&&resolveMechanism(s).valid&&assessConstruction(s,1,false).valid));
 fs.writeFileSync(process.env.TEMP+'/'+id+'-'+a+'.json',JSON.stringify(results.solutions[0]));console.log('Cold transformed search:',id,a,results.solutions.length);
}
for(const [id,a,b] of [['lego-bevel-90','32270','32269'],['lego-worm','4716','3648b']]){
 const custom=registry.getRule('external-spur').search.catalog().find(c=>c.elements[0].params.teeth===20&&c.elements[1].params.teeth===40),g=chain([{rule:id,choice:choose(id,a,b)},{rule:'external-spur',choice:custom}]);assert.ok(assessConstruction(g).valid,JSON.stringify(assessConstruction(g).checks));
 const source=demoMechanism();source.input.target=g.input.target;source.output.target=g.output.target;const catalog=defaultCatalog();catalog.whitelist=true;for(const p of catalog.parts)if(['lego-'+a,'lego-'+b].includes(p.id)||p.family==='spur'&&[20,40].includes(p.params.teeth)){p.listed=true;p.quantity=1;}
 const r=await robustRoute(source,{target:resolveMechanism(g).value,tolerance:0,minStages:2,maxStages:2,budget:100000,beam:120,rules:[id,'external-spur'],catalog});assert.ok(r.solutions.some(s=>new Set(s.relations.map(r=>r.rule)).size===2),JSON.stringify(r.rejections));console.log('Cold mixed shaft:',id,r.solutions.length);
}
// Mixed GT2 train retains both families on one driven shaft.
for(const id of ['lego-bevel-90','lego-worm']){
 const pair=id==='lego-worm'?choose(id,'4716','3648b'):choose(id,'32270','32269');
 const belt=registry.getRule('gt2-belt').search.catalog().find(c=>c.elements[0].params.teeth===20&&c.elements[1].params.teeth===40&&c.params.length===200);
 const g=chain([{rule:id,choice:pair},{rule:'gt2-belt',choice:belt}]);assert.ok(resolveMechanism(g).valid);const r=await robustRoute(g,{target:resolveMechanism(g).value,tolerance:0,minStages:2,maxStages:2,budget:5000,beam:120,rules:[id,'gt2-belt']});assert.ok(r.solutions.some(s=>s.relations.some(p=>p.rule===id)&&s.relations.some(p=>p.rule==='gt2-belt')));console.log('Mixed LEGO/GT2:',id,r.solutions.length);
}
console.log('65 LEGO angular pairings: ratio, direction, mounting, transformed cold search, stock, finite shafts, support/clearance and mixed 5-mm shafts passed.');
