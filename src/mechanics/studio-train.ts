// Gear trains in the Studio: wheels dragged from the store into an upright plane, shafts running through it. A wheel
// snaps to the mesh distance of a neighbour or onto a shaft; the ratio is read off what meshes. A button makes the
// train a mechanism, and from there on it is one like any other.
import * as THREE from 'three';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';
import {legoParts} from './graph/lego-parts';
import {inputsOf,outputsOf,setEnds,motion,trainNotes,legoGears,snapWheel,meshes,ratioOf,trainIssues,compileTrain,pitchOf,outerOf,newTrain,partnerOf,around,DEFAULT_ANGLE} from './parts/train';
import type {Train,Wheel} from './parts/train';
import type {Build} from './parts/build';
import {joinShaft} from './parts/groups';
import {planetGearbox,along} from './demos';
import type {Demo} from './demos';
import {driveCatalog} from './kinematics/drive';

export type TrainHost={build:()=>Build|undefined;change:(edit:()=>void,message:string)=>void;status:(text:string)=>void;leave:()=>void;/** Clears the other selections. */pick:()=>void;canvas:()=>HTMLCanvasElement;ray:(e:{clientX:number;clientY:number})=>THREE.Raycaster;root:()=>THREE.Object3D;orbit:(on:boolean)=>void;
 /** A finished train or block becomes the project's mechanism; `consume`: the wheels here go into it. */adopt:(d:Demo,consume?:boolean)=>void;
 /** The train to change, made with the first wheel (inside a change). */ensure:()=>Train;
 /** The project has a mechanism already: a train or block cannot become a second one. */mechanism:()=>boolean;
 /** The Studio's phase: the wheels become a mechanism with bearings and frame in ③. */phase?:()=>number;
 /** The rigid group a wheel moves with, its wheels, and a move of it (room coordinates: x, along the shafts, height). */
 unit?:(wheel:string)=>{id:string;label:string;wheels:Set<string>}|undefined;moveUnit?:(unit:string,delta:[number,number,number],message:string)=>void};
type Drag={wheel:Wheel;isNew:boolean;moved:boolean;over:boolean;start:[number,number];at:[number,number];shaft?:string;partner?:string;angle?:number};
const el=<K extends keyof HTMLElementTagNameMap>(tag:K,props:Record<string,unknown>={},...children:(Node|string)[]):HTMLElementTagNameMap[K]=>{const e=document.createElement(tag);Object.assign(e,props);e.append(...children);return e;};
const heading=(text:string)=>el('h2',{textContent:text});
const shapes=new Map<string,Promise<THREE.BufferGeometry>>();
function modelOf(id:string){let g=shapes.get(id);if(!g){g=new STLLoader().loadAsync(`./mechanics-assets/ldraw/meshes/${id}.stl`).then(x=>{x.computeVertexNormals();return x;});shapes.set(id,g);}return g;}
export const label=(w:Wheel)=>`${w.part?'LEGO':'Gedruckt'} z${w.teeth}${w.part?'':` m${w.module}`}`;
const deg=(a:number)=>`${Math.round(a*10)/10}°`.replace('.',',');
/** The two grids: mm for a wheel standing alone, degrees around the wheel it meshes with. */
const gridOf=(t:Train|undefined)=>({mm:t?.grid??1,angle:t?.angle??DEFAULT_ANGLE,target:!!t?.target&&(t?.grid??1)>0});

/** What drives a new input: a LEGO axle by hand for LEGO, else the first motor. */
const driveFor=(w:Wheel)=>w.part?'lego-achse':driveCatalog.find(d=>d.id!=='lego-achse')!.id;
const partnerText=(t:Train,d:Drag)=>{const o=t.wheels.find(w=>w.id===d.partner);return o&&d.angle!==undefined?`, kämmt mit ${label(o)} unter ${deg(d.angle)}`:'';};

export class TrainEditor{
 /** A wheel is selected. */
 get selectedId(){return this.selected;}
 select(id?:string){this.selected=id;}
 private selected?:string;private drag?:Drag;private loaded=new Map<string,THREE.BufferGeometry>();private sun=legoGears.find(p=>p.teeth===16)?.id??legoGears[0].id;private planet=legoGears.find(p=>p.teeth===16)?.id??legoGears[0].id;
 onChange=()=>{};
 /** How far each input is turned (degrees, by shaft): every wheel and part that hangs on it turns with its rate. */
 private turns:Record<string,number>={};private spins=new Map<string,THREE.Object3D>();
 get turnsNow():Readonly<Record<string,number>>{return this.turns;}
 constructor(private host:TrainHost){}
 private train():Train|undefined{return this.host.build()?.train;}
 reset(){this.selected=undefined;this.drag=undefined;}
 /** The train as seen while dragging. */
 private shown():Train|undefined{const d=this.drag,t=this.train()??(d?.over?newTrain():undefined);if(!t||!d?.over)return t;const id=d.shaft??d.wheel.shaft,shafts=t.shafts.some(s=>s.id===id)?t.shafts.map(s=>s.id===id&&!d.shaft?{...s,at:d.at}:s):[...t.shafts,{id,at:d.at}];return {...t,shafts,wheels:[...t.wheels.filter(w=>w.id!==d.wheel.id),{...d.wheel,shaft:id}]};}
 draw(group:THREE.Group,lit:ReadonlySet<string>=new Set(),override?:Train){
  this.spins.clear();const t=override??this.shown();if(!t)return;const bad=new Set(trainIssues(t).flatMap(x=>x.wheels)),on=new Set(meshes(t).flat().map(w=>w.id));
  for(const s of t.shafts){const list=t.wheels.filter(w=>w.shaft===s.id);if(!list.length)continue;const lo=Math.min(...list.map(w=>w.z-w.width/2))-8,hi=Math.max(...list.map(w=>w.z+w.width/2))+8,color=inputsOf(t).some(i=>i.shaft===s.id)?0x63cbb3:outputsOf(t).includes(s.id)?0xffb347:0xc9d4db,m=new THREE.Mesh(new THREE.CylinderGeometry(2.4,2.4,hi-lo,16),new THREE.MeshStandardMaterial({color,roughness:.5}));m.position.set(s.at[0],(lo+hi)/2,s.at[1]);m.userData.shaft=s.id;group.add(m);}
  for(const w of t.wheels){const s=t.shafts.find(x=>x.id===w.shaft)!,holder=new THREE.Group();holder.position.set(s.at[0],w.z,s.at[1]);holder.quaternion.set(...along.y);holder.userData.wheel=w.id;const spin=new THREE.Group();holder.add(spin);this.spins.set(w.id,spin);
   const color=bad.has(w.id)?0xff5a55:w.id===this.selected||lit.has(w.id)?0xffffff:on.has(w.id)?0x8fb6d9:0xa9b4bd,material=new THREE.MeshStandardMaterial({color,roughness:.55}),geometry=w.part?this.loaded.get(w.part):undefined;
   if(geometry){const m=new THREE.Mesh(geometry,material);m.userData.shared=true;spin.add(m);}
   else{const m=new THREE.Mesh(new THREE.CylinderGeometry(pitchOf(w),pitchOf(w),w.width,48).rotateX(Math.PI/2),material);spin.add(m);const rim=new THREE.Mesh(new THREE.RingGeometry(pitchOf(w),outerOf(w),48),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:true,opacity:.6}));rim.position.z=w.width/2;spin.add(rim);
    if(w.part)void modelOf(w.part).then(g=>{this.loaded.set(w.part!,g);this.onChange();}).catch(()=>this.host.status(`LEGO-Modell fehlt: ${w.part}`));}
   group.add(holder);}
  this.spin(t);
 }
 /** Turns the drawn wheels to the inputs' angles. */
 private spin(t:Train){const {angle}=motion(t,this.turns);for(const w of t.wheels){const o=this.spins.get(w.id);if(o)o.rotation.z=(angle.get(w.shaft)??0)*Math.PI/180;}}
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
 hover(ray:THREE.Raycaster,group:THREE.Group){return !!this.wheelAt(ray,group);}
 pointerDown(e:PointerEvent,ray:THREE.Raycaster,group:THREE.Group){
  const t=this.train(),id=this.wheelAt(ray,group),w=t?.wheels.find(x=>x.id===id);this.selected=id;this.host.leave();if(!t||!w)return;
  const s=t.shafts.find(x=>x.id===w.shaft)!;this.host.orbit(false);this.drag={wheel:structuredClone(w),isNew:false,moved:false,over:true,start:[e.clientX,e.clientY],at:s.at};this.track();
 }
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
   if(old!==target&&!x.wheels.some(w=>w.shaft===old))x.shafts=x.shafts.filter(y=>y.id!==old);
   const bb=this.host.build();if(bb)joinShaft(bb,wheel);const known=(s:string)=>x.shafts.some(y=>y.id===s);let ins=inputsOf(x).filter(i=>known(i.shaft)),outs=outputsOf(x).filter(known);
   if(!ins.length)ins=[{shaft:target,drive:driveFor(wheel)}];else if(!outs.length&&!ins.some(i=>i.shaft===target))outs=[target];setEnds(x,ins,outs);},d.shaft?`${label(d.wheel)} sitzt auf der Welle.`:`${label(d.wheel)} ${d.isNew?'platziert':'verschoben'}${partnerText(t,d)}.`);
 }
 key(e:KeyboardEvent){if(e.key==='Delete'&&this.selected){this.remove();return true;}return false;}
 private remove(){const id=this.selected!;this.selected=undefined;this.host.change(()=>{const x=this.train()!;x.wheels=x.wheels.filter(w=>w.id!==id);x.shafts=x.shafts.filter(s=>x.wheels.some(w=>w.shaft===s.id));const known=(s:string)=>x.shafts.some(y=>y.id===s);setEnds(x,inputsOf(x).filter(i=>known(i.shaft)),outputsOf(x).filter(known));},'Rad entfernt');}

 /** The library of a train: gears, and the planetary stage as a block. */
 renderStore(root:HTMLElement){
  const g=gridOf(this.train()),grid=(text:string,key:'grid'|'angle',value:number,options:[number,string][])=>{const s=el('select');s.dataset.field=text;for(const [v,l] of options)s.add(new Option(l,String(v)));s.value=String(value);s.onchange=()=>this.host.change(()=>{this.host.ensure()[key]=Number(s.value);},`${text}: ${s.selectedOptions[0].text}`);return el('label',{},text,s);};
  const target=el('input',{type:'checkbox',checked:g.target,disabled:!(g.mm>0)});target.dataset.field='Zielraster';target.onchange=()=>this.host.change(()=>{this.host.ensure().target=target.checked;},target.checked?'Zielraster: Wellen landen nur auf exakten Rasterpunkten.':'Zielraster aus.');
  root.append(grid('Raster [mm]','grid',g.mm,[[0,'frei'],[0.5,'0,5 mm'],[1,'1 mm'],[2,'2 mm'],[5,'5 mm'],[8,'8 mm (LEGO)']]),el('label',{className:'check',title:'Am Nachbarrad nur Rasterpunkte, auf denen der Achsabstand exakt stimmt. Meist wenige; gibt es keinen, gilt das Winkelraster.'},target,'Zielraster: Welle auch am Nachbarrad auf dem Raster'),grid('Winkelraster am Nachbarrad','angle',g.angle,[[0,'frei'],[5,'5°'],[10,'10°'],[15,'15°'],[30,'30°'],[45,'45°'],[90,'90°']]),el('p',{className:'muted',textContent:g.target?'Ein Rad allein rastet im mm-Raster, am Nachbarrad auf den Rasterpunkten mit exaktem Achsabstand; gibt es dort keinen, gilt das Winkelraster. Alt beim Ziehen: ohne Raster.':'Ein Rad allein rastet im mm-Raster. Am Nachbarrad gibt der Eingriff den Abstand vor, gerastet wird der Winkel. Alt beim Ziehen: ohne Raster.'}));
  const list=el('div',{className:'part-store'});
  for(const p of [...legoGears].sort((a,b)=>a.teeth-b.teeth)){const row=el('div',{className:'part-card',title:p.name},el('strong',{textContent:`LEGO z${p.teeth}`}),el('small',{textContent:`${p.name.replace(/^Technic /,'')} · ${p.size[2]} mm breit`}));row.dataset.gear=p.id;row.onpointerdown=e=>{e.preventDefault();this.startNew({teeth:p.teeth,module:1,width:p.size[2],part:p.id},e);};list.append(row);}
  const printed=el('div',{className:'part-card',title:'Zähne und Modul rechts einstellen.'},el('strong',{textContent:'Gedrucktes Stirnrad'}),el('small',{textContent:'Zähne, Modul und Breite einstellbar'}));printed.dataset.gear='gedruckt';printed.onpointerdown=e=>{e.preventDefault();this.startNew({teeth:20,module:1.5,width:10},e);};list.append(printed);root.append(list);
  root.append(el('div',{className:'tree-group',textContent:'Bausteine'}));
  const choice=(text:string,value:string,write:(v:string)=>void)=>{const s=el('select');s.dataset.planet=text;for(const p of legoGears)s.add(new Option(`LEGO z${p.teeth}`,p.id));s.value=value;s.onchange=()=>{write(s.value);this.host.leave();};return el('label',{},text,s);};
  const teeth=(id:string)=>legoParts.find(p=>p.id===id)!.teeth,zs=teeth(this.sun),zp=teeth(this.planet),zr=zs+2*zp;
  const go=el('button',{textContent:'＋ Planetenstufe anlegen',className:'primary'});go.dataset.planetMake='true';go.disabled=this.host.mechanism()||!!this.train()?.wheels.length;go.title=this.host.mechanism()?'Das Projekt hat schon einen Mechanismus. Für eine Planetenstufe ein neues Projekt anlegen.':go.disabled?'Das Projekt hat schon Zahnräder. Für eine Planetenstufe ein neues Projekt anlegen.':'';go.onclick=()=>{const name=`Planetengetriebe z${zs}/z${zp}`;this.host.adopt(planetGearbox({id:`planet-${crypto.randomUUID().slice(0,8)}`,label:name,sun:this.sun,planet:this.planet}));};
  root.append(el('details',{className:'templates'},el('summary',{textContent:'Planetenstufe (Sonne, 3 Planeten, Hohlrad)'}),choice('Sonne',this.sun,v=>{this.sun=v;}),choice('Planeten',this.planet,v=>{this.planet=v;}),el('p',{className:'muted',textContent:`Hohlrad z${zr} gedruckt, 1 : ${(1+zr/zs).toFixed(2).replace('.',',')}`}),go));
 }
 renderProperties(root:HTMLElement){
  const t=this.train(),b=this.host.build();if(!t||!b)return;
  const set=(message:string,fn:(x:Train)=>void)=>this.host.change(()=>fn(this.train()!),message);
  const number=(text:string,value:number,write:(n:number)=>void,step='0.5')=>{const input=el('input',{type:'number',step,value:String(Math.round(value*1000)/1000)});input.dataset.field=text;input.setAttribute('aria-label',text);input.onchange=()=>{const n=Number(input.value);if(Number.isFinite(n))write(n);};return el('label',{},text,input);};
  const w=t.wheels.find(x=>x.id===this.selected),lego=t.wheels.some(x=>x.part),kinds=driveCatalog.filter(d=>lego?d.id==='lego-achse':d.id!=='lego-achse'),ins=inputsOf(t),outs=outputsOf(t),name=(s:string)=>{const x=t.wheels.find(y=>y.shaft===s);return x?label(x):'Welle';};
  if(w){const s=t.shafts.find(x=>x.id===w.shaft)!,wheel=(message:string,fn:(y:Wheel)=>void)=>set(message,x=>{const y=x.wheels.find(z=>z.id===w.id);if(y)fn(y);}),shaft=(fn:(at:[number,number])=>void)=>set('Welle verschoben',x=>{const y=x.shafts.find(z=>z.id===s.id);if(y)fn(y.at);});
   // In a rigid group the axis distances are fixed: a place set here moves the whole group.
   const unit=this.host.unit?.(w.id),move=(delta:[number,number,number],message:string)=>this.host.moveUnit?.(unit!.id,delta,`${unit!.label}: ${message}`);
   root.append(el('h3',{textContent:label(w)}));
   if(unit)root.append(el('p',{className:'muted',textContent:`In der festen Gruppe „${unit.label}“: Die Achsabstände sind fest, Lage und Winkel verschieben die ganze Gruppe.`}));
   root.append(number('X der Welle [mm]',s.at[0],n=>unit?move([n-s.at[0],0,0],'verschoben'):shaft(a=>{a[0]=n;}),'1'),number('Höhe der Welle [mm]',s.at[1],n=>unit?move([0,0,n-s.at[1]],'verschoben'):shaft(a=>{a[1]=n;}),'1'),number('Lage auf der Welle [mm]',w.z,n=>unit?move([0,n-w.z,0],'auf den Wellen verschoben'):wheel('Rad verschoben',y=>{y.z=n;})));
   // The angle around a neighbour; in a rigid group only around one outside it.
   const pair=meshes(t).find(p=>p.some(x=>x.id===w.id)&&(!unit||p.some(x=>!unit.wheels.has(x.id)))),near=pair?partnerOf({...t,wheels:t.wheels.filter(x=>pair.includes(x))},w):undefined;
   if(near){const step=gridOf(t).angle;root.append(number(`Winkel am ${label(near.wheel)} [°]`,near.angle,n=>{const at=around(near.centre,near.distance,((n%360)+360)%360);if(unit)move([at[0]-s.at[0],0,at[1]-s.at[1]],'um das Rad außerhalb gedreht');else shaft(a=>{a[0]=at[0];a[1]=at[1];});},String(step||1)),el('p',{className:'muted',textContent:unit?'Setzt die ganze Gruppe so, dass dieses Rad unter dem Winkel am Rad außerhalb kämmt. 0° waagerecht, 90° darüber.':'Dreht die Welle um das Nachbarrad, der Achsabstand bleibt. 0° waagerecht, 90° darüber.'}));}
   if(!w.part&&unit)root.append(el('p',{className:'muted',textContent:`Zähne z${w.teeth}, Modul ${w.module}, ${w.width} mm breit: in der festen Gruppe gesperrt, weil sie den Achsabstand ändern. Zum Ändern die Gruppe auf „frei“ stellen.`}));
   else if(!w.part)root.append(number('Zähne',w.teeth,n=>wheel('Zähne geändert',y=>{y.teeth=Math.max(6,Math.round(n));}),'1'),number('Modul',w.module,n=>wheel('Modul geändert',y=>{y.module=Math.max(.3,n);}),'0.25'),number('Breite [mm]',w.width,n=>wheel('Breite geändert',y=>{y.width=Math.max(1,n);})));
   // Ends of the shaft: several inputs and outputs in a train; a shaft is one or the other.
   const isIn=ins.find(i=>i.shaft===s.id),isOut=outs.includes(s.id),ends=(message:string,fn:(i:typeof ins,o:string[])=>[typeof ins,string[]])=>set(message,x=>{const [i,o]=fn(inputsOf(x),outputsOf(x));setEnds(x,i,o);});
   const input=el('input',{type:'checkbox',checked:!!isIn});input.dataset.setInput='true';input.onchange=()=>ends(input.checked?'Eingang gesetzt':'Kein Eingang mehr',(i,o)=>input.checked?[[...i,{shaft:s.id,drive:kinds[0].id}],o.filter(y=>y!==s.id)]:[i.filter(y=>y.shaft!==s.id),o]);
   const output=el('input',{type:'checkbox',checked:isOut});output.dataset.setOutput='true';output.onchange=()=>ends(output.checked?'Ausgang gesetzt':'Kein Ausgang mehr',(i,o)=>output.checked?[i.filter(y=>y.shaft!==s.id),[...o,s.id]]:[i,o.filter(y=>y!==s.id)]);
   root.append(heading('Welle'),el('label',{className:'check'},input,'Eingang: wird angetrieben'),el('label',{className:'check'},output,'Ausgang'));
   if(isIn){const d=el('select');d.dataset.field='Antrieb';for(const k of kinds)d.add(new Option(k.label,k.id));d.value=kinds.some(k=>k.id===isIn.drive)?isIn.drive:kinds[0].id;d.onchange=()=>ends('Antrieb geändert',(i,o)=>[i.map(y=>y.shaft===s.id?{...y,drive:d.value}:y),o]);root.append(el('label',{},'Antrieb an diesem Eingang',d));}
   const remove=el('button',{textContent:'Entfernen',className:'danger'});remove.dataset.remove='true';remove.onclick=()=>this.remove();root.append(el('div',{className:'button-row'},remove));}
  const found=trainIssues(t),pairs=ins.flatMap(i=>outs.map(o=>({i:i.shaft,o,r:ratioOf(t,i.shaft,o)}))).filter(p=>p.r!==undefined);
  root.append(heading('Getriebe'),el('p',{id:'train-ratio',className:pairs.length?'state-pass':'muted',textContent:pairs.length?pairs.map(p=>`${name(p.i)} → ${name(p.o)}: 1 : ${Math.abs(p.r!).toFixed(2).replace('.',',')}, ${p.r!>0?'gleichsinnig':'gegensinnig'}`).join(' · '):'Noch keine Verbindung von einem Eingang zu einem Ausgang.'}),
   el('p',{className:'muted',textContent:`${ins.length} Eingang${ins.length===1?'':'e'}, ${outs.length} Ausgang${outs.length===1?'':'e'}: an der Welle eines Rads einstellen.`}));
  const box=el('div',{id:'build-issues'});for(const f of found)box.append(el('p',{className:'state-fail',textContent:f.message}));if(!found.length)box.append(el('p',{className:'state-pass',textContent:'✓ Alle Räder kämmen und drehen frei.'}));for(const n of trainNotes(t))box.append(el('p',{className:'muted',textContent:n}));root.append(heading('Prüfung'),box);
  root.append(el('p',{className:'muted',textContent:this.host.mechanism()?'Das Projekt hat schon einen Mechanismus: Getriebe für seine Achsen findet die Suche am Antrieb.':'Drehen: unten mit den Reglern. Lager & Wellen und Struktur entstehen in „③ Fertigen“ direkt aus diesen Rädern, links im Szenenbaum.'}));
 }
}
