// Gear trains in the Studio: wheels dragged from the store into an upright plane, shafts running through it. A wheel
// snaps to the mesh distance of a neighbour or onto a shaft; the ratio is read off what meshes. A button makes the
// train a mechanism, and from there on it is one like any other.
import * as THREE from 'three';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';
import {legoParts} from './graph/lego-parts';
import {inputsOf,outputsOf,setEnds,motion,trainNotes,nodeOf,rackMeshes,rackBody,beltLength,legoGears,snapWheel,meshes,ratioOf,trainIssues,compileTrain,pitchOf,outerOf,newTrain,partnerOf,around,DEFAULT_ANGLE} from './parts/train';
import type {Train,Wheel,Rack,Shaft} from './parts/train';
import {compose} from './kinematics/math';
import type {Frame,V} from './kinematics/math';
import type {Build} from './parts/build';
import {joinShaft} from './parts/groups';
import {planetGearbox,along} from './demos';
import type {Demo} from './demos';
import {driveCatalog} from './kinematics/drive';

export type TrainHost={build:()=>Build|undefined;change:(edit:()=>void,message:string)=>void;status:(text:string)=>void;leave:()=>void;/** Clears the other selections. */pick:()=>void;canvas:()=>HTMLCanvasElement;ray:(e:{clientX:number;clientY:number})=>THREE.Raycaster;root:()=>THREE.Object3D;orbit:(on:boolean)=>void;
 /** A finished train or block becomes the project's mechanism; `consume`: the wheels here go into it. */adopt:(d:Demo,consume?:boolean)=>void;
 /** The train to change, made with the first wheel (inside a change). */ensure:()=>Train;
 /** The project has a mechanism already: a train or block cannot become a second one. */mechanism:()=>boolean;
 /** Bodies a shaft can sit on (key, name), and putting it there ('' : the world). */bodies?:(shaft:string)=>[string,string][];attachShaft?:(shaft:string,body:string)=>void;
 /** The Studio's phase: the wheels become a mechanism with bearings and frame in ③. */phase?:()=>number;
 /** The rigid group a wheel moves with, its wheels, and a move of it (room coordinates: x, along the shafts, height). */
 unit?:(wheel:string)=>{id:string;label:string;wheels:Set<string>}|undefined;moveUnit?:(unit:string,delta:[number,number,number],message:string)=>void};
type Drag={wheel:Wheel;isNew:boolean;moved:boolean;over:boolean;start:[number,number];at:[number,number];shaft?:string;partner?:string;angle?:number};
const el=<K extends keyof HTMLElementTagNameMap>(tag:K,props:Record<string,unknown>={},...children:(Node|string)[]):HTMLElementTagNameMap[K]=>{const e=document.createElement(tag);Object.assign(e,props);e.append(...children);return e;};
const heading=(text:string)=>el('h2',{textContent:text});
const shapes=new Map<string,Promise<THREE.BufferGeometry>>();
function modelOf(id:string){let g=shapes.get(id);if(!g){g=new STLLoader().loadAsync(`./mechanics-assets/ldraw/meshes/${id}.stl`).then(x=>{x.computeVertexNormals();return x;});shapes.set(id,g);}return g;}
export const label=(w:Wheel)=>w.pulley?`GT2 z${w.teeth}`:`${w.part?'LEGO':'Gedruckt'} z${w.teeth}${w.part?'':` m${w.module}`}`;
const deg=(a:number)=>`${Math.round(a*10)/10}°`.replace('.',',');
/** The two grids: mm for a wheel standing alone, degrees around the wheel it meshes with. */
const gridOf=(t:Train|undefined)=>({mm:t?.grid??1,angle:t?.angle??DEFAULT_ANGLE,target:!!t?.target&&(t?.grid??1)>0});

/** What drives a new input: a LEGO axle by hand for LEGO, else the first motor. */
const driveFor=(w:Wheel)=>w.part?'lego-achse':driveCatalog.find(d=>d.id!=='lego-achse')!.id;
const partnerText=(t:Train,d:Drag)=>{const o=t.wheels.find(w=>w.id===d.partner);return o&&d.angle!==undefined?`, kämmt mit ${label(o)} unter ${deg(d.angle)}`:'';};

export class TrainEditor{
 /** A wheel is selected. */
 get selectedId(){return this.selected;}
 select(id?:string){this.selected=id;this.shaftSel=undefined;this.rackSel=undefined;}
 /** A rack is selected. */
 private rackSel?:string;
 get rackId(){return this.rackSel;}
 selectRack(id?:string){this.rackSel=id;this.selected=undefined;this.shaftSel=undefined;}
 /** A shaft is selected: a part of its own, with its connection and its ends. */
 private shaftSel?:string;
 get shaftId(){return this.shaftSel;}
 selectShaft(id?:string){this.shaftSel=id;this.selected=undefined;this.rackSel=undefined;}
 private selected?:string;private drag?:Drag;private loaded=new Map<string,THREE.BufferGeometry>();private sun=legoGears.find(p=>p.teeth===16)?.id??legoGears[0].id;private planet=legoGears.find(p=>p.teeth===16)?.id??legoGears[0].id;
 onChange=()=>{};
 /** How far each input is turned (degrees, by shaft): every wheel and part that hangs on it turns with its rate. */
 private turns:Record<string,number>={};private spins=new Map<string,THREE.Object3D>();
 /** What sits on a shaft that rides on something: placed from the frames every time they change. */
 private riders:{object:THREE.Object3D;body:string;offset:V;turn:boolean}[]=[];private bars=new Map<string,{object:THREE.Object3D;rack:Rack}>();
 get turnsNow():Readonly<Record<string,number>>{return this.turns;}
 constructor(private host:TrainHost){}
 private train():Train|undefined{return this.host.build()?.train;}
 reset(){this.selected=undefined;this.shaftSel=undefined;this.rackSel=undefined;this.drag=undefined;}
 /** The train as seen while dragging. */
 private shown():Train|undefined{const d=this.drag,t=this.train()??(d?.over?newTrain():undefined);if(!t||!d?.over)return t;const id=d.shaft??d.wheel.shaft,shafts=t.shafts.some(s=>s.id===id)?t.shafts.map(s=>s.id===id&&!d.shaft?{...s,at:d.at}:s):[...t.shafts,{id,at:d.at}];return {...t,shafts,wheels:[...t.wheels.filter(w=>w.id!==d.wheel.id),{...d.wheel,shaft:id}]};}
 draw(group:THREE.Group,lit:ReadonlySet<string>=new Set(),override?:Train){
  this.spins.clear();const t=override??this.shown();if(!t)return;const bad=new Set(trainIssues(t).flatMap(x=>x.wheels)),on=new Set(meshes(t).flat().map(w=>w.id));
  this.bars.clear();this.riders=[];
  for(const s of t.shafts){const list=t.wheels.filter(w=>w.shaft===s.id),screw=s.kind==='spindel';if(!list.length&&!screw)continue;const lo=list.length?Math.min(...list.map(w=>w.z-w.width/2))-8:(s.z??0)-(s.length??200)/2,hi=list.length?Math.max(...list.map(w=>w.z+w.width/2))+8:(s.z??0)+(s.length??200)/2,color=inputsOf(t).some(i=>i.shaft===s.id)?0x63cbb3:outputsOf(t).includes(s.id)?0xffb347:screw?0xc8a24a:0xc9d4db,r=screw?(s.d??8)/2:2.4,m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,hi-lo,16),new THREE.MeshStandardMaterial({color,roughness:.5}));m.position.set(s.at[0],(lo+hi)/2,s.at[1]);m.userData.shaft=s.id;group.add(m);if(s.on)this.riders.push({object:m,body:`welle:${s.id}`,offset:[0,(lo+hi)/2,0],turn:false});}
  for(const w of t.wheels){const s=t.shafts.find(x=>x.id===w.shaft)!,holder=new THREE.Group();holder.position.set(s.at[0],w.z,s.at[1]);holder.quaternion.set(...along.y);holder.userData.wheel=w.id;if(s.on)this.riders.push({object:holder,body:w.loose?`rad:${w.id}`:`welle:${s.id}`,offset:[0,w.z,0],turn:true});const spin=new THREE.Group();holder.add(spin);this.spins.set(w.id,spin);
   const color=bad.has(w.id)?0xff5a55:w.id===this.selected||lit.has(w.id)?0xffffff:w.pulley?0xd9a066:on.has(w.id)?0x8fb6d9:0xa9b4bd,material=new THREE.MeshStandardMaterial({color,roughness:.55}),geometry=w.part?this.loaded.get(w.part):undefined;
   if(w.pulley){const r=pitchOf(w),hub=new THREE.Mesh(new THREE.CylinderGeometry(r,r,w.width,40).rotateX(Math.PI/2),material);spin.add(hub);for(const z of [-1,1]){const flange=new THREE.Mesh(new THREE.CylinderGeometry(r+1.5,r+1.5,1,40).rotateX(Math.PI/2),material);flange.position.z=z*(w.width/2+.5);spin.add(flange);}const mark=new THREE.Mesh(new THREE.BoxGeometry(r*.9,1.2,w.width+2.2),new THREE.MeshBasicMaterial({color:0x553311}));mark.position.x=r*.45;spin.add(mark);}
   else if(geometry){const m=new THREE.Mesh(geometry,material);m.userData.shared=true;spin.add(m);}
   else{const m=new THREE.Mesh(new THREE.CylinderGeometry(pitchOf(w),pitchOf(w),w.width,48).rotateX(Math.PI/2),material);spin.add(m);const rim=new THREE.Mesh(new THREE.RingGeometry(pitchOf(w),outerOf(w),48),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:true,opacity:.6}));rim.position.z=w.width/2;spin.add(rim);
    if(w.part)void modelOf(w.part).then(g=>{this.loaded.set(w.part!,g);this.onChange();}).catch(()=>this.host.status(`LEGO-Modell fehlt: ${w.part}`));}
   group.add(holder);}
  // Belts: the loop round both pulleys, the straight runs on their outer tangents.
  for(const belt of t.belts??[]){const a=t.wheels.find(w=>w.id===belt.a),b=t.wheels.find(w=>w.id===belt.b);if(!a||!b||a.shaft===b.shaft)continue;const ca=t.shafts.find(s=>s.id===a.shaft)!.at,cb=t.shafts.find(s=>s.id===b.shaft)!.at,ra=pitchOf(a),rb=pitchOf(b),d=Math.hypot(cb[0]-ca[0],cb[1]-ca[1]);if(d<=Math.abs(ra-rb))continue;
   const th=Math.atan2(cb[1]-ca[1],cb[0]-ca[0]),be=Math.acos((ra-rb)/d),pts:THREE.Vector3[]=[],arc=(c:[number,number],r:number,from:number,to:number)=>{for(let k=0;k<=24;k++){const u=from+(to-from)*k/24;pts.push(new THREE.Vector3(c[0]+r*Math.cos(u),(a.z+b.z)/2,c[1]+r*Math.sin(u)));}};
   arc(ca,ra,th+be,th+2*Math.PI-be);arc(cb,rb,th-be,th+be);const line=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0x222222}));line.userData.belt=belt.id;group.add(line);}
  // Racks: a bar whose teeth lie on the pitch line, its back away from the wheel in it.
  const into=rackMeshes(t);for(const r of t.racks??[]){const m=into.find(x=>x.rack.id===r.id),s=m?t.shafts.find(x=>x.id===m.wheel.shaft):undefined,across=r.dir==='x'?1:0,side=s&&s.at[across]>r.at[across]?-1:1,thick=2.25*r.module+4,off=side*(thick/2-r.module);
   const bar=new THREE.Group();bar.userData.rack=r.id;const color=r.id===this.rackSel||lit.has(r.id)?0xffffff:m?0x9fd6a8:0xa9b4bd,material=new THREE.MeshStandardMaterial({color,roughness:.55}),size:[number,number,number]=r.dir==='x'?[r.length,r.width,thick]:[thick,r.width,r.length],box=new THREE.Mesh(new THREE.BoxGeometry(...size),material);box.position.set(r.dir==='x'?0:off,0,r.dir==='x'?off:0);bar.add(box);
   const pitch=Math.PI*r.module,n=Math.min(200,Math.floor(r.length/pitch));for(let k=0;k<n;k++){const v=-r.length/2+pitch*(k+.5),tooth=new THREE.Mesh(new THREE.BoxGeometry(...(r.dir==='x'?[pitch*.45,r.width,2*r.module]:[2*r.module,r.width,pitch*.45]) as [number,number,number]),material);tooth.position.set(r.dir==='x'?v:-side*r.module*.1,0,r.dir==='x'?-side*r.module*.1:v);bar.add(tooth);}
   group.add(bar);this.bars.set(r.id,{object:bar,rack:r});}
  this.spin(t);
 }
 /** Turns the drawn wheels to the inputs' angles. */
 private spin(t:Train){const {angle}=motion(t,this.turns),riding=new Set(t.shafts.filter(s=>s.on).map(s=>s.id));for(const w of t.wheels){const o=this.spins.get(w.id);if(o)o.rotation.z=riding.has(w.shaft)?0:(angle.get(nodeOf(w))??0)*Math.PI/180;}
  for(const {object,rack:r} of this.bars.values()){const v=Math.min(r.max,Math.max(r.min,angle.get(rackBody(r.id))??0));object.position.set(r.at[0]+(r.dir==='x'?v:0),r.z,r.at[1]+(r.dir==='h'?v:0));}}
 /** Places what rides on a moving body: its shaft's frame (with its own turn) times its place along it. */
 follow(frames:Record<string,Frame>){for(const r of this.riders){const f=frames[r.body];if(!f)continue;const p=compose(f,{position:r.offset,rotation:[0,0,0,1]});r.object.position.set(...p.position);r.object.quaternion.set(...f.rotation);if(r.turn)r.object.quaternion.multiply(new THREE.Quaternion(...along.y));}}
 get riding(){return this.riders.length>0;}
 /** The sliders under the view: one per input, turned by hand; the outputs read off. Returns whether there is one. */
 renderAxes(root:HTMLElement,moved:()=>void=()=>{}){
  const t=this.train(),ins=t?inputsOf(t):[];if(!t||!ins.length)return false;const outs=outputsOf(t),name=(s:string)=>{const w=t.wheels.find(x=>x.shaft===s);return w?label(w):'Welle';};
  const report=el('p',{id:'axes-outputs',className:'muted'}),show=()=>{const {angle,clash}=motion(t,this.turns);report.textContent=[...outs.map(o=>`Ausgang ${name(o)}: ${angle.has(o)?`${Math.round(angle.get(o)!*10)/10}°`:'hängt an keinem Eingang'}`),...clash.map(([a,b])=>`${name(a)} und ${name(b)} sperren sich`)].join(' · ').replace(/(\d)\.(\d)/g,'$1,$2');};
  root.append(el('h3',{textContent:'Zahnräder drehen'}));
  for(const i of ins){const value=this.turns[i.shaft]??0,slider=el('input',{type:'range',min:'-720',max:'720',step:'1',value:String(value)});slider.dataset.axis='Zahnräder';slider.dataset.input=i.shaft;slider.setAttribute('aria-label',`Eingang ${name(i.shaft)} drehen`);const out=el('output',{textContent:`${value}°`});
   slider.oninput=()=>{this.turns[i.shaft]=Number(slider.value);out.textContent=`${slider.value}°`;show();this.spin(t);moved();};root.append(el('label',{className:'axis-row'},el('span',{textContent:`Eingang ${name(i.shaft)}`}),slider,out));}
  const zero=el('button',{textContent:'Alle auf Null'});zero.onclick=()=>{this.turns={};for(const s of root.querySelectorAll<HTMLInputElement>('input[data-input]')){s.value='0';(s.nextElementSibling as HTMLElement).textContent='0°';}show();this.spin(t);moved();};show();
  root.append(report,zero,el('p',{className:'muted',textContent:'Dreht die Eingänge von Hand: Jedes Rad und jedes Teil, das an einer Welle hängt, läuft mit, in jeder Phase und in Gruppen.'}));return true;}
 point(e:{clientX:number;clientY:number}):[number,number]|undefined{const root=this.host.root();root.updateWorldMatrix(true,false);const r=this.host.ray(e).ray.clone().applyMatrix4(root.matrixWorld.clone().invert()),hit=r.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),new THREE.Vector3());return hit?[hit.x,hit.z]:undefined;}
 wheelAt(ray:THREE.Raycaster,group:THREE.Group){group.updateWorldMatrix(true,true);let o:THREE.Object3D|null|undefined=ray.intersectObjects(group.children,true)[0]?.object;while(o&&!o.userData.wheel)o=o.parent;return o?.userData.wheel as string|undefined;}
 /** The rack or shaft under a ray. */
 pieceAt(ray:THREE.Raycaster,group:THREE.Group){group.updateWorldMatrix(true,true);let o:THREE.Object3D|null|undefined=ray.intersectObjects(group.children,true)[0]?.object;while(o&&!o.userData.rack&&!o.userData.shaft&&!o.userData.wheel&&!o.userData.item)o=o.parent;return o?.userData.rack?{rack:o.userData.rack as string}:o?.userData.shaft?{shaft:o.userData.shaft as string}:undefined;}
 hover(ray:THREE.Raycaster,group:THREE.Group){return !!this.wheelAt(ray,group)||!!this.pieceAt(ray,group);}
 pointerDown(e:PointerEvent,ray:THREE.Raycaster,group:THREE.Group){
  const t=this.train(),id=this.wheelAt(ray,group),w=t?.wheels.find(x=>x.id===id),piece=id?undefined:this.pieceAt(ray,group);
  if(piece){if(piece.rack)this.selectRack(piece.rack);else this.selectShaft(piece.shaft);this.host.leave();return;}
  this.select(id);this.host.leave();if(!t||!w)return;
  const s=t.shafts.find(x=>x.id===w.shaft)!;this.host.orbit(false);this.drag={wheel:structuredClone(w),isNew:false,moved:false,over:true,start:[e.clientX,e.clientY],at:s.at};this.track();
 }
 /** A rack or a lead screw from the library, dropped where the pointer meets the train's plane: a rack lies against the
  * pitch circle of the wheel nearest to it, on the side of the pointer; a lead screw becomes a shaft of its own. */
 private startPiece(kind:'rack'|'spindle',e:PointerEvent){const start=[e.clientX,e.clientY];
  const up=(ev:PointerEvent)=>{window.removeEventListener('pointerup',up);const moved=Math.hypot(ev.clientX-start[0],ev.clientY-start[1])>3,over=document.elementFromPoint(ev.clientX,ev.clientY)===this.host.canvas(),t=this.train(),p=moved&&over?this.point(ev):[t?.shafts.length?Math.max(...t.shafts.map(s=>s.at[0]))+80:0,0] as [number,number];if(!p||moved&&!over)return;
   const g=(v:number)=>Math.round(v);
   if(kind==='spindle'){const id='w-'+crypto.randomUUID().slice(0,8);this.host.change(()=>{const x=this.host.ensure();x.shafts.push({id,at:[g(p[0]),g(p[1])],kind:'spindel',lead:8,d:8,length:200,z:0});if(!inputsOf(x).length)setEnds(x,[{shaft:id,drive:driveCatalog.find(d=>d.id!=='lego-achse')!.id}],outputsOf(x));},'Gewindespindel gesetzt: eine Spindelmutter darauf ziehen.');this.selectShaft(id);this.host.leave();return;}
   const near=t?.wheels.map(w=>{const s=t.shafts.find(x=>x.id===w.shaft)!;return {w,s,d:Math.abs(Math.hypot(p[0]-s.at[0],p[1]-s.at[1])-pitchOf(w))};}).sort((a,b)=>a.d-b.d)[0],id='zs-'+crypto.randomUUID().slice(0,8);
   const r:Rack=near?{id,dir:'x',at:[g(p[0]),near.s.at[1]+(p[1]>=near.s.at[1]?1:-1)*pitchOf(near.w)],z:near.w.z,length:120,module:near.w.module,width:near.w.width,min:-50,max:50}:{id,dir:'x',at:[g(p[0]),g(p[1])],z:0,length:120,module:1,width:8,min:-50,max:50};
   this.host.change(()=>{const x=this.host.ensure();x.racks=[...(x.racks??[]),r];},near?`Zahnstange an ${label(near.w)} gelegt: sie schiebt, wenn es dreht.`:'Zahnstange gesetzt: an ein Zahnrad legen, damit sie schiebt.');this.selectRack(id);this.host.leave();};
  window.addEventListener('pointerup',up);}
 private startNew(w:Omit<Wheel,'id'|'shaft'|'z'>,e:PointerEvent){const id='r-'+crypto.randomUUID().slice(0,8);this.drag={wheel:{...w,id,shaft:'w-'+id,z:0},isNew:true,moved:false,over:false,start:[e.clientX,e.clientY],at:[0,0]};this.track();}
 private track(){const move=(e:PointerEvent)=>this.dragMove(e),up=(e:PointerEvent)=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);this.dragEnd();};window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);}
 private dragMove(e:PointerEvent){
  const d=this.drag,t=this.train()??newTrain();if(!d)return;if(Math.hypot(e.clientX-d.start[0],e.clientY-d.start[1])>3)d.moved=true;if(!d.moved)return;
  d.over=!d.isNew||document.elementFromPoint(e.clientX,e.clientY)===this.host.canvas();if(!d.over){this.onChange();return;}
  const p=this.point(e);if(!p)return;const g=gridOf(t),s=snapWheel(t,d.wheel,p,g.mm,e.altKey,g.angle,g.target);d.at=s.at;d.shaft=s.shaft;d.wheel.z=s.z;d.partner=s.partner;d.angle=s.angle;this.onChange();
  const o=t.wheels.find(w=>w.id===s.partner);this.host.status(s.shaft?'Auf die Welle stecken':o?`Am ${label(o)}: ${s.exact?`Rasterpunkt ${s.at.map(v=>Math.round(v*1000)/1000).join(' / ')} mm (${s.exact} exakte auf dem Kreis)`:s.exact===0?`${deg(s.angle!)}, kein exakter Rasterpunkt auf dem Kreis: Winkelraster`:deg(s.angle!)} · Alt: ohne Raster`:`Frei: ${s.at.map(v=>Math.round(v*10)/10).join(' / ')} mm · Alt: ohne Raster`);
 }
 private dragEnd(){
  const d=this.drag,t=this.train()??newTrain();this.drag=undefined;this.host.orbit(true);if(!d)return;
  if(d.isNew&&!d.moved){const x=t.shafts.length?Math.max(...t.shafts.map(s=>s.at[0]))+60:0;d.at=[x,0];d.over=true;}
  if(!d.moved&&!d.isNew||!d.over){this.onChange();return;}
  this.host.pick();this.selected=d.wheel.id;
  this.host.change(()=>{const x=this.host.ensure(),target=d.shaft??d.wheel.shaft;let wheel=x.wheels.find(w=>w.id===d.wheel.id);if(!wheel){wheel={...d.wheel,shaft:target};x.wheels.push(wheel);}const old=wheel.shaft;wheel.z=d.wheel.z;wheel.shaft=target;
   const s=x.shafts.find(y=>y.id===target);if(s){if(!d.shaft)s.at=d.at;}else x.shafts.push({id:target,at:d.at});
   if(old!==target&&!x.wheels.some(w=>w.shaft===old))x.shafts=x.shafts.filter(y=>y.id!==old||y.kind==='spindel');
   const bb=this.host.build();if(bb)joinShaft(bb,wheel);if(x.shafts.find(y=>y.id===target)?.fixed)wheel.loose=true;const known=(s:string)=>x.shafts.some(y=>y.id===s);let ins=inputsOf(x).filter(i=>known(i.shaft)),outs=outputsOf(x).filter(known);
   if(!ins.length)ins=[{shaft:target,drive:driveFor(wheel)}];else if(!outs.length&&!ins.some(i=>i.shaft===target))outs=[target];setEnds(x,ins,outs);},d.shaft?`${label(d.wheel)} sitzt auf der Welle.`:`${label(d.wheel)} ${d.isNew?'platziert':'verschoben'}${partnerText(t,d)}.`);
 }
 key(e:KeyboardEvent){if(e.key==='Delete'&&this.selected){this.remove();return true;}return false;}
 private remove(){const id=this.selected!;this.selected=undefined;this.host.change(()=>{const x=this.train()!;x.wheels=x.wheels.filter(w=>w.id!==id);if(x.belts){x.belts=x.belts.filter(g=>g.a!==id&&g.b!==id);if(!x.belts.length)delete x.belts;}x.shafts=x.shafts.filter(s=>s.kind==='spindel'||x.wheels.some(w=>w.shaft===s.id));const known=(s:string)=>x.shafts.some(y=>y.id===s);setEnds(x,inputsOf(x).filter(i=>known(i.shaft)),outputsOf(x).filter(known));},'Rad entfernt');}

 /** The library of a train: gears, and the planetary stage as a block. */
 renderStore(root:HTMLElement){
  const g=gridOf(this.train()),grid=(text:string,key:'grid'|'angle',value:number,options:[number,string][])=>{const s=el('select');s.dataset.field=text;for(const [v,l] of options)s.add(new Option(l,String(v)));s.value=String(value);s.onchange=()=>this.host.change(()=>{this.host.ensure()[key]=Number(s.value);},`${text}: ${s.selectedOptions[0].text}`);return el('label',{},text,s);};
  const target=el('input',{type:'checkbox',checked:g.target,disabled:!(g.mm>0)});target.dataset.field='Zielraster';target.onchange=()=>this.host.change(()=>{this.host.ensure().target=target.checked;},target.checked?'Zielraster: Wellen landen nur auf exakten Rasterpunkten.':'Zielraster aus.');
  root.append(grid('Raster [mm]','grid',g.mm,[[0,'frei'],[0.5,'0,5 mm'],[1,'1 mm'],[2,'2 mm'],[5,'5 mm'],[8,'8 mm (LEGO)']]),el('label',{className:'check',title:'Am Nachbarrad nur Rasterpunkte, auf denen der Achsabstand exakt stimmt. Meist wenige; gibt es keinen, gilt das Winkelraster.'},target,'Zielraster: Welle auch am Nachbarrad auf dem Raster'),grid('Winkelraster am Nachbarrad','angle',g.angle,[[0,'frei'],[5,'5°'],[10,'10°'],[15,'15°'],[30,'30°'],[45,'45°'],[90,'90°']]),el('p',{className:'muted',textContent:g.target?'Ein Rad allein rastet im mm-Raster, am Nachbarrad auf den Rasterpunkten mit exaktem Achsabstand; gibt es dort keinen, gilt das Winkelraster. Alt beim Ziehen: ohne Raster.':'Ein Rad allein rastet im mm-Raster. Am Nachbarrad gibt der Eingriff den Abstand vor, gerastet wird der Winkel. Alt beim Ziehen: ohne Raster.'}));
  const list=el('div',{className:'part-store'});
  for(const p of [...legoGears].sort((a,b)=>a.teeth-b.teeth)){const row=el('div',{className:'part-card',title:p.name},el('strong',{textContent:`LEGO z${p.teeth}`}),el('small',{textContent:`${p.name.replace(/^Technic /,'')} · ${p.size[2]} mm breit`}));row.dataset.gear=p.id;row.onpointerdown=e=>{e.preventDefault();this.startNew({teeth:p.teeth,module:1,width:p.size[2],part:p.id},e);};list.append(row);}
  const printed=el('div',{className:'part-card',title:'Zähne und Modul rechts einstellen.'},el('strong',{textContent:'Gedrucktes Stirnrad'}),el('small',{textContent:'Zähne, Modul und Breite einstellbar'}));printed.dataset.gear='gedruckt';printed.onpointerdown=e=>{e.preventDefault();this.startNew({teeth:20,module:1.5,width:10},e);};list.append(printed);root.append(list);
  const rack=el('div',{className:'part-card',title:'An ein Zahnrad ziehen: Sie legt sich an seinen Teilkreis und schiebt, wenn es dreht.'},el('strong',{textContent:'Zahnstange (gedruckt)'}),el('small',{textContent:'Modul wie das Rad, Länge einstellbar · Drehen → Schieben'}));rack.dataset.rack='neu';rack.onpointerdown=e=>{e.preventDefault();this.startPiece('rack',e);};
  const screw=el('div',{className:'part-card',title:'In die Ansicht ziehen; eine Spindelmutter darauf ziehen, sie wandert mit.'},el('strong',{textContent:'Gewindespindel TR8'}),el('small',{textContent:'8 mm Steigung je Umdrehung · Drehen → Schieben'}));screw.dataset.spindle='neu';screw.onpointerdown=e=>{e.preventDefault();this.startPiece('spindle',e);};
  for(const z of [16,20,40]){const p=el('div',{className:'part-card',title:'Zwei Scheiben auf verschiedene Wellen, dann bei einer „Riemen zu …“ wählen.'},el('strong',{textContent:`GT2-Riemenscheibe z${z}`}),el('small',{textContent:`Teilkreis Ø ${(2*z/Math.PI).toFixed(1).replace('.',',')} mm · 6 mm Riemen`}));p.dataset.gear=`gt2-${z}`;p.onpointerdown=e=>{e.preventDefault();this.startNew({teeth:z,module:1,width:6,pulley:true},e);};list.append(p);}
  list.append(rack,screw);
  root.append(el('div',{className:'tree-group',textContent:'Bausteine'}));
  const choice=(text:string,value:string,write:(v:string)=>void)=>{const s=el('select');s.dataset.planet=text;for(const p of legoGears)s.add(new Option(`LEGO z${p.teeth}`,p.id));s.value=value;s.onchange=()=>{write(s.value);this.host.leave();};return el('label',{},text,s);};
  const teeth=(id:string)=>legoParts.find(p=>p.id===id)!.teeth,zs=teeth(this.sun),zp=teeth(this.planet),zr=zs+2*zp;
  const go=el('button',{textContent:'＋ Planetenstufe anlegen',className:'primary'});go.dataset.planetMake='true';go.disabled=this.host.mechanism()||!!this.train()?.wheels.length;go.title=this.host.mechanism()?'Das Projekt hat schon einen Mechanismus. Für eine Planetenstufe ein neues Projekt anlegen.':go.disabled?'Das Projekt hat schon Zahnräder. Für eine Planetenstufe ein neues Projekt anlegen.':'';go.onclick=()=>{const name=`Planetengetriebe z${zs}/z${zp}`;this.host.adopt(planetGearbox({id:`planet-${crypto.randomUUID().slice(0,8)}`,label:name,sun:this.sun,planet:this.planet}));};
  root.append(el('details',{className:'templates'},el('summary',{textContent:'Planetenstufe (Sonne, 3 Planeten, Hohlrad)'}),choice('Sonne',this.sun,v=>{this.sun=v;}),choice('Planeten',this.planet,v=>{this.planet=v;}),el('p',{className:'muted',textContent:`Hohlrad z${zr} gedruckt, 1 : ${(1+zr/zs).toFixed(2).replace('.',',')}`}),go));
 }
 private rackPage(root:HTMLElement,t:Train,r:Rack,set:(m:string,fn:(x:Train)=>void)=>void,number:(text:string,value:number,write:(n:number)=>void,step?:string)=>HTMLElement){
  const edit=(m:string,fn:(y:Rack)=>void)=>set(m,x=>{const y=x.racks?.find(z=>z.id===r.id);if(y)fn(y);}),into=rackMeshes(t).filter(m=>m.rack.id===r.id),{angle}=motion(t,this.turns);
  const dir=el('select');dir.dataset.field='Richtung';dir.add(new Option('waagerecht (x)','x'));dir.add(new Option('senkrecht (Höhe)','h'));dir.value=r.dir;dir.onchange=()=>edit('Richtung geändert',y=>{y.dir=dir.value as Rack['dir'];});
  root.append(el('h3',{textContent:`Zahnstange m${r.module}`}),el('p',{id:'rack-mesh',className:into.length?'state-pass':'muted',textContent:into.length?`Greift in ${into.map(m=>label(m.wheel)).join(', ')}: ${(Math.abs(into[0].mm)*360).toFixed(1).replace('.',',')} mm je Umdrehung · jetzt ${(angle.get(rackBody(r.id))??0).toFixed(1).replace('.',',')} mm`:'Greift in kein Rad: an den Teilkreis eines Rads legen (Höhe = Wellenhöhe ± Teilkreisradius).'}),
   el('label',{},'Richtung',dir),number('Mitte X [mm]',r.at[0],n=>edit('Zahnstange verschoben',y=>{y.at[0]=n;}),'1'),number('Höhe der Teillinie [mm]',r.at[1],n=>edit('Zahnstange verschoben',y=>{y.at[1]=n;}),'0.5'),number('Lage auf den Wellen [mm]',r.z,n=>edit('Zahnstange verschoben',y=>{y.z=n;})),
   number('Länge [mm]',r.length,n=>edit('Länge geändert',y=>{y.length=Math.max(10,n);}),'5'),number('Modul',r.module,n=>edit('Modul geändert',y=>{y.module=Math.max(.3,n);}),'0.25'),number('Breite [mm]',r.width,n=>edit('Breite geändert',y=>{y.width=Math.max(1,n);})),
   number('Weg von [mm]',r.min,n=>edit('Weg geändert',y=>{y.min=Math.min(n,y.max);}),'5'),number('Weg bis [mm]',r.max,n=>edit('Weg geändert',y=>{y.max=Math.max(n,y.min);}),'5'));
  const remove=el('button',{textContent:'Entfernen',className:'danger'});remove.dataset.remove='true';remove.onclick=()=>{this.rackSel=undefined;set('Zahnstange entfernt',x=>{x.racks=(x.racks??[]).filter(y=>y.id!==r.id);});};root.append(el('div',{className:'button-row'},remove));}
 private spindlePage(root:HTMLElement,t:Train,s:Shaft,set:(m:string,fn:(x:Train)=>void)=>void,number:(text:string,value:number,write:(n:number)=>void,step?:string)=>HTMLElement){
  const edit=(m:string,fn:(y:Shaft)=>void)=>set(m,x=>{const y=x.shafts.find(z=>z.id===s.id);if(y)fn(y);}),ins=inputsOf(t),isIn=ins.find(i=>i.shaft===s.id),kinds=driveCatalog.filter(d=>d.id!=='lego-achse');
  const input=el('input',{type:'checkbox',checked:!!isIn});input.dataset.setInput='true';input.onchange=()=>set(input.checked?'Eingang gesetzt':'Kein Eingang mehr',x=>{const i=inputsOf(x);setEnds(x,input.checked?[...i,{shaft:s.id,drive:kinds[0].id}]:i.filter(y=>y.shaft!==s.id),outputsOf(x));});
  root.append(el('h3',{textContent:`Gewindespindel Tr${s.d??8} × ${s.lead??8}`}),el('p',{className:'muted',textContent:'Eine Spindelmutter aus „Mechanik“ darauf ziehen: Sie wandert je Umdrehung um die Steigung.'}),
   number('X der Welle [mm]',s.at[0],n=>edit('Spindel verschoben',y=>{y.at[0]=n;}),'1'),number('Höhe der Welle [mm]',s.at[1],n=>edit('Spindel verschoben',y=>{y.at[1]=n;}),'1'),number('Mitte auf der Achse [mm]',s.z??0,n=>edit('Spindel verschoben',y=>{y.z=n;}),'1'),
   number('Länge [mm]',s.length??200,n=>edit('Länge geändert',y=>{y.length=Math.max(10,n);}),'10'),number('Steigung [mm/U]',s.lead??8,n=>edit('Steigung geändert',y=>{y.lead=Math.max(.1,n);}),'0.5'),number('Ø [mm]',s.d??8,n=>edit('Durchmesser geändert',y=>{y.d=Math.max(1,n);}),'0.5'),
   el('label',{className:'check'},input,'Eingang: wird angetrieben'));
  if(isIn){const d=el('select');d.dataset.field='Antrieb';for(const k of kinds)d.add(new Option(k.label,k.id));d.value=kinds.some(k=>k.id===isIn.drive)?isIn.drive:kinds[0].id;d.onchange=()=>set('Antrieb geändert',x=>{setEnds(x,inputsOf(x).map(y=>y.shaft===s.id?{...y,drive:d.value}:y),outputsOf(x));});root.append(el('label',{},'Antrieb',d));}
  const remove=el('button',{textContent:'Entfernen',className:'danger'});remove.dataset.remove='true';remove.onclick=()=>{this.shaftSel=undefined;set('Spindel entfernt',x=>{x.shafts=x.shafts.filter(y=>y.id!==s.id);setEnds(x,inputsOf(x).filter(i=>i.shaft!==s.id),outputsOf(x).filter(o=>o!==s.id));});};root.append(el('div',{className:'button-row'},remove));}
 renderProperties(root:HTMLElement){
  const t=this.train(),b=this.host.build();if(!t||!b)return;
  const set=(message:string,fn:(x:Train)=>void)=>this.host.change(()=>fn(this.train()!),message);
  const number=(text:string,value:number,write:(n:number)=>void,step='0.5')=>{const input=el('input',{type:'number',step,value:String(Math.round(value*1000)/1000)});input.dataset.field=text;input.setAttribute('aria-label',text);input.onchange=()=>{const n=Number(input.value);if(Number.isFinite(n))write(n);};return el('label',{},text,input);};
  const bare=this.shaftSel?t.shafts.find(s=>s.id===this.shaftSel&&s.kind==='spindel'&&!t.wheels.some(w=>w.shaft===s.id)):undefined;if(bare){this.spindlePage(root,t,bare,set,number);return;}
  const rk=t.racks?.find(r=>r.id===this.rackSel);if(rk){this.rackPage(root,t,rk,set,number);return;}
  // A shaft's page shows the shaft (its first wheel stands for it in moves), a wheel's page the wheel.
  const shaftMode=!!this.shaftSel&&!this.selected,w=shaftMode?t.wheels.find(x=>x.shaft===this.shaftSel):t.wheels.find(x=>x.id===this.selected),lego=t.wheels.some(x=>x.part),kinds=driveCatalog.filter(d=>lego?d.id==='lego-achse':d.id!=='lego-achse'),ins=inputsOf(t),outs=outputsOf(t),name=(s:string)=>{const x=t.wheels.find(y=>y.shaft===s);return x?label(x):'Welle';};
  if(w){const s=t.shafts.find(x=>x.id===w.shaft)!,wheel=(message:string,fn:(y:Wheel)=>void)=>set(message,x=>{const y=x.wheels.find(z=>z.id===w.id);if(y)fn(y);}),shaft=(fn:(at:[number,number])=>void)=>set('Welle verschoben',x=>{const y=x.shafts.find(z=>z.id===s.id);if(y)fn(y.at);});
   // In a rigid group the axis distances are fixed: a place set here moves the whole group.
   const unit=this.host.unit?.(w.id),move=(delta:[number,number,number],message:string)=>this.host.moveUnit?.(unit!.id,delta,`${unit!.label}: ${message}`);
   root.append(el('h3',{textContent:shaftMode?`${s.fixed?'Achse':'Welle'} · ${t.wheels.filter(x=>x.shaft===s.id).map(label).join(', ')}`:label(w)}));
   if(unit)root.append(el('p',{className:'muted',textContent:`In der festen Gruppe „${unit.label}“: Die Achsabstände sind fest, Lage und Winkel verschieben die ganze Gruppe.`}));
   root.append(number('X der Welle [mm]',s.at[0],n=>unit?move([n-s.at[0],0,0],'verschoben'):shaft(a=>{a[0]=n;}),'1'),number('Höhe der Welle [mm]',s.at[1],n=>unit?move([0,0,n-s.at[1]],'verschoben'):shaft(a=>{a[1]=n;}),'1'));
   if(shaftMode){
    // The shaft as a part: what it is, and its connection: it turns in its carrier, or it stands as an axle.
    const kind=el('select');kind.dataset.field='Welle aus';for(const [v,l] of [['lego','LEGO-Achse'],['gedruckt','gedruckt'],['stahl','Stahlwelle']])kind.add(new Option(l,v));kind.value=s.kind??(lego?'lego':'stahl');kind.onchange=()=>set('Welle geändert',x=>{const y=x.shafts.find(z=>z.id===s.id);if(y)y.kind=kind.value as 'lego'|'gedruckt'|'stahl';});
    const turn=el('select');turn.dataset.field='Verbindung der Welle';turn.add(new Option('dreht in ihrem Träger','dreht'));turn.add(new Option('steht fest (Achse: Räder laufen lose)','steht'));turn.value=s.fixed?'steht':'dreht';
    turn.onchange=()=>set(turn.value==='steht'?'Achse steht fest; die Räder darauf laufen lose.':'Welle dreht.',x=>{const y=x.shafts.find(z=>z.id===s.id);if(!y)return;if(turn.value==='steht'){y.fixed=true;for(const r of x.wheels)if(r.shaft===y.id)r.loose=true;}else delete y.fixed;});
    const on=el('select');on.dataset.field='Welle verbunden mit';on.add(new Option('der Welt',''));for(const [k,n] of this.host.bodies?.(s.id)??[])on.add(new Option(n,k));on.value=s.on?.body??'';on.onchange=()=>this.host.attachShaft?.(s.id,on.value);
    root.append(heading('Welle'),el('label',{},'Verbunden mit',on),el('label',{},'Aus',kind),...(s.kind&&s.kind!=='lego'||!lego&&!s.kind?[number('Ø [mm]',s.d??5,n=>set('Durchmesser geändert',x=>{const y=x.shafts.find(z=>z.id===s.id);if(y)y.d=Math.max(1,n);}),'0.5')]:[]),el('label',{},'Verbindung',turn));}
   else{root.append(number('Lage auf der Welle [mm]',w.z,n=>unit?move([0,n-w.z,0],'auf den Wellen verschoben'):wheel('Rad verschoben',y=>{y.z=n;})));
    const on=el('select');on.dataset.field='Auf der Welle';on.add(new Option('fest: dreht mit der Welle','fest'));on.add(new Option('lose: läuft frei (Losrad)','lose'));on.value=w.loose?'lose':'fest';on.disabled=!!s.fixed&&!w.loose;on.onchange=()=>wheel(on.value==='lose'?`${label(w)} läuft lose.`:`${label(w)} fest auf der Welle.`,y=>{if(on.value==='lose')y.loose=true;else delete y.loose;});
    const open=el('button',{textContent:`${s.fixed?'Achse':'Welle'} ›`});open.dataset.openShaft='true';open.onclick=()=>{this.selectShaft(s.id);this.host.leave();};root.append(el('label',{},'Auf der Welle',on),open);}
   // The angle around a neighbour; in a rigid group only around one outside it.
   const pair=shaftMode?undefined:meshes(t).find(p=>p.some(x=>x.id===w.id)&&(!unit||p.some(x=>!unit.wheels.has(x.id)))),near=pair?partnerOf({...t,wheels:t.wheels.filter(x=>pair.includes(x))},w):undefined;
   if(near){const step=gridOf(t).angle;root.append(number(`Winkel am ${label(near.wheel)} [°]`,near.angle,n=>{const at=around(near.centre,near.distance,((n%360)+360)%360);if(unit)move([at[0]-s.at[0],0,at[1]-s.at[1]],'um das Rad außerhalb gedreht');else shaft(a=>{a[0]=at[0];a[1]=at[1];});},String(step||1)),el('p',{className:'muted',textContent:unit?'Setzt die ganze Gruppe so, dass dieses Rad unter dem Winkel am Rad außerhalb kämmt. 0° waagerecht, 90° darüber.':'Dreht die Welle um das Nachbarrad, der Achsabstand bleibt. 0° waagerecht, 90° darüber.'}));}
   if(!shaftMode&&w.pulley){root.append(number('Zähne',w.teeth,n=>wheel('Zähne geändert',y=>{y.teeth=Math.max(10,Math.round(n));}),'1'));
    const mates=t.wheels.filter(x=>x.pulley&&x.shaft!==w.shaft),belt=(t.belts??[]).find(g=>g.a===w.id||g.b===w.id),other=belt?(belt.a===w.id?belt.b:belt.a):'',to=el('select');to.dataset.field='Riemen zu';to.add(new Option('kein Riemen',''));for(const x of mates)to.add(new Option(`${label(x)} (Welle bei ${Math.round(t.shafts.find(s=>s.id===x.shaft)!.at[0])} / ${Math.round(t.shafts.find(s=>s.id===x.shaft)!.at[1])})`,x.id));to.value=other;
    to.onchange=()=>set(to.value?'Riemen gelegt':'Riemen entfernt',x=>{x.belts=(x.belts??[]).filter(g=>g.a!==w.id&&g.b!==w.id);if(to.value)x.belts.push({id:'riemen-'+crypto.randomUUID().slice(0,8),a:w.id,b:to.value});if(!x.belts.length)delete x.belts;});root.append(el('label',{},'Riemen zu',to));
    if(belt){const L=beltLength(t,belt);if(L)root.append(el('p',{id:'belt-length',className:'muted',textContent:`Riemen GT2 6 mm: ${L.length.toFixed(1).replace('.',',')} mm lang${L.stock?` · nächste Standardlänge ${L.stock} mm${Math.abs(L.stock-L.length)>.5?' (Achsabstand anpassen oder Spanner)':''}`:''}.`}));}}
   else if(shaftMode)void 0;else if(!w.part&&unit)root.append(el('p',{className:'muted',textContent:`Zähne z${w.teeth}, Modul ${w.module}, ${w.width} mm breit: in der festen Gruppe gesperrt, weil sie den Achsabstand ändern. Zum Ändern die Gruppe auf „frei“ stellen.`}));
   else if(!w.part)root.append(number('Zähne',w.teeth,n=>wheel('Zähne geändert',y=>{y.teeth=Math.max(6,Math.round(n));}),'1'),number('Modul',w.module,n=>wheel('Modul geändert',y=>{y.module=Math.max(.3,n);}),'0.25'),number('Breite [mm]',w.width,n=>wheel('Breite geändert',y=>{y.width=Math.max(1,n);})));
   // Ends of the shaft: several inputs and outputs in a train; a shaft is one or the other.
   const isIn=ins.find(i=>i.shaft===s.id),isOut=outs.includes(s.id),ends=(message:string,fn:(i:typeof ins,o:string[])=>[typeof ins,string[]])=>set(message,x=>{const [i,o]=fn(inputsOf(x),outputsOf(x));setEnds(x,i,o);});
   const input=el('input',{type:'checkbox',checked:!!isIn});input.dataset.setInput='true';input.onchange=()=>ends(input.checked?'Eingang gesetzt':'Kein Eingang mehr',(i,o)=>input.checked?[[...i,{shaft:s.id,drive:kinds[0].id}],o.filter(y=>y!==s.id)]:[i.filter(y=>y.shaft!==s.id),o]);
   const output=el('input',{type:'checkbox',checked:isOut});output.dataset.setOutput='true';output.onchange=()=>ends(output.checked?'Ausgang gesetzt':'Kein Ausgang mehr',(i,o)=>output.checked?[i.filter(y=>y.shaft!==s.id),[...o,s.id]]:[i,o.filter(y=>y!==s.id)]);
   if(shaftMode)root.append(el('label',{className:'check'},input,'Eingang: wird angetrieben'),el('label',{className:'check'},output,'Ausgang'));
   if(shaftMode&&isIn){const d=el('select');d.dataset.field='Antrieb';for(const k of kinds)d.add(new Option(k.label,k.id));d.value=kinds.some(k=>k.id===isIn.drive)?isIn.drive:kinds[0].id;d.onchange=()=>ends('Antrieb geändert',(i,o)=>[i.map(y=>y.shaft===s.id?{...y,drive:d.value}:y),o]);root.append(el('label',{},'Antrieb an diesem Eingang',d));}
   if(!shaftMode){const remove=el('button',{textContent:'Entfernen',className:'danger'});remove.dataset.remove='true';remove.onclick=()=>this.remove();root.append(el('div',{className:'button-row'},remove));}}
  const found=trainIssues(t),pairs=ins.flatMap(i=>outs.map(o=>({i:i.shaft,o,r:ratioOf(t,i.shaft,o)}))).filter(p=>p.r!==undefined);
  root.append(heading('Getriebe'),el('p',{id:'train-ratio',className:pairs.length?'state-pass':'muted',textContent:pairs.length?pairs.map(p=>`${name(p.i)} → ${name(p.o)}: 1 : ${Math.abs(p.r!).toFixed(2).replace('.',',')}, ${p.r!>0?'gleichsinnig':'gegensinnig'}`).join(' · '):'Noch keine Verbindung von einem Eingang zu einem Ausgang.'}),
   el('p',{className:'muted',textContent:`${ins.length} Eingang${ins.length===1?'':'e'}, ${outs.length} Ausgang${outs.length===1?'':'e'}: an der Welle eines Rads einstellen.`}));
  const box=el('div',{id:'build-issues'});for(const f of found)box.append(el('p',{className:'state-fail',textContent:f.message}));if(!found.length)box.append(el('p',{className:'state-pass',textContent:'✓ Alle Räder kämmen und drehen frei.'}));for(const n of trainNotes(t))box.append(el('p',{className:'muted',textContent:n}));root.append(heading('Prüfung'),box);
  root.append(el('p',{className:'muted',textContent:this.host.mechanism()?'Das Projekt hat schon einen Mechanismus: Getriebe für seine Achsen findet die Suche am Antrieb.':'Drehen: unten mit den Reglern. Lager & Wellen und Struktur entstehen in „③ Fertigen“ direkt aus diesen Rädern, links im Szenenbaum.'}));
 }
}
