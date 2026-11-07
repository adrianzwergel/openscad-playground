// Parts in the Studio: a store of parts, dragged into the room. On a plate they snap to grid and neighbours and keep
// their clearance and the ways of their plugs; on a model they lie down on the surface under the pointer and hang on
// that link from then on. The editor runs on its own (a build without a model) or attached to the open mechanism. The
// document holds only choices: outline, holes and domes follow in parts/build.ts.
import * as THREE from 'three';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';
import type {StudioDocument} from './studio-model';
import {parts,partGroups,boxPart} from './parts/catalog';
import type {Part} from './parts/catalog';
import {generators,generator} from './parts/generators';
import {newBuild,modelBuild,newItem,newPlateNode,partOf,sheet,footprint,plugRects,issues,snapTo,nearestFree,plateRect,plateOutline,plateHoles,holderGeometry,flipped,liftOf,shopping,standing,buildGeometry,snap,worldOf,reframe,onSurface,partBox,plateBox,holderPiece} from './parts/build';
import type {Build,BuildItem,Free,Issue,PlateNode,Sheet} from './parts/build';
import {solidScad} from './parts/scad';
import JSZip from 'jszip';
import {caseParts,caseBlockers,defaultCase} from './parts/case';
import {solveBuild,surfacePoints,axisLever} from './parts/layout';
import {unheld,DEFAULT_LOAD,designLoad} from './parts/net';
import {massOf} from './parts/catalog';
import type {Prim} from '../structure/sdf';
import type {Frame,V} from './kinematics/math';
import {compose,axisAngle} from './kinematics/math';
import type {Mechanism} from './kinematics/model';
import type {Assets,Drive} from './kinematics/drive';
import {hull,modelHits} from './kinematics/drive';
import {separation} from './graph/space';
import type {GripOptions} from './studio-mechanism';
import {TrainEditor} from './studio-train';
import {newTrain} from './parts/train';
import type {Demo} from './demos';

/** A point on the model in the mechanism's coordinates. */
export type Surface={point:V;normal:V;body:string;distance:number};
export type BuildHost={doc:()=>StudioDocument;change:(edit:()=>void,message:string)=>void;status:(text:string)=>void;leave:()=>void;fit:()=>void;canvas:()=>HTMLCanvasElement;
 /** The pointer's ray in the view. */ray:(e:{clientX:number;clientY:number})=>THREE.Raycaster;orbit:(on:boolean)=>void;
 /** The open mechanism: frames of its links as shown, the surface under a ray, what a collision check needs. */frames:()=>Record<string,Frame>;surface:(ray:THREE.Raycaster)=>Surface|undefined;model:()=>{m:Mechanism;drives:Drive[];assets:Assets}|undefined;
 /** Link frames over every axis' way. */range:()=>Promise<{axis:string;value:number;frames:Record<string,Frame>}[]>;
 /** The gizmo on a handle (undefined: off it); whether it is held. */grip:(o:THREE.Object3D|undefined,options?:GripOptions)=>void;dragging:()=>boolean;
 /** A finished train or block becomes a mechanism. */adopt:(d:Demo)=>void;};
type Drag={item?:BuildItem;plate?:PlateNode;isNew:boolean;offset:[number,number];moved:boolean;over:boolean;start:[number,number]};
const el=<K extends keyof HTMLElementTagNameMap>(tag:K,props:Record<string,unknown>={},...children:(Node|string)[]):HTMLElementTagNameMap[K]=>{const e=document.createElement(tag);Object.assign(e,props);e.append(...children);return e;};
const heading=(text:string)=>el('h2',{textContent:text});
const mm=(n:number)=>n.toFixed(Math.abs(n-Math.round(n))<.05?0:1);
const matrix=(f:Frame)=>new THREE.Matrix4().compose(new THREE.Vector3(...f.position),new THREE.Quaternion(...f.rotation),new THREE.Vector3(1,1,1));
const place=(o:THREE.Object3D,f:Frame)=>{o.position.set(...f.position);o.quaternion.set(...f.rotation);};
const shapes=new Map<string,Promise<THREE.BufferGeometry>>();
/** A part's model, loaded once and shared by all its copies. */
function modelOf(url:string){let g=shapes.get(url);if(!g){g=new STLLoader().loadAsync(url).then(x=>{x.computeVertexNormals();return x;});shapes.set(url,g);}return g;}
/** A holder's solid in the view: the same prim that goes to the printer. */
function primMesh(s:Prim){
 const material=new THREE.MeshStandardMaterial({color:0xa4b1bb,roughness:.7});let geometry:THREE.BufferGeometry;
 if(s.kind==='cylinder')geometry=new THREE.CylinderGeometry(s.r,s.r,s.z1-s.z0,28).rotateX(Math.PI/2).translate(0,0,(s.z0+s.z1)/2);
 else if(s.kind==='box')geometry=new THREE.BoxGeometry(...s.half.map(v=>2*v) as [number,number,number]);
 else if(s.kind==='slab')geometry=new THREE.ExtrudeGeometry(new THREE.Shape(s.points.map(([x,y])=>new THREE.Vector2(x,y))),{depth:s.z1-s.z0,bevelEnabled:false}).translate(0,0,s.z0);
 else return undefined;
 const m=new THREE.Mesh(geometry,material);place(m,s.frame);return m;
}
type NumberField=(l:string,v:number,w:(n:number)=>void,s?:string)=>HTMLElement;
type SelectField=(l:string,v:string,o:[string,string][],w:(v:string)=>void)=>HTMLElement;

export class BuildEditor{
 /** Stands in the z-up root, among the mechanism. */
 readonly group=new THREE.Group();
 /** What the view's gizmo holds when a free part or a plate is selected. */
 readonly gizmo=new THREE.Object3D();
 activeId?:string;
 private attachedTo?:string;private selected?:string;private plateId?:string;private drag?:Drag;private filter='';private loaded=new Map<string,THREE.BufferGeometry>();private fitNext=false;
 /** Things that hang on a link, to follow it while the mechanism moves. */
 private followers:{object:THREE.Object3D;free:Free}[]=[];
 private sweepText='';private showCase=false;
 /** The tree-and-net carrier of the open build: choices, the running job, the last result and what it was made from. */
 private net={bracing:1,load:DEFAULT_LOAD,state:'' as ''|'running'|'done'|'error',text:'',key:'',positions:undefined as Float32Array|undefined,stl:undefined as Uint8Array|undefined,worker:undefined as Worker|undefined};
 private netKey(b:Build){return JSON.stringify([b.items,b.plates,b.parts.length]);}
 private custom={label:'Mein Teil',length:40,width:30,height:15,x:34,y:24,d:3};
 private trains:TrainEditor;
 constructor(private host:BuildHost){this.gizmo.userData.buildGizmo=true;this.group.add(this.gizmo);this.trains=new TrainEditor({build:()=>this.build(),change:host.change,status:host.status,leave:host.leave,canvas:host.canvas,ray:host.ray,root:()=>this.group,orbit:host.orbit,adopt:host.adopt});this.trains.onChange=()=>this.refresh();}
 private get isTrain(){return !!this.build()?.train;}
 /** A build on its own is open (a mechanism's parts come along with the mechanism). */
 get active(){return !!this.activeId&&!!this.build();}
 get attached(){return !!this.attachedTo;}
 /** Something of the attached parts is selected: the properties are ours. */
 get holdsProperties(){return this.active||this.attached&&(!!this.selected||!!this.plateId);}
 private build(){const builds=this.host.doc().builds;return this.activeId?builds?.find(b=>b.id===this.activeId):this.attachedTo?builds?.find(b=>b.mechanism===this.attachedTo):undefined;}
 /** The build as seen while dragging: with the held part where it is held. */
 private shown():Build|undefined{const b=this.build(),d=this.drag;if(!d?.over)return b;const base=b??modelBuild('neu',this.attachedTo??'');return {...base,items:d.item?[...base.items.filter(i=>i.id!==d.item!.id),d.item]:base.items,plates:d.plate?[...base.plates.filter(p=>p.id!==d.plate!.id),d.plate]:base.plates};}
 enter(id:string){this.net.worker?.terminate();this.net={...this.net,state:'',text:'',key:'',positions:undefined,stl:undefined,worker:undefined};this.activeId=id;this.attachedTo=undefined;this.selected=undefined;this.trains.reset();this.plateId=this.build()?.plates[0]?.id;const b=this.build();this.fitNext=!!b&&(b.items.length>0||b.plates.length>0||!!b.train?.wheels.length);}
 attach(id:string|undefined){if(this.attachedTo===id)return;this.attachedTo=id;this.selected=undefined;this.plateId=undefined;}
 exit(){this.activeId=undefined;this.attachedTo=undefined;this.selected=undefined;this.plateId=undefined;this.drag=undefined;this.host.grip(undefined);this.clear();}
 private clear(){this.followers=[];for(const o of [...this.group.children]){if(o===this.gizmo)continue;this.group.remove(o);o.traverse(c=>{if((c instanceof THREE.Mesh||c instanceof THREE.LineLoop)&&!c.userData.shared)c.geometry.dispose();});}}

 // ---------- view ----------
 refresh(){
  this.clear();const b=this.shown();if(!b){this.gizmoOff();return;}
  if(b.train){this.gizmoOff();this.trains.draw(this.group);if(this.fitNext&&b.train.wheels.length){this.fitNext=false;this.host.fit();}return;}
  const frames=this.host.frames(),found=this.allIssues(b),bad=new Set(found.flatMap(x=>x.items));
  for(const n of b.plates){const g=new THREE.Group();g.userData.plate=n.id;place(g,worldOf(n.free,frames));this.followers.push({object:g,free:n.free});this.drawSheet(g,sheet(b,n.id),n,bad);this.group.add(g);}
  for(const i of b.items){if(!i.free)continue;const p=partOf(b,i),g=new THREE.Group();place(g,worldOf(i.free,frames));this.followers.push({object:g,free:i.free});g.add(this.partObject(p,i));this.group.add(g);
   if(p.body>0&&i.holder.kind!=='none'){const seat=holderPiece(b,i),under=new THREE.Group();under.position.z=-liftOf(i);for(const s of holderGeometry(seat,seat.items[0]).solids){const m=primMesh(s);if(m)under.add(m);}g.add(under);}
   const q=partBox(p,{position:[0,0,0],rotation:[0,0,0,1]}),box=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(...q.half.map(v=>2*v) as [number,number,number])),new THREE.LineBasicMaterial({color:bad.has(i.id)?0xff5a55:i.id===this.selected?0xffffff:0x63cbb3}));box.position.set(...q.center);g.add(box);}
  const zone=b.items.find(i=>i.id===this.selected&&i.free&&i.wish)?.wish;if(zone){const m=new THREE.Mesh(new THREE.SphereGeometry(zone.size[0],24,16),new THREE.MeshBasicMaterial({color:0x7fb6ff,wireframe:true,transparent:true,opacity:.25}));m.position.set(...zone.center as [number,number,number]);this.group.add(m);}
  if(this.active&&this.net.positions&&this.net.key===this.netKey(b)){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(this.net.positions,3));g.computeVertexNormals();const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:0xc58a4a,roughness:.6,side:THREE.DoubleSide}));m.userData.net=true;this.group.add(m);}
  this.syncGizmo();
  if(this.fitNext){this.fitNext=false;this.host.fit();}
 }
 /** Test entry: where the first thing that hangs on a link stands. */
 followerAt(){const f=this.followers.find(x=>x.free.body);return f?.object.position.toArray();}
 /** Moves what hangs on links with them: the frames change with every slider step. */
 follow(){if(!this.attachedTo||!this.followers.length)return;const frames=this.host.frames();for(const f of this.followers)if(f.free.body)place(f.object,worldOf(f.free,frames));}
 private partObject(p:Part,i:BuildItem){const holder=new THREE.Group();holder.userData.item=i.id;const material=new THREE.MeshStandardMaterial({color:p.color,roughness:.55,metalness:.15}),geometry=p.mesh?this.loaded.get(p.mesh):undefined;
  if(geometry){const m=new THREE.Mesh(geometry,material);m.userData.shared=true;holder.add(m);}
  else{const size=p.box.max.map((v,k)=>v-p.box.min[k]) as [number,number,number],m=new THREE.Mesh(new THREE.BoxGeometry(...size),material);m.position.set(...p.box.min.map((v,k)=>v+size[k]/2) as [number,number,number]);holder.add(m);
   if(p.mesh)void modelOf(p.mesh).then(g=>{this.loaded.set(p.mesh!,g);this.refresh();}).catch(()=>this.host.status(`Modell fehlt: ${p.label}`));}
  return holder;}
 private drawSheet(root:THREE.Group,b:Sheet,n:PlateNode,bad:Set<string>){
  const t=n.thickness,rect=plateRect(b),shape=new THREE.Shape(plateOutline(b).map(([x,y])=>new THREE.Vector2(x,y)));
  const round=(x:number,y:number,r:number)=>{const h=new THREE.Path();h.absarc(x,y,r,0,2*Math.PI,true);shape.holes.push(h);};
  const inside=(x:number,y:number,r:number)=>x-r>rect.x0&&x+r<rect.x1&&y-r>rect.y0&&y+r<rect.y1;
  for(const h of plateHoles(b))if(inside(h.at[0],h.at[1],h.d/2))round(h.at[0],h.at[1],h.d/2);
  const solids:Prim[]=[];for(const i of b.items){const g=holderGeometry(b,i);solids.push(...g.solids);for(const p of g.holes)if(p.kind==='cylinder'&&p.z0<-t&&p.z1>0&&inside(p.frame.position[0],p.frame.position[1],p.r))round(p.frame.position[0],p.frame.position[1],p.r);}
  const plate=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:t,bevelEnabled:false,curveSegments:32}),new THREE.MeshStandardMaterial({color:0x8d9aa5,metalness:.1,roughness:.7}));plate.position.z=-t;root.add(plate);
  for(const s of solids){const m=primMesh(s);if(m)root.add(m);}
  if(this.showCase&&b.items.length&&!caseBlockers(b).length){const c=caseParts(b,b.plate.housing);for(const s of [...c.base.solids.slice(1,5),...c.lid.solids.slice(0,1)]){const m=primMesh(s);if(m){(m.material as THREE.MeshStandardMaterial).transparent=true;(m.material as THREE.MeshStandardMaterial).opacity=.22;(m.material as THREE.MeshStandardMaterial).depthWrite=false;root.add(m);}}}
  for(const i of b.items){const p=partOf(b,i),holder=this.partObject(p,i);
   holder.position.set(i.at[0],i.at[1],i.side==='top'?liftOf(i):-t-liftOf(i));holder.rotation.set(flipped(p,i)?Math.PI:0,0,0);holder.rotateOnWorldAxis(new THREE.Vector3(0,0,1),i.angle*Math.PI/180);root.add(holder);
   const z=(i.side==='top'?.15:-t-.15),line=(pts:[number,number][],color:number)=>{const l=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts.map(([x,y])=>new THREE.Vector3(x,y,z))),new THREE.LineBasicMaterial({color}));root.add(l);};
   line(footprint(p,i).corners,bad.has(i.id)?0xff5a55:i.id===this.selected?0xffffff:0x63cbb3);
   if(i.wish?.mode==='zone'&&i.id===this.selected){const w=i.wish,[x,y]=w.center,[a,c]=w.size.map(v=>v/2);line([[x-a,y-c],[x+a,y-c],[x+a,y+c],[x-a,y+c]],0x7fb6ff);}
   for(const c of plugRects(p,i)){const s=new THREE.Shape(c.rect.corners.map(([x,y])=>new THREE.Vector2(x,y))),m=new THREE.Mesh(new THREE.ShapeGeometry(s),new THREE.MeshBasicMaterial({color:0xffb347,transparent:true,opacity:.28,side:THREE.DoubleSide,depthWrite:false}));m.position.z=z;root.add(m);}}
 }
 /** The selected free thing carries the gizmo. */
 private gizmoTarget(){const b=this.build();return b?.items.find(i=>i.id===this.selected&&i.free)?.free??(this.selected?undefined:b?.plates.find(p=>p.id===this.plateId)?.free);}
 private gizmoOff(){this.host.grip(undefined);}
 private syncGizmo(){const free=this.gizmoTarget();if(!free||this.drag){this.gizmoOff();return;}if(this.host.dragging())return;place(this.gizmo,worldOf(free,this.host.frames()));this.gizmo.updateMatrixWorld(true);this.host.grip(this.gizmo,{mode:'translate',step:1,angle:15,space:'local'});}
 /** The gizmo moved: the document follows live, the Studio keeps the undo step. */
 onDrag(){const free=this.gizmoTarget();if(!free)return;const world:Frame={position:this.gizmo.position.toArray() as V,rotation:this.gizmo.quaternion.toArray() as Frame['rotation']},next=reframe({frame:world},free.body,this.host.frames());free.frame=next.frame;this.refresh();}

 // ---------- pointer ----------
 /** World-free: the pointer's ray in the root's terms. */
 private rootRay(e:{clientX:number;clientY:number}){const ray=this.host.ray(e);this.group.updateWorldMatrix(true,false);return ray.ray.clone().applyMatrix4(this.group.matrixWorld.clone().invert());}
 /** What lies under the pointer: a plate (its coordinates), a surface of the model, or the floor. */
 private locate(e:{clientX:number;clientY:number},b:Build){
  const ray=this.rootRay(e),frames=this.host.frames(),surface=this.host.surface(this.host.ray(e));let best:{plate:string;at:[number,number];distance:number}|undefined;
  for(const n of b.plates){const r=ray.clone().applyMatrix4(matrix(worldOf(n.free,frames)).invert()),hit=r.intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1),0),new THREE.Vector3());if(!hit)continue;const q=plateRect(sheet(b,n.id)),grow=n.mode==='auto'?80:0;if(hit.x<q.x0-grow||hit.x>q.x1+grow||hit.y<q.y0-grow||hit.y>q.y1+grow)continue;const distance=hit.distanceTo(r.origin);if(!best||distance<best.distance)best={plate:n.id,at:[hit.x,hit.y],distance};}
  if(best&&(!surface||best.distance<surface.distance))return best;
  if(surface)return {surface};
  const floor=ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1),0),new THREE.Vector3());return floor?{surface:{point:floor.toArray() as V,normal:[0,0,1] as V,body:'',distance:0}}:undefined;
 }
 private itemAt(ray:THREE.Raycaster){this.group.updateWorldMatrix(true,true);let o:THREE.Object3D|null|undefined=ray.intersectObjects(this.group.children,true)[0]?.object;while(o&&!o.userData.item)o=o.parent;return o?.userData.item as string|undefined;}
 hover(ray:THREE.Raycaster){return this.isTrain?this.trains.hover(ray,this.group):!!this.itemAt(ray);}
 /** True if the press belongs to a part. A press beside it in a mechanism goes on to the mechanism. */
 pointerDown(e:PointerEvent,ray:THREE.Raycaster){
  if(this.isTrain){this.trains.pointerDown(e,ray,this.group);return true;}
  const b=this.build(),id=this.itemAt(ray),i=b?.items.find(x=>x.id===id),was=this.selected;this.selected=id;if(id)this.plateId=undefined;else if(this.attached)this.plateId=undefined;
  if(!i){if(this.attached&&!was)return false;this.host.leave();return !this.attached;}
  this.renderProperties();this.refresh();
  let offset:[number,number]=[0,0];if(i.plate){const n=b!.plates.find(p=>p.id===i.plate)!,r=this.rootRay(e).applyMatrix4(matrix(worldOf(n.free,this.host.frames())).invert()),at=r.intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1),0),new THREE.Vector3());if(at)offset=[i.at[0]-at.x,i.at[1]-at.y];}
  this.host.orbit(false);this.drag={item:structuredClone(i),isNew:false,offset,moved:false,over:true,start:[e.clientX,e.clientY]};this.track();return true;
 }
 private startNew(part:Part,e:PointerEvent){this.drag={item:newItem('t-'+crypto.randomUUID().slice(0,8),part,[0,0]),isNew:true,offset:[0,0],moved:false,over:false,start:[e.clientX,e.clientY]};this.track();}
 private startPlate(e:PointerEvent){this.drag={plate:newPlateNode('platte-'+crypto.randomUUID().slice(0,6)),isNew:true,offset:[0,0],moved:false,over:false,start:[e.clientX,e.clientY]};this.track();}
 private track(){
  const move=(e:PointerEvent)=>this.dragMove(e),up=(e:PointerEvent)=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);this.dragEnd(e);};
  window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
 }
 private dragMove(e:PointerEvent){
  const d=this.drag;if(!d)return;const b=this.shown()??modelBuild('neu',this.attachedTo??'');if(Math.hypot(e.clientX-d.start[0],e.clientY-d.start[1])>3)d.moved=true;if(!d.moved)return;
  d.over=!d.isNew||document.elementFromPoint(e.clientX,e.clientY)===this.host.canvas();if(!d.over){this.refresh();return;}
  if(d.plate){const s=this.locate(e,{...b,plates:b.plates.filter(p=>p.id!==d.plate!.id)});if(s&&'surface' in s)d.plate.free=reframe({frame:onSurface({...parts[0],body:1},s.surface!.point,s.surface!.normal,d.plate.thickness)},s.surface!.body||undefined,this.host.frames());this.refresh();return;}
  const s=this.locate(e,b),i=d.item!;if(!s)return;
  if('plate' in s&&s.plate){if(partOf(b,i).mount==='support')return;const wish:[number,number]=[s.at[0]+d.offset[0],s.at[1]+d.offset[1]],on=i.plate===s.plate;i.plate=s.plate;delete i.free;if(!on&&i.holder.kind==='none')i.holder=newItem('',partOf(b,i),[0,0]).holder;const flat=sheet({...b,items:b.items.filter(x=>x.id!==i.id)},s.plate);i.at=e.altKey?wish:snapTo(flat,i,wish);}
  else if('surface' in s){const p=partOf(b,i),f=s.surface!;delete i.plate;i.free=reframe({frame:onSurface(p,f.point,f.normal,liftOf(i),i.angle)},f.body||undefined,this.host.frames());}
  this.refresh();
 }
 private dragEnd(e:PointerEvent){
  const d=this.drag,b=this.build();this.drag=undefined;this.host.orbit(true);if(!d)return;
  if(d.isNew&&!d.moved){this.placeByClick(d,b);d.over=true;}
  if(!d.moved&&!d.isNew||!d.over){this.refresh();return;}
  if(d.plate){const plate=d.plate;this.plateId=plate.id;this.selected=undefined;this.host.change(()=>{this.ensure().plates.push(plate);},'Bodenplatte platziert.');return;}
  const item=d.item!,before=b?.items.find(i=>i.id===item.id);if(item.wish?.mode==='auto')delete item.wish;else if(item.wish?.mode==='zone'&&before){if(item.free){item.wish.center=[...worldOf(item.free,this.host.frames()).position];}else if(item.plate===before.plate){item.wish.center=[item.wish.center[0]+item.at[0]-before.at[0],item.wish.center[1]+item.at[1]-before.at[1]];}}
  const flat=b&&item.plate?sheet({...b,items:b.items.filter(i=>i.id!==item.id&&!i.wish)},item.plate):undefined,wish=[...item.at],at=flat&&!e.altKey?nearestFree(flat,item):item.at,label=partOf(b??{parts:[]},item).label,pushed=at[0]!==wish[0]||at[1]!==wish[1],where=item.free?.body?` an ${item.free.body}`:'';
  this.selected=item.id;this.plateId=undefined;this.host.change(()=>{const x=this.ensure(),next={...item,at};if(d.isNew)x.items.push(next);else x.items=x.items.map(y=>y.id===item.id?next:y);solveBuild(x);},pushed?`${label}: war belegt, auf den nächsten freien Platz gesetzt.`:d.isNew?`${label} platziert${where}.`:`${label} verschoben${where}.`);
 }
 /** A click in the store: the middle of the plate, or the floor. */
 private placeByClick(d:Drag,b:Build|undefined){const n=b?.plates.find(p=>p.id===this.plateId)??b?.plates[0];
  if(!d.item)return;if(b&&n){const r=plateRect(sheet(b,n.id));d.item.plate=n.id;d.item.at=[snap((r.x0+r.x1)/2,b.grid),snap((r.y0+r.y1)/2,b.grid)];}else d.item.free={frame:{position:[0,0,liftOf(d.item)],rotation:[0,0,0,1]}};}
 /** The build that takes a new thing: a mechanism's own is made with its first part. */
 private ensure(){let x=this.build();if(!x){const d=this.host.doc();x=modelBuild('teile-'+crypto.randomUUID().slice(0,8),this.attachedTo!);d.builds=[...(d.builds??[]),x];}return x;}
 /** Keys of the view: R turns the selection, Entf removes it. */
 key(e:KeyboardEvent){if(this.isTrain)return this.trains.key(e);if(!this.selected)return false;if(e.key==='r'||e.key==='R'){this.turn(e.shiftKey?-90:90);return true;}if(e.key==='Delete'){this.removeItem();return true;}return false;}
 private turn(by:number){const id=this.selected!;this.host.change(()=>{const i=this.build()!.items.find(x=>x.id===id);if(!i)return;i.angle=(i.angle+by+360)%360;if(i.free)i.free.frame=compose(i.free.frame,{position:[0,0,0],rotation:axisAngle([0,0,1],by)});},'Teil gedreht');}
 private removeItem(){const id=this.selected!;this.selected=undefined;this.host.change(()=>{const x=this.build()!;x.items=x.items.filter(i=>i.id!==id);},'Teil entfernt');}

 // ---------- checks in space ----------
 private ownerOf(b:Build,i:BuildItem){return i.free?i.free.body:b.plates.find(p=>p.id===i.plate)?.free.body;}
 /** Parts against each other and the model at the given frames. */
 private spaceIssues(b:Build,frames:Record<string,Frame>):Issue[]{
  const out:Issue[]=[],ctx=this.attachedTo?this.host.model():undefined,placed=b.items.map(i=>{const p=partOf(b,i),q=partBox(p,standing(b,i,frames));return {i,p,h:hull(q.frame,q.center,q.half)};});
  placed.forEach((a,n)=>{
   for(const c of placed.slice(n+1)){if(a.i.plate&&a.i.plate===c.i.plate)continue;const gap=Math.max(a.i.clearance,c.i.clearance);if(separation(a.h,c.h)<gap)out.push({kind:'body',items:[a.i.id,c.i.id],message:`${a.p.label} und ${c.p.label}: unter ${gap} mm Abstand.`});}
   for(const n2 of b.plates){if(a.i.plate===n2.id)continue;const q=plateBox(b,n2,worldOf(n2.free,frames));if(separation(a.h,hull(q.frame,q.center,q.half))<0)out.push({kind:'body',items:[a.i.id],message:`${a.p.label} steckt in einer Bodenplatte.`});}
   if(ctx)for(const link of modelHits(ctx.m,ctx.drives,a.h,this.ownerOf(b,a.i),ctx.assets,frames))out.push({kind:'model',items:[a.i.id],message:`${a.p.label} steckt in ${link}.`});});
  return out;}
 private allIssues(b:Build){const planar=b.plates.flatMap(n=>issues(sheet(b,n.id)));try{return [...planar,...this.spaceIssues(b,this.host.frames())];}catch{return planar;}}
 /** The same over the whole way of every axis: a part must fit in every pose. */
 private async sweep(){
  const b=this.build();if(!b)return;this.sweepText='Fahrweg wird geprüft …';this.renderProperties();const seen=new Map<string,{axis:string;at:number[]}>();
  try{for(const pose of await this.host.range())for(const x of this.spaceIssues(b,pose.frames)){const c=seen.get(x.message)??{axis:pose.axis,at:[]};c.at.push(Math.round(pose.value));seen.set(x.message,c);}
   this.sweepText=seen.size?[...seen].map(([m,c])=>`${m} (${c.axis} bei ${c.at.slice(0,4).join(', ')}${c.at.length>4?' …':''})`).join(' · '):'✓ Über den ganzen Fahrweg frei.';}catch(e){this.sweepText=`Fahrweg nicht geprüft: ${e}`;}
  this.renderProperties();this.host.status(this.sweepText);
 }

 // ---------- explorer ----------
 /** The builds that stand alone, whatever mode the Studio is in. */
 renderList(root:HTMLElement){
  root.append(el('div',{className:'tree-group',textContent:'Aufbauten'}));
  for(const b of this.host.doc().builds??[]){if(b.mechanism)continue;const open=el('button',{textContent:`▦ ${b.label}`});open.dataset.build=b.id;open.setAttribute('aria-selected',String(this.activeId===b.id));open.onclick=()=>{this.enter(b.id);this.host.leave();};root.append(el('div',{className:'tree-row'},open));}
  const gear=el('button',{textContent:'＋ Neues Getriebe',className:'primary'});gear.dataset.newTrain='true';gear.onclick=()=>{const id='getriebe-'+crypto.randomUUID().slice(0,8),n=(this.host.doc().builds?.filter(b=>b.train).length??0)+1;this.host.change(()=>{const d=this.host.doc();d.builds=[...(d.builds??[]),{...newBuild(id,`Getriebe ${n}`),plates:[],train:newTrain()}];},'Getriebe angelegt: Zahnräder aus dem Store in die Ansicht ziehen.');this.enter(id);this.host.leave();};
  root.append(gear);
  const open=el('button',{textContent:'＋ Neuer Aufbau (frei im Raum)',className:'primary'});open.dataset.newFree='true';open.onclick=()=>{const id='aufbau-'+crypto.randomUUID().slice(0,8),n=(this.host.doc().builds?.filter(b=>!b.mechanism).length??0)+1;this.host.change(()=>{const d=this.host.doc();d.builds=[...(d.builds??[]),{...newBuild(id,`Aufbau ${n}`),plates:[]}];},'Aufbau angelegt: Teile in den Raum ziehen, mit dem Griff anheben, dann die Struktur erzeugen.');this.enter(id);this.host.leave();};
  root.append(open);
  const add=el('button',{textContent:'＋ Neuer Aufbau (Bodenplatte)',className:'primary'});add.dataset.newBuild='true';add.onclick=()=>{const id='aufbau-'+crypto.randomUUID().slice(0,8),n=(this.host.doc().builds?.filter(b=>!b.mechanism).length??0)+1;this.host.change(()=>{const d=this.host.doc();d.builds=[...(d.builds??[]),newBuild(id,`Aufbau ${n}`)];},'Aufbau angelegt: Teile aus dem Store auf die Platte ziehen.');this.enter(id);this.host.leave();};
  root.append(add);
 }
 renderTree(root:HTMLElement){
  const back=el('button',{textContent:'← Zurück'});back.onclick=()=>{this.exit();this.host.leave();};root.append(back,el('div',{className:'tree-group',textContent:this.build()?.label??''}));this.renderParts(root);
 }
 /** Plates, parts and the store: on its own, or below the mechanism's tree. */
 renderParts(root:HTMLElement){
  if(this.isTrain){this.trains.renderTree(root);return;}
  const b=this.build();if(this.attached)root.append(el('div',{className:'tree-group',textContent:'Teile am Modell'}));
  const pick=(item?:string,plate?:string)=>{this.selected=item;this.plateId=plate;this.refresh();this.host.leave();};
  if(this.active){const row=el('button',{textContent:'🕸 Übersicht & Baum-Netz'});row.dataset.overview='true';row.setAttribute('aria-selected',String(!this.selected&&!this.plateId));row.onclick=()=>pick();root.append(el('div',{className:'tree-row'},row));}
  for(const n of b?.plates??[]){const row=el('button',{textContent:'▭ Bodenplatte'});row.dataset.plate=n.id;row.setAttribute('aria-selected',String(!this.selected&&this.plateId===n.id));row.onclick=()=>pick(undefined,n.id);root.append(el('div',{className:'tree-row'},row));}
  for(const i of b?.items??[]){const row=el('button',{textContent:`  ${partOf(b!,i).label}${i.free?.body?` → ${i.free.body}`:''}`,className:'tree-sub'});row.dataset.item=i.id;row.setAttribute('aria-selected',String(this.selected===i.id));row.onclick=()=>pick(i.id);root.append(el('div',{className:'tree-row'},row));}
  root.append(el('div',{className:'tree-group',textContent:'Teile-Store'}));
  const filter=el('input',{type:'search',placeholder:'Teil suchen',value:this.filter});filter.id='part-filter';filter.setAttribute('aria-label','Teile suchen');
  const list=el('div',{className:'part-store'});filter.oninput=()=>{this.filter=filter.value;this.fillStore(list);};root.append(filter,list);this.fillStore(list);
  const c=this.custom,form=el('details',{className:'templates'},el('summary',{textContent:'Eigenes Teil aus Maßen'}));
  const field=(label:string,key:'length'|'width'|'height'|'x'|'y'|'d')=>{const input=el('input',{type:'number',step:'0.1',value:String(c[key])});input.dataset.custom=key;input.onchange=()=>{c[key]=Number(input.value);};return el('label',{},label,input);};
  const name=el('input',{type:'text',value:c.label});name.dataset.custom='label';name.oninput=()=>{c.label=name.value;};
  const make=el('button',{textContent:'Teil anlegen'});make.dataset.customMake='true';make.onclick=()=>{const label=c.label.trim();if(!label||!(c.length>0&&c.width>0&&c.height>0)){this.host.status('Teil braucht Name, Länge, Breite und Höhe.');return;}const holes=c.d>0&&c.x>0&&c.y>0?[[-c.x/2,-c.y/2],[c.x/2,-c.y/2],[c.x/2,c.y/2],[-c.x/2,c.y/2]].map(at=>({at:at as [number,number],d:c.d})):[];const part={...boxPart({id:'eigen-'+crypto.randomUUID().slice(0,8),label,group:'Eigene Teile',size:[c.length,c.width],height:c.height,holes,source:'Eigene Maße'}),checked:true};this.host.change(()=>{this.ensure().parts.push(part);},`${label} steht im Store.`);};
  form.append(el('label',{},'Name',name),field('Länge [mm]','length'),field('Breite [mm]','width'),field('Höhe [mm]','height'),field('Lochabstand X [mm]','x'),field('Lochabstand Y [mm]','y'),field('Loch-Ø [mm] (0: keine)','d'),make);root.append(form);
 }
 private fillStore(list:HTMLElement){
  list.replaceChildren();const q=this.filter.toLowerCase(),b=this.build(),all=[...parts,...(b?.parts??[])].filter(p=>!q||`${p.label} ${p.group}`.toLowerCase().includes(q));
  if(!q||'bodenplatte'.includes(q)){const row=el('div',{className:'part-card',title:'Ein Element wie jedes andere: auf eine Fläche ziehen, Teile darauf setzen.'},el('strong',{textContent:'Bodenplatte'}),el('small',{textContent:'Größe und Bohrungen einstellbar'}));row.dataset.storePlate='true';row.onpointerdown=e=>{e.preventDefault();this.startPlate(e);};list.append(row);}
  for(const group of partGroups){const items=all.filter(p=>p.group===group);if(!items.length||group==='Befestigung'&&this.attached)continue;const box=el('details',{open:!!q||!this.attached&&(group==='Controller'||group==='Motoren')},el('summary',{textContent:`${group} (${items.length})`}));
   for(const p of items){const size=p.box.max.map((v,k)=>v-p.box.min[k]),row=el('div',{className:'part-card',title:p.note??`Quelle: ${p.source}`},el('strong',{textContent:`${p.checked?'':'⚠ '}${p.label}`}),el('small',{textContent:`${mm(size[0])} × ${mm(size[1])} × ${mm(size[2])} mm · ${p.holes.length} Löcher`}));row.dataset.part=p.id;row.onpointerdown=e=>{e.preventDefault();this.startNew(p,e);};box.append(row);}
   list.append(box);}
 }

 // ---------- properties ----------
 renderProperties(){
  const root=document.getElementById('properties')!,b=this.build();if(!this.holdsProperties)return;root.replaceChildren();if(!b)return;
  if(b.train){this.trains.renderProperties(root);return;}
  const edit=(message:string,fn:(x:Build)=>void)=>this.host.change(()=>fn(this.build()!),message);
  const number:NumberField=(label,value,write,step='0.5')=>{const input=el('input',{type:'number',step,value:String(Math.round(value*1000)/1000)});input.setAttribute('aria-label',label);input.dataset.field=label;input.onchange=()=>{const n=Number(input.value);if(Number.isFinite(n))write(n);};return el('label',{},label,input);};
  const select:SelectField=(label,value,options,write)=>{const s=el('select');s.dataset.field=label;for(const [v,t] of options)s.add(new Option(t,v));s.value=value;s.onchange=()=>write(s.value);return el('label',{},label,s);};
  const i=b.items.find(x=>x.id===this.selected),n=b.plates.find(p=>p.id===this.plateId);
  if(this.active&&!i){const name=el('input',{type:'text',value:b.label});name.setAttribute('aria-label','Name des Aufbaus');name.onchange=()=>{const v=name.value.trim();if(v)edit('Aufbau umbenannt',x=>{x.label=v;});};root.append(el('label',{},'Name',name));}
  if(i)this.itemPage(root,b,i,number,select,edit);else if(n)this.platePage(root,b,n,number,select,edit);
  if(this.active&&!i)this.netPanel(root,b,number,select);
  const list=shopping(b);if(list.length&&!i){root.append(heading('Stückliste'));for(const l of list)root.append(el('p',{className:'muted',textContent:`${l.count} × ${l.label}`}));}
  root.append(heading('Prüfung'),this.report(this.allIssues(b)));
  if(this.attached){const go=el('button',{textContent:'Über den Fahrweg prüfen'});go.dataset.sweepParts='true';go.onclick=()=>void this.sweep();root.append(go);if(this.sweepText)root.append(el('p',{id:'build-sweep',className:this.sweepText.startsWith('✓')?'state-pass':'state-warn',textContent:this.sweepText}));}
 }
 private report(found:Issue[]){const box=el('div',{id:'build-issues'});if(!found.length)box.append(el('p',{className:'state-pass',textContent:'✓ Nichts überschneidet sich, alle Stecker sind frei.'}));for(const f of found)box.append(el('p',{className:'state-fail',textContent:f.message}));return box;}
 /** Where a free thing hangs, and its numbers; changing the link keeps it where it is in the room. */
 private freeFields(root:HTMLElement,free:Free,number:NumberField,select:SelectField,write:(message:string,fn:(f:Free)=>void)=>void){
  const links=Object.keys(this.host.frames());
  if(links.length)root.append(select('Hängt an',free.body??'',[['','nichts (steht im Raum)'],...links.map(l=>[l,l==='ground'?'Basis':l] as [string,string])],v=>write('Zuordnung geändert',f=>{const next=reframe(f,v||undefined,this.host.frames());f.frame=next.frame;if(v)f.body=v;else delete f.body;})));
  (['X','Y','Z'] as const).forEach((axis,k)=>root.append(number(`${axis} [mm]`,free.frame.position[k],n=>write('Lage geändert',f=>{f.frame.position[k]=n;}),'1')));
  root.append(el('p',{className:'muted',textContent:'Feinjustieren mit dem Griff in der 3D-Ansicht: Verschieben und Drehen in der Werkzeugleiste.'}));
 }
 private itemPage(root:HTMLElement,b:Build,i:BuildItem,number:NumberField,select:SelectField,edit:(m:string,f:(x:Build)=>void)=>void){
  const p=partOf(b,i),set=(message:string,fn:(x:BuildItem)=>void)=>edit(message,x=>{const y=x.items.find(z=>z.id===i.id);if(y)fn(y);});
  root.append(el('h3',{textContent:p.label}),el('p',{className:'muted',textContent:`Quelle: ${p.source}${p.note?` · ${p.note}`:''}`}));
  if(!p.checked)root.append(el('p',{className:'state-warn',textContent:'⚠ Maße von Hand eingetragen, nicht geprüft: vor dem Druck am echten Teil nachmessen.'}));
  root.append(heading('Lage'));this.placeFields(root,b,i,p,number,select,set);
  // With a wish the tool holds the place.
  if(i.wish)void 0;else if(i.free)this.freeFields(root,i.free,number,select,(m,fn)=>set(m,x=>{if(x.free)fn(x.free);}));
  else root.append(number('X [mm]',i.at[0],n=>set('Teil verschoben',x=>{x.at[0]=n;}),'1'),number('Y [mm]',i.at[1],n=>set('Teil verschoben',x=>{x.at[1]=n;}),'1'),number('Drehung [°]',i.angle,n=>set('Teil gedreht',x=>{x.angle=n;}),'15'));
  if(i.plate)root.append(select('Seite',i.side,[['top','Oberseite'],['bottom','Unterseite']],v=>set('Seite geändert',x=>{x.side=v as BuildItem['side'];})));
  root.append(number('Mindestabstand [mm]',i.clearance,n=>set('Abstand geändert',x=>{x.clearance=Math.max(0,n);})));
  root.append(number(`Masse [g]${i.mass===undefined?' (geschätzt)':''}`,i.mass??massOf(p),n=>set('Masse geändert',x=>{x.mass=Math.max(0,n);}),'1'));
  const g=generator(i.holder.kind);
  root.append(heading('Halter'),select('Art',i.holder.kind,generators.filter(x=>x.accepts(p)).map(x=>[x.id,x.label]),v=>set('Halter geändert',x=>{x.holder={kind:v,params:generator(v)!.defaults(p)};})));
  for(const q of g?.params??[])root.append(number(q.label,i.holder.params[q.key]??0,n=>set(`${q.label} geändert`,x=>{x.holder.params[q.key]=Math.max(q.min??0,n);}),String(q.step??.5)));
  if(i.free&&i.holder.kind!=='none'){const stl=el('button',{textContent:'⬇ Halter als Einzelteil (STL)'});stl.dataset.holderStl='true';stl.onclick=()=>this.exportSheet(holderPiece(b,i),`halter-${p.id}`);root.append(stl,el('p',{className:'muted',textContent:'Liegt das Teil auf einem generierten Glied, wächst sein Halter dort in die Struktur ein. Sonst dieses Stück anschrauben oder ankleben.'}));}
  if(p.holes.length){root.append(heading('Löcher des Teils'));p.holes.forEach((h,k)=>{const e=i.holes?.[k],row=el('div',{className:'hole-row'}),on=el('input',{type:'checkbox',checked:!e?.off,title:'Loch verwenden'});on.dataset.hole=String(k);on.onchange=()=>set(on.checked?'Loch aktiv':'Loch weggelassen',x=>{(x.holes??={})[k]={...x.holes?.[k],off:!on.checked};});
    const d=el('input',{type:'number',step:'0.1',value:String(e?.d??h.d)});d.dataset.holeD=String(k);d.setAttribute('aria-label',`Ø von Loch ${k+1}`);d.onchange=()=>set('Lochmaß geändert',x=>{(x.holes??={})[k]={...x.holes?.[k],d:Number(d.value)};});row.append(on,el('span',{textContent:`${k+1}: ${mm(h.at[0])} / ${mm(h.at[1])}`}),d);root.append(row);});}
  if(p.plugs.length&&i.plate){root.append(heading('Stecker frei halten'));for(const label of new Set(p.plugs.map(c=>c.label))){const on=el('input',{type:'checkbox',checked:!i.plugsOff?.includes(label)});on.dataset.plug=label;on.onchange=()=>set('Stecker geändert',x=>{x.plugsOff=on.checked?(x.plugsOff??[]).filter(l=>l!==label):[...(x.plugsOff??[]),label];});root.append(el('label',{className:'check'},on,label));}}
  const turn=el('button',{textContent:'↻ 90°'});turn.dataset.turn='true';turn.onclick=()=>this.turn(90);const remove=el('button',{textContent:'Entfernen',className:'danger'});remove.dataset.remove='true';remove.onclick=()=>this.removeItem();root.append(el('div',{className:'button-row'},turn,remove));
 }
 private platePage(root:HTMLElement,b:Build,n:PlateNode,number:NumberField,select:SelectField,edit:(m:string,f:(x:Build)=>void)=>void){
  const flat=sheet(b,n.id),p=n,r=plateRect(flat),plate=(message:string,fn:(x:PlateNode)=>void)=>edit(message,x=>{const y=x.plates.find(z=>z.id===n.id);if(y)fn(y);});
  root.append(heading('Bodenplatte'));this.freeFields(root,n.free,number,select,(m,fn)=>plate(m,x=>fn(x.free)));
  root.append(select('Größe',p.mode,[['auto','✨ Auto: wächst mit den Teilen'],['fixed','🔒 Fest']],v=>plate('Plattengröße geändert',x=>{x.mode=v as 'auto'|'fixed';x.size=[r.x1-r.x0,r.y1-r.y0];x.center=[(r.x0+r.x1)/2,(r.y0+r.y1)/2];})));
  if(p.mode==='fixed')root.append(number('Breite [mm]',p.size[0],v=>plate('Größe geändert',x=>{x.size[0]=Math.max(10,v);}),'1'),number('Tiefe [mm]',p.size[1],v=>plate('Größe geändert',x=>{x.size[1]=Math.max(10,v);}),'1'),number('Mitte X [mm]',p.center[0],v=>plate('Lage geändert',x=>{x.center[0]=v;}),'1'),number('Mitte Y [mm]',p.center[1],v=>plate('Lage geändert',x=>{x.center[1]=v;}),'1'));
  else root.append(el('p',{className:'muted',textContent:`Aktuell ${mm(r.x1-r.x0)} × ${mm(r.y1-r.y0)} mm.`}),number('Rand um die Teile [mm]',p.margin,v=>plate('Rand geändert',x=>{x.margin=Math.max(0,v);})));
  root.append(number('Dicke [mm]',p.thickness,v=>plate('Dicke geändert',x=>{x.thickness=Math.max(.4,v);})),number('Eckenradius [mm]',p.corner,v=>plate('Ecken geändert',x=>{x.corner=Math.max(0,v);})),
   select('Raster',String(b.grid),[['0','frei'],['0.5','0,5 mm'],['1','1 mm'],['2.5','2,5 mm'],['5','5 mm']],v=>edit('Raster geändert',x=>{x.grid=Number(v);})));
  const corners=el('input',{type:'checkbox',checked:p.mount.on});corners.dataset.corners='true';corners.onchange=()=>plate('Eckbohrungen geändert',x=>{x.mount.on=corners.checked;});
  root.append(heading('Bohrungen'),el('label',{className:'check'},corners,'Eckbohrungen'));
  if(p.mount.on)root.append(number('Ø Eckbohrung [mm]',p.mount.d,v=>plate('Eckbohrung geändert',x=>{x.mount.d=Math.max(.2,v);}),'0.1'),number('Abstand vom Rand [mm]',p.mount.inset,v=>plate('Eckbohrung geändert',x=>{x.mount.inset=Math.max(0,v);})));
  p.holes.forEach(h=>{const row=el('div',{className:'hole-row'}),field=(label:string,value:number,write:(v:number)=>void)=>{const input=el('input',{type:'number',step:'0.5',value:String(value)});input.dataset.plateHole=label;input.setAttribute('aria-label',label);input.onchange=()=>write(Number(input.value));return input;},set=(fn:(y:PlateNode['holes'][number])=>void)=>plate('Bohrung geändert',x=>{const y=x.holes.find(z=>z.id===h.id);if(y)fn(y);}),del=el('button',{textContent:'✕',title:'Bohrung löschen',className:'danger'});del.onclick=()=>plate('Bohrung gelöscht',x=>{x.holes=x.holes.filter(z=>z.id!==h.id);});row.append(field('X',h.at[0],v=>set(y=>{y.at[0]=v;})),field('Y',h.at[1],v=>set(y=>{y.at[1]=v;})),field('Ø',h.d,v=>set(y=>{y.d=Math.max(.2,v);})),del);root.append(row);});
  const add=el('button',{textContent:'＋ Bohrung'});add.dataset.addHole='true';add.onclick=()=>plate('Bohrung hinzugefügt',x=>{x.holes.push({id:'b-'+crypto.randomUUID().slice(0,8),at:[(r.x0+r.x1)/2,(r.y0+r.y1)/2],d:4});});
  const stl=el('button',{textContent:'⬇ Platte als STL',className:'primary'});stl.dataset.plateStl='true';stl.onclick=()=>this.exportSheet(flat,b.label);
  if(b.items.some(i=>i.plate===n.id&&i.wish)){const go=el('button',{textContent:'✨ Plätze neu suchen'});go.dataset.solve='true';go.onclick=()=>edit('Plätze gesucht',x=>{solveBuild(x);});root.append(go);}
  const h=p.housing??defaultCase,housing=(key:keyof typeof defaultCase,v:number)=>plate('Gehäuse geändert',x=>{x.housing={...(x.housing??defaultCase),[key]:v};}),blocked=caseBlockers(flat);
  root.append(heading('Gehäuse'),number('Wand [mm]',h.wall,v=>housing('wall',Math.max(.8,v)),'0.2'),number('Deckel [mm]',h.lid,v=>housing('lid',Math.max(.8,v)),'0.2'),number('Luft über den Teilen [mm]',h.top,v=>housing('top',Math.max(0,v))),number('Passung Deckel [mm]',h.fit,v=>housing('fit',Math.max(0,v)),'0.05'));
  if(blocked.length)root.append(el('p',{className:'state-warn',textContent:`${partOf(flat,blocked[0]).label} passt nicht hinein: Motoren und Teile unter der Platte bleiben draußen.`}));
  const show=el('input',{type:'checkbox',checked:this.showCase});show.dataset.caseShow='true';show.onchange=()=>{this.showCase=show.checked;this.refresh();};const zip=el('button',{textContent:'📦 Gehäuse als ZIP',className:'primary'});zip.dataset.caseZip='true';zip.disabled=!!blocked.length||!flat.items.length;zip.onclick=()=>void this.exportCase(flat,b.label);root.append(el('label',{className:'check'},show,'In der Ansicht zeigen'),zip);
  const drop=el('button',{textContent:'Platte entfernen',className:'danger'});drop.dataset.removePlate='true';drop.onclick=()=>{this.plateId=undefined;edit('Platte entfernt',x=>{x.items=x.items.filter(i=>i.plate!==n.id);x.plates=x.plates.filter(y=>y.id!==n.id);});};root.append(add,stl,drop);
 }
 /** The structure as the carrier: holders become anchors, feet stand under the build. */
 private netPanel(root:HTMLElement,b:Build,number:NumberField,select:SelectField){
  const n=this.net,stale=!!n.positions&&n.key!==this.netKey(b),loose=unheld(b);
  root.append(heading('Baum-Netz als Träger'),el('p',{className:'muted',textContent:'Hält alle Teile und Platten an ihren Haltepunkten, wo sie im Raum stehen. Die Streben weichen Teilen und Steckern aus. Ohne Punkte aus „Befestigung“ im Store entstehen vier Füße darunter.'}),
   select('Struktur',String(n.bracing),[['0','Baum'],['1','leichtes Netz'],['2','dichtes Netz']],v=>{n.bracing=Number(v);}),number('Handlast je Teil [N]',n.load,v=>{n.load=Math.max(.5,v);}));
  if(b.items.length)root.append(el('p',{className:'muted',textContent:`Auslegung: ${b.items.map(i=>`${partOf(b,i).label} ${designLoad(b,i,n.load).toFixed(0)} N`).join(' · ')}`}));
  for(const i of loose)root.append(el('p',{className:'state-warn',textContent:`${partOf(b,i).label} hat keinen Halter und bleibt lose.`}));
  const go=el('button',{textContent:n.state==='running'?'Wird erzeugt …':'🕸 Struktur erzeugen',className:'primary'});go.dataset.netMake='true';go.disabled=n.state==='running'||!b.items.length;go.onclick=()=>this.makeNet();root.append(go);
  const text=stale?'Der Aufbau hat sich geändert: Struktur neu erzeugen.':n.text;if(text)root.append(el('p',{id:'net-report',className:n.state==='error'?'state-fail':stale||n.state==='running'?'muted':'state-pass',textContent:text}));
  if(n.stl&&!stale){const stl=el('button',{textContent:'⬇ Struktur als STL'});stl.dataset.netStl='true';stl.onclick=()=>{const url=URL.createObjectURL(new Blob([n.stl! as BlobPart],{type:'model/stl'})),a=el('a',{href:url,download:`${b.label.replace(/[^\wäöüÄÖÜß-]+/g,'_')}-struktur.stl`});a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};root.append(stl);}
 }
 private makeNet(){
  const b=this.build(),n=this.net;if(!b)return;n.worker?.terminate();n.state='running';n.text='Struktur wird erzeugt …';n.positions=undefined;n.stl=undefined;const key=this.netKey(b),w=new Worker('./mechanics-structure-worker.js');n.worker=w;
  w.onmessage=({data})=>{if(n.worker!==w)return;if(data.type==='progress'){const t=document.getElementById('net-report');n.text=`${data.stage} …`;if(t)t.textContent=n.text;return;}w.terminate();n.worker=undefined;
   if(data.type==='net'){const fails=(data.checks as {state:string;message:string}[]).filter(c=>c.state==='fail');n.state=fails.length?'error':'done';n.positions=data.positions;n.stl=data.stl;n.key=key;const stand=(data.checks as {id:string;message:string}[]).find(c=>c.id==='stand')?.message??'';n.text=fails.length?fails.map(c=>c.message).join(' · '):`${data.report.struts} Streben · ${data.report.mass.toFixed(0)} g · Auslastung ${(data.report.utilisation*100).toFixed(0)} % · Durchbiegung ${data.report.deflection.toFixed(2)} mm · Druck ${data.report.print.label} · ${stand}`;this.host.status('Baum-Netz erzeugt.');}
   else{n.state='error';n.text=String(data.message??'Struktur nicht erzeugt.');this.host.status(n.text);}
   this.refresh();this.renderProperties();};
  w.postMessage({kind:'net',build:b,settings:{bracing:n.bracing,load:n.load}});this.renderProperties();
 }
 /** Fixed, a zone, or open; on a model a zone with a goal. Asking for a place on a plate takes effect at once. */
 private placeFields(root:HTMLElement,b:Build,i:BuildItem,p:Part,number:NumberField,select:SelectField,set:(m:string,f:(x:BuildItem)=>void)=>void){
  const onPlate=!!i.plate,mode=i.wish?.mode??'fixed',solved=(message:string,fn:(x:BuildItem)=>void)=>{let failed:string[]=[];this.host.change(()=>{const x=this.build()!,y=x.items.find(z=>z.id===i.id);if(y)fn(y);failed=solveBuild(x);},message);if(failed.length){const now=this.build()!;this.host.status(`Kein Platz für ${failed.map(id=>{const q=now.items.find(z=>z.id===id);return q?partOf(now,q).label:id;}).join(', ')}: größere Platte oder größerer Bereich.`);}};
  if(!onPlate&&!this.attached)return;
  root.append(select('Platz',mode,onPlate?[['fixed','🔒 Fest'],['zone','↔ Bereich: ungefähr hier'],['auto','✨ Auto: egal wo']]:[['fixed','🔒 Fest'],['zone','↔ Bereich: ungefähr hier']],v=>{if(v==='fixed')solved('Platz fest',x=>{delete x.wish;});else if(v==='auto')solved('Platz automatisch',x=>{x.wish={mode:'auto',center:[],size:[],goal:'middle'};});else if(onPlate)solved('Bereich gesetzt',x=>{x.wish={mode:'zone',center:[...x.at],size:[60,60],goal:'middle'};});else set('Bereich gesetzt',x=>{x.wish={mode:'zone',center:[...worldOf(x.free!,this.host.frames()).position],size:[80],goal:'middle'};});}));
  const w=i.wish;if(!w||w.mode!=='zone')return;
  if(onPlate){(['Mitte X','Mitte Y'] as const).forEach((l,k)=>root.append(number(`${l} [mm]`,w.center[k],n=>solved('Bereich geändert',x=>{x.wish!.center[k]=n;}),'1')));(['Breite','Tiefe'] as const).forEach((l,k)=>root.append(number(`Bereich ${l} [mm]`,w.size[k],n=>solved('Bereich geändert',x=>{x.wish!.size[k]=Math.max(1,n);}),'5')));return;}
  root.append(number('Radius [mm]',w.size[0],n=>set('Bereich geändert',x=>{x.wish!.size[0]=Math.max(5,n);}),'10'),select('Ziel',w.goal,[['middle','möglichst mittig im Bereich'],['axis','kurzer Hebel zu den Achsen (Gewicht)']],v=>set('Ziel geändert',x=>{x.wish!.goal=v as 'middle'|'axis';})));
  const go=el('button',{textContent:'✨ Platz suchen',className:'primary'});go.dataset.findPlace='true';go.onclick=()=>void this.findPlace(i.id,p);root.append(go);
 }
 /** A place on the model in the ball: lying on a surface, free of the rest, in every pose, the best by the goal. */
 private async findPlace(id:string,p:Part){
  const b=this.build(),i=b?.items.find(x=>x.id===id),ctx=this.host.model(),w=i?.wish;if(!b||!i||!ctx||!w)return;this.host.status('Platz wird gesucht …');await new Promise(r=>setTimeout(r));
  const frames=this.host.frames(),points=surfacePoints(ctx.m,ctx.drives,ctx.assets,frames,w.center as V,w.size[0],6),others=b.items.filter(x=>x.id!==id).map(x=>{const q=partBox(partOf(b,x),standing(b,x,frames));return {gap:Math.max(i.clearance,x.clearance),h:hull(q.frame,q.center,q.half)};}),found:{frame:Frame;body:string;score:number;lever:number}[]=[];
  for(const s of points)for(const angle of [0,90]){const frame=onSurface(p,s.point,s.normal,liftOf(i),angle),q=partBox(p,frame),h=hull(q.frame,q.center,q.half);if(others.some(o=>separation(h,o.h)<o.gap)||modelHits(ctx.m,ctx.drives,h,s.body,ctx.assets,frames).length)continue;const lever=axisLever(ctx.m,ctx.drives,frames,s.body,s.point);found.push({frame,body:s.body,lever,score:w.goal==='axis'?lever:Math.hypot(s.point[0]-w.center[0],s.point[1]-w.center[1],s.point[2]-w.center[2])});}
  found.sort((x,y)=>x.score-y.score);const range=await this.host.range();
  // The best places often sit side by side and fail together: spread the tries over the whole list, in order.
  const every=Math.max(1,Math.floor(found.length/80));
  for(const c of found.filter((_,k)=>k%every===0)){const free=reframe({frame:c.frame},c.body,frames),test={...b,items:b.items.map(x=>x.id===id?{...x,free}:x)};if(range.some(r=>this.spaceIssues(test,r.frames).some(x=>x.items.includes(id))))continue;
   this.host.change(()=>{const y=this.build()!.items.find(x=>x.id===id);if(y)y.free=free;},`Platz gefunden an ${c.body}: ${c.lever.toFixed(0)} mm Hebel zu den Achsen.`);return;}
  this.host.status(found.length?'Kein Platz im Bereich, der über den ganzen Fahrweg frei bleibt.':'Kein freier Platz auf dem Modell in diesem Bereich.');
 }
 /** Base and lid as a ZIP of STLs, with what it takes to put it together. */
 private async exportCase(s:Sheet,name:string){
  try{this.host.status('Gehäuse wird erzeugt …');const c=caseParts(s,s.plate.housing),render=(g:{solids:Prim[];holes:Prim[]})=>new Promise<Uint8Array>((resolve,reject)=>{const w=new Worker('./mechanics-render-worker.js');w.onmessage=({data})=>{w.terminate();if(data.error)reject(Error(data.error));else resolve(data.stl);};w.postMessage({source:solidScad(g)});}),[base,lid]=[await render(c.base),await render(c.lid)],z=new JSZip(),safe=name.replace(/[^\wäöüÄÖÜß-]+/g,'_');
   z.file(`${safe}-unterteil.stl`,base);z.file(`${safe}-deckel.stl`,lid);z.file('hinweise.txt',[`${name}: ${c.outer.map(n=>n.toFixed(0)).join(' × ')} mm.`,`Öffnungen: ${c.openings.map(o=>o.label).join(', ')||'keine'}.`,`Der Deckel schnappt mit zwei Haken ein, Dehnung im Haken ${(c.strain*100).toFixed(1)} %. Unterteil mit der Bodenplatte nach unten drucken, den Deckel auf dem Kopf; die Haken stehen dann senkrecht.`,...shopping(s).map(l=>`${l.count} × ${l.label}`)].join('\n'));
   const url=URL.createObjectURL(await z.generateAsync({type:'blob'})),a=el('a',{href:url,download:`${safe}-gehaeuse.zip`});a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);this.host.status(`Gehäuse erzeugt: ${c.outer.map(n=>n.toFixed(0)).join(' × ')} mm, ${c.openings.length} Öffnungen.`);}
  catch(e){this.host.status(`Gehäuse: ${e instanceof Error?e.message:e}`);}
 }
 /** Exact booleans in the render worker: what the printer gets is OpenSCAD's result, not the preview. */
 private exportSheet(s:Sheet,name:string){
  this.host.status('STL wird erzeugt …');const w=new Worker('./mechanics-render-worker.js');
  w.onmessage=({data})=>{w.terminate();if(data.error){this.host.status('STL: '+data.error);return;}const url=URL.createObjectURL(new Blob([data.stl],{type:'model/stl'})),a=el('a',{href:url,download:`${name.replace(/[^\wäöüÄÖÜß-]+/g,'_')}.stl`});a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);this.host.status(`STL erzeugt: ${name}.`);};
  w.postMessage({source:solidScad(buildGeometry(s))});
 }
}
