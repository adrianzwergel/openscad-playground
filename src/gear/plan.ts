// From linked shafts on a plane to a gearbox: where every wheel, pulley and bearing stands in the world, which wheels
// mesh, the belts and their lengths, how fast every shaft turns, the layers the bearings fall into, the webs that join
// them, and what is in the way. Pure: the shaft files come in as data.
//
// World: x/y the plane, z up. A placed shaft's item from x0 to x1 (shaft generator) stands from z+x0 to z+x1, or, flipped,
// from z+L−x1 to z+L−x0. A layer holds the bearings whose middle lies in it; its plates reach `lip` beyond its bearings'
// faces (the rim holding the outer ring), so that band is what must stay clear of wheels.
import {planShaft} from '../shaft/plan.ts';
import type {Plan as ShaftPlan} from '../shaft/plan.ts';
import type {ShaftDoc} from '../shaft/model.ts';
import {outer,label as profileLabel} from '../shaft/profile.ts';
import type {Profile} from '../shaft/profile.ts';
import {BELTS} from '../mechanics/motion.ts';
import {partById} from '../mechanics/parts/catalog.ts';
import type {Part} from '../mechanics/parts/catalog.ts';
import type {GearDoc,PlacedShaft,Layer} from './model.ts';
import {itemKey,webKey} from './model.ts';
import {capsuleDistance,primDistance,primsApart,bound,turned,rot} from './sweep.ts';
import type {Prim,Sweep,Capsule} from './sweep.ts';

const eps=1e-6;
export type ShaftFile={name:string;doc:ShaftDoc};
export type Placed={key:string;on:string;item:string;label:string;at:[number,number];z0:number;z1:number};
export type Wheel=Placed&{teeth:number;module?:number;pulley:boolean;pitch:number;outer:number;lego:boolean;/** Runs free on its shaft: a rotor of its own. */free?:boolean};
/** A motor whose shaft is in a linked shaft: its flange face (z), its body below (`down`) or above it, the layer it is
 * screwed to, how far its shaft would have to move to lie on a layer, the slot direction when it drives a belt. `pad`:
 * radius of the round flange field in the plate. */
export type Motor={key:string;on:string;part:Part;label:string;at:[number,number];face:number;down:boolean;depth:number;pad:number;layer?:string;offset?:number;slot?:[number,number];travel:number};
/** A bearing, or a motor's flange as a node of its layer's plate (`motor`; then D/2 + rim is its flange field). */
/** `hub`: no bearing but the hub of a link fixed on this shaft: a bore of the shaft's profile there (turned as the shaft
 * stands), through the plate. */
export type Bearing=Placed&{D:number;d:number;B:number;motor?:Motor;hub?:{profile:Profile;turn:number}};
/** Wall of a hub round its shaft. */
export const HUB_WALL=4;
/** The drives and what they turn, each as factors of the drives' turns: shafts, free wheels, the joints (a link against the
 * body it hangs on); `needs`: how far a drive turns for all joints' ranges; `lines`: said in words. */
export type Drive={inputs:{id:string;label:string}[];shafts:Record<string,number[]>;wheels:Record<string,number[]>;joints:Record<string,number[]>;needs:Record<string,[number,number]>;lines:string[]};
/** What a plate must keep clear of: a disc from z0 to z1, or the hull of two discs (a belt, an arm). `body`: the swing arm
 * it moves with ('' the frame). `spin`: it turns about `a` through these angles (an arm; 0 to 360: endlessly). `soft`: only
 * in the way of what moves against it (a motor's body). */
export type Obstacle={key:string;label:string;z0:number;z1:number;a:[number,number];ra:number;b?:[number,number];rb?:number;on:string[];body:string;belt?:boolean;spin?:{from:number;to:number};soft?:boolean;/** A retaining ring in its groove: `ra` the room it takes (lugs, pliers); the plates leave an opening for it. */clip?:'471'|'6799'};
/** An arm on a shaft: where it points as drawn (degrees in the plane), from the axis `length` to the middle of its end;
 * `spin`: how far it turns (else endlessly), `rate`: degrees per degree of the shaft the range is set at. */
export type Arm=Placed&{angle:number;length:number;r0:number;r1:number;hole:number;spin?:[number,number];rate?:number;/** In a pose: the angle its range counts from. */zero?:number};
/** A swing arm as planned: its pivot's place. */
export type GroupPlan={id:string;name:string;pivot:string;at:[number,number];from:number;to:number;shafts:string[];/** Fast on its pivot shaft. */fixed:boolean;/** The body its pivot shaft belongs to: what it hangs on. */parent:string};
/** How the plan looks at things from a body: what is in the way there, how far it is from a point or a shape. */
type Bodies={groups:GroupPlan[];bodyOf(shaft:string):string;seen(body:string):Obstacle[];/** `within`: only this near matters; what is surely further counts as endlessly far (fast). */od(o:Obstacle,body:string,p:[number,number],within?:number):number;oa(o:Obstacle,body:string,g:Prim,within?:number):number;around(o:Obstacle,body:string):{c:[number,number];r:number};name(o:Obstacle,body:string):string;
 /** The way a shaft takes through a plate of this body: none (it stands still there), an arc, or 'x' (two swing arms). */arc(shaft:string,body:string):Sweep|undefined|'x';relative(from:string,to:string):Sweep[];chain(body:string):GroupPlan[];/** A shaft's profile at a height, and how it is turned as it stands. */section(shaft:string,z:number):Profile|undefined;turnOf(shaft:string):number};
export type ShaftInWorld={id:string;label:string;at:[number,number];z0:number;z1:number;plan:ShaftPlan;/** Its round pieces in the world: z0..z1 and radius. */pieces:{z0:number;z1:number;r:number}[]};
export type Mesh={a:string;b:string;ratio:number};
/** `tension`: a motor's slots move the centre distance within `range` (lengths at its ends); `fit`: the centre distance
 * the stock belt wants. */
export type BeltPlan={/** Its length over a swing arm's range, when one of its pulleys swings. */swing?:{group:string;range:[number,number]};id:string;a:string;b:string;center:number;length:number;stock?:number;tension?:{motor:string;range:[number,number]};fit?:{stock:number;center:number}};
/** A web: straight (the hull of both rings), round a part (`path`: points it goes through, `width` its half width there),
 * or `z`: only that high, under or over a part. `route`: what the user chose; `hits`: what it still runs into. */
export type WebPlan={a:string;b:string;auto:boolean;forced:boolean;route?:'aussen'|'tiefe';path?:[number,number][];width?:number;z?:[number,number];hits:string[]};
/** `pair`: two plates clamping the bearings, split at `split`; else one plate. `lips`: a stop over the outer ring at the
 * bottom / at the top (one plate: only on the outer side of the lowest and the highest layer). */
/** `motor`: a motor's own plate (the key of its motor), at its flange, on the side away from its body. */
export type LayerPlan={motor?:string;/** The swing arm it belongs to, '' the frame. */body:string;id:string;z0:number;z1:number;band:[number,number];split:number;pair:boolean;lips:[boolean,boolean];auto:boolean;rim:number;thickness:number;bearings:string[];webs:WebPlan[];/** Holes for shafts passing through; `ring`: where the hole cuts into the plate, the plate gets material round it
 * out to this radius first, so it never falls apart or keeps only a sliver there. `open`: a slot of the hole's width from
 * it out of the plate (`dir`, `length` from the centre), where something on that shaft could not pass the hole when the
 * plate goes on. */holes:Hole[];parts:number;/** A lip opened wider than usual for a retaining ring beside the bearing: bearing → radius. */openings?:Record<string,number>};
export type Hole={on:string;r:number;ring?:number;open?:{dir:[number,number];length:number};/** The shaft moves through the plate along this arc: the hole is a slot along it. */arc?:Sweep;/** In a pose: where the arc starts, moved with the plate. */base?:[number,number]};
export type Issue={level:'fehler'|'warnung'|'hinweis';message:string;ref?:string};
/** A bolt through all plates: where, the eye round it, which bearing of each layer its eye is joined to. */
export type Bolt={/** Through the plates of this body ('' the frame). */body:string;at:[number,number];eye:number;hole:number;auto:boolean;attach:Record<string,string>;/** Set by hand onto a wheel, bearing or shaft. */hit?:boolean};
/** Printed columns between two layers, one per bolt. */
export type Columns={from:string;to:string;z0:number;z1:number;body:string};
export type BomLine={what:string;count:number;note?:string};
export type GearPlan={drive:Drive;arms:Arm[];groups:GroupPlan[];/** Degrees every shaft turns per degree of the shaft the range is set at, where that is known. */turnRate:Record<string,number>;motors:Motor[];shafts:ShaftInWorld[];wheels:Wheel[];bearings:Bearing[];obstacles:Obstacle[];meshes:Mesh[];belts:BeltPlan[];rates:Record<string,number>;layers:LayerPlan[];bolts:Bolt[];columns:Columns[];screw?:{length:number;what:string};bom:BomLine[];issues:Issue[]};

const n=(x:number)=>String(+x.toFixed(2)).replace('.',',');
const mm=(x:number)=>`${n(x)} mm`;
const dist=(a:[number,number],b:[number,number])=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const overlap=(a0:number,a1:number,b0:number,b1:number)=>Math.min(a1,b1)-Math.max(a0,b0);
/** Distance from a point to the hull of two discs (negative inside): the hull is the union of the discs between them. */
/** What a piece surely stays in: a circle, or, swept about a centre, the ring between its nearest and furthest point from
 * it. `gap`: how far a circle is from that at least (a lower bound of the true distance). */
type Reach={c:[number,number];lo:number;hi:number;/** The circle round all of it. */all:{c:[number,number];r:number}};
/** A circle that holds all of a piece (`bound` of sweep.ts is only for getting past discs). */
const circleOf=(g:Prim):{c:[number,number];r:number}=>g.sweep&&g.sweep.to-g.sweep.from>1e-9?bound(g):{c:[(g.a[0]+g.b[0])/2,(g.a[1]+g.b[1])/2],r:Math.hypot(g.b[0]-g.a[0],g.b[1]-g.a[1])/2+Math.max(g.ra,g.rb)};
const reachOf=(g:Prim):Reach=>{const all=circleOf(g);if(!g.sweep)return {c:all.c,lo:0,hi:all.r,all};const c=g.sweep.c;return {all,c,lo:Math.max(0,capsuleDistance(c,g.a,0,g.b,0)-Math.max(g.ra,g.rb)),hi:Math.max(Math.hypot(g.a[0]-c[0],g.a[1]-c[1])+g.ra,Math.hypot(g.b[0]-c[0],g.b[1]-c[1])+g.rb)};};
const gap=(q:Reach,c:[number,number],r:number)=>{const d=Math.hypot(c[0]-q.c[0],c[1]-q.c[1]);return Math.max(d-q.hi,q.lo-d,Math.hypot(c[0]-q.all.c[0],c[1]-q.all.c[1])-q.all.r)-r;};
export function hullDistance(p:[number,number],a:[number,number],ra:number,b:[number,number],rb:number){return capsuleDistance(p,a,ra,b,rb);}
/** How far an obstacle reaches from its centre `a` (an arm: to its end). */
const reach=(o:Obstacle)=>o.spin&&o.b?Math.max(o.ra,dist(o.a,o.b)+(o.rb??0)):o.ra;
/** A shape seen from a body it moves against: swept through the motions between them, one after the other. */
function sweepPrims(g:Capsule,rel:Sweep[]):Prim[]{if(!rel.length)return [g];if(rel.length===1)return [{...g,sweep:rel[0]}];
 // All motions but the last stepped through, the last swept exactly; coarser the more there are.
 let shapes:Capsule[]=[g];const most=rel.length>2?16:120;
 for(const w of rel.slice(0,-1)){const next:Capsule[]=[];for(const h of shapes){const far=Math.max(dist(h.a,w.c)+h.ra,dist(h.b,w.c)+h.rb),k=Math.max(1,Math.min(most,Math.ceil((w.to-w.from)*Math.PI/180*far/1.5)));for(let i=0;i<=k;i++)next.push(turned(h,w.c,w.from+(w.to-w.from)*i/k));}shapes=next;}
 return shapes.map(h=>({...h,sweep:rel.at(-1)!}));}

export function planGear(doc:GearDoc,files:Record<string,ShaftFile|undefined>):GearPlan{
 const issues:Issue[]=[],shafts:ShaftInWorld[]=[],wheels:Wheel[]=[],bearings:Bearing[]=[],obstacles:Obstacle[]=[],motors:Motor[]=[],s=doc.settings,arms:Arm[]=[],groups:GroupPlan[]=[];
 // Swing arms: shafts that move together about a pivot shaft's axis.
 const taken=new Set<string>();
 for(const g of doc.groups??[]){const name=g.name||'Schwinge',pv=doc.shafts.find(x=>x.id===g.pivot);if(!pv){issues.push({level:'fehler',message:`${name}: ihre Drehachse fehlt`,ref:`schwinge:${g.id}`});continue;}
  const mine=g.shafts.filter(id=>doc.shafts.some(x=>x.id===id));if(mine.some(id=>taken.has(id)))issues.push({level:'fehler',message:`${name}: eine ihrer Wellen gehört schon zu einer anderen Schwinge`,ref:`schwinge:${g.id}`});
  groups.push({id:g.id,name,pivot:g.pivot,at:pv.at,from:g.from,to:g.to,fixed:!!g.fixed,parent:'',shafts:mine.filter(id=>!taken.has(id))});for(const id of mine)taken.add(id);}
 const bodyOf=(id:string)=>groups.find(g=>g.shafts.includes(id))?.id??'',moving=(id:string)=>{const g=groups.find(v=>v.id===id);return !!g&&g.to-g.from>1e-9;};
 // A swing arm hangs on the body its pivot shaft belongs to: links in a chain, which must end at the frame.
 for(const g of groups)g.parent=bodyOf(g.pivot)===g.id?'':bodyOf(g.pivot);
 for(const g of groups){const seen=new Set([g.id]);for(let p=g.parent;p;p=groups.find(v=>v.id===p)!.parent){if(seen.has(p)){issues.push({level:'fehler',message:`${g.name}: ihre Drehachse sitzt auf einem Glied, das an ihr selbst hängt`,ref:`schwinge:${g.id}`});g.parent='';break;}seen.add(p);}}
 /** A body and the bodies it hangs on, innermost first (the frame is not in it). */
 const chain=(body:string):GroupPlan[]=>{const out:GroupPlan[]=[];for(let g=groups.find(v=>v.id===body);g;g=groups.find(v=>v.id===g!.parent))out.push(g);return out;};
 /** How a thing of body `from` moves as seen from body `to`: out of its links up to where the two chains meet, then
  * backwards into the other's. Each motion about the pivot as drawn. */
 const relative=(from:string,to:string):Sweep[]=>{if(from===to)return [];const a=chain(from),b=chain(to);while(a.length&&b.length&&a.at(-1)===b.at(-1)){a.pop();b.pop();}
  return [...a.filter(g=>moving(g.id)).map(g=>({c:g.at,from:g.from,to:g.to})),...b.reverse().filter(g=>moving(g.id)).map(g=>({c:g.at,from:-g.to,to:-g.from}))];};
 for(const p of doc.shafts){const f=files[p.shaft];if(!f){issues.push({level:'fehler',message:`Welle ${p.id}: die Datei im Wellen-Generator fehlt`,ref:p.id});continue;}
  const body=bodyOf(p.id),plan=planShaft(f.doc),L=f.doc.length,span=(x0:number,x1:number):[number,number]=>p.flip?[p.z+L-x1,p.z+L-x0]:[p.z+x0,p.z+x1];
  const pieces=plan.sections.map(c=>{const [z0,z1]=span(c.x0,c.x1);return {z0,z1,r:outer(c.profile)/2};});
  shafts.push({id:p.id,label:f.name,at:p.at,z0:p.z,z1:p.z+L,plan,pieces});
  if(plan.issues.some(i=>i.level==='fehler'))issues.push({level:'warnung',message:`${f.name}: die Welle selbst hat noch Fehler (im Wellen-Generator ansehen)`,ref:p.id});
  for(const t of plan.placed){const [z0,z1]=span(t.x0,t.x1),base={key:itemKey({on:p.id,item:t.id}),on:p.id,item:t.id,label:`${t.part.short} auf ${f.name}`,at:p.at,z0,z1};
   if(t.part.group==='Lager'){bearings.push({...base,D:t.part.outer,d:outer(t.bore),B:t.x1-t.x0});continue;}
   if(t.part.teeth){const pulley=!!t.part.pulley,pitch=pulley?t.part.teeth/Math.PI:(t.part.module??1)*t.part.teeth/2;wheels.push({...base,teeth:t.part.teeth,...(t.part.module?{module:t.part.module}:{}),pulley,pitch,outer:t.part.outer/2,lego:t.part.group==='LEGO-Zahnräder',...(t.free?{free:true}:{})});}
   if(t.arm){// Along the shaft x becomes z: an arm at 0° (the shaft's +z) points to −x in the plane; flipped, mirrored.
    const deg=(p.turn??0)+(p.flip?180-t.arm.angle:180+t.arm.angle),end:[number,number]=[p.at[0]+t.arm.length*Math.cos(deg*Math.PI/180),p.at[1]+t.arm.length*Math.sin(deg*Math.PI/180)];
    arms.push({...base,angle:deg,length:t.arm.length,r0:t.arm.hub/2,r1:t.arm.width/2,hole:t.arm.hole});obstacles.push({key:base.key,label:base.label,z0,z1,a:p.at,ra:t.arm.hub/2,b:end,rb:t.arm.width/2,on:[p.id],body,spin:{from:0,to:360}});continue;}
   obstacles.push({key:base.key,label:base.label,z0,z1,a:p.at,ra:t.part.outer/2,on:[p.id],body});}
  for(const sl of plan.sleeves){const [z0,z1]=span(sl.x0,sl.x1);obstacles.push({key:`${p.id}/${sl.id}`,label:`${sl.label} auf ${f.name}`,z0,z1,a:p.at,ra:Math.max(...sl.steps.map(x=>outer(x.outer)))/2,on:[p.id],body});}
  for(const m of plan.machining){const w=m.work;if(w.kind!=='ring'||!m.ring)continue;const [z0,z1]=span(w.x-m.ring.m/2,w.x+m.ring.m/2);obstacles.push({key:`${p.id}/ring-${w.id}`,label:`${m.ring.norm==='471'?'Sicherungsring':'E-Ring'} auf ${f.name}`,z0,z1,a:p.at,ra:m.ring.room/2,on:[p.id],body,clip:m.ring.norm});}
  // A motor's shaft in it: the flange face lies the motor shaft's length from where it went in, the body beyond.
  for(const i of plan.inserts){const part=i.part.id.startsWith('motor-')?partById(i.part.id.slice(6)):undefined;if(!part?.shaft)continue;
   const faceX=i.end==='links'?i.x1-part.shaft.length:i.x0+part.shaft.length,face=p.flip?p.z+L-faceX:p.z+faceX,down=(i.end==='links')!==!!p.flip,reach=Math.max(...part.holes.map(h=>Math.hypot(...h.at)+h.d/2),(part.pilot??0)/2);
   motors.push({key:`motor:${p.id}`,on:p.id,part,label:`${part.label.replace(/ Schrittmotor/,'')} an ${f.name}`,at:p.at,face,down,depth:part.size[2],pad:Math.max(reach,part.size[0]/2)+s.rim,travel:0});
   obstacles.push({key:`motor:${p.id}/k`,label:`${part.label.replace(/ Schrittmotor/,'')} (Körper)`,z0:down?face-part.size[2]:face,z1:down?face:face+part.size[2],a:p.at,ra:part.size[0]/Math.SQRT2,on:[p.id],body,soft:true});}}
 const wheel=(k:string)=>wheels.find(w=>w.key===k);
 // Meshing: two wheels of the same module on different shafts, facing each other, at the sum of their pitch radii.
 const meshes:Mesh[]=[];
 wheels.forEach((a,i)=>{for(const b of wheels.slice(i+1)){if(a.on===b.on||a.pulley||b.pulley)continue;const face=overlap(a.z0,a.z1,b.z0,b.z1);if(face<=.3)continue;const c=dist(a.at,b.at),want=a.pitch+b.pitch;
  if(a.module===b.module&&Math.abs(c-want)<.05){meshes.push({a:a.key,b:b.key,ratio:-a.teeth/b.teeth});if(a.lego!==b.lego)issues.push({level:'hinweis',message:`${a.label} kämmt mit ${b.label}: LEGO und gedrucktes Rad gemischt, Modul 1 bei beiden, Zahnform prüfen`,ref:b.on});continue;}
  if(a.module===b.module&&Math.abs(c-want)<1)issues.push({level:'warnung',message:`${a.label} und ${b.label} kämmen fast: Abstand ${mm(c)}, Eingriff bei ${mm(want)}`,ref:b.on});
  else if(c<a.outer+b.outer-.01)issues.push({level:'fehler',message:`${a.label} und ${b.label} berühren sich, ohne zu kämmen (Abstand ${mm(c)}${a.module===b.module?`, für den Eingriff ${mm(want)}`:', anderes Modul'})`,ref:b.on});}});
 // Across bodies a mesh holds where they only turn against each other about one of the two shafts: there the distance
 // stays. Elsewhere it holds as drawn only.
 const placeOf=(id:string)=>doc.shafts.find(v=>v.id===id)!.at;
 const holds=(x:string,y:string)=>relative(bodyOf(x),bodyOf(y)).every(w=>dist(w.c,placeOf(x))<1e-6||dist(w.c,placeOf(y))<1e-6);
 const swung=(x:string,y:string)=>{const a=chain(bodyOf(x)),b=chain(bodyOf(y));while(a.length&&b.length&&a.at(-1)===b.at(-1)){a.pop();b.pop();}return [...a,...b].filter(g=>moving(g.id));};
 /** The centre distance of two shafts over a swing arm's range: the least, the most, and the angle of the least. */
 const centres=(x:string,y:string,g:GroupPlan)=>{const px=doc.shafts.find(v=>v.id===x)!.at,py=doc.shafts.find(v=>v.id===y)!.at,sx=chain(bodyOf(x)).includes(g),sy=chain(bodyOf(y)).includes(g);let lo=Infinity,hi=-Infinity,at=0;const k=Math.max(1,Math.ceil((g.to-g.from)/.5));
  for(let i=0;i<=k;i++){const deg=g.from+(g.to-g.from)*i/k,c=dist(sx?rot(px,g.at,deg):px,sy?rot(py,g.at,deg):py);if(c<lo){lo=c;at=deg;}hi=Math.max(hi,c);}return {lo,hi,at};};
 for(const m of meshes){const a=wheel(m.a)!,b=wheel(m.b)!;if(holds(a.on,b.on))continue;const gs=swung(a.on,b.on),g=gs[0];
  issues.push({level:'warnung',message:`${a.label} kämmt mit ${b.label} nur in der gezeichneten Stellung: schwenkt ${g.name}, geht der Eingriff auf. Bleiben kann er nur um die Drehachse`,ref:b.on});
  if(gs.length===1){const c=centres(a.on,b.on,g);if(c.lo<a.pitch+b.pitch-.05)issues.push({level:'fehler',message:`${g.name}: bei ${n(c.at)}° läuft ${a.label} in ${b.label} hinein (Achsabstand ${mm(c.lo)}, Eingriff bei ${mm(a.pitch+b.pitch)}): Bereich auf dieser Seite begrenzen`,ref:`schwinge:${g.id}`});}}
 // Belts: two pulleys at the same height on different shafts.
 const belts:BeltPlan[]=[];
 for(const bt of doc.belts){const a=wheel(itemKey(bt.a)),b=wheel(itemKey(bt.b));if(!a?.pulley||!b?.pulley||a.on===b.on){issues.push({level:'fehler',message:'Riemen: braucht zwei Riemenscheiben auf verschiedenen Wellen',ref:bt.id});continue;}
  if(overlap(a.z0,a.z1,b.z0,b.z1)<2)issues.push({level:'fehler',message:`Riemen ${a.label} – ${b.label}: die Scheiben stehen nicht auf gleicher Höhe (${mm(a.z0)} und ${mm(b.z0)})`,ref:bt.id});
  const c=dist(a.at,b.at),length=2*c+Math.PI*(a.pitch+b.pitch)+(a.pitch-b.pitch)**2/Math.max(c,eps),stock=BELTS.find(l=>l>=length-.5);
  belts.push({id:bt.id,a:a.key,b:b.key,center:c,length,...(stock?{stock}:{})});
  obstacles.push({key:`riemen:${bt.id}`,label:`Riemen ${a.teeth}/${b.teeth}`,z0:Math.max(a.z0,b.z0),z1:Math.min(a.z1,b.z1),a:a.at,ra:a.outer,b:b.at,rb:b.outer,on:[a.on,b.on],body:bodyOf(a.on)===bodyOf(b.on)?bodyOf(a.on):'',belt:true});
}
 // Speeds. What turns: every shaft, every wheel running free on its shaft, every swing arm. Each turn is a sum of the
 // drives' turns: a driven shaft turns against the body its motor sits on, a free swing arm against the body it hangs on,
 // a fixed one with its pivot shaft. A mesh or belt couples two rotors as seen from the body that carries both axes (so
 // a wheel on a link rolls on the one on its pivot when the link swings). A loop that disagrees locks.
 const rates:Record<string,number>={},input=doc.input??shafts[0]?.id;
 const edges=[...meshes.flatMap(m=>{const a=wheel(m.a)!,b=wheel(m.b)!;return a.free||b.free?[]:[{a:a.on,b:b.on,k:-a.teeth/b.teeth},{a:b.on,b:a.on,k:-b.teeth/a.teeth}];}),...belts.flatMap(bt=>{const a=wheel(bt.a)!,b=wheel(bt.b)!;return a.free||b.free?[]:[{a:a.on,b:b.on,k:a.teeth/b.teeth},{a:b.on,b:a.on,k:b.teeth/a.teeth}];})];
 const rotor=(w:Wheel)=>w.free?`rad:${w.key}`:w.on,carrier=(a:Wheel,b:Wheel)=>chain(bodyOf(a.on)).length>=chain(bodyOf(b.on)).length?bodyOf(a.on):bodyOf(b.on);
 const couples=[...meshes.map(m=>{const a=wheel(m.a)!,b=wheel(m.b)!;return {a:rotor(a),b:rotor(b),k:-a.teeth/b.teeth,c:carrier(a,b)};}),...belts.map(bt=>{const a=wheel(bt.a)!,b=wheel(bt.b)!;return {a:rotor(a),b:rotor(b),k:a.teeth/b.teeth,c:carrier(a,b)};})];
 // The drives there may be: the input first, then every motor's shaft, then every swing arm that swings freely.
 const cands:{id:string;label:string;group?:string}[]=[];
 if(input&&shafts.some(x=>x.id===input))cands.push({id:input,label:shafts.find(x=>x.id===input)!.label});
 for(const m of motors)if(!cands.some(c=>c.id===m.on))cands.push({id:m.on,label:shafts.find(x=>x.id===m.on)?.label??m.label});
 for(const g of groups)if(!g.fixed&&moving(g.id))cands.push({id:`schwinge:${g.id}`,label:`${g.name} von Hand`,group:g.id});
 const unit=(i:number)=>cands.map((_,k)=>k===i?1:0),plus=(u:number[],v:number[],f=1)=>u.map((x,i)=>x+f*v[i]),alike=(u:number[],v:number[])=>u.every((x,i)=>Math.abs(x-v[i])<=1e-9*Math.max(1,Math.abs(x),Math.abs(v[i])));
 const turns=new Map<string,number[]>([['körper:',cands.map(()=>0)]]),driving=new Set<number>();let locked=false;
 const put=(k:string,v:number[])=>{const had=turns.get(k);if(!had){turns.set(k,v);return true;}if(!alike(had,v))locked=true;return false;};
 const settle=()=>{for(let pass=0,changed=true;changed&&pass<400;pass++){changed=false;
  for(const g of groups){const key=`körper:${g.id}`,par=turns.get(`körper:${g.parent}`),me=turns.get(key);
   if(g.fixed){const sh=turns.get(g.pivot);if(sh&&!me)changed=put(key,sh)||changed;else if(me&&!sh)changed=put(g.pivot,me)||changed;else if(sh&&me&&!alike(sh,me))locked=true;}
   else if(par&&!me){const i=cands.findIndex(x=>x.group===g.id);if(i>=0)driving.add(i);changed=put(key,i>=0?plus(par,unit(i)):par)||changed;}}
  for(const e of couples){const A=turns.get(e.a),Bv=turns.get(e.b),C=turns.get(`körper:${e.c}`);
   if(A&&Bv&&C){if(!alike(Bv,plus(C,plus(A,C,-1).map(x=>x*e.k))))locked=true;}
   else if(A&&C)changed=put(e.b,plus(C,plus(A,C,-1).map(x=>x*e.k)))||changed;
   else if(Bv&&C)changed=put(e.a,plus(C,plus(Bv,C,-1).map(x=>x/e.k)))||changed;
   // Both wheels driven, the link between them free to follow: a differential.
   else if(A&&Bv&&Math.abs(1-e.k)>1e-9)changed=put(`körper:${e.c}`,plus(Bv,A,-e.k).map(x=>x/(1-e.k)))||changed;}}};
 settle();
 // A shaft with a drive that nothing else turns yet is a drive of its own, turning against the body its motor sits on.
 cands.forEach((c,i)=>{if(c.group||turns.has(c.id))return;const body=turns.get(`körper:${bodyOf(c.id)}`)??cands.map(()=>0);driving.add(i);turns.set(c.id,plus(body,unit(i)));settle();});
 if(locked)issues.push({level:'fehler',message:'Das Getriebe klemmt: ein Kreis aus Rädern und Riemen widerspricht sich'});
 for(const x of shafts){const v=turns.get(x.id);if(v&&(Math.abs(v[0])>1e-12||x.id===input))rates[x.id]=v[0];}
 // What the drives do to the joints: every link's turn against the body it hangs on, and how far each drive must turn for the ranges.
 const used=[...driving].sort((a,b)=>a-b),pick=(v?:number[])=>v?used.map(i=>v[i]):undefined,drive:Drive={inputs:used.map(i=>({id:cands[i].id,label:cands[i].label})),shafts:{},wheels:{},joints:{},needs:{},lines:[]};
 for(const x of shafts){const v=pick(turns.get(x.id));if(v)drive.shafts[x.id]=v;}for(const w of wheels)if(w.free){const v=pick(turns.get(rotor(w)));if(v)drive.wheels[w.key]=v;}
 for(const g of groups){const me=turns.get(`körper:${g.id}`),par=turns.get(`körper:${g.parent}`);if(me&&par)drive.joints[g.id]=pick(plus(me,par,-1))!;
  else if(g.fixed&&moving(g.id))issues.push({level:'warnung',message:`${g.name} sitzt fest auf ${shafts.find(x=>x.id===g.pivot)?.label??'ihrer Welle'}, aber nichts treibt diese Welle: ein Motor oder ein Rad an einem Antrieb fehlt`,ref:`schwinge:${g.id}`});}
 {const sum=(v:number[])=>{const t=v.map((x,i)=>({x,i})).filter(q=>Math.abs(q.x)>1e-9);return t.length?t.map((q,k)=>`${k?(q.x<0?'− ':'+ '):(q.x<0?'−':'')}${n(Math.abs(q.x))} × ${drive.inputs[q.i].label}`).join(' '):'steht';};
  if(drive.inputs.length>1||groups.length){for(const w of wheels)if(w.free&&drive.wheels[w.key])drive.lines.push(`${w.label} (Losrad) dreht ${sum(drive.wheels[w.key])}`);
   for(const g of groups){const v=drive.joints[g.id];if(!v)continue;const many=v.filter(x=>Math.abs(x)>1e-9).length>1;drive.lines.push(`${g.name} schwenkt ${sum(v)}${many?' (gekoppelt: die Antriebe wirken zusammen)':''}`);}}
  // How far every drive turns for all joints' ranges: the joints as a square system of the drives that move them.
  const js=groups.filter(g=>g.fixed&&moving(g.id)&&drive.joints[g.id]?.some(x=>Math.abs(x)>1e-9)),ks=drive.inputs.map((_,i)=>i).filter(i=>js.some(g=>Math.abs(drive.joints[g.id][i])>1e-9));
  if(js.length&&js.length===ks.length){const M=js.map(g=>ks.map(i=>drive.joints[g.id][i])),size=js.length,A=M.map((r,i)=>[...r,...js.map((_,k)=>k===i?1:0)]);let ok=true;
   for(let c=0;c<size&&ok;c++){let p=c;for(let r=c+1;r<size;r++)if(Math.abs(A[r][c])>Math.abs(A[p][c]))p=r;if(Math.abs(A[p][c])<1e-9){ok=false;break;}[A[c],A[p]]=[A[p],A[c]];const d=A[c][c];A[c]=A[c].map(x=>x/d);for(let r=0;r<size;r++)if(r!==c){const f=A[r][c];A[r]=A[r].map((x,k)=>x-f*A[c][k]);}}
   if(ok)ks.forEach((i,row)=>{let lo=0,hi=0;js.forEach((g,col)=>{const f=A[row][size+col],a=f*g.from,b=f*g.to;lo+=Math.min(a,b);hi+=Math.max(a,b);});drive.needs[drive.inputs[i].id]=[lo,hi];drive.lines.push(`${drive.inputs[i].label} dreht für alle Bereiche ${n(lo)}° bis ${n(hi)}°`);});}}
 // How far every shaft turns: the range set at one shaft, through the ratios to those it drives without a moving swing
 // arm in between; all others endlessly.
 const turnRate:Record<string,number>={};
 if(doc.turn&&shafts.some(x=>x.id===doc.turn!.on)){turnRate[doc.turn.on]=1;const open=[doc.turn.on];while(open.length){const x=open.pop()!;for(const e of edges){if(e.a!==x||turnRate[e.b]!==undefined||bodyOf(e.a)!==bodyOf(e.b)&&(moving(bodyOf(e.a))||moving(bodyOf(e.b))))continue;turnRate[e.b]=turnRate[x]*e.k;open.push(e.b);}}}
 for(const a of arms){const k=turnRate[a.on],o=obstacles.find(x=>x.key===a.key)!;if(k===undefined||!doc.turn){issues.push({level:'hinweis',message:`${a.label} dreht endlos (voller Kreis). Schwenkt er nur: Drehbereich an einer Welle setzen`,ref:a.on});continue;}
  const lo=Math.min(k*doc.turn.from,k*doc.turn.to),hi=Math.max(k*doc.turn.from,k*doc.turn.to);a.rate=k;if(hi-lo<360-1e-9){a.spin=[lo,hi];o.spin={from:lo,to:hi};}}
 // Every body looks at the others' things as what they sweep against it.
 const views=new Map<string,Prim[]>(),bounded=new Map<Prim[],Reach[]>(),bounds=(v:Prim[])=>{let b=bounded.get(v);if(!b){b=v.map(reachOf);bounded.set(v,b);}return b;};
 const view=(o:Obstacle,body:string):Prim[]=>{const key=`${o.key}@${body}`,had=views.get(key);if(had)return had;const base:Capsule={a:o.a,ra:o.ra,b:o.b??o.a,rb:o.rb??o.ra},rel=relative(o.body,body);let out:Prim[];
  if(!o.spin)out=sweepPrims(base,rel);
  else if(!rel.length)out=[{...base,sweep:{c:o.a,from:o.spin.from,to:o.spin.to}}];
  // An arm on the pivot itself turns further against the swing arm; elsewhere the disc it reaches is swept.
  else if(rel.length===1&&dist(o.a,rel[0].c)<1e-6)out=[{...base,sweep:{c:o.a,from:o.spin.from+rel[0].from,to:o.spin.to+rel[0].to}}];
  else out=sweepPrims({a:o.a,ra:reach(o),b:o.a,rb:reach(o)},rel);
  views.set(key,out);return out;};
 const B:Bodies={groups,bodyOf,relative,chain,turnOf:id=>doc.shafts.find(v=>v.id===id)?.turn??0,
  section:(id,z)=>{const p=doc.shafts.find(v=>v.id===id),x=shafts.find(v=>v.id===id);if(!p||!x)return undefined;const at=p.flip?x.z1-z:z-p.z;return x.plan.sections.find(c=>at>=c.x0-eps&&at<=c.x1+eps)?.profile;},seen:body=>obstacles.filter(o=>!(o.soft&&o.body===body)),od:(o,body,p,within)=>{let best=Infinity;const v=view(o,body),bs=bounds(v);for(let i=0;i<v.length;i++){if(within!==undefined&&gap(bs[i],p,0)>within)continue;best=Math.min(best,primDistance(p,v[i]));}return best;},
  oa:(o,body,g,within)=>{let best=Infinity;const v=view(o,body),bs=bounds(v),gb=within!==undefined?circleOf(g):undefined;for(let i=0;i<v.length;i++){if(gb&&(gap(bs[i],gb.c,gb.r)>within!||primDistance(gb.c,v[i])-gb.r>within!))continue;best=Math.min(best,primsApart(v[i],g));}return best;},
  around:(o,body)=>{const v=view(o,body);if(v.length===1)return bound(v[0]);const c=v[0].sweep!.c;return {c,r:Math.max(...v.map(g=>Math.max(dist(g.a,c)+g.ra,dist(g.b,c)+g.rb)))};},
  name:(o,body)=>o.label+(relative(o.body,body).length?' beim Schwenken':o.spin?' beim Drehen':''),
  arc:(id,body)=>{const at=doc.shafts.find(v=>v.id===id)!.at,rel=relative(bodyOf(id),body).filter(w=>dist(at,w.c)>1e-6);return rel.length>1?'x':rel[0];}};
 // Motors beside each other: their square bodies must not overlap where they share a height.
 motors.forEach((a,i)=>{for(const b of motors.slice(i+1)){const za:[number,number]=a.down?[a.face-a.depth,a.face]:[a.face,a.face+a.depth],zb:[number,number]=b.down?[b.face-b.depth,b.face]:[b.face,b.face+b.depth],w=(a.part.size[0]+b.part.size[0])/2,dx=Math.abs(a.at[0]-b.at[0]),dy=Math.abs(a.at[1]-b.at[1]);
  if(overlap(za[0],za[1],zb[0],zb[1])>eps&&dx<w-eps&&dy<w-eps)issues.push({level:'fehler',message:`${a.label} und ${b.label} überschneiden sich: die Motoren sind ${mm(w)} breit und stehen nur ${mm(Math.max(dx,dy))} auseinander`,ref:b.on});}});
 // Shafts must be held.
 for(const x of shafts){if(motors.some(m=>m.on===x.id))continue;const k=bearings.filter(b=>b.on===x.id).length;if(!k)issues.push({level:'warnung',message:`${x.label}: kein Lager, nichts hält die Welle`,ref:x.id});else if(k===1)issues.push({level:'hinweis',message:`${x.label}: nur ein Lager, die Welle kann kippen`,ref:x.id});}
 // A motor driving a belt: its slots point along the belt (not on a swing arm that tensions the belt by swinging).
 for(const m of motors){const bt=belts.find(b=>wheel(b.a)!.on===m.on||wheel(b.b)!.on===m.on);if(!bt||!holds(wheel(bt.a)!.on,wheel(bt.b)!.on))continue;const other=wheel(wheel(bt.a)!.on===m.on?bt.b:bt.a)!,d=dist(m.at,other.at)||1;m.slot=[(other.at[0]-m.at[0])/d,(other.at[1]-m.at[1])/d];m.travel=s.slot;}
 const layers=planLayers(doc,shafts,bearings,meshes,wheels,B,issues,motors);
 for(const m of motors){const own=layers.find(l=>l.motor===m.key);if(!own)continue;const faces=layers.map((l,i)=>({i,l,z:m.down?l.band[0]:l.band[1]})).filter(f=>!f.l.motor&&f.l.body===bodyOf(m.on)).sort((a,b)=>Math.abs(a.z-m.face)-Math.abs(b.z-m.face))[0];
  if(faces&&Math.abs(faces.z-m.face)<=6){m.offset=+(faces.z-m.face).toFixed(3);issues.push({level:'hinweis',message:`${m.label} hat eine eigene Motorplatte; ${mm(Math.abs(m.offset))} ${m.offset>0?'höher':'tiefer'} läge sein Flansch an ${m.down?'der Unterseite':'der Oberseite'} von Schicht ${faces.i+1} und spart die Platte (Knopf an der Welle)`,ref:m.on});}}
 // Belts against stock lengths: with a motor's slots the centre distance has a range; without, it must fit as it is.
 const lengthAt=(a:Wheel,b:Wheel,c:number)=>2*c+Math.PI*(a.pitch+b.pitch)+(a.pitch-b.pitch)**2/Math.max(c,eps);
 for(const bp of belts){const a=wheel(bp.a)!,b=wheel(bp.b)!,m=motors.find(x=>x.layer&&x.slot&&(x.on===a.on||x.on===b.on)),t=m?m.travel/2:0,sw=!holds(a.on,b.on)&&swung(a.on,b.on).length===1?swung(a.on,b.on)[0]:undefined;let lo=lengthAt(a,b,bp.center-t),hi=lengthAt(a,b,bp.center+t);
  if(sw){const c=centres(a.on,b.on,sw);lo=Math.min(lo,lengthAt(a,b,c.lo));hi=Math.max(hi,lengthAt(a,b,c.hi));bp.swing={group:sw.id,range:[lo,hi]};}
  if(m)bp.tension={motor:m.key,range:[lo,hi]};const stock=BELTS.find(l=>l>=lo-.5);const label=`Riemen ${a.teeth}/${b.teeth}`;
  if(!stock){issues.push({level:'warnung',message:`${label}: ${mm(bp.length)}, länger als die Normlängen im Katalog`,ref:bp.id});continue;}
  bp.stock=stock;bp.fit={stock,center:centerFor(stock,a.pitch,b.pitch)};
  if(stock<=hi+.5)issues.push({level:'hinweis',message:m?`${label}: Normriemen ${stock} mm passt, gespannt über die Langlöcher des Motors (Achsabstand ${mm(bp.fit.center)})`:sw?`${label}: Normriemen ${stock} mm passt, gespannt durch Schwenken von ${sw.name} (Achsabstand ${mm(bp.fit.center)})`:`${label}: ${mm(bp.length)}, Normriemen ${stock} mm passt genau`,ref:bp.id});
  else issues.push({level:'warnung',message:m?`${label}: Normriemen ${stock} mm braucht ${mm(bp.fit.center)} Achsabstand, die Langlöcher reichen von ${mm(bp.center-t)} bis ${mm(bp.center+t)}: auf Normriemen stellen`:sw?`${label}: Normriemen ${stock} mm braucht ${mm(bp.fit.center)} Achsabstand, das erreicht ${sw.name} in ihrem Bereich nicht`:`${label}: ${mm(bp.length)} lang, Normriemen ${stock} mm und nichts zum Spannen: Achsabstand auf ${mm(bp.fit.center)} stellen oder einen Motor mit Langlöchern daran`,ref:bp.id});}
 // Bolts per body: the frame's through its plates, each swing arm's through its own.
 const bolts:Bolt[]=[],columns:Columns[]=[],sets:{body:string;count:number;screw?:{length:number;what:string}}[]=[];let screw:{length:number;what:string}|undefined;
 for(const body of ['',...groups.map(g=>g.id)]){const foreign=layers.filter(l=>l.body!==body).flatMap(l=>layerShapes(l,bearings,[]).flatMap(g=>sweepPrims(g,relative(l.body,body))).map(prim=>({prim,z:l.band,label:`die Platte von Schicht ${layers.indexOf(l)+1}`})));
  // The columns of the bodies planned before stand in the way too, over their stacks' heights.
  for(const bo of bolts){const of=layers.filter(l=>l.body===bo.body),z:[number,number]=[Math.min(...of.map(l=>l.band[0])),Math.max(...of.map(l=>l.band[1]))];for(const prim of sweepPrims({a:bo.at,ra:bo.eye,b:bo.at,rb:bo.eye},relative(bo.body,body)))foreign.push({prim,z,label:`die Säule bei ${n(bo.at[0])} / ${n(bo.at[1])} mm`});}
  const r=planBolts(doc,layers.filter(l=>l.body===body),layers,bearings,shafts,B,issues,body,body?doc.groups!.find(g=>g.id===body)!.bolts:doc.bolts,bolts.length,foreign);bolts.push(...r.bolts);columns.push(...r.columns);sets.push({body,count:r.bolts.length,...(r.screw?{screw:r.screw}:{})});if(!body)screw=r.screw;}
 // The webs to the bolts' eyes come after the layers: a hole they cut into gets its ring of material too.
 layers.forEach((l,i)=>{for(const h of l.holes){if(h.ring)continue;const x=shafts.find(v=>v.id===h.on)!,hp=(r:number):Prim=>({a:x.at,ra:r,b:x.at,rb:r,...(h.arc?{sweep:h.arc}:{})}),touched=bolts.some(bo=>{const k=bo.attach[l.id];if(!k)return false;const b=bearings.find(v=>v.key===k)!;return primsApart(hp(h.r),{a:b.at,ra:b.D/2+l.rim,b:bo.at,rb:bo.eye})<0;});if(!touched)continue;h.ring=h.r+l.rim;
  for(const o of B.seen(l.body))if(overlap(o.z0,o.z1,l.band[0],l.band[1])>eps&&!o.on.includes(h.on)&&B.oa(o,l.body,hp(h.ring))<s.clearance-eps)issues.push({level:'fehler',message:`Schicht ${i+1}: der Ring um das Freiloch für ${x.label} trifft ${B.name(o,l.body)}`,ref:x.id});}});
 // Assembly: the lowest plate takes the shafts from above, every other plate goes on over them from above. A hole whose
 // shaft carries something on that side larger than the hole is opened to the plate's nearest edge.
 const lowestIn=(body:string)=>layers.filter(l=>!l.motor&&l.body===body).reduce<LayerPlan|undefined>((a,l)=>!a||l.band[0]<a.band[0]?l:a,undefined);
 layers.forEach((l,i)=>{const shapes=layerShapes(l,bearings,bolts);
  for(const h of l.holes){if(h.arc)continue;const x=shafts.find(v=>v.id===h.on)!,below=l===lowestIn(l.body),side=(z0:number,z1:number)=>below?z1<=l.band[0]+eps:z0>=l.band[1]-eps;
   const parts=[...obstacles.filter(o=>!o.belt&&!o.soft&&!o.clip&&o.on.includes(x.id)).map(o=>({label:o.label,r:o.ra,z0:o.z0,z1:o.z1})),...bearings.filter(b=>b.on===x.id&&!b.motor).map(b=>({label:b.label,r:b.D/2,z0:b.z0,z1:b.z1}))].filter(q=>side(q.z0,q.z1)&&q.r>h.r-1e-6);
   if(!parts.length||!(h.ring||shapes.some(g=>hullDistance(x.at,g.a,g.ra,g.b,g.rb)<h.r)))continue;
   const all=[...shapes,...l.holes.filter(o=>o.ring).map(o=>{const c=shafts.find(v=>v.id===o.on)!.at;return {a:c,ra:o.ring!,b:c,rb:o.ring!};})],rings=l.bearings.map(k=>bearings.find(b=>b.key===k)!);
   // Shortest way out, and of those the one that cuts least of the plate beyond the hole's own ring (along its two edges).
   let best:{dir:[number,number];length:number;score:number}|undefined;const ringR=h.ring??h.r,inside=(q:[number,number])=>all.some(g=>!(g.a===g.b&&g.a[0]===x.at[0]&&g.a[1]===x.at[1])&&hullDistance(q,g.a,g.ra,g.b,g.rb)<0);
   for(let a=0;a<360;a+=10){const dir:[number,number]=[Math.cos(a*Math.PI/180),Math.sin(a*Math.PI/180)];let t=h.r,ok=true;
    for(;t<400;t+=.5){const q:[number,number]=[x.at[0]+dir[0]*t,x.at[1]+dir[1]*t];if(rings.some(b=>dist(q,b.at)<b.D/2+l.rim-1e-6)){ok=false;break;}if(all.every(g=>hullDistance(q,g.a,g.ra,g.b,g.rb)>0))break;}
    if(!ok||t>=400)continue;let cut=0;for(let u=0;u<=t+2;u+=.5)for(const side of [1,-1]){const q:[number,number]=[x.at[0]+dir[0]*u-dir[1]*h.r*side,x.at[1]+dir[1]*u+dir[0]*h.r*side];if(dist(q,x.at)>ringR&&inside(q))cut++;}
    const score=t+cut*.5;if(!best||score<best.score-1e-9)best={dir:[+dir[0].toFixed(6),+dir[1].toFixed(6)],length:t+1,score};}
   if(best){h.open={dir:best.dir,length:best.length};issues.push({level:'hinweis',message:`Schicht ${i+1}: das Freiloch für ${x.label} ist zum Rand hin offen, weil ${parts.map(q=>q.label).join(', ')} beim Aufsetzen nicht durchpasst`,ref:x.id});}
   else issues.push({level:'warnung',message:`Schicht ${i+1}: ${parts.map(q=>q.label).join(', ')} passt nicht durch das Freiloch für ${x.label}, und es lässt sich nicht zum Rand öffnen, ohne einen Lager-Ring zu schneiden`,ref:x.id});}});
 // ---- What moves must get past everything it moves against, in every height they share. ----
 const said=new Set<string>(),hit=(i:Issue)=>{if(!said.has(i.message)){said.add(i.message);issues.push(i);}};
 const meshed=new Set(meshes.flatMap(m=>[`${m.a}|${m.b}`,`${m.b}|${m.a}`]));
 const things:Obstacle[]=[...obstacles,...bearings.filter(b=>!b.motor&&!b.hub).map(b=>({key:`lager:${b.key}`,label:b.label,z0:b.z0,z1:b.z1,a:b.at,ra:b.D/2,on:[b.on],body:bodyOf(b.on)})),
  ...shafts.flatMap(x=>x.pieces.map((q,k)=>({key:`stueck:${x.id}/${k}`,label:x.label,z0:q.z0,z1:q.z1,a:x.at,ra:q.r,on:[x.id],body:bodyOf(x.id)})))];
 const own=(o:Obstacle):Prim=>({a:o.a,ra:o.ra,b:o.b??o.a,rb:o.rb??o.ra,...(o.spin?{sweep:{c:o.a,from:o.spin.from,to:o.spin.to}}:{})});
 things.forEach((x,i)=>{for(const y of things.slice(i+1)){if(x.on.some(id=>y.on.includes(id))||overlap(x.z0,x.z1,y.z0,y.z1)<=eps||meshed.has(`${x.key}|${y.key}`))continue;
  // Only what moves against each other: an arm, or two bodies (but not a round thing on the very axis they turn about).
  const rel=relative(y.body,x.body);if(!x.spin&&!y.spin&&(!rel.length||rel.length===1&&((!x.b&&dist(x.a,rel[0].c)<1e-6)||(!y.b&&dist(y.a,rel[0].c)<1e-6))))continue;
  let d:number;const ax=arms.find(a=>a.key===x.key),ay=arms.find(a=>a.key===y.key);
  if(!rel.length&&ax?.spin&&ay?.spin&&doc.turn){// Two arms that turn together: stepped through the range, each where it then is.
   const k=Math.max(1,Math.min(2000,Math.ceil((doc.turn.to-doc.turn.from)*Math.max(Math.abs(ax.rate!),Math.abs(ay.rate!))/2)));d=Infinity;
   for(let j=0;j<=k;j++){const t=doc.turn.from+(doc.turn.to-doc.turn.from)*j/k;d=Math.min(d,primsApart(turned({a:x.a,ra:x.ra,b:x.b!,rb:x.rb!},x.a,ax.rate!*t),turned({a:y.a,ra:y.ra,b:y.b!,rb:y.rb!},y.a,ay.rate!*t)));}}
  else d=Math.min(...view(y,x.body).map(v=>primsApart(own(x),v)));
  if(d>=s.clearance-eps)continue;const mover=x.spin||!y.spin&&x.body?x:y,other=mover===x?y:x;
  hit({level:'fehler',message:`${mover.label} stößt ${mover.spin?'beim Drehen':'beim Schwenken'} an ${other.label}${d>0?` (nur ${mm(d)} Abstand)`:''}`,ref:mover.on[0]});}});
 // Plates of different bodies in the same heights.
 layers.forEach((x,i)=>{for(const [k,y] of layers.entries()){if(k<=i||x.body===y.body||overlap(x.band[0],x.band[1],y.band[0],y.band[1])<=eps)continue;const rel=relative(y.body,x.body),mine=layerShapes(x,bearings,bolts),theirs=layerShapes(y,bearings,bolts).flatMap(g=>sweepPrims(g,rel));
  if(mine.some(g=>theirs.some(v=>primsApart(g,v)<s.clearance-eps)))hit({level:'fehler',message:`Schicht ${i+1} und Schicht ${k+1} liegen in derselben Höhe und stoßen ${rel.length?'beim Schwenken ':''}zusammen: Höhen trennen oder den Bereich begrenzen`,ref:`schwinge:${x.body||y.body}`});}});
 // Columns against the plates of the other bodies, with the webs to their bolts.
 bolts.forEach((bo,i)=>{const of=layers.filter(l=>l.body===bo.body),z0=Math.min(...of.map(l=>l.band[0])),z1=Math.max(...of.map(l=>l.band[1]));
  for(const [k,l] of layers.entries()){if(l.body===bo.body||overlap(l.band[0],l.band[1],z0,z1)<=eps)continue;const rel=relative(l.body,bo.body);
   if(layerShapes(l,bearings,bolts).some(g=>sweepPrims(g,rel).some(v=>primDistance(bo.at,v)<bo.eye+s.clearance-eps)))hit({level:'fehler',message:`Bolzen bei ${n(bo.at[0])} / ${n(bo.at[1])} mm stößt ${rel.length?'beim Schwenken ':''}an die Platte von Schicht ${k+1}`,ref:`bolzen:${i}`});}});
 // Swing arms: they hang on their pivot, and the pivot in the frame.
 for(const g of groups){const ref=`schwinge:${g.id}`,pivot=shafts.find(x=>x.id===g.pivot)?.label??'Drehachse',mine=layers.filter(l=>l.body===g.id),on=(l:LayerPlan)=>l.bearings.some(k=>{const b=bearings.find(v=>v.key===k);return !!b&&!b.motor&&b.on===g.pivot;});
  if(!g.shafts.length)issues.push({level:'hinweis',message:`${g.name}: noch keine Welle darauf`,ref});
  else if(!mine.length)issues.push({level:'warnung',message:`${g.name}: keine Platte, denn keine ihrer Wellen hat ein Lager`,ref});
  else if(!mine.some(on))issues.push({level:'warnung',message:`${g.name} hängt nicht an ihrer Drehachse: auf ${pivot} fehlt ein Lager in der Höhe ihrer Platten`,ref});
  if(g.shafts.length&&!layers.some(l=>l.body!==g.id&&on(l))&&!(bodyOf(g.pivot)!==g.id&&motors.some(m=>m.on===g.pivot)))issues.push({level:'warnung',message:`${g.name}: ihre Drehachse ${pivot} ist im Gestell nicht gelagert`,ref});}
 const bom:BomLine[]=[];const add=(what:string,count=1,note?:string)=>{const b=bom.find(x=>x.what===what);if(b)b.count+=count;else bom.push({what,count,...(note?{note}:{})});};
 layers.forEach((l,i)=>{if(l.body){const of=groups.find(g=>g.id===l.body)!.name;if(l.pair){add(`Platte Schicht ${i+1} unten, ${of} (gedruckt)`,1,`${n(l.split-l.band[0])} mm dick`);add(`Platte Schicht ${i+1} oben, ${of} (gedruckt)`,1,`${n(l.band[1]-l.split)} mm dick`);}else add(`Platte Schicht ${i+1}, ${of} (gedruckt)`,1,`${n(l.band[1]-l.band[0])} mm dick`);return;}
  if(l.pair){add(`Platte Schicht ${i+1} unten (gedruckt)`,1,`${n(l.split-l.band[0])} mm dick`);add(`Platte Schicht ${i+1} oben (gedruckt)`,1,`${n(l.band[1]-l.split)} mm dick`);}else add(`Platte Schicht ${i+1} (gedruckt)`,1,`${n(l.band[1]-l.band[0])} mm dick${l.lips[0]?', Anschlag unten':l.lips[1]?', Anschlag oben':', ohne Anschlag'}`);});
 for(const c of columns)add(`Distanzsäule ${n(c.z1-c.z0)} mm (gedruckt)`,bolts.filter(b=>b.body===c.body).length,`zwischen ${c.from} und ${c.to}`);
 for(const st of sets)if(st.screw&&st.count){add(st.screw.what,st.count);add(`Mutter M${n(s.bolt)} DIN 934`,st.count);add(`Scheibe M${n(s.bolt)} DIN 125`,2*st.count);}
 for(const bp of belts)add(`Zahnriemen GT2 6 mm, ${bp.stock?`${bp.stock} mm geschlossen`:`${n(bp.length)} mm`}`);
 for(const x of shafts)add(`${x.label} (Wellen-Generator, Teile dort in der Stückliste)`);
 for(const m of motors)add(m.part.label,1,m.layer?'mit 4 Schrauben M3 am Flansch':'noch an keiner Platte');
 return {drive,arms,groups,turnRate,motors,shafts,wheels,bearings,obstacles,meshes,belts,rates,layers,bolts,columns,...(screw?{screw}:{}),bom,issues};
}

/** Layers: proposed from the bearings' heights (bearings whose spans touch share one), or the ones set by hand. Then
 * per layer the webs (meshing shafts always joined, then the shortest webs that hold all together, then the user's
 * changes), holes for shafts passing through, and what the plates hit. */
function planLayers(doc:GearDoc,shafts:ShaftInWorld[],bearings:Bearing[],meshes:Mesh[],wheels:Wheel[],B:Bodies,issues:Issue[],motors:Motor[]):LayerPlan[]{
 const s=doc.settings,mid=(b:Bearing)=>(b.z0+b.z1)/2;let given:Layer[]|undefined=doc.layers;
 type Spec={z0:number;z1:number;list:Bearing[];body:string;given?:Layer;motor?:Motor};
 const specs:Spec[]=[],claimed=new Set<Bearing>();
 /** May a bearing lie in a plate of this body: on one of its shafts, or on its pivot (the swing arm hangs on it there). */
 const fits=(b:Bearing,body:string)=>{const own=B.bodyOf(b.on),g=B.groups.find(v=>v.id===body),mine=B.groups.find(v=>v.id===own);return own===body||!!g&&!g.fixed&&g.pivot===b.on||!!mine&&mine.pivot===b.on&&mine.parent===body;};
 // A swing arm without bearings of its own that carries a motor: the motor's plate, with the pivot's bearing in it.
 const motorSpecs:Spec[]=[];
 for(const g of B.groups){if(bearings.some(b=>B.bodyOf(b.on)===g.id&&b.on!==g.pivot)||given?.some(l=>l.group===g.id))continue;
  for(const m of motors){if(B.bodyOf(m.on)!==g.id)continue;const t=s.motorPlate,lo=m.down?m.face:m.face-t,hi=lo+t,list=bearings.filter(b=>!g.fixed&&b.on===g.pivot&&!claimed.has(b)&&overlap(b.z0,b.z1,lo,hi)>eps&&(m.down?b.z0>=m.face-eps:b.z1<=m.face+eps));
   for(const b of list)claimed.add(b);motorSpecs.push({z0:Math.min(lo,...list.map(b=>b.z0)),z1:Math.max(hi,...list.map(b=>b.z1)),list,body:g.id,motor:m});}}
 if(given?.length){const lists:Bearing[][]=given.map(()=>[]),bodyFor=(l:Layer)=>l.group&&B.groups.some(g=>g.id===l.group)?l.group:'';
  // A swing arm's layers take their bearings first: what is left on its pivot holds it in the frame.
  for(const i of [...given.keys()].sort((x,y)=>Number(!!bodyFor(given![y]))-Number(!!bodyFor(given![x])))){const l=given[i];lists[i]=bearings.filter(b=>!claimed.has(b)&&fits(b,bodyFor(l))&&mid(b)>=l.z0-eps&&mid(b)<=l.z1+eps);for(const b of lists[i])claimed.add(b);}
  given.forEach((l,i)=>specs.push({z0:l.z0,z1:l.z1,list:lists[i],body:bodyFor(l),given:l}));
  for(const b of bearings)if(!claimed.has(b))issues.push({level:'warnung',message:`${b.label} liegt in keiner Schicht und wird nicht gehalten`,ref:b.on});}
 else{given=undefined;const cluster=(from:Bearing[],body:string)=>{const out:Spec[]=[];for(const b of [...from].sort((a,c)=>mid(a)-mid(c))){const g=out.at(-1);if(g&&b.z0<=g.z1+.5){g.z1=Math.max(g.z1,b.z1);g.z0=Math.min(g.z0,b.z0);g.list.push(b);}else out.push({z0:b.z0,z1:b.z1,list:[b],body});}return out;};
  const swing:Spec[]=[],order=new Map(B.groups.map((g,k)=>[g.id,k]));
  for(const g of [...B.groups].sort((x,y)=>B.chain(y.id).length-B.chain(x.id).length)){const own=bearings.filter(b=>B.bodyOf(b.on)===g.id&&b.on!==g.pivot&&!claimed.has(b)),cs=cluster(own,g.id);for(const b of own)claimed.add(b);
   // A link that swings freely hangs on the pivot's bearings in its heights; a fixed one gets a hub there.
   if(!g.fixed)for(const c of cs)for(const b of bearings)if(b.on===g.pivot&&!claimed.has(b)&&b.z0<=c.z1+.5&&b.z1>=c.z0-.5){c.list.push(b);c.z0=Math.min(c.z0,b.z0);c.z1=Math.max(c.z1,b.z1);claimed.add(b);}
   swing.push(...cs);}
  // Links are clustered innermost first (each takes its bearings before the one it hangs on), but listed as set up.
  specs.push(...cluster(bearings.filter(b=>!claimed.has(b)),''),...swing.sort((x,y)=>order.get(x.body)!-order.get(y.body)!));}
 specs.push(...motorSpecs);
 const meshPairs=new Set(meshes.map(m=>{const a=wheels.find(w=>w.key===m.a)!,b=wheels.find(w=>w.key===m.b)!;return [a.on,b.on].sort().join('|');}));
 const remove=new Set((doc.webs?.remove??[]).map(k=>k.join('|'))),add=(doc.webs?.add??[]);
 // The outermost layers of a body: their outer side gets the stops.
 const plain=(body:string)=>specs.filter(x=>x.body===body&&!x.motor),lowestOf=(body:string)=>plain(body).reduce<Spec|undefined>((a,x)=>!a||x.z0<a.z0?x:a,undefined),highestOf=(body:string)=>plain(body).reduce<Spec|undefined>((a,x)=>!a||x.z1>a.z1?x:a,undefined);
 const make=(g:Spec,i:number):LayerPlan=>{const body=g.body,seen=B.seen(body),l=g.given,id=g.motor?`m${i+1}`:l?.id??`s${i+1}`,rim=l?.rim??s.rim,thickness=l?.thickness??s.web,list:Bearing[]=[...g.list],z0=g.motor?g.z0:Math.min(g.z0,...list.map(b=>b.z0)),z1=g.motor?g.z1:Math.max(g.z1,...list.map(b=>b.z1));
  // A body with a single layer has no second outer plate to hold its shafts the other way: it clamps, as a plate pair.
  const clampAll=s.clamp||plain(body).length===1;
  const pair=!g.motor&&clampAll,lips:[boolean,boolean]=g.motor?[false,false]:pair?[true,true]:[g===lowestOf(body),g===highestOf(body)&&plain(body).length>1],band:[number,number]=g.motor?[z0,z1]:[z0-(lips[0]?s.lip:0),z1+(lips[1]?s.lip:0)],split=(z0+z1)/2,name=`Schicht ${i+1}`,ring=(b:Bearing)=>b.D/2+rim;
  if(pair)for(const b of list)if(Math.abs(mid(b)-split)>.5)issues.push({level:'hinweis',message:`${b.label}: Mitte ${mm(mid(b)-split)} neben der Trennfuge von ${name}, die Taschen werden ungleich tief`,ref:b.on});
  for(const [a,b] of list.flatMap((a,k)=>list.slice(k+1).map(b=>[a,b] as const)))if(a.on===b.on)issues.push({level:'warnung',message:`${a.label} und ${b.label} liegen auf derselben Welle in ${name}`,ref:a.on});
  // Motors screwed to this layer: the flange on the plate's outer face, the body outside.
  for(const m of motors)if(!m.layer&&B.bodyOf(m.on)===body&&Math.abs((m.down?band[0]:band[1])-m.face)<.5){m.layer=id;const node:Bearing={key:m.key,on:m.on,item:'motor',label:m.label,at:m.at,z0:m.face,z1:m.face,D:2*(m.pad-rim),d:0,B:0,motor:m};list.push(node);bearings.push(node);}
  // A link fixed on its pivot shaft: a hub with the shaft's profile there instead of a bearing; the plate turns with the shaft.
  const link=B.groups.find(v=>v.id===body);
  if(link?.fixed&&!list.some(b=>b.on===link.pivot)){const x=shafts.find(v=>v.id===link.pivot),profile=x&&B.section(link.pivot,(band[0]+band[1])/2);
   if(!x||!profile||overlap(x.z0,x.z1,band[0],band[1])<band[1]-band[0]-eps)issues.push({level:'warnung',message:`${name}: ${x?.label??'die Drehachse'} reicht nicht durch die Platte von ${link.name}; die Welle dort länger machen oder die Schicht verschieben`,ref:`schwinge:${link.id}`});
   else{const node:Bearing={key:`nabe:${id}`,on:link.pivot,item:'nabe',label:`Nabe von ${link.name} auf ${x.label}`,at:x.at,z0:band[0],z1:band[1],D:outer(profile)+2*HUB_WALL,d:outer(profile),B:band[1]-band[0],hub:{profile,turn:B.turnOf(link.pivot)}};list.push(node);bearings.push(node);
    if(profile.kind==='rund')issues.push({level:'hinweis',message:`${name}: ${link.name} sitzt auf rundem ${profileLabel(profile)} von ${x.label}; eine Madenschraube M3 in der Nabe klemmt sie (Kernloch im Teil). Sicherer: dort im Wellen-Editor einen Abschnitt von Hand als D, Kreuz oder Sechskant setzen`,ref:`schwinge:${link.id}`});}}
  // Webs: meshing shafts first (their distance must hold), then the shortest that join everything (Kruskal).
  const parent=new Map(list.map(b=>[b.key,b.key])),find=(k:string):string=>{const p=parent.get(k)!;if(p===k)return k;const r=find(p);parent.set(k,r);return r;},join=(a:string,b:string)=>{const x=find(a),y=find(b);if(x===y)return false;parent.set(x,y);return true;};
  const pairs=list.flatMap((a,k)=>list.slice(k+1).map(b=>({a,b,c:dist(a.at,b.at),forced:meshPairs.has([a.on,b.on].sort().join('|'))}))).sort((x,y)=>Number(y.forced)-Number(x.forced)||x.c-y.c);
  const webs:WebPlan[]=[];for(const p of pairs){if(p.forced||join(p.a.key,p.b.key)){if(p.forced)join(p.a.key,p.b.key);const [a,b]=webKey(p.a.key,p.b.key);if(!remove.has(`${a}|${b}`))webs.push({a,b,auto:true,forced:p.forced,hits:[]});}}
  for(const [a,b] of add){if(!list.some(x=>x.key===a)||!list.some(x=>x.key===b)){if(list.some(x=>x.key===a)||list.some(x=>x.key===b))issues.push({level:'warnung',message:`Steg ${a} – ${b}: beide Lager müssen in ${name} liegen`});continue;}if(!webs.some(w=>w.a===a&&w.b===b))webs.push({a,b,auto:false,forced:false,hits:[]});}
  for(const k of remove){const [a,b]=k.split('|');if(meshPairs.has([list.find(x=>x.key===a)?.on,list.find(x=>x.key===b)?.on].sort().join('|'))&&list.some(x=>x.key===a))issues.push({level:'hinweis',message:`Steg zwischen kämmenden Wellen in ${name} entfernt: der Achsabstand hängt dann an anderen Stegen`});}
  // How many pieces the plate falls into.
  const comp=new Map(list.map(b=>[b.key,b.key])),f2=(k:string):string=>{const p=comp.get(k)!;if(p===k)return k;const r=f2(p);comp.set(k,r);return r;};for(const w of webs){const x=f2(w.a),y=f2(w.b);if(x!==y)comp.set(x,y);}
  const parts=new Set(list.map(b=>f2(b.key))).size;if(parts>1)issues.push({level:'warnung',message:`${name} zerfällt in ${parts} Teile: Stege fehlen`});
  // Shafts passing through without a bearing here: a hole.
  // A shaft two swing arms away has no single arc: it may share the plate's height only where it never comes near the plate.
  const twice=new Set<string>();
  let holes:Hole[]=shafts.filter(x=>!list.some(b=>b.on===x.id)&&overlap(x.z0,x.z1,band[0],band[1])>0).map(x=>{const arc=B.arc(x.id,body);if(arc==='x')twice.add(x.id);return {on:x.id,r:Math.max(...x.pieces.filter(p=>overlap(p.z0,p.z1,band[0],band[1])>0).map(p=>p.r),...seen.filter(o=>o.clip&&o.on[0]===x.id&&overlap(o.z0,o.z1,band[0],band[1])>eps).map(o=>o.ra),0)+s.hole,...(arc&&arc!=='x'?{arc}:{})};});
  // What the plate hits: rings and webs against wheels, pulleys, sleeves and belts in the band's heights.
  const at=(k:string)=>list.find(b=>b.key===k)!,openings:Record<string,number>={};
  for(const o of seen){if(overlap(o.z0,o.z1,band[0],band[1])<=eps)continue;
   for(const b of list){if(o.clip&&o.on.includes(b.on)){const below=(o.z0+o.z1)/2<(b.z0+b.z1)/2,lip=below?lips[0]:lips[1],need=o.ra+s.clearance;
     if(b.hub){issues.push({level:'fehler',message:`${name}: ${o.label} liegt in der Nabe der Platte um ${b.label}; den Ring aus der Höhe der Platte setzen`,ref:b.on});continue;}
     if(b.motor||!lip||need<=b.D/2-s.lipIn+eps)continue;openings[b.key]=Math.max(openings[b.key]??0,need);
     // The lip must still lie on the outer ring (about a quarter of the ring's height wide), not on the turning inner ring.
     if(need>b.D/2-(b.D-b.d)/8-eps)issues.push({level:'warnung',message:`${name}: ${o.label} braucht Ø${n(2*need)} im Bord über ${b.label}; so weit offen hält der Bord den Außenring nicht mehr. Distanzscheibe zwischen Lager und Ring, oder den Bord der Schicht weglassen`,ref:b.on});
     else if(o.clip==='6799')issues.push({level:'hinweis',message:`${name}: ${o.label} liegt im Bord über ${b.label}; von der Seite ist er dort nicht zu stecken, er muss vor der Platte auf die Welle`,ref:b.on});
     continue;}
    if(o.clip&&!o.on.includes(b.on)){const c=B.od(o,body,b.at);if(c<ring(b)+s.clearance-eps)issues.push({level:'fehler',message:`${name}: der Ring um ${b.label} trifft ${B.name(o,body)}`,ref:b.on});continue;}
    if(o.on.includes(b.on)&&!o.belt){if(o.spin){issues.push({level:'fehler',message:`${name}: ${o.label} dreht in der Höhe der Platte um ${b.label}; über oder unter die Schicht setzen`,ref:b.on});continue;}if(o.ra+s.clearance>(b.hub?b.d/2:b.motor?(b.motor.part.pilot??0)/2:(o.z0+o.z1)/2<(b.z0+b.z1)/2?(lips[0]?b.D/2-s.lipIn:b.D/2):(lips[1]?b.D/2-s.lipIn:b.D/2))+eps&&!(b.motor&&(b.motor.down?o.z0>=band[1]-eps:o.z1<=band[0]+eps)))issues.push({level:'fehler',message:`${name}: ${o.label} sitzt zu nah am Lager ${b.label}, die Platte reicht ${mm(s.lip)} über das Lager (Bord); Abstand oder Distanzhülse nötig`,ref:b.on});continue;}const c=B.od(o,body,b.at);if(c<ring(b)+s.clearance-eps)issues.push({level:'fehler',message:`${name}: der Ring um ${b.label} trifft ${B.name(o,body)}`,ref:b.on});}}
  // Webs against what is in the band's heights: straight, or as the user chose round or under/over it.
  const inBand=seen.filter(o=>overlap(o.z0,o.z1,band[0],band[1])>eps),route=doc.webs?.route??{};
  for(const w of webs){const a=at(w.a),b=at(w.b),mine=(o:Obstacle)=>o.on.includes(a.on)||o.on.includes(b.on),hits=(segs:{a:[number,number];ra:number;b:[number,number];rb:number}[],z?:[number,number])=>inBand.filter(o=>!mine(o)&&(!z||overlap(o.z0,o.z1,z[0],z[1])>eps)&&segs.some(g=>B.oa(o,body,g)<s.clearance-eps));
   const straight={a:a.at,ra:ring(a),b:b.at,rb:ring(b)},first=hits([straight]),r=route[`${w.a}|${w.b}`];w.hits=first.map(o=>o.label);if(r)w.route=r;
   if(!first.length||!r){for(const o of first)issues.push({level:'fehler',message:`${name}: der Steg ${a.label} – ${b.label} geht durch ${B.name(o,body)}. Steg anklicken: außen herum, in die Tiefe oder weglassen`,ref:`steg:${w.a}|${w.b}`});continue;}
   if(r==='tiefe'){// Below what is above the band's middle, above what is below it.
    const mid=(band[0]+band[1])/2,top=Math.min(band[1],...first.filter(o=>(o.z0+o.z1)/2>=mid).map(o=>o.z0-s.clearance)),bottom=Math.max(band[0],...first.filter(o=>(o.z0+o.z1)/2<mid).map(o=>o.z1+s.clearance)),z:[number,number]=[bottom,top];
    if(top-bottom<2){issues.push({level:'fehler',message:`${name}: in die Tiefe geht der Steg ${a.label} – ${b.label} nicht, es blieben nur ${mm(Math.max(0,top-bottom))}. Außen herum oder weglassen`,ref:`steg:${w.a}|${w.b}`});continue;}
    w.z=z;w.hits=hits([straight],z).map(o=>o.label);for(const h of w.hits)issues.push({level:'fehler',message:`${name}: der Steg ${a.label} – ${b.label} trifft auch in der Tiefe ${h}`,ref:`steg:${w.a}|${w.b}`});
    issues.push({level:'hinweis',message:`${name}: Steg ${a.label} – ${b.label} in der Tiefe nur ${mm(top-bottom)} dick statt ${mm(band[1]-band[0])} (${mm(z[0])} bis ${mm(z[1])})`,ref:`steg:${w.a}|${w.b}`});continue;}
   // Round it: one point beside each part in the way, on the side that makes the shorter way, narrower than the rings.
   const width=Math.max(2,thickness/2+1),len=(p:[number,number][])=>p.reduce((t,q,k)=>k?t+dist(p[k-1],q):t,0);let best:[number,number][]|undefined;
   for(const extra of [0,4,8,14])for(const side of [1,-1]){const pts:[number,number][]=[a.at];
    for(const q of first.map(o=>B.around(o,body)).sort((x,y)=>dist(a.at,x.c)-dist(a.at,y.c))){const ab:[number,number]=[b.at[0]-a.at[0],b.at[1]-a.at[1]],L=Math.hypot(...ab)||1,t=((q.c[0]-a.at[0])*ab[0]+(q.c[1]-a.at[1])*ab[1])/L/L,foot:[number,number]=[a.at[0]+ab[0]*t,a.at[1]+ab[1]*t];
     let u:[number,number]=[foot[0]-q.c[0],foot[1]-q.c[1]];const ul=Math.hypot(...u);u=ul>1e-6?[u[0]/ul,u[1]/ul]:[-ab[1]/L,ab[0]/L];const R=q.r+s.clearance+width+extra;pts.push([+(q.c[0]+side*u[0]*R).toFixed(3),+(q.c[1]+side*u[1]*R).toFixed(3)]);}
    pts.push(b.at);// Bars of one width from centre to centre; the rings are in the plate anyway.
    const segs=pts.slice(1).map((q,k)=>({a:pts[k],ra:width,b:q,rb:width}));
    if(!hits(segs).length&&(!best||len(pts)<len(best)))best=pts;}
   if(!best){issues.push({level:'fehler',message:`${name}: außen herum findet der Steg ${a.label} – ${b.label} keinen freien Weg. In die Tiefe oder weglassen`,ref:`steg:${w.a}|${w.b}`});continue;}
   w.path=best.slice(1,-1);w.width=width;w.hits=[];}
  // A hole that cuts into the plate gets a ring of the layer's rim round it before it is cut out: the plate stays one
  // piece round a shaft that passes through a web or along its edge.
  const shapes=[...list.map(b=>({a:b.at,ra:ring(b),b:b.at,rb:ring(b)})),...webs.filter(w=>!w.z).flatMap(w=>{const a=at(w.a),b=at(w.b);if(!w.path)return [{a:a.at,ra:ring(a),b:b.at,rb:ring(b)}];const pts=[a.at,...w.path,b.at];return pts.slice(1).map((q,k)=>({a:pts[k],ra:w.width!,b:q,rb:w.width!}));})];
  holes=holes.filter(h=>{if(!twice.has(h.on))return true;const x=shafts.find(v=>v.id===h.on)!,way=sweepPrims({a:x.at,ra:h.r,b:x.at,rb:h.r},B.relative(B.bodyOf(x.id),body));
   if(way.some(q=>shapes.some(g=>primsApart(q,g)<s.clearance-eps)))issues.push({level:'fehler',message:`${name}: ${x.label} gehört zu einer anderen Schwinge und geht durch diese Platte; zwei Schwingen in derselben Höhe gehen nicht`,ref:x.id});else return false;return true;});
  for(const h of holes){const x=shafts.find(v=>v.id===h.on)!,hp=(r:number):Prim=>({a:x.at,ra:r,b:x.at,rb:r,...(h.arc?{sweep:h.arc}:{})});
   // A shaft that swings through the plate must not swing through one of its bearings.
   if(h.arc)for(const b of list)if(primDistance(b.at,hp(h.r))<(b.motor?b.motor.pad:b.D/2)+s.clearance-eps)issues.push({level:'fehler',message:`${name}: ${x.label} schwenkt durch ${b.label}`,ref:x.id});
   if(!shapes.some(g=>primsApart(hp(h.r),g)<0))continue;h.ring=h.r+rim;
   for(const o of inBand)if(!o.on.includes(h.on)&&B.oa(o,body,hp(h.ring))<s.clearance-eps)issues.push({level:'fehler',message:`${name}: der Ring um das Freiloch für ${x.label} trifft ${B.name(o,body)}`,ref:x.id});}
  return {...(g.motor?{motor:g.motor.key}:{}),body,id,z0,z1,band,split,pair,lips,auto:!l,rim,thickness,bearings:list.map(b=>b.key),webs,holes,parts,...(Object.keys(openings).length?{openings}:{})};};
 const out=specs.map(make);
 // A motor whose flange lies on no plate gets its own: as thick as set, on the side away from its body.
 for(const m of motors){if(m.layer)continue;const t=s.motorPlate,band:[number,number]=m.down?[m.face,m.face+t]:[m.face-t,m.face];
  for(const [k,o] of out.entries())if(o.body===B.bodyOf(m.on)&&overlap(o.band[0],o.band[1],band[0],band[1])>eps)issues.push({level:'fehler',message:`${m.label}: seine Motorplatte (${mm(band[0])} bis ${mm(band[1])}) überschneidet Schicht ${k+1}`,ref:m.on});
  out.push(make({z0:band[0],z1:band[1],list:[],body:B.bodyOf(m.on),motor:m},out.length));}
 return out;
}

const screws=[10,12,16,20,25,30,35,40,45,50,55,60,65,70,80,90,100];
/** Bolts through all plates, held apart by printed columns. Places: round every bearing just outside its ring, kept
 * clear of wheels, belts, sleeves, rings and holes over the whole height of the stack; of those the ones spread widest
 * (three, four with more than two bearings in a layer, or as set). Each layer joins a bolt's eye to its nearest bearing
 * with a web. The screw: through the whole stack with a washer at each end and a nut. */
function planBolts(doc:GearDoc,layers:LayerPlan[],all:LayerPlan[],bearings:Bearing[],shafts:ShaftInWorld[],B:Bodies,issues:Issue[],body:string,given:[number,number][]|undefined,base:number,foreign:{prim:Prim;z:[number,number];label:string}[]):{bolts:Bolt[];columns:Columns[];screw?:{length:number;what:string}}{
 const s=doc.settings,eye=s.bolt/2+2.5,hole=s.bolt/2+.2;if(!layers.length||layers.length===1&&!layers[0].pair)return {bolts:[],columns:[]};
 const z0=Math.min(...layers.map(l=>l.band[0])),z1=Math.max(...layers.map(l=>l.band[1])),inLayers=bearings.filter(b=>layers.some(l=>l.bearings.includes(b.key)));
 const seen=B.seen(body),name=body?` (${B.groups.find(g=>g.id===body)!.name})`:'';
 /** A shaft's distance from a point: where it stands, or the arc it takes against this body. */
 const shaftDist=(x:ShaftInWorld,p:[number,number])=>{const arc=B.arc(x.id,body);return arc&&arc!=='x'?(overlap(x.z0,x.z1,z0,z1)>eps?primDistance(p,{a:x.at,ra:0,b:x.at,rb:0,sweep:arc}):Infinity):dist(p,x.at);};
 // Each thing's reach as a circle first: most are far from a web, and their exact distance (swept, stepped) is slow.
 const far=foreign.map(f=>reachOf(f.prim));
 const clear=(p:[number,number])=>seen.every(o=>{if(overlap(o.z0,o.z1,z0,z1)<=eps)return true;return B.od(o,body,p,eye+s.clearance)>=eye+s.clearance;})
  &&inLayers.every(b=>dist(p,b.at)>=b.D/2+eye+1)&&shafts.every(x=>shaftDist(x,p)>=Math.max(0,...x.pieces.map(q=>q.r))+s.hole+eye)&&foreign.every((f,i)=>overlap(f.z[0],f.z[1],z0,z1)<=eps||gap(far[i],p,0)>=eye+s.clearance||primDistance(p,f.prim)>=eye+s.clearance);
 /** What the web from a bearing's ring to the eye at p hits in a layer's heights. */
 const webHits=(p:[number,number],b:Bearing,l:LayerPlan)=>{const ra=b.D/2+l.rim,near=(q:{c:[number,number];r:number})=>hullDistance(q.c,b.at,ra,p,eye)-q.r<s.clearance,web=circleOf({a:b.at,ra,b:p,rb:eye});
  return [...seen.filter(o=>overlap(o.z0,o.z1,l.band[0],l.band[1])>eps&&!o.on.includes(b.on)&&B.oa(o,body,{a:b.at,ra,b:p,rb:eye},s.clearance)<s.clearance-eps),...foreign.filter((f,i)=>overlap(f.z[0],f.z[1],l.band[0],l.band[1])>eps&&near(far[i].all)&&gap(far[i],web.c,web.r)<s.clearance&&primDistance(web.c,f.prim)-web.r<s.clearance&&primsApart(f.prim,{a:b.at,ra,b:p,rb:eye})<s.clearance-eps)];};
 /** The bearing of a layer the eye joins: the nearest with a clear web, else the nearest. */
 const attachTo=(p:[number,number],l:LayerPlan)=>{const near=l.bearings.map(k=>bearings.find(b=>b.key===k)!).sort((a,b)=>dist(a.at,p)-dist(b.at,p));const free=near.find(b=>!webHits(p,b,l).length);return {b:free??near[0],clear:!!free};};
 let places:[number,number][];const auto=!given;
 if(given)places=given;
 else{const rim=(b:Bearing)=>layers.find(l=>l.bearings.includes(b.key))?.rim??s.rim,cands:[number,number][]=[],extra=new Map<[number,number],number>();
  // Right outside a ring first; further out (5 mm steps) where a wheel takes the ring's surroundings, each mm out costs.
  for(const b of inLayers)for(let out=0;out<=40;out+=5)for(let a=0;a<360;a+=10){const r=b.D/2+rim(b)+eye+out,p:[number,number]=[+(b.at[0]+r*Math.cos(a*Math.PI/180)).toFixed(3),+(b.at[1]+r*Math.sin(a*Math.PI/180)).toFixed(3)];if(inLayers.every(o=>o===b||dist(p,o.at)>=dist(p,b.at)-1e-9||dist(p,o.at)>=o.D/2+rim(o)+eye)&&clear(p)&&layers.every(l=>!l.bearings.length||attachTo(p,l).clear)){cands.push(p);extra.set(p,out);}}
  const cost=(p:[number,number])=>extra.get(p)??0;
  const want=s.bolts||(layers.some(l=>l.bearings.length>2)?4:3),c:[number,number]=[inLayers.reduce((a,b)=>a+b.at[0],0)/Math.max(1,inLayers.length),inLayers.reduce((a,b)=>a+b.at[1],0)/Math.max(1,inLayers.length)];places=[];
  const spread=(p:[number,number])=>Math.min(...places.map(q=>dist(p,q)))-cost(p);
  if(cands.length){places.push(cands.reduce((a,b)=>dist(b,c)-cost(b)>dist(a,c)-cost(a)?b:a));while(places.length<want){const next=cands.filter(p=>!places.includes(p)).reduce<[number,number]|undefined>((a,b)=>!a||spread(b)>spread(a)?b:a,undefined);if(!next||Math.min(...places.map(q=>dist(next,q)))<2*eye)break;places.push(next);}}
  if(places.length<Math.min(want,3))issues.push({level:'warnung',message:`Nur ${places.length} Platz für Bolzen gefunden${name}: zu eng um die Lager. Rand größer oder Bolzen von Hand setzen`});}
 const bolts=places.map((at,index):Bolt=>{const attach:Record<string,string>={};for(const l of layers){const a=attachTo(at,l);if(a.b)attach[l.id]=a.b.key;}
  const hit=!auto&&!clear(at);if(hit)issues.push({level:'fehler',message:`Bolzen bei ${n(at[0])} / ${n(at[1])} mm trifft ein Rad, ein Lager oder eine Welle`,ref:`bolzen:${base+index}`});return {body,at,eye,hole,auto,attach,...(hit?{hit}:{})};});
 // Its eye's web in each layer must not cross wheels either (only bolts set by hand can still).
 for(const bo of bolts)for(const l of layers){const k=bo.attach[l.id];if(!k)continue;for(const o of webHits(bo.at,bearings.find(x=>x.key===k)!,l))issues.push({level:'warnung',message:`Der Steg zum Bolzen bei ${n(bo.at[0])} / ${n(bo.at[1])} mm in Schicht ${all.indexOf(l)+1} streift ${o.label}`});}
 const sorted=[...layers].sort((a,b)=>a.band[0]-b.band[0]),columns:Columns[]=[];
 for(let i=1;i<sorted.length;i++){const a=sorted[i-1],b=sorted[i],gap=b.band[0]-a.band[1];if(gap<-eps)issues.push({level:'fehler',message:`Schicht ${all.indexOf(a)+1} und ${all.indexOf(b)+1} überlappen um ${n(-gap)} mm`});else if(gap>.3)columns.push({from:`Schicht ${all.indexOf(a)+1}`,to:`Schicht ${all.indexOf(b)+1}`,z0:a.band[1],z1:b.band[0],body});}
 const need=z1-z0+2*.5+.8*s.bolt,length=screws.find(l=>l>=need);
 return {bolts,columns,screw:length?{length,what:`Zylinderschraube DIN 912 M${n(s.bolt)} × ${length}`}:{length:Math.ceil(need+.8*s.bolt),what:`Gewindestange M${n(s.bolt)}, ${Math.ceil(need+.8*s.bolt)} mm, mit zwei Muttern`}};}

/** The centre distance at which a belt of length `L` fits two pulleys of pitch radii r1, r2. */
export function centerFor(L:number,r1:number,r2:number){const k=L-Math.PI*(r1+r2),d=k*k-8*(r1-r2)**2;return d<0?NaN:(k+Math.sqrt(d))/4;}

/** What a layer's plate is made of, as hulls of discs: rings, webs (straight or the bars round a part; not the lowered
 * ones), and the webs to the bolts' eyes. */
function layerShapes(l:LayerPlan,bearings:Bearing[],bolts:Bolt[]){const at=(k:string)=>bearings.find(b=>b.key===k)!,ring=(b:Bearing)=>b.D/2+l.rim;
 return [...l.bearings.map(k=>{const b=at(k);return {a:b.at,ra:ring(b),b:b.at,rb:ring(b)};}),
  ...l.webs.filter(w=>!w.z).flatMap(w=>{const a=at(w.a),b=at(w.b);if(!w.path)return [{a:a.at,ra:ring(a),b:b.at,rb:ring(b)}];const pts=[a.at,...w.path,b.at];return pts.slice(1).map((q,k)=>({a:pts[k],ra:w.width!,b:q,rb:w.width!}));}),
  ...bolts.flatMap(bo=>{const k=bo.attach[l.id];if(!k)return [];const b=at(k);return [{a:b.at,ra:ring(b),b:bo.at,rb:bo.eye}];})];}
