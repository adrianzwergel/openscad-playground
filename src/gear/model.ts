// A gearbox as the generator keeps it: only decisions. Shafts are linked to the shaft generator's files and stand
// upright on the x/y plane; what meshes follows from where they stand, belts are named. Layers, webs and bolts are
// proposed by the plan; what is kept here are the user's changes to them.

/** A linked shaft standing at `at` (x, y). `z`: height of its left end (x = 0 in the shaft generator); `flip`: its
 * left end on top, x running down. */
export type PlacedShaft={id:string;shaft:string;at:[number,number];z:number;flip?:boolean};
/** One wheel or bearing on a placed shaft: the placed shaft's id and the item's id in its shaft file. */
export type ItemRef={on:string;item:string};
export type Belt={id:string;a:ItemRef;b:ItemRef};
/** A layer set by hand: from z0 to z1; what the plan proposed is replaced by these once there is one. */
export type Layer={id:string;z0:number;z1:number;rim?:number;thickness?:number};
/** A web between two bearings, as `on/item` keys. */
export type WebKey=[string,string];
/** `rim`: material round a bearing's outer ring; `web`: thickness of webs; `lip`: the rim holding the outer ring, how
 * thick and how far in; `clearance`: kept to wheels, belts and shafts passing through; `angle`/`grid`: snapping. */
/** `fit`: play per side of a bearing pocket; `bolt`: thread of the bolts (M3); `bolts`: how many, 0: as the plate needs. */
export type GearSettings={rim:number;web:number;lip:number;lipIn:number;clearance:number;hole:number;angle:number;grid:number;bolt:number;fit:number;bolts:number};
export type GearDoc={shafts:PlacedShaft[];belts:Belt[];layers?:Layer[];/** Bolt places set by hand (x, y); else the plan finds them. */bolts?:[number,number][];webs?:{add:WebKey[];remove:WebKey[];/** How a web gets past a part in its way, by `a|b`: round it, or lower/higher than it. */route?:Record<string,'aussen'|'tiefe'>};/** The shaft driven (placed id). */input?:string;settings:GearSettings};

export const defaultGearSettings:GearSettings={rim:3,web:4,lip:1.5,lipIn:1,clearance:1,hole:.5,angle:15,grid:1,bolt:3,fit:.1,bolts:0};
export const newGear=():GearDoc=>({shafts:[],belts:[],settings:{...defaultGearSettings}});
export const itemKey=(r:ItemRef)=>`${r.on}/${r.item}`;
export const webKey=(a:string,b:string):WebKey=>a<b?[a,b]:[b,a];
const num=(v:unknown,lo=-1e5,hi=1e5)=>typeof v==='number'&&Number.isFinite(v)&&v>=lo&&v<=hi;
const str=(v:unknown)=>typeof v==='string'&&v.length>0&&v.length<120;
const ref=(r:unknown):ItemRef=>{const x=r as ItemRef;if(!x||!str(x.on)||!str(x.item))throw Error('Getriebe: Verweis ungültig');return {on:x.on,item:x.item};};
export function parseGear(raw:unknown):GearDoc{
 const d=raw as GearDoc;if(!d||typeof d!=='object'||!Array.isArray(d.shafts)||!Array.isArray(d.belts)||d.shafts.length>40||d.belts.length>40)throw Error('Getriebe ungültig');
 const shafts=d.shafts.map(s=>{if(!str(s?.id)||!str(s.shaft)||!Array.isArray(s.at)||!num(s.at[0])||!num(s.at[1])||!num(s.z)||s.flip!==undefined&&typeof s.flip!=='boolean')throw Error('Getriebe: Welle ungültig');return {id:s.id,shaft:s.shaft,at:[s.at[0],s.at[1]] as [number,number],z:s.z,...(s.flip?{flip:true}:{})};});
 if(new Set(shafts.map(s=>s.id)).size!==shafts.length)throw Error('Getriebe: Wellen doppelt');
 const belts=d.belts.map(b=>{if(!str(b?.id))throw Error('Getriebe: Riemen ungültig');return {id:b.id,a:ref(b.a),b:ref(b.b)};});
 const layers=d.layers?.map(l=>{if(!str(l?.id)||!num(l.z0)||!num(l.z1)||!(l.z1>l.z0)||l.rim!==undefined&&!num(l.rim,0,100)||l.thickness!==undefined&&!num(l.thickness,.2,100))throw Error('Getriebe: Schicht ungültig');return {id:l.id,z0:l.z0,z1:l.z1,...(l.rim!==undefined?{rim:l.rim}:{}),...(l.thickness!==undefined?{thickness:l.thickness}:{})};});
 const keys=(v:unknown):WebKey[]=>{if(!Array.isArray(v)||v.length>200||v.some(k=>!Array.isArray(k)||!str(k[0])||!str(k[1])))throw Error('Getriebe: Stege ungültig');return v.map(k=>webKey(k[0],k[1]));};
 const route=d.webs?.route;if(route!==undefined&&(typeof route!=='object'||Object.entries(route).some(([k,v])=>!str(k)||v!=='aussen'&&v!=='tiefe')))throw Error('Getriebe: Steg-Führung ungültig');
 const webs=d.webs?{add:keys(d.webs.add),remove:keys(d.webs.remove),...(route&&Object.keys(route).length?{route:{...route}}:{})}:undefined;
 const settings={...defaultGearSettings};for(const k of Object.keys(defaultGearSettings) as (keyof GearSettings)[]){const v=d.settings?.[k];if(v!==undefined){if(!num(v,0,1000))throw Error(`Getriebe: Einstellung ${k} ungültig`);settings[k]=v;}}
 if(d.input!==undefined&&!shafts.some(s=>s.id===d.input))throw Error('Getriebe: Eingang unbekannt');
 const bolts=d.bolts?.map(b=>{if(!Array.isArray(b)||!num(b[0])||!num(b[1]))throw Error('Getriebe: Bolzen ungültig');return [b[0],b[1]] as [number,number];});if(bolts&&bolts.length>12)throw Error('Getriebe: zu viele Bolzen');
 return {shafts,belts,...(layers?{layers}:{}),...(bolts?{bolts}:{}),...(webs?{webs}:{}),...(d.input?{input:d.input}:{}),settings};}
