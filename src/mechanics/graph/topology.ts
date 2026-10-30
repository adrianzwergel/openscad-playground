import type {Element,Mechanism} from './contracts.ts';
import {registry} from './registry.ts';

export function sameRotor(a:Pick<Element,'family'|'params'>,b:Pick<Element,'family'|'params'>){
 return a.family===b.family&&Object.keys(a.params).length===Object.keys(b.params).length&&Object.entries(a.params).every(([k,v])=>b.params[k]===v);
}

/** Alternative connections for an ordered open chain. Sharing is an explicit
 * provider capability, never inferred from coincident axes or equal ratios. */
export function connectionVariants(input:Mechanism):Mechanism[]{
 if(input.relations.length>4)throw Error('Topologievarianten sind auf vier Paarungen begrenzt.');
 input=structuredClone(input);
 // A previously selected compound can be compared with a shaft again. Never
 // merge unrelated free groups on the same axis during this normalization.
 for(const body of input.bodies){
  if(body.id===input.input.body||body.id===input.output.body)continue;
  const members=input.elements.filter(e=>e.body===body.id),group=members[0]?.rotorGroup;
  if(members.length===2&&group&&members.every(e=>e.rotorGroup===group)){
   members.forEach(e=>{delete e.rotorGroup;e.binding='fixed';});body.motion='rotation';
  }
 }
 const joins:{index:number;shared:boolean;compound:boolean}[]=[];
 for(let i=1;i<input.relations.length;i++){
  const prev=input.relations[i-1],next=input.relations[i],a=input.elements.find(e=>e.id===prev.elements[1])!,b=input.elements.find(e=>e.id===next.elements[0])!;
  if(a.id===b.id||a.body!==b.body||a.rotorGroup||b.rotorGroup)continue;
  const body=input.bodies.find(x=>x.id===a.body)!;
  if(body.id===input.input.body||body.id===input.output.body||body.kind!=='shaft'||body.motion==='translation'||input.elements.filter(e=>e.body===body.id).length!==2)continue;
  const shared=!!registry.getRule(prev.rule).search?.sharedRotor&&!!registry.getRule(next.rule).search?.sharedRotor&&sameRotor(a,b)&&!registry.getFamily(a.family).pairDependent;
  const compound=!!registry.getFamily(a.family).compoundRotor&&!!registry.getFamily(b.family).compoundRotor;
  if(shared||compound)joins.push({index:i,shared,compound});
 }
 const variants:Mechanism[]=[];
 function expand(g:Mechanism,index:number){
  if(index===joins.length){variants.push(g);return;}
  const join=joins[index],prev=g.relations[join.index-1],next=g.relations[join.index];
  if(join.shared){const copy=structuredClone(g),keep=copy.elements.find(e=>e.id===prev.elements[1])!,remove=next.elements[0];copy.version=Math.max(copy.version,2) as Mechanism['version'];copy.relations[join.index].elements[0]=keep.id;keep.binding='free';copy.bodies.find(b=>b.id===keep.body)!.motion='fixed';copy.elements=copy.elements.filter(e=>e.id!==remove);expand(copy,index+1);}
  if(join.compound){const copy=structuredClone(g),members=copy.elements.filter(e=>[prev.elements[1],next.elements[0]].includes(e.id));copy.version=3;let group='rotor-'+join.index;while(copy.elements.some(e=>e.rotorGroup===group))group+='-next';members.forEach(e=>{e.binding='free';e.rotorGroup=group;});copy.bodies.find(b=>b.id===members[0].body)!.motion='fixed';expand(copy,index+1);}
  expand(structuredClone(g),index+1);
 }
 expand(structuredClone(input),0);
 // Test the complete driven-shaft alternative early, before the result limit
 // can be filled by combinations of several free intermediates.
 return variants.length>2?[variants[0],variants.at(-1)!,...variants.slice(1,-1)]:variants;
}

export function connectionSummary(g:Mechanism){
 const intermediate=g.bodies.filter(b=>b.id!==g.input.body&&b.id!==g.output.body);
 return {freeIdlers:g.elements.filter(e=>e.binding==='free'&&!e.rotorGroup&&g.bodies.find(b=>b.id===e.body)?.motion==='fixed').length,
  freeCompounds:new Set(g.elements.map(e=>e.rotorGroup).filter(Boolean)).size,driveShafts:intermediate.filter(b=>(b.motion??'rotation')==='rotation').length,elements:g.elements.length};
}
