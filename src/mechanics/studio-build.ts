// Build mode of the Studio: a store of parts on the left, a plate in the view, parts dragged from one onto the other.
// They snap to grid and neighbours, keep their clearance and the ways of their plugs; everything about plate and
// holders stays editable. The document holds only choices: outline, holes and domes follow in parts/build.ts.
import * as THREE from 'three';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';
import type {StudioDocument} from './studio-model';
import {parts,partGroups,boxPart} from './parts/catalog';
import type {Part} from './parts/catalog';
import {generators,generator} from './parts/generators';
import {newBuild,newItem,partOf,footprint,plugRects,issues,snapTo,nearestFree,plateRect,plateOutline,plateHoles,holderGeometry,flipped,liftOf,shopping,buildGeometry,snap} from './parts/build';
import type {Build,BuildItem,Issue} from './parts/build';
import {solidScad} from './parts/scad';
import type {Prim} from '../structure/sdf';

export type BuildHost={doc:()=>StudioDocument;change:(edit:()=>void,message:string)=>void;status:(text:string)=>void;leave:()=>void;fit:()=>void;canvas:()=>HTMLCanvasElement;
 /** The pointer's ray in the view. */ray:(e:{clientX:number;clientY:number})=>THREE.Raycaster;orbit:(on:boolean)=>void;};
type Drag={item:BuildItem;isNew:boolean;offset:[number,number];moved:boolean;over:boolean;start:[number,number]};
const el=<K extends keyof HTMLElementTagNameMap>(tag:K,props:Record<string,unknown>={},...children:(Node|string)[]):HTMLElementTagNameMap[K]=>{const e=document.createElement(tag);Object.assign(e,props);e.append(...children);return e;};
const heading=(text:string)=>el('h2',{textContent:text});
const mm=(n:number)=>n.toFixed(Math.abs(n-Math.round(n))<.05?0:1);
const shapes=new Map<string,Promise<THREE.BufferGeometry>>();
/** A part's model, loaded once and shared by all its copies. */
function modelOf(url:string){let g=shapes.get(url);if(!g){g=new STLLoader().loadAsync(url).then(x=>{x.computeVertexNormals();return x;});shapes.set(url,g);}return g;}

export class BuildEditor{
 /** Stands in the z-up root; the plate's top at z = 0. */
 readonly group=new THREE.Group();
 activeId?:string;
 private selected?:string;private drag?:Drag;private filter='';private loaded=new Map<string,THREE.BufferGeometry>();private fitNext=false;
 private custom={label:'Mein Teil',length:40,width:30,height:15,x:34,y:24,d:3};
 constructor(private host:BuildHost){}
 get active(){return !!this.build();}
 private build(){return this.host.doc().builds?.find(b=>b.id===this.activeId);}
 /** The build as seen while dragging: with the held part where it is held. */
 private shown():Build|undefined{const b=this.build();if(!b||!this.drag?.over)return b;const d=this.drag.item;return {...b,items:[...b.items.filter(i=>i.id!==d.id),d]};}
 enter(id:string){this.activeId=id;this.selected=undefined;this.fitNext=true;}
 exit(){this.activeId=undefined;this.selected=undefined;this.drag=undefined;this.clear();}
 private clear(){for(const o of [...this.group.children]){this.group.remove(o);o.traverse(c=>{if((c instanceof THREE.Mesh||c instanceof THREE.LineLoop)&&!c.userData.shared)c.geometry.dispose();});}}

 // ---------- view ----------
 refresh(){
  this.clear();const b=this.shown();if(!b)return;
  const found=issues(b),bad=new Set(found.flatMap(x=>x.items)),t=b.plate.thickness,outline=plateOutline(b),rect=plateRect(b);
  const shape=new THREE.Shape(outline.map(([x,y])=>new THREE.Vector2(x,y)));
  const round=(x:number,y:number,r:number)=>{const h=new THREE.Path();h.absarc(x,y,r,0,2*Math.PI,true);shape.holes.push(h);};
  const inside=(x:number,y:number,r:number)=>x-r>rect.x0&&x+r<rect.x1&&y-r>rect.y0&&y+r<rect.y1;
  for(const h of plateHoles(b))if(inside(h.at[0],h.at[1],h.d/2))round(h.at[0],h.at[1],h.d/2);
  const solids:Prim[]=[];for(const i of b.items){const g=holderGeometry(b,i);solids.push(...g.solids);for(const p of g.holes)if(p.kind==='cylinder'&&p.z0<-t&&p.z1>0&&inside(p.frame.position[0],p.frame.position[1],p.r))round(p.frame.position[0],p.frame.position[1],p.r);}
  const plate=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:t,bevelEnabled:false,curveSegments:32}),new THREE.MeshStandardMaterial({color:0x8d9aa5,metalness:.1,roughness:.7}));plate.position.z=-t;plate.userData.plate=true;this.group.add(plate);
  for(const s of solids)if(s.kind==='cylinder'){const m=new THREE.Mesh(new THREE.CylinderGeometry(s.r,s.r,s.z1-s.z0,28),new THREE.MeshStandardMaterial({color:0xa4b1bb,roughness:.7}));m.rotation.x=Math.PI/2;m.position.set(s.frame.position[0],s.frame.position[1],s.frame.position[2]+(s.z0+s.z1)/2*(s.frame.rotation[0]?-1:1));this.group.add(m);}
  for(const i of b.items){const p=partOf(b,i),holder=new THREE.Group();holder.userData.item=i.id;
   holder.position.set(i.at[0],i.at[1],i.side==='top'?liftOf(i):-t-liftOf(i));holder.rotation.set(flipped(p,i)?Math.PI:0,0,0);holder.rotateOnWorldAxis(new THREE.Vector3(0,0,1),i.angle*Math.PI/180);
   const material=new THREE.MeshStandardMaterial({color:p.color,roughness:.55,metalness:.15});
   const geometry=p.mesh?this.loaded.get(p.mesh):undefined;
   if(geometry){const m=new THREE.Mesh(geometry,material);m.userData.shared=true;holder.add(m);}
   else{const size=p.box.max.map((v,k)=>v-p.box.min[k]) as [number,number,number],m=new THREE.Mesh(new THREE.BoxGeometry(...size),material);m.position.set(...p.box.min.map((v,k)=>v+size[k]/2) as [number,number,number]);holder.add(m);
    if(p.mesh)void modelOf(p.mesh).then(g=>{this.loaded.set(p.mesh!,g);this.refresh();}).catch(()=>this.host.status(`Modell fehlt: ${p.label}`));}
   this.group.add(holder);
   const z=(i.side==='top'?.15:-t-.15),line=(pts:[number,number][],color:number)=>{const l=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts.map(([x,y])=>new THREE.Vector3(x,y,z))),new THREE.LineBasicMaterial({color}));this.group.add(l);};
   line(footprint(p,i).corners,bad.has(i.id)?0xff5a55:i.id===this.selected?0xffffff:0x63cbb3);
   for(const c of plugRects(p,i)){const s=new THREE.Shape(c.rect.corners.map(([x,y])=>new THREE.Vector2(x,y))),m=new THREE.Mesh(new THREE.ShapeGeometry(s),new THREE.MeshBasicMaterial({color:0xffb347,transparent:true,opacity:.28,side:THREE.DoubleSide,depthWrite:false}));m.position.z=z;this.group.add(m);}}
  if(this.fitNext){this.fitNext=false;this.host.fit();}
 }
 /** Plate coordinates under the pointer. */
 private point(e:{clientX:number;clientY:number}):[number,number]|undefined{this.group.updateWorldMatrix(true,false);const r=this.host.ray(e).ray.clone().applyMatrix4(this.group.matrixWorld.clone().invert()),hit=r.intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1),0),new THREE.Vector3());return hit?[hit.x,hit.y]:undefined;}
 private itemAt(ray:THREE.Raycaster){this.group.updateWorldMatrix(true,true);let o:THREE.Object3D|null|undefined=ray.intersectObjects(this.group.children.filter(c=>c.userData.item),true)[0]?.object;while(o&&!o.userData.item)o=o.parent;return o?.userData.item as string|undefined;}
 hover(ray:THREE.Raycaster){return !!this.itemAt(ray);}
 pointerDown(e:PointerEvent,ray:THREE.Raycaster){
  const b=this.build(),id=this.itemAt(ray),i=b?.items.find(x=>x.id===id);this.selected=id;this.renderProperties();this.refresh();if(!b||!i)return;
  const at=this.point(e);if(!at)return;this.host.orbit(false);this.drag={item:structuredClone(i),isNew:false,offset:[i.at[0]-at[0],i.at[1]-at[1]],moved:false,over:true,start:[e.clientX,e.clientY]};this.track();
 }
 private startNew(part:Part,e:PointerEvent){this.drag={item:newItem('t-'+crypto.randomUUID().slice(0,8),part,[0,0]),isNew:true,offset:[0,0],moved:false,over:false,start:[e.clientX,e.clientY]};this.track();}
 private track(){
  const move=(e:PointerEvent)=>this.dragMove(e),up=(e:PointerEvent)=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);this.dragEnd(e);};
  window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
 }
 private dragMove(e:PointerEvent){
  const d=this.drag,b=this.build();if(!d||!b)return;if(Math.hypot(e.clientX-d.start[0],e.clientY-d.start[1])>3)d.moved=true;if(!d.moved)return;
  d.over=!d.isNew||document.elementFromPoint(e.clientX,e.clientY)===this.host.canvas();if(!d.over){this.refresh();return;}
  const at=this.point(e);if(!at)return;const wish:[number,number]=[at[0]+d.offset[0],at[1]+d.offset[1]];d.item.at=e.altKey?wish:snapTo(b,d.item,wish);this.refresh();
 }
 private dragEnd(e:PointerEvent){
  const d=this.drag,b=this.build();this.drag=undefined;this.host.orbit(true);if(!d||!b)return;
  if(d.isNew&&!d.moved){const r=plateRect(b);d.item.at=[snap((r.x0+r.x1)/2,b.grid),snap((r.y0+r.y1)/2,b.grid)];d.over=true;}
  if(!d.moved&&!d.isNew||!d.over){this.refresh();return;}
  const others={...b,items:b.items.filter(i=>i.id!==d.item.id)},wish=[...d.item.at],at=e.altKey?d.item.at:nearestFree(others,d.item),label=partOf(b,d.item).label,pushed=at[0]!==wish[0]||at[1]!==wish[1];
  this.selected=d.item.id;this.host.change(()=>{const x=this.build()!;if(d.isNew)x.items.push({...d.item,at});else{const i=x.items.find(y=>y.id===d.item.id);if(i)i.at=at;}},pushed?`${label}: war belegt, auf den nächsten freien Platz gesetzt.`:d.isNew?`${label} platziert.`:`${label} verschoben.`);
 }
 /** Keys of the view: R turns the selection, Entf removes it. */
 key(e:KeyboardEvent){if(!this.selected)return false;if(e.key==='r'||e.key==='R'){this.turn(e.shiftKey?-90:90);return true;}if(e.key==='Delete'){this.removeItem();return true;}return false;}
 private turn(by:number){const id=this.selected!;this.host.change(()=>{const i=this.build()!.items.find(x=>x.id===id);if(i)i.angle=(i.angle+by+360)%360;},'Teil gedreht');}
 private removeItem(){const id=this.selected!;this.selected=undefined;this.host.change(()=>{const x=this.build()!;x.items=x.items.filter(i=>i.id!==id);},'Teil entfernt');}

 // ---------- explorer ----------
 /** The builds in the explorer, whatever mode the Studio is in. */
 renderList(root:HTMLElement){
  root.append(el('div',{className:'tree-group',textContent:'Aufbauten'}));
  for(const b of this.host.doc().builds??[]){const open=el('button',{textContent:`▦ ${b.label}`});open.dataset.build=b.id;open.setAttribute('aria-selected',String(this.activeId===b.id));open.onclick=()=>{this.enter(b.id);this.host.leave();};root.append(el('div',{className:'tree-row'},open));}
  const add=el('button',{textContent:'＋ Neuer Aufbau (Bodenplatte)',className:'primary'});add.dataset.newBuild='true';add.onclick=()=>{const id='aufbau-'+crypto.randomUUID().slice(0,8),n=(this.host.doc().builds?.length??0)+1;this.host.change(()=>{const d=this.host.doc();d.builds=[...(d.builds??[]),newBuild(id,`Aufbau ${n}`)];},'Aufbau angelegt: Teile aus dem Store auf die Platte ziehen.');this.enter(id);this.host.leave();};
  root.append(add);
 }
 renderTree(root:HTMLElement){
  const b=this.build();if(!b)return;
  const back=el('button',{textContent:'← Zurück'});back.onclick=()=>{this.exit();this.host.leave();};root.append(back,el('div',{className:'tree-group',textContent:b.label}));
  const plate=el('button',{textContent:'▭ Bodenplatte'});plate.dataset.plate='true';plate.setAttribute('aria-selected',String(!this.selected));plate.onclick=()=>{this.selected=undefined;this.renderProperties();this.refresh();this.host.leave();};root.append(el('div',{className:'tree-row'},plate));
  for(const i of b.items){const row=el('button',{textContent:`  ${partOf(b,i).label}`,className:'tree-sub'});row.dataset.item=i.id;row.setAttribute('aria-selected',String(this.selected===i.id));row.onclick=()=>{this.selected=i.id;this.renderProperties();this.refresh();this.host.leave();};root.append(el('div',{className:'tree-row'},row));}
  root.append(el('div',{className:'tree-group',textContent:'Teile-Store'}));
  const filter=el('input',{type:'search',placeholder:'Teil suchen',value:this.filter});filter.id='part-filter';filter.setAttribute('aria-label','Teile suchen');
  const list=el('div',{className:'part-store'});filter.oninput=()=>{this.filter=filter.value;this.fillStore(list,b);};root.append(filter,list);this.fillStore(list,b);
  const c=this.custom,form=el('details',{className:'templates'},el('summary',{textContent:'Eigenes Teil aus Maßen'}));
  const field=(label:string,key:'length'|'width'|'height'|'x'|'y'|'d')=>{const input=el('input',{type:'number',step:'0.1',value:String(c[key])});input.dataset.custom=key;input.onchange=()=>{c[key]=Number(input.value);};return el('label',{},label,input);};
  const name=el('input',{type:'text',value:c.label});name.dataset.custom='label';name.oninput=()=>{c.label=name.value;};
  const make=el('button',{textContent:'Teil anlegen'});make.dataset.customMake='true';make.onclick=()=>{const label=c.label.trim();if(!label||!(c.length>0&&c.width>0&&c.height>0)){this.host.status('Teil braucht Name, Länge, Breite und Höhe.');return;}const holes=c.d>0&&c.x>0&&c.y>0?[[-c.x/2,-c.y/2],[c.x/2,-c.y/2],[c.x/2,c.y/2],[-c.x/2,c.y/2]].map(at=>({at:at as [number,number],d:c.d})):[];const part={...boxPart({id:'eigen-'+crypto.randomUUID().slice(0,8),label,group:'Eigene Teile',size:[c.length,c.width],height:c.height,holes,source:'Eigene Maße'}),checked:true};this.host.change(()=>{this.build()!.parts.push(part);},`${label} steht im Store.`);};
  form.append(el('label',{},'Name',name),field('Länge [mm]','length'),field('Breite [mm]','width'),field('Höhe [mm]','height'),field('Lochabstand X [mm]','x'),field('Lochabstand Y [mm]','y'),field('Loch-Ø [mm] (0: keine)','d'),make);root.append(form);
 }
 private fillStore(list:HTMLElement,b:Build){
  list.replaceChildren();const q=this.filter.toLowerCase(),all=[...parts,...b.parts].filter(p=>!q||`${p.label} ${p.group}`.toLowerCase().includes(q));
  for(const group of partGroups){const items=all.filter(p=>p.group===group);if(!items.length)continue;const box=el('details',{open:!!q||group==='Controller'||group==='Motoren'},el('summary',{textContent:`${group} (${items.length})`}));
   for(const p of items){const size=p.box.max.map((v,k)=>v-p.box.min[k]),row=el('div',{className:'part-card',title:p.note??`Quelle: ${p.source}`},el('strong',{textContent:`${p.checked?'':'⚠ '}${p.label}`}),el('small',{textContent:`${mm(size[0])} × ${mm(size[1])} × ${mm(size[2])} mm · ${p.holes.length} Löcher`}));row.dataset.part=p.id;row.onpointerdown=e=>{e.preventDefault();this.startNew(p,e);};box.append(row);}
   list.append(box);}
 }

 // ---------- properties ----------
 renderProperties(){
  const root=document.getElementById('properties')!,b=this.build();root.replaceChildren();if(!b)return;
  const edit=(message:string,fn:(x:Build)=>void)=>this.host.change(()=>fn(this.build()!),message);
  const number=(label:string,value:number,write:(n:number)=>void,step='0.5')=>{const input=el('input',{type:'number',step,value:String(Math.round(value*1000)/1000)});input.setAttribute('aria-label',label);input.dataset.field=label;input.onchange=()=>{const n=Number(input.value);if(Number.isFinite(n))write(n);};return el('label',{},label,input);};
  const select=(label:string,value:string,options:[string,string][],write:(v:string)=>void)=>{const s=el('select');s.dataset.field=label;for(const [v,t] of options)s.add(new Option(t,v));s.value=value;s.onchange=()=>write(s.value);return el('label',{},label,s);};
  const i=b.items.find(x=>x.id===this.selected);
  if(i)this.itemPage(root,b,i,number,select,edit);else this.platePage(root,b,number,select,edit);
  root.append(heading('Prüfung'),this.report(issues(b)));
 }
 private report(found:Issue[]){const box=el('div',{id:'build-issues'});if(!found.length)box.append(el('p',{className:'state-pass',textContent:'✓ Nichts überschneidet sich, alle Stecker sind frei.'}));for(const f of found)box.append(el('p',{className:'state-fail',textContent:f.message}));return box;}
 private itemPage(root:HTMLElement,b:Build,i:BuildItem,number:(l:string,v:number,w:(n:number)=>void,s?:string)=>HTMLElement,select:(l:string,v:string,o:[string,string][],w:(v:string)=>void)=>HTMLElement,edit:(m:string,f:(x:Build)=>void)=>void){
  const p=partOf(b,i),set=(message:string,fn:(x:BuildItem)=>void)=>edit(message,x=>{const y=x.items.find(z=>z.id===i.id);if(y)fn(y);});
  root.append(el('h3',{textContent:p.label}),el('p',{className:'muted',textContent:`Quelle: ${p.source}${p.note?` · ${p.note}`:''}`}));
  if(!p.checked)root.append(el('p',{className:'state-warn',textContent:'⚠ Maße von Hand eingetragen, nicht geprüft: vor dem Druck am echten Teil nachmessen.'}));
  root.append(heading('Lage'),number('X [mm]',i.at[0],n=>set('Teil verschoben',x=>{x.at[0]=n;}),'1'),number('Y [mm]',i.at[1],n=>set('Teil verschoben',x=>{x.at[1]=n;}),'1'),number('Drehung [°]',i.angle,n=>set('Teil gedreht',x=>{x.angle=n;}),'15'),
   select('Seite',i.side,[['top','Oberseite'],['bottom','Unterseite']],v=>set('Seite geändert',x=>{x.side=v as BuildItem['side'];})),number('Mindestabstand [mm]',i.clearance,n=>set('Abstand geändert',x=>{x.clearance=Math.max(0,n);})));
  const g=generator(i.holder.kind);
  root.append(heading('Halter'),select('Art',i.holder.kind,generators.filter(x=>x.accepts(p)).map(x=>[x.id,x.label]),v=>set('Halter geändert',x=>{x.holder={kind:v,params:generator(v)!.defaults(p)};})));
  for(const q of g?.params??[])root.append(number(q.label,i.holder.params[q.key]??0,n=>set(`${q.label} geändert`,x=>{x.holder.params[q.key]=Math.max(q.min??0,n);}),String(q.step??.5)));
  if(p.holes.length){root.append(heading('Löcher des Teils'));p.holes.forEach((h,k)=>{const e=i.holes?.[k],row=el('div',{className:'hole-row'}),on=el('input',{type:'checkbox',checked:!e?.off,title:'Loch verwenden'});on.dataset.hole=String(k);on.onchange=()=>set(on.checked?'Loch aktiv':'Loch weggelassen',x=>{(x.holes??={})[k]={...x.holes?.[k],off:!on.checked};});
    const d=el('input',{type:'number',step:'0.1',value:String(e?.d??h.d)});d.dataset.holeD=String(k);d.setAttribute('aria-label',`Ø von Loch ${k+1}`);d.onchange=()=>set('Lochmaß geändert',x=>{(x.holes??={})[k]={...x.holes?.[k],d:Number(d.value)};});row.append(on,el('span',{textContent:`${k+1}: ${mm(h.at[0])} / ${mm(h.at[1])}`}),d);root.append(row);});}
  if(p.plugs.length){root.append(heading('Stecker frei halten'));for(const label of new Set(p.plugs.map(c=>c.label))){const on=el('input',{type:'checkbox',checked:!i.plugsOff?.includes(label)});on.dataset.plug=label;on.onchange=()=>set('Stecker geändert',x=>{x.plugsOff=on.checked?(x.plugsOff??[]).filter(l=>l!==label):[...(x.plugsOff??[]),label];});root.append(el('label',{className:'check'},on,label));}}
  const turn=el('button',{textContent:'↻ 90°'});turn.dataset.turn='true';turn.onclick=()=>this.turn(90);const remove=el('button',{textContent:'Entfernen',className:'danger'});remove.dataset.remove='true';remove.onclick=()=>this.removeItem();root.append(el('div',{className:'button-row'},turn,remove));
 }
 private platePage(root:HTMLElement,b:Build,number:(l:string,v:number,w:(n:number)=>void,s?:string)=>HTMLElement,select:(l:string,v:string,o:[string,string][],w:(v:string)=>void)=>HTMLElement,edit:(m:string,f:(x:Build)=>void)=>void){
  const p=b.plate,r=plateRect(b),plate=(message:string,fn:(x:Build['plate'])=>void)=>edit(message,x=>fn(x.plate));
  const name=el('input',{type:'text',value:b.label});name.setAttribute('aria-label','Name des Aufbaus');name.onchange=()=>{const v=name.value.trim();if(v)edit('Aufbau umbenannt',x=>{x.label=v;});};
  root.append(el('label',{},'Name',name),heading('Bodenplatte'),select('Größe',p.mode,[['auto','✨ Auto: wächst mit den Teilen'],['fixed','🔒 Fest']],v=>plate('Plattengröße geändert',x=>{x.mode=v as 'auto'|'fixed';x.size=[r.x1-r.x0,r.y1-r.y0];x.center=[(r.x0+r.x1)/2,(r.y0+r.y1)/2];})));
  if(p.mode==='fixed')root.append(number('Breite [mm]',p.size[0],n=>plate('Größe geändert',x=>{x.size[0]=Math.max(10,n);}),'1'),number('Tiefe [mm]',p.size[1],n=>plate('Größe geändert',x=>{x.size[1]=Math.max(10,n);}),'1'),number('Mitte X [mm]',p.center[0],n=>plate('Lage geändert',x=>{x.center[0]=n;}),'1'),number('Mitte Y [mm]',p.center[1],n=>plate('Lage geändert',x=>{x.center[1]=n;}),'1'));
  else root.append(el('p',{className:'muted',textContent:`Aktuell ${mm(r.x1-r.x0)} × ${mm(r.y1-r.y0)} mm.`}),number('Rand um die Teile [mm]',p.margin,n=>plate('Rand geändert',x=>{x.margin=Math.max(0,n);})));
  root.append(number('Dicke [mm]',p.thickness,n=>plate('Dicke geändert',x=>{x.thickness=Math.max(.4,n);})),number('Eckenradius [mm]',p.corner,n=>plate('Ecken geändert',x=>{x.corner=Math.max(0,n);})),
   select('Raster',String(b.grid),[['0','frei'],['0.5','0,5 mm'],['1','1 mm'],['2.5','2,5 mm'],['5','5 mm']],v=>edit('Raster geändert',x=>{x.grid=Number(v);})));
  const corners=el('input',{type:'checkbox',checked:p.mount.on});corners.dataset.corners='true';corners.onchange=()=>plate('Eckbohrungen geändert',x=>{x.mount.on=corners.checked;});
  root.append(heading('Bohrungen'),el('label',{className:'check'},corners,'Eckbohrungen'));
  if(p.mount.on)root.append(number('Ø Eckbohrung [mm]',p.mount.d,n=>plate('Eckbohrung geändert',x=>{x.mount.d=Math.max(.2,n);}),'0.1'),number('Abstand vom Rand [mm]',p.mount.inset,n=>plate('Eckbohrung geändert',x=>{x.mount.inset=Math.max(0,n);})));
  p.holes.forEach(h=>{const row=el('div',{className:'hole-row'}),field=(label:string,value:number,write:(n:number)=>void)=>{const input=el('input',{type:'number',step:'0.5',value:String(value)});input.dataset.plateHole=label;input.setAttribute('aria-label',label);input.onchange=()=>write(Number(input.value));return input;},set=(fn:(y:Build['plate']['holes'][number])=>void)=>plate('Bohrung geändert',x=>{const y=x.holes.find(z=>z.id===h.id);if(y)fn(y);}),del=el('button',{textContent:'✕',title:'Bohrung löschen',className:'danger'});del.onclick=()=>plate('Bohrung gelöscht',x=>{x.holes=x.holes.filter(z=>z.id!==h.id);});row.append(field('X',h.at[0],n=>set(y=>{y.at[0]=n;})),field('Y',h.at[1],n=>set(y=>{y.at[1]=n;})),field('Ø',h.d,n=>set(y=>{y.d=Math.max(.2,n);})),del);root.append(row);});
  const add=el('button',{textContent:'＋ Bohrung'});add.dataset.addHole='true';add.onclick=()=>plate('Bohrung hinzugefügt',x=>{x.holes.push({id:'b-'+crypto.randomUUID().slice(0,8),at:[(r.x0+r.x1)/2,(r.y0+r.y1)/2],d:4});});
  const stl=el('button',{textContent:'⬇ Platte als STL',className:'primary'});stl.dataset.plateStl='true';stl.onclick=()=>this.exportPlate();root.append(add,stl);
  const list=shopping(b);if(list.length){root.append(heading('Stückliste'));for(const l of list)root.append(el('p',{className:'muted',textContent:`${l.count} × ${l.label}`}));}
 }
 /** Exact booleans in the render worker: what the printer gets is OpenSCAD's result, not the preview. */
 private exportPlate(){
  const b=this.build();if(!b)return;this.host.status('Platte wird erzeugt …');const w=new Worker('./mechanics-render-worker.js');
  w.onmessage=({data})=>{w.terminate();if(data.error){this.host.status('Platte: '+data.error);return;}const url=URL.createObjectURL(new Blob([data.stl],{type:'model/stl'})),a=el('a',{href:url,download:`${b.label.replace(/[^\wäöüÄÖÜß-]+/g,'_')}.stl`});a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);this.host.status(`Platte als STL erzeugt: ${b.label}.`);};
  w.postMessage({source:solidScad(buildGeometry(b))});
 }
}
