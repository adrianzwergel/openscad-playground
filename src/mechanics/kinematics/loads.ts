// Loads from the drives (LAGER-UND-STRUKTUR.md, B.3): what a blocked motor puts
// on the bearing seats through its train. Torque per shaft from the train's
// rates, tooth forces per mesh (tangential T/r, radial tan 20°), belt pull,
// spindle thrust; each force is shared by the shaft's two seats by the lever
// rule. One load case per drive (the reverse direction is the same case
// negated, which a linear frame treats alike).
import type {V,Frame} from './math.ts';
import {compose,inverse,rotate,add,scale,norm,dot,cross} from './math.ts';
import type {Mechanism,Element} from './model.ts';
import type {Drive} from './drive.ts';
import {driveSpec} from './drive.ts';
import type {BearingPlan,Seat} from './bearings.ts';
import {curve} from './curves.ts';
import {closestArc} from './contacts.ts';

/** `factor`: share of the holding torque the structure is sized for (with the material's safety 3, 0.5 means a
 * blocked motor at safety 1.5). `efficiency`: of a lead screw (trapezoidal thread ≈ 0.3). */
export type DriveLoadSettings={factor:number;efficiency:number};
export const defaultDriveLoads:DriveLoadSettings={factor:.5,efficiency:.3};
/** Forces in the seat's link frame (N). `rail`: the force the pinion of a path drive puts on its rail, in the rail
 * owner's frame at the reference pose, to be applied at the rail holders one at a time. */
export type DriveLoadCase={drive:string;forces:Map<string,V>;rail?:{link:string;element:string;tangential:number;radial:number}};

const sub=(a:V,b:V):V=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const tanAlpha=Math.tan(20*Math.PI/180);
const unitOr=(v:V,fallback:V):V=>{const l=norm(v);return l<1e-9?fallback:scale(v,1/l);};
const perp=(v:V,axis:V):V=>sub(v,scale(axis,dot(v,axis)));

export function driveLoads(m:Mechanism,drives:Drive[],plan:BearingPlan,settings:Partial<DriveLoadSettings>={}):DriveLoadCase[]{
 const s={...defaultDriveLoads,...settings},out:DriveLoadCase[]=[];
 const frameOf=(id:string)=>m.bodies.find(b=>b.id===id)?.frame;
 const seatsOf=(line:string)=>plan.seats.filter(x=>x.line===line);
 const linkFrame=(link:string)=>frameOf(link)!;
 for(const d of drives){const spec=driveSpec(d.spec);if(!d.gear)continue;
  const T0=spec.torque*1000*s.factor,rates=d.gear.rates,rate0=Math.abs(rates[`${d.id}/ground/s0`]??1);
  // Torque on a body: the motor's torque times its speed over the body's (the driven link turns at rate 1).
  const bodyOf=(e:Element)=>e.mounts[0].body.replace(/\/rotor$/,'');
  const torqueOn=(body:string)=>{const r=rates[`${d.id}/ground/${body.slice(d.id.length+1)}`];if(body.startsWith(d.id+'/')&&r!==undefined)return T0*rate0/Math.max(1e-9,Math.abs(r));return T0*rate0;};
  const world=(e:Element):Frame|undefined=>{const f=frameOf(e.mounts[0].body);return f&&compose(f,e.mounts[0].pose);};
  const forces=new Map<string,V>(),addForce=(seat:Seat,fw:V)=>{const fl=rotate(inverse(linkFrame(seat.link)).rotation,fw),was=forces.get(seat.id)??[0,0,0];forces.set(seat.id,add(was,fl));};
  // A force at a point of a shaft goes to its seats by the lever rule (the two outermost seats of the line).
  const toSeats=(lineId:string,at:V,fw:V,extra:Seat[]=[])=>{const line=plan.lines.find(l=>l.id===lineId);if(!line)return;
   const lf=compose(linkFrame(line.link),line.frame),zOf=(p:V)=>compose(inverse(lf),{position:p,rotation:[0,0,0,1]}).position[2];
   const seats=[...seatsOf(lineId).filter(x=>['bearing','plain','flange'].includes(x.kind)&&x.link===line.link),...extra].map(x=>({x,z:zOf(compose(linkFrame(x.link),x.frame).position)})).sort((a,b)=>a.z-b.z);
   if(!seats.length)return;const z=zOf(at);if(seats.length===1||Math.abs(seats[seats.length-1].z-seats[0].z)<1e-6){addForce(seats[0].x,fw);return;}
   const a=seats[0],b=seats[seats.length-1],t=(z-a.z)/(b.z-a.z);addForce(a.x,scale(fw,1-t));addForce(b.x,scale(fw,t));};
  // Which line carries a body's force: its own shaft, or the driven axis for parts on the driven link.
  const lineFor=(body:string)=>plan.lines.some(l=>l.id===body)?body:plan.lines.some(l=>l.id===d.axis)?d.axis:undefined;
  const flange=plan.seats.find(x=>x.id===`${d.id}/flansch`);
  let rail:DriveLoadCase['rail'];
  for(const c of m.contacts){if(!c.id.startsWith(d.id+'/'))continue;
   const ea=m.elements.find(e=>e.id===c.a.element),eb=m.elements.find(e=>e.id===c.b.element);if(!ea||!eb)continue;
   const fa=world(ea),fb=world(eb);if(!fa||!fb)continue;
   const ends=[{e:ea,f:fa,o:eb,of:fb},{e:eb,f:fb,o:ea,of:fa}];
   // Tangential force of each wheel from its own torque; the radial share from the larger one (it is one mesh).
   const pitchR=(e:Element)=>e.surfaces[0]?.pitch.kind==='circle'?e.surfaces[0].pitch.r:Infinity;
   const ft=ends.map(x=>pitchR(x.e)<Infinity?torqueOn(bodyOf(x.e))/pitchR(x.e):0),fr=Math.max(...ft)*tanAlpha;
   ends.forEach((x,k)=>{if(pitchR(x.e)===Infinity)return;const axis=rotate(x.f.rotation,[0,0,1]);
    // Towards the other part: its centre, or for a rail the nearest point of its pitch curve.
    let toward:V;const op=x.o.surfaces[0]?.pitch;
    if(op&&op.kind!=='circle'){const fn=curve(op),local=compose(inverse(x.of),x.f).position,q=fn.point(closestArc(fn,local));toward=sub(compose(x.of,{position:q,rotation:[0,0,0,1]}).position,x.f.position);
     rail={link:x.o.mounts[0].body,element:x.o.id,tangential:ft[k],radial:fr};}
    else toward=sub(x.of.position,x.f.position);
    const n=unitOr(perp(toward,axis),[1,0,0]),t=cross(axis,n);
    const fw=c.kind==='belt'?scale(n,2*ft[k]):add(scale(t,ft[k]),scale(n,-fr));
    const line=lineFor(bodyOf(x.e));if(line)toSeats(line,x.f.position,fw,bodyOf(x.e)===`${d.id}/s0`&&flange?[flange]:[]);});
  }
  // Lead screw: the thrust 2π·T·η/lead goes into the fixed bearing and, opposite, into the nut.
  for(const e of m.elements){const p=e.surfaces[0]?.profile;if(!e.id.startsWith(d.id+'/')||p?.kind!=='helical'||e.source.kind!=='library')continue;
   const f=world(e);if(!f)continue;const axis=rotate(f.rotation,[0,0,1]),thrust=2*Math.PI*torqueOn(bodyOf(e))*s.efficiency/p.lead,fixed=plan.seats.find(x=>x.id===`${bodyOf(e)}/lager1`),nut=plan.seats.find(x=>x.id===`${d.axis}/mutter`);
   if(fixed)addForce(fixed,scale(axis,thrust));if(nut)addForce(nut,scale(axis,-thrust));}
  if(forces.size||rail)out.push({drive:d.id,forces,...(rail?{rail}:{})});
 }
 return out;
}
