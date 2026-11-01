import {legoParts,legoPart,legoSearchable} from './lego.ts';
import {registry} from './registry.ts';
import {BELTS} from '../motion.ts';
import type {Mechanism,Params,PairChoice} from './contracts.ts';

export type CatalogPart={id:string;name:string;family:string;params:Params;allowed?:boolean;quantity?:number;listed?:boolean};
export type SearchCatalog={parts:CatalogPart[];excludedRules:string[];whitelist:boolean};
export const partKey=(family:string,params:Params)=>JSON.stringify([family,Object.entries(params).sort(([a],[b])=>a.localeCompare(b))]);
export function defaultCatalog():SearchCatalog{
 const parts:CatalogPart[]=[],seen=new Set<string>();
 const add=(family:string,params:Params)=>{if(family==='lego-technic')return;const key=partKey(family,params);if(seen.has(key))return;seen.add(key);parts.push({id:`part-${parts.length+1}`,name:family+' '+Object.entries(params).map(([k,v])=>`${k}=${v}`).join(', '),family,params:{...params}});};
 for(const rule of registry.rules.values())if(rule.search)for(const choice of rule.search.catalog()){
  for(const e of choice.elements)add(e.family,e.params);
  if(rule.id==='gt2-belt')add('gt2-belt',{length:choice.params.length,width:6});
 }
 // LEGO parts are listed with their kind but locked until released: nothing is used that was not chosen.
 for(const p of legoParts)parts.push({id:'lego-'+p.id,name:'LEGO '+p.id+' · '+p.name.replace(/^Technic /,''),family:'lego-technic',params:{model:p.model},allowed:false});
 return {parts,excludedRules:[],whitelist:false};
}
// Stable entries replace the corresponding stock specification in every pairing.
// This keeps cross-family reuse (e.g. spur -> rack) on the same part definition.
export function parseCatalog(value:unknown):SearchCatalog{
 const c=value as SearchCatalog,base=defaultCatalog();
 if(!c||typeof c.whitelist!=='boolean'||!Array.isArray(c.excludedRules)||c.excludedRules.some(id=>!registry.rules.get(id)?.search)||!Array.isArray(c.parts)||c.parts.length>base.parts.length||new Set(c.parts.map(p=>p.id)).size!==c.parts.length||c.parts.some(p=>!base.parts.some(b=>b.id===p.id)))throw Error('Ungültiger Suchkatalog');
 const seen=new Set<string>();
 const parts=base.parts.map(original=>{
  const p=c.parts.find(x=>x.id===original.id)??(original.family==='lego-technic'?original:undefined);
  if(!p||p.family!==original.family||typeof p.name!=='string'||!p.name.trim()||p.name.length>200||!p.params||Object.keys(p.params).sort().join()!==Object.keys(original.params).sort().join()||Object.values(p.params).some(n=>!Number.isFinite(n)))throw Error('Ungültiger Katalogeintrag');
  if(p.family==='gt2-belt'){if(!BELTS.includes(p.params.length)||p.params.width!==6)throw Error('GT2: unterstützte Länge aus dem Katalog und 6 mm Breite wählen.');}
  else {registry.getFamily(p.family).validate(p.params);if(p.family==='lego-technic'&&p.params.model!==original.params.model)throw Error('LEGO-Teilenummer ist unveränderlich.');}
  if(p.quantity!==undefined&&(!Number.isInteger(p.quantity)||p.quantity<0||p.quantity>10000)||p.allowed!==undefined&&typeof p.allowed!=='boolean'||p.listed!==undefined&&typeof p.listed!=='boolean')throw Error('Ungültige Stückzahl oder Teilefreigabe');
  const key=partKey(p.family,p.params);if(seen.has(key))throw Error('Identische Teile bitte über die Stückzahl verwalten.');seen.add(key);
  return structuredClone(p);
 });
 return {parts,excludedRules:[...new Set(c.excludedRules)],whitelist:c.whitelist};
}
export const partAllowed=(c:SearchCatalog,p:CatalogPart)=>p.allowed!==false&&p.quantity!==0&&(!c.whitelist||p.listed===true)&&(p.family!=='lego-technic'||legoSearchable(legoPart(p.params)));
export function catalogChoices(ruleId:string,c:SearchCatalog,stroke?:number):PairChoice[]{
 if(c.excludedRules.includes(ruleId))return [];
 const base=defaultCatalog(),index=new Map(base.parts.map(p=>[partKey(p.family,p.params),p.id])),edited=new Map(c.parts.map(p=>[p.id,p]));
 const replacement=(family:string,params:Params)=>edited.get(index.get(partKey(family,params))!);
 return registry.getRule(ruleId).search!.catalog({stroke}).flatMap(choice=>{
  const parts=choice.elements.map(e=>replacement(e.family,e.params));
  const belt=ruleId==='gt2-belt'?replacement('gt2-belt',{length:choice.params.length,width:6}):undefined;
  if(parts.some(p=>!p||!partAllowed(c,p))||ruleId==='gt2-belt'&&(!belt||!partAllowed(c,belt)))return [];
  return [{elements:parts.map(p=>({family:p!.family,params:{...p!.params}})),params:{...choice.params,...(belt?{length:belt.params.length}:{})}}];
 });
}
/** Count physical elements after shared-rotor merging, plus one belt per belt drive. */
export function catalogAllows(g:Mechanism,c:SearchCatalog):boolean{
 if(g.relations.some(r=>c.excludedRules.includes(r.rule)))return false;
 const index=new Map(c.parts.map(p=>[partKey(p.family,p.params),p])),counts=new Map<string,number>();
 const take=(family:string,params:Params)=>{const p=index.get(partKey(family,params));if(!p||!partAllowed(c,p))return false;const n=(counts.get(p.id)??0)+1;counts.set(p.id,n);return p.quantity===undefined||n<=p.quantity;};
 return g.elements.every(e=>take(e.family,e.params))&&g.relations.every(r=>r.rule!=='gt2-belt'||take('gt2-belt',{length:r.params.length,width:6}));
}
