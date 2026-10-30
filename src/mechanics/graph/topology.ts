import type {Element,Mechanism} from './contracts.ts';
import {registry} from './registry.ts';

export function sameRotor(a:Pick<Element,'family'|'params'>,b:Pick<Element,'family'|'params'>){
 return a.family===b.family&&Object.keys(a.params).length===Object.keys(b.params).length&&Object.entries(a.params).every(([k,v])=>b.params[k]===v);
}

/** Alternative connections for an ordered open chain. Sharing is an explicit
 * provider capability, never inferred from coincident axes or equal ratios. */
export function connectionVariants(input:Mechanism):Mechanism[]{
 if(input.relations.length>4)throw Error('Topologievarianten sind auf vier Paarungen begrenzt.');
 const eligible:number[]=[];
 for(let i=1;i<input.relations.length;i++){
  const prev=input.relations[i-1],next=input.relations[i];
  if(!registry.getRule(prev.rule).search?.sharedRotor||!registry.getRule(next.rule).search?.sharedRotor)continue;
  const a=input.elements.find(e=>e.id===prev.elements[1])!,b=input.elements.find(e=>e.id===next.elements[0])!;
  if(a.id===b.id||a.body!==b.body||!sameRotor(a,b)||registry.getFamily(a.family).pairDependent)continue;
  const body=input.bodies.find(x=>x.id===a.body)!;
  if(body.id===input.input.body||body.id===input.output.body||body.motion==='translation')continue;
  // No unrelated element may lose its torque connection when the shaft is fixed.
  if(input.elements.filter(e=>e.body===body.id).length!==2)continue;
  eligible.push(i);
 }
 const variants:Mechanism[]=[];
 // Most shared rotors first; the original driven-shaft topology is always tried too.
 const masks=Array.from({length:2**eligible.length},(_,i)=>i).sort((a,b)=>b.toString(2).replace(/0/g,'').length-a.toString(2).replace(/0/g,'').length);
 for(const mask of masks){
  const g=structuredClone(input);if(mask)g.version=2;
  eligible.forEach((i,bit)=>{if(!(mask&(1<<bit)))return;
   const prev=g.relations[i-1],next=g.relations[i],keep=g.elements.find(e=>e.id===prev.elements[1])!,remove=next.elements[0];
   next.elements[0]=keep.id;keep.binding='free';g.bodies.find(b=>b.id===keep.body)!.motion='fixed';
   g.elements=g.elements.filter(e=>e.id!==remove);
  });
  variants.push(g);
 }
 return variants;
}

export function connectionSummary(g:Mechanism){
 const intermediate=g.bodies.filter(b=>b.id!==g.input.body&&b.id!==g.output.body);
 return {freeIdlers:g.elements.filter(e=>e.binding==='free'&&g.bodies.find(b=>b.id===e.body)?.motion==='fixed').length,
  driveShafts:intermediate.filter(b=>(b.motion??'rotation')==='rotation').length,elements:g.elements.length};
}
