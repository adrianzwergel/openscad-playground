// A gearbox as the generator keeps it: only decisions. Shafts are linked to the shaft generator's files and stand
// upright on the x/y plane; what meshes follows from where they stand, belts are named. Layers, webs and bolts are
// proposed by the plan; what is kept here are the user's changes to them.

/** A linked shaft standing at `at` (x, y). `z`: height of its left end (x = 0 in the shaft generator); `flip`: its
 * left end on top, x running down. */
/** `turn`: turned about its axis as it stands (degrees): where its arms point. */
export type PlacedShaft={id:string;shaft:string;at:[number,number];z:number;flip?:boolean;turn?:number};
/** A swing arm (Schwinge): shafts that move together, with plates of their own, about the axis of the shaft `pivot`,
 * from `from` to `to` degrees (counter-clockwise from above, relative to where they are drawn). `bolts`: its bolts set by
 * hand. */
/** `fixed`: it sits fast on its pivot shaft (a hub with the shaft's profile) and turns with it: a lever, a link of an arm.
 * Else it hangs on the pivot's bearings and swings freely. The pivot may be a shaft of another swing arm: link on link. */
export type Group={id:string;name:string;pivot:string;shafts:string[];from:number;to:number;bolts?:[number,number][];fixed?:boolean};
/** One wheel or bearing on a placed shaft: the placed shaft's id and the item's id in its shaft file. */
export type ItemRef={on:string;item:string};
export type Belt={id:string;a:ItemRef;b:ItemRef};
/** A layer set by hand: from z0 to z1; what the plan proposed is replaced by these once there is one. */
/** `group`: a plate of that swing arm, else of the frame. */
export type Layer={id:string;z0:number;z1:number;rim?:number;thickness?:number;group?:string};
/** A web between two bearings, as `on/item` keys. */
export type WebKey=[string,string];
/** `rim`: material round a bearing's outer ring; `web`: thickness of webs; `lip`: the rim holding the outer ring, how
 * thick and how far in; `clearance`: kept to wheels, belts and shafts passing through; `angle`/`grid`: snapping. */
/** `fit`: play per side of a bearing pocket; `bolt`: thread of the bolts (M3); `bolts`: how many, 0: as the plate needs;
 * `slot`: how far a motor with a belt can be moved to tension it (its slots); `clamp`: every layer a plate pair that clamps
 * its bearings (else one plate per layer, stops only on the outside of the outermost layers). */
/** A tension spring hooked onto two bolts of different bodies (the frame and a swing arm, or two arms): each end the
 * `bolt`-th bolt of its `body` ('' the frame), `part` from the spring catalogue (src/shaft/springs.ts), at height `z`
 * (else in the middle of the room both bolts share). */
export type GearSpring={id:string;part:string;a:{body:string;bolt:number};b:{body:string;bolt:number};z?:number};
export type GearSettings={rim:number;web:number;lip:number;lipIn:number;clearance:number;hole:number;angle:number;grid:number;bolt:number;fit:number;bolts:number;slot:number;clamp:boolean;/** Thickness of a motor's own plate. */motorPlate:number;
 /** A prototype: the plates have plain holes where the bearings go, the shafts run in them (as LEGO Technic does); the
  * plan, the parts list and the gearbox stay with their bearings. `protoPlay`: the hole over the shaft's Ø. */proto:boolean;protoPlay:number};
export type GearDoc={shafts:PlacedShaft[];belts:Belt[];layers?:Layer[];/** Bolt places set by hand (x, y); else the plan finds them. */bolts?:[number,number][];webs?:{add:WebKey[];remove:WebKey[];/** How a web gets past a part in its way, by `a|b`: round it, or lower/higher than it. */route?:Record<string,'aussen'|'tiefe'>};/** The shaft driven (placed id). */input?:string;/** Swing arms. */groups?:Group[];/** Springs between bodies. */springs?:GearSpring[];/** How far the gearbox turns: the shaft `on` from `from` to `to` degrees from where it is drawn; the others follow
 * by their ratios. Without it everything turns endlessly. */turn?:{on:string;from:number;to:number};settings:GearSettings};

export const defaultGearSettings:GearSettings={rim:3,web:4,lip:1.5,lipIn:1,clearance:1,hole:.5,angle:15,grid:1,bolt:3,fit:.1,bolts:0,slot:6,clamp:false,motorPlate:5,proto:false,protoPlay:.2};
export const newGear=():GearDoc=>({shafts:[],belts:[],settings:{...defaultGearSettings}});
export const itemKey=(r:ItemRef)=>`${r.on}/${r.item}`;
export const webKey=(a:string,b:string):WebKey=>a<b?[a,b]:[b,a];
const num=(v:unknown,lo=-1e5,hi=1e5)=>typeof v==='number'&&Number.isFinite(v)&&v>=lo&&v<=hi;
const str=(v:unknown)=>typeof v==='string'&&v.length>0&&v.length<120;
const ref=(r:unknown):ItemRef=>{const x=r as ItemRef;if(!x||!str(x.on)||!str(x.item))throw Error('Getriebe: Verweis ungültig');return {on:x.on,item:x.item};};
export function parseGear(raw:unknown):GearDoc{
 const d=raw as GearDoc;if(!d||typeof d!=='object'||!Array.isArray(d.shafts)||!Array.isArray(d.belts)||d.shafts.length>40||d.belts.length>40)throw Error('Getriebe ungültig');
 const shafts=d.shafts.map(s=>{if(!str(s?.id)||!str(s.shaft)||!Array.isArray(s.at)||!num(s.at[0])||!num(s.at[1])||!num(s.z)||s.flip!==undefined&&typeof s.flip!=='boolean')throw Error('Getriebe: Welle ungültig');if(s.turn!==undefined&&!num(s.turn,-3600,3600))throw Error('Getriebe: Welle ungültig');return {id:s.id,shaft:s.shaft,at:[s.at[0],s.at[1]] as [number,number],z:s.z,...(s.flip?{flip:true}:{}),...(s.turn?{turn:s.turn}:{})};});
 if(new Set(shafts.map(s=>s.id)).size!==shafts.length)throw Error('Getriebe: Wellen doppelt');
 const belts=d.belts.map(b=>{if(!str(b?.id))throw Error('Getriebe: Riemen ungültig');return {id:b.id,a:ref(b.a),b:ref(b.b)};});
 const layers=d.layers?.map(l=>{if(!str(l?.id)||!num(l.z0)||!num(l.z1)||!(l.z1>l.z0)||l.rim!==undefined&&!num(l.rim,0,100)||l.thickness!==undefined&&!num(l.thickness,.2,100))throw Error('Getriebe: Schicht ungültig');if(l.group!==undefined&&!str(l.group))throw Error('Getriebe: Schicht ungültig');return {id:l.id,z0:l.z0,z1:l.z1,...(l.rim!==undefined?{rim:l.rim}:{}),...(l.thickness!==undefined?{thickness:l.thickness}:{}),...(l.group?{group:l.group}:{})};});
 const keys=(v:unknown):WebKey[]=>{if(!Array.isArray(v)||v.length>200||v.some(k=>!Array.isArray(k)||!str(k[0])||!str(k[1])))throw Error('Getriebe: Stege ungültig');return v.map(k=>webKey(k[0],k[1]));};
 const route=d.webs?.route;if(route!==undefined&&(typeof route!=='object'||Object.entries(route).some(([k,v])=>!str(k)||v!=='aussen'&&v!=='tiefe')))throw Error('Getriebe: Steg-Führung ungültig');
 const webs=d.webs?{add:keys(d.webs.add),remove:keys(d.webs.remove),...(route&&Object.keys(route).length?{route:{...route}}:{})}:undefined;
 const settings={...defaultGearSettings};for(const k of Object.keys(defaultGearSettings) as (keyof GearSettings)[]){const v=d.settings?.[k];if(v===undefined)continue;if(typeof defaultGearSettings[k]==='boolean'){if(typeof v!=='boolean')throw Error(`Getriebe: Einstellung ${k} ungültig`);(settings as Record<string,unknown>)[k]=v;continue;}if(!num(v,0,1000))throw Error(`Getriebe: Einstellung ${k} ungültig`);(settings as Record<string,unknown>)[k]=v;}
 if(d.input!==undefined&&!shafts.some(s=>s.id===d.input))throw Error('Getriebe: Eingang unbekannt');
 const boltList=(v:unknown)=>{if(!Array.isArray(v)||v.length>12)throw Error('Getriebe: zu viele Bolzen');return v.map(b=>{if(!Array.isArray(b)||!num(b[0])||!num(b[1]))throw Error('Getriebe: Bolzen ungültig');return [b[0],b[1]] as [number,number];});};
 const bolts=d.bolts?boltList(d.bolts):undefined;
 if(d.groups!==undefined&&(!Array.isArray(d.groups)||d.groups.length>12))throw Error('Getriebe: Schwingen ungültig');
 const groups=d.groups?.map(g=>{if(!str(g?.id)||typeof g.name!=='string'||g.name.length>80||!str(g.pivot)||!Array.isArray(g.shafts)||g.shafts.length>40||g.shafts.some(x=>!str(x))||!num(g.from,-360,360)||!num(g.to,-360,360)||g.to<g.from||g.fixed!==undefined&&typeof g.fixed!=='boolean')throw Error('Getriebe: Schwinge ungültig');return {...(g.fixed?{fixed:true}:{}),id:g.id,name:g.name,pivot:g.pivot,shafts:[...g.shafts],from:g.from,to:g.to,...(g.bolts?{bolts:boltList(g.bolts)}:{})};});
 if(groups&&new Set(groups.map(g=>g.id)).size!==groups.length)throw Error('Getriebe: Schwingen doppelt');
 const turn=d.turn;if(turn!==undefined&&(!str(turn?.on)||!num(turn.from,-36000,36000)||!num(turn.to,-36000,36000)||turn.to<turn.from))throw Error('Getriebe: Drehbereich ungültig');
 if(d.springs!==undefined&&(!Array.isArray(d.springs)||d.springs.length>20))throw Error('Getriebe: Federn ungültig');
 const end=(e:unknown)=>{const x=e as {body:string;bolt:number};if(!x||typeof x.body!=='string'||x.body.length>120||!Number.isInteger(x.bolt)||x.bolt<0||x.bolt>40)throw Error('Getriebe: Feder ungültig');return {body:x.body,bolt:x.bolt};};
 const springs=d.springs?.map(x=>{if(!str(x?.id)||!str(x.part)||x.z!==undefined&&!num(x.z))throw Error('Getriebe: Feder ungültig');return {id:x.id,part:x.part,a:end(x.a),b:end(x.b),...(x.z!==undefined?{z:x.z}:{})};});
 return {...(springs?.length?{springs}:{}),shafts,belts,...(layers?{layers}:{}),...(bolts?{bolts}:{}),...(webs?{webs}:{}),...(d.input?{input:d.input}:{}),...(groups?.length?{groups}:{}),...(turn&&shafts.some(s=>s.id===turn.on)?{turn:{on:turn.on,from:turn.from,to:turn.to}}:{}),settings};}
