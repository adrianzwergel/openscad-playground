// Alternative connections for an ordered chain: between two stages on one
// shaft the driven and driving elements may be one shared part, a free
// compound on a fixed axle, or both fixed on a driven shaft.
import type {Chain} from '../chain.ts';
import {cloneChain} from '../chain.ts';

export function connectionVariants(input:Chain):Chain[]{
 if(input.stages.length>4)throw Error('Topologievarianten sind auf vier Paarungen begrenzt.');
 const base=cloneChain(input);base.stages.forEach(s=>{s.join='fixed';});
 const joins:{index:number;shared:boolean;compound:boolean}[]=[];
 for(let i=1;i<base.stages.length;i++){const prev=base.stages[i-1].choice,next=base.stages[i].choice;
  const shared=prev.sharedRotor&&next.sharedRotor&&prev.b.key===next.a.key,compound=prev.b.compoundRotor&&next.a.compoundRotor;
  if(shared||compound)joins.push({index:i,shared,compound});}
 const variants:Chain[]=[];
 const expand=(c:Chain,k:number)=>{
  if(k===joins.length){variants.push(c);return;}
  const j=joins[k];
  if(j.shared){const copy=cloneChain(c);copy.stages[j.index].join='shared';copy.stages[j.index].seat=0;expand(copy,k+1);}
  if(j.compound){const copy=cloneChain(c);copy.stages[j.index].join='compound';expand(copy,k+1);}
  expand(cloneChain(c),k+1);
 };
 expand(base,0);
 return variants.length>2?[variants[0],variants[variants.length-1],...variants.slice(1,-1)]:variants;
}
