import type {Mechanism} from './contracts.ts';
import {registry} from './registry.ts';
import {identity} from './frames.ts';
import {reflow} from './refine.ts';
import {assessConstruction} from './construction.ts';

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
