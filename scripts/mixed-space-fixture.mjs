import {registry} from '../src/mechanics/graph/registry.ts';
import {demoMechanism,transformMechanism} from '../src/mechanics/graph/model.ts';
import {reflow} from '../src/mechanics/graph/refine.ts';
import {assessConstruction} from '../src/mechanics/graph/construction.ts';
import {identity,axisAngle} from '../src/mechanics/graph/frames.ts';
export function fixture(n=4){
 const rules=n===4?['external-spur','gt2-belt','worm-mesh','bevel-mesh']:['external-spur','gt2-belt','worm-mesh'];
 let g=demoMechanism();g.version=4;g.bodies=Array.from({length:n+1},(_,i)=>({id:'s'+i,kind:'shaft',motion:'rotation',frame:identity(),shaft:{diameter:5,start:-70,end:150}}));g.elements=[];g.relations=[];
 rules.forEach((rule,i)=>{const choice=registry.getRule(rule).search.catalog().find(c=>rule==='worm-mesh'?c.elements[0].params.starts===2&&c.elements[1].params.teeth===30:c.elements[0].params.teeth===20&&c.elements[1].params.teeth===40&&(rule!=='gt2-belt'||c.params.length===300));choice.elements.forEach((e,j)=>g.elements.push({...structuredClone(e),id:(j?'b':'a')+i,body:'s'+(i+j),binding:'fixed',pose:{...identity(),position:[0,0,j?0:i?70:0]},phase:0}));g.relations.push({id:'p'+i,rule,elements:['a'+i,'b'+i],params:{...choice.params,azimuth:[20,-30,25,40][i],...(rule==='bevel-mesh'?{angle:73}:{})}});});
 g.input.body='s0';g.output.body='s'+n;g.input.local=identity();g.output.local=identity();g=reflow(g);g.output.target=structuredClone(g.bodies[n].frame);g=assessConstruction(g).graph;
 const hull=assessConstruction(g).boxes.find(b=>b.id==='b0');
 g.environment={margin:1,bounds:{id:'space',frame:{...identity(),position:[50,0,50]},size:[650,650,650]},obstacles:[{id:'block',frame:{...identity(),position:[hull.center[0],hull.center[1]+hull.half[1]-2,hull.center[2]]},size:[4,4,4]}]};
 if(n===4){const belt=assessConstruction(g).boxes.find(b=>b.kind==='drive');g.environment.obstacles.push({id:'belt-block',frame:{...identity(),position:structuredClone(belt.center)},size:[4,4,4]});}
 return transformMechanism(g,{position:[13,-17,9],rotation:axisAngle([1,2,3],31)});
}
