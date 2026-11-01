// Contact residuals (KINEMATIK-KERN.md 4.7). Geometry residuals hold the two
// surfaces in mesh; the rolling residual ties the rotation of both bodies
// through equal arc length and is stacked over poses with a common constant.
import type {V,Frame} from './math.ts';
import {rotate,add,scale,norm,cross,dot,unit,compose,axisAngle} from './math.ts';
import type {Contact,ContactParams,Element,Mechanism} from './model.ts';
import {elementFrame} from './model.ts';
import type {Surface} from './surfaces.ts';
import {meanRadius,pitchPlane} from './surfaces.ts';
import {compatible} from './profiles.ts';
import {curve} from './curves.ts';
import type {CurveFn} from './curves.ts';
import {inverse} from './math.ts';
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
  if(c.mode==='follower'&&sa.pitch.kind!=='circle')throw Error(`Kontakt ${c.id}: Läufer: Seite a ist ein Rad mit Kreis-Wälzkurve.`);
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
/** Closest arc length on a curve to a local point, by sampling and Newton refinement. */
export function closestArc(fn:CurveFn,p:V,hint?:number):number{
 if(!Number.isFinite(fn.length))return p[0];
 let s=hint;
 if(s===undefined){const n=Math.max(64,Math.ceil(fn.length/5));let best=Infinity;for(let i=0;i<=n;i++){const t=fn.length*i/(fn.closed?n+1:n),q=fn.point(t),d=Math.hypot(q[0]-p[0],q[1]-p[1],q[2]-p[2]);if(d<best){best=d;s=t;}}}
 for(let k=0;k<20;k++){const q=fn.point(s!),t=fn.tangent(s!),nrm=fn.normal(s!),e=add(p,scale(q,-1)),denominator=1-fn.curvature(s!)*dot(e,nrm),step=dot(e,t)/(Math.abs(denominator)<1e-6?1e-6:denominator);
  let next=s!+step;if(!fn.closed)next=Math.max(0,Math.min(fn.length,next));s=next;if(Math.abs(step)<1e-10)break;}
 return s!;
}
/** Follower geometry: the pinion centre in rail-local coordinates, its arc length and normal offset. */
export function followerState(m:Pick<Mechanism,'bodies'>,r:Resolved){
 const A=surfaceFrame(m,r.ea,r.sa),B=surfaceFrame(m,r.eb,r.sb),fn=curve(r.sb.pitch),local=compose(inverse(B),A),p=local.position,s=closestArc(fn,p);
 const q=fn.point(s),e=add(p,scale(q,-1)),n=fn.normal(s),z=rotate(fn.frame(s).rotation,[0,0,1]),axisLocal=rotate(local.rotation,[0,0,1]);
 return {A,B,fn,s,e,n,z,t:fn.tangent(s),axisLocal,side:r.contact.params.side??1};
}
/** Geometry residuals holding the surfaces in mesh. Four values for every kind. */
export function geometryResiduals(m:Pick<Mechanism,'bodies'>,r:Resolved):number[]{
 const {contact:c,sa,sb}=r,A=surfaceFrame(m,r.ea,sa),B=surfaceFrame(m,r.eb,sb),za=zOf(A),zb=zOf(B),d=add(B.position,scale(A.position,-1));
 if(c.mode==='follower'){
  // Pinion centre at radius r on the chosen side of the rail curve, axis along the rail's axis, in the rail's mid-plane.
  const f=followerState(m,r),ra=meanRadius(sa),ax=cross(f.axisLocal,f.z);
  return [dot(f.e,f.n)-f.side*ra,dot(f.e,f.z)-(c.params.offsetB-c.params.offsetA),dot(ax,f.t)*100,dot(ax,f.n)*100];
 }
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
/** Pair geometry shared by residuals, mate frames and reach tests. */
export type PairGeometry={kind:Contact['kind'];ra:number;rb:number;crossing:boolean;sigma:number;ha:number;hb:number;distance:number;sign:number};
export function pairGeometry(sa:Surface,sb:Surface,kind:Contact['kind'],params:Partial<ContactParams>):PairGeometry{
 const ra=meanRadius(sa),rb=meanRadius(sb);
 if(kind==='helical')return {kind,ra,rb,crossing:true,sigma:90,ha:0,hb:0,distance:params.distance??ra+rb,sign:1};
 const crossing=kind==='roll'&&!!(sa.cone||sb.cone);
 if(crossing){const sigma=params.angle??((sa.cone??0)+(sb.cone??0)),{d1,d2}=coneAngles(ra,rb,sigma),offset=(s:Surface)=>s.profile.kind==='library'&&s.profile.apexOffset||0;
  return {kind,ra,rb,crossing,sigma,ha:ra/Math.tan(d1)+offset(sa),hb:rb/Math.tan(d2)+offset(sb),distance:0,sign:-1};}
 const distance=params.distance??(kind==='belt'?beltCenter(params.length!,ra,rb):sb.side==='internal'?rb-ra:sa.side==='internal'?ra-rb:ra+rb);
 return {kind,ra,rb,crossing:false,sigma:0,ha:0,hb:0,distance,sign:kind==='belt'||sa.side==='internal'||sb.side==='internal'?1:-1};
}
/** Frame of the driven surface relative to the driving surface frame for given parameters.
 * Parallel pairs translate in the plane; crossed pairs meet at the apex; worms cross at 90°. */
export function mateFrame(g:PairGeometry,params:Partial<ContactParams>):Frame{
 const az=params.azimuth??0,rz=axisAngle([0,0,1],az);
 if(g.kind==='helical')return compose({position:[0,0,0],rotation:rz},{position:[0,-g.distance,0],rotation:axisAngle([0,1,0],-90)});
 if(g.crossing){const s=g.sigma*Math.PI/180;return compose({position:[0,0,0],rotation:rz},{position:[0,g.hb*Math.sin(s),g.ha-g.hb*Math.cos(s)],rotation:axisAngle([1,0,0],g.sigma)});}
 const t=az*Math.PI/180;return {position:[g.distance*Math.cos(t),g.distance*Math.sin(t),(params.offsetB??0)-(params.offsetA??0)],rotation:[0,0,0,1]};
}
/** Rolling: Σ coeff_i·ψ_i with ψ measured from the line of centres about each axis (radians).
 * The caller unwraps each angle against the previous pose before summing. */
/** `arc` maps an unwrapped angle to arc length for non-circular pitch curves; it replaces coeff·ψ. */
export function rollingTerm(m:Pick<Mechanism,'bodies'>,r:Resolved):{psi:number[];coeff:number[];periodic?:boolean[];arc?:(((psi:number)=>number)|undefined)[]}{
 const {contact:c,sa,sb}=r,A=surfaceFrame(m,r.ea,sa),B=surfaceFrame(m,r.eb,sb),za=zOf(A),zb=zOf(B),d=add(B.position,scale(A.position,-1));
 const angle=(f:Frame,z:V,reference:V)=>{const x=rotate(f.rotation,[1,0,0]),ref=perp(reference,z);if(norm(ref)<1e-9)return 0;const u=unit(ref);return Math.atan2(dot(cross(u,x),z),dot(u,x));};
 const ra=meanRadius(sa),rb=meanRadius(sb);
 if(c.mode==='follower'){
  // Equal arc length: the pinion turns relative to the contact normal by −side·Δs/r about the rail's z. Arc length is not periodic.
  // The pinion's axis may point either way along that z; ψ is measured about the pinion's own axis, so an opposite axis flips the sign.
  const f=followerState(m,r),toward=rotate(f.B.rotation,scale(f.n,-f.side)),facing=dot(f.axisLocal,f.z)<0?-1:1;
  return {psi:[angle(A,za,toward),f.s],coeff:[facing*f.side*ra,1],periodic:[true,false]};
 }
 if(c.kind==='helical'){
  // The worm advances lead/2π per radian; the wheel turns about its axis relative to the worm axis direction.
  const lead=(sa.profile as {lead:number}).lead,hand=c.params.hand??1;
  return {psi:[angle(A,za,zb),angle(B,zb,za)],coeff:[-hand*lead/(2*Math.PI),rb]};
 }
 const sign=c.kind==='belt'||sa.side==='internal'||sb.side==='internal'?-1:1;
 // Non-circular pitch curves: the contact lies on the line of centres at polar angle −ψ in the
 // element frame, so the rolled arc length is −S(−ψ) with S the curve's arc length from angle 0.
 const arcOf=(s:Surface)=>{if(s.pitch.kind==='circle')return undefined;const fn=curve(s.pitch);if(!fn.arcAt)return undefined;return (psi:number)=>-fn.arcAt!(-psi);};
 const arcA=arcOf(sa),arcB=arcOf(sb);
 return {psi:[angle(A,za,d),angle(B,zb,scale(d,-1))],coeff:[arcA?1:ra,sign*(arcB?1:rb)],...(arcA||arcB?{arc:[arcA,arcB]}:{})};
}
/** Constant ratio dq_b/dq_a for contacts whose pitch curves are circles. */
export function constantRatio(r:Resolved):number|undefined{
 const {contact:c,sa,sb}=r;if(c.mode==='follower'||sa.pitch.kind!=='circle'||sb.pitch.kind!=='circle')return undefined;
 const ra=sa.pitch.r,rb=sb.pitch.r;
 // Worm: one radian advances the thread by lead/2π, which the wheel rolls off at radius rb (= starts/teeth).
 if(c.kind==='helical'){const lead=(sa.profile as {lead:number}).lead;return (c.params.hand??1)*lead/(2*Math.PI*rb);}
 const sign=c.kind==='belt'||sa.side==='internal'||sb.side==='internal'?1:-1;return sign*ra/rb;
}
