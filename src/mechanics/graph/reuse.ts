import type {Element,PairContext,Registry} from './contracts.ts';
/** Partner-dependent parts may share only when both mates require the same geometry. */
export function samePartGeometry(element:Element,contexts:PairContext[],registry:Registry){
 const family=registry.getFamily(element.family);
 if(!contexts.length)return false;
 if(!family.pairDependent)return true;
 if(contexts.length===1)return true;
 if(!family.reuseGeometry)return false;
 try{const keys=contexts.map(c=>family.reuseGeometry!(element,c));return keys.every(key=>key===keys[0]);}catch{return false;}
}
