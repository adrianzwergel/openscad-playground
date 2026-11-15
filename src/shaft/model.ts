// A shaft as the generator keeps it: only decisions. x runs along the shaft from its left end (0) to its length. What
// sits on it, what goes into it and what is machined into it; sections, shoulders, adapters and spacers follow from
// that (plan.ts) unless a section is set by hand.
import type {ClutchSpec} from './clutch.ts';
import {parseProfile} from './profile.ts';
import type {Profile} from './profile.ts';

export type Side='links'|'rechts';
/** Sits on the shaft from `x` on. `side`: the end it is slid on from (else the plan picks one). `bore`, `width`: own
 * values for parts that allow them (printed gears, spacers). */
/** An arm's measures: `length` from the axis to the middle of its end, `width` of the bar, `angle` about the axis (degrees,
 * 0: where a D shaft's flat looks), `hole`: Ø of the hole at its end (0: none). */
export type ArmSpec={length:number;width:number;angle:number;hole:number};
/** `free`: a wheel that turns freely on the shaft (an idler on its own bore), not with it. */
/** `clutch`: a slip clutch's choices (clutch.ts). */
export type OnItem={id:string;part:string;x:number;side?:Side;bore?:Profile;width?:number;arm?:ArmSpec;free?:boolean;clutch?:ClutchSpec};
/** Goes into the shaft from `end`, `depth` deep. `wall`: the least wall round it. */
export type InItem={id:string;part:string;end:Side;depth:number;wall?:number};
export type Work=
 /** A radial tapped hole for a set screw at `x`, turned `angle` (degrees, 0: towards the flat of a D shaft in it). */
 |{id:string;kind:'madenschraube';x:number;m:number;angle?:number}
 /** A tapped hole in the end face, `depth` deep. */
 |{id:string;kind:'gewinde';end:Side;m:number;depth:number}
 /** A keyway (DIN 6885) from x0 to x1. */
 |{id:string;kind:'nut';x0:number;x1:number}
 /** A groove at x for a retaining ring DIN 471 (slid on over the end, spread) or an E-clip DIN 6799 (pushed on from the
  * side); without `norm`: DIN 471. */
 |{id:string;kind:'ring';x:number;norm?:'471'|'6799'}
 /** A flat `depth` deep from x0 to x1, for a set screw to press on. */
 |{id:string;kind:'abflachung';x0:number;x1:number;depth:number};
export type WorkKind=Work['kind'];
/** `shoulder`: radial step of a collar over what sits beside it; `spacerWall`: wall of a generated spacer; `minWall`: the
 * thinnest wall of a printed adapter or round a bore before it is a mistake; `insertWall`: wall wanted round a shaft in it;
 * `chamfer` at both ends. */
export type Settings={shoulder:number;spacerWall:number;minWall:number;insertWall:number;chamfer:number;/** Play per side of printed fits. */play:number};
/** A section set by hand: it wins over the plan, the checks still run. */
export type OwnSection={x0:number;x1:number;profile:Profile};
export type ShaftDoc={length:number;making:'druck'|'cnc';items:OnItem[];inserts:InItem[];works:Work[];sections?:OwnSection[];/** Ø of collars, else from what sits beside them. */collar?:number;settings:Settings};

export const defaultSettings:Settings={shoulder:1.5,spacerWall:1.5,minWall:.8,insertWall:2,chamfer:.5,play:.1};
export const newShaft=():ShaftDoc=>({length:60,making:'druck',items:[],inserts:[],works:[],settings:{...defaultSettings}});
const num=(v:unknown,lo=-1e4,hi=1e4)=>typeof v==='number'&&Number.isFinite(v)&&v>=lo&&v<=hi;
const str=(v:unknown)=>typeof v==='string'&&v.length>0&&v.length<100;
const side=(v:unknown)=>v==='links'||v==='rechts';
const clutchOf=(c:ClutchSpec):ClutchSpec=>{if(!str(c?.wheel)||!str(c.spring)||!num(c.preload,0,100)||!num(c.mu,.01,2)||c.width!==undefined&&!num(c.width,1,100)||c.disc!==undefined&&!num(c.disc,3,200))throw Error('Welle: Rutschkupplung ungültig');return {wheel:c.wheel,spring:c.spring,preload:c.preload,mu:c.mu,...(c.width!==undefined?{width:c.width}:{}),...(c.disc!==undefined?{disc:c.disc}:{})};};
export function parseShaft(raw:unknown):ShaftDoc{
 const d=raw as ShaftDoc;if(!d||typeof d!=='object')throw Error('Welle ungültig');
 if(!num(d.length,1,2000))throw Error('Welle: Länge ungültig');if(d.making!=='druck'&&d.making!=='cnc')throw Error('Welle: Fertigung ungültig');
 if(!Array.isArray(d.items)||!Array.isArray(d.inserts)||!Array.isArray(d.works)||d.items.length+d.inserts.length+d.works.length>200)throw Error('Welle: Listen ungültig');
 const items=d.items.map(i=>{if(!str(i?.id)||!str(i.part)||!num(i.x)||i.side!==undefined&&!side(i.side)||i.width!==undefined&&!num(i.width,.1,1000)||i.arm!==undefined&&!(num(i.arm.length,1,1000)&&num(i.arm.width,1,200)&&num(i.arm.angle,-3600,3600)&&num(i.arm.hole,0,100)))throw Error('Welle: Teil ungültig');if(i.free!==undefined&&typeof i.free!=='boolean')throw Error('Welle: Teil ungültig');return {...(i.free?{free:true}:{}),id:i.id,part:i.part,x:i.x,...(i.side?{side:i.side}:{}),...(i.bore?{bore:parseProfile(i.bore)}:{}),...(i.width!==undefined?{width:i.width}:{}),...(i.arm?{arm:{length:i.arm.length,width:i.arm.width,angle:i.arm.angle,hole:i.arm.hole}}:{}),...(i.clutch?{clutch:clutchOf(i.clutch)}:{})};});
 const inserts=d.inserts.map(i=>{if(!str(i?.id)||!str(i.part)||!side(i.end)||!num(i.depth,.1,2000)||i.wall!==undefined&&!num(i.wall,0,100))throw Error('Welle: Steckung ungültig');return {id:i.id,part:i.part,end:i.end,depth:i.depth,...(i.wall!==undefined?{wall:i.wall}:{})};});
 const works=d.works.map((w):Work=>{const ok=str(w?.id)&&(w.kind==='madenschraube'?num(w.x)&&num(w.m,1,20)&&(w.angle===undefined||num(w.angle,-360,360)):w.kind==='gewinde'?side(w.end)&&num(w.m,1,20)&&num(w.depth,.1,500):w.kind==='nut'?num(w.x0)&&num(w.x1)&&w.x1>w.x0:w.kind==='ring'?num(w.x)&&(w.norm===undefined||w.norm==='471'||w.norm==='6799'):w.kind==='abflachung'?num(w.x0)&&num(w.x1)&&w.x1>w.x0&&num(w.depth,.05,50):false);if(!ok)throw Error('Welle: Bearbeitung ungültig');return {...w};});
 const sections=d.sections?.map(s=>{if(!num(s?.x0)||!num(s.x1)||!(s.x1>s.x0))throw Error('Welle: Abschnitt ungültig');return {x0:s.x0,x1:s.x1,profile:parseProfile(s.profile)};});
 const settings={...defaultSettings};for(const k of Object.keys(defaultSettings) as (keyof Settings)[]){const v=d.settings?.[k];if(v!==undefined){if(!num(v,0,100))throw Error(`Welle: Einstellung ${k} ungültig`);settings[k]=v;}}
 if(d.collar!==undefined&&!num(d.collar,.5,500))throw Error('Welle: Bund ungültig');
 return {length:d.length,making:d.making,items,inserts,works,...(sections?{sections}:{}),...(d.collar!==undefined?{collar:d.collar}:{}),settings};}
