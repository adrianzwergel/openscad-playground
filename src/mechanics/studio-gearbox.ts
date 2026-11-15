// Gearboxes of the gearbox generator in the Studio: linked, not copied. A build keeps only which file, where it stands,
// on what and whether mirrored (parts/build.ts `GearLink`); the gearbox and its shafts are read from their own folders
// (`getriebe`, `wellen`), its solids come from the same CAD worker as in the generator. Its frame and every swing arm are
// bodies: parts, plates and linkage points can be connected to them and follow when a swing arm's slider moves it.
// Editing opens the gearbox generator in a window over the Studio; every save there shows here at once.
import * as THREE from 'three';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';
import {ProjectStore} from './project-store';
import {parseShaft} from '../shaft/model.ts';
import {parseGear} from '../gear/model.ts';
import type {GearDoc} from '../gear/model.ts';
import {planGear} from '../gear/plan.ts';
import type {GearPlan,ShaftFile} from '../gear/plan.ts';
import {links} from '../gear/sweep.ts';
import {CadClient} from '../shaft/cad-client.ts';
import type {MeshData} from '../shaft/cad.ts';
import type {Build,GearLink} from './parts/build';
import {gearBody,armBody} from './parts/links';
import {compose,axisAngle} from './kinematics/math';
import type {Frame,V} from './kinematics/math';

export type GearboxHost={build:()=>Build|undefined;ensure:()=>Build;change:(edit:()=>void,message:string)=>void;status:(text:string)=>void;
 /** Draws the view again; draws the panels again. */refresh:()=>void;leave:()=>void;
 /** Where a new thing goes: beside all there is. */beside:()=>V;
 /** How far each body's slider is moved (the swing arms' by `armBody`). */values:()=>Record<string,number>;
 /** Something else is picked: the gearbox is not selected any more. */picked:()=>void;};
type Loaded={name:string;doc:GearDoc;files:Record<string,ShaftFile>;key:string;plan?:GearPlan};
/** A part of a gearbox for the view: shared by every link of the same gearbox, never disposed with the scene. */
type Piece={geometry:THREE.BufferGeometry;material:THREE.Material;body:string;matrix?:THREE.Matrix4;edges?:THREE.BufferGeometry};
const el=<K extends keyof HTMLElementTagNameMap>(tag:K,props:Record<string,unknown>={},...children:(Node|string)[]):HTMLElementTagNameMap[K]=>{const e=document.createElement(tag);Object.assign(e,props);e.append(...children);return e;};
const place=(o:THREE.Object3D,f:Frame)=>{o.position.set(...f.position);o.quaternion.set(...f.rotation);};
const still:Frame={position:[0,0,0],rotation:[0,0,0,1]};
/** Turned `deg` about the vertical through `at` (the gearbox's own z). */
function about(at:[number,number],deg:number):Frame{const a=deg*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return {position:[at[0]-(c*at[0]-s*at[1]),at[1]-(s*at[0]+c*at[1]),0],rotation:axisAngle([0,0,1],deg)};}
/** Where a swing arm stands in its gearbox: its chain of links, innermost first, each turned about its pivot as drawn. */
export function armFrame(plan:GearPlan,group:string,angles:Record<string,number>,sign=1):Frame{return links(plan.groups,group,angles).reduce((t,g)=>g.angle?compose(about(g.at,sign*g.angle),t):t,still);}
/** The original models (LDraw gears, NopSCADlib motors), loaded once each. */
const originals=new Map<string,Promise<THREE.BufferGeometry|undefined>>();
const original=(url:string)=>{let g=originals.get(url);if(!g){g=new STLLoader().loadAsync(url).then(x=>{x.computeVertexNormals();return x;},()=>undefined);originals.set(url,g);}return g;};
const n=(x:number)=>String(+x.toFixed(1)).replace('.',',');

export class GearboxEditor{
 /** The selected gearbox link. */
 selectedId?:string;
 private stores?:Promise<{gear:ProjectStore;shaft:ProjectStore}>;
 private docs=new Map<string,Loaded|'missing'>();private loading=new Set<string>();private stale=new Set<string>();
 private names?:{id:string;name:string}[];private listing=false;
 private cad?:CadClient;
 private meshes=new Map<string,{key:string;pieces?:Piece[];error?:string;busy?:string}>();
 /** What is drawn now, to follow the sliders without drawing again. */
 private shown:{link:GearLink;object:THREE.Object3D;arms:Map<string,THREE.Object3D>;plan:GearPlan}[]=[];
 constructor(private host:GearboxHost){addEventListener('focus',()=>{if(this.dialog?.hidden!==false)this.reload();});}
 private open(){return this.stores??=Promise.all([ProjectStore.open('getriebe','gear-1'),ProjectStore.open('wellen','shaft-1')]).then(([gear,shaft])=>({gear,shaft}));}
 /** Reads the gearboxes again (back from the generator): what changed is meshed anew, the rest stays. */
 reload(){for(const k of this.docs.keys())this.stale.add(k);this.names=undefined;this.host.refresh();this.host.leave();}
 /** What is read of a gearbox; read again when stale, the old state meanwhile. */
 private loaded(id:string):Loaded|undefined{const d=this.docs.get(id);if((d===undefined||this.stale.has(id))&&!this.loading.has(id)){this.loading.add(id);void this.load(id);}return typeof d==='object'?d:undefined;}
 private async load(id:string){
  try{const {gear,shaft}=await this.open(),f=await gear.read(id),doc=parseGear(f.doc),files:Record<string,ShaftFile>={};
   for(const s of doc.shafts){if(files[s.shaft])continue;try{const x=await shaft.read(s.shaft);files[s.shaft]={name:x.name,doc:parseShaft(x.doc)};}catch{/* missing: the plan says so */}}
   const key=JSON.stringify([f.name,doc,files]),was=this.docs.get(id);this.stale.delete(id);this.loading.delete(id);if(typeof was==='object'&&was.key===key)return;this.docs.set(id,{name:f.name,doc,files,key});}catch{this.stale.delete(id);this.loading.delete(id);this.docs.set(id,'missing');}
  this.host.refresh();this.host.leave();}
 /** The gearbox's plan, made once per state. */
 planOf(id:string){const d=this.loaded(id);if(!d)return undefined;try{return d.plan??=planGear(d.doc,d.files);}catch{return undefined;}}
 nameOf(id:string){const d=this.docs.get(id);return d&&typeof d!=='string'?d.name:this.names?.find(x=>x.id===id)?.name??'Getriebe';}
 private linkOf(id:string){return this.host.build()?.gears?.find(g=>g.id===id);}
 /** A body's name for people: the gearbox, or one of its swing arms. */
 bodyName(key:string){const [id,group]=key.slice('getriebe:'.length).split('/'),l=this.linkOf(id);if(!l)return 'Getriebe';const name=this.nameOf(l.gear);return group?`${name}: ${this.planOf(l.gear)?.groups.find(g=>g.id===group)?.name??'Schwinge'}`:name;}
 /** The solids of a gearbox as the view shows them, asked from the CAD worker when its state is new. */
 private pieces(id:string):Piece[]|undefined{const d=this.loaded(id);if(!d)return undefined;let m=this.meshes.get(id);
  if(m?.key===d.key&&(m.pieces||m.error))return m.pieces;
  if(!m){m={key:d.key};this.meshes.set(id,m);}
  if(m.busy)return m.pieces;
  const want=d.key;m.busy=want;this.cad??=new CadClient();const used=Object.fromEntries(Object.entries(d.files).map(([k,v])=>[k,{name:v.name,doc:v.doc}]));
  void this.cad.request('mesh',d.doc,{files:used}).then(r=>{const x=this.meshes.get(id)!;x.busy=undefined;x.key=want;if(r.kind==='error'){x.error=r.message;x.pieces=undefined;}else if(r.kind==='mesh'){x.error=undefined;x.pieces=this.make(r.meshes);}this.host.refresh();this.host.leave();},
   e=>{const x=this.meshes.get(id)!;x.busy=undefined;x.key=want;x.error=String(e?.message??e);this.host.refresh();this.host.leave();});
  return m.pieces;}
 private make(meshes:MeshData[]):Piece[]{const out:Piece[]=[];
  for(const m of meshes){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(m.vertices,3));g.setAttribute('normal',new THREE.BufferAttribute(m.normals,3));g.setIndex(new THREE.BufferAttribute(m.triangles,1));
   const bought=m.kind==='kauf',material=new THREE.MeshStandardMaterial({color:m.color,metalness:bought?.55:.3,roughness:bought?.4:.6,side:THREE.DoubleSide}),piece:Piece={geometry:g,material,body:m.body??''};
   if(m.edges.length&&!m.asset){const e=new THREE.BufferGeometry();e.setAttribute('position',new THREE.BufferAttribute(m.edges,3));piece.edges=e;}
   // A bought part with its original model: that replaces the stand-in once it is loaded.
   if(m.asset){const a=m.asset;void original(a.url).then(o=>{if(!o)return;piece.geometry=o;piece.matrix=new THREE.Matrix4().fromArray(a.matrix);this.host.refresh();});}
   out.push(piece);}
  return out;}

 // ---------- in the room ----------
 /** The frames of every swing arm: on the gearbox's frame, each turned by its slider; mirrored, the other way round. */
 armFrames(b:Build,frames:Record<string,Frame>,values:Record<string,number>){const out:Record<string,Frame>={};
  for(const l of b.gears??[]){const plan=this.planOf(l.gear);if(!plan?.groups.length)continue;const at=frames[gearBody(l.id)]??l.free.frame,angles=this.angles(l,plan,values);
   for(const g of plan.groups)out[armBody(l.id,g.id)]=compose(at,armFrame(plan,g.id,angles,l.mirror?-1:1));}
  return out;}
 /** The middle of a gearbox's height: what it is mirrored across. */
 middle(plan:GearPlan){const zs=[...plan.shafts.flatMap(x=>[x.z0,x.z1]),...plan.layers.flatMap(l=>l.band)];return zs.length?(Math.min(...zs)+Math.max(...zs))/2:0;}
 private angles(l:GearLink,plan:GearPlan,values:Record<string,number>){return Object.fromEntries(plan.groups.map(g=>[g.id,Math.min(g.to,Math.max(g.from,values[armBody(l.id,g.id)]??0))]));}
 /** Every linked gearbox into the view: its frame, mirrored inside if so, the swing arms' parts on their arms. */
 draw(root:THREE.Group,b:Build,frames:Record<string,Frame>,values:Record<string,number>){this.shown=[];
  for(const l of b.gears??[]){const outer=new THREE.Group();outer.userData.gearbox=l.id;place(outer,frames[gearBody(l.id)]??l.free.frame);root.add(outer);
   const inner=new THREE.Group();outer.add(inner);
   const plan=this.planOf(l.gear),pieces=this.pieces(l.gear),selected=l.id===this.selectedId;
   // Mirrored in place: across the middle of its height, so it stays where it stood.
   if(l.mirror){inner.scale.set(1,1,-1);inner.position.z=plan?2*this.middle(plan):0;}
   if(!plan||!pieces){const box=new THREE.Mesh(new THREE.BoxGeometry(40,40,20),new THREE.MeshBasicMaterial({color:0x7fb6ff,wireframe:true,transparent:true,opacity:.4}));box.position.z=10;inner.add(box);continue;}
   const arms=new Map<string,THREE.Object3D>(),angles=this.angles(l,plan,values),bodyOf=(body:string)=>{if(!body)return inner;let a=arms.get(body);if(!a){a=new THREE.Group();place(a,armFrame(plan,body,angles));inner.add(a);arms.set(body,a);}return a;};
   for(const p of pieces){const m=new THREE.Mesh(p.geometry,p.material);m.userData.shared=true;if(p.matrix){m.matrixAutoUpdate=false;m.matrix.copy(p.matrix);}const into=bodyOf(plan.groups.some(g=>g.id===p.body)?p.body:'');into.add(m);
    if(p.edges){const e=new THREE.LineSegments(p.edges,new THREE.LineBasicMaterial({color:selected?0xffffff:0x1b2329}));e.userData.shared=true;into.add(e);}}
   this.shown.push({link:l,object:outer,arms,plan});}}
 /** The sliders moved: frames and swing arms follow, nothing is drawn again. */
 follow(frames:Record<string,Frame>,values:Record<string,number>){for(const s of this.shown){const f=frames[gearBody(s.link.id)];if(f)place(s.object,f);const angles=this.angles(s.link,s.plan,values);for(const [g,o] of s.arms)place(o,armFrame(s.plan,g,angles));}}
 get moving(){return this.shown.some(s=>s.arms.size>0)||this.shown.some(s=>s.link.free.body);}
 /** The gearbox under the pointer. */
 at(ray:THREE.Raycaster,root:THREE.Group){root.updateWorldMatrix(true,true);let o:THREE.Object3D|null|undefined=ray.intersectObjects(root.children,true)[0]?.object;while(o&&!o.userData.gearbox&&!o.userData.item&&!o.userData.plate)o=o.parent;return o?.userData.gearbox as string|undefined;}

 // ---------- sliders, library, tree, page ----------
 /** One slider per swing arm, under the view. */
 renderAxes(root:HTMLElement){const b=this.host.build(),values=this.host.values(),rows:HTMLElement[]=[];
  for(const l of b?.gears??[]){const plan=this.planOf(l.gear);for(const g of plan?.groups??[]){const key=armBody(l.id,g.id),value=Math.min(g.to,Math.max(g.from,values[key]??0)),name=(b!.gears!.length>1?`${this.nameOf(l.gear)} · `:'')+g.name;
   const slider=el('input',{type:'range',min:String(g.from),max:String(g.to),step:'0.5',value:String(value)}),out=el('output',{textContent:`${n(value)}°`});slider.dataset.axis=name;slider.dataset.arm=key;slider.setAttribute('aria-label',`${name} schwenken`);
   slider.oninput=()=>{values[key]=Number(slider.value);out.textContent=`${n(Number(slider.value))}°`;};rows.push(el('label',{className:'axis-row'},el('span',{textContent:name}),slider,out));}}
  if(!rows.length)return false;root.append(el('h3',{textContent:'Getriebe schwenken'}),...rows);return true;}
 /** The gearboxes of the generator, to link into the build; a new one is made in the generator's window. */
 renderStore(root:HTMLElement){const box=el('details',{className:'store-group',open:!!this.host.build()?.gears?.length},el('summary',{textContent:'Getriebe (Getriebe-Generator)'}));box.dataset.storeGearboxes='true';
  box.append(el('p',{className:'muted',textContent:'Verknüpft, nicht kopiert: Was du im Getriebe-Generator änderst, gilt hier sofort. Anklicken setzt es neben das, was schon da ist.'}));
  const list=el('div',{className:'part-store'});box.append(list);
  if(!this.names){list.append(el('p',{className:'muted',textContent:'Liest die Getriebe …'}));if(!this.listing){this.listing=true;void this.open().then(s=>s.gear.list()).then(all=>{this.names=all.map(e=>({id:e.id,name:e.name}));},()=>{this.names=[];}).finally(()=>{this.listing=false;this.host.leave();});}}
  else if(!this.names.length)list.append(el('p',{className:'muted',textContent:'Noch keine Getriebe.'}));
  for(const g of this.names??[]){const card=el('button',{className:'part-card',title:'Ins Projekt holen'},el('strong',{textContent:g.name}),el('small',{textContent:'Getriebe'}));card.dataset.gearbox=g.id;card.onclick=()=>this.add(g.id,g.name);list.append(card);}
  const make=el('button',{textContent:'＋ Neues Getriebe'});make.dataset.gearboxNew='true';make.onclick=()=>this.edit();
  box.append(el('div',{className:'button-row'},make,el('a',{className:'ghost button',href:'./getriebe.html',target:'_blank',textContent:'Getriebe-Generator ↗'})));root.append(box);}
 add(gear:string,name:string){const id='g-'+crypto.randomUUID().slice(0,8),at=this.host.beside();
  this.host.change(()=>{const b=this.host.ensure();(b.gears??=[]).push({id,gear,free:{frame:{position:at,rotation:[0,0,0,1]}}});},`${name} verknüpft: Ändern im Getriebe-Generator.`);this.host.picked();this.selectedId=id;this.host.refresh();this.host.leave();}
 /** The tree's rows: one per gearbox. */
 rows(){return (this.host.build()?.gears??[]).map(l=>({id:l.id,text:`⚙▣ ${this.nameOf(l.gear)}${l.mirror?' (gespiegelt)':''}`}));}
 select(id:string|undefined){this.selectedId=id;}
 /** The page of a gearbox: what it is, edit it, mirror it, turn it; its swing arms as bodies. Where it stands and on
  * what follows (the build's connection fields). */
 renderProperties(root:HTMLElement,l:GearLink){const d=this.loaded(l.gear),plan=this.planOf(l.gear),m=this.meshes.get(l.gear);
  root.append(el('h2',{textContent:`⚙▣ ${this.nameOf(l.gear)}`}));
  const state=this.docs.get(l.gear)==='missing'?'Die Datei fehlt im Getriebe-Generator (gelöscht?).':!d?'Liest das Getriebe …':m?.error?`Kein 3D-Modell: ${m.error}`:m?.busy?'3D-Modell rechnet …':'Verknüpft mit dem Getriebe-Generator: Änderungen dort gelten hier sofort.';
  root.append(el('p',{id:'gearbox-state',className:m?.error||!d&&this.docs.get(l.gear)==='missing'?'state-fail':'muted',textContent:state}));
  const edit=el('button',{className:'primary',textContent:'✎ Im Getriebe-Generator bearbeiten'});edit.dataset.gearboxEdit=l.gear;edit.onclick=()=>this.edit(l.gear);
  root.append(el('div',{className:'button-row'},edit,el('a',{className:'ghost button',href:`./getriebe.html#open=${encodeURIComponent(l.gear)}`,target:'_blank',textContent:'In neuem Tab ↗'})));
  if(plan){const errors=plan.issues.filter(i=>i.level==='fehler').length,warnings=plan.issues.filter(i=>i.level==='warnung').length;if(errors||warnings)root.append(el('p',{className:errors?'state-fail':'state-warn',textContent:`Im Getriebe: ${errors?`${errors} Fehler`:''}${errors&&warnings?', ':''}${warnings?`${warnings} ${warnings===1?'Warnung':'Warnungen'}`:''}. Im Getriebe-Generator steht, was.`}));}
  const mirror=el('input',{type:'checkbox',checked:!!l.mirror});mirror.dataset.field='Gespiegelt';mirror.onchange=()=>this.write(l.id,mirror.checked?'Gespiegelt: die andere Seite.':'Nicht mehr gespiegelt.',x=>{if(mirror.checked)x.mirror=true;else delete x.mirror;});
  root.append(el('label',{className:'check'},mirror,'Gespiegelt (über die Platten, z. B. die linke Seite eines Fahrzeugs)'));
  const turn=(axis:V,label:string)=>{const b=el('button',{className:'ghost',textContent:label});b.dataset.gearboxTurn=label;b.onclick=()=>this.write(l.id,'Getriebe gedreht.',x=>{x.free.frame=compose(x.free.frame,{position:[0,0,0],rotation:axisAngle(axis,90)});});return b;};
  root.append(el('div',{className:'button-row'},turn([1,0,0],'↻ 90° um X'),turn([0,1,0],'↻ 90° um Y'),turn([0,0,1],'↻ 90° um Z')));
  if(plan?.groups.length){root.append(el('h3',{textContent:'Schwingen'}),el('p',{className:'muted',textContent:'Jede Schwinge ist ein Körper: Teile, Platten und Gelenkpunkte lassen sich mit ihr verbinden („Verbunden mit“) und schwenken mit. Den Regler gibt es unter der Ansicht.'}));
   for(const g of plan.groups)root.append(el('p',{className:'muted',textContent:`${g.name}: ${n(g.from)}° bis ${n(g.to)}°${g.fixed?', fest auf ihrer Welle':', frei'}`}));}
  const remove=el('button',{className:'ghost danger',textContent:'Aus dem Projekt nehmen'});remove.dataset.gearboxRemove=l.id;remove.onclick=()=>{this.selectedId=undefined;this.host.change(()=>{const b=this.host.build()!;b.gears=(b.gears??[]).filter(x=>x.id!==l.id);if(!b.gears.length)delete b.gears;for(const i of b.items)if(i.free?.body?.startsWith(gearBody(l.id)))delete i.free.body;for(const p of b.plates)if(p.free.body?.startsWith(gearBody(l.id)))delete p.free.body;},'Getriebe aus dem Projekt genommen (die Datei bleibt im Getriebe-Generator).');};
  root.append(remove);}
 private write(id:string,message:string,fn:(l:GearLink)=>void){this.host.change(()=>{const l=this.linkOf(id);if(l)fn(l);},message);}

 // ---------- the generator in a window ----------
 private dialog?:HTMLElement;private editing?:{id?:string;created?:string};private timer?:ReturnType<typeof setTimeout>;
 private frame(){if(this.dialog)return this.dialog;
  const title=el('b',{id:'gearbox-dialog-title'}),tab=el('a',{id:'gearbox-dialog-tab',className:'ghost button',target:'_blank',textContent:'In neuem Tab ↗'}),done=el('button',{id:'gearbox-dialog-close',className:'primary',textContent:'Fertig'}),frame=el('iframe',{id:'gearbox-frame',title:'Getriebe-Generator'});
  const d=el('div',{id:'gearbox-dialog',hidden:true},el('div',{className:'dialog-bar'},title,el('span',{className:'muted',textContent:'Änderungen gelten sofort im Studio.'}),el('span',{className:'spacer'}),tab,done),frame);
  done.onclick=()=>void this.close();document.body.append(d);this.dialog=d;
  addEventListener('keydown',e=>{if(e.key==='Escape'&&!d.hidden)void this.close();});
  addEventListener('message',e=>{const m=e.data as {source?:string;type?:string;id?:string;name?:string};if(e.origin!==location.origin||m?.source!=='getriebe'||!m.id||d.hidden)return;
   if(m.type==='created'&&this.editing){this.editing.created=m.id;title.textContent=`Neues Getriebe: ${m.name}`;}
   if(m.type==='saved'){clearTimeout(this.timer);this.timer=setTimeout(()=>this.reload(),200);}});
  return d;}
 /** The gearbox generator over the Studio: a gearbox (`id`) or a new one, which comes into the project when done. */
 edit(id?:string){const d=this.frame();this.editing={...(id?{id}:{})};(d.querySelector('#gearbox-frame') as HTMLIFrameElement).src=`./getriebe.html#${id?`open=${encodeURIComponent(id)}`:'new=1'}&embed=1`;
  (d.querySelector('#gearbox-dialog-tab') as HTMLAnchorElement).href=id?`./getriebe.html#open=${encodeURIComponent(id)}`:'./getriebe.html';d.querySelector('#gearbox-dialog-title')!.textContent=id?`Getriebe bearbeiten: ${this.nameOf(id)}`:'Neues Getriebe';d.hidden=false;}
 /** Done: the frame writes what is still waiting, the gearboxes are read again. */
 async close(){const d=this.dialog;if(!d||d.hidden)return;const frame=d.querySelector('#gearbox-frame') as HTMLIFrameElement;try{frame.contentWindow?.dispatchEvent(new Event('pagehide'));}catch{/* not here */}
  d.hidden=true;frame.blur();window.focus();await new Promise(r=>setTimeout(r,350));frame.src='about:blank';const made=this.editing?.created;this.editing=undefined;this.reload();
  if(made)this.add(made,this.nameOf(made));}
 /** Test entries: is the gearbox drawn as solids, and how many pieces. */
 drawn(id:string){const s=this.shown.find(x=>x.link.id===id);if(!s)return undefined;let meshes=0;s.object.traverse(o=>{if(o instanceof THREE.Mesh&&o.userData.shared)meshes++;});return {meshes,arms:s.arms.size,mirrored:s.link.mirror===true};}
}
