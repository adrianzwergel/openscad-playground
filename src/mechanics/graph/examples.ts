import type {Mechanism} from './contracts.ts';
import {registry} from './registry.ts';
import {identity} from './frames.ts';
import {reflow} from './refine.ts';
import {assessConstruction} from './construction.ts';
import {demoMechanism} from './model.ts';
import {connectionVariants} from './topology.ts';

/** Builds a reference from individual catalog pairs, never from gearbox modules. */
export function driveExample(kind:'worm-spur'|'worm-belt'|'spur-belt-worm'='worm-belt'):Mechanism{
 const rules=kind==='worm-spur'?['worm-mesh','external-spur']:kind==='worm-belt'?['worm-mesh','gt2-belt']:['external-spur','gt2-belt','worm-mesh'];
 const n=rules.length,terminal=(body:string)=>({body,local:identity(),target:identity(),constraint:'frame' as const});
 let g:Mechanism={version:1,registryVersion:registry.version,bodies:Array.from({length:n+1},(_,i)=>({id:`s${i}`,kind:'shaft',frame:identity(),shaft:{diameter:5,start:-70,end:150}})),elements:[],relations:[],input:terminal('s0'),output:terminal(`s${n}`)};
 rules.forEach((rule,i)=>{
  const choice=registry.getRule(rule).search!.catalog().find(c=>rule==='worm-mesh'?c.elements[0].params.starts===2&&c.elements[1].params.teeth===30:rule==='gt2-belt'?c.params.length===300&&c.elements[0].params.teeth===20&&c.elements[1].params.teeth===40:c.elements[0].params.teeth===20&&c.elements[1].params.teeth===40)!;
  choice.elements.forEach((e,j)=>g.elements.push({...structuredClone(e),id:`${j?'b':'a'}${i}`,body:`s${i+j}`,pose:{...identity(),position:[0,0,j?0:i?70:0]},phase:0}));
  g.relations.push({id:`pair${i}`,rule,elements:[`a${i}`,`b${i}`],params:{...choice.params,azimuth:0}});
 });
 g=reflow(g);g.output.target=structuredClone(g.bodies[n].frame);return assessConstruction(g).graph;
}

export function linearExample(kind:'belt-screw'|'spur-rack'|'worm-belt-screw'='belt-screw'):Mechanism{
 const rules=kind==='belt-screw'?['gt2-belt','screw-nut']:kind==='spur-rack'?['external-spur','rack-drive']:['worm-mesh','gt2-belt','screw-nut'];
 const n=rules.length,terminal=(body:string)=>({body,local:identity(),target:identity(),constraint:'frame' as const});
 let g:Mechanism={version:2,registryVersion:registry.version,bodies:Array.from({length:n+1},(_,i)=>({id:`l${i}`,kind:i===n?'rigid':'shaft',motion:i===n?'translation':'rotation',frame:identity(),...(i===n?{}:{shaft:{diameter:5,start:-70,end:300}})})),elements:[],relations:[],input:terminal('l0'),output:{...terminal(`l${n}`),motion:'translation',stroke:100}};
 rules.forEach((rule,i)=>{
  const choice=registry.getRule(rule).search!.catalog({stroke:100}).find(c=>rule==='screw-nut'?c.elements[0].params.lead===8:rule==='rack-drive'?c.elements[0].params.teeth===20:rule==='worm-mesh'?c.elements[0].params.starts===2&&c.elements[1].params.teeth===30:rule==='gt2-belt'?c.params.length===300&&c.elements[0].params.teeth===20&&c.elements[1].params.teeth===40:c.elements[0].params.teeth===20&&c.elements[1].params.teeth===40)!;
  choice.elements.forEach((e,j)=>g.elements.push({...structuredClone(e),id:`${j?'b':'a'}${i}`,body:`l${i+j}`,binding:'fixed',pose:{...identity(),position:[0,0,j?0:i?70:0]},phase:0}));
  g.relations.push({id:`pair${i}`,rule,elements:[`a${i}`,`b${i}`],params:{...choice.params}});
 });
 g=reflow(g);g.output.target=structuredClone(g.bodies[n].frame);return assessConstruction(g).graph;
}

export function freeRotorExample():Mechanism{
 let g=demoMechanism();g.version=2;
 g.elements=g.elements.slice(0,2);g.elements[1].binding='free';g.bodies[1].motion='fixed';
 g.elements.push({id:'idler-output',family:'spur',body:g.bodies[2].id,binding:'fixed',pose:identity(),phase:0,params:{teeth:20,module:2,width:10,bore:5.1}});
 g.relations[1]={id:'idler-mesh',rule:'external-spur',elements:[g.elements[1].id,'idler-output'],params:{azimuth:0}};
 g=reflow(g);g.output.target=structuredClone(g.bodies[2].frame);return assessConstruction(g).graph;
}

export function compoundExample(kind:'double-gear'|'gear-belt'='gear-belt'):Mechanism{
 let g=driveExample('worm-belt');
 const rules=kind==='double-gear'?['external-spur','external-spur']:['external-spur','gt2-belt'];
 rules.forEach((rule,i)=>{const choice=registry.getRule(rule).search!.catalog().find(c=>c.elements[0].params.teeth===20&&c.elements[1].params.teeth===40&&(rule!=='gt2-belt'||c.params.length===300))!;
  g.relations[i].rule=rule;g.relations[i].params={...choice.params};
  choice.elements.forEach((e,j)=>{const previous=g.elements[2*i+j];g.elements[2*i+j]={...previous,...structuredClone(e)};});
 });
 g=reflow(g);g.output.target=structuredClone(g.bodies.at(-1)!.frame);
 return assessConstruction(connectionVariants(g).find(v=>v.elements.some(e=>e.rotorGroup))!).graph;
}
