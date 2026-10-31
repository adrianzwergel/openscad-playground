// Construction space for placed chains: hulls, collision pairs, clearance and
// environment checks. Bearing seats and tool access are decided after the
// gears (KINEMATIK-KERN.md 7.5), so they are not part of the hull set.
import type {V,Frame} from './math.ts';
import {rotate,add,scale,norm,dot,axis} from './math.ts';
import type {Environment,Envelope,Contact} from './model.ts';
import {separation,containment,regionHull} from '../graph/space.ts';
import type {Check} from './conjugate.ts';

export type Box={id:string;owner:string;kind:'rotor'|'shaft'|'drive'|'coupling';center:V;axes:V[];half:V;radial?:boolean;exempt?:{kind:Box['kind'];id:string}[]};
export type PlacedElement={id:string;body:string;frame:Frame;envelope:Envelope;shaftLimit?:number;rearSupport?:boolean;z:number};
export type PlacedBody={id:string;frame:Frame;shaft?:{diameter:number;start:number;end:number};rotorOf?:string};
export type PlacedContact={kind:Contact['kind'];rule:string;a:string;b:string;frameA:Frame;ra:number;rb:number;distance:number;params:Record<string,number>};
export type Placed={bodies:PlacedBody[];elements:PlacedElement[];contacts:PlacedContact[];couplings:{body:string;members:string[];radius:number}[];environment?:Environment};

function box(id:string,owner:string,kind:Box['kind'],f:Frame,r:number,lo:number,hi:number):Box{return {id,owner,kind,center:add(f.position,scale(axis(f),(lo+hi)/2)),axes:[rotate(f.rotation,[1,0,0]),rotate(f.rotation,[0,1,0]),axis(f)],half:[r,r,(hi-lo)/2]};}
/** A sphere around a cylindrical rotor and a capsule around a finite shaft can prove clearance
 * where oriented boxes overlap. With `enough` the result is exact below that value only. */
export function clearance(a:Box,b:Box,enough=Infinity){
 let capsule=-Infinity;const rotor=a.kind==='rotor'?a:b,shaft=a.kind==='shaft'?a:b;
 if(rotor.kind==='rotor'&&shaft.kind==='shaft'&&rotor.radial&&shaft.radial!==false){
  const delta=add(rotor.center,scale(shaft.center,-1)),along=Math.max(-shaft.half[2],Math.min(shaft.half[2],dot(delta,shaft.axes[2])));const distance=norm(add(delta,scale(shaft.axes[2],-along)));capsule=distance-Math.hypot(rotor.half[0],rotor.half[2])-shaft.half[0];
  if(capsule>=enough)return capsule;}
 return Math.max(separation(a,b,enough),capsule);
}
export const separated=(a:Box,b:Box,margin:number)=>clearance(a,b,margin)>=margin-1e-7;

/** Hulls of a placed chain. Shaft limits of crossed LEGO pairs clip the shaft and report overruns. */
export function hulls(p:Placed){
 const boxes:Box[]=[],checks:Check[]=[];
 for(const e of p.elements){const h=e.envelope,b=box(e.id,e.body,'rotor',e.frame,h.radius,h.min,h.max);b.radial=!h.transverse;if(h.transverse){b.half[0]=h.transverse[0];b.half[1]=h.transverse[1];}boxes.push(b);}
 for(const c of p.couplings){const es=c.members.map(id=>p.elements.find(e=>e.id===id)!).sort((a,b)=>a.z-b.z),body=p.bodies.find(b=>b.id===c.body)!,lo=es[0].z+es[0].envelope.max,hi=es.at(-1)!.z+es.at(-1)!.envelope.min;
  if(hi>lo){const r=box('coupling-'+c.body,c.body,'coupling',body.frame,c.radius,lo,hi);r.exempt=es.map(e=>({kind:'rotor' as const,id:e.id}));boxes.push(r);}}
 for(const b of p.bodies){if(!b.shaft)continue;const es=p.elements.filter(e=>e.body===b.id||p.bodies.find(x=>x.id===e.body)?.rotorOf===b.id);if(!es.length)continue;
  const limit=Math.min(Infinity,...es.filter(e=>e.shaftLimit!==undefined).map(e=>e.z+e.shaftLimit!)),end=Math.min(b.shaft.end,limit);
  for(const e of es)if(e.z+e.envelope.max>limit+1e-6)checks.push({id:b.id+'/shaft-limit',state:'fail',message:'Bauteil liegt jenseits des zulässigen Wellenendes an einer 90°-Paarung.'});
  boxes.push(box(b.id,b.id,'shaft',b.frame,b.shaft.diameter/2,b.shaft.start,end));}
 for(const c of p.contacts)if(c.kind==='belt'){
  // Belt hull between the pulleys, widened by the tensioning travel of the driven pulley.
  const radius=Math.max(c.ra,c.rb)+2,az=axisAngle2(c.frameA,c.params.azimuth??0),centre=add(c.frameA.position,scale(az,c.distance/2));
  boxes.push({id:c.rule+'-space-'+c.a+'-'+c.b,owner:c.a,kind:'drive',center:centre,axes:[az,rotate(c.frameA.rotation,[0,0,1]).map((_,i)=>cross3(rotate(c.frameA.rotation,[0,0,1]),az)[i]) as V,rotate(c.frameA.rotation,[0,0,1])],half:[c.distance/2+radius+(c.params.tension??1),radius,3],exempt:[{kind:'rotor',id:c.a},{kind:'rotor',id:c.b},{kind:'shaft',id:p.elements.find(e=>e.id===c.a)!.body},{kind:'shaft',id:p.elements.find(e=>e.id===c.b)!.body}]});
  const driven=p.elements.find(e=>e.id===c.b)!;for(const b of boxes.filter(b=>b.owner===driven.body||b.id===driven.id)){b.radial=false;const lo=-(c.params.release??2),hi=c.params.tension??1;b.center=add(b.center,scale(az,(lo+hi)/2));b.half=b.half.map((h,i)=>h+Math.abs(dot(b.axes[i],az))*(hi-lo)/2) as V;}
 }
 return {boxes,checks};
}
const cross3=(a:V,b:V):V=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const axisAngle2=(f:Frame,deg:number):V=>{const t=deg*Math.PI/180;return rotate(f.rotation,[Math.cos(t),Math.sin(t),0]);};

export function collisionPairs(p:Placed,boxes:Box[]){
 const pairs:[Box,Box][]=[],contacts=new Set(p.contacts.map(c=>[c.a,c.b].sort().join('|'))),wormWheel=new Set(p.contacts.filter(c=>c.kind==='helical').map(c=>c.b+'|'+p.elements.find(e=>e.id===c.a)!.body));
 const shaftOf=(b:Box)=>b.kind==='shaft'?b.id:p.bodies.find(x=>x.id===b.owner)?.rotorOf??b.owner;
 for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];
  if(a.exempt?.some(e=>e.id===b.id&&e.kind===b.kind)||b.exempt?.some(e=>e.id===a.id&&e.kind===a.kind))continue;
  if(a.kind==='rotor'&&b.kind==='rotor'&&contacts.has([a.id,b.id].sort().join('|')))continue;
  if((a.kind==='shaft'||b.kind==='shaft')&&shaftOf(a)===shaftOf(b))continue;
  if(a.kind==='rotor'&&b.kind==='shaft'&&wormWheel.has(a.id+'|'+b.id)||b.kind==='rotor'&&a.kind==='shaft'&&wormWheel.has(b.id+'|'+a.id))continue;
  pairs.push([a,b]);}
 return pairs;
}
/** Residual-style violations: internal collisions and environment, keyed per hull so dimensions stay stable. */
export function violations(p:Placed,boxes:Box[],aim:number){
 const out=new Map<string,number[]>(),env=p.environment;
 for(const b of boxes)out.set(b.kind+':'+b.id,env?[...(env.bounds?containment(b,regionHull(env.bounds),env.margin):[]),...env.obstacles.map(o=>Math.max(0,env.margin-separation(b,regionHull(o),env.margin)))]:[]);
 const collisions=new Map<string,number>();
 for(const [a,b] of collisionPairs(p,boxes)){const v=Math.max(0,aim-clearance(a,b,aim));for(const h of [a,b]){const key=h.kind+':'+h.id;collisions.set(key,Math.max(collisions.get(key)??0,v));}}
 for(const [key,list] of out)list.push(collisions.get(key)??0);
 return out;
}
export function assessConstruction(p:Placed,margin=1){
 const {boxes,checks}=hulls(p);
 for(const [a,b] of collisionPairs(p,boxes))if(!separated(a,b,margin))checks.push({id:`space/${a.id}/${b.id}`,state:'fail',message:`Konservative Freiraumprüfung: ${a.id} / ${b.id} (${margin} mm). Genauere Geometrie könnte den Kandidaten noch freigeben.`});
 if(p.environment){const env=p.environment;for(const b of boxes){
  if(env.bounds&&containment(b,regionHull(env.bounds),env.margin).some(n=>n>1e-7))checks.push({id:'bounds/'+b.id,state:'fail',message:`${b.id}: Hülle überschreitet den Bauraum oder dessen Randabstand (${env.margin} mm).`});
  for(const o of env.obstacles)if(separation(b,regionHull(o),env.margin)<env.margin-1e-7)checks.push({id:'obstacle/'+o.id+'/'+b.id,state:'fail',message:`${b.id}: Sperrzone ${o.id} verletzt (${env.margin} mm Abstand).`});}
  if(!checks.some(c=>c.id.startsWith('bounds/')||c.id.startsWith('obstacle/')))checks.push({id:'environment',state:'pass',message:'Alle Bauteil-, Bewegungs- und Verbindungsräume liegen im Bauraum und außerhalb der Sperrzonen.'});}
 if(!checks.some(c=>c.state==='fail'))checks.push({id:'reserved-spaces',state:'pass',message:'Nicht kämmende Rotoren, endliche Wellen und Antriebsräume geometrisch getrennt.'});
 checks.push({id:'bearings-open',state:'unknown',message:'Lagerung, Achslängen und Werkzeugzugang werden nach der Zahnradwahl festgelegt.'});
 return {checks,boxes,valid:checks.every(c=>c.state!=='fail')};
}
