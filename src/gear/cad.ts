// The gearbox as solids. Per layer a plate pair: one outline in 2D (rings round the bearings, webs as the quadrilateral
// between their outer tangents, bolt eyes joined to their nearest bearing), minus what goes through (the lip's opening
// over every bearing, holes for shafts passing, bolt holes), extruded from the band's bottom to the split and from the
// split to its top; each plate then gets the pocket for its half of every bearing. Columns between layers, and the
// linked shafts with all their parts, turned upright and put where they stand. 2D booleans and one extrusion per
// plate keep OpenCascade's 3D booleans (which leak a little) to the pockets.
import {draw,drawCircle,makeCylinder,makeBox} from 'replicad';
import type {Drawing,Shape3D} from 'replicad';
import {buildParts} from '../shaft/cad.ts';
import type {CadPart} from '../shaft/cad.ts';
import type {GearDoc} from './model.ts';
import type {GearPlan,LayerPlan,ShaftFile} from './plan.ts';
import {tangents} from './draw.ts';

type Keep=<T extends {delete():void}>(v:T)=>T;
type P=[number,number];
import {slug} from './notes.ts';
// A circle's seam turned off the axes: on a grid, the seam point of one circle can lie exactly on another outline,
// and OpenCascade's 2D booleans fail on that coincidence. The shape is the same.
const disc=(c:P,r:number)=>drawCircle(r).rotate(37.3).translate(c[0],c[1]);
/** Two discs and the quadrilateral between their outer tangents: their hull. */
function hull(a:P,ra:number,b:P,rb:number):Drawing{const d0=Math.hypot(b[0]-a[0],b[1]-a[1]);
 // One disc inside the other (also touching it from inside, which OpenCascade cannot fuse): the hull is the larger one.
 if(d0<=Math.abs(ra-rb)+1e-6)return ra>=rb?disc(a,ra):disc(b,rb);
 const t=tangents(a,ra,b,rb);let d=disc(a,ra).fuse(disc(b,rb));if(t)d=d.fuse(draw(t[0]).lineTo(t[1]).lineTo(t[2]).lineTo(t[3]).close());return d;}
/** A web's shape: the hull of both rings, or bars of one width through the points round a part. */
function webShape(plan:GearPlan,l:LayerPlan,w:LayerPlan['webs'][number]):Drawing{const bearing=(k:string)=>plan.bearings.find(x=>x.key===k)!,ring=(k:string)=>bearing(k).D/2+l.rim;
 if(!w.path)return hull(bearing(w.a).at,ring(w.a),bearing(w.b).at,ring(w.b));const pts:P[]=[bearing(w.a).at,...w.path,bearing(w.b).at];let d=hull(pts[0],w.width!,pts[1],w.width!);for(let i=2;i<pts.length;i++)d=d.fuse(hull(pts[i-1],w.width!,pts[i],w.width!));return d;}
/** What goes through a layer's plates: the lip's opening over each bearing, holes for shafts passing, bolt holes. */
function throughHoles(doc:GearDoc,plan:GearPlan,l:LayerPlan):Drawing|undefined{const s=doc.settings;let holes:Drawing|undefined;const hole=(c:P,r:number)=>{const h=disc(c,r);holes=holes?holes.fuse(h):h;};
 // A motor: its pilot and screw holes, as slots along its belt so it can be moved to tension it.
 const slot=(c:P,r:number,m:{slot?:[number,number];travel:number})=>{if(!m.slot||!m.travel){hole(c,r);return;}const t=m.travel/2,a:P=[c[0]-m.slot[0]*t,c[1]-m.slot[1]*t],e:P=[c[0]+m.slot[0]*t,c[1]+m.slot[1]*t],h=hull(a,r,e,r);holes=holes?holes.fuse(h):h;};
 for(const k of l.bearings){const b=plan.bearings.find(x=>x.key===k)!;if(b.motor){const m=b.motor;slot(b.at,(m.part.pilot??0)/2+s.hole,m);for(const h of m.part.holes)slot([b.at[0]+h.at[0],b.at[1]+h.at[1]],h.d/2+.2,m);continue;}hole(b.at,b.D/2-s.lipIn);}
 for(const h of l.holes){const c=plan.shafts.find(x=>x.id===h.on)!.at;hole(c,h.r);if(h.open){const [dx,dy]=h.open.dir,nx=-dy*h.r,ny=dx*h.r,e:P=[c[0]+dx*h.open.length,c[1]+dy*h.open.length],slot=draw([c[0]+nx,c[1]+ny]).lineTo([e[0]+nx,e[1]+ny]).lineTo([e[0]-nx,e[1]-ny]).lineTo([c[0]-nx,c[1]-ny]).close();holes=holes?holes.fuse(slot):slot;}}
 for(const bo of plan.bolts)if(bo.attach[l.id])hole(bo.at,bo.hole);
 return holes;}
/** The outline of a layer's plates, with everything that goes through cut out. Webs lowered or raised under/over a
 * part are not in it: they are their own lower pieces (`steppedWebs`). */
export function plateOutline(doc:GearDoc,plan:GearPlan,l:LayerPlan):Drawing|undefined{
 const bearing=(k:string)=>plan.bearings.find(b=>b.key===k)!,ring=(k:string)=>bearing(k).D/2+l.rim;if(!l.bearings.length)return undefined;
 let d:Drawing=disc(bearing(l.bearings[0]).at,ring(l.bearings[0]));
 for(const k of l.bearings.slice(1))d=d.fuse(disc(bearing(k).at,ring(k)));
 for(const w of l.webs)if(!w.z)d=d.fuse(webShape(plan,l,w));
 for(const bo of plan.bolts){const k=bo.attach[l.id];if(k)d=d.fuse(hull(bearing(k).at,ring(k),bo.at,bo.eye));}
 // Material round a hole that cuts into the plate, before the hole goes out.
 for(const h of l.holes)if(h.ring)d=d.fuse(disc(plan.shafts.find(x=>x.id===h.on)!.at,h.ring));
 const holes=throughHoles(doc,plan,l);return holes?d.cut(holes):d;}
/** Webs only as high as there is room under or over a part: their outline and heights. */
export function steppedWebs(doc:GearDoc,plan:GearPlan,l:LayerPlan){const holes=throughHoles(doc,plan,l);return l.webs.filter(w=>w.z).map(w=>{const d=webShape(plan,l,w);return {shape:holes?d.cut(holes.clone()):d,z:w.z!};});}
function plates(keep:Keep,doc:GearDoc,plan:GearPlan,l:LayerPlan,index:number):CadPart[]{
 const out=plateOutline(doc,plan,l);if(!out)return [];const s=doc.settings,[z0,z1]=l.band,bearings=l.bearings.map(k=>plan.bearings.find(b=>b.key===k)!).filter(b=>!b.motor),steps=steppedWebs(doc,plan,l);
 const half=(lo:number,hi:number,lower:boolean)=>{let solid=keep(out.clone().sketchOnPlane('XY',lo).extrude(hi-lo) as Shape3D);
  for(const st of steps){const a=Math.max(lo,st.z[0]),e=Math.min(hi,st.z[1]);if(e-a>1e-6)solid=keep(solid.fuse(keep(st.shape.clone().sketchOnPlane('XY',a).extrude(e-a) as Shape3D)) as Shape3D);}
  for(const b of bearings){const a=lower?Math.max(lo,b.z0):l.split,e=lower?l.split:Math.min(hi,b.z1);if(e-a<=1e-6)continue;solid=keep(solid.cut(keep(makeCylinder(b.D/2+s.fit,e-a+(lower?.01:0)+(lower?0:.01),[b.at[0],b.at[1],lower?a:a-.01],[0,0,1]))) as Shape3D);}
  return solid;};
 if(l.pair)return [{name:`Schicht ${index+1} unten`,file:`schicht-${index+1}-unten`,kind:'platte',shape:half(z0,l.split,true),color:'#7a93a6',made:true},
  {name:`Schicht ${index+1} oben`,file:`schicht-${index+1}-oben`,kind:'platte',shape:half(l.split,z1,false),color:'#8aa3b6',made:true}];
 // One plate: each pocket open towards the inside, a stop (the lip's opening) only where the layer has one.
 let one=keep(out.clone().sketchOnPlane('XY',z0).extrude(z1-z0) as Shape3D);
 for(const st of steps){const a=Math.max(z0,st.z[0]),e=Math.min(z1,st.z[1]);if(e-a>1e-6)one=keep(one.fuse(keep(st.shape.clone().sketchOnPlane('XY',a).extrude(e-a) as Shape3D)) as Shape3D);}
 for(const be of bearings){const a=l.lips[0]?be.z0:z0-.01,e=l.lips[1]?be.z1:z1+.01;one=keep(one.cut(keep(makeCylinder(be.D/2+s.fit,e-a,[be.at[0],be.at[1],a],[0,0,1]))) as Shape3D);}
 return [{name:`Schicht ${index+1}`,file:`schicht-${index+1}`,kind:'platte',shape:one,color:'#7a93a6',made:true}];}
/** A linked shaft's parts, turned upright (x of the shaft generator becomes z) and put where it stands. */
function shaftParts(keep:Keep,plan:GearPlan,doc:GearDoc,files:Record<string,ShaftFile|undefined>):CadPart[]{
 const out:CadPart[]=[];
 for(const x of plan.shafts){const placed=doc.shafts.find(p=>p.id===x.id)!,f=files[placed.shaft];if(!f)continue;const L=f.doc.length;
  for(const part of buildParts(f.doc,x.plan,keep).parts){let shape=keep(part.shape.rotate(-90,[0,0,0],[0,1,0]) as Shape3D);
   if(placed.flip)shape=keep(keep(shape.rotate(180,[0,0,0],[1,0,0]) as Shape3D).translate([0,0,L]) as Shape3D);
   shape=keep(shape.translate([placed.at[0],placed.at[1],placed.z]) as Shape3D);
   out.push({...part,shape,name:`${part.name} · ${x.label}`,file:`${slug(x.label)}-${part.file}`});}}
 return out;}
/** Everything of a gearbox. `keep` registers what must be freed. */
export function buildGearParts(doc:GearDoc,plan:GearPlan,files:Record<string,ShaftFile|undefined>,keep:Keep):CadPart[]{
 const parts:CadPart[]=[];plan.layers.forEach((l,i)=>parts.push(...plates(keep,doc,plan,l,i)));
 plan.columns.forEach((c,i)=>{for(const bo of plan.bolts){const tube=drawCircle(bo.eye-.5).cut(drawCircle(bo.hole)).translate(bo.at[0],bo.at[1]);parts.push({name:`Distanzsäule ${c.from} – ${c.to}`,file:`saeule-${i+1}`,kind:'saeule',shape:keep(tube.sketchOnPlane('XY',c.z0).extrude(c.z1-c.z0) as Shape3D),color:'#c58a4a',made:true});}});
 // The motors' bodies come with their shafts' parts.
 parts.push(...shaftParts(keep,plan,doc,files));
 return parts;}
