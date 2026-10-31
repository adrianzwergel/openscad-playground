import {registerLegoAngles} from './lego-angles.ts';
import {legoBevelIds,legoWormProfiles} from './lego-config.ts';
import {legoParts} from './lego-parts.ts';
import type {Registry,PairContext,Params} from './contracts.ts';
export {legoParts};
export const legoSearchable=(p:typeof legoParts[number])=>p.search||!!legoWormProfiles[p.id];
export const legoCapabilities=(p:typeof legoParts[number])=>[...(p.search?['Parallelachsen']:[]),...(legoBevelIds.includes(p.id)?['90°-Doppelkegelrad']:[]),...(legoWormProfiles[p.id]?['Schnecke als Eingang']:p.search&&!legoBevelIds.includes(p.id)?['Schneckenrad']:[])].join(' · ');
export function legoPart(p:Params){const part=legoParts.find(x=>x.model===p.model);if(!part||Object.keys(p).length!==1)throw Error('Unbekanntes LEGO-Kaufteil. Geometrie ist durch die Teilenummer festgelegt.');return part;}
export function registerLego(r:Registry){
 r.family({id:'lego-technic',carrier:'shaft',mount:e=>legoPart(e.params).mount==='cross'?'technic-cross':'unspecified',validate:p=>{legoPart(p);},envelope:e=>{const p=legoPart(e.params);return {radius:p.radius,min:-p.size[2]/2,max:p.size[2]/2};},scad:e=>`rotate([0,0,${e.phase}]) import("/lego/${legoPart(e.params).id}.stl");`});
 const base=r.getRule('external-spur'),convert=(c:PairContext):PairContext=>({...c,elements:c.elements.map(e=>{if(e.family!=='lego-technic')throw Error('LEGO-Zahnprofile benötigen eine ausdrücklich passende Paarung.');const p=legoPart(e.params);if(!p.search)throw Error('Diese LEGO-Sonderform hat noch keine freigegebene Paarungsregel.');return {...e,family:'spur',params:{teeth:p.teeth,module:1,width:p.size[2],bore:5}};})});
 const parts=legoParts.filter(p=>p.search);
 r.rule({...base,id:'lego-spur',validate:c=>base.validate(convert(c)),evaluate:c=>[...base.evaluate(convert(c)),{id:'purchase',state:'unknown',message:'LEGO-Kaufteile; LDraw ist ein Darstellungsmodell. Reales Zahnspiel und gefräste Kreuzsitze noch prüfen.'}],transfers:c=>base.transfers!(convert(c)),mateFrames:c=>base.mateFrames!(convert(c)),residuals:c=>base.residuals!(convert(c)),search:{changesAxis:false,sharedRotor:true,variables:base.search!.variables,phase:c=>base.search!.phase(convert(c)),catalog:()=>parts.flatMap(a=>parts.map(b=>({elements:[a,b].map(p=>({family:'lego-technic',params:{model:p.model}})),params:{azimuth:0}})))}});
 registerLegoAngles(r);
}
