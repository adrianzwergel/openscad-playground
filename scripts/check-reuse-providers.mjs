import assert from 'node:assert/strict';
import {registry} from '../src/mechanics/graph/registry.ts';
import {identity} from '../src/mechanics/graph/frames.ts';
import {reflow} from '../src/mechanics/graph/refine.ts';
import {connectionVariants} from '../src/mechanics/graph/topology.ts';
import {resolveMechanism,mechanismCAD} from '../src/mechanics/graph/model.ts';
import {assessConstruction} from '../src/mechanics/graph/construction.ts';
function chain(rules){const terminal=body=>({body,local:identity(),target:identity(),constraint:'frame'});const g={version:2,registryVersion:registry.version,bodies:['a','b','c'].map(id=>({id,kind:'shaft',motion:'rotation',frame:identity(),shaft:{diameter:5,start:-40,end:120}})),elements:[],relations:[],input:terminal('a'),output:terminal('c')};rules.forEach((rule,i)=>{const choice=registry.getRule(rule).search.catalog({stroke:50}).find(c=>(c.elements[0].params.teeth??20)===20&&(rule==='rack-drive'||(c.elements[1].params.teeth??20)===20));choice.elements.forEach((e,j)=>g.elements.push({...structuredClone(e),id:`e${i}${j}`,body:['a','b','c'][i+j],pose:{...identity(),position:[0,0,i&&!j?40:0]},phase:0}));g.relations.push({id:'r'+i,rule,elements:[`e${i}0`,`e${i}1`],params:{...choice.params,azimuth:0}});});if(rules.at(-1)==='rack-drive'){g.bodies[2]={id:'c',kind:'rigid',motion:'translation',frame:identity()};g.output.motion='translation';g.output.stroke=50;}return g;}
assert.deepEqual([...registry.rules.keys()].filter(k=>registry.getRule(k).search).sort(),['external-spur','bevel-mesh','worm-mesh','gt2-belt','screw-nut','rack-drive'].sort());
for(const rules of [['external-spur','external-spur'],['bevel-mesh','bevel-mesh'],['gt2-belt','gt2-belt'],['external-spur','rack-drive']]){
 const original=chain(rules),merged=connectionVariants(original).find(g=>g.elements.length===3);assert.ok(merged,rules.join('/'));const g=reflow(merged);g.output.target=structuredClone(g.bodies[2].frame);const result=resolveMechanism(g);assert.ok(result.valid,JSON.stringify(result.checks.filter(c=>c.state==='fail')));assert.equal(mechanismCAD(g).parts.length,3);
 if(rules[0]==='bevel-mesh'){assert.ok(assessConstruction(g).valid);const wrong=structuredClone(g);wrong.relations[1].params.angle=80;assert.ok(resolveMechanism(reflow(wrong)).checks.some(c=>c.id.endsWith('/pair-context')&&c.state==='fail'));}
 if(rules[0]==='gt2-belt')assert.equal(assessConstruction(g).valid,false,'Shared single-width pulley must not waive intersecting belt spaces');
 console.log(rules.join(' → '),'shared identity and mating checks passed');
}
const bevel=chain(['bevel-mesh','bevel-mesh']);bevel.relations[1].params.angle=80;assert.ok(connectionVariants(bevel).every(g=>g.elements.length===4));
console.log('All six providers retained; incompatible cone geometry and colliding belts rejected.');
