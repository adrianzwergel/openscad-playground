// A surface is a pitch curve with a profile and an axial extent on an element.
import type {Curve2} from './curves.ts';
import {curve} from './curves.ts';
import type {Profile} from './profiles.ts';
import {validateProfile,reference} from './profiles.ts';
import {TAU} from './math.ts';

export type Surface={id:string;pitch:Curve2;profile:Profile;z:[number,number];side:'external'|'internal';cone?:number;helix?:number};

export function validateSurface(s:Surface){
 if(!s.id)throw Error('Wirkfläche braucht eine ID.');
 if(!(s.z[0]<s.z[1]))throw Error(`Wirkfläche ${s.id}: axialer Bereich ist leer.`);
 if(s.cone!==undefined&&!(s.cone>=0&&s.cone<=90))throw Error(`Wirkfläche ${s.id}: Kegelwinkel 0–90°.`);
 if(s.helix!==undefined&&!(Math.abs(s.helix)<60))throw Error(`Wirkfläche ${s.id}: Schrägungswinkel unter 60°.`);
 validateProfile(s.profile);
 const fn=curve(s.pitch);
 if(s.side==='internal'&&!fn.closed)throw Error(`Wirkfläche ${s.id}: Innenverzahnung braucht eine geschlossene Wälzkurve.`);
 if(s.profile.kind==='belt'&&s.pitch.kind!=='circle')throw Error(`Wirkfläche ${s.id}: Riemenscheiben sind rund.`);
 if(s.profile.kind==='helical'&&s.pitch.kind!=='circle')throw Error(`Wirkfläche ${s.id}: Schnecken sind rund.`);
 const t=teeth(s);if(t!==undefined&&Math.abs(t-Math.round(t))>1e-6)throw Error(`Wirkfläche ${s.id}: Umfang ${fn.length.toFixed(3)} ist kein Vielfaches der Teilung (${t.toFixed(3)} Zähne).`);
}
export const pitchFn=(s:Surface)=>curve(s.pitch);
/** Mean radius of the pitch curve about the axis; infinite for open curves. */
export function meanRadius(s:Surface){const fn=curve(s.pitch);return fn.closed?fn.length/TAU:Infinity;}
/** Number of teeth implied by perimeter and basic rack; undefined without a basic rack or for open curves. */
export function teeth(s:Surface){
 const ref=reference(s.profile);if(!ref||s.profile.kind==='helical')return undefined;const fn=curve(s.pitch);if(!fn.closed)return undefined;
 return fn.length/(Math.PI*ref.module);
}
/** Circular surface with an involute basic rack, the common case. */
export function spurSurface(id:string,module:number,count:number,width:number,extra:Partial<Surface>={}):Surface{
 if(!Number.isInteger(count)||count<3)throw Error('Zähnezahl muss ganzzahlig und mindestens 3 sein.');
 return {id,pitch:{kind:'circle',r:module*count/2},profile:{kind:'involute',module,pressureAngle:20,backlash:.15},z:[-width/2,width/2],side:'external',...extra};
}
export function describe(s:Surface){
 const t=teeth(s),fn=curve(s.pitch);
 return `${s.id}: ${s.pitch.kind}${fn.closed?` r̄=${(fn.length/TAU).toFixed(2)}`:''} ${s.profile.kind}${t!==undefined?` z=${Math.round(t)}`:''}${s.cone?` Kegel ${s.cone}°`:''}`;
}
