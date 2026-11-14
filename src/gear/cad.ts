// The gearbox as solids. Per layer a plate pair: one outline in 2D (rings round the bearings, webs as the quadrilateral
// between their outer tangents, bolt eyes joined to their nearest bearing), minus what goes through (the lip's opening
// over every bearing, holes for shafts passing, bolt holes), extruded from the band's bottom to the split and from the
// split to its top; each plate then gets the pocket for its half of every bearing. Columns between layers, and the
// linked shafts with all their parts, turned upright and put where they stand. 2D booleans and one extrusion per
// plate keep OpenCascade's 3D booleans (which leak a little) to the pockets.
import {draw,drawCircle,makeCylinder} from 'replicad';
import type {Drawing,Shape3D} from 'replicad';
import {buildParts} from '../shaft/cad.ts';
import type {CadPart} from '../shaft/cad.ts';
import type {GearDoc} from './model.ts';
import type {GearPlan,LayerPlan,ShaftFile} from './plan.ts';
import {tangents} from './draw.ts';

type Keep=<T extends {delete():void}>(v:T)=>T;
type P=[number,number];
import {slug} from './notes.ts';
const disc=(c:P,r:number)=>drawCircle(r).translate(c[0],c[1]);
/** Two discs and the quadrilateral between their outer tangents: their hull. */
function hull(a:P,ra:number,b:P,rb:number):Drawing{const t=tangents(a,ra,b,rb);let d=disc(a,ra).fuse(disc(b,rb));if(t)d=d.fuse(draw(t[0]).lineTo(t[1]).lineTo(t[2]).lineTo(t[3]).close());return d;}
/** The outline of a layer's plates, with everything that goes through cut out. */
export function plateOutline(doc:GearDoc,plan:GearPlan,l:LayerPlan):Drawing|undefined{
 const s=doc.settings,bearing=(k:string)=>plan.bearings.find(b=>b.key===k)!,ring=(k:string)=>bearing(k).D/2+l.rim;if(!l.bearings.length)return undefined;
 let d:Drawing=disc(bearing(l.bearings[0]).at,ring(l.bearings[0]));
 for(const k of l.bearings.slice(1))d=d.fuse(disc(bearing(k).at,ring(k)));
 for(const w of l.webs)d=d.fuse(hull(bearing(w.a).at,ring(w.a),bearing(w.b).at,ring(w.b)));
 for(const bo of plan.bolts){const k=bo.attach[l.id];if(k)d=d.fuse(hull(bearing(k).at,ring(k),bo.at,bo.eye));}
 let holes:Drawing|undefined;const hole=(c:P,r:number)=>{const h=disc(c,r);holes=holes?holes.fuse(h):h;};
 for(const k of l.bearings){const b=bearing(k);hole(b.at,b.D/2-s.lipIn);}
 for(const h of l.holes)hole(plan.shafts.find(x=>x.id===h.on)!.at,h.r);
 for(const bo of plan.bolts)if(bo.attach[l.id])hole(bo.at,bo.hole);
 return holes?d.cut(holes):d;}
function plates(keep:Keep,doc:GearDoc,plan:GearPlan,l:LayerPlan,index:number):CadPart[]{
 const out=plateOutline(doc,plan,l);if(!out)return [];const s=doc.settings,[z0,z1]=l.band,bearings=l.bearings.map(k=>plan.bearings.find(b=>b.key===k)!);
 const half=(lo:number,hi:number,lower:boolean)=>{let solid=keep(out.clone().sketchOnPlane('XY',lo).extrude(hi-lo) as Shape3D);
  for(const b of bearings){const a=lower?Math.max(lo,b.z0):l.split,e=lower?l.split:Math.min(hi,b.z1);if(e-a<=1e-6)continue;solid=keep(solid.cut(keep(makeCylinder(b.D/2+s.fit,e-a+(lower?.01:0)+(lower?0:.01),[b.at[0],b.at[1],lower?a:a-.01],[0,0,1]))) as Shape3D);}
  return solid;};
 return [{name:`Schicht ${index+1} unten`,file:`schicht-${index+1}-unten`,kind:'platte',shape:half(z0,l.split,true),color:'#7a93a6',made:true},
  {name:`Schicht ${index+1} oben`,file:`schicht-${index+1}-oben`,kind:'platte',shape:half(l.split,z1,false),color:'#8aa3b6',made:true}];}
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
 parts.push(...shaftParts(keep,plan,doc,files));
 return parts;}
