// The gearbox as solids. Per layer a plate pair: one outline in 2D (rings round the bearings, webs as the quadrilateral
// between their outer tangents, bolt eyes joined to their nearest bearing), minus what goes through (the lip's opening
// over every bearing, holes for shafts passing, bolt holes), extruded from the band's bottom to the split and from the
// split to its top; each plate then gets the pocket for its half of every bearing. Columns between layers, and the
// linked shafts with all their parts, turned upright and put where they stand. 2D booleans and one extrusion per
// plate keep OpenCascade's 3D booleans (which leak a little) to the pockets.
import {draw,drawCircle,makeCylinder,makeBox} from 'replicad';
import type {Drawing,Shape3D} from 'replicad';
import {buildParts,profileDrawing,matMul,matMove,matTurn} from '../shaft/cad.ts';
import type {Mat} from '../shaft/cad.ts';
import type {CadPart} from '../shaft/cad.ts';
import type {GearDoc} from './model.ts';
import type {GearPlan,LayerPlan,ShaftFile} from './plan.ts';
import {tangents} from './draw.ts';
import {rot,carried,links} from './sweep.ts';
import type {Sweep,Pose} from './sweep.ts';

export type {Pose} from './sweep.ts';

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
 // The quadrilateral first: two discs that just touch (a bolt's eye right outside a ring) meet inside it then, and their
 // near-tangent crossing, which the 2D booleans cannot stand, is no edge any more.
 const t=tangents(a,ra,b,rb);if(!t)return disc(a,ra).fuse(disc(b,rb));return disc(a,ra).fuse(draw(t[0]).lineTo(t[1]).lineTo(t[2]).lineTo(t[3]).close()).fuse(disc(b,rb));}
/** A disc swept along an arc about `w.c`: a slot along the arc with round ends, as one outline of four arcs. Right at the
 * centre (or all the way round) it is a disc or a ring. */
function band(at:P,r:number,w:Sweep):Drawing{const d=Math.hypot(at[0]-w.c[0],at[1]-w.c[1]),width=w.to-w.from;
 if(d<1e-6||width<1e-6)return disc(rot(at,w.c,w.from),r);
 if(width>=359.9)return d>r+.05?drawCircle(d+r).rotate(37.3).cut(drawCircle(d-r).rotate(11.3)).translate(w.c[0],w.c[1]):disc(w.c,d+r);
 if(d<=r+.05){// No inner edge: discs along the arc, joined.
  const k=Math.max(1,Math.ceil(width/20));let out:Drawing|undefined;for(let i=0;i<k;i++){const h=hull(rot(at,w.c,w.from+width*i/k),r,rot(at,w.c,w.from+width*(i+1)/k),r);out=out?out.fuse(h):h;}return out!;}
 const on=(rad:number,deg:number):P=>{const u:P=[(at[0]-w.c[0])/d,(at[1]-w.c[1])/d],q=rot([w.c[0]+u[0]*rad,w.c[1]+u[1]*rad],w.c,deg);return q;},mid=(w.from+w.to)/2,s=rot(at,w.c,w.from),e=rot(at,w.c,w.to),cap=(c:P,deg:number,sign:number):P=>{const t=(deg+90*sign)*Math.PI/180+Math.atan2(at[1]-w.c[1],at[0]-w.c[0]);return [c[0]+r*Math.cos(t),c[1]+r*Math.sin(t)];};
 return draw(on(d+r,w.from)).threePointsArcTo(on(d+r,w.to),on(d+r,mid)).threePointsArcTo(on(d-r,w.to),cap(e,w.to,1)).threePointsArcTo(on(d-r,w.from),on(d-r,mid)).threePointsArcTo(on(d+r,w.from),cap(s,w.from,-1)).close();}
/** A web's shape: the hull of both rings, or bars of one width through the points round a part. */
function webShape(plan:GearPlan,l:LayerPlan,w:LayerPlan['webs'][number]):Drawing{const bearing=(k:string)=>plan.bearings.find(x=>x.key===k)!,ring=(k:string)=>bearing(k).D/2+l.rim;
 if(!w.path)return hull(bearing(w.a).at,ring(w.a),bearing(w.b).at,ring(w.b));const pts:P[]=[bearing(w.a).at,...w.path,bearing(w.b).at];let d=hull(pts[0],w.width!,pts[1],w.width!);for(let i=2;i<pts.length;i++)d=d.fuse(hull(pts[i-1],w.width!,pts[i],w.width!));return d;}
/** What goes through a layer's plates: the lip's opening over each bearing, holes for shafts passing, bolt holes. */
function throughHoles(doc:GearDoc,plan:GearPlan,l:LayerPlan):Drawing|undefined{const s=doc.settings;let holes:Drawing|undefined;const hole=(c:P,r:number)=>{const h=disc(c,r);holes=holes?holes.fuse(h):h;};
 // A motor: its pilot and screw holes, as slots along its belt so it can be moved to tension it.
 const slot=(c:P,r:number,m:{slot?:[number,number];travel:number})=>{if(!m.slot||!m.travel){hole(c,r);return;}const t=m.travel/2,a:P=[c[0]-m.slot[0]*t,c[1]-m.slot[1]*t],e:P=[c[0]+m.slot[0]*t,c[1]+m.slot[1]*t],h=hull(a,r,e,r);holes=holes?holes.fuse(h):h;};
 for(const k of l.bearings){const b=plan.bearings.find(x=>x.key===k)!;
  // A hub: the shaft's profile through the plate, turned as the shaft stands (along the shaft x becomes z: a quarter turn).
  if(b.hub){const d=profileDrawing(b.hub.profile,s.fit).rotate(b.hub.profile.kind==='rund'?37.3:90+b.hub.turn).translate(b.at[0],b.at[1]);holes=holes?holes.fuse(d):d;continue;}
  if(b.motor){const m=b.motor;slot(b.at,(m.part.pilot??0)/2+s.hole,m);for(const h of m.part.holes)slot([b.at[0]+h.at[0],b.at[1]+h.at[1]],h.d/2+.2,m);continue;}hole(b.at,b.D/2-s.lipIn);}
 for(const h of l.holes){const c=plan.shafts.find(x=>x.id===h.on)!.at;if(h.arc){const b=band(c,h.r,h.arc);holes=holes?holes.fuse(b):b;continue;}hole(c,h.r);if(h.open){const [dx,dy]=h.open.dir,nx=-dy*h.r,ny=dx*h.r,e:P=[c[0]+dx*h.open.length,c[1]+dy*h.open.length],slot=draw([c[0]+nx,c[1]+ny]).lineTo([e[0]+nx,e[1]+ny]).lineTo([e[0]-nx,e[1]-ny]).lineTo([c[0]-nx,c[1]-ny]).close();holes=holes?holes.fuse(slot):slot;}}
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
 for(const h of l.holes)if(h.ring){const c=plan.shafts.find(x=>x.id===h.on)!.at;d=d.fuse(h.arc?band(c,h.ring,h.arc):disc(c,h.ring));}
 const holes=throughHoles(doc,plan,l);return holes?d.cut(holes):d;}
/** Webs only as high as there is room under or over a part: their outline and heights. */
export function steppedWebs(doc:GearDoc,plan:GearPlan,l:LayerPlan){const holes=throughHoles(doc,plan,l);return l.webs.filter(w=>w.z).map(w=>{const d=webShape(plan,l,w);return {shape:holes?d.cut(holes.clone()):d,z:w.z!};});}
function plates(keep:Keep,doc:GearDoc,plan:GearPlan,l:LayerPlan,index:number):CadPart[]{
 const out=plateOutline(doc,plan,l);if(!out)return [];const s=doc.settings,[z0,z1]=l.band,bearings=l.bearings.map(k=>plan.bearings.find(b=>b.key===k)!).filter(b=>!b.motor&&!b.hub),steps=steppedWebs(doc,plan,l);
 // A hub on a round shaft: the tap drill for a set screw M3 from outside, on the side away from the plate's other bearings.
 const screws=(solid:Shape3D,lo:number,hi:number)=>{const z=(z0+z1)/2;if(z<lo+1.3||z>hi-1.3)return solid;
  for(const k of l.bearings){const b=plan.bearings.find(x=>x.key===k)!;if(!b.hub||b.hub.profile.kind!=='rund')continue;const others=l.bearings.map(q=>plan.bearings.find(x=>x.key===q)!).filter(q=>q!==b),c:P=others.length?[others.reduce((t,q)=>t+q.at[0],0)/others.length,others.reduce((t,q)=>t+q.at[1],0)/others.length]:[b.at[0]-1,b.at[1]],d=Math.hypot(b.at[0]-c[0],b.at[1]-c[1])||1;
   solid=keep(solid.cut(keep(makeCylinder(1.25,b.D/2+l.rim+1,[b.at[0],b.at[1],z],[(b.at[0]-c[0])/d,(b.at[1]-c[1])/d,0]))) as Shape3D);}return solid;};
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
 one=screws(one,z0,z1);
 return [{name:`Schicht ${index+1}`,file:`schicht-${index+1}`,kind:'platte',shape:one,color:'#7a93a6',made:true}];}
/** A linked shaft's parts, turned upright (x of the shaft generator becomes z) and put where it stands. */
function shaftParts(keep:Keep,plan:GearPlan,doc:GearDoc,files:Record<string,ShaftFile|undefined>,pose?:Pose):CadPart[]{
 const out:CadPart[]=[];
 for(const x of plan.shafts){const placed=doc.shafts.find(p=>p.id===x.id)!,f=files[placed.shaft];if(!f)continue;const L=f.doc.length;
  for(const part of buildParts(f.doc,x.plan,keep).parts){let shape=keep(part.shape.rotate(-90,[0,0,0],[0,1,0]) as Shape3D),m:Mat=matTurn(-90,[0,0,0],[0,1,0]);
   if(placed.flip){shape=keep(keep(shape.rotate(180,[0,0,0],[1,0,0]) as Shape3D).translate([0,0,L]) as Shape3D);m=matMul(matMove([0,0,L]),matMul(matTurn(180,[0,0,0],[1,0,0]),m));}
   // Turned about its own axis: as placed, plus how far the pose turns it; then with its swing arm about the pivot.
   const chain=links(plan.groups,plan.groups.find(v=>v.shafts.includes(x.id))?.id??'',pose?.groups??{}),fast=plan.groups.find(v=>v.fixed&&v.pivot===x.id&&!v.shafts.includes(x.id)),spin=(placed.turn??0)+(pose?(plan.turnRate[x.id]??0)*pose.turn:0)+chain.reduce((t,v)=>t+v.angle,0)+(fast?pose?.groups[fast.id]??0:0);
   if(Math.abs(spin)>1e-9){shape=keep(shape.rotate(spin,[0,0,0],[0,0,1]) as Shape3D);m=matMul(matTurn(spin,[0,0,0],[0,0,1]),m);}
   const at=carried(placed.at,chain);
   shape=keep(shape.translate([at[0],at[1],placed.z]) as Shape3D);m=matMul(matMove([at[0],at[1],placed.z]),m);
   out.push({...part,...(part.asset?{asset:{url:part.asset.url,matrix:matMul(m,part.asset.matrix)}}:{}),shape,name:`${part.name} · ${x.label}`,file:`${slug(x.label)}-${part.file}`});}}
 return out;}
/** Everything of a gearbox. `keep` registers what must be freed. */
export function buildGearParts(doc:GearDoc,plan:GearPlan,files:Record<string,ShaftFile|undefined>,keep:Keep,pose?:Pose):CadPart[]{
 const parts:CadPart[]=[];plan.layers.forEach((l,i)=>parts.push(...plates(keep,doc,plan,l,i)));
 plan.columns.forEach((c,i)=>{for(const bo of plan.bolts){if(bo.body!==c.body)continue;const tube=drawCircle(bo.eye-.5).cut(drawCircle(bo.hole)).translate(bo.at[0],bo.at[1]);parts.push({name:`Distanzsäule ${c.from} – ${c.to}`,file:`saeule-${i+1}`,kind:'saeule',shape:keep(tube.sketchOnPlane('XY',c.z0).extrude(c.z1-c.z0) as Shape3D),color:'#c58a4a',made:true});}});
 // A swing arm's plates and columns stand where the pose swings them.
 const body=(p:CadPart):string=>p.kind==='platte'?plan.layers[Number(/^schicht-(\d+)/.exec(p.file)![1])-1].body:plan.columns[Number(/^saeule-(\d+)/.exec(p.file)![1])-1].body;
 if(pose)for(const p of parts)for(const g of links(plan.groups,body(p),pose.groups))if(g.angle)p.shape=keep(p.shape.rotate(g.angle,[g.at[0],g.at[1],0],[0,0,1]) as Shape3D);
 // The motors' bodies come with their shafts' parts.
 parts.push(...shaftParts(keep,plan,doc,files,pose));
 return parts;}
