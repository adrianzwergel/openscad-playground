// A build: parts and plates in space, each hanging on a link of a mechanism or standing free. Parts on a plate live in
// that plate's coordinates (x, y in mm, its top at z = 0), the rest has a frame of its own. Stored in the project file;
// everything else (a plate's outline in auto mode, holes, domes, collisions) follows from it.
import {partById,massOf} from './catalog.ts';
import type {Part} from './catalog.ts';
import {generator,defaultHolder,clipLayout,clipArm} from './generators.ts';
import {snapStrain} from '../../structure/features.ts';
import type {HolderHole} from './generators.ts';
import type {Prim} from '../../structure/sdf.ts';
import type {Frame,V} from '../kinematics/math.ts';
import {compose,identity,inverse,cross,scale,unit,quaternionFromBasis,axisAngle} from '../kinematics/math.ts';
import type {Seat} from '../kinematics/bearings.ts';
import type {Train} from './train.ts';
import {parseTrain} from './train.ts';
import type {Group} from './groups.ts';
import {parseGroups} from './groups.ts';

type P2=[number,number];
/** A place in space: `frame` on the link `body`, or in the world without one. */
export type Free={frame:Frame;body?:string};
/** How free the tool is to choose the place. On a plate: `zone` a rectangle (`center`, `size`), `auto` anywhere. On a
 * model: `zone` a ball (`center`, `size[0]` its radius). `goal` decides among the places that fit. */
export type Wish={mode:'zone'|'auto';center:number[];size:number[];goal:'middle'|'axis'};
/** On a plate (`plate`): `at`, `angle`, `side` place it. Otherwise `free` does: its frame is the part frame.
 * `holes`: edits of the part's holes by index (other Ø, or left out). `plugsOff`: plugs nobody uses, by label. */
export type BuildItem={id:string;part:string;at:P2;angle:number;side:'top'|'bottom';clearance:number;holder:{kind:string;params:Record<string,number>};holes?:Record<string,{d?:number;off?:boolean}>;plugsOff?:string[];plate?:string;free?:Free;wish?:Wish;/** Real mass (g), where the estimate is not good enough. */mass?:number;/** The group it sits in. */group?:string};
export type PlateHole={id:string;at:P2;d:number};
/** `auto`: the outline wraps the parts with `margin`; `fixed`: `size` around `center`. */
export type Plate={mode:'auto'|'fixed';size:P2;center:P2;margin:number;thickness:number;corner:number;holes:PlateHole[];mount:{on:boolean;d:number;inset:number};/** The housing's numbers, where they differ from the defaults. */housing?:{wall:number;lid:number;top:number;fit:number}};
export type PlateNode=Plate&{id:string;free:Free;/** The group it sits in. */group?:string};
/** `mechanism`: the mechanism it belongs to; without one it stands alone. */
export type Build={id:string;label:string;plates:PlateNode[];items:BuildItem[];parts:Part[];grid:number;mechanism?:string;/** The wheels and shafts of the build. */train?:Train;/** Groups of plates, parts and wheels (parts/groups.ts). */groups?:Group[];/** Order of the scene tree, as member keys (parts/groups.ts). */order?:string[]};
/** One plate with what sits on it: all the planar logic below works on this. */
export type Sheet={plate:Plate;items:BuildItem[];parts:Part[];grid:number};
export type Rect={corners:P2[]};
export type Issue={kind:'body'|'plug'|'edge'|'floor'|'model'|'holder';items:string[];message:string};

export const newPlate=():Plate=>({mode:'auto',size:[120,80],center:[0,0],margin:6,thickness:3,corner:3,holes:[],mount:{on:true,d:3.4,inset:5}});
export const newPlateNode=(id:string,frame:Frame=identity(),body?:string):PlateNode=>({...newPlate(),id,free:{frame,...(body?{body}:{})}});
export const newBuild=(id:string,label:string):Build=>({id,label,plates:[newPlateNode('platte')],items:[],parts:[],grid:1});
/** The parts of a mechanism: no plate to start with, the model is what they go on. */
export const modelBuild=(id:string,mechanism:string):Build=>({id,label:'Teile',plates:[],items:[],parts:[],grid:1,mechanism});
export const sheet=(b:Build,plate:string):Sheet=>({plate:b.plates.find(p=>p.id===plate)!,items:b.items.filter(i=>i.plate===plate),parts:b.parts,grid:b.grid});
const num=(x:unknown,lo:number,hi:number,what:string)=>{if(typeof x!=='number'||!Number.isFinite(x)||x<lo||x>hi)throw Error(`Aufbau: ${what} ungültig`);return x;};
const pair=(x:unknown,lo:number,hi:number,what:string):P2=>{if(!Array.isArray(x)||x.length!==2)throw Error(`Aufbau: ${what} ungültig`);return [num(x[0],lo,hi,what),num(x[1],lo,hi,what)];};
const text=(x:unknown,what:string)=>{if(typeof x!=='string'||!x.length||x.length>80)throw Error(`Aufbau: ${what} ungültig`);return x;};
const parseFree=(f:Free|undefined):Free=>{const q=f?.frame;if(!q||!Array.isArray(q.position)||q.position.length!==3||!Array.isArray(q.rotation)||q.rotation.length!==4||![...q.position,...q.rotation].every(Number.isFinite))throw Error('Aufbau: Lage ungültig');return {frame:structuredClone(q),...(f!.body?{body:text(f!.body,'Glied')}:{})};};
const parseWish=(w:Wish):Wish=>{if(w.mode!=='zone'&&w.mode!=='auto'||w.goal!=='middle'&&w.goal!=='axis'||!Array.isArray(w.center)||!Array.isArray(w.size)||![...w.center,...w.size].every(Number.isFinite))throw Error('Aufbau: Wunsch ungültig');return structuredClone(w);};
function parsePlate(p:PlateNode):PlateNode{
 if(!p||p.mode!=='auto'&&p.mode!=='fixed'||!Array.isArray(p.holes)||p.holes.length>500)throw Error('Aufbau: Platte ungültig');
 return {id:text(p.id,'Platte'),free:parseFree(p.free),mode:p.mode,size:pair(p.size,10,2000,'Plattengröße'),center:pair(p.center,-5000,5000,'Plattenmitte'),margin:num(p.margin,0,200,'Rand'),thickness:num(p.thickness,.4,50,'Plattendicke'),corner:num(p.corner,0,100,'Eckenradius'),holes:p.holes.map(h=>({id:text(h.id,'Bohrung'),at:pair(h.at,-5000,5000,'Bohrung'),d:num(h.d,.2,200,'Bohrung')})),mount:{on:!!p.mount?.on,d:num(p.mount?.d,.2,50,'Eckbohrung'),inset:num(p.mount?.inset,0,100,'Eckbohrung')},...(p.housing?{housing:{wall:num(p.housing.wall,.4,20,'Wand'),lid:num(p.housing.lid,.4,20,'Deckel'),top:num(p.housing.top,0,200,'Luft oben'),fit:num(p.housing.fit,0,2,'Passung')}}:{}),...(typeof p.group==='string'?{group:p.group}:{})};
}
/** Checks a stored build; hand-made parts travel with it. Builds of one plate from before become plate `platte`. */
export function parseBuild(value:unknown):Build{
 const old=value as {plate?:Plate;items?:BuildItem[]},b=(old&&old.plate?{...old,plate:undefined,plates:[{...old.plate,id:'platte',free:{frame:identity()}}],items:(old.items??[]).map(i=>({...i,plate:'platte'}))}:value) as Build;
 if(!b||typeof b!=='object'||!Array.isArray(b.plates)||b.plates.length>32||!Array.isArray(b.items)||b.items.length>200)throw Error('Ungültiger Aufbau');
 const own=Array.isArray(b.parts)?b.parts.map(x=>structuredClone(x)):[],plates=b.plates.map(parsePlate);if(new Set(plates.map(p=>p.id)).size!==plates.length)throw Error('Aufbau: Platte doppelt');
 const items=b.items.map(i=>{if(!partById(i.part,own))throw Error(`Aufbau: Teil ${i.part} fehlt im Katalog`);if(i.side!=='top'&&i.side!=='bottom')throw Error('Aufbau: Seite ungültig');if(i.plate?!plates.some(p=>p.id===i.plate):!i.free)throw Error('Aufbau: Teil ohne Lage');
  return {id:text(i.id,'Teil'),part:i.part,at:pair(i.at,-5000,5000,'Position'),angle:num(i.angle,-720,720,'Drehung'),side:i.side,clearance:num(i.clearance,0,100,'Abstand'),holder:{kind:text(i.holder?.kind,'Halter'),params:structuredClone(i.holder?.params??{})},...(i.holes?{holes:structuredClone(i.holes)}:{}),...(i.plugsOff?{plugsOff:[...i.plugsOff]}:{}),...(i.plate?{plate:i.plate}:{free:parseFree(i.free)}),...(i.wish?{wish:parseWish(i.wish)}:{}),...(i.mass!==undefined?{mass:num(i.mass,0,1e6,'Masse')}:{}),...(typeof i.group==='string'?{group:i.group}:{})};});
 const before=new Set(Array.isArray(b.groups)?(b.groups as {id:string;kind?:string}[]).filter(g=>g&&!g.kind).map(g=>g.id):[]),groups=parseGroups(b.groups),known=new Set((groups??[]).map(g=>g.id)),train=b.train?parseTrain(b.train):undefined;
 // A member whose group is gone stands alone.
 for(const x of [...items,...plates,...(train?.wheels??[])])if(x.group!==undefined&&!known.has(x.group))delete x.group;
 // Körper from before `turns`: one whose parts hung on its one shaft turned with it.
 for(const g of groups??[]){if(g.kind!=='koerper'||g.turns||before.has(g.id))continue;const shafts=[...new Set((train?.wheels??[]).filter(w=>w.group===g.id).map(w=>w.shaft))],body=shafts.length===1?`welle:${shafts[0]}`:'';if(body&&[...items,...plates].some(x=>x.group===g.id&&(x as {free?:{body?:string}}).free?.body===body))g.turns=shafts[0];}
 return {id:text(b.id,'Aufbau'),label:text(b.label,'Name'),plates,items,parts:own,grid:num(b.grid,0,50,'Raster'),...(b.mechanism?{mechanism:text(b.mechanism,'Mechanismus')}:{}),...(train?{train}:{}),...(groups?.length?{groups}:{}),...(Array.isArray(b.order)&&b.order.length<=2000?{order:b.order.filter((k:unknown)=>typeof k==='string')}:{})};
}
export const partOf=(b:{parts:Part[]},i:BuildItem)=>partById(i.part,b.parts)!;
export const newItem=(id:string,part:Part,at:P2):BuildItem=>({id,part:part.id,at,angle:0,side:part.body>0?'top':'bottom',clearance:2,holder:defaultHolder(part)});

// ---------- placement on a plate ----------
/** Whether the part is turned over on the plate: the body lies on the side the item chose. */
export const flipped=(p:Part,i:BuildItem)=>(i.side==='top')!==(p.body>0);
/** Part frame → plate. A flipped part is turned about its x axis. */
export function toPlate(p:Part,i:BuildItem,[x,y]:P2):P2{const a=i.angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a),v=flipped(p,i)?-y:y;return [i.at[0]+x*c-v*s,i.at[1]+x*s+v*c];}
const rectOf=(p:Part,i:BuildItem,[x0,y0]:P2,[x1,y1]:P2):Rect=>({corners:[[x0,y0],[x1,y0],[x1,y1],[x0,y1]].map(c=>toPlate(p,i,c as P2))});
export const footprint=(p:Part,i:BuildItem)=>rectOf(p,i,[p.box.min[0],p.box.min[1]],[p.box.max[0],p.box.max[1]]);
/** Ways out of the plugs still in use: from the connector over the part's edge, 20 mm into free space. */
export function plugRects(p:Part,i:BuildItem){const out:{label:string;rect:Rect;height:number}[]=[];
 for(const c of p.plugs){if(i.plugsOff?.includes(c.label))continue;const a=c.dir*Math.PI/180,ux=Math.cos(a),uy=Math.sin(a),edge=(ux>.5?p.box.max[0]-c.at[0]:ux<-.5?c.at[0]-p.box.min[0]:uy>.5?p.box.max[1]-c.at[1]:c.at[1]-p.box.min[1]),far=edge+20,w=c.width/2;
  const at=(u:number,v:number):P2=>[c.at[0]+u*ux-v*uy,c.at[1]+u*uy+v*ux],pts=[at(edge,-w),at(far,-w),at(far,w),at(edge,w)];out.push({label:c.label,height:c.height,rect:{corners:pts.map(q=>toPlate(p,i,q))}});}
 return out;}
const axes=(r:Rect):P2[]=>[0,1].map(k=>{const [a,b]=[r.corners[k],r.corners[k+1]],l=Math.hypot(b[0]-a[0],b[1]-a[1])||1;return [(b[0]-a[0])/l,(b[1]-a[1])/l] as P2;});
/** The two rectangles come closer than `gap` (separating axes; gap > 0 widens every axis' test). */
export function overlap(a:Rect,b:Rect,gap=0){for(const n of [...axes(a),...axes(b)]){const span=(r:Rect)=>{const d=r.corners.map(c=>c[0]*n[0]+c[1]*n[1]);return [Math.min(...d),Math.max(...d)];},[a0,a1]=span(a),[b0,b1]=span(b);if(a1+gap<=b0+1e-6||b1+gap<=a0+1e-6)return false;}return true;}
const sameSide=(a:BuildItem,b:BuildItem)=>a.side===b.side;
/** A motor's shaft and boss stick out on the other side of the plate. */
const boss=(p:Part,i:BuildItem):Rect|undefined=>{if(!p.shaft&&!p.pilot)return undefined;const r=(p.pilot??p.shaft!.d)/2;return {corners:[[-r,-r],[r,-r],[r,r],[-r,r]].map(([x,y])=>[i.at[0]+x,i.at[1]+y] as P2)};};
const hits=(b:Sheet,i:BuildItem,o:BuildItem)=>{const p=partOf(b,i),q=partOf(b,o),gap=Math.max(i.clearance,o.clearance);if(sameSide(i,o))return overlap(footprint(p,i),footprint(q,o),gap);const x=boss(p,i),y=boss(q,o);return !!(x&&overlap(x,footprint(q,o),gap)||y&&overlap(y,footprint(p,i),gap));};
const plugged=(b:Sheet,i:BuildItem,o:BuildItem)=>sameSide(i,o)?plugRects(partOf(b,i),i).filter(c=>overlap(c.rect,footprint(partOf(b,o),o))):[];
export function freeAt(b:Sheet,i:BuildItem,others=b.items.filter(x=>x.id!==i.id)){return others.every(o=>!hits(b,i,o)&&!plugged(b,i,o).length&&!plugged(b,o,i).length);}
/** The free place nearest to the wish, searched outwards on rings. */
export function nearestFree(b:Sheet,i:BuildItem,step=Math.max(b.grid,1)):P2{
 if(freeAt(b,i))return i.at;
 for(let r=step;r<1500;r+=step){const n=Math.max(8,Math.ceil(2*Math.PI*r/step));let best:P2|undefined;for(let k=0;k<n&&!best;k++){const t=2*Math.PI*k/n,at:P2=[snap(i.at[0]+r*Math.cos(t),b.grid),snap(i.at[1]+r*Math.sin(t),b.grid)];if(freeAt(b,{...i,at}))best=at;}if(best)return best;}
 return i.at;
}
export const snap=(v:number,step:number)=>step>0?Math.round(v/step)*step:v;
const bounds=(r:Rect)=>({x0:Math.min(...r.corners.map(c=>c[0])),x1:Math.max(...r.corners.map(c=>c[0])),y0:Math.min(...r.corners.map(c=>c[1])),y1:Math.max(...r.corners.map(c=>c[1]))});
/** Dragging: the grid, then within `reach` mm a neighbour's edge wins: flush with it, or beside it at the clearance. */
export function snapTo(b:Sheet,i:BuildItem,at:P2,reach=2.5):P2{
 const moved={...i,at:[snap(at[0],b.grid),snap(at[1],b.grid)] as P2},own=bounds(footprint(partOf(b,i),moved)),best=[{d:reach,v:0},{d:reach,v:0}];
 const edge=(axis:0|1,from:number[],to:number[])=>{for(const f of from)for(const t of to){const d=t-f;if(Math.abs(d)<best[axis].d)best[axis]={d:Math.abs(d),v:d};}};
 for(const o of b.items){if(o.id===i.id||!sameSide(o,i))continue;const r=bounds(footprint(partOf(b,o),o)),g=Math.max(i.clearance,o.clearance);edge(0,[own.x0,own.x1],[r.x0,r.x1]);edge(1,[own.y0,own.y1],[r.y0,r.y1]);edge(0,[own.x0],[r.x1+g]);edge(0,[own.x1],[r.x0-g]);edge(1,[own.y0],[r.y1+g]);edge(1,[own.y1],[r.y0-g]);}
 return [moved.at[0]+best[0].v,moved.at[1]+best[1].v];
}

// ---------- plate and holders ----------
export const itemHoles=(p:Part,i:BuildItem):HolderHole[]=>p.holes.flatMap((h,k)=>{const e=i.holes?.[k];return e?.off?[]:[{at:toPlate(p,i,h.at),d:e?.d??h.d}];});
/** The plate as it is: its outline follows the parts in auto mode. */
export function plateRect(b:Sheet){const p=b.plate;
 if(p.mode==='fixed'||!b.items.length)return {x0:p.center[0]-p.size[0]/2,x1:p.center[0]+p.size[0]/2,y0:p.center[1]-p.size[1]/2,y1:p.center[1]+p.size[1]/2};
 const all=b.items.map(i=>bounds(footprint(partOf(b,i),i))),m=p.margin;return {x0:Math.min(...all.map(r=>r.x0))-m,x1:Math.max(...all.map(r=>r.x1))+m,y0:Math.min(...all.map(r=>r.y0))-m,y1:Math.max(...all.map(r=>r.y1))+m};}
export function mountHoles(b:Sheet):PlateHole[]{const m=b.plate.mount;if(!m.on)return [];const r=plateRect(b);return ([[r.x0+m.inset,r.y0+m.inset],[r.x1-m.inset,r.y0+m.inset],[r.x1-m.inset,r.y1-m.inset],[r.x0+m.inset,r.y1-m.inset]] as P2[]).map((at,k)=>({id:`ecke-${k+1}`,at,d:m.d}));}
/** What the item's holder adds to the carrier. */
export function holderGeometry(b:Sheet,i:BuildItem){const p=partOf(b,i),g=generator(i.holder.kind);if(!g)throw Error(`Halter ${i.holder.kind} unbekannt`);return g.build({part:p,holes:itemHoles(p,i),side:i.side==='top'?1:-1,params:i.holder.params,top:0,bottom:-b.plate.thickness,map:q=>toPlate(p,i,q),...(p.pilot?{pilot:{at:i.at,d:p.pilot+.6}}:{})});}
export function plateOutline(b:Sheet,segments=8):P2[]{const r=plateRect(b),c=Math.min(b.plate.corner,(r.x1-r.x0)/2-.01,(r.y1-r.y0)/2-.01),out:P2[]=[];const arc=(x:number,y:number,a:number)=>{if(c<=0){out.push([x,y]);return;}for(let k=0;k<=segments;k++){const t=a+k/segments*Math.PI/2;out.push([x+c*Math.cos(t),y+c*Math.sin(t)]);}};
 if(c<=0)return [[r.x0,r.y0],[r.x1,r.y0],[r.x1,r.y1],[r.x0,r.y1]];arc(r.x1-c,r.y0+c,-Math.PI/2);arc(r.x1-c,r.y1-c,0);arc(r.x0+c,r.y1-c,Math.PI/2);arc(r.x0+c,r.y0+c,Math.PI);return out;}
export const plateHoles=(b:Sheet)=>[...mountHoles(b),...b.plate.holes];
/** The carrier's whole geometry: the plate as a solid, then what the holders add. */
export function buildGeometry(b:Sheet){const t=b.plate.thickness,frame={position:[0,0,0] as [number,number,number],rotation:[0,0,0,1] as [number,number,number,number]};
 const solids:Prim[]=[{kind:'slab',frame,points:plateOutline(b),z0:-t,z1:0}],holes:Prim[]=plateHoles(b).map(h=>({kind:'cylinder',frame:{...frame,position:[h.at[0],h.at[1],0]},r:h.d/2,z0:-t-1,z1:1}));
 for(const i of b.items){const g=holderGeometry(b,i);solids.push(...g.solids);holes.push(...g.holes);}return {solids,holes};}

/** Height of the part's mounted face over the plate, on its side. */
export const liftOf=(i:BuildItem)=>generator(i.holder.kind)?.lift(i.holder.params)??0;
export function issues(b:Sheet):Issue[]{const out:Issue[]=[],r=plateRect(b);
 b.items.forEach((i,n)=>{const p=partOf(b,i);
  if(b.plate.mode==='fixed'&&footprint(p,i).corners.some(c=>c[0]<r.x0-1e-6||c[0]>r.x1+1e-6||c[1]<r.y0-1e-6||c[1]>r.y1+1e-6))out.push({kind:'edge',items:[i.id],message:`${p.label} ragt über die Platte.`});
  if(p.body>0&&p.box.min[2]<0&&liftOf(i)<-p.box.min[2]-1e-6&&i.holder.kind!=='none')out.push({kind:'floor',items:[i.id],message:`${p.label}: unten stehen ${(-p.box.min[2]).toFixed(1)} mm über, Halter nur ${liftOf(i).toFixed(1)} mm hoch.`});
  out.push(...clipIssues(p,i));
  if(i.wish?.mode==='zone'&&(Math.abs(i.at[0]-i.wish.center[0])>i.wish.size[0]/2+1e-6||Math.abs(i.at[1]-i.wish.center[1])>i.wish.size[1]/2+1e-6))out.push({kind:'holder',items:[i.id],message:`${p.label} findet in seinem Bereich keinen Platz.`});
  for(const o of b.items.slice(n+1)){const q=partOf(b,o);if(hits(b,i,o))out.push({kind:'body',items:[i.id,o.id],message:`${p.label} und ${q.label}: unter ${Math.max(i.clearance,o.clearance)} mm Abstand.`});}
  for(const o of b.items){if(o===i)continue;for(const c of plugged(b,i,o))out.push({kind:'plug',items:[i.id,o.id],message:`${partOf(b,o).label} steht vor dem Stecker ${c.label} von ${p.label}.`});}});
 return out;}
/** A clip that would break or not hold: the arm's strain, the hook's bite, a plug in the arm's way. */
export function clipIssues(p:Part,i:BuildItem):Issue[]{if(i.holder.kind!=='clip')return [];const out:Issue[]=[],h=i.holder.params,c=clipLayout(p,h),arm=clipArm(c.t,h),strain=snapStrain(arm);
 if(strain>.02)out.push({kind:'holder',items:[i.id],message:`${p.label}: Federarm dehnt sich um ${(strain*100).toFixed(1)} % (PLA bricht ab etwa 2 %). Höher auflegen, Arm dünner oder Haken flacher.`});
 if(h.lip-h.fit<.3)out.push({kind:'holder',items:[i.id],message:`${p.label}: Haken greift nur ${(h.lip-h.fit).toFixed(1)} mm über den Rand.`});
 const ways=plugRects(p,i);for(const a of c.arms){const half=[Math.abs(a.inward[1])*h.width/2+Math.abs(a.inward[0])*h.thickness,Math.abs(a.inward[0])*h.width/2+Math.abs(a.inward[1])*h.thickness],r:Rect={corners:[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>toPlate(p,i,[a.at[0]+x*half[0],a.at[1]+y*half[1]]))};for(const w of ways)if(overlap(w.rect,r))out.push({kind:'holder',items:[i.id],message:`${p.label}: Federarm steht vor dem Stecker ${w.label}. Arme längs verschieben.`});}
 return out;}
/** Parts and screws to buy. */
export function shopping(b:{items:BuildItem[];parts:Part[]}){const lines=new Map<string,number>(),add=(k:string,n:number)=>lines.set(k,(lines.get(k)??0)+n);for(const i of b.items){const p=partOf(b,i);add(p.label,1);const n=itemHoles(p,i).length;if(n&&i.holder.kind==='dome')add(`Blechschraube für Ø ${(i.holder.params.pilot).toFixed(1)} mm Kernloch`,n);if(n&&i.holder.kind==='through')add('Schraube mit Mutter passend zur Bohrung',n);}return [...lines].map(([label,count])=>({label,count}));}

// ---------- in space ----------
/** A place as it stands now, given the links' frames. */
export const worldOf=(f:Free,frames:Record<string,Frame>)=>f.body&&frames[f.body]?compose(frames[f.body],f.frame):f.frame;
/** The same place in the terms of another link. */
export const reframe=(f:Free,body:string|undefined,frames:Record<string,Frame>):Free=>{const w=worldOf(f,frames);return {frame:body&&frames[body]?compose(inverse(frames[body]),w):w,...(body?{body}:{})};};
/** Part frame laid on a surface: its body on the side `normal` points to, `lift` above it, turned by `angle`. */
export function onSurface(p:Part,point:V,normal:V,lift:number,angle=0):Frame{
 const n=unit(normal),z=p.body>0?n:scale(n,-1),seed:V=Math.abs(z[2])>.9?[1,0,0]:[0,0,1],x=unit(cross(cross(z,seed),z)),q=quaternionFromBasis(x,cross(z,x),z);
 return {position:[point[0]+n[0]*lift,point[1]+n[1]*lift,point[2]+n[2]*lift],rotation:compose({position:[0,0,0],rotation:q},{position:[0,0,0],rotation:axisAngle([0,0,1],angle)}).rotation};
}
/** A free part's hull in world terms. */
export function partBox(p:Part,world:Frame){return {frame:world,center:p.box.min.map((v,k)=>(v+p.box.max[k])/2) as V,half:p.box.max.map((v,k)=>(v-p.box.min[k])/2) as V};}
/** A plate's hull in world terms. */
export function plateBox(b:Build,n:PlateNode,world:Frame){const r=plateRect(sheet(b,n.id));return {frame:world,center:[(r.x0+r.x1)/2,(r.y0+r.y1)/2,-n.thickness/2] as V,half:[(r.x1-r.x0)/2,(r.y1-r.y0)/2,n.thickness/2] as V};}
/** A free part's holder as a piece of its own: a small plate that follows the holes, the same holder on it. */
export function holderPiece(b:Build,i:BuildItem):Sheet{const plate={...newPlate(),margin:4,mount:{on:false,d:3.4,inset:5}},item:BuildItem={...i,at:[0,0],angle:0,side:partOf(b,i).body>0?'top':'bottom'};delete item.free;return {plate,items:[item],parts:b.parts,grid:0};}
export const itemMass=(b:{parts:Part[]},i:BuildItem)=>i.mass??massOf(partOf(b,i));
/** Where a part stands in the room, free or on its plate. */
export function standing(b:Build,i:BuildItem,frames:Record<string,Frame>):Frame{if(i.free)return worldOf(i.free,frames);const n=b.plates.find(p=>p.id===i.plate)!,p=partOf(b,i),z=i.side==='top'?liftOf(i):-n.thickness-liftOf(i);return compose(compose(worldOf(n.free,frames),{position:[i.at[0],i.at[1],z],rotation:axisAngle([0,0,1],i.angle)}),{position:[0,0,0],rotation:flipped(p,i)?[1,0,0,0]:[0,0,0,1]});}
/** The seats of one part: a dome per hole or the clip's arms and supports, reaching away from the part. */
function itemSeats(b:Build,i:BuildItem,f:Frame,link:string):Seat[]{
 const p=partOf(b,i),out:Seat[]=[],seat=(id:string,frame:Frame,feature:Seat['feature'],keep?:Seat['keep']):Seat=>({id:`${i.id}/${id}`,link,line:i.id,kind:'mount',part:p.id,frame,feature,...(keep?{keep}:{})});
 if(i.holder.kind==='none')return out;
 if(i.holder.kind==='clip'){const h=i.holder.params,c=clipLayout(p,h),arm=clipArm(c.t,h),room={frame:f,r:Math.hypot(p.size[0],p.size[1])/2+1,z0:.5,z1:Math.max(p.box.max[2],1)+1};
  c.arms.forEach((a,k)=>out.push(seat(`arm${k+1}`,compose(f,{position:[a.at[0],a.at[1],-h.height],rotation:axisAngle([0,0,1],Math.atan2(a.inward[1],a.inward[0])*180/Math.PI)}),arm,k===0?room:undefined)));
  [...c.posts,...c.stops].forEach((x,k)=>out.push(seat(`stuetze${k+1}`,compose(f,{position:[x.at[0],x.at[1],x.feature.height-h.height],rotation:[0,0,0,1]}),x.feature)));return out;}
 const turn:Frame={position:[0,0,0],rotation:p.body>0?[0,0,0,1]:[1,0,0,0]},h=Math.max(1,liftOf(i)||5),keep=Math.hypot(p.box.max[0]-p.box.min[0],p.box.max[1]-p.box.min[1])/2+1;
 p.holes.forEach((x,k)=>{if(i.holes?.[k]?.off)return;const d=i.holes?.[k]?.d??x.d;out.push(seat(`loch${k+1}`,compose(compose(f,{position:[x.at[0],x.at[1],0],rotation:[0,0,0,1]}),turn),{kind:'standoff',height:h,outer:Math.max(5,d+3.2),hole:i.holder.params.pilot??d-.4},k===0?{frame:compose(f,turn),r:keep,z0:.5,z1:Math.max(p.box.max[2],-p.box.min[2])+1}:undefined));});
 return out;}
/** A plate carried by a structure: four domes under its corner holes. */
function plateSeats(b:Build,n:PlateNode,link:string):Seat[]{const flat=sheet(b,n.id),r=plateRect(flat),m=n.mount.inset,d=n.mount.d;return ([[r.x0+m,r.y0+m],[r.x1-m,r.y0+m],[r.x1-m,r.y1-m],[r.x0+m,r.y1-m]] as P2[]).map((at,k)=>({id:`${n.id}/ecke${k+1}`,link,line:n.id,kind:'mount',frame:compose(n.free.frame,{position:[at[0],at[1],-n.thickness],rotation:[0,0,0,1]}),feature:{kind:'standoff',height:6,outer:d+3.6,hole:d-.8},...(k===0?{keep:{frame:n.free.frame,r:Math.hypot(r.x1-r.x0,r.y1-r.y0)/2+1,z0:-n.thickness,z1:30}}:{})}));}
/** Where the parts and plates want to be printed into what carries them: one seat per holding point, their room kept
 * free. Parts on a plate are held by the plate; what hangs on no link goes to `ground`. */
export function partSeats(b:Build,ground='ground'):Seat[]{
 // A link's anchors carry its design load each; a part carries a fraction of it, shared by its holding points.
 const light=(list:Seat[])=>list.map(s=>({...s,load:SEAT_LOAD/list.length}));
 return [...b.items.flatMap(i=>i.free?light(itemSeats(b,i,i.free.frame,i.free.body??ground)):[]),...b.plates.flatMap(n=>light(plateSeats(b,n,n.free.body??ground)))];}
const SEAT_LOAD=.5;
