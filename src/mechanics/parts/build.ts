// A build: a plate and the parts placed on it. Stored in the project file; everything else (the plate's outline in
// auto mode, holes, domes, collisions) follows from it. Plate coordinates: x, y in mm, the plate's top at z = 0.
import {partById} from './catalog.ts';
import type {Part} from './catalog.ts';
import {generator,defaultHolder} from './generators.ts';
import type {HolderHole} from './generators.ts';
import type {Prim} from '../../structure/sdf.ts';

type P2=[number,number];
/** `holes`: edits of the part's holes by index (other Ø, or left out). `plugsOff`: plugs nobody uses, by label. */
export type BuildItem={id:string;part:string;at:P2;angle:number;side:'top'|'bottom';clearance:number;holder:{kind:string;params:Record<string,number>};holes?:Record<string,{d?:number;off?:boolean}>;plugsOff?:string[]};
export type PlateHole={id:string;at:P2;d:number};
/** `auto`: the outline wraps the parts with `margin`; `fixed`: `size` around `center`. */
export type Plate={mode:'auto'|'fixed';size:P2;center:P2;margin:number;thickness:number;corner:number;holes:PlateHole[];mount:{on:boolean;d:number;inset:number}};
export type Build={id:string;label:string;plate:Plate;items:BuildItem[];parts:Part[];grid:number};
export type Rect={corners:P2[]};
export type Issue={kind:'body'|'plug'|'edge'|'floor';items:string[];message:string};

export const newPlate=():Plate=>({mode:'auto',size:[120,80],center:[0,0],margin:6,thickness:3,corner:3,holes:[],mount:{on:true,d:3.4,inset:5}});
export const newBuild=(id:string,label:string):Build=>({id,label,plate:newPlate(),items:[],parts:[],grid:1});
const num=(x:unknown,lo:number,hi:number,what:string)=>{if(typeof x!=='number'||!Number.isFinite(x)||x<lo||x>hi)throw Error(`Aufbau: ${what} ungültig`);return x;};
const pair=(x:unknown,lo:number,hi:number,what:string):P2=>{if(!Array.isArray(x)||x.length!==2)throw Error(`Aufbau: ${what} ungültig`);return [num(x[0],lo,hi,what),num(x[1],lo,hi,what)];};
const text=(x:unknown,what:string)=>{if(typeof x!=='string'||!x.length||x.length>80)throw Error(`Aufbau: ${what} ungültig`);return x;};
/** Checks a stored build; hand-made parts travel with it. */
export function parseBuild(value:unknown):Build{
 const b=value as Build;if(!b||typeof b!=='object'||!b.plate||!Array.isArray(b.items)||b.items.length>200)throw Error('Ungültiger Aufbau');
 const p=b.plate,own=Array.isArray(b.parts)?b.parts.map(x=>structuredClone(x)):[];
 if(p.mode!=='auto'&&p.mode!=='fixed'||!Array.isArray(p.holes)||p.holes.length>500)throw Error('Aufbau: Platte ungültig');
 const plate:Plate={mode:p.mode,size:pair(p.size,10,2000,'Plattengröße'),center:pair(p.center,-5000,5000,'Plattenmitte'),margin:num(p.margin,0,200,'Rand'),thickness:num(p.thickness,.4,50,'Plattendicke'),corner:num(p.corner,0,100,'Eckenradius'),holes:p.holes.map(h=>({id:text(h.id,'Bohrung'),at:pair(h.at,-5000,5000,'Bohrung'),d:num(h.d,.2,200,'Bohrung')})),mount:{on:!!p.mount?.on,d:num(p.mount?.d,.2,50,'Eckbohrung'),inset:num(p.mount?.inset,0,100,'Eckbohrung')}};
 const items=b.items.map(i=>{if(!partById(i.part,own))throw Error(`Aufbau: Teil ${i.part} fehlt im Katalog`);if(i.side!=='top'&&i.side!=='bottom')throw Error('Aufbau: Seite ungültig');
  return {id:text(i.id,'Teil'),part:i.part,at:pair(i.at,-5000,5000,'Position'),angle:num(i.angle,-720,720,'Drehung'),side:i.side,clearance:num(i.clearance,0,100,'Abstand'),holder:{kind:text(i.holder?.kind,'Halter'),params:structuredClone(i.holder?.params??{})},...(i.holes?{holes:structuredClone(i.holes)}:{}),...(i.plugsOff?{plugsOff:[...i.plugsOff]}:{})};});
 return {id:text(b.id,'Aufbau'),label:text(b.label,'Name'),plate,items,parts:own,grid:num(b.grid,0,50,'Raster')};
}
export const partOf=(b:Build,i:BuildItem)=>partById(i.part,b.parts)!;
export const newItem=(id:string,part:Part,at:P2):BuildItem=>({id,part:part.id,at,angle:0,side:part.body>0?'top':'bottom',clearance:2,holder:defaultHolder(part)});

// ---------- placement ----------
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
const hits=(b:Build,i:BuildItem,o:BuildItem)=>{const p=partOf(b,i),q=partOf(b,o),gap=Math.max(i.clearance,o.clearance);if(sameSide(i,o))return overlap(footprint(p,i),footprint(q,o),gap);const x=boss(p,i),y=boss(q,o);return !!(x&&overlap(x,footprint(q,o),gap)||y&&overlap(y,footprint(p,i),gap));};
const plugged=(b:Build,i:BuildItem,o:BuildItem)=>sameSide(i,o)?plugRects(partOf(b,i),i).filter(c=>overlap(c.rect,footprint(partOf(b,o),o))):[];
export function freeAt(b:Build,i:BuildItem,others=b.items.filter(x=>x.id!==i.id)){return others.every(o=>!hits(b,i,o)&&!plugged(b,i,o).length&&!plugged(b,o,i).length);}
/** The free place nearest to the wish, searched outwards on rings. */
export function nearestFree(b:Build,i:BuildItem,step=Math.max(b.grid,1)):P2{
 if(freeAt(b,i))return i.at;
 for(let r=step;r<1500;r+=step){const n=Math.max(8,Math.ceil(2*Math.PI*r/step));let best:P2|undefined;for(let k=0;k<n&&!best;k++){const t=2*Math.PI*k/n,at:P2=[snap(i.at[0]+r*Math.cos(t),b.grid),snap(i.at[1]+r*Math.sin(t),b.grid)];if(freeAt(b,{...i,at}))best=at;}if(best)return best;}
 return i.at;
}
export const snap=(v:number,step:number)=>step>0?Math.round(v/step)*step:v;
const bounds=(r:Rect)=>({x0:Math.min(...r.corners.map(c=>c[0])),x1:Math.max(...r.corners.map(c=>c[0])),y0:Math.min(...r.corners.map(c=>c[1])),y1:Math.max(...r.corners.map(c=>c[1]))});
/** Dragging: the grid, then within `reach` mm a neighbour's edge wins: flush with it, or beside it at the clearance. */
export function snapTo(b:Build,i:BuildItem,at:P2,reach=2.5):P2{
 const moved={...i,at:[snap(at[0],b.grid),snap(at[1],b.grid)] as P2},own=bounds(footprint(partOf(b,i),moved)),best=[{d:reach,v:0},{d:reach,v:0}];
 const edge=(axis:0|1,from:number[],to:number[])=>{for(const f of from)for(const t of to){const d=t-f;if(Math.abs(d)<best[axis].d)best[axis]={d:Math.abs(d),v:d};}};
 for(const o of b.items){if(o.id===i.id||!sameSide(o,i))continue;const r=bounds(footprint(partOf(b,o),o)),g=Math.max(i.clearance,o.clearance);edge(0,[own.x0,own.x1],[r.x0,r.x1]);edge(1,[own.y0,own.y1],[r.y0,r.y1]);edge(0,[own.x0],[r.x1+g]);edge(0,[own.x1],[r.x0-g]);edge(1,[own.y0],[r.y1+g]);edge(1,[own.y1],[r.y0-g]);}
 return [moved.at[0]+best[0].v,moved.at[1]+best[1].v];
}

// ---------- plate and holders ----------
export const itemHoles=(p:Part,i:BuildItem):HolderHole[]=>p.holes.flatMap((h,k)=>{const e=i.holes?.[k];return e?.off?[]:[{at:toPlate(p,i,h.at),d:e?.d??h.d}];});
/** The plate as it is: its outline follows the parts in auto mode. */
export function plateRect(b:Build){const p=b.plate;
 if(p.mode==='fixed'||!b.items.length)return {x0:p.center[0]-p.size[0]/2,x1:p.center[0]+p.size[0]/2,y0:p.center[1]-p.size[1]/2,y1:p.center[1]+p.size[1]/2};
 const all=b.items.map(i=>bounds(footprint(partOf(b,i),i))),m=p.margin;return {x0:Math.min(...all.map(r=>r.x0))-m,x1:Math.max(...all.map(r=>r.x1))+m,y0:Math.min(...all.map(r=>r.y0))-m,y1:Math.max(...all.map(r=>r.y1))+m};}
export function mountHoles(b:Build):PlateHole[]{const m=b.plate.mount;if(!m.on)return [];const r=plateRect(b);return ([[r.x0+m.inset,r.y0+m.inset],[r.x1-m.inset,r.y0+m.inset],[r.x1-m.inset,r.y1-m.inset],[r.x0+m.inset,r.y1-m.inset]] as P2[]).map((at,k)=>({id:`ecke-${k+1}`,at,d:m.d}));}
/** What the item's holder adds to the carrier. */
export function holderGeometry(b:Build,i:BuildItem){const p=partOf(b,i),g=generator(i.holder.kind);if(!g)throw Error(`Halter ${i.holder.kind} unbekannt`);return g.build({part:p,holes:itemHoles(p,i),side:i.side==='top'?1:-1,params:i.holder.params,top:0,bottom:-b.plate.thickness,...(p.pilot?{pilot:{at:i.at,d:p.pilot+.6}}:{})});}
export function plateOutline(b:Build,segments=8):P2[]{const r=plateRect(b),c=Math.min(b.plate.corner,(r.x1-r.x0)/2-.01,(r.y1-r.y0)/2-.01),out:P2[]=[];const arc=(x:number,y:number,a:number)=>{if(c<=0){out.push([x,y]);return;}for(let k=0;k<=segments;k++){const t=a+k/segments*Math.PI/2;out.push([x+c*Math.cos(t),y+c*Math.sin(t)]);}};
 if(c<=0)return [[r.x0,r.y0],[r.x1,r.y0],[r.x1,r.y1],[r.x0,r.y1]];arc(r.x1-c,r.y0+c,-Math.PI/2);arc(r.x1-c,r.y1-c,0);arc(r.x0+c,r.y1-c,Math.PI/2);arc(r.x0+c,r.y0+c,Math.PI);return out;}
export const plateHoles=(b:Build)=>[...mountHoles(b),...b.plate.holes];
/** The carrier's whole geometry: the plate as a solid, then what the holders add. */
export function buildGeometry(b:Build){const t=b.plate.thickness,frame={position:[0,0,0] as [number,number,number],rotation:[0,0,0,1] as [number,number,number,number]};
 const solids:Prim[]=[{kind:'slab',frame,points:plateOutline(b),z0:-t,z1:0}],holes:Prim[]=plateHoles(b).map(h=>({kind:'cylinder',frame:{...frame,position:[h.at[0],h.at[1],0]},r:h.d/2,z0:-t-1,z1:1}));
 for(const i of b.items){const g=holderGeometry(b,i);solids.push(...g.solids);holes.push(...g.holes);}return {solids,holes};}

/** Height of the part's mounted face over the plate, on its side. */
export const liftOf=(i:BuildItem)=>generator(i.holder.kind)?.lift(i.holder.params)??0;
export function issues(b:Build):Issue[]{const out:Issue[]=[],r=plateRect(b);
 b.items.forEach((i,n)=>{const p=partOf(b,i);
  if(b.plate.mode==='fixed'&&footprint(p,i).corners.some(c=>c[0]<r.x0-1e-6||c[0]>r.x1+1e-6||c[1]<r.y0-1e-6||c[1]>r.y1+1e-6))out.push({kind:'edge',items:[i.id],message:`${p.label} ragt über die Platte.`});
  if(p.body>0&&p.box.min[2]<0&&liftOf(i)<-p.box.min[2]-1e-6&&i.holder.kind!=='none')out.push({kind:'floor',items:[i.id],message:`${p.label}: unten stehen ${(-p.box.min[2]).toFixed(1)} mm über, Halter nur ${liftOf(i).toFixed(1)} mm hoch.`});
  for(const o of b.items.slice(n+1)){const q=partOf(b,o);if(hits(b,i,o))out.push({kind:'body',items:[i.id,o.id],message:`${p.label} und ${q.label}: unter ${Math.max(i.clearance,o.clearance)} mm Abstand.`});}
  for(const o of b.items){if(o===i)continue;for(const c of plugged(b,i,o))out.push({kind:'plug',items:[i.id,o.id],message:`${partOf(b,o).label} steht vor dem Stecker ${c.label} von ${p.label}.`});}});
 return out;}
/** Parts and screws to buy. */
export function shopping(b:Build){const lines=new Map<string,number>(),add=(k:string,n:number)=>lines.set(k,(lines.get(k)??0)+n);for(const i of b.items){const p=partOf(b,i);add(p.label,1);const n=itemHoles(p,i).length;if(n&&i.holder.kind==='dome')add(`Blechschraube für Ø ${(i.holder.params.pilot).toFixed(1)} mm Kernloch`,n);if(n&&i.holder.kind==='through')add('Schraube mit Mutter passend zur Bohrung',n);}return [...lines].map(([label,count])=>({label,count}));}
