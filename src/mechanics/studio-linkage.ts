// Linkages in the Studio: one chooses the joint points, the links follow. Wishbones, rockers and carriers are printed
// and drawn as they will be printed; stabs (turnbuckles) and dampers are bought and drawn between their ends. Points are
// handles in the view: dragged in the design pose (sliders at 0), they rest in the mm grid and, dropped on another
// link, join it. A slider moves the linkage, everything on it goes along; what one reads off stands under it. ③ makes
// the printed links and the brackets on the chassis.
import * as THREE from 'three';
import type {Build} from './parts/build';
import type {Prim} from '../structure/sdf';
import type {Frame,V} from './kinematics/math';
import {newLinkage,pushrodCorner,linkBody,linkOfBody,isBody,isDistance,LinkageSolver,read,sweep,motionRatio,linkageIssues,linkSolids,mountSolids,linkageShopping,dampers,ballJoints,wheelParts,damperOf,wheelOf,ballOf,pointsOn} from './parts/linkage';
import type {Linkage,Link,Point,Around,LinkPose,LinkKind} from './parts/linkage';

export type LinkageHost={build:()=>Build|undefined;change:(edit:()=>void,message:string)=>void;status:(text:string)=>void;leave:()=>void;
 /** Clears the other selections. */pick:()=>void;ray:(e:{clientX:number;clientY:number})=>THREE.Raycaster;canvas:()=>HTMLCanvasElement;/** The group the build is drawn in: points are in its coordinates. */root:()=>THREE.Object3D;orbit:(on:boolean)=>void;
 /** The build to change, made if there is none (inside a change). */ensure:()=>Build;
 /** Bodies outside the linkage a point can hang on (key, name): parts, plates, shafts. */bodies:()=>[string,string][];name:(key:string)=>string;
 phase?:()=>number;exportSolid:(g:{solids:Prim[];holes:Prim[]},name:string)=>void};
const el=<K extends keyof HTMLElementTagNameMap>(tag:K,props:Record<string,unknown>={},...children:(Node|string)[]):HTMLElementTagNameMap[K]=>{const e=document.createElement(tag);Object.assign(e,props);e.append(...children);return e;};
const heading=(text:string)=>el('h2',{textContent:text});
const de=(n:number,d=1)=>n.toFixed(d).replace('.',',').replace(/^-(0,0*)$/,'$1');
const signed=(n:number,d=1)=>`${n>0?'+':''}${de(n,d)}`;
const icon:Record<LinkKind,string>={lenker:'⟋',stab:'―',feder:'⌇'};
const kindText:Record<LinkKind,string>={lenker:'Gedruckter Lenker: seine Form entsteht aus allen Punkten an ihm.',stab:'Gekauft: Spannschloss M3 mit zwei Kugelpfannen. Fest ist nur der Abstand seiner Enden.',feder:'Gekauft: Öldämpfer. Er hält nichts fest; seine Länge ist, was man abliest.'};
const sub=(a:V,b:V):V=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const lerp=(a:V,b:V,t:number):V=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const v3=(p:V)=>new THREE.Vector3(...p);
/** A mesh between two points along y of a unit cylinder: placed again each time its ends move. */
function between(o:THREE.Object3D,a:V,b:V){const d=v3(b).sub(v3(a)),l=d.length();o.position.copy(v3(a).add(v3(b)).multiplyScalar(.5));o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),l>1e-9?d.normalize():new THREE.Vector3(0,1,0));o.scale.set(1,Math.max(l,1e-3),1);}
const unitCylinder=(r:number,material:THREE.Material)=>new THREE.Mesh(new THREE.CylinderGeometry(r,r,1,20),material);
/** A printed shape in the view: the prims that go to the printer, holes left out. */
function solidMesh(s:Prim,material:THREE.Material):THREE.Object3D|undefined{
 if(s.kind==='sphere'){const m=new THREE.Mesh(new THREE.SphereGeometry(s.r,16,12),material);m.position.set(...s.center);return m;}
 if(s.kind==='capsule'){const g=new THREE.Group(),c=unitCylinder(s.r,material);between(c,s.a,s.b);g.add(c);for(const p of [s.a,s.b]){const m=new THREE.Mesh(new THREE.SphereGeometry(s.r,16,12),material);m.position.set(...p);g.add(m);}return g;}
 let geometry:THREE.BufferGeometry;
 if(s.kind==='cylinder')geometry=new THREE.CylinderGeometry(s.r,s.r,s.z1-s.z0,24).rotateX(Math.PI/2).translate(0,0,(s.z0+s.z1)/2);
 else if(s.kind==='box')geometry=new THREE.BoxGeometry(...s.half.map(v=>2*v) as [number,number,number]);else return undefined;
 const m=new THREE.Mesh(geometry,material);m.position.set(...s.frame.position);m.quaternion.set(...s.frame.rotation);return m;}

type Drag={link:string;point:string;which:'at'|'to';start:Linkage;plane:THREE.Plane;moved:boolean;from:[number,number]};
export class LinkageEditor{
 private sel?:string;private pointSel?:string;
 /** The page of the whole linkage (readings, what to buy) is open. */overview=false;
 /** Slider values by link id (degrees). */private inputs:Record<string,number>={};
 private solver=new LinkageSolver();private pose?:LinkPose;
 /** The linkage as a running drag shows it (the design pose). */private preview?:Linkage;private drag?:Drag;
 /** What moves with each frame: bodies of printed links, the stabs and dampers between their ends, the handles. */
 private bodies=new Map<string,THREE.Object3D>();private spans:{link:Link;parts:{object:THREE.Object3D;from:number;to:number;at?:number}[]}[]=[];private handles:{object:THREE.Object3D;point:Point;which:'at'|'to'}[]=[];
 private readout?:HTMLElement;private range?:{key:string;text:string};
 /** ③: the brackets on the chassis show in the view. */private showMounts=false;
 constructor(private host:LinkageHost){}
 get selectedId(){return this.sel;}
 /** The pointer's ray in the coordinates of the build (the room, z up). */
 private local(e:{clientX:number;clientY:number}){const root=this.host.root();root.updateWorldMatrix(true,false);return this.host.ray(e).ray.clone().applyMatrix4(root.matrixWorld.clone().invert());}
 select(id:string|undefined,point?:string){this.sel=id;this.pointSel=id?point:undefined;if(id)this.overview=false;}
 reset(){this.sel=undefined;this.pointSel=undefined;this.overview=false;this.inputs={};this.solver.reset();this.preview=undefined;this.drag=undefined;}
 private linkage():Linkage|undefined{return this.host.build()?.linkage;}
 private shown(){return this.preview??this.linkage();}
 /** The links' frames now: solved for the sliders, the world around as it stands (`around`). */
 solve(around:Around):Record<string,Frame>{const g=this.shown();if(!g?.links.length){this.pose=undefined;return {};}
  // While a point is dragged the linkage stands in its design pose: every frame is the identity.
  if(this.preview){const id:Frame={position:[0,0,0],rotation:[0,0,0,1]};this.pose={bodies:Object.fromEntries(g.links.filter(isBody).map(l=>[linkBody(l.id),id])),x:{},error:0,at:(_k,p)=>p};return this.pose.bodies;}
  this.pose=this.solver.solve(g,around,this.values(g));return this.pose.bodies;}
 private values(g:Linkage){return Object.fromEntries(g.links.filter(l=>l.input).map(l=>[l.id,Math.min(l.input!.max,Math.max(l.input!.min,this.inputs[l.id]??0))]));}
 get moving(){return !!this.shown()?.links.length;}

 // ---------- view ----------
 draw(group:THREE.Group,bad:ReadonlySet<string>=new Set()){this.bodies.clear();this.spans=[];this.handles=[];const g=this.shown();if(!g?.links.length)return;
  const making=(this.host.phase?.()??1)===3,root=new THREE.Group();root.userData.linkageRoot=true;group.add(root);
  const lit=(l:Link)=>l.id===this.sel?0xffffff:bad.has(l.id)?0xff5a55:undefined;
  for(const l of g.links){
   if(l.kind==='lenker'){const body=new THREE.Group();body.userData.linkage=l.id;const material=new THREE.MeshStandardMaterial({color:lit(l)??0xc58a4a,roughness:.6,emissive:l.id===this.sel?0x332211:0});
    try{for(const s of linkSolids(g,l.id).solids){const m=solidMesh(s,material);if(m)body.add(m);}}catch{/* a link without points draws nothing */}
    if(l.wheel){const w=wheelOf(l.wheel.part),u=v3(sub(l.wheel.to,l.wheel.at)).normalize(),tire=new THREE.Mesh(new THREE.CylinderGeometry(w.d/2,w.d/2,w.width,40),new THREE.MeshStandardMaterial({color:0x22272c,roughness:.9,transparent:true,opacity:.85}));
     tire.position.set(...l.wheel.to);tire.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),u);tire.userData.linkage=l.id;body.add(tire);}
    root.add(body);this.bodies.set(linkBody(l.id),body);continue;}
   // Bought: drawn between their two ends as they stand now.
   if(l.points.length!==2)continue;const parts:{object:THREE.Object3D;from:number;to:number;at?:number}[]=[];
   if(l.kind==='stab'){const m=unitCylinder(1.5,new THREE.MeshStandardMaterial({color:lit(l)??0xb8c2cc,metalness:.6,roughness:.35}));m.userData.linkage=l.id;parts.push({object:m,from:0,to:1});
    for(const k of [0,1]){const c=new THREE.Mesh(new THREE.SphereGeometry(ballOf(l.points[k].part).ball/2+1.2,14,10),new THREE.MeshStandardMaterial({color:0x2d3640}));c.userData.linkage=l.id;parts.push({object:c,from:k,to:k,at:0});}}
   else{const d=damperOf(l.part),body=unitCylinder(d.body/2,new THREE.MeshStandardMaterial({color:lit(l)??0x6f7d8a,metalness:.5,roughness:.4})),rod=unitCylinder(1.5,new THREE.MeshStandardMaterial({color:0xd8dde2,metalness:.8,roughness:.2})),spring=unitCylinder(d.spring/2,new THREE.MeshStandardMaterial({color:0xe2b93b,wireframe:true}));
    for(const o of [body,rod,spring])o.userData.linkage=l.id;
    // The rod runs eye to eye, the body hangs on the first eye, the spring spans most of it.
    parts.push({object:rod,from:0,to:1},{object:body,from:0,to:1,at:(d.length-d.stroke)*.62},{object:spring,from:.08,to:.88});}
   for(const p of parts)root.add(p.object);this.spans.push({link:l,parts});}
  if(making&&this.showMounts){const m=mountSolids(g),material=new THREE.MeshStandardMaterial({color:0x8fb3c9,roughness:.7,transparent:true,opacity:.85});for(const s of m.solids){const o=solidMesh(s,material);if(o){o.userData.linkageMount=true;root.add(o);}}}
  // Handles on every point, in ① and ②; in ③ the parts speak for themselves.
  if(!making)for(const l of g.links)for(const p of l.points)for(const which of (p.kind==='dreh'&&p.to?['at','to']:['at']) as ('at'|'to')[]){
   const on=l.id===this.sel&&p.id===this.pointSel,h=new THREE.Mesh(new THREE.SphereGeometry(on?2.8:2.2,14,10),new THREE.MeshBasicMaterial({color:on?0xffffff:p.body?0x63cbb3:0xffa64d,depthTest:false,transparent:true,opacity:.9}));
   h.renderOrder=10;h.userData.linkPoint={link:l.id,point:p.id,which};root.add(h);this.handles.push({object:h,point:p,which});}
  this.follow();}
 /** Puts everything where the solved pose has it: printed links by their frame, bought ones between their ends. */
 follow(){const pose=this.pose;if(!pose)return;
  for(const [key,o] of this.bodies){const f=pose.bodies[key];if(f){o.position.set(...f.position);o.quaternion.set(...f.rotation);}}
  for(const s of this.spans){const [a,b]=s.link.points,pa=pose.at(a.body,a.at),pb=pose.at(b.body,b.at),length=Math.hypot(...sub(pb,pa));
   // A part spans from share `from` to share `to` of the way between the ends; with `at` it is a cup on one end (0) or a
   // piece `at` mm long from the first end (a damper's body).
   for(const p of s.parts){if(p.at===0){p.object.position.set(...(p.from===0?pa:pb));continue;}
    if(p.at!==undefined){between(p.object,pa,lerp(pa,pb,Math.min(1,p.at/Math.max(length,1e-6))));continue;}
    between(p.object,lerp(pa,pb,p.from),lerp(pa,pb,p.to));}}
  for(const h of this.handles){const p=h.which==='to'?h.point.to!:h.point.at;h.object.position.set(...pose.at(h.point.body,p));}
  if(this.readout){const g=this.shown();if(g)this.readout.textContent=this.readingText(g,pose);}}
 private readingText(g:Linkage,pose:LinkPose){const r=read(g,pose),parts:string[]=[];
  if(r.lift!==undefined)parts.push(`Radhub ${signed(r.lift)} mm`,`Sturz ${signed(r.camber!,2)}°`,`Spur ${signed(r.toe!,2)}°`);
  for(const d of r.dampers)parts.push(`${d.label} ${de(d.length)} mm (${d.travel>=0?'eingefedert':'ausgefedert'} ${de(Math.abs(d.travel))} mm)${d.fits?'':' ⚠ außerhalb des Hubs'}`);
  if(pose.error>1e-3)parts.push(`⚠ schließt nicht (${de(pose.error,3)} mm)`);
  return parts.join(' · ');}

 // ---------- pointer ----------
 private hit(ray:THREE.Raycaster,group:THREE.Group){group.updateWorldMatrix(true,true);
  const handle=ray.intersectObjects(this.handles.map(h=>h.object),false)[0];if(handle)return {point:handle.object.userData.linkPoint as {link:string;point:string;which:'at'|'to'}};
  for(const h of ray.intersectObjects(group.children,true)){let o:THREE.Object3D|null=h.object;while(o&&o.userData.linkage===undefined&&!o.userData.linkageRoot)o=o.parent;if(o?.userData.linkage!==undefined)return {link:o.userData.linkage as string};if(!o?.userData.linkageRoot)return undefined;}
  return undefined;}
 hover(ray:THREE.Raycaster,group:THREE.Group){return !!this.hit(ray,group);}
 /** A press on a handle drags the point; on a link selects it. */
 pointerDown(e:PointerEvent,ray:THREE.Raycaster,group:THREE.Group){const h=this.hit(ray,group);if(!h)return false;this.host.pick();
  if('link' in h){this.select(h.link);this.host.leave();return true;}
  const g=this.linkage();if(!g)return false;this.select(h.point.link,h.point.point);
  const p=g.links.find(l=>l.id===h.point.link)?.points.find(q=>q.id===h.point.point);if(!p){this.host.leave();return true;}
  const at=h.point.which==='to'?p.to!:p.at,normal=this.local(e).direction.clone().negate();
  this.drag={...h.point,start:structuredClone(g),plane:new THREE.Plane().setFromNormalAndCoplanarPoint(normal,v3(at)),moved:false,from:[e.clientX,e.clientY]};
  this.host.orbit(false);const move=(ev:PointerEvent)=>this.dragMove(ev),up=(ev:PointerEvent)=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);this.host.orbit(true);this.dragEnd(ev);};
  window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);this.host.leave();return true;}
 private dragMove(e:PointerEvent){const d=this.drag;if(!d)return;if(!d.moved&&Math.hypot(e.clientX-d.from[0],e.clientY-d.from[1])<4)return;
  if(!d.moved&&Object.values(this.inputs).some(v=>v!==0)){this.inputs={};this.host.status('Regler auf 0: Punkte werden in der Konstruktionslage gesetzt.');}
  d.moved=true;const hit=this.local(e).intersectPlane(d.plane,new THREE.Vector3());if(!hit)return;
  const step=e.altKey?0:.5,q=(x:number)=>step?Math.round(x/step)*step:Math.round(x*1000)/1000,at:V=[q(hit.x),q(hit.y),q(hit.z)];
  const g=structuredClone(d.start),p=g.links.find(l=>l.id===d.link)!.points.find(x=>x.id===d.point)!;if(d.which==='to')p.to=at;else p.at=at;this.preview=g;this.host.leave();}
 /** Dropped next to a point or a tube of another link: it joins that link there. */
 private dragEnd(e:PointerEvent){const d=this.drag;this.drag=undefined;const g=this.preview;this.preview=undefined;if(!d?.moved||!g){this.host.leave();return;}
  const p=g.links.find(l=>l.id===d.link)!.points.find(x=>x.id===d.point)!,target=d.which==='at'?this.snapTarget(g,d.link,p,e):undefined;
  this.host.change(()=>{const x=this.linkage()!,q=x.links.find(l=>l.id===d.link)?.points.find(y=>y.id===d.point);if(!q)return;if(d.which==='to')q.to=p.to;else q.at=target?.at??p.at;if(target)q.body=target.body;},
   target?`${this.labelOf(g,d.link)}: Punkt ${d.point} hängt jetzt an ${this.host.name(target.body)}.`:`${this.labelOf(g,d.link)}: Punkt ${d.point} verschoben.`);}
 private snapTarget(g:Linkage,own:string,p:Point,e:PointerEvent):{body:string;at:V}|undefined{
  const camera=this.host.ray(e).camera,box=this.host.canvas().getBoundingClientRect(),world=this.host.root().matrixWorld,screen=(x:V)=>{const v=v3(x).applyMatrix4(world).project(camera);return [(v.x+1)/2*box.width+box.left,(1-v.y)/2*box.height+box.top];};
  let best:{body:string;at:V;d:number}|undefined;const tubes:[string,V][][]=[];const consider=(body:string,at:V)=>{const [sx,sy]=screen(at),d=Math.hypot(sx-e.clientX,sy-e.clientY);if(d<14&&(!best||d<best.d))best={body,at,d};};
  for(const l of g.links){if(l.id===own||!isBody(l))continue;const key=linkBody(l.id),nodes=[...l.points.flatMap(q=>q.to?[q.at,q.to]:[q.at]),...pointsOn(g,l.id).filter(x=>x.link.id!==own).map(x=>x.point.at)];
   for(const n of nodes)consider(key,n);
   tubes.push(nodes.map(n=>[key,n] as [string,V]));}
  // Points first; only beside them a place along the tubes, the nearest on the screen in steps of 1 mm.
  if(!best)for(const list of tubes){const key=list[0]?.[0],nodes=list.map(x=>x[1]);if(!key)continue;
   for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){const len=Math.hypot(...sub(nodes[j],nodes[i]));for(let s=1;s<len;s+=1)consider(key,lerp(nodes[i],nodes[j],s/len).map(v=>Math.round(v*2)/2) as V);}}
  if(best&&p.body===best.body&&Math.hypot(...sub(best.at,p.at))<.01)return undefined;return best;}
 key(e:KeyboardEvent){if(e.key!=='Delete'||!this.sel)return false;this.remove(this.sel);return true;}
 private labelOf(g:Linkage,id:string){return g.links.find(l=>l.id===id)?.label??id;}
 private remove(id:string){const name=this.labelOf(this.linkage()!,id);this.sel=undefined;this.pointSel=undefined;
  this.host.change(()=>{const g=this.linkage()!;g.links=g.links.filter(l=>l.id!==id);for(const l of g.links)for(const p of l.points)if(p.body===linkBody(id))p.body='';if(!g.links.length)delete this.host.build()!.linkage;},`${name} gelöscht; was an ihm hing, hängt jetzt an der Welt.`);}

 // ---------- library ----------
 /** The bought parts and the links to start from. A card dropped in the view puts it where the pointer meets the floor. */
 renderStore(root:HTMLElement){const list=el('div',{className:'part-store'});
  const card=(title:string,text:string,data:string,make:(at:V)=>Link[],hint:string)=>{const c=el('div',{className:'part-card',title:hint},el('strong',{textContent:title}),el('small',{textContent:text}));c.dataset.linkageNew=data;
   c.onpointerdown=e=>{e.preventDefault();const up=(ev:PointerEvent)=>{window.removeEventListener('pointerup',up);const box=this.host.canvas().getBoundingClientRect(),inside=ev.clientX>=box.left&&ev.clientX<=box.right&&ev.clientY>=box.top&&ev.clientY<=box.bottom;this.add(make,title,inside?ev:undefined);};window.addEventListener('pointerup',up);};list.append(c);};
  card('Pushrod-Ecke 1:10','Baustein: Doppelquerlenker, Pushrod, Umlenkhebel, Dämpfer, Spurstange','ecke',at=>{const id=this.fresh('ecke');return shift(pushrodCorner(`${id}-`),[at[0],0,0]);},'Eine vordere linke Ecke eines Formelautos 1:10. Alle Punkte lassen sich verschieben.');
  card('Querlenker','Gedruckt · Drehachse innen, Kugelgelenk außen','querlenker',at=>[{id:this.fresh('querlenker'),label:'Querlenker',kind:'lenker',d:6,points:[{id:'innen',kind:'dreh',at:add(at,[-20,0,0]),to:add(at,[20,0,0]),body:''},{id:'aussen',kind:'kugel',at:add(at,[0,45,2]),body:'',part:'kugel-5.8'}]}],'Das äußere Ende auf einen Radträger ziehen: Es verbindet sich dort.');
  card('Umlenkhebel','Gedruckt · dreht an einer Achse','hebel',at=>[{id:this.fresh('hebel'),label:'Umlenkhebel',kind:'lenker',d:5,points:[{id:'achse',kind:'dreh',at:add(at,[-6,0,0]),to:add(at,[6,0,0]),body:''}]}],'Pushrod und Dämpfer mit einem Ende auf den Hebel ziehen.');
  card('Radträger mit Rad','Gedruckt · Rad 1:10 Ø 56','traeger',at=>[{id:this.fresh('traeger'),label:'Radträger',kind:'lenker',d:7,points:[],wheel:{at:add(at,[0,6,0]),to:add(at,[0,19,0]),part:'rad-56'}}],'Querlenker und Spurstange mit dem äußeren Ende auf den Träger ziehen.');
  card('Stab mit Kugelpfannen','Spannschloss M3 · Pushrod, Spurstange','stab',at=>[{id:this.fresh('stab'),label:'Stab',kind:'stab',points:[{id:'a',kind:'kugel',at,body:''},{id:'b',kind:'kugel',at:add(at,[0,40,0]),body:''}]}],'Beide Enden auf Lenker ziehen. Die Länge stellt man am Spannschloss ein.');
  for(const d of dampers)card(d.label,`${d.length-d.stroke}–${d.length} mm Auge zu Auge · ${d.stroke} mm Hub`,d.id,at=>[{id:this.fresh('daempfer'),label:'Federbein',kind:'feder',part:d.id,points:[{id:'a',kind:'kugel',at,body:''},{id:'b',kind:'kugel',at:add(at,[0,d.length-d.stroke/2,0]),body:''}]}],d.note);
  root.append(list);
  // Ball joints and wheels are chosen at the joint or the carrier; listed here with their measures.
  const info=el('div',{className:'part-store'});for(const b of ballJoints){const c=el('div',{className:'part-card',title:b.note},el('strong',{textContent:b.label}),el('small',{textContent:'Am Kugelgelenk eines Punkts wählen'}));c.dataset.linkagePart=b.id;
   c.onclick=()=>{const g=this.linkage(),l=g?.links.find(x=>x.id===this.sel),p=l?.points.find(x=>x.id===this.pointSel);if(!p||p.kind!=='kugel'){this.host.status('Erst einen Kugelgelenk-Punkt wählen, dann den Kugelkopf.');return;}this.host.change(()=>{const q=this.linkage()!.links.find(x=>x.id===l!.id)!.points.find(x=>x.id===p.id)!;q.part=b.id;},`${l!.label}, ${p.id}: ${b.label}.`);};info.append(c);}
  for(const w of wheelParts)info.append(el('div',{className:'part-card',title:w.note},el('strong',{textContent:w.label}),el('small',{textContent:'Am Radträger wählen'})));
  root.append(el('p',{className:'muted',textContent:'Kugelköpfe und Räder:'}),info);}
 private fresh(base:string){const ids=new Set(this.linkage()?.links.map(l=>l.id)??[]);let k=1;while([...ids].some(x=>x===`${base}-${k}`||x.startsWith(`${base}-${k}-`)))k++;return `${base}-${k}`;}
 private add(make:(at:V)=>Link[],title:string,e?:{clientX:number;clientY:number}){
  let at:V|undefined;if(e){const hit=this.local(e).intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1),0),new THREE.Vector3());if(hit)at=[Math.round(hit.x),Math.round(hit.y),30];}
  if(!at){const g=this.linkage(),xs=g?.links.flatMap(l=>l.points.map(p=>p.at[0]))??[];at=[xs.length?Math.max(...xs)+60:0,0,30];}
  const links=make(at);this.host.change(()=>{const b=this.host.ensure(),g=b.linkage??=newLinkage();g.links.push(...links);},`${title} gesetzt.`);
  this.host.pick();this.select(links.find(l=>l.kind==='lenker'&&l.input)?.id??links[0].id);this.host.leave();}

 // ---------- sliders and readings ----------
 renderAxes(root:HTMLElement){const g=this.linkage();this.readout=undefined;if(!g?.links.length)return false;const driven=g.links.filter(l=>l.input);
  root.append(el('h3',{textContent:'Gestänge bewegen'}));
  for(const l of driven){const i=l.input!,value=Math.min(i.max,Math.max(i.min,this.inputs[l.id]??0)),slider=el('input',{type:'range',min:String(i.min),max:String(i.max),step:'0.1',value:String(value)}),out=el('output',{textContent:`${de(value)}°`});
   slider.dataset.linkageInput=l.id;slider.setAttribute('aria-label',`${l.label} bewegen`);slider.oninput=()=>{this.inputs[l.id]=Number(slider.value);out.textContent=`${de(Number(slider.value))}°`;};root.append(el('label',{className:'axis-row'},el('span',{textContent:l.label}),slider,out));}
  // Without an input of its own the linkage may hang on something that moves (a nut, a part on a joint).
  const outside=[...new Set(g.links.flatMap(l=>l.points.map(p=>p.body)).filter(k=>k&&!linkOfBody(k)))];
  if(!driven.length)root.append(el('p',{className:'muted',textContent:outside.length?`Bewegt vom Aufbau: ${outside.map(k=>this.host.name(k)).join(', ')}. Deren Regler stellt das Gestänge.`:'Noch kein Eingang: an einer Drehachse „Eingang (Regler)“ ankreuzen, zum Beispiel am unteren Querlenker.'}));
  const now=el('p',{id:'linkage-reading',className:'muted'});this.readout=now;root.append(now);
  const range=this.rangeText(g);if(range)root.append(el('p',{id:'linkage-range',className:'muted',textContent:range}));
  const zero=el('button',{textContent:'Auf Konstruktionslage'});zero.dataset.linkageZero='true';zero.onclick=()=>{this.inputs={};this.host.leave();};if(driven.length)root.append(zero);
  return true;}
 /** Over the whole range of the first input: what the wheel and the damper do, and the motion ratio. */
 private rangeText(g:Linkage){const l=g.links.find(x=>x.input);if(!l||linkageIssues(g).length)return '';const key=JSON.stringify(g.links);if(this.range?.key===key)return this.range.text;
  let text='';try{const rows=sweep(g,{now:{},rest:{}},21),bad=rows.filter(r=>r.error>1e-3).length,lift=rows.map(r=>r.reading.lift??0),camber=rows.map(r=>r.reading.camber??0),toe=rows.map(r=>r.reading.toe??0),mr=motionRatio(rows),span=(xs:number[],d=1)=>`${signed(Math.min(...xs),d)} … ${signed(Math.max(...xs),d)}`;
   const parts=[`Über ${de(l.input!.min,0)}° … ${de(l.input!.max,0)}°: Radhub ${span(lift)} mm`];if(rows[0].reading.camber!==undefined)parts.push(`Sturz ${span(camber,2)}°`,`Spur ${span(toe,2)}°`);
   for(let k=0;k<rows[0].reading.dampers.length;k++){const d=rows.map(r=>r.reading.dampers[k]);parts.push(`${d[0].label} ${de(Math.min(...d.map(x=>x.length)))}–${de(Math.max(...d.map(x=>x.length)))} mm${d.every(x=>x.fits)?'':' ⚠ verlässt den Hub'}`);}
   if(mr!==undefined)parts.push(`Motion Ratio ${de(Math.abs(mr),2)}`);if(bad)parts.push(`⚠ ${bad} Stellungen schließen nicht`);text=parts.join(' · ');}catch(e){text=String(e);}
  this.range={key,text};return text;}

 // ---------- pages ----------
 renderProperties(root:HTMLElement){const b=this.host.build(),g=b?.linkage;if(!g)return;
  const issues=linkageIssues(g,new Set(this.host.bodies().map(x=>x[0])));
  const l=g.links.find(x=>x.id===this.sel);if(!l||this.overview){this.overviewPage(root,g,issues);return;}
  const edit=(message:string,fn:(x:Link)=>void)=>this.host.change(()=>{const y=this.linkage()?.links.find(z=>z.id===l.id);if(y)fn(y);},message);
  const number=(text:string,value:number,write:(n:number)=>void,step='0.5')=>{const input=el('input',{type:'number',step,value:String(Math.round(value*1000)/1000)});input.dataset.field=text;input.setAttribute('aria-label',text);input.onchange=()=>{const n=Number(input.value);if(Number.isFinite(n))write(n);};return el('label',{},text,input);};
  const select=(text:string,value:string,options:[string,string][],write:(v:string)=>void)=>{const s=el('select');s.dataset.field=text;for(const [v,t] of options)s.add(new Option(t,v));s.value=value;s.onchange=()=>write(s.value);return el('label',{},text,s);};
  const xyz=(text:string,p:V,write:(k:number,v:number)=>void)=>{const row=el('div',{className:'xyz'});row.dataset.xyz=text;['X','Y','Z'].forEach((a,k)=>row.append(number(`${text} ${a}`,p[k],v=>write(k,v))));return el('div',{},el('small',{className:'muted',textContent:text}),row);};
  const name=el('input',{type:'text',value:l.label});name.dataset.field='Name';name.onchange=()=>{const v=name.value.trim();if(v)edit('Umbenannt',x=>{x.label=v.slice(0,60);});};
  root.append(el('h3',{textContent:`${icon[l.kind]} ${l.label}`}),el('label',{},'Name',name),el('p',{className:'muted',textContent:kindText[l.kind]}));
  if(l.kind==='lenker')root.append(number('Rohr-Ø [mm]',l.d??6,v=>edit('Rohr-Ø geändert',x=>{x.d=Math.min(30,Math.max(2,v));})));
  if(l.kind==='feder'){const d=damperOf(l.part),len=l.points.length===2?Math.hypot(...sub(l.points[1].at,l.points[0].at)):0;root.append(select('Dämpfer',d.id,dampers.map(x=>[x.id,x.label]),v=>edit('Dämpfer gewählt',x=>{x.part=v;})),el('p',{className:'muted',textContent:`In der Konstruktionslage ${de(len)} mm Auge zu Auge; der Dämpfer kann ${d.length-d.stroke}–${d.length} mm.`}));}
  if(l.kind==='stab'&&l.points.length===2)root.append(el('p',{className:'muted',textContent:`Kugelmitte zu Kugelmitte ${de(Math.hypot(...sub(l.points[1].at,l.points[0].at)))} mm: so lang das Spannschloss einstellen.`}));
  if(l.wheel){const w=l.wheel;root.append(heading('Rad'),select('Rad',w.part,wheelParts.map(x=>[x.id,x.label]),v=>edit('Rad gewählt',x=>{x.wheel!.part=v;})),xyz('Nabe (Anlage am Träger)',w.at,(k,v)=>edit('Nabe verschoben',x=>{x.wheel!.at[k]=v;})),xyz('Radmitte',w.to,(k,v)=>edit('Radmitte verschoben',x=>{x.wheel!.to[k]=v;})));}
  else if(l.kind==='lenker'){const add=el('button',{textContent:'＋ Rad an diesen Lenker'});add.dataset.linkageWheel='true';add.onclick=()=>{const ps=[...l.points.map(p=>p.at),...pointsOn(g,l.id).map(x=>x.point.at)],c=ps.length?ps.reduce((s,p)=>[s[0]+p[0]/ps.length,s[1]+p[1]/ps.length,s[2]+p[2]/ps.length] as V,[0,0,0] as V):[0,0,30] as V;edit('Rad angesetzt',x=>{x.wheel={at:add3(c,[0,8,0]),to:add3(c,[0,21,0]),part:wheelParts[0].id};});};root.append(add);}
  // The points: where, what joint, joined to what.
  root.append(heading('Gelenkpunkte'));
  const targets:[string,string][]=[['','der Welt (Chassis)'],...g.links.filter(x=>x.id!==l.id&&isBody(x)).map(x=>[linkBody(x.id),x.label] as [string,string]),...this.host.bodies()];
  for(const p of l.points){const box=el('div',{className:'link-point'});box.dataset.linkagePoint=p.id;if(p.id===this.pointSel)box.setAttribute('aria-current','true');
   const pt=(message:string,fn:(q:Point)=>void)=>edit(message,x=>{const q=x.points.find(y=>y.id===p.id);if(q)fn(q);});
   box.append(el('strong',{textContent:`Punkt ${p.id}`}),select(`${p.id}: verbunden mit`,p.body,targets.some(t=>t[0]===p.body)?targets:[...targets,[p.body,this.host.name(p.body)]],v=>pt(`${p.id} verbunden mit ${targets.find(t=>t[0]===v)?.[1]??v}`,q=>{q.body=v;})));
   if(l.kind==='lenker')box.append(select(`${p.id}: Gelenk`,p.kind,[['kugel','Kugelgelenk'],['dreh','Drehachse (zwei Lagerpunkte)']],v=>edit(v==='dreh'?'Drehachse':'Kugelgelenk',x=>{const q=x.points.find(y=>y.id===p.id);if(!q)return;q.kind=v as Point['kind'];if(v==='dreh'&&!q.to)q.to=add3(q.at,[12,0,0]);if(v==='kugel'){delete q.to;if(x.input?.point===q.id)delete x.input;}})));
   box.append(xyz(p.kind==='dreh'?`${p.id}: Lager 1`:`${p.id}: Lage`,p.at,(k,v)=>pt(`${p.id} verschoben`,q=>{q.at[k]=v;})));
   if(p.kind==='dreh'&&p.to){box.append(xyz(`${p.id}: Lager 2`,p.to,(k,v)=>pt(`${p.id} verschoben`,q=>{q.to![k]=v;})));
    const on=el('input',{type:'checkbox',checked:l.input?.point===p.id});on.dataset.field=`${p.id}: Eingang`;on.onchange=()=>edit(on.checked?'Eingang: ein Regler dreht den Lenker':'Kein Eingang mehr',x=>{if(on.checked)x.input={point:p.id,min:-10,max:10};else delete x.input;});
    box.append(el('label',{className:'check'},on,'Eingang (Regler dreht hier)'));if(l.input?.point===p.id)box.append(number(`${p.id}: von [°]`,l.input.min,v=>edit('Bereich',x=>{x.input!.min=Math.min(v,x.input!.max);})),number(`${p.id}: bis [°]`,l.input.max,v=>edit('Bereich',x=>{x.input!.max=Math.max(v,x.input!.min);})));}
   if(p.kind==='kugel')box.append(select(`${p.id}: Kugelkopf`,ballOf(p.part).id,ballJoints.map(x=>[x.id,x.label]),v=>pt('Kugelkopf gewählt',q=>{q.part=v;})));
   if(l.kind==='lenker'){const del=el('button',{textContent:'Punkt entfernen',className:'ghost'});del.dataset.linkagePointRemove=p.id;del.onclick=()=>edit(`Punkt ${p.id} entfernt`,x=>{x.points=x.points.filter(y=>y.id!==p.id);if(x.input?.point===p.id)delete x.input;});box.append(del);}
   root.append(box);}
  const on=pointsOn(g,l.id);if(on.length)root.append(el('p',{className:'muted',textContent:`Außerdem hängen an ihm: ${on.map(x=>`${x.link.label} (${x.point.id})`).join(', ')}.`}));
  if(l.kind==='lenker'){const more=el('button',{textContent:'＋ Gelenkpunkt'});more.dataset.linkagePointAdd='true';more.onclick=()=>{let k=1;while(l.points.some(p=>p.id===`p${k}`))k++;const ps=[...l.points.map(p=>p.at),...on.map(x=>x.point.at)],c=ps.length?ps[0]:[0,0,30] as V;edit('Gelenkpunkt angelegt',x=>{x.points.push({id:`p${k}`,kind:'kugel',at:add3(c,[0,0,10]),body:'',part:ballJoints[0].id});});};root.append(more);}
  const mine=issues.filter(x=>x.links.includes(l.id));root.append(heading('Prüfung'),...(mine.length?mine.map(x=>el('p',{className:'state-fail',textContent:x.message})):[el('p',{className:'state-pass',textContent:'✓ In Ordnung.'})]));
  const del=el('button',{textContent:'Löschen',className:'danger'});del.dataset.linkageRemove='true';del.onclick=()=>this.remove(l.id);root.append(del);}
 /** The whole linkage: is it determined, what it does over its range, what to buy; in ③ the printed parts. */
 private overviewPage(root:HTMLElement,g:Linkage,issues:{links:string[];message:string}[]){
  root.append(el('h3',{textContent:'⟋ Gestänge'}),el('p',{className:'muted',textContent:(()=>{const n=(k:LinkKind)=>g.links.filter(l=>l.kind===k).length,c=(k:LinkKind,one:string,more:string)=>`${n(k)} ${n(k)===1?one:more}`;return `${c('lenker','gedruckter Lenker','gedruckte Lenker')}, ${c('stab','Stab','Stäbe')}, ${c('feder','Federbein','Federbeine')}.`;})()}));
  root.append(heading('Prüfung'),...(issues.length?issues.map(x=>el('p',{className:'state-fail',textContent:x.message})):[el('p',{className:'state-pass',id:'linkage-ok',textContent:'✓ Bestimmt: Jede Stellung des Reglers legt alles fest.'})]));
  const range=this.rangeText(g);if(range)root.append(heading('Über den Federweg'),el('p',{className:'muted',textContent:range}));
  if((this.host.phase?.()??1)===3)this.makingPage(root,g);
  root.append(heading('Stückliste'),...linkageShopping(g).map(x=>el('p',{className:'muted',textContent:`${x.count} × ${x.label}`})));}
 /** ③: every printed link as STL, the brackets on the chassis, and where they stand. */
 private makingPage(root:HTMLElement,g:Linkage){root.append(heading('Druckteile'));
  for(const l of g.links.filter(x=>x.kind==='lenker')){const b=el('button',{textContent:`⬇ ${l.label} als STL`});b.dataset.linkageStl=l.id;b.onclick=()=>{try{this.host.exportSolid(linkSolids(g,l.id),l.label);}catch(e){this.host.status(String(e));}};root.append(b);}
  const m=mountSolids(g);if(m.solids.length){const show=el('input',{type:'checkbox',checked:this.showMounts});show.dataset.linkageMountsShow='true';show.onchange=()=>{this.showMounts=show.checked;this.host.leave();};
   const b=el('button',{textContent:'⬇ Halter am Chassis als STL',className:'primary'});b.dataset.linkageMounts='true';b.onclick=()=>this.host.exportSolid(m,'gestaenge-halter');
   const floor=el('input',{type:'number',step:'0.5',value:String(Math.round(m.floor*10)/10)});floor.dataset.field='Halter stehen auf z';floor.onchange=()=>{const v=Number(floor.value);if(Number.isFinite(v))this.host.change(()=>{this.linkage()!.floor=v;},`Halter stehen auf z = ${de(v)} mm.`);};
   root.append(el('label',{className:'check'},show,'Halter in der Ansicht zeigen'),el('label',{},'Halter stehen auf z [mm]',floor),b);}
  root.append(el('p',{className:'muted',textContent:'Kugelbolzen M3 werden in Kernlöcher Ø 2,5 mm geschraubt, Drehachsen laufen auf Schrauben M3 durch Ø 3,2 mm.'}));}
 /** Rows for the scene tree and the folder of connections. */
 rows(){const g=this.linkage();return (g?.links??[]).map(l=>({id:l.id,text:`${icon[l.kind]} ${l.label}${l.input?' · Eingang':''}`}));}
 connections(){const g=this.linkage();if(!g)return [];const out:{id:string;text:string}[]=[];
  for(const l of g.links)for(const p of l.points){const other=p.body?this.host.name(p.body):'der Welt';out.push({id:l.id,text:p.kind==='dreh'?`${l.label} dreht an ${other}${l.input?.point===p.id?' · Eingang':''}`:`${l.label} (${p.id}): Kugelgelenk an ${other}`});}
  return out;}
 /** The steps: a linkage that is determined, then its parts printed. */
 todo(){const g=this.linkage();if(!g?.links.length)return [];const bad=linkageIssues(g,new Set(this.host.bodies().map(x=>x[0])));return [{label:'Gestänge bestimmt',done:!bad.length,hint:bad[0]?.message??'Jede Stellung legt alles fest.',phase:1,open:()=>{this.select(bad[0]?.links[0]);if(!bad[0]?.links[0])this.overview=true;}}];}
 openOverview(){this.sel=undefined;this.pointSel=undefined;this.overview=true;}
 /** Test entry: where a point of a link stands now. */
 pointAt(link:string,point:string){const g=this.shown(),p=g?.links.find(l=>l.id===link)?.points.find(q=>q.id===point);return p&&this.pose?this.pose.at(p.body,p.at):undefined;}
 reading(){const g=this.shown();return g&&this.pose?read(g,this.pose):undefined;}
 setInput(link:string,value:number){this.inputs[link]=value;}
}
const add3=(a:V,b:V):V=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const add=add3;
function shift(links:Link[],by:V):Link[]{const m=(p:V)=>add3(p,by);return links.map(l=>({...l,points:l.points.map(p=>({...p,at:m(p.at),...(p.to?{to:m(p.to)}:{})})),...(l.wheel?{wheel:{...l.wheel,at:m(l.wheel.at),to:m(l.wheel.to)}}:{})}));}
export {linkOfBody,isDistance};
