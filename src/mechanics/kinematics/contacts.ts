// Contact residuals (KINEMATIK-KERN.md 4.7). Geometry residuals hold the two
// surfaces in mesh; the rolling residual ties the rotation of both bodies
// through equal arc length and is stacked over poses with a common constant.
import type {V,Frame} from './math.ts';
import {rotate,add,scale,norm,cross,dot,unit} from './math.ts';
import type {Contact,Element,Mechanism} from './model.ts';
import {elementFrame} from './model.ts';
import type {Surface} from './surfaces.ts';
import {meanRadius,pitchPlane} from './surfaces.ts';
import {compatible} from './profiles.ts';
import {beltCenter} from '../motion.ts';

export type Resolved={contact:Contact;ea:Element;eb:Element;sa:Surface;sb:Surface};
export function resolveContact(m:Pick<Mechanism,'elements'>,c:Contact):Resolved{
 const ea=m.elements.find(e=>e.id===c.a.element)!,eb=m.elements.find(e=>e.id===c.b.element)!,sa=ea.surfaces.find(s=>s.id===c.a.surface)!,sb=eb.surfaces.find(s=>s.id===c.b.surface)!;
 return {contact:c,ea,eb,sa,sb};
}
export function checkContact(r:Resolved){
 const {contact:c,sa,sb}=r,comp=compatible(sa.profile,sb.profile,{a:c.a,b:c.b});if(!comp.ok)throw Error(`Kontakt ${c.id}: ${comp.reason}`);
 if(c.kind==='belt'&&(sa.profile.kind!=='belt'||sb.profile.kind!=='belt'))throw Error(`Kontakt ${c.id}: Riemenkontakt braucht Riemenprofile.`);
 if(c.kind==='helical'&&sa.profile.kind!=='helical')throw Error(`Kontakt ${c.id}: Schraubkontakt: Seite a ist die Schnecke.`);
 if(c.kind==='belt'&&!(c.params.length!>0))throw Error(`Kontakt ${c.id}: Riemenlänge fehlt.`);
 if(c.mode==='follower'&&c.kind!=='roll')throw Error(`Kontakt ${c.id}: Läufer nur bei Rollkontakt.`);
}
/** Surface frame in world: element frame shifted to the middle of the axial range. */
export function surfaceFrame(m:Pick<Mechanism,'bodies'>,e:Element,s:Surface):Frame{const f=elementFrame(m,e);return {position:add(f.position,scale(rotate(f.rotation,[0,0,1]),pitchPlane(s))),rotation:f.rotation};}
const zOf=(f:Frame)=>rotate(f.rotation,[0,0,1]);
const perp=(v:V,z:V)=>add(v,scale(z,-dot(v,z)));
/** Pitch cone half angles for crossing axes at angle sigma (degrees). */
export function coneAngles(ra:number,rb:number,sigma:number){const s=sigma*Math.PI/180,d1=Math.atan2(Math.sin(s),rb/ra+Math.cos(s)),d2=s-d1;return {d1,d2};}
function apexHeights(r:Resolved,sigma:number){
 const ra=meanRadius(r.sa),rb=meanRadius(r.sb),{d1,d2}=coneAngles(ra,rb,sigma),offset=(s:Surface)=>s.profile.kind==='library'&&(s.profile as {apexOffset?:number}).apexOffset||0;
 return {ha:ra/Math.tan(d1)+offset(r.sa),hb:rb/Math.tan(d2)+offset(r.sb),ra,rb};
}
/** Geometry residuals holding the surfaces in mesh. Four values for every kind. */
export function geometryResiduals(m:Pick<Mechanism,'bodies'>,r:Resolved):number[]{
 const {contact:c,sa,sb}=r,A=surfaceFrame(m,r.ea,sa),B=surfaceFrame(m,r.eb,sb),za=zOf(A),zb=zOf(B),d=add(B.position,scale(A.position,-1));
 if(c.kind==='helical'){
  const distance=c.params.distance??meanRadius(sa)+meanRadius(sb),n=cross(za,zb),nl=norm(n);
  // Perpendicular axes, centre distance along the common normal, both centres in the other's mid-plane.
  return [dot(za,zb)*100,nl<1e-9?norm(d)-distance:Math.abs(dot(d,n)/nl)-distance,dot(d,za),dot(d,zb)];
 }
 const crossing=c.kind==='roll'&&(sa.cone||sb.cone);
 if(crossing){
  const sigma=c.params.angle??((sa.cone??0)+(sb.cone??0)),{ha,hb}=apexHeights(r,sigma),apexA=add(A.position,scale(za,ha)),apexB=add(B.position,scale(zb,hb)),e=add(apexB,scale(apexA,-1));
  const ang=Math.acos(Math.max(-1,Math.min(1,dot(za,zb))))*180/Math.PI;
  return [e[0],e[1],e[2],ang-sigma];
 }
 // Parallel axes: axis alignment (2), centre distance (1), axial seat (1).
 const ra=meanRadius(sa),rb=meanRadius(sb),ax=cross(za,zb),xa=rotate(A.rotation,[1,0,0]),ya=rotate(A.rotation,[0,1,0]);
 const distance=c.params.distance??(c.kind==='belt'?beltCenter(c.params.length!,ra,rb):sb.side==='internal'?rb-ra:sa.side==='internal'?ra-rb:ra+rb);
 const dp=perp(d,za);
 return [dot(ax,xa)*100,dot(ax,ya)*100,norm(dp)-distance,dot(d,za)-(c.params.offsetB-c.params.offsetA)];
}
/** Rolling: Σ coeff_i·ψ_i with ψ measured from the line of centres about each axis (radians).
 * The caller unwraps each angle against the previous pose before summing. */
export function rollingTerm(m:Pick<Mechanism,'bodies'>,r:Resolved):{psi:number[];coeff:number[]}{
 const {contact:c,sa,sb}=r,A=surfaceFrame(m,r.ea,sa),B=surfaceFrame(m,r.eb,sb),za=zOf(A),zb=zOf(B),d=add(B.position,scale(A.position,-1));
 const angle=(f:Frame,z:V,reference:V)=>{const x=rotate(f.rotation,[1,0,0]),ref=perp(reference,z);if(norm(ref)<1e-9)return 0;const u=unit(ref);return Math.atan2(dot(cross(u,x),z),dot(u,x));};
 const ra=meanRadius(sa),rb=meanRadius(sb);
 if(c.kind==='helical'){
  // The worm advances lead/2π per radian; the wheel turns about its axis relative to the worm axis direction.
  const lead=(sa.profile as {lead:number}).lead,hand=c.params.hand??1;
  return {psi:[angle(A,za,zb),angle(B,zb,za)],coeff:[-hand*lead/(2*Math.PI),rb]};
 }
 const sign=c.kind==='belt'||sa.side==='internal'||sb.side==='internal'?-1:1;
 return {psi:[angle(A,za,d),angle(B,zb,scale(d,-1))],coeff:[ra,sign*rb]};
}
/** Constant ratio dq_b/dq_a for contacts whose pitch curves are circles. */
export function constantRatio(r:Resolved):number|undefined{
 const {contact:c,sa,sb}=r;if(sa.pitch.kind!=='circle'||sb.pitch.kind!=='circle')return undefined;
 const ra=sa.pitch.r,rb=sb.pitch.r;
 // Worm: one radian advances the thread by lead/2π, which the wheel rolls off at radius rb (= starts/teeth).
 if(c.kind==='helical'){const lead=(sa.profile as {lead:number}).lead;return (c.params.hand??1)*lead/(2*Math.PI*rb);}
 const sign=c.kind==='belt'||sa.side==='internal'||sb.side==='internal'?1:-1;return sign*ra/rb;
}
