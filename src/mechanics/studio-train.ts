// Gear trains in the Studio: wheels dragged from the store into an upright plane, shafts running through it. A wheel
// snaps to the mesh distance of a neighbour or onto a shaft; the ratio is read off what meshes. A button makes the
// train a mechanism, and from there on it is one like any other.
import * as THREE from 'three';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';
import {legoParts} from './graph/lego-parts';
import {legoGears,snapWheel,meshes,ratioOf,trainIssues,compileTrain,pitchOf,outerOf,newTrain,partnerOf,around,DEFAULT_ANGLE} from './parts/train';
import type {Train,Wheel} from './parts/train';
import type {Build} from './parts/build';
import {joinShaft} from './parts/groups';
import {planetGearbox,along} from './demos';
import type {Demo} from './demos';
import {driveCatalog} from './kinematics/drive';

export type TrainHost={build:()=>Build|undefined;change:(edit:()=>void,message:string)=>void;status:(text:string)=>void;leave:()=>void;/** Clears the other selections. */pick:()=>void;canvas:()=>HTMLCanvasElement;ray:(e:{clientX:number;clientY:number})=>THREE.Raycaster;root:()=>THREE.Object3D;orbit:(on:boolean)=>void;
 /** A finished train or block becomes the project's mechanism; `consume`: the wheels here go into it. */adopt:(d:Demo,consume?:boolean)=>void;
 /** The train to change, made with the first wheel (inside a change). */ensure:()=>Train;
 /** The project has a mechanism already: a train or block cannot become a second one. */mechanism:()=>boolean};
type Drag={wheel:Wheel;isNew:boolean;moved:boolean;over:boolean;start:[number,number];at:[number,number];shaft?:string;partner?:string;angle?:number};
const el=<K extends keyof HTMLElementTagNameMap>(tag:K,props:Record<string,unknown>={},...children:(Node|string)[]):HTMLElementTagNameMap[K]=>{const e=document.createElement(tag);Object.assign(e,props);e.append(...children);return e;};
const heading=(text:string)=>el('h2',{textContent:text});
const shapes=new Map<string,Promise<THREE.BufferGeometry>>();
function modelOf(id:string){let g=shapes.get(id);if(!g){g=new STLLoader().loadAsync(`./mechanics-assets/ldraw/meshes/${id}.stl`).then(x=>{x.computeVertexNormals();return x;});shapes.set(id,g);}return g;}
export const label=(w:Wheel)=>`${w.part?'LEGO':'Gedruckt'} z${w.teeth}${w.part?'':` m${w.module}`}`;
const deg=(a:number)=>`${Math.round(a*10)/10}°`.replace('.',',');
/** The two grids: mm for a wheel standing alone, degrees around the wheel it meshes with. */
const gridOf=(t:Train|undefined)=>({mm:t?.grid??1,angle:t?.angle??DEFAULT_ANGLE,target:!!t?.target&&(t?.grid??1)>0});

const partnerText=(t:Train,d:Drag)=>{const o=t.wheels.find(w=>w.id===d.partner);return o&&d.angle!==undefined?`, kämmt mit ${label(o)} unter ${deg(d.angle)}`:'';};

export class TrainEditor{
 /** A wheel is selected. */
 get selectedId(){return this.selected;}
 select(id?:string){this.selected=id;}
 private selected?:string;private drag?:Drag;private loaded=new Map<string,THREE.BufferGeometry>();private sun=legoGears.find(p=>p.teeth===16)?.id??legoGears[0].id;private planet=legoGears.find(p=>p.teeth===16)?.id??legoGears[0].id;
 onChange=()=>{};
 constructor(private host:TrainHost){}
 private train():Train|undefined{return this.host.build()?.train;}
 reset(){this.selected=undefined;this.drag=undefined;}
 /** The train as seen while dragging. */
 private shown():Train|undefined{const d=this.drag,t=this.train()??(d?.over?newTrain():undefined);if(!t||!d?.over)return t;const id=d.shaft??d.wheel.shaft,shafts=t.shafts.some(s=>s.id===id)?t.shafts.map(s=>s.id===id&&!d.shaft?{...s,at:d.at}:s):[...t.shafts,{id,at:d.at}];return {...t,shafts,wheels:[...t.wheels.filter(w=>w.id!==d.wheel.id),{...d.wheel,shaft:id}]};}
 draw(group:THREE.Group,lit:ReadonlySet<string>=new Set(),override?:Train){
  const t=override??this.shown();if(!t)return;const bad=new Set(trainIssues(t).flatMap(x=>x.wheels)),on=new Set(meshes(t).flat().map(w=>w.id));
  for(const s of t.shafts){const list=t.wheels.filter(w=>w.shaft===s.id);if(!list.length)continue;const lo=Math.min(...list.map(w=>w.z-w.width/2))-8,hi=Math.max(...list.map(w=>w.z+w.width/2))+8,color=s.id===t.input?0x63cbb3:s.id===t.output?0xffb347:0xc9d4db,m=new THREE.Mesh(new THREE.CylinderGeometry(2.4,2.4,hi-lo,16),new THREE.MeshStandardMaterial({color,roughness:.5}));m.position.set(s.at[0],(lo+hi)/2,s.at[1]);m.userData.shaft=s.id;group.add(m);}
  for(const w of t.wheels){const s=t.shafts.find(x=>x.id===w.shaft)!,holder=new THREE.Group();holder.position.set(s.at[0],w.z,s.at[1]);holder.quaternion.set(...along.y);holder.userData.wheel=w.id;
   const color=bad.has(w.id)?0xff5a55:w.id===this.selected||lit.has(w.id)?0xffffff:on.has(w.id)?0x8fb6d9:0xa9b4bd,material=new THREE.MeshStandardMaterial({color,roughness:.55}),geometry=w.part?this.loaded.get(w.part):undefined;
   if(geometry){const m=new THREE.Mesh(geometry,material);m.userData.shared=true;holder.add(m);}
   else{const m=new THREE.Mesh(new THREE.CylinderGeometry(pitchOf(w),pitchOf(w),w.width,48).rotateX(Math.PI/2),material);holder.add(m);const rim=new THREE.Mesh(new THREE.RingGeometry(pitchOf(w),outerOf(w),48),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:true,opacity:.6}));rim.position.z=w.width/2;holder.add(rim);
    if(w.part)void modelOf(w.part).then(g=>{this.loaded.set(w.part!,g);this.onChange();}).catch(()=>this.host.status(`LEGO-Modell fehlt: ${w.part}`));}
   group.add(holder);}
 }
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
   const bb=this.host.build();if(bb)joinShaft(bb,wheel);x.input??=target;if(target!==x.input)x.output=x.output&&x.shafts.some(y=>y.id===x.output)?x.output:target;},d.shaft?`${label(d.wheel)} sitzt auf der Welle.`:`${label(d.wheel)} ${d.isNew?'platziert':'verschoben'}${partnerText(t,d)}.`);
 }
 key(e:KeyboardEvent){if(e.key==='Delete'&&this.selected){this.remove();return true;}return false;}
 private remove(){const id=this.selected!;this.selected=undefined;this.host.change(()=>{const x=this.train()!;x.wheels=x.wheels.filter(w=>w.id!==id);x.shafts=x.shafts.filter(s=>x.wheels.some(w=>w.shaft===s.id));if(!x.shafts.some(s=>s.id===x.input))delete x.input;if(!x.shafts.some(s=>s.id===x.output))delete x.output;},'Rad entfernt');}

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
  const go=el('button',{textContent:'＋ Planetenstufe anlegen',className:'primary'});go.dataset.planetMake='true';go.disabled=this.host.mechanism();go.title=go.disabled?'Das Projekt hat schon einen Mechanismus. Für eine Planetenstufe ein neues Projekt anlegen.':'';go.onclick=()=>{const name=`Planetengetriebe z${zs}/z${zp}`;this.host.adopt(planetGearbox({id:`planet-${crypto.randomUUID().slice(0,8)}`,label:name,sun:this.sun,planet:this.planet}));};
  root.append(el('details',{className:'templates'},el('summary',{textContent:'Planetenstufe (Sonne, 3 Planeten, Hohlrad)'}),choice('Sonne',this.sun,v=>{this.sun=v;}),choice('Planeten',this.planet,v=>{this.planet=v;}),el('p',{className:'muted',textContent:`Hohlrad z${zr} gedruckt, 1 : ${(1+zr/zs).toFixed(2).replace('.',',')}`}),go));
 }
 renderProperties(root:HTMLElement){
  const t=this.train(),b=this.host.build();if(!t||!b)return;
  const set=(message:string,fn:(x:Train)=>void)=>this.host.change(()=>fn(this.train()!),message);
  const number=(text:string,value:number,write:(n:number)=>void,step='0.5')=>{const input=el('input',{type:'number',step,value:String(Math.round(value*1000)/1000)});input.dataset.field=text;input.setAttribute('aria-label',text);input.onchange=()=>{const n=Number(input.value);if(Number.isFinite(n))write(n);};return el('label',{},text,input);};
  const w=t.wheels.find(x=>x.id===this.selected);
  if(w){const s=t.shafts.find(x=>x.id===w.shaft)!,wheel=(message:string,fn:(y:Wheel)=>void)=>set(message,x=>{const y=x.wheels.find(z=>z.id===w.id);if(y)fn(y);}),shaft=(fn:(at:[number,number])=>void)=>set('Welle verschoben',x=>{const y=x.shafts.find(z=>z.id===s.id);if(y)fn(y.at);});
   root.append(el('h3',{textContent:label(w)}),number('X der Welle [mm]',s.at[0],n=>shaft(a=>{a[0]=n;}),'1'),number('Höhe der Welle [mm]',s.at[1],n=>shaft(a=>{a[1]=n;}),'1'),number('Lage auf der Welle [mm]',w.z,n=>wheel('Rad verschoben',y=>{y.z=n;})));
   const near=partnerOf(t,w);if(near){const step=gridOf(t).angle;root.append(number(`Winkel am ${label(near.wheel)} [°]`,near.angle,n=>shaft(a=>{const at=around(near.centre,near.distance,((n%360)+360)%360);a[0]=at[0];a[1]=at[1];}),String(step||1)),el('p',{className:'muted',textContent:'Dreht die Welle um das Nachbarrad, der Achsabstand bleibt. 0° waagerecht, 90° darüber.'}));}
   if(!w.part)root.append(number('Zähne',w.teeth,n=>wheel('Zähne geändert',y=>{y.teeth=Math.max(6,Math.round(n));}),'1'),number('Modul',w.module,n=>wheel('Modul geändert',y=>{y.module=Math.max(.3,n);}),'0.25'),number('Breite [mm]',w.width,n=>wheel('Breite geändert',y=>{y.width=Math.max(1,n);})));
   const input=el('button',{textContent:'Als Eingang'});input.dataset.setInput='true';input.onclick=()=>set('Eingang gesetzt',x=>{if(x.output===s.id)delete x.output;x.input=s.id;});const output=el('button',{textContent:'Als Ausgang'});output.dataset.setOutput='true';output.onclick=()=>set('Ausgang gesetzt',x=>{if(x.input===s.id)delete x.input;x.output=s.id;});const remove=el('button',{textContent:'Entfernen',className:'danger'});remove.dataset.remove='true';remove.onclick=()=>this.remove();root.append(el('div',{className:'button-row'},input,output,remove));}
  const ratio=ratioOf(t),found=trainIssues(t),lego=t.wheels.some(x=>x.part),kinds=driveCatalog.filter(d=>lego?d.id==='lego-achse':d.id!=='lego-achse');
  root.append(heading('Getriebe'),el('p',{id:'train-ratio',className:ratio?'state-pass':'muted',textContent:ratio?`Übersetzung 1 : ${Math.abs(ratio).toFixed(2).replace('.',',')}, Ausgang dreht ${ratio>0?'gleichsinnig':'gegensinnig'}`:'Noch keine Verbindung von Eingang zu Ausgang.'}));
  const s=el('select');s.dataset.field='Antrieb';for(const d of kinds)s.add(new Option(d.label,d.id));s.value=kinds.some(d=>d.id===t.drive)?t.drive:kinds[0].id;s.onchange=()=>set('Antrieb geändert',x=>{x.drive=s.value;});root.append(el('label',{},'Antrieb am Eingang',s));
  const box=el('div',{id:'build-issues'});for(const f of found)box.append(el('p',{className:'state-fail',textContent:f.message}));if(!found.length)box.append(el('p',{className:'state-pass',textContent:'✓ Alle Räder kämmen und drehen frei.'}));root.append(heading('Prüfung'),box);
  const make=el('button',{textContent:'⚙ Als Mechanismus übernehmen',className:'primary'});make.dataset.compile='true';make.disabled=found.length>0||this.host.mechanism();make.onclick=()=>{try{const drive=kinds.some(d=>d.id===t.drive)?t.drive:kinds[0].id;this.host.adopt(compileTrain({...t,drive},'Getriebe'),true);}catch(e){this.host.status(String(e));}};root.append(make,el('p',{className:'muted',textContent:this.host.mechanism()?'Das Projekt hat schon einen Mechanismus: Getriebe für seine Achsen findet die Suche am Antrieb. Für ein eigenes Getriebe ein neues Projekt anlegen.':'Die Räder werden der Mechanismus des Projekts, mit Grundplatte: Regler, Lager & Wellen und Struktur funktionieren dort wie gewohnt.'}));
 }
}
