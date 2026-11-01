// Printable geometry for an element of a kinematics-1 document (KINEMATIK-KERN.md 9).
// The element's surface and its contacts decide the generator:
//   circle + basic rack           → involute outline, extruded
//   closed non-circular + rack    → pinion cutter rolled around the pitch curve
//   generated from a circle part  → that part's outline rolled on the blank
//   generated from a non-circular → A's toothed outline rolled along both curves
//   open curve (rail)             → the follower pinion rolled along the curve
import type {Mechanism,Element,Contact} from '../model.ts';
import {parseMechanism,expand} from '../model.ts';
import type {Surface} from '../surfaces.ts';
import {teeth} from '../surfaces.ts';
import {reference} from '../profiles.ts';
import {curve} from '../curves.ts';
import type {CurveFn} from '../curves.ts';
import {involuteOutline} from './involute.ts';
import type {V2} from './involute.ts';
import {railProfile,railMesh} from './rail.ts';
import {generateMate,generateConjugate,extrudeStar} from './hull.ts';
import type {Mesh} from './mesh.ts';

export type Part={mesh:Mesh;name:string;method:string};
const width=(s:Surface)=>[s.z[0],s.z[1]] as [number,number];

/** Toothed outline of a surface in its element frame (closed surfaces only). */
function outline(m:Mechanism,e:Element,s:Surface,depth=0):{points:V2[];method:string}{
 if(depth>3)throw Error('Erzeugungskette zu tief.');
 const fn=curve(s.pitch);if(!fn.closed||!fn.planar)throw Error(`${e.id}: offene Wälzkurve hat keinen Umriss.`);
 if(s.profile.kind==='friction')return {points:Array.from({length:360},(_,k)=>{const p=fn.point(fn.length*k/360);return [p[0],p[1]] as V2;}),method:'Reibrad: Wälzkurve als Umriss'};
 if(s.profile.kind==='library')throw Error(`${e.id}: Kaufteil (${s.profile.id}) – wird nicht gedruckt.`);
 if(s.profile.kind==='generated'){
  const from=s.profile.from,source=m.elements.find(x=>x.id===from.element),ss=source?.surfaces.find(x=>x.id===from.surface);if(!source||!ss)throw Error(`${e.id}: Quellfläche fehlt.`);
  const contact=m.contacts.find(c=>c.a.element===source.id&&c.b.element===e.id||c.b.element===source.id&&c.a.element===e.id);
  const ref=reference(ss.profile),module=ref?.module??1;
  // The cutter: a library gear's reference involute, or the source's own toothed outline.
  const cutter=ss.profile.kind==='library'&&ss.pitch.kind==='circle'?involuteOutline({module,teeth:Math.round(2*ss.pitch.r/module),backlash:.15,samples:24}):outline(m,source,ss,depth+1).points;
  const fa=curve(ss.pitch);
  if(ss.pitch.kind==='circle'&&s.pitch.kind==='circle'){
   const mate=generateMate({cutter,cutterRadius:ss.pitch.r,mateRadius:s.pitch.r,addendum:module,dedendum:1.25*module});
   return {points:mate.outline,method:`Gegenstück durch Abrollen von ${source.id}`};}
  const distance=contact?.params.distance??meanRadius(fa)+meanRadius(fn);
  if(!fa.arcAt||!fn.arcAt||!fn.polar)throw Error(`${e.id}: unrundes Gegenstück braucht sternförmige Wälzkurven.`);
  const mate=generateConjugate({cutter,arcA:fa.arcAt,arcB:fn.arcAt,lengthB:fn.length,radiusB:t=>fn.polar!(t).r,centerDistance:distance,addendum:module,dedendum:1.25*module});
  return {points:mate.outline,method:`unrundes Gegenstück durch Abrollen von ${source.id}`};
 }
 const ref=reference(s.profile);if(!ref||s.profile.kind==='helical')throw Error(`${e.id}: Profil ${s.profile.kind} wird hier nicht erzeugt.`);
 const z=Math.round(teeth(s)!);
 if(s.pitch.kind==='circle')return {points:involuteOutline({module:ref.module,teeth:z,pressureAngle:ref.pressureAngle,backlash:s.profile.kind==='involute'?s.profile.backlash:.15,samples:16}),method:`Evolventenrad z${z} m${ref.module}`};
 // Non-circular: a small pinion cutter of the same basic rack rolls around the outside.
 const rail=railProfile({path:s.pitch,module:ref.module,pinionTeeth:12,side:-1,from:0,to:fn.length,width:1,step:.04,poseStep:.06});
 return {points:rail.s.map((t,i)=>{const q=fn.point(t),n=fn.normal(t),h=-rail.top[i];return [q[0]+n[0]*h,q[1]+n[1]*h] as V2;}),method:`unrundes Rad, ${z} Zähne m${ref.module.toFixed(3)} (Schneidrad z12)`};
}
const meanRadius=(fn:CurveFn)=>fn.closed?fn.length/(2*Math.PI):0;

export function partMesh(input:Mechanism,elementId:string):Part{
 const m=expand(parseMechanism(structuredClone(input))),e=m.elements.find(x=>x.id===elementId);if(!e)throw Error('Element fehlt: '+elementId);
 if(e.source.kind==='library')throw Error(`${e.id} ist ein Kaufteil (${e.source.library} ${e.source.part}) und wird nicht gedruckt.`);
 const s=e.surfaces[0];if(!s)throw Error(`${e.id}: keine Wirkfläche.`);
 const fn=curve(s.pitch),[z0,z1]=width(s);
 if(!fn.closed){
  // Rail: the pinion of a follower contact rolls along the curve.
  const c=m.contacts.find((x:Contact)=>x.mode==='follower'&&x.b.element===e.id);if(!c)throw Error(`${e.id}: Zahnstange braucht einen Läuferkontakt mit Ritzel.`);
  const pinion=m.elements.find(x=>x.id===c.a.element)!,ps=pinion.surfaces.find(x=>x.id===c.a.surface)!,ref=reference(ps.profile);
  if(!ref||ps.pitch.kind!=='circle')throw Error(`${e.id}: Ritzel braucht ein Bezugsprofil.`);
  const length=Number.isFinite(fn.length)?fn.length:200,profile=railProfile({path:s.pitch,module:ref.module,pinionTeeth:Math.round(2*ps.pitch.r/ref.module),backlash:ps.profile.kind==='involute'?ps.profile.backlash:.15,side:c.params.side??1,from:0,to:length,width:z1-z0});
  const mesh=railMesh(profile),mid=(z0+z1)/2;for(const p of mesh.positions)p[2]+=mid;
  return {mesh,name:e.id,method:`Zahnstange entlang Pfad (${length.toFixed(0)} mm) für Ritzel ${pinion.id}`};
 }
 const o=outline(m,e,s);return {mesh:extrudeStar(o.points,z0,z1),name:e.id,method:o.method};
}
