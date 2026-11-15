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
import type {Build,GearLink,PlateNode} from './parts/build';
import {newPlateNode,newItem,plateRect,sheet,worldOf,reframe} from './parts/build';
import {gearMount,middle,studPlace} from './parts/gearmount';
import type {Mount} from './parts/gearmount';
import type {Prim} from '../structure/sdf';
import {partById} from './parts/catalog';
import {linkBody} from './parts/linkage';
import {gearExamples} from '../gear/examples.ts';
import {gearBody,armBody,plateBody} from './parts/links';
import {compose,axisAngle,rotate,dot} from './kinematics/math';
import type {Frame,V} from './kinematics/math';

export type GearboxHost={build:()=>Build|undefined;ensure:()=>Build;change:(edit:()=>void,message:string)=>void;status:(text:string)=>void;
 /** Draws the view again; draws the panels again. */refresh:()=>void;leave:()=>void;
 /** Where a new thing goes: beside all there is. */beside:()=>V;
 /** How far each body's slider is moved (the swing arms' by `armBody`). */values:()=>Record<string,number>;
 /** Something else is picked: the gearbox is not selected any more. */picked:()=>void;
 /** The room's bodies at rest (every slider at 0). */frames:()=>Record<string,Frame>;
 /** Saves solids as an STL file. */exportSolid:(g:{solids:Prim[];holes:Prim[]},name:string)=>void;};
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
/** The generator's folders, opened once for the whole page. */
let shared:Promise<{gear:ProjectStore;shaft:ProjectStore}>|undefined;
const stores=()=>shared??=Promise.all([ProjectStore.open('getriebe','gear-1'),ProjectStore.open('wellen','shaft-1')]).then(([gear,shaft])=>({gear,shaft}));
/** New files were written: the library lists the gearboxes again. */
let listed=0;
/** The angle bracket between a linked gearbox and a plate, where both stand (`frames`: the room's bodies at rest); the
 * points of the linkage on the gearbox's swing arms (ball studs) are kept clear. */
export function mountOf(b:Build,l:GearLink,plate:PlateNode,plan:GearPlan,frames:Record<string,Frame>):Mount{
 const prefix=gearBody(l.id)+'/',studs=(b.linkage?.links??[]).flatMap(k=>k.points.filter(p=>p.body.startsWith(prefix)).map(p=>({at:p.at,group:p.body.slice(prefix.length),what:`Kugelbolzen von ${k.label}`})));
 return gearMount({plan,mirror:!!l.mirror,gear:frames[gearBody(l.id)]??worldOf(l.free,frames),plate:frames[plateBody(plate.id)]??worldOf(plate.free,frames),thickness:plate.thickness,rect:plateRect(sheet(b,plate.id)),studs});}
/** Writes a bracket's holes into its plate (in place of the old ones). */
function holesOf(plate:PlateNode,id:string,m:Mount){plate.holes=[...plate.holes.filter(h=>!h.id.startsWith(`winkel-${id}-`)),...m.plateHoles.map((at,k)=>({id:`winkel-${id}-${k+1}`,at,d:m.d}))];}
/** Screws a gearbox to a plate: the bracket, its holes in the plate, and the gearbox hangs on the plate from then on. */
export function screwTo(b:Build,l:GearLink,plate:PlateNode,plan:GearPlan,frames:Record<string,Frame>){const id=`w-${l.id}`,m=mountOf(b,l,plate,plan,frames);
 b.mounts=[...(b.mounts??[]).filter(x=>x.gear!==l.id),{id,gear:l.id,plate:plate.id}];holesOf(plate,id,m);
 if(l.free.body!==plateBody(plate.id))l.free={...reframe(l.free,plateBody(plate.id),frames),...(l.free.joint?{joint:l.free.joint}:{})};return m;}
/** The solids of a bracket for the view. */
function primObject(p:Prim,material:THREE.Material){if(p.kind!=='slab')return undefined;const g=new THREE.ExtrudeGeometry(new THREE.Shape(p.points.map(([x,y])=>new THREE.Vector2(x,y))),{depth:p.z1-p.z0,bevelEnabled:false}).translate(0,0,p.z0),o=new THREE.Mesh(g,material);place(o,p.frame);return o;}
/** A gearbox example of the generator written into its folders, its shafts first, as the generator's start page does;
 * `tweak` may give it changed. Its id and plan. */
export async function saveGearExample(key:string,tweak?:(d:GearDoc,files:Record<string,ShaftFile>)=>GearDoc){const x=gearExamples.find(e=>e.key===key)!,{gear,shaft}=await stores(),ids:Record<string,string>={},files:Record<string,ShaftFile>={},now=new Date().toISOString();
 for(const s of x.shafts){const id=crypto.randomUUID().slice(0,12),doc=parseShaft(s.doc);ids[s.key]=id;files[id]={name:s.name,doc};await shaft.write(id,{format:'shaft-1',name:s.name,updated:now,doc});}
 await shaft.settled();const doc=tweak?tweak(x.make(ids),files):x.make(ids);const id=crypto.randomUUID().slice(0,12);await gear.write(id,{format:'gear-1',name:x.title,updated:now,doc:parseGear(doc)});await gear.settled();listed++;
 return {id,plan:planGear(parseGear(doc),files)};}
/** The Studio's example of a whole rover: one rocker-bogie gearbox linked twice (the left side as drawn, the right side
 * mirrored), a deck between them with an Arduino, and the differential bar: a printed bar on the deck, turning about
 * the length of the rover, and two turnbuckles down to a ball stud on each rocker (a bolt of the rocker set by hand, level
 * with its pivot, where it stays clear: parts/gearmount.ts `studPlace`). The right rocker is balanced against the left: it turns the other way round. */
export const roverExample={key:'rover',title:'Rocker-Bogie-Rover mit Ausgleichsbalken',text:'Beide Seiten aus einem Getriebe (rechts gespiegelt), Deck mit Arduino, Ausgleichsbalken mit zwei Stangen zu den Rockern.',
 make:async(b:Build)=>{let lever=36;const {id,plan}=await saveGearExample('rocker-lego',(d,files)=>{const s=studPlace(d,files,'g1');if(!s)throw Error('Am Rocker ist kein Platz für den Kugelbolzen.');lever=s.at[0];return s.doc;});
  // The sides: plates standing (the gearbox's z across the rover), the wheels' side outwards, 60 mm from the middle.
  const W=60,H=90,m=middle(plan),up=axisAngle([1,0,0],90);
  b.gears=[{id:'links',gear:id,label:'Seite links',free:{frame:{position:[0,-W,H],rotation:up}}},{id:'rechts',gear:id,label:'Seite rechts',mirror:true,free:{frame:{position:[0,W+2*m,H],rotation:up}}}];
  b.balances=[{a:armBody('links','g1'),b:armBody('rechts','g1')}];
  const deck=newPlateNode('deck',{position:[30,0,80],rotation:[0,0,0,1]});deck.mode='fixed';deck.size=[160,90];deck.mount.on=false;b.plates=[deck];
  b.items.push({...newItem('uno',partById('arduinouno3')!,[30,0]),plate:'deck'});
  // The bar over the deck, about x, above the studs: those 6 mm inside the rockers' plates (gearbox z −6), level with the
  // pivot: they move up and down, the same on both sides.
  const x=lever,stud=H,bar=stud+30,y=W-6;
  b.linkage={floor:80,links:[
   {id:'balken',label:'Ausgleichsbalken',kind:'lenker',d:6,points:[{id:'achse',kind:'dreh',at:[x-8,0,bar],to:[x+8,0,bar],body:''}]},
   {id:'stange-l',label:'Stange links',kind:'stab',points:[{id:'balken',kind:'kugel',at:[x,-y,bar],body:linkBody('balken'),part:'kugel-5.8'},{id:'rocker',kind:'kugel',at:[x,-y,stud],body:armBody('links','g1'),part:'kugel-5.8'}]},
   {id:'stange-r',label:'Stange rechts',kind:'stab',points:[{id:'balken',kind:'kugel',at:[x,y,bar],body:linkBody('balken'),part:'kugel-5.8'},{id:'rocker',kind:'kugel',at:[x,y,stud],body:armBody('rechts','g1'),part:'kugel-5.8'}]}]};
  // Both sides screwed to the deck by a bracket each: from here on they hang on it.
  const rest={[plateBody('deck')]:deck.free.frame};for(const l of b.gears)screwTo(b,l,deck,plan,rest);}};

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
 private open(){return stores();}
 private listedAt=0;
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
 /** A link's name: its own, or its file's. */
 title(l:GearLink){return l.label??this.nameOf(l.gear);}
 bodyName(key:string){const [id,group]=key.slice('getriebe:'.length).split('/'),l=this.linkOf(id);if(!l)return 'Getriebe';const name=this.title(l);return group?`${name}: ${this.planOf(l.gear)?.groups.find(g=>g.id===group)?.name??'Schwinge'}`:name;}
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
  for(const m of meshes){if(m.spring)continue;// A spring stretches between two bodies: not here.
   const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(m.vertices,3));g.setAttribute('normal',new THREE.BufferAttribute(m.normals,3));g.setIndex(new THREE.BufferAttribute(m.triangles,1));
   const bought=m.kind==='kauf',material=new THREE.MeshStandardMaterial({color:m.color,metalness:bought?.55:.3,roughness:bought?.4:.6,side:THREE.DoubleSide}),piece:Piece={geometry:g,material,body:m.body??''};
   if(m.edges.length&&!m.asset){const e=new THREE.BufferGeometry();e.setAttribute('position',new THREE.BufferAttribute(m.edges,3));piece.edges=e;}
   // A bought part with its original model: that replaces the stand-in once it is loaded.
   if(m.asset){const a=m.asset;void original(a.url).then(o=>{if(!o)return;piece.geometry=o;piece.matrix=new THREE.Matrix4().fromArray(a.matrix);this.host.refresh();});}
   out.push(piece);}
  return out;}

 // ---------- in the room ----------
 /** The frames of every swing arm: on the gearbox's frame, each turned by its slider; mirrored, the other way round. */
 armFrames(b:Build,frames:Record<string,Frame>,values:Record<string,number>){const out:Record<string,Frame>={};
  for(const l of b.gears??[]){const plan=this.planOf(l.gear);if(!plan?.groups.length)continue;const at=frames[gearBody(l.id)]??l.free.frame,angles=this.angles(l,plan,values,frames);
   for(const g of plan.groups)out[armBody(l.id,g.id)]=compose(at,armFrame(plan,g.id,angles,l.mirror?-1:1));}
  return out;}
 /** The axis a gearbox's swing arms turn about, in the room (its z; mirrored, the other way). */
 private axis(l:GearLink,frames:Record<string,Frame>={}){return rotate((frames[gearBody(l.id)]??l.free.frame).rotation,[0,0,l.mirror?-1:1]);}
 /** Each swing arm's angle: its slider, or, balanced against another arm, that one's turn the other way round in the
  * room (the differential bar of a rocker-bogie). */
 private angles(l:GearLink,plan:GearPlan,values:Record<string,number>,frames:Record<string,Frame>={}){const b=this.host.build();
  return Object.fromEntries(plan.groups.map(g=>{const key=armBody(l.id,g.id),bal=b?.balances?.find(x=>x.b===key),clamp=(v:number)=>Math.min(g.to,Math.max(g.from,v));
   if(bal){const [lid,gid]=bal.a.slice('getriebe:'.length).split('/'),o=b?.gears?.find(x=>x.id===lid),op=o&&this.planOf(o.gear),og=op?.groups.find(x=>x.id===gid);
    if(o&&og){const lead=Math.min(og.to,Math.max(og.from,values[bal.a]??0)),ratio=-dot(this.axis(o,frames),this.axis(l,frames));return [g.id,clamp(ratio*lead)];}}
   return [g.id,clamp(values[key]??0)];}));}
 /** A swing arm's name for sliders and lists: with its gearbox when there are several (mirrored ones say so). */
 armName(key:string){const [lid,gid]=key.slice('getriebe:'.length).split('/'),b=this.host.build(),l=b?.gears?.find(x=>x.id===lid),g=l&&this.planOf(l.gear)?.groups.find(x=>x.id===gid);if(!l)return 'Schwinge';
  return ((b!.gears!.length>1)?`${this.title(l)}${l.mirror&&!l.label?' (gespiegelt)':''} · `:'')+(g?.name??'Schwinge');}
 /** The arm this one follows by a balance, if any. */
 leader(key:string){return this.host.build()?.balances?.find(x=>x.b===key)?.a;}
 /** Every linked gearbox into the view: its frame, mirrored inside if so, the swing arms' parts on their arms. */
 draw(root:THREE.Group,b:Build,frames:Record<string,Frame>,values:Record<string,number>){this.shown=[];
  for(const l of b.gears??[]){const outer=new THREE.Group();outer.userData.gearbox=l.id;place(outer,frames[gearBody(l.id)]??l.free.frame);root.add(outer);
   const inner=new THREE.Group();outer.add(inner);
   const plan=this.planOf(l.gear),pieces=this.pieces(l.gear),selected=l.id===this.selectedId;
   // Mirrored in place: across the middle of its height, so it stays where it stood.
   if(l.mirror){inner.scale.set(1,1,-1);inner.position.z=plan?2*middle(plan):0;}
   if(!plan||!pieces){const box=new THREE.Mesh(new THREE.BoxGeometry(40,40,20),new THREE.MeshBasicMaterial({color:0x7fb6ff,wireframe:true,transparent:true,opacity:.4}));box.position.z=10;inner.add(box);continue;}
   const arms=new Map<string,THREE.Object3D>(),angles=this.angles(l,plan,values,frames),bodyOf=(body:string)=>{if(!body)return inner;let a=arms.get(body);if(!a){a=new THREE.Group();place(a,armFrame(plan,body,angles));inner.add(a);arms.set(body,a);}return a;};
   for(const p of pieces){const m=new THREE.Mesh(p.geometry,p.material);m.userData.shared=true;if(p.matrix){m.matrixAutoUpdate=false;m.matrix.copy(p.matrix);}const into=bodyOf(plan.groups.some(g=>g.id===p.body)?p.body:'');into.add(m);
    if(p.edges){const e=new THREE.LineSegments(p.edges,new THREE.LineBasicMaterial({color:selected?0xffffff:0x1b2329}));e.userData.shared=true;into.add(e);}}
   this.shown.push({link:l,object:outer,arms,plan});}
  // The brackets, in the room.
  for(const mt of b.mounts??[]){const l=b.gears?.find(x=>x.id===mt.gear),plate=b.plates.find(p=>p.id===mt.plate),plan=l&&this.planOf(l.gear);if(!l||!plate||!plan)continue;const r=mountOf(b,l,plate,plan,frames),mat=new THREE.MeshStandardMaterial({color:r.issues.length?0xd9845c:0xc58a4a,roughness:.6});
   const g=new THREE.Group();g.userData.gearbox=l.id;g.userData.mount=mt.id;for(const p of r.solids){const o=primObject(p,mat);if(o)g.add(o);}root.add(g);}}
 /** The sliders moved: frames and swing arms follow, nothing is drawn again. */
 follow(frames:Record<string,Frame>,values:Record<string,number>){for(const s of this.shown){const f=frames[gearBody(s.link.id)];if(f)place(s.object,f);const angles=this.angles(s.link,s.plan,values,frames);for(const [g,o] of s.arms)place(o,armFrame(s.plan,g,angles));}}
 get moving(){return this.shown.some(s=>s.arms.size>0)||this.shown.some(s=>s.link.free.body);}
 /** The gearbox under the pointer. */
 at(ray:THREE.Raycaster,root:THREE.Group){root.updateWorldMatrix(true,true);let o:THREE.Object3D|null|undefined=ray.intersectObjects(root.children,true)[0]?.object;while(o&&!o.userData.gearbox&&!o.userData.item&&!o.userData.plate)o=o.parent;return o?.userData.gearbox as string|undefined;}

 // ---------- sliders, library, tree, page ----------
 /** One slider per swing arm, under the view. */
 renderAxes(root:HTMLElement){const b=this.host.build(),values=this.host.values(),rows:HTMLElement[]=[];
  for(const l of b?.gears??[]){const plan=this.planOf(l.gear);for(const g of plan?.groups??[]){const key=armBody(l.id,g.id),value=Math.min(g.to,Math.max(g.from,values[key]??0)),name=this.armName(key);
   // An arm balanced against another follows it: no slider of its own.
   const lead=this.leader(key);if(lead){const o=el('output',{textContent:`folgt ${this.armName(lead)} gegenläufig (Ausgleich)`});o.dataset.follows=key;rows.push(el('label',{className:'axis-row'},el('span',{textContent:name}),o));continue;}
   const slider=el('input',{type:'range',min:String(g.from),max:String(g.to),step:'0.5',value:String(value)}),out=el('output',{textContent:`${n(value)}°`});slider.dataset.axis=name;slider.dataset.arm=key;slider.setAttribute('aria-label',`${name} schwenken`);
   slider.oninput=()=>{values[key]=Number(slider.value);out.textContent=`${n(Number(slider.value))}°`;};rows.push(el('label',{className:'axis-row'},el('span',{textContent:name}),slider,out));}}
  if(!rows.length)return false;root.append(el('h3',{textContent:'Getriebe schwenken'}),...rows);return true;}
 /** The gearboxes of the generator, to link into the build; a new one is made in the generator's window. */
 renderStore(root:HTMLElement){const box=el('details',{className:'store-group',open:!!this.host.build()?.gears?.length},el('summary',{textContent:'Getriebe (Getriebe-Generator)'}));box.dataset.storeGearboxes='true';
  box.append(el('p',{className:'muted',textContent:'Verknüpft, nicht kopiert: Was du im Getriebe-Generator änderst, gilt hier sofort. Anklicken setzt es neben das, was schon da ist.'}));
  const list=el('div',{className:'part-store'});box.append(list);
 if(this.listedAt!==listed){this.listedAt=listed;this.names=undefined;}
  if(!this.names){list.append(el('p',{className:'muted',textContent:'Liest die Getriebe …'}));if(!this.listing){this.listing=true;void this.open().then(s=>s.gear.list()).then(all=>{this.names=all.map(e=>({id:e.id,name:e.name}));},()=>{this.names=[];}).finally(()=>{this.listing=false;this.host.leave();});}}
  else if(!this.names.length)list.append(el('p',{className:'muted',textContent:'Noch keine Getriebe.'}));
  for(const g of this.names??[]){const card=el('button',{className:'part-card',title:'Ins Projekt holen'},el('strong',{textContent:g.name}),el('small',{textContent:'Getriebe'}));card.dataset.gearbox=g.id;card.onclick=()=>this.add(g.id,g.name);list.append(card);}
  const make=el('button',{textContent:'＋ Neues Getriebe'});make.dataset.gearboxNew='true';make.onclick=()=>this.edit();
  box.append(el('div',{className:'button-row'},make,el('a',{className:'ghost button',href:'./getriebe.html',target:'_blank',textContent:'Getriebe-Generator ↗'})));root.append(box);}
 add(gear:string,name:string){const id='g-'+crypto.randomUUID().slice(0,8),at=this.host.beside();
  this.host.change(()=>{const b=this.host.ensure();(b.gears??=[]).push({id,gear,free:{frame:{position:at,rotation:[0,0,0,1]}}});},`${name} verknüpft: Ändern im Getriebe-Generator.`);this.host.picked();this.selectedId=id;this.host.refresh();this.host.leave();}
 /** The tree's rows: one per gearbox. */
 rows(){return (this.host.build()?.gears??[]).map(l=>({id:l.id,text:`⚙▣ ${this.title(l)}${l.mirror?' (gespiegelt)':''}`}));}
 select(id:string|undefined){this.selectedId=id;}
 /** The page of a gearbox: what it is, edit it, mirror it, turn it; its swing arms as bodies. Where it stands and on
  * what follows (the build's connection fields). */
 renderProperties(root:HTMLElement,l:GearLink){const d=this.loaded(l.gear),plan=this.planOf(l.gear),m=this.meshes.get(l.gear);
  root.append(el('h2',{textContent:`⚙▣ ${this.title(l)}`}));
  const name=el('input',{type:'text',value:l.label??'',placeholder:this.nameOf(l.gear)});name.dataset.field='Name im Projekt';name.onchange=()=>{const v=name.value.trim().slice(0,80);this.write(l.id,v?`Heißt im Projekt „${v}“.`:'Heißt wieder wie die Datei.',x=>{if(v)x.label=v;else delete x.label;});};
  root.append(el('label',{},'Name im Projekt',name),el('p',{className:'muted',textContent:`Datei im Getriebe-Generator: ${this.nameOf(l.gear)}`}));
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
   const b=this.host.build()!,others=(b.gears??[]).filter(x=>x.id!==l.id).flatMap(x=>(this.planOf(x.gear)?.groups??[]).map(g=>armBody(x.id,g.id)));
   for(const g of plan.groups){const key=armBody(l.id,g.id);root.append(el('p',{className:'muted',textContent:`${g.name}: ${n(g.from)}° bis ${n(g.to)}°${g.fixed?', fest auf ihrer Welle':', frei'}`}));
    // A balance: this arm turns against another one in the room, as a differential bar makes the two rockers of a rover do.
    if(!others.length)continue;const s=el('select');s.dataset.balance=key;s.add(new Option('keinem (eigener Regler)',''));for(const o of others)s.add(new Option(this.armName(o),o));s.value=b.balances?.find(x=>x.b===key)?.a??'';
    s.onchange=()=>this.host.change(()=>{const x=this.host.build()!;x.balances=(x.balances??[]).filter(y=>y.b!==key&&!(y.a===key&&y.b===s.value));if(s.value)x.balances.push({a:s.value,b:key});if(!x.balances.length)delete x.balances;},s.value?`${g.name} folgt ${this.armName(s.value)} gegenläufig: Ausgleich.`:`${g.name} hat wieder einen eigenen Regler.`);
    root.append(el('label',{},`${g.name}: Ausgleich mit`,s));}
   if(others.length)root.append(el('p',{className:'muted',textContent:'Ausgleich: Die Schwinge dreht im Raum gegenläufig zur gewählten, so wie ein Ausgleichsbalken die beiden Rocker eines Rovers koppelt. Den Balken selbst baust du als Gestänge (Bibliothek „Fahrwerk“) oder nimmst das Beispiel „Rocker-Bogie-Rover“.'}));}
  this.mountPage(root,l);
  const remove=el('button',{className:'ghost danger',textContent:'Aus dem Projekt nehmen'});remove.dataset.gearboxRemove=l.id;remove.onclick=()=>{this.selectedId=undefined;this.host.change(()=>{const b=this.host.build()!;b.gears=(b.gears??[]).filter(x=>x.id!==l.id);if(!b.gears.length)delete b.gears;for(const o of b.mounts??[])if(o.gear===l.id){const q=b.plates.find(y=>y.id===o.plate);if(q)q.holes=q.holes.filter(h=>!h.id.startsWith(`winkel-${o.id}-`));}if(b.mounts){b.mounts=b.mounts.filter(o=>o.gear!==l.id);if(!b.mounts.length)delete b.mounts;}if(b.balances){b.balances=b.balances.filter(x=>!x.a.startsWith(gearBody(l.id)+'/')&&!x.b.startsWith(gearBody(l.id)+'/'));if(!b.balances.length)delete b.balances;}for(const i of b.items)if(i.free?.body?.startsWith(gearBody(l.id)))delete i.free.body;for(const p of b.plates)if(p.free.body?.startsWith(gearBody(l.id)))delete p.free.body;},'Getriebe aus dem Projekt genommen (die Datei bleibt im Getriebe-Generator).');};
  root.append(remove);}
 /** "An einer Platte festschrauben": which plate, the bracket that does it, its parts and its STL. */
 private mountPage(root:HTMLElement,l:GearLink){const b=this.host.build()!,plan=this.planOf(l.gear),mt=b.mounts?.find(x=>x.gear===l.id);root.append(el('h3',{textContent:'Festschrauben'}));
  if(!b.plates.length){root.append(el('p',{className:'muted',textContent:'Eine Bodenplatte (Deck) ins Projekt holen: Dann lässt sich das Getriebe mit einem gedruckten Winkel an sie schrauben.'}));return;}
  const s=el('select');s.dataset.mount=l.id;s.add(new Option('keiner',''));b.plates.forEach((p,k)=>s.add(new Option(`Bodenplatte${b.plates.length>1?' '+(k+1):''}`,p.id)));s.value=mt?.plate??'';
  s.onchange=()=>{const frames=this.host.frames(),v=s.value;if(!plan)return;this.host.change(()=>{const x=this.host.build()!,g=x.gears?.find(y=>y.id===l.id),p=x.plates.find(y=>y.id===v);for(const o of x.mounts??[])if(o.gear===l.id){const q=x.plates.find(y=>y.id===o.plate);if(q)q.holes=q.holes.filter(h=>!h.id.startsWith(`winkel-${o.id}-`));}
   x.mounts=(x.mounts??[]).filter(o=>o.gear!==l.id);if(!x.mounts.length)delete x.mounts;if(g&&p)screwTo(x,g,p,plan,frames);},v?'Mit einem Winkel an die Platte geschraubt: das Getriebe hängt jetzt an ihr.':'Winkel entfernt.');};
  root.append(el('label',{},'An Platte schrauben',s));
  const plate=mt&&b.plates.find(p=>p.id===mt.plate);if(!mt||!plate||!plan){root.append(el('p',{className:'muted',textContent:'Ein gedruckter Winkel liegt an der Gestellplatte, die zur Platte zeigt, auf den Säulenbolzen des Gestells, und greift mit einem Flansch unter die Platte.'}));return;}
  const r=mountOf(b,l,plate,plan,this.host.frames()),box=el('div',{id:'mount-state'});
  box.append(el('p',{className:r.issues.length?'state-warn':'state-pass',textContent:r.solids.length?`${r.issues.length?'⚠':'✓'} Winkel auf ${r.bolts.length} Säulenbolzen des Gestells, Flansch mit 2 Schrauben unter der Platte.`:'Kein Winkel möglich.'}));
  for(const i of r.issues)box.append(el('p',{className:'state-warn',textContent:i}));
  // The holes in the plate are written when it is screwed on; moved since, they are set again by hand.
  const want=r.plateHoles,have=plate.holes.filter(h=>h.id.startsWith(`winkel-${mt.id}-`)).map(h=>h.at),off=want.length!==have.length||want.some((p,k)=>Math.hypot(p[0]-have[k][0],p[1]-have[k][1])>.2);
  if(off){const fix=el('button',{textContent:'Löcher in der Platte neu setzen'});fix.dataset.mountHoles=l.id;fix.onclick=()=>this.host.change(()=>{const x=this.host.build()!,p=x.plates.find(y=>y.id===plate.id),g=x.gears?.find(y=>y.id===l.id);if(p&&g)holesOf(p,mt.id,mountOf(x,g,p,plan,this.host.frames()));},'Löcher für den Winkel neu gesetzt.');box.append(el('p',{className:'state-warn',textContent:'Getriebe oder Platte stehen anders als beim Festschrauben: Die Löcher in der Platte passen nicht mehr.'}),fix);}
  for(const x of r.bom)box.append(el('p',{className:'muted',textContent:`${x.count} × ${x.what}`}));
  if(r.solids.length){const stl=el('button',{className:'primary',textContent:'⬇ Winkel als STL'});stl.dataset.mountStl=l.id;stl.onclick=()=>this.host.exportSolid({solids:r.solids,holes:r.holes},`winkel-${(l.label??this.nameOf(l.gear)).replace(/[^\wäöüÄÖÜß-]+/g,'_')}`);box.append(stl);}
  root.append(box);}
 /** Test entry: the bracket of a gearbox, where it stands now. */
 mount(id:string){const b=this.host.build(),mt=b?.mounts?.find(x=>x.gear===id),l=b?.gears?.find(x=>x.id===id),p=mt&&b?.plates.find(x=>x.id===mt.plate),plan=l&&this.planOf(l.gear);if(!b||!l||!p||!plan)return undefined;const r=mountOf(b,l,p,plan,this.host.frames());return {bolts:r.bolts.length,issues:r.issues,solids:r.solids.length,holes:p.holes.filter(h=>h.id.startsWith(`winkel-${mt!.id}-`)).length};}
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
