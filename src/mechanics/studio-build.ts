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
import {newTrain,trainIssues,snapWheel,meshes,ratioOf,DEFAULT_ANGLE,inputsOf,outputsOf,shaftFrames,shaftOfBody} from './parts/train';
import {makeGroup,dissolve,setKind,setTurns,titleOf,moveMember,orderedChildren,parentOf,kindNames,rigidOf,unitOf,contents,childrenOf,moveGroup,centreOf,turnAxis,blockOf,insertBlock,removeGroup,keyOf,memberOf} from './parts/groups';
import type {Block,Member,GroupKind} from './parts/groups';
import {label as wheelLabel} from './studio-train';
import type {Demo} from './demos';

/** A point on the model in the mechanism's coordinates. */
export type Surface={point:V;normal:V;body:string;distance:number};
export type BuildHost={doc:()=>StudioDocument;change:(edit:()=>void,message:string)=>void;status:(text:string)=>void;leave:()=>void;fit:()=>void;canvas:()=>HTMLCanvasElement;
 /** The pointer's ray in the view. */ray:(e:{clientX:number;clientY:number})=>THREE.Raycaster;orbit:(on:boolean)=>void;
 /** The open mechanism: frames of its links as shown, the surface under a ray, what a collision check needs. */frames:()=>Record<string,Frame>;surface:(ray:THREE.Raycaster)=>Surface|undefined;model:()=>{m:Mechanism;drives:Drive[];assets:Assets}|undefined;
 /** Link frames over every axis' way. */range:()=>Promise<{axis:string;value:number;frames:Record<string,Frame>}[]>;
 /** The gizmo on a handle (undefined: off it); whether it is held. */grip:(o:THREE.Object3D|undefined,options?:GripOptions)=>void;dragging:()=>boolean;
 /** A finished train or block becomes the project's mechanism; `consume`: the train's wheels go into it. */adopt:(d:Demo,consume?:boolean)=>void;
 /** Opens the file dialog for a 3D model. */loadModel?:()=>void;
 /** The mode of the view's handle (the toolbar chooses it). */mode?:()=>'translate'|'rotate';
 /** The mechanism derived from the gears (no model in the project): its id, a page of it opened in ③, which page is open,
  * whether its structures are made; something of the parts was picked (the page closes). */derived?:()=>string|undefined;openDerived?:(page:'bearings'|'structure')=>void;derivedPage?:()=>string;derivedDone?:()=>boolean;picked?:()=>void;
 /** The library's own blocks, for every project. */blocks?:()=>readonly Block[];saveBlock?:(b:Block)=>Promise<void>;removeBlock?:(id:string)=>Promise<void>;
 /** The Studio's phase: 1 builds up, 3 makes (printing files, housings, the net). Without one, everything shows. */phase?:()=>number;};
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
 /** The page of the gear train (ratio, drive, into a mechanism) is open. */
 private trainOpen=false;
 /** Several things selected (Strg-click), as group keys; or one group. */
 private multi=new Set<string>();private groupId?:string;
 /** A rigid group dragged by one of its members: the build at the start, the anchor, where the pointer started. */
 private unitDrag?:{unit:string;start:Build;anchor:Member;from:V;moved:boolean;at:[number,number];delta:V;text:string};
 /** The build as a running drag shows it. */
 private preview?:Build;
 /** A group on the handle: the build and the handle's place when the handle was taken. */
 private pivot?:{start:Build;centre:V;axis:'y'|'z'};
 /** The scene tree: folded groups, and what is being dragged in it. */
 private folded=new Set<string>();private layerDrag?:Member;
 constructor(private host:BuildHost){this.gizmo.userData.buildGizmo=true;this.group.add(this.gizmo);this.trains=new TrainEditor({build:()=>this.build(),change:host.change,status:host.status,leave:host.leave,pick:()=>{this.selected=undefined;this.plateId=undefined;this.trainOpen=false;},canvas:host.canvas,ray:host.ray,root:()=>this.group,orbit:host.orbit,adopt:host.adopt,ensure:()=>{const b=this.ensure();return b.train??=newTrain();},mechanism:()=>this.attached,phase:()=>this.host.phase?.()??3,
  unit:w=>{const b=this.build(),id=b?unitOf(b,{kind:'wheel',id:w}):undefined;return b&&id?{id,label:this.groupLabel(id),wheels:new Set(contents(b,id).wheels.map(x=>x.id))}:undefined;},
  moveUnit:(unit,delta,message)=>{const frames=this.frames();this.host.change(()=>{moveGroup(this.build()!,unit,{delta},frames);},message);}});this.trains.onChange=()=>this.refresh();}
 private get wheels(){return !!this.build()?.train?.wheels.length;}
 /** A build on its own is open (a mechanism's parts come along with the mechanism). */
 get active(){return !!this.activeId&&!!this.build();}
 get attached(){return !!this.attachedTo;}
 /** Something of the attached parts is selected: the properties are ours. */
 get holdsProperties(){return this.active||this.attached&&(!!this.selected||!!this.plateId||!!this.trains.selectedId||this.trainOpen||!!this.groupId||this.multi.size>0);}
 /** The wheels' slider under the view (any phase). */
 renderAxes(root:HTMLElement){return this.trains.renderAxes(root);}
 /** A body's name for people: a shaft by its wheel, the mechanism's base, or the link. */
 private bodyName(id:string){const s=shaftOfBody(id);if(s){const w=this.build()?.train?.wheels.find(x=>x.shaft===s);return w?`Welle von ${wheelLabel(w)}`:'Welle';}return id==='ground'?'Basis':id;}
 /** Opens the page of the gear train. */
 openTrain(){this.selected=undefined;this.plateId=undefined;this.trains.select(undefined);this.trainOpen=true;}
 /** Where the mechanism's links and the shafts stand now: a shaft is a body, turned by the inputs. */
 private frames(){const b=this.preview??this.build();return {...this.host.frames(),...shaftFrames(b?.train,this.trains.turnsNow)};}
 private build(){const builds=this.host.doc().builds;return this.activeId?builds?.find(b=>b.id===this.activeId):this.attachedTo?builds?.find(b=>b.mechanism===this.attachedTo):undefined;}
 /** The build as seen while dragging: with the held part where it is held. */
 private shown():Build|undefined{if(this.preview)return this.preview;const b=this.build(),d=this.drag;if(!d?.over)return b;const base=b??modelBuild('neu',this.attachedTo??'');return {...base,items:d.item?[...base.items.filter(i=>i.id!==d.item!.id),d.item]:base.items,plates:d.plate?[...base.plates.filter(p=>p.id!==d.plate!.id),d.plate]:base.plates};}
 enter(id:string){this.net.worker?.terminate();this.net={...this.net,state:'',text:'',key:'',positions:undefined,stl:undefined,worker:undefined};this.activeId=id;this.attachedTo=undefined;this.selected=undefined;this.trainOpen=false;this.multi.clear();this.groupId=undefined;this.trains.reset();this.plateId=this.build()?.plates[0]?.id;const b=this.build();this.fitNext=!!b&&(b.items.length>0||b.plates.length>0||!!b.train?.wheels.length);}
 attach(id:string|undefined){if(this.attachedTo===id)return;this.attachedTo=id;this.multi.clear();this.groupId=undefined;this.selected=undefined;this.plateId=undefined;this.trainOpen=false;this.trains.reset();}
 exit(){this.activeId=undefined;this.attachedTo=undefined;this.selected=undefined;this.plateId=undefined;this.trainOpen=false;this.trains.reset();this.drag=undefined;this.host.grip(undefined);this.clear();}
 private clear(){this.followers=[];for(const o of [...this.group.children]){if(o===this.gizmo)continue;this.group.remove(o);o.traverse(c=>{if((c instanceof THREE.Mesh||c instanceof THREE.LineLoop)&&!c.userData.shared)c.geometry.dispose();});}}

 // ---------- view ----------
 refresh(){
  // Wheels first: one held over the view shows before the build exists.
  const b=this.shown(),lit=this.lit(b);this.clear();this.trains.draw(this.group,lit,this.preview?.train);if(!b){this.gizmoOff();return;}
  const frames=this.frames(),found=this.allIssues(b),bad=new Set(found.flatMap(x=>x.items));
  for(const n of b.plates){const g=new THREE.Group();g.userData.plate=n.id;place(g,worldOf(n.free,frames));this.followers.push({object:g,free:n.free});this.drawSheet(g,sheet(b,n.id),n,bad,lit);this.group.add(g);}
  for(const i of b.items){if(!i.free)continue;const p=partOf(b,i),g=new THREE.Group();place(g,worldOf(i.free,frames));this.followers.push({object:g,free:i.free});g.add(this.partObject(p,i));this.group.add(g);
   if(p.body>0&&i.holder.kind!=='none'){const seat=holderPiece(b,i),under=new THREE.Group();under.position.z=-liftOf(i);for(const s of holderGeometry(seat,seat.items[0]).solids){const m=primMesh(s);if(m)under.add(m);}g.add(under);}
   const q=partBox(p,{position:[0,0,0],rotation:[0,0,0,1]}),box=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(...q.half.map(v=>2*v) as [number,number,number])),new THREE.LineBasicMaterial({color:bad.has(i.id)?0xff5a55:i.id===this.selected||lit.has(i.id)?0xffffff:0x63cbb3}));box.position.set(...q.center);g.add(box);}
  const zone=b.items.find(i=>i.id===this.selected&&i.free&&i.wish)?.wish;if(zone){const m=new THREE.Mesh(new THREE.SphereGeometry(zone.size[0],24,16),new THREE.MeshBasicMaterial({color:0x7fb6ff,wireframe:true,transparent:true,opacity:.25}));m.position.set(...zone.center as [number,number,number]);this.group.add(m);}
  if(this.active&&this.net.positions&&this.net.key===this.netKey(b)){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(this.net.positions,3));g.computeVertexNormals();const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:0xc58a4a,roughness:.6,side:THREE.DoubleSide}));m.userData.net=true;this.group.add(m);}
  this.syncGizmo();
  if(this.fitNext){this.fitNext=false;this.host.fit();}
 }
 /** Ids of what the selection holds, its groups' members included. */
 private lit(b:Build|undefined){const out=new Set<string>();if(!b)return out;for(const k of this.multi){const m=memberOf(k);if(m.kind==='group'){const c=contents(b,m.id);for(const x of [...c.items,...c.plates,...c.wheels])out.add(x.id);}else out.add(m.id);}
  if(this.groupId&&b.groups?.some(g=>g.id===this.groupId)){const c=contents(b,this.groupId);for(const x of [...c.items,...c.plates,...c.wheels])out.add(x.id);}return out;}
 deselect(){this.selected=undefined;this.plateId=undefined;this.trainOpen=false;this.trains.select(undefined);this.multi.clear();this.groupId=undefined;}
 /** Test entry: where the first thing that hangs on a link stands. */
 followerAt(){const f=this.followers.find(x=>x.free.body);return f?.object.position.toArray();}
 /** Moves what hangs on links with them: the frames change with every slider step. */
 follow(){if(!this.followers.some(f=>f.free.body))return;const frames=this.frames();for(const f of this.followers)if(f.free.body)place(f.object,worldOf(f.free,frames));}
 private partObject(p:Part,i:BuildItem){const holder=new THREE.Group();holder.userData.item=i.id;const material=new THREE.MeshStandardMaterial({color:p.color,roughness:.55,metalness:.15}),geometry=p.mesh?this.loaded.get(p.mesh):undefined;
  if(geometry){const m=new THREE.Mesh(geometry,material);m.userData.shared=true;holder.add(m);}
  else{const size=p.box.max.map((v,k)=>v-p.box.min[k]) as [number,number,number],m=new THREE.Mesh(new THREE.BoxGeometry(...size),material);m.position.set(...p.box.min.map((v,k)=>v+size[k]/2) as [number,number,number]);holder.add(m);
   if(p.mesh)void modelOf(p.mesh).then(g=>{this.loaded.set(p.mesh!,g);this.refresh();}).catch(()=>this.host.status(`Modell fehlt: ${p.label}`));}
  return holder;}
 private drawSheet(root:THREE.Group,b:Sheet,n:PlateNode,bad:Set<string>,lit:ReadonlySet<string>=new Set()){
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
   line(footprint(p,i).corners,bad.has(i.id)?0xff5a55:i.id===this.selected||lit.has(i.id)?0xffffff:0x63cbb3);
   if(i.wish?.mode==='zone'&&i.id===this.selected){const w=i.wish,[x,y]=w.center,[a,c]=w.size.map(v=>v/2);line([[x-a,y-c],[x+a,y-c],[x+a,y+c],[x-a,y+c]],0x7fb6ff);}
   for(const c of plugRects(p,i)){const s=new THREE.Shape(c.rect.corners.map(([x,y])=>new THREE.Vector2(x,y))),m=new THREE.Mesh(new THREE.ShapeGeometry(s),new THREE.MeshBasicMaterial({color:0xffb347,transparent:true,opacity:.28,side:THREE.DoubleSide,depthWrite:false}));m.position.z=z;root.add(m);}}
 }
 /** The selected free thing carries the gizmo. */
 private gizmoTarget(){const b=this.build();return b?.items.find(i=>i.id===this.selected&&i.free)?.free??(this.selected?undefined:b?.plates.find(p=>p.id===this.plateId)?.free);}
 private gizmoOff(){this.host.grip(undefined);}
 private syncGizmo(){
  if(this.drag||this.unitDrag||this.multi.size){this.gizmoOff();return;}const b=this.build(),mode=this.host.mode?.()??'translate';
  // A group: the handle in its middle, turning about the shafts (with wheels) or the vertical.
  if(this.groupId&&b?.groups?.some(g=>g.id===this.groupId)){if(this.host.dragging())return;this.pivot=undefined;this.gizmo.position.set(...centreOf(b,this.groupId,this.frames()));this.gizmo.quaternion.identity();this.gizmo.updateMatrixWorld(true);this.host.grip(this.gizmo,{mode,step:1,angle:15,space:'local',rotateAxis:turnAxis(b,this.groupId)==='y'?'Y':'Z'});return;}
  const free=this.gizmoTarget();if(!free){this.gizmoOff();return;}if(this.host.dragging())return;place(this.gizmo,worldOf(free,this.frames()));this.gizmo.updateMatrixWorld(true);this.host.grip(this.gizmo,{mode,step:1,angle:15,space:'local'});}
 /** The gizmo moved: the document follows live, the Studio keeps the undo step. */
 onDrag(){
  if(this.groupId){const b=this.build(),id=this.groupId;if(!b?.groups?.some(g=>g.id===id))return;const frames=this.frames();this.pivot??={start:structuredClone(b),centre:centreOf(b,id,frames),axis:turnAxis(b,id)};
   const p=this.pivot,q=this.gizmo.quaternion,along=p.axis==='y'?q.y:q.z,angle=2*Math.atan2(along,q.w)*180/Math.PI,delta=this.gizmo.position.toArray().map((v,k)=>v-p.centre[k]) as V,next=structuredClone(p.start);
   moveGroup(next,id,{delta,angle,axis:p.axis,centre:p.centre},frames);b.items=next.items;b.plates=next.plates;if(next.train)b.train=next.train;this.refresh();return;}
  const free=this.gizmoTarget();if(!free)return;const world:Frame={position:this.gizmo.position.toArray() as V,rotation:this.gizmo.quaternion.toArray() as Frame['rotation']},next=reframe({frame:world},free.body,this.frames());free.frame=next.frame;this.refresh();}

 // ---------- pointer ----------
 /** World-free: the pointer's ray in the root's terms. */
 private rootRay(e:{clientX:number;clientY:number}){const ray=this.host.ray(e);this.group.updateWorldMatrix(true,false);return ray.ray.clone().applyMatrix4(this.group.matrixWorld.clone().invert());}
 /** What lies under the pointer: a plate (its coordinates), a surface of the model, or the floor. */
 private locate(e:{clientX:number;clientY:number},b:Build){
  const ray=this.rootRay(e),frames=this.frames(),surface=this.host.surface(this.host.ray(e));let best:{plate:string;at:[number,number];distance:number}|undefined;
  for(const n of b.plates){const r=ray.clone().applyMatrix4(matrix(worldOf(n.free,frames)).invert()),hit=r.intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1),0),new THREE.Vector3());if(!hit)continue;const q=plateRect(sheet(b,n.id)),grow=n.mode==='auto'?80:0;if(hit.x<q.x0-grow||hit.x>q.x1+grow||hit.y<q.y0-grow||hit.y>q.y1+grow)continue;const distance=hit.distanceTo(r.origin);if(!best||distance<best.distance)best={plate:n.id,at:[hit.x,hit.y],distance};}
  if(best&&(!surface||best.distance<surface.distance))return best;
  if(surface)return {surface};
  const floor=ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1),0),new THREE.Vector3());return floor?{surface:{point:floor.toArray() as V,normal:[0,0,1] as V,body:'',distance:0}}:undefined;
 }
 private plateAt(ray:THREE.Raycaster){this.group.updateWorldMatrix(true,true);let o:THREE.Object3D|null|undefined=ray.intersectObjects(this.group.children,true)[0]?.object;while(o&&!o.userData.plate)o=o.parent;return o?.userData.plate as string|undefined;}
 private itemAt(ray:THREE.Raycaster){this.group.updateWorldMatrix(true,true);let o:THREE.Object3D|null|undefined=ray.intersectObjects(this.group.children,true)[0]?.object;while(o&&!o.userData.item)o=o.parent;return o?.userData.item as string|undefined;}
 hover(ray:THREE.Raycaster){return this.trains.hover(ray,this.group)||!!this.itemAt(ray);}
 /** True if the press belongs to a part or a wheel. A press beside them in a mechanism goes on to the mechanism. */
 pointerDown(e:PointerEvent,ray:THREE.Raycaster){
  const wid=this.trains.wheelAt(ray,this.group),hit=wid?undefined:this.itemAt(ray),pid=wid||hit?undefined:this.plateAt(ray),b0=this.build();
  // Strg-click: into the selection or out of it.
  if((e.ctrlKey||e.metaKey)&&(wid||hit||pid)){this.toggle({kind:wid?'wheel':hit?'item':'plate',id:(wid??hit??pid)!});this.host.orbit(false);window.addEventListener('pointerup',()=>this.host.orbit(true),{once:true});this.refresh();this.host.leave();return true;}
  this.multi.clear();
  // A member of a rigid group drags the whole group.
  const member:Member|undefined=wid?{kind:'wheel',id:wid}:hit?{kind:'item',id:hit}:undefined,unit=b0&&member?unitOf(b0,member):undefined;
  if(unit&&member){this.selectMember({kind:'group',id:unit});this.startUnit(e,unit,member);this.refresh();this.host.leave();return true;}
  this.groupId=undefined;
  if(wid){this.selected=undefined;this.plateId=undefined;this.trainOpen=false;this.trains.pointerDown(e,ray,this.group);return true;}
  const b=this.build(),id=this.itemAt(ray),i=b?.items.find(x=>x.id===id),was=this.selected??this.trains.selectedId;this.trains.select(undefined);this.trainOpen=false;this.selected=id;if(id)this.plateId=undefined;else if(this.attached)this.plateId=undefined;
  if(!i){if(this.attached&&!was)return false;this.host.leave();return !this.attached;}
  this.renderProperties();this.refresh();
  let offset:[number,number]=[0,0];if(i.plate){const n=b!.plates.find(p=>p.id===i.plate)!,r=this.rootRay(e).applyMatrix4(matrix(worldOf(n.free,this.frames())).invert()),at=r.intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1),0),new THREE.Vector3());if(at)offset=[i.at[0]-at.x,i.at[1]-at.y];}
  this.host.orbit(false);this.drag={item:structuredClone(i),isNew:false,offset,moved:false,over:true,start:[e.clientX,e.clientY]};this.track();return true;
 }
 /** The one thing selected, as a member. */
 private single():Member|undefined{return this.selected?{kind:'item',id:this.selected}:this.trains.selectedId?{kind:'wheel',id:this.trains.selectedId}:this.groupId?{kind:'group',id:this.groupId}:this.plateId?{kind:'plate',id:this.plateId}:undefined;}
 private selectMember(m:Member){this.multi.clear();this.selected=m.kind==='item'?m.id:undefined;this.plateId=m.kind==='plate'?m.id:undefined;this.groupId=m.kind==='group'?m.id:undefined;this.trainOpen=false;this.trains.select(m.kind==='wheel'?m.id:undefined);}
 /** Strg-click: what was selected alone comes into the selection first; one left is selected alone again. */
 private toggle(m:Member){const one=this.single();if(one&&!this.multi.size)this.multi.add(keyOf(one));this.selected=undefined;this.plateId=undefined;this.groupId=undefined;this.trainOpen=false;this.trains.select(undefined);
  const k=keyOf(m);if(this.multi.has(k))this.multi.delete(k);else this.multi.add(k);if(this.multi.size===1)this.selectMember(memberOf([...this.multi][0]));}
 /** Strg+G: the selection (or the one thing selected) becomes a rigid group. */
 groupSelection(){const b=this.build();if(!b)return;let ms=[...this.multi].map(memberOf);if(!ms.length){const one=this.single();if(one)ms=[one];}if(!ms.length){this.host.status('Erst etwas auswählen: Strg-Klick wählt mehrere.');return;}
  const id='gruppe-'+crypto.randomUUID().slice(0,8);let along=0;
  let title='',label='';this.host.change(()=>{const x=this.build()!,r=makeGroup(x,ms,id,'',undefined,this.frames());along=r.along;const g=x.groups!.find(y=>y.id===id)!;title=titleOf(x,g);label=`${title} ${(x.groups??[]).filter(y=>titleOf(x,y)===title).length}`;g.label=label;},'Gruppe angelegt.');
  if(this.build()?.groups?.some(g=>g.id===id)){this.selectMember({kind:'group',id});this.refresh();this.host.leave();this.host.status(`${label} angelegt${title==='Träger'?': hält die Wellen in festen Abständen':title==='Körper'?': ein Stück':''}${along?`, dazu ${along} auf derselben Welle oder Platte`:''}.`);}}
 private groupLabel(id:string){return this.build()?.groups?.find(g=>g.id===id)?.label??'Gruppe';}
 /** A rigid group follows one of its members: a wheel in the train's plane, snapping to wheels outside the group; a part
  * on the level it stands on, on the build's grid. */
 private startUnit(e:PointerEvent,unit:string,anchor:Member){
  const b=this.build()!,frames=this.frames();let from:V|undefined;
  if(anchor.kind==='wheel'){const p=this.trains.point(e);if(p)from=[p[0],0,p[1]];}
  else{const i=b.items.find(x=>x.id===anchor.id)!,z=standing(b,i,frames).position[2],hit=this.rootRay(e).intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1),-z),new THREE.Vector3());if(hit)from=hit.toArray() as V;}
  if(!from)return;this.host.orbit(false);this.unitDrag={unit,start:structuredClone(b),anchor,from,moved:false,at:[e.clientX,e.clientY],delta:[0,0,0],text:''};
  const move=(ev:PointerEvent)=>this.unitMove(ev),up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);this.unitEnd();};window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);}
 private unitMove(e:PointerEvent){
  const u=this.unitDrag;if(!u)return;if(Math.hypot(e.clientX-u.at[0],e.clientY-u.at[1])>3)u.moved=true;if(!u.moved)return;const s=u.start;let delta:V;u.text='';
  if(u.anchor.kind==='wheel'){const p=this.trains.point(e);if(!p)return;const t=s.train!,w=t.wheels.find(x=>x.id===u.anchor.id)!,shaft=t.shafts.find(x=>x.id===w.shaft)!,inside=new Set(contents(s,u.unit).wheels.map(x=>x.id));
   const outside={...t,wheels:[...t.wheels.filter(x=>!inside.has(x.id)),w],shafts:t.shafts.filter(x=>x.id===w.shaft||t.wheels.some(y=>!inside.has(y.id)&&y.shaft===x.id))},want:[number,number]=[shaft.at[0]+p[0]-u.from[0],shaft.at[1]+p[1]-u.from[2]];
   const sn=snapWheel(outside,w,want,t.grid??1,e.altKey,t.angle??DEFAULT_ANGLE,!!t.target&&(t.grid??1)>0),at=sn.shaft?want:sn.at,o=sn.shaft?undefined:t.wheels.find(x=>x.id===sn.partner);
   delta=[at[0]-shaft.at[0],o?sn.z-w.z:0,at[1]-shaft.at[1]];if(o)u.text=`, ${wheelLabel(w)} kämmt mit ${wheelLabel(o)} unter ${Math.round(sn.angle!*10)/10}°`.replace(/(\d)\.(\d)/,'$1,$2');}
  else{const hit=this.rootRay(e).intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1),-u.from[2]),new THREE.Vector3());if(!hit)return;const g=(v:number)=>e.altKey||!s.grid?v:Math.round(v/s.grid)*s.grid;delta=[g(hit.x-u.from[0]),g(hit.y-u.from[1]),0];}
  u.delta=delta;const next=structuredClone(s);moveGroup(next,u.unit,{delta},this.frames());this.preview=next;this.refresh();
  this.host.status(`${this.groupLabel(u.unit)}: ${delta.map(v=>Math.round(v*10)/10).join(' / ')} mm${u.text} · Alt: ohne Raster`);}
 private unitEnd(){
  const u=this.unitDrag;this.unitDrag=undefined;this.preview=undefined;this.host.orbit(true);if(!u)return;if(!u.moved){this.refresh();return;}const frames=this.frames();
  this.host.change(()=>{const x=this.build()!,next=structuredClone(u.start);moveGroup(next,u.unit,{delta:u.delta},frames);x.items=next.items;x.plates=next.plates;if(next.train)x.train=next.train;},`${this.groupLabel(u.unit)} verschoben${u.text}.`);}
 /** A block from the library: dropped where the pointer meets the floor, or clicked: beside everything there is. */
 private startBlock(k:Block,e:PointerEvent){const start=[e.clientX,e.clientY];
  const up=(ev:PointerEvent)=>{window.removeEventListener('pointerup',up);const moved=Math.hypot(ev.clientX-start[0],ev.clientY-start[1])>3,over=document.elementFromPoint(ev.clientX,ev.clientY)===this.host.canvas();let at:V|undefined;
   if(moved&&over){const hit=this.rootRay(ev).intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1),0),new THREE.Vector3());if(hit)at=[Math.round(hit.x),Math.round(hit.y),0];}else if(!moved)at=this.besideAll();
   if(!at)return;let id='';this.host.change(()=>{id=insertBlock(this.ensure(),k,at!);},`${k.label} eingesetzt: eine feste Gruppe.`);if(id&&this.build()?.groups?.some(g=>g.id===id)){this.selectMember({kind:'group',id});this.refresh();this.host.leave();}};
  window.addEventListener('pointerup',up);}
 private besideAll():V{const b=this.build();if(!b)return [0,0,0];const frames=this.frames(),xs=[...b.items.map(i=>standing(b,i,frames).position[0]),...b.plates.map(p=>worldOf(p.free,frames).position[0]),...(b.train?.shafts??[]).map(s=>s.at[0])];return [xs.length?Math.round(Math.max(...xs))+120:0,0,0];}
 private startNew(part:Part,e:PointerEvent){this.drag={item:newItem('t-'+crypto.randomUUID().slice(0,8),part,[0,0]),isNew:true,offset:[0,0],moved:false,over:false,start:[e.clientX,e.clientY]};this.track();}
 private startPlate(e:PointerEvent){this.drag={plate:newPlateNode('platte-'+crypto.randomUUID().slice(0,6)),isNew:true,offset:[0,0],moved:false,over:false,start:[e.clientX,e.clientY]};this.track();}
 private track(){
  const move=(e:PointerEvent)=>this.dragMove(e),up=(e:PointerEvent)=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);this.dragEnd(e);};
  window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
 }
 private dragMove(e:PointerEvent){
  const d=this.drag;if(!d)return;const b=this.shown()??modelBuild('neu',this.attachedTo??'');if(Math.hypot(e.clientX-d.start[0],e.clientY-d.start[1])>3)d.moved=true;if(!d.moved)return;
  d.over=!d.isNew||document.elementFromPoint(e.clientX,e.clientY)===this.host.canvas();if(!d.over){this.refresh();return;}
  if(d.plate){const s=this.locate(e,{...b,plates:b.plates.filter(p=>p.id!==d.plate!.id)});if(s&&'surface' in s)d.plate.free=reframe({frame:onSurface({...parts[0],body:1},s.surface!.point,s.surface!.normal,d.plate.thickness)},s.surface!.body||undefined,this.frames());this.refresh();return;}
  const s=this.locate(e,b),i=d.item!;if(!s)return;
  if('plate' in s&&s.plate){if(partOf(b,i).mount==='support')return;const wish:[number,number]=[s.at[0]+d.offset[0],s.at[1]+d.offset[1]],on=i.plate===s.plate;i.plate=s.plate;delete i.free;if(!on&&i.holder.kind==='none')i.holder=newItem('',partOf(b,i),[0,0]).holder;const flat=sheet({...b,items:b.items.filter(x=>x.id!==i.id)},s.plate);i.at=e.altKey?wish:snapTo(flat,i,wish);}
  else if('surface' in s){const p=partOf(b,i),f=s.surface!;delete i.plate;i.free=reframe({frame:onSurface(p,f.point,f.normal,liftOf(i),i.angle)},f.body||undefined,this.frames());}
  this.refresh();
 }
 private dragEnd(e:PointerEvent){
  const d=this.drag,b=this.build();this.drag=undefined;this.host.orbit(true);if(!d)return;if(d.moved||d.isNew){this.trains.select(undefined);this.trainOpen=false;}
  if(d.isNew&&!d.moved){this.placeByClick(d,b);d.over=true;}
  if(!d.moved&&!d.isNew||!d.over){this.refresh();return;}
  if(d.plate){const plate=d.plate;this.plateId=plate.id;this.selected=undefined;this.host.change(()=>{this.ensure().plates.push(plate);},'Bodenplatte platziert.');return;}
  const item=d.item!,before=b?.items.find(i=>i.id===item.id);if(item.wish?.mode==='auto')delete item.wish;else if(item.wish?.mode==='zone'&&before){if(item.free){item.wish.center=[...worldOf(item.free,this.frames()).position];}else if(item.plate===before.plate){item.wish.center=[item.wish.center[0]+item.at[0]-before.at[0],item.wish.center[1]+item.at[1]-before.at[1]];}}
  const flat=b&&item.plate?sheet({...b,items:b.items.filter(i=>i.id!==item.id&&!i.wish)},item.plate):undefined,wish=[...item.at],at=flat&&!e.altKey?nearestFree(flat,item):item.at,label=partOf(b??{parts:[]},item).label,pushed=at[0]!==wish[0]||at[1]!==wish[1],where=item.free?.body?` an ${item.free.body}`:'';
  this.selected=item.id;this.plateId=undefined;this.host.change(()=>{const x=this.ensure(),next={...item,at};if(d.isNew)x.items.push(next);else x.items=x.items.map(y=>y.id===item.id?next:y);solveBuild(x);},pushed?`${label}: war belegt, auf den nächsten freien Platz gesetzt.`:d.isNew?`${label} platziert${where}.`:`${label} verschoben${where}.`);
 }
 /** A click in the store: the middle of the plate, or the floor. */
 private placeByClick(d:Drag,b:Build|undefined){const n=b?.plates.find(p=>p.id===this.plateId)??b?.plates[0];
  if(!d.item)return;if(b&&n){const r=plateRect(sheet(b,n.id));d.item.plate=n.id;d.item.at=[snap((r.x0+r.x1)/2,b.grid),snap((r.y0+r.y1)/2,b.grid)];}else d.item.free={frame:{position:[0,0,liftOf(d.item)],rotation:[0,0,0,1]}};}
 /** The build that takes a new thing: a mechanism's own is made with its first part. */
 private ensure(){let x=this.build();if(!x){const d=this.host.doc();x=modelBuild('teile-'+crypto.randomUUID().slice(0,8),this.attachedTo!);d.builds=[...(d.builds??[]),x];}return x;}
 /** Keys of the view: R turns the selection, Entf removes it. */
 key(e:KeyboardEvent){if(e.key==='Delete'&&this.groupId){this.removeSelectedGroup();return true;}if(this.trains.key(e))return true;if(!this.selected)return false;if(e.key==='r'||e.key==='R'){this.turn(e.shiftKey?-90:90);return true;}if(e.key==='Delete'){this.removeItem();return true;}return false;}
 private turn(by:number){const id=this.selected!;this.host.change(()=>{const i=this.build()!.items.find(x=>x.id===id);if(!i)return;i.angle=(i.angle+by+360)%360;if(i.free)i.free.frame=compose(i.free.frame,{position:[0,0,0],rotation:axisAngle([0,0,1],by)});},'Teil gedreht');}
 private removeSelectedGroup(){const id=this.groupId!,name=this.groupLabel(id);this.groupId=undefined;this.host.change(()=>{removeGroup(this.build()!,id);},`${name} mit allem darin entfernt.`);}
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
 private allIssues(b:Build){const planar=b.plates.flatMap(n=>issues(sheet(b,n.id)));try{return [...planar,...this.spaceIssues(b,this.frames())];}catch{return planar;}}
 /** The same over the whole way of every axis: a part must fit in every pose. */
 private async sweep(){
  const b=this.build();if(!b)return;this.sweepText='Fahrweg wird geprüft …';this.renderProperties();const seen=new Map<string,{axis:string;at:number[]}>();
  try{for(const pose of await this.host.range())for(const x of this.spaceIssues(b,{...shaftFrames(b.train),...pose.frames})){const c=seen.get(x.message)??{axis:pose.axis,at:[]};c.at.push(Math.round(pose.value));seen.set(x.message,c);}
   this.sweepText=seen.size?[...seen].map(([m,c])=>`${m} (${c.axis} bei ${c.at.slice(0,4).join(', ')}${c.at.length>4?' …':''})`).join(' · '):'✓ Über den ganzen Fahrweg frei.';}catch(e){this.sweepText=`Fahrweg nicht geprüft: ${e}`;}
  this.renderProperties();this.host.status(this.sweepText);
 }

 // ---------- explorer ----------
/** What is in the build, as far as the phase works on it: ① plates, parts and wheels; ② the gear train; ③ what is
  * printed (plates, the net). In a mechanism the parts on its model. */
 renderPlaced(root:HTMLElement,phase:1|2|3=1){
  const b=this.build(),wheels=this.wheels;
  const pick=(item?:string,plate?:string)=>{this.host.picked?.();this.selected=item;this.plateId=plate;this.trainOpen=false;this.trains.select(undefined);this.refresh();this.host.leave();};
  const row=(text:string,data:Record<string,string>,selected:boolean,go:()=>void,sub=false)=>{const r=el('button',{textContent:text,...(sub?{className:'tree-sub'}:{})});Object.assign(r.dataset,data);r.setAttribute('aria-selected',String(selected));r.onclick=go;root.append(el('div',{className:'tree-row'},r));};
  const nothing=!this.selected&&!this.plateId&&!this.trainOpen&&!this.trains.selectedId;
  if(phase===2){
   if(wheels){row('⚙ Zahnräder: Eingang, Ausgang, Antrieb',{trainPage:'true'},this.trainOpen,()=>{this.openTrain();this.refresh();this.host.leave();});root.append(el('p',{className:'muted',textContent:'Gedreht werden sie unten mit dem Regler, in jeder Phase.'}));}
   else if(!this.attached)root.append(el('p',{className:'muted',textContent:'Noch nichts, das sich bewegt. In „① Aufbauen“ ein 3D-Modell laden oder Zahnräder setzen.'}));
   return;}
  if(phase===3){
   // The gears are made from their derived mechanism, in this scene: bearings and a structure per link.
   if(wheels&&!this.attached){const open=this.host.derivedPage?.()??'';if(this.host.derived?.()){row('⊚ Lager & Wellen',{derived:'bearings'},open==='bearings',()=>this.host.openDerived?.('bearings'));row('🕸 Struktur je Glied',{derived:'structure'},open==='structure',()=>this.host.openDerived?.('structure'));}
    else{const why=trainIssues(b!.train!)[0];root.append(el('p',{className:'muted',textContent:`Lager und Struktur entstehen, sobald die Zahnräder stimmen: ${why?.message??''}`}));row('⚙ Zahnräder prüfen',{trainPage:'true'},this.trainOpen,()=>{this.host.picked?.();this.openTrain();this.refresh();this.host.leave();});}}
   if(this.active&&b&&!b.plates.length&&b.items.length)row('🕸 Baum-Netz',{overview:'true'},nothing,()=>pick());
   for(const n of b?.plates??[])row('▭ Bodenplatte · Druckdateien',{plate:n.id},!this.selected&&this.plateId===n.id,()=>pick(undefined,n.id));
   if(!this.attached&&!b?.items.length&&!b?.plates.length&&!wheels)root.append(el('p',{className:'muted',textContent:'Noch nichts zu fertigen. In „① Aufbauen“ Teile, eine Bodenplatte oder ein 3D-Modell holen.'}));
   return;}
  // Layers like in a drawing program: one tree in the order of the project, groups as folders; dragging a row moves it
  // before or after another, or into a group. A click on the empty space selects nothing (the project's page).
  if(this.attached)root.append(el('div',{className:'tree-group',textContent:'Teile'}));
  const layers=el('div',{className:'layers'});root.append(layers);
  layers.onclick=e=>{if(e.target===layers){this.deselect();this.refresh();this.host.leave();}};
  layers.ondragover=e=>{if(this.layerDrag&&e.target===layers)e.preventDefault();};
  layers.ondrop=e=>{if(e.target!==layers||!this.layerDrag)return;e.preventDefault();const what=this.layerDrag;this.layerDrag=undefined;this.dropLayer(what,undefined,'end');};
  if(b){const t=b.train,lit=(m:Member)=>this.multi.has(keyOf(m))||(m.kind==='group'?this.groupId===m.id:m.kind==='item'?this.selected===m.id:m.kind==='plate'?!this.selected&&this.plateId===m.id:this.trains.selectedId===m.id);
   // Strg-click adds to the selection, a click selects alone.
   const go=(m:Member)=>(ev:MouseEvent)=>{if(ev.ctrlKey||ev.metaKey)this.toggle(m);else this.selectMember(m);this.refresh();this.host.leave();};
   const line=(m:Member,depth:number)=>{let text='';const data:Record<string,string>={};
    if(m.kind==='group'){const g=b.groups!.find(x=>x.id===m.id)!;const title=titleOf(b,g);text=`${title==='Träger'?'▣':title==='Körper'?'◆':'▢'} ${g.label}`;data.group=g.id;}
    else if(m.kind==='plate'){text='▭ Bodenplatte';data.plate=m.id;}
    else if(m.kind==='item'){const i=b.items.find(x=>x.id===m.id)!;text=`${partOf(b,i).label}${i.free?.body?` → ${this.bodyName(i.free.body)}`:''}`;data.item=m.id;}
    else{const w=t!.wheels.find(x=>x.id===m.id)!;text=`⚙ ${wheelLabel(w)}${inputsOf(t!).some(i=>i.shaft===w.shaft)?' · Eingang':outputsOf(t!).includes(w.shaft)?' · Ausgang':''}`;data.wheel=m.id;}
    const r=el('button',{textContent:text,className:'layer-name'});Object.assign(r.dataset,data);r.setAttribute('aria-selected',String(lit(m)));r.onclick=go(m);
    const row=el('div',{className:'tree-row layer-row'});row.style.paddingLeft=`${depth*16}px`;row.draggable=true;
    if(m.kind==='group'){const open=!this.folded.has(m.id),fold=el('button',{textContent:open?'▾':'▸',className:'layer-fold',title:open?'Zuklappen':'Aufklappen'});fold.dataset.fold=m.id;fold.onclick=e=>{e.stopPropagation();if(open)this.folded.add(m.id);else this.folded.delete(m.id);this.host.leave();};row.append(fold);}
    else row.append(el('span',{className:'layer-fold'}));
    row.append(r);if(m.kind==='group')row.append(el('small',{className:'layer-kind',textContent:titleOf(b,b.groups!.find(x=>x.id===m.id)!)}));
    row.ondragstart=e=>{this.layerDrag=m;e.dataTransfer?.setData('text/plain',keyOf(m));if(e.dataTransfer)e.dataTransfer.effectAllowed='move';};
    row.ondragend=()=>{this.layerDrag=undefined;};
    row.ondragover=e=>{const d=this.layerDrag;if(!d||keyOf(d)===keyOf(m))return;e.preventDefault();const box=row.getBoundingClientRect(),y=(e.clientY-box.top)/box.height;row.dataset.drop=m.kind==='group'&&y>.25&&y<.75?'into':y<.5?'before':'after';};
    row.ondragleave=()=>{delete row.dataset.drop;};
    row.ondrop=e=>{e.preventDefault();const zone=row.dataset.drop as 'into'|'before'|'after'|undefined;delete row.dataset.drop;const d=this.layerDrag;this.layerDrag=undefined;if(d&&zone)this.dropLayer(d,m,zone);};
    layers.append(row);
    if(m.kind==='group'&&!this.folded.has(m.id))nest(orderedChildren(b,m.id),depth+1);};
   // Parts on a plate of the same level hang under it.
   const nest=(list:Member[],depth:number)=>{const plates=new Set(list.filter(x=>x.kind==='plate').map(x=>x.id)),on=(x:Member)=>x.kind==='item'?b.items.find(i=>i.id===x.id)?.plate:undefined;for(const m of list){const p=on(m);if(p&&plates.has(p))continue;line(m,depth);if(m.kind==='plate')for(const x of list)if(on(x)===m.id)line(x,depth+1);}};
   nest(orderedChildren(b),0);
   if(b.items.length+b.plates.length+(t?.wheels.length??0)>1)root.append(el('p',{className:'muted tree-hint',textContent:'Ziehen ordnet um und legt in Gruppen · Strg-Klick wählt mehrere · Strg+G gruppiert'}));}
  if(!b?.items.length&&!b?.plates.length&&!wheels)layers.append(el('p',{className:'muted',textContent:this.attached?'Noch keine Teile. Aus der Bibliothek auf das Modell ziehen.':'Noch leer. Aus der Bibliothek links etwas in die Ansicht ziehen.'}));
 }
 /** A row dropped in the tree: before or after another (in its group), into a group, or at the end of the top. */
 private dropLayer(what:Member,target:Member|undefined,zone:'into'|'before'|'after'|'end'){
  const b=this.build();if(!b)return;const frames=this.frames(),name=this.memberText(b,what);
  let into:string|undefined,before:Member|undefined;
  if(target&&zone==='into'){into=target.id;}
  else if(target&&zone!=='end'){into=parentOf(b,target);if(zone==='before')before=target;else{const list=orderedChildren(b,into),k=list.findIndex(x=>keyOf(x)===keyOf(target));before=list.slice(k+1).find(x=>keyOf(x)!==keyOf(what));}}
  const group=b.groups?.find(g=>g.id===into);
  this.host.change(()=>{moveMember(this.build()!,what,into,before,frames);},group?`${name} in „${group.label}“ gelegt.`:`${name} umgeordnet.`);
 }
 /** The library, the same in every project: a 3D model, plates, parts, gears, own parts. What does not fit the
  * project stays listed and says why. */
 renderStore(root:HTMLElement){
  const filter=el('input',{type:'search',placeholder:'Bibliothek durchsuchen',value:this.filter});filter.id='part-filter';filter.setAttribute('aria-label','Bibliothek durchsuchen');
  const list=el('div',{className:'part-store'});filter.oninput=()=>{this.filter=filter.value;this.fillStore(list);};root.append(filter,list);this.fillStore(list);
  const gears=el('details',{className:'store-group',open:!!this.wheels},el('summary',{textContent:'Zahnräder'}));gears.dataset.storeGears='true';
  if(this.attached)gears.append(el('p',{className:'muted',textContent:'Das Projekt hat einen Mechanismus: Räder hier lassen sich setzen und prüfen, aber nicht zu einem zweiten Mechanismus machen.'}));
  this.trains.renderStore(gears);root.append(gears);
  const own=this.host.blocks?.()??[],blocks=el('details',{className:'store-group',open:own.length>0},el('summary',{textContent:`Eigene Bausteine (${own.length})`}));blocks.dataset.storeBlocks='true';
  if(!own.length)blocks.append(el('p',{className:'muted',textContent:'Noch keine. Eine feste Gruppe wählen und „In die Bibliothek legen“: Sie steht dann in jedem Projekt hier.'}));
  for(const k of own){const card=el('div',{className:'part-card block-card',title:'In die Ansicht ziehen oder anklicken: wird eine feste Gruppe.'},el('strong',{textContent:k.label}),el('small',{textContent:[k.wheels.length?`${k.wheels.length} Räder`:'',k.items.length?`${k.items.length} Teile`:'',k.plates.length?`${k.plates.length} Platten`:''].filter(Boolean).join(' · ')}));card.dataset.block=k.id;
   const del=el('button',{textContent:'✕',title:'Aus der Bibliothek löschen',className:'ghost'});del.dataset.blockRemove=k.id;del.onpointerdown=e=>e.stopPropagation();del.onclick=()=>{if(confirm(`Baustein „${k.label}“ aus der Bibliothek löschen?`))void this.host.removeBlock?.(k.id).then(()=>this.host.leave());};card.append(del);
   card.onpointerdown=e=>{e.preventDefault();this.startBlock(k,e);};blocks.append(card);}
  root.append(blocks);
  const c=this.custom,form=el('details',{className:'templates'},el('summary',{textContent:'Eigenes Teil aus Maßen'}));form.dataset.customForm='true';
  const field=(label:string,key:'length'|'width'|'height'|'x'|'y'|'d')=>{const input=el('input',{type:'number',step:'0.1',value:String(c[key])});input.dataset.custom=key;input.onchange=()=>{c[key]=Number(input.value);};return el('label',{},label,input);};
  const name=el('input',{type:'text',value:c.label});name.dataset.custom='label';name.oninput=()=>{c.label=name.value;};
  const make=el('button',{textContent:'Teil anlegen'});make.dataset.customMake='true';make.onclick=()=>{const label=c.label.trim();if(!label||!(c.length>0&&c.width>0&&c.height>0)){this.host.status('Teil braucht Name, Länge, Breite und Höhe.');return;}const holes=c.d>0&&c.x>0&&c.y>0?[[-c.x/2,-c.y/2],[c.x/2,-c.y/2],[c.x/2,c.y/2],[-c.x/2,c.y/2]].map(at=>({at:at as [number,number],d:c.d})):[];const part={...boxPart({id:'eigen-'+crypto.randomUUID().slice(0,8),label,group:'Eigene Teile',size:[c.length,c.width],height:c.height,holes,source:'Eigene Maße'}),checked:true};this.host.change(()=>{this.ensure().parts.push(part);},`${label} steht in der Bibliothek.`);};
  form.append(el('label',{},'Name',name),field('Länge [mm]','length'),field('Breite [mm]','width'),field('Höhe [mm]','height'),field('Lochabstand X [mm]','x'),field('Lochabstand Y [mm]','y'),field('Loch-Ø [mm] (0: keine)','d'),make);root.append(form);
 }
 /** Opens the overview (nothing selected): where the carrier is made. */
 overview(){this.selected=undefined;this.plateId=undefined;}
 /** Selects a plate (its page holds printing files and the housing). */
 selectPlate(id:string){this.selected=undefined;this.plateId=id;}
 /** The steps of the parts: something placed, nothing in the way, wheels that mesh and become a mechanism, what is
  * printed. Attached to a mechanism only what concerns the parts there is. */
 todo(){const b=this.build(),t=b?.train,wheels=!!t?.wheels.length,out:{label:string;done:boolean;hint:string;phase:number;open:()=>void}[]=[];
  if(!b||!b.items.length&&!b.plates.length&&!wheels){if(!this.attached)out.push({label:'Etwas platziert',done:false,hint:'Aus der Bibliothek links holen, was das Gerät braucht: ein 3D-Modell, eine Bodenplatte, Elektronik und Motoren oder Zahnräder.',phase:1,open:()=>this.overview()});return out;}
  const found=this.allIssues(b);
  if(!this.attached)out.push({label:'Etwas platziert',done:true,hint:'',phase:1,open:()=>this.overview()});
  if(b.items.length)out.push({label:'Nichts im Weg',done:!found.length,hint:found[0]?.message??'Alles frei.',phase:1,open:()=>{this.selected=found[0]?.items[0];}});
  if(wheels){const bad=trainIssues(t!);out.push({label:'Alle Räder kämmen',done:t!.wheels.length>=2&&!bad.length,hint:t!.wheels.length<2?'Ein zweites Zahnrad daneben ziehen: Es rastet im Achsabstand ein.':bad[0]?.message??'Alles kämmt.',phase:1,open:()=>{this.trains.select(bad[0]?.wheels[0]??t!.wheels[0].id);}});
   if(!this.attached)out.push({label:'Lager und Struktur',done:!!this.host.derivedDone?.(),hint:'In „③ Fertigen“: „Lager & Wellen“ planen, dann „Struktur je Glied“ erzeugen.',phase:3,open:()=>this.host.openDerived?.('bearings')});}
  if(this.active&&!b.plates.length&&b.items.length)out.push({label:'Träger erzeugt',done:!!this.net.positions&&this.net.key===this.netKey(b),hint:'In „③ Fertigen“ das Baum-Netz erzeugen.',phase:3,open:()=>this.overview()});
  if(b.plates.length)out.push({label:'Druckdateien',done:false,hint:'Bodenplatte wählen: Platte als STL oder Gehäuse als ZIP.',phase:3,open:()=>{this.selected=undefined;this.plateId=b.plates[0].id;}});
  return out;
 }
 private fillStore(list:HTMLElement){
  list.replaceChildren();const q=this.filter.toLowerCase(),b=this.build(),all=[...parts,...(b?.parts??[])].filter(p=>!q||`${p.label} ${p.group}`.toLowerCase().includes(q));
  if(!q||'3d-modell stl obj glb'.includes(q)){const row=el('button',{className:'part-card',title:this.attached?'Das Projekt hat schon ein Modell. Für ein weiteres Gerät ein neues Projekt anlegen.':'STL, OBJ oder GLB: danach Glieder und Achsen festlegen.'},el('strong',{textContent:'3D-Modell laden'}),el('small',{textContent:this.attached?'Das Projekt hat schon eins':'STL, OBJ oder GLB · wird der Mechanismus'}));row.dataset.storeModel='true';row.disabled=this.attached||!this.host.loadModel;row.onclick=()=>this.host.loadModel?.();list.append(row);}
  if(!q||'bodenplatte'.includes(q)){const row=el('div',{className:'part-card',title:'Ein Element wie jedes andere: auf eine Fläche ziehen, Teile darauf setzen.'},el('strong',{textContent:'Bodenplatte'}),el('small',{textContent:'Größe und Bohrungen einstellbar'}));row.dataset.storePlate='true';row.onpointerdown=e=>{e.preventDefault();this.startPlate(e);};list.append(row);}
  for(const group of partGroups){const items=all.filter(p=>p.group===group);if(!items.length)continue;const box=el('details',{open:!!q||group==='Controller'||group==='Motoren'},el('summary',{textContent:`${group} (${items.length})`}));
   if(group==='Befestigung')box.append(el('p',{className:'muted',textContent:this.attached?'Füße und Halter für den Träger aus Baum-Netz: Im Projekt mit Modell tragen die Strukturen der Glieder die Teile.':'Füße und Halter, an denen der Träger aus Baum-Netz steht.'}));
   for(const p of items){const size=p.box.max.map((v,k)=>v-p.box.min[k]),row=el('div',{className:'part-card',title:p.note??`Quelle: ${p.source}`},el('strong',{textContent:`${p.checked?'':'⚠ '}${p.label}`}),el('small',{textContent:`${mm(size[0])} × ${mm(size[1])} × ${mm(size[2])} mm · ${p.holes.length} Löcher`}));row.dataset.part=p.id;row.onpointerdown=e=>{e.preventDefault();this.startNew(p,e);};box.append(row);}
   list.append(box);}
 }

 // ---------- properties ----------
 renderProperties(){
  const root=document.getElementById('properties')!,b=this.build();if(!this.holdsProperties)return;root.replaceChildren();if(!b)return;
  if(this.multi.size){this.selectionPage(root,b);return;}
  if(this.groupId&&b.groups?.some(g=>g.id===this.groupId)){this.groupPage(root,b);return;}
  if(b.train&&(this.trains.selectedId||this.trainOpen)){this.trains.renderProperties(root);return;}
  const edit=(message:string,fn:(x:Build)=>void)=>this.host.change(()=>fn(this.build()!),message);
  const number:NumberField=(label,value,write,step='0.5')=>{const input=el('input',{type:'number',step,value:String(Math.round(value*1000)/1000)});input.setAttribute('aria-label',label);input.dataset.field=label;input.onchange=()=>{const n=Number(input.value);if(Number.isFinite(n))write(n);};return el('label',{},label,input);};
  const select:SelectField=(label,value,options,write)=>{const s=el('select');s.dataset.field=label;for(const [v,t] of options)s.add(new Option(t,v));s.value=value;s.onchange=()=>write(s.value);return el('label',{},label,s);};
  const i=b.items.find(x=>x.id===this.selected),n=b.plates.find(p=>p.id===this.plateId);
  if(i)this.itemPage(root,b,i,number,select,edit);else if(n)this.platePage(root,b,n,number,select,edit);
  const making=(this.host.phase?.()??3)===3,empty=!b.items.length&&!b.plates.length&&!b.train?.wheels.length;
  if(this.active&&!i&&!n){root.append(heading('Projekt'));if(empty)root.append(el('p',{className:'muted',textContent:'Noch leer. Links in der Bibliothek liegt alles, was ein Gerät haben kann: ein 3D-Modell, das sich bewegt, Bodenplatten, Elektronik, Motoren, Füße und Zahnräder. Hineinziehen, was du brauchst.'}));}
  if(this.active&&!i&&!n&&making&&!b.plates.length&&b.items.length)this.netPanel(root,b,number,select);
  if(this.active&&!i&&!n&&!making&&!empty)root.append(el('p',{className:'muted',textContent:b.plates.length?'Druckdateien für Platte und Gehäuse gibt es in „③ Fertigen“.':b.items.length?'Das Baum-Netz, das die Teile trägt, entsteht in „③ Fertigen“.':'Zahnräder werden in „② Bewegen“ zum Mechanismus.'}));
  if(empty)return;
  const list=shopping(b);if(list.length&&!i){root.append(heading('Stückliste'));for(const l of list)root.append(el('p',{className:'muted',textContent:`${l.count} × ${l.label}`}));}
  root.append(heading('Prüfung'),this.report(this.allIssues(b)));
  if(this.attached){const go=el('button',{textContent:'Über den Fahrweg prüfen'});go.dataset.sweepParts='true';go.onclick=()=>void this.sweep();root.append(go);if(this.sweepText)root.append(el('p',{id:'build-sweep',className:this.sweepText.startsWith('✓')?'state-pass':'state-warn',textContent:this.sweepText}));}
 }
 private memberText(b:Build,m:Member){if(m.kind==='group')return `▣ ${b.groups?.find(g=>g.id===m.id)?.label??''}`;if(m.kind==='plate')return '▭ Bodenplatte';if(m.kind==='item'){const i=b.items.find(x=>x.id===m.id);return i?partOf(b,i).label:'';}const w=b.train?.wheels.find(x=>x.id===m.id);return w?`⚙ ${wheelLabel(w)}`:'';}
 private selectionPage(root:HTMLElement,b:Build){const ms=[...this.multi].map(memberOf);
  root.append(heading(`Auswahl (${ms.length})`),...ms.map(m=>el('p',{className:'muted',textContent:this.memberText(b,m)})));
  const make=el('button',{textContent:'▣ Gruppieren (Strg+G)',className:'primary'});make.dataset.groupMake='true';make.onclick=()=>this.groupSelection();
  const clear=el('button',{textContent:'Auswahl aufheben'});clear.onclick=()=>{this.multi.clear();this.refresh();this.host.leave();};
  root.append(el('div',{className:'button-row'},make,clear),el('p',{className:'muted',textContent:'Eine Gruppe hält Räder, Teile und Platten zusammen. Fest gruppiert bleiben ihre Abstände: Ziehst du ein Stück, kommt die ganze Gruppe mit. Gruppen dürfen in Gruppen stecken.'}));}
 private groupPage(root:HTMLElement,b:Build){
  const g=b.groups!.find(x=>x.id===this.groupId)!,c=contents(b,g.id),set=(message:string,fn:(y:NonNullable<Build['groups']>[number])=>void)=>this.host.change(()=>{const y=this.build()!.groups?.find(x=>x.id===g.id);if(y)fn(y);},message);
  const name=el('input',{type:'text',value:g.label});name.dataset.field='Name der Gruppe';name.setAttribute('aria-label','Name der Gruppe');name.onchange=()=>{const v=name.value.trim();if(v)set('Gruppe umbenannt',y=>{y.label=v;});};
  // What the members are to each other.
  const kind=el('select');kind.dataset.field='Art';kind.add(new Option('◆ Körper: ein starres Stück','koerper'));kind.add(new Option('▢ Ordnung: nur zusammen im Baum','ordnung'));kind.value=g.kind;
  kind.onchange=()=>{const k=kind.value as GroupKind,frames=this.frames();this.host.change(()=>{setKind(this.build()!,g.id,k,frames);},`${g.label}: ${kindNames[k]}.`);};
  const shafts=[...new Set(c.wheels.map(w=>w.shaft))],title=titleOf(b,g);
  // A Körper stands and bears its shafts, or turns with one shaft (then all its wheels sit on that one).
  const motion=el('select');motion.dataset.field='Bewegung';motion.add(new Option(shafts.length?`steht, lagert ${shafts.length===1?'die Welle':`${shafts.length} Wellen`} (Träger)`:'steht',''));for(const s of shafts){const o=new Option(`dreht mit der ${this.bodyName(`welle:${s}`)}${shafts.length>1?' (nur wenn alle Räder auf ihr sitzen)':''}`,s);o.disabled=shafts.length>1;motion.add(o);}motion.value=g.turns??'';
  motion.onchange=()=>{const v=motion.value||undefined,frames=this.frames();this.host.change(()=>{setTurns(this.build()!,g.id,v,frames);},v?`${g.label} dreht mit der ${this.bodyName(`welle:${v}`)}.`:`${g.label} steht.`);};
  root.append(heading(title),el('label',{},'Name',name),el('label',{},'Art',kind));if(g.kind==='koerper')root.append(el('label',{},'Bewegung',motion));

  root.append(el('p',{id:'group-kind',className:'muted',textContent:g.kind==='ordnung'?'Ordnet nur: Jedes Stück bewegt sich einzeln.':g.turns?`Ein Stück: Alles darin hängt an der ${this.bodyName(`welle:${g.turns}`)} und dreht mit ihr.`:shafts.length?`Ein starres Stück, das ${shafts.length===1?'eine Welle':`${shafts.length} Wellen`} in festen Abständen lagert; die Räder drehen darin. Für diese Abstände entstehen Lager und Gehäuse. Es kann selbst ein Teil einer größeren Mechanik sein, etwa ein Arm.`:'Ein starres Stück: Alles darin bewegt sich zusammen.'}));
  const parent=b.groups!.find(x=>x.id===g.parent);if(parent)root.append(el('p',{className:'muted',textContent:`Steckt in „${parent.label}“ (${titleOf(b,parent)}${rigidOf(parent)?': zieht beim Bearbeiten mit':''}).`}));
  root.append(el('p',{className:'muted',textContent:[`${c.items.length} Teile`,`${c.plates.length} Platten`,`${c.wheels.length} Räder`,...(c.groups.size>1?[`${c.groups.size-1} Untergruppen`]:[])].join(' · ')}));
  if(c.wheels.length){const t=b.train!,sub={...t,wheels:c.wheels,shafts:c.shafts},n=meshes(sub).length,mine=(s:string)=>c.shafts.some(x=>x.id===s),ends=inputsOf(t).filter(i=>mine(i.shaft)).flatMap(i=>outputsOf(t).filter(mine).map(o=>({i:i.shaft,o,r:ratioOf(sub,i.shaft,o)}))).filter(p=>p.r!==undefined),name=(s:string)=>{const w=c.wheels.find(x=>x.shaft===s);return w?wheelLabel(w):'';};
   const pairs=meshes(sub);if(pairs.length)root.append(el('p',{id:'group-distances',className:rigidOf(g)?'state-pass':'muted',textContent:`Achsabstände${rigidOf(g)?' (fest)':''}: ${pairs.map(([x,y])=>`${wheelLabel(x)} ↔ ${wheelLabel(y)} ${mm(Math.hypot(...[0,1].map(k=>c.shafts.find(s=>s.id===x.shaft)!.at[k]-c.shafts.find(s=>s.id===y.shaft)!.at[k]) as [number,number]))} mm`).join(' · ')}`}));
   root.append(el('p',{id:'group-ratio',className:ends.length?'state-pass':'muted',textContent:`${n} Eingriff${n===1?'':'e'} in der Gruppe${ends.length?` · ${ends.map(p=>`${name(p.i)} → ${name(p.o)} 1 : ${Math.abs(p.r!).toFixed(2).replace('.',',')}`).join(' · ')}`:' · kein Eingang und Ausgang beide in der Gruppe'}`}));}
  root.append(el('p',{className:'muted',textContent:`Verschieben und Drehen mit dem Griff in der Ansicht (Drehen ${turnAxis(b,g.id)==='y'?'um die Wellen':'um die Senkrechte'}).${rigidOf(g)?' Ziehst du ein Rad oder Teil der Gruppe, kommt die ganze Gruppe mit; ein Rad rastet dabei an Räder außerhalb ein.':''}`}));
  const keep=el('button',{textContent:'📚 In die Bibliothek legen',className:'primary'});keep.dataset.groupSave='true';keep.disabled=!rigidOf(g);keep.title=rigidOf(g)?'Steht dann in jedem Projekt unter „Eigene Bausteine“.':'Nur Körper und Träger: ein Baustein hält seine Abstände.';
  keep.onclick=()=>void (async()=>{try{await this.host.saveBlock?.(blockOf(b,g.id,this.frames()));this.host.status(`${g.label} liegt in der Bibliothek unter „Eigene Bausteine“.`);this.host.leave();}catch(e){this.host.status(`Nicht gespeichert: ${e instanceof Error?e.message:e}`);}})();
  const apart=el('button',{textContent:'Auflösen'});apart.dataset.groupDissolve='true';apart.onclick=()=>{const id=g.id;this.groupId=undefined;const frames=this.frames();this.host.change(()=>{dissolve(this.build()!,id,frames);},`${g.label} aufgelöst.`);};
  const remove=el('button',{textContent:'Mit Inhalt entfernen',className:'danger'});remove.dataset.groupRemove='true';remove.onclick=()=>this.removeSelectedGroup();
  root.append(el('div',{className:'button-row'},keep,apart,remove));}
 private report(found:Issue[]){const box=el('div',{id:'build-issues'});if(!found.length)box.append(el('p',{className:'state-pass',textContent:'✓ Nichts überschneidet sich, alle Stecker sind frei.'}));for(const f of found)box.append(el('p',{className:'state-fail',textContent:f.message}));return box;}
 /** Where a free thing hangs, and its numbers; changing the link keeps it where it is in the room. */
 private freeFields(root:HTMLElement,free:Free,number:NumberField,select:SelectField,write:(message:string,fn:(f:Free)=>void)=>void){
  const links=Object.keys(this.frames());
  if(links.length)root.append(select('Hängt an',free.body??'',[['','nichts (steht im Raum)'],...links.map(l=>[l,this.bodyName(l)] as [string,string])],v=>write('Zuordnung geändert',f=>{const next=reframe(f,v||undefined,this.frames());f.frame=next.frame;if(v)f.body=v;else delete f.body;})));
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
  const making=(this.host.phase?.()??3)===3,stl=el('button',{textContent:'⬇ Platte als STL',className:'primary'});stl.dataset.plateStl='true';stl.onclick=()=>this.exportSheet(flat,b.label);
  if(b.items.some(i=>i.plate===n.id&&i.wish)){const go=el('button',{textContent:'✨ Plätze neu suchen'});go.dataset.solve='true';go.onclick=()=>edit('Plätze gesucht',x=>{solveBuild(x);});root.append(go);}
  const drop=el('button',{textContent:'Platte entfernen',className:'danger'});drop.dataset.removePlate='true';drop.onclick=()=>{this.plateId=undefined;edit('Platte entfernt',x=>{x.items=x.items.filter(i=>i.plate!==n.id);x.plates=x.plates.filter(y=>y.id!==n.id);});};
  if(!making){root.append(add,drop,el('p',{className:'muted',textContent:'Platte als STL und Gehäuse: in „③ Fertigen“.'}));return;}
  root.append(heading('Druckdateien'),stl);
  const h=p.housing??defaultCase,housing=(key:keyof typeof defaultCase,v:number)=>plate('Gehäuse geändert',x=>{x.housing={...(x.housing??defaultCase),[key]:v};}),blocked=caseBlockers(flat);
  root.append(heading('Gehäuse'),number('Wand [mm]',h.wall,v=>housing('wall',Math.max(.8,v)),'0.2'),number('Deckel [mm]',h.lid,v=>housing('lid',Math.max(.8,v)),'0.2'),number('Luft über den Teilen [mm]',h.top,v=>housing('top',Math.max(0,v))),number('Passung Deckel [mm]',h.fit,v=>housing('fit',Math.max(0,v)),'0.05'));
  if(blocked.length)root.append(el('p',{className:'state-warn',textContent:`${partOf(flat,blocked[0]).label} passt nicht hinein: Motoren und Teile unter der Platte bleiben draußen.`}));
  const show=el('input',{type:'checkbox',checked:this.showCase});show.dataset.caseShow='true';show.onchange=()=>{this.showCase=show.checked;this.refresh();};const zip=el('button',{textContent:'📦 Gehäuse als ZIP',className:'primary'});zip.dataset.caseZip='true';zip.disabled=!!blocked.length||!flat.items.length;zip.onclick=()=>void this.exportCase(flat,b.label);root.append(el('label',{className:'check'},show,'In der Ansicht zeigen'),zip);
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
  // The net knows the room only: what hangs on a shaft goes where it stands now.
  const frames=this.frames(),room=structuredClone(b);for(const x of [...room.items,...room.plates])if(x.free&&shaftOfBody(x.free.body))x.free={frame:worldOf(x.free,frames)};
  w.postMessage({kind:'net',build:room,settings:{bracing:n.bracing,load:n.load}});this.renderProperties();
 }
 /** Fixed, a zone, or open; on a model a zone with a goal. Asking for a place on a plate takes effect at once. */
 private placeFields(root:HTMLElement,b:Build,i:BuildItem,p:Part,number:NumberField,select:SelectField,set:(m:string,f:(x:BuildItem)=>void)=>void){
  const onPlate=!!i.plate,mode=i.wish?.mode??'fixed',solved=(message:string,fn:(x:BuildItem)=>void)=>{let failed:string[]=[];this.host.change(()=>{const x=this.build()!,y=x.items.find(z=>z.id===i.id);if(y)fn(y);failed=solveBuild(x);},message);if(failed.length){const now=this.build()!;this.host.status(`Kein Platz für ${failed.map(id=>{const q=now.items.find(z=>z.id===id);return q?partOf(now,q).label:id;}).join(', ')}: größere Platte oder größerer Bereich.`);}};
  if(!onPlate&&!this.attached)return;
  root.append(select('Platz',mode,onPlate?[['fixed','🔒 Fest'],['zone','↔ Bereich: ungefähr hier'],['auto','✨ Auto: egal wo']]:[['fixed','🔒 Fest'],['zone','↔ Bereich: ungefähr hier']],v=>{if(v==='fixed')solved('Platz fest',x=>{delete x.wish;});else if(v==='auto')solved('Platz automatisch',x=>{x.wish={mode:'auto',center:[],size:[],goal:'middle'};});else if(onPlate)solved('Bereich gesetzt',x=>{x.wish={mode:'zone',center:[...x.at],size:[60,60],goal:'middle'};});else set('Bereich gesetzt',x=>{x.wish={mode:'zone',center:[...worldOf(x.free!,this.frames()).position],size:[80],goal:'middle'};});}));
  const w=i.wish;if(!w||w.mode!=='zone')return;
  if(onPlate){(['Mitte X','Mitte Y'] as const).forEach((l,k)=>root.append(number(`${l} [mm]`,w.center[k],n=>solved('Bereich geändert',x=>{x.wish!.center[k]=n;}),'1')));(['Breite','Tiefe'] as const).forEach((l,k)=>root.append(number(`Bereich ${l} [mm]`,w.size[k],n=>solved('Bereich geändert',x=>{x.wish!.size[k]=Math.max(1,n);}),'5')));return;}
  root.append(number('Radius [mm]',w.size[0],n=>set('Bereich geändert',x=>{x.wish!.size[0]=Math.max(5,n);}),'10'),select('Ziel',w.goal,[['middle','möglichst mittig im Bereich'],['axis','kurzer Hebel zu den Achsen (Gewicht)']],v=>set('Ziel geändert',x=>{x.wish!.goal=v as 'middle'|'axis';})));
  const go=el('button',{textContent:'✨ Platz suchen',className:'primary'});go.dataset.findPlace='true';go.onclick=()=>void this.findPlace(i.id,p);root.append(go);
 }
 /** A place on the model in the ball: lying on a surface, free of the rest, in every pose, the best by the goal. */
 private async findPlace(id:string,p:Part){
  const b=this.build(),i=b?.items.find(x=>x.id===id),ctx=this.host.model(),w=i?.wish;if(!b||!i||!ctx||!w)return;this.host.status('Platz wird gesucht …');await new Promise(r=>setTimeout(r));
  const frames=this.frames(),points=surfacePoints(ctx.m,ctx.drives,ctx.assets,frames,w.center as V,w.size[0],6),others=b.items.filter(x=>x.id!==id).map(x=>{const q=partBox(partOf(b,x),standing(b,x,frames));return {gap:Math.max(i.clearance,x.clearance),h:hull(q.frame,q.center,q.half)};}),found:{frame:Frame;body:string;score:number;lever:number}[]=[];
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
