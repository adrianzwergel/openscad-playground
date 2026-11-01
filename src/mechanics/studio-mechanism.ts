// Mechanism editor of the Studio: kinematics-1 documents with parameters,
// bodies, joints (including paths with draggable points), patterns, terminals
// and range. Edits go through the Studio's change() for validation and undo;
// the preview pose is solved in the kinematics worker after every change.
import * as THREE from 'three';
import type {StudioDocument} from './studio-model';
import type {Mechanism,JointRelation,Joint,Body,Pattern} from './kinematics/model';
import {jointDofs} from './kinematics/model';
import type {Frame,V} from './kinematics/math';
import {compose,inverse,identity,rotate,add} from './kinematics/math';
import {templates} from './kinematics/templates';
import {partMesh} from './kinematics/generate/part';
import {stl} from './kinematics/generate/mesh';
import type {Element,Contact} from './kinematics/model';
import {importModel,storeAsset,loadAsset,rememberAsset} from './model-import';
import type {Asset} from './model-import';
import {fitCylinder,fitEdge,fitTwoPoints} from './kinematics/axis-fit';
import type {AxisFit} from './kinematics/axis-fit';
import {solve} from './kinematics/solver';
import {demos} from './demos';
import {planBearings,bearingCatalog} from './kinematics/bearings';
import type {BearingPlan,BearingSettings} from './kinematics/bearings';
import JSZip from 'jszip';
import type {Drive,TaskInfo,Collision} from './kinematics/drive';
import {driveCatalog,driveSpec,placeMotor,removeGear,removeDrive,heldTrains,modelAxes,owned,driveTask,adoptGear,sweepCollisions,faceNormal,standOn,parallelTo,linearAxis,toward} from './kinematics/drive';
import {quaternionFromBasis,cross as crossV,unit} from './kinematics/math';
import {KinematicsView,linkColor} from './kinematics-view';
import type {MotionSolution} from './kinematics-view';

type Item='mechanism'|'model'|'axis-new'|'drive-new'|'bearings'|'structure'|`drive:${string}`|'parameters'|'io'|`body:${string}`|`joint:${string}`|`pattern:${number}`|`element:${string}`|`contact:${string}`;
export type EditorHost={doc:()=>StudioDocument;change:(edit:()=>void,message:string)=>void;status:(text:string)=>void;leave:()=>void;fit:()=>void};
const el=<K extends keyof HTMLElementTagNameMap>(tag:K,props:Record<string,unknown>={},...children:(Node|string)[]):HTMLElementTagNameMap[K]=>{const e=document.createElement(tag);Object.assign(e,props);e.append(...children);return e;};
const heading=(text:string)=>el('h2',{textContent:text});
const deg=180/Math.PI;

export class MechanismEditor{
 readonly view=new KinematicsView();
 readonly handles=new THREE.Group();
 activeId?:string;private item:Item='mechanism';private fitNext=false;
 // Generated parts depend only on elements, contacts and parameters; joint edits reuse them.
 private partCache?:{key:string;parts:Record<string,Float32Array>};private partsPending=false;
 private assets=new Map<string,Asset>();
 /** Live axis values (joint id → first coordinate) set by the sliders. */
 private axisValues:Record<string,number>={};
 /** Assignment brush: clicked parts go to this link. */
 private brush='';
 /** Axis picking: the tool and the joint draft it fills. */
 private tool?:{mode:'cylinder'|'edge'|'points'|'motor';first?:[number,number,number];joint?:string;drive?:string};
 /** Gear search of one drive and its found trains (in carrier coordinates); collision sweeps per drive. */
 private search?:{drive:string;worker:Worker;info:TaskInfo;results:{mechanism:Mechanism;ratio:number;summary:{elements:number;length:number};label:string}[];state:'running'|'done'|'error';text:string};
 private sweeps:Record<string,{state:'running'|'ok'|'hit'|'error';text:string;hits?:Collision[]}>={};
 private newDrive={axis:'',spec:'nema17'};
 /** Step 6/7: the bearing plan (cached per document state) and generated structures per link. */
 private planCache?:{key:string;plan:BearingPlan};
 private structures=new Map<string,{positions?:Float32Array;stl?:Uint8Array;report?:Record<string,number|boolean>;checks:{id:string;state:string;message:string}[];error?:string}>();
 private structureJob?:{worker:Worker;state:'running'|'done'|'error';text:string;key:string};
 private draft={a:'ground',b:'',kind:'revolute' as 'revolute'|'prismatic'};
 private lastFit?:AxisFit;private selectedPart='';private worker?:Worker;private preview?:MotionSolution;private previewError='';
 constructor(private host:EditorHost){}
 get active(){return !!this.activeId&&!!this.entry();}
 private entry(){return this.host.doc().mechanisms?.find(m=>m.id===this.activeId);}
 private drives(){return this.entry()?.drives??[];}
 mechanism(){return this.entry()?.mechanism;}
 private assetsTried=new Set<string>();
 enter(id:string){if(this.activeId!==id){this.axisValues={};this.tool=undefined;this.brush='';}this.activeId=id;this.item=this.mechanism()?.bodies.some(b=>b.display?.kind==='mesh')?'model':'mechanism';this.fitNext=true;this.refresh();}
 exit(){this.search?.worker.terminate();this.search=undefined;this.sweeps={};this.structureJob?.worker.terminate();this.structureJob=undefined;this.structures.clear();this.planCache=undefined;this.view.clearOverlay();this.view.hideModel=false;this.activeId=undefined;this.axisValues={};this.tool=undefined;this.brush='';this.worker?.terminate();this.worker=undefined;this.view.clear();this.clearHandles();this.preview=undefined;}
 /** For a run over the range: the input's own trains turn with it, everything else is held. */
 motionSource(){const e=this.entry();if(!e)return undefined;const m=e.mechanism,input=m.input.kind==='coordinate'?m.input.joint:undefined;return {label:e.label,mechanism:m,fixed:this.held(m,this.values(m),input)};}

 // ---------- preview ----------
 refresh(){
  if(!this.active){if(this.activeId)this.exit();return;}
  // Imported models come from the browser database; each is tried once, then shown without it.
  const m=this.mechanism()!,missing=[...new Set(m.bodies.flatMap(b=>b.display?.kind==='mesh'?[b.display.asset]:[]))].filter(id=>!this.assets.has(id)&&!this.assetsTried.has(id));
  if(missing.length){missing.forEach(id=>this.assetsTried.add(id));void Promise.all(missing.map(id=>loadAsset(id).then(a=>{if(a)this.assets.set(id,a);}).catch(()=>{}))).then(()=>{const lost=missing.filter(id=>!this.assets.has(id));if(lost.length)this.host.status('3D-Modell fehlt im Browser-Speicher: '+lost.join(', '));this.refresh();this.renderProperties();});return;}
  this.view.assets=id=>this.assets.get(id);
  this.worker?.terminate();const w=new Worker('./mechanics-kinematics-worker.js');this.worker=w;
  const key=JSON.stringify([m.elements,m.contacts,m.parameters]),cached=this.partCache?.key===key?this.partCache.parts:undefined;
  w.onmessage=({data})=>{if(this.worker!==w)return;
   if(data.type==='parts'){w.terminate();this.worker=undefined;this.partsPending=false;this.partCache={key,parts:data.parts};this.view.setParts(data.parts);this.renderStatus();return;}
   if(data.type==='error'||cached){w.terminate();this.worker=undefined;}
   if(data.type==='error'){this.previewError=data.message;this.preview=undefined;this.view.clear();this.host.status('Vorschau nicht lösbar: '+data.message);}
   else{this.previewError='';this.preview=data.solution;this.view.show(data.solution);if(cached)this.view.setParts(cached);}
   this.drawHandles();this.renderStatus();if(this.fitNext&&this.preview){this.fitNext=false;this.host.fit();}};
  this.partsPending=!cached&&m.elements.some(e=>e.source.kind==='printed'&&e.surfaces.length);
  w.postMessage({mechanism:m,range:{from:this.inputValue(m),to:this.inputValue(m),samples:1},fixed:this.fixed(m),parts:cached?undefined:'printed'});
  this.drawHandles();
 }
 private renderStatus(){const p=document.getElementById('mechanism-preview');if(!p)return;
  if(this.previewError){p.textContent='Vorschau: '+this.previewError;p.dataset.state='error';return;}
  if(!this.preview){p.textContent='Vorschau wird gelöst …';p.dataset.state='loading';return;}
  // A pose that does not close means the geometry contradicts itself (e.g. a link too short for the edited guide).
  const open=this.preview.checks.filter(c=>c.state==='fail'&&(c.id==='closure'||c.id==='mobility'||c.id.startsWith('redundant/')));
  p.dataset.state=open.length?'open':'ok';p.textContent=(open.length?`Geht nicht auf · ${open.map(c=>c.message).join(' ')}`:`Vorschau gelöst · ${this.preview.mobility.message}`)+(this.partsPending?' · Teile werden erzeugt …':'');}
 private bodyFrame(id:string):Frame{return this.preview?.poses[0].bodies[id]??this.mechanism()?.bodies.find(b=>b.id===id)?.frame??identity();}
 private clearHandles(){for(const c of [...this.handles.children]){this.handles.remove(c);(c as THREE.Mesh).geometry.dispose();((c as THREE.Mesh).material as THREE.Material).dispose();}}
 private drawHandles(){
  this.clearHandles();const m=this.mechanism();if(!m)return;
  for(const j of m.joints){if(j.joint.kind!=='path')continue;const base=compose(this.bodyFrame(j.a.body),j.a.local),selected=this.item===`joint:${j.id}`;
   j.joint.curve.points.forEach((p,i)=>{const world=compose(base,{position:p,rotation:[0,0,0,1]}).position,size=Math.max(6,Math.min(30,j.joint.kind==='path'?j.joint.curve.cornerRadius/8:8));
    const h=new THREE.Mesh(new THREE.SphereGeometry(size,12,8),new THREE.MeshBasicMaterial({color:selected?0xffcc66:0xc98f2e}));h.position.fromArray(world);h.name=`path:${j.id}:${i}`;h.userData.pathPoint={joint:j.id,index:i};this.handles.add(h);});}
 }
 /** Pointer over something editable: a path handle or a model part. */
 hover(ray:THREE.Raycaster){return !!ray.intersectObjects(this.handles.children,false)[0]||!!this.view.pick(ray);}
 /** Click in the 3D view. Returns a handle to drag; part clicks are handled here. */
 click(ray:THREE.Raycaster):THREE.Object3D|undefined{
  const handle=ray.intersectObjects(this.handles.children,false)[0]?.object;if(handle&&!this.tool)return handle;
  const hit=this.view.pick(ray);if(!hit)return undefined;this.pickPart(hit.body,hit.asset,hit.part,hit.local);return undefined;}
 /** A picked model part: axis tool, assignment brush or selection. Also the entry point for tests. */
 pickPart(body:string,asset:string,part:string,local:[number,number,number]){
  const m=this.mechanism();if(!m)return;
  if(this.tool?.mode==='motor'){const positions=this.assets.get(asset)?.parts.find(p=>p.id===part)?.positions,id=this.tool.drive!;if(!positions)return;this.tool=undefined;
   const b=m.bodies.find(x=>x.id===body)!,normal=faceNormal(positions,local),world=standOn(this.drives().find(d=>d.id===id)!,local,normal),frame=compose(inverse(b.frame),world);
   this.editDrive(id,`Motor ${id} auf ${body} gesetzt`,(d,x)=>{d.body=body;d.frame=frame;removeGear(x,d);placeMotor(x,d);});this.renderProperties();return;}
  if(this.tool){const positions=this.assets.get(asset)?.parts.find(p=>p.id===part)?.positions;if(!positions)return;
   try{let fit:AxisFit|undefined;
    if(this.tool.mode==='cylinder')fit=fitCylinder(positions,local);
    else if(this.tool.mode==='edge')fit=fitEdge(positions,local);
    else if(!this.tool.first){this.tool.first=local;this.host.status('Erster Punkt gesetzt. Zweiten Punkt anklicken.');return;}
    else fit=fitTwoPoints(this.tool.first,local);
    if(fit.kind==='plane'){this.host.status('Ebene Fläche erkannt – für eine Drehachse den Zylindermantel (Bohrung, Welle, Gehäuse) anklicken.');return;}
    this.applyAxis(fit);}catch(e){this.host.status('Achse nicht erkannt: '+(e instanceof Error?e.message:e));}
   return;}
  const key=`${asset}/${part}`;
  if(this.brush){if(this.brush!==body)this.assignPart(asset,part,this.brush);return;}
  this.selectedPart=key;this.view.highlight=new Set([key]);this.item='model';this.refresh();this.renderProperties();}
 /** Picks a part by name at a point in model coordinates (entry for tests and scripts). */
 pickByName(name:string,local:[number,number,number]){const m=this.mechanism();if(!m)return false;
  for(const b of m.bodies)if(b.display?.kind==='mesh'){const asset=this.assets.get(b.display.asset),part=asset?.parts.find(p=>p.name===name||p.name.endsWith(name));if(part&&b.display.parts.includes(part.id)){this.pickPart(b.id,b.display.asset,part.id,local);return true;}}
  return false;}
 private assignPart(asset:string,part:string,target:string){
  this.host.change(()=>{const m=this.mechanism()!;for(const b of m.bodies)if(b.display?.kind==='mesh'&&b.display.asset===asset)b.display.parts=b.display.parts.filter(p=>p!==part);
   const t=m.bodies.find(b=>b.id===target)!;if(t.display?.kind!=='mesh'||t.display.asset!==asset){if(t.display?.kind==='mesh'){this.host.status('Ein Glied zeigt Teile genau eines Modells.');return;}t.display={kind:'mesh',asset,parts:[]};}t.display.parts.push(part);},`Teil → ${target}`);}
 /** Creates or updates the drafted joint from a detected axis: z along the axis, origin on it, in pose-0 coordinates. */
 private applyAxis(fit:AxisFit){
  const m=this.mechanism()!,z=unit(fit.direction),x=unit(crossV(Math.abs(z[0])<.9?[1,0,0]:[0,1,0],z)),y=crossV(z,x),frame:Frame={position:fit.point.map(n=>Math.round(n*1000)/1000) as V,rotation:quaternionFromBasis(x,y,z)};
  this.lastFit=fit;const target=this.tool?.joint;this.tool=undefined;
  const frameOf=(id:string)=>m.bodies.find(b=>b.id===id)?.frame??identity();
  if(target){this.host.change(()=>{const j=this.mechanism()!.joints.find(x=>x.id===target)!;j.a.local=compose(inverse(frameOf(j.a.body)),frame);j.b.local=compose(inverse(frameOf(j.b.body)),frame);},'Achse neu erkannt');this.item=`joint:${target}`;}
  else{const {a,b,kind}=this.draft;if(!b||a===b){this.host.status('Glied A und B wählen.');return;}const id=`achse${m.joints.filter(j=>!j.id.startsWith('halt-')).length+1}`;
   this.host.change(()=>{const mm=this.mechanism()!;mm.joints=mm.joints.filter(j=>j.id!==`halt-${b}`);mm.joints.push({id,joint:{kind},a:{body:a,local:compose(inverse(frameOf(a)),frame)},b:{body:b,local:compose(inverse(frameOf(b)),frame)},limits:kind==='revolute'?{min:-180,max:180}:{min:0,max:200}});
    if(mm.input.kind==='none'){mm.input={kind:'coordinate',joint:id,coordinate:0};mm.output={kind:'coordinate',joint:id,coordinate:0};mm.range={from:kind==='revolute'?-180:0,to:kind==='revolute'?180:200,samples:37};}},`${kind==='revolute'?'Drehachse':'Linearachse'} ${id} angelegt (${fit.kind==='cylinder'?`Zylinder r=${fit.radius?.toFixed(2)} mm`:'Kante'})`);
   this.item=`joint:${id}`;}
  this.renderProperties();}
 private inputValue(m:Mechanism){return m.input.kind==='coordinate'&&this.axisValues[m.input.joint]!==undefined?this.axisValues[m.input.joint]:m.range.from;}
 /** Axes with sliders: every movable joint that is not a placeholder. */
 private axes(m:Mechanism){
  const movable=m.joints.filter(j=>!j.id.startsWith('halt-')&&['revolute','prismatic','cylindrical','screw','path'].includes(j.joint.kind));
  // A model's axes are each driven; in other mechanisms only the input drives, the rest follows.
  return m.bodies.some(b=>b.display?.kind==='mesh')?modelAxes(m,this.drives()):movable.filter(j=>m.input.kind==='coordinate'&&m.input.joint===j.id);}
 /** Current value of every axis (the input from the range start or its slider). */
 private values(m:Mechanism,over:Record<string,number>={}){const out:Record<string,number>={};for(const j of this.axes(m))out[j.id]=m.input.kind==='coordinate'&&m.input.joint===j.id?this.inputValue(m):this.axisValues[j.id]??this.axisDefault(m,j);return {...out,...over};}
 /** Held coordinates: every axis but the input (swept by the range) and every adopted train; `free` leaves one axis and its trains to the solver. */
 private held(m:Mechanism,values:Record<string,number>,free?:string){const input=m.input.kind==='coordinate'?m.input.joint:undefined,out:Record<string,number[]>={};for(const j of this.axes(m))if(j.id!==input&&j.id!==free)out[j.id]=[values[j.id]];return {...out,...heldTrains(this.drives().filter(d=>d.axis!==free),values)};}
 /** The mechanism solved at given axis values (main thread). */
 private async poseAt(m:Mechanism,values:Record<string,number>){const v=m.input.kind==='coordinate'?values[m.input.joint]??m.range.from:m.range.from;return solve({...structuredClone(m),range:{from:v,to:v,samples:1}},{yield:false,fixed:this.held(m,values),iterations:80});}
 private axisDefault(m:Mechanism,j:JointRelation){const deg=j.joint.kind==='revolute'||j.joint.kind==='screw',lo=j.limits?.min??(deg?-180:-200),hi=j.limits?.max??(deg?180:200);return m.input.kind==='coordinate'&&m.input.joint===j.id?m.range.from:Math.max(lo,Math.min(hi,0));}
 /** Every axis is driven by its own slider, so every axis is held (the input through the range). */
 private fixed(m:Mechanism){return this.held(m,this.values(m));}
 /** Sliders: one per axis; moving one re-solves the pose in place. */
 renderAxes(root=document.getElementById('axes')){
  if(!root)return;root.replaceChildren();const m=this.mechanism();root.hidden=!m;if(!m)return;
  const axes=this.axes(m);
  if(!axes.length){root.append(el('p',{className:'muted',textContent:'Noch keine Achsen. Im Modell Glieder bilden und Achsen anklicken.'}));return;}
  root.append(el('h3',{textContent:'Achsen live'}));
  for(const j of axes){const unitLabel=j.joint.kind==='revolute'||j.joint.kind==='screw'?'°':'mm',lo=j.limits?.min??(unitLabel==='°'?-180:-200),hi=j.limits?.max??(unitLabel==='°'?180:200),value=this.axisValues[j.id]??this.axisDefault(m,j);
   const slider=el('input',{type:'range',min:String(lo),max:String(hi),step:String((hi-lo)/720),value:String(value)});slider.dataset.axis=j.id;slider.setAttribute('aria-label','Achse '+j.id);const out=el('output',{textContent:`${value.toFixed(1)} ${unitLabel}`});
   slider.oninput=()=>{const v=Number(slider.value);this.axisValues[j.id]=v;out.textContent=`${v.toFixed(1)} ${unitLabel}`;this.livePose();};
   root.append(el('label',{className:'axis-row'},el('span',{textContent:j.id}),slider,out));}
  const reset=el('button',{textContent:'Alle Achsen auf Null'});reset.onclick=()=>{this.axisValues={};this.renderAxes();this.livePose();};root.append(reset,el('p',{id:'axes-report',className:'muted'}),el('p',{id:'axes-motors',className:'muted'}));this.renderMotors(m);
 }
 /** Motor turns from the reference, for every drive with a train: shows the reduction while sliding. */
 private renderMotors(m:Mechanism){const p=document.getElementById('axes-motors');if(!p)return;const values=this.values(m),turns:Record<string,number>={};
  for(const d of this.drives())if(d.gear){const id=`${d.id}/ground/s0`,rate=d.gear.rates[id];if(rate!==undefined&&values[d.axis]!==undefined)turns[d.id]=Math.round(rate*(values[d.axis]-d.gear.reference)/360*100)/100;}
  p.dataset.motors=JSON.stringify(turns);p.textContent=Object.keys(turns).length?'Motoren: '+Object.entries(turns).map(([id,t])=>`${id} ${t>=0?'+':''}${t.toFixed(2)} U`).join(' · '):'';}
 private liveToken=0;
 private livePose(){const token=++this.liveToken;requestAnimationFrame(async()=>{if(token!==this.liveToken)return;const m=this.mechanism();if(!m)return;
  try{const s=await solve({...structuredClone(m),range:{from:this.inputValue(m),to:this.inputValue(m),samples:1}},{yield:false,fixed:this.fixed(m),iterations:60});if(token!==this.liveToken)return;
   this.view.setFrames(s.poses[0].bodies);this.renderMotors(m);const open=s.checks.find(c=>c.id==='closure'&&c.state==='fail'),r=document.getElementById('axes-report');if(r){r.textContent=open?'Geht in dieser Stellung nicht auf: '+open.message:'Stellung gelöst.';r.dataset.state=open?'open':'ok';r.dataset.frames=JSON.stringify(Object.fromEntries(Object.entries(s.poses[0].bodies).map(([k,f])=>[k,f.position.map(n=>Math.round(n*100)/100)])));}}
  catch(e){const r=document.getElementById('axes-report');if(r)r.textContent='Nicht lösbar: '+(e instanceof Error?e.message:e);}});}
 selectHandle(o:THREE.Object3D){const point=o.userData.pathPoint;if(point){this.item=`joint:${point.joint}`;this.renderProperties();this.drawHandles();}}
 /** Writes a dragged path point back into the document (in the guide's a-side frame). */
 onDrag(o:THREE.Object3D){const point=o.userData.pathPoint,m=this.mechanism();if(!point||!m)return;const j=m.joints.find(x=>x.id===point.joint);if(!j||j.joint.kind!=='path')return;
  const local=compose(inverse(compose(this.bodyFrame(j.a.body),j.a.local)),{position:o.position.toArray() as V,rotation:[0,0,0,1]});j.joint.curve.points[point.index]=local.position.map(n=>Math.round(n*100)/100) as V;}

 private axisTools(joint?:string){
  const tool=(mode:'cylinder'|'edge'|'points',label:string,hint:string)=>{const b=el('button',{textContent:label,title:hint});b.dataset.axisTool=mode;b.setAttribute('aria-pressed',String(this.tool?.mode===mode));b.onclick=()=>{this.tool=this.tool?.mode===mode?undefined:{mode,joint};this.host.status(this.tool?hint:'Werkzeug beendet.');this.renderProperties();};return b;};
  const out:HTMLElement[]=[el('div',{className:'button-row'},tool('cylinder','Zylinder anklicken','Zylindermantel anklicken (Bohrung, Welle, Gelenkgehäuse): Drehachse = Zylinderachse.'),tool('edge','Kante anklicken','Nahe an eine gerade Kante klicken: Achse entlang der Kante.'),tool('points','Zwei Punkte','Zwei Punkte am Modell anklicken: Achse von Punkt 1 nach Punkt 2.'))];
  if(this.lastFit)out.push(el('p',{className:'muted',textContent:`Zuletzt erkannt: ${this.lastFit.kind==='cylinder'?`Zylinder, Radius ${this.lastFit.radius?.toFixed(2)} mm`:'Kante/Punkte'} · Punkt (${this.lastFit.point.map(n=>n.toFixed(1)).join(', ')}) · Richtung (${this.lastFit.direction.map(n=>n.toFixed(3)).join(', ')})`}));
  return out;
 }
 // ---------- explorer ----------
 renderTree(root:HTMLElement){
  root.append(el('div',{className:'tree-group',textContent:'Mechanismen'}));
  for(const m of this.host.doc().mechanisms??[]){
   const open=el('button',{textContent:`⚙ ${m.label}`});open.dataset.mechanism=m.id;open.setAttribute('aria-selected',String(this.activeId===m.id&&this.item==='mechanism'));open.onclick=()=>{this.enter(m.id);this.host.leave();};
   root.append(el('div',{className:'tree-row'},open));
   if(this.activeId!==m.id)continue;
   const model=m.mechanism.bodies.some(b=>b.display?.kind==='mesh');
   const sub=(label:string,item:Item)=>{const b=el('button',{textContent:label,className:'tree-sub'});b.setAttribute('aria-selected',String(this.item===item));b.onclick=()=>{this.item=item;this.renderProperties();this.drawHandles();this.host.leave();};root.append(el('div',{className:'tree-row'},b));};
   const group=(text:string)=>root.append(el('div',{className:'tree-subgroup',textContent:text}));
   const drives=m.drives??[];
   if(model){sub('  🧩 Modell & Glieder','model');group('Achsen');for(const j of m.mechanism.joints)if(!j.id.startsWith('halt-')&&!owned(drives,j.id))sub(`  ⟳ ${j.id} · ${jointName(j.joint.kind)}`,`joint:${j.id}`);sub('  ＋ Achse anlegen','axis-new');
    group('Antriebe');for(const d of drives)sub(`  ⚡ ${d.id} → ${d.axis}${d.gear?' ✓':''}`,`drive:${d.id}`);sub('  ＋ Antrieb setzen','drive-new');
    group('Fertigung');sub('  ⊚ Lager & Wellen','bearings');sub('  🕸 Struktur je Glied','structure');group('Weitere Einstellungen');}
   else{for(const b of m.mechanism.bodies)if(!b.ground)sub(`  ▭ ${b.id}`,`body:${b.id}`);for(const j of m.mechanism.joints)sub(`  ⟳ ${j.id} · ${jointName(j.joint.kind)}`,`joint:${j.id}`);}
   sub('  Parameter','parameters');sub('  Ein-/Ausgang, Bereich','io');
   if(model)for(const b of m.mechanism.bodies)if(!b.ground&&b.display?.kind!=='mesh'&&!owned(drives,b.id))sub(`  ▭ ${b.id}`,`body:${b.id}`);
   for(const e of m.mechanism.elements)if(!owned(drives,e.id))sub(`  ◉ ${e.id}${e.source.kind==='library'?' (Kaufteil)':''}`,`element:${e.id}`);
   for(const c of m.mechanism.contacts)if(!owned(drives,c.id))sub(`  ⚙ ${c.id} (${c.mode==='follower'?'Läufer':c.kind})`,`contact:${c.id}`);
   m.mechanism.patterns.forEach((p,i)=>sub(`  ⟷ Muster ${i+1} (${p.kind==='mirror'?'Spiegelung':'Reihe'})`,`pattern:${i}`));
  }
  root.append(el('div',{className:'tree-group',textContent:'Neu'}));
  const add=el('div',{className:'mechanism-add'});
  const demoButtons=([['robot','▶ Demo: Roboterarm'],['cnc','▶ Demo: CNC-Portal'],['sled','▶ Demo: Schlitten auf Wellenbahn']] as const).map(([key,label])=>{const b=el('button',{textContent:label,className:'primary'});b.dataset.demo=key;b.onclick=()=>void this.loadDemo(key);return b;});
  const templateBox=el('details',{className:'templates'},el('summary',{textContent:'Vorlagen (Getriebe-Beispiele)'}));
  for(const [key,t] of Object.entries(templates)){const b=el('button',{textContent:'+ '+t.label});b.dataset.mechanismTemplate=key;b.onclick=()=>{const id='mech-'+crypto.randomUUID().slice(0,8);this.host.change(()=>{const d=this.host.doc();d.mechanisms=[...(d.mechanisms??[]),{id,label:t.label.replace(' (Vorlage)',''),mechanism:t.build()}];},`${t.label} angelegt`);this.enter(id);this.host.leave();};templateBox.append(b);}
  const file=el('input',{type:'file',accept:'.stl,.obj,.glb,.gltf',multiple:true,hidden:true});file.id='model-file';
  const load=el('button',{textContent:'⬆ 3D-Modell laden (STL, OBJ, GLB)'});load.dataset.mechanismModel='true';load.onclick=()=>file.click();
  file.onchange=async()=>{const files=[...(file.files??[])];file.value='';if(files.length)await this.importFiles(files);};
  add.append(load,file,...demoButtons,templateBox);root.append(add);
 }
 /** A demo: stored like an imported model, links, axes and motors ready; sliders work at once. */
 async loadDemo(key:keyof typeof demos='robot'){
  const {asset,mechanism,drives,label}=demos[key]();await storeAsset(asset);rememberAsset(asset);this.assets.set(asset.id,asset);
  for(const d of drives)placeMotor(mechanism,d);
  const id='mech-'+crypto.randomUUID().slice(0,8);
  this.host.change(()=>{const d=this.host.doc();d.mechanisms=[...(d.mechanisms??[]),{id,label,mechanism,drives}];},`${label} geladen: Regler unter der 3D-Ansicht bewegen die Achsen; unter „Antriebe“ findet die Suche die Getriebe.`);
  this.enter(id);this.item='model';this.host.leave();
 }
 /** Renames a link everywhere it is referenced. */
 private renameBody(from:string,to:string){
  if(!/^[A-Za-zÄÖÜäöüß0-9_-]{1,40}$/.test(to)){this.host.status('Name: Buchstaben, Ziffern, - und _ (bis 40 Zeichen).');return;}
  const m=this.mechanism();if(!m||m.bodies.some(b=>b.id===to)){this.host.status('Name ist schon vergeben.');return;}
  this.host.change(()=>{const x=this.mechanism()!;for(const b of x.bodies)if(b.id===from)b.id=to;for(const j of x.joints){if(j.a.body===from)j.a.body=to;if(j.b.body===from)j.b.body=to;if(j.id===`halt-${from}`)j.id=`halt-${to}`;}
   for(const e of x.elements)for(const mt of e.mounts)if(mt.body===from)mt.body=to;for(const p of x.patterns)p.source=p.source.map(s=>s===from?to:s);for(const d of this.drives())if(d.body===from)d.body=to;},`Glied umbenannt: ${to}`);
  if(this.brush===from)this.brush=to;if(this.draft.a===from)this.draft.a=to;if(this.draft.b===from)this.draft.b=to;
 }
 /** Step bar for model-based mechanisms: where am I, what next. */
 private steps(m:Mechanism):HTMLElement{
  const drives=this.drives(),links=m.bodies.filter(b=>!b.ground&&!owned(drives,b.id)),filled=links.filter(b=>b.display?.kind==='mesh'&&b.display.parts.length),axes=modelAxes(m,drives),loose=links.filter(b=>m.joints.some(j=>j.id===`halt-${b.id}`));
  const geared=axes.filter(j=>drives.some(d=>d.axis===j.id&&d.gear)),open=axes.filter(j=>!drives.some(d=>d.axis===j.id));
  const plan=geared.length===axes.length&&axes.length?this.plan(m):undefined,built=[...this.structures.values()];
  const state=[true,filled.length>0&&filled.length===links.length,axes.length>0&&!loose.length,axes.length>0,axes.length>0&&geared.length===axes.length,!!plan&&plan.lines.every(l=>l.state==='pass'),built.length>0&&built.every(x=>x.positions&&x.checks.every(c=>c.state!=='fail'))];
  const hints=['Modell ist geladen.',
   !links.length?'Mit „+ Glied“ ein bewegliches Glied anlegen, dann Teile anklicken.':filled.length<links.length?`Glied ${links.find(b=>!filled.includes(b))!.id} hat noch keine Teile.`:'Alle Glieder haben Teile.',
   loose.length?`${loose.map(b=>b.id).join(', ')} hängt noch fest – „＋ Achse anlegen“ und den Zylinder des Gelenks anklicken.`:axes.length?'Jedes Glied hat eine Achse.':'Noch keine Achse.',
   axes.length?'Regler unter der 3D-Ansicht schieben und prüfen, ob alles richtig mitläuft.':'Erst Achsen anlegen.',
   open.length?`Achse ${open[0].id} hat noch keinen Antrieb – „＋ Antrieb setzen“.`:geared.length<axes.length?`Antrieb ${drives.find(d=>!d.gear)?.id??''}: „Getriebe finden“ und eine Lösung übernehmen.`:'Jede Achse hat ihr Getriebe. Regler schieben: die Getriebe drehen mit.',
   plan?plan.lines.every(l=>l.state==='pass')?'Alle Wellen gelagert – Lagerliste unter „Lager & Wellen“.':'Nicht jede Welle hat Platz für Lager – „Lager & Wellen“ ansehen.':'Erst alle Getriebe übernehmen.',
   built.length?'Strukturen erzeugt – je Glied als STL herunterladen.':'„Struktur je Glied“: Strukturen erzeugen lassen.'];
  const next=state.findIndex(s=>!s),bar=el('ol',{className:'steps'});
  const firstDrive=drives.find(d=>!d.gear)??drives[0];
  [['Modell','model'],['Glieder','model'],['Achsen','axis-new'],['Testen','model'],['Antrieb',firstDrive?`drive:${firstDrive.id}`:'drive-new'],['Lager','bearings'],['Struktur','structure']].forEach(([label,item],i)=>{const li=el('li',{textContent:`${state[i]?'✓':i+1} ${label}`});li.dataset.state=state[i]?'done':i===next?'current':'open';li.onclick=()=>{this.item=item as Item;this.renderProperties();};bar.append(li);});
  const index=next<0?6:next;return el('div',{className:'step-box'},bar,el('p',{className:'step-hint',textContent:'Was jetzt? '+hints[index]}));
 }
 /** New mechanism from model files: every part starts on the frame (Basis). */
 async importFiles(files:File[]){
  try{this.host.status('Modell wird gelesen …');const asset=await importModel(files);await storeAsset(asset);rememberAsset(asset);this.assets.set(asset.id,asset);
   const id='mech-'+crypto.randomUUID().slice(0,8),label=asset.name.replace(/\.(stl|obj|glb|gltf)/gi,'').slice(0,60)||'Modell';
   this.host.change(()=>{const d=this.host.doc();d.mechanisms=[...(d.mechanisms??[]),{id,label,mechanism:{format:'kinematics-1',parameters:[],bodies:[{id:'ground',frame:identity(),ground:true,display:{kind:'mesh',asset:asset.id,parts:asset.parts.map(p=>p.id)}}],elements:[],joints:[],contacts:[],patterns:[],input:{kind:'none'},output:{kind:'none'},range:{from:0,to:0,samples:1}}}];},
    `Modell geladen: ${asset.parts.length} Teile${asset.scale!==1?' (in Metern erkannt, auf mm skaliert)':''}`);
   this.enter(id);this.host.leave();}
  catch(e){this.host.status('Modell nicht lesbar: '+(e instanceof Error?e.message:e));}}

 // ---------- drives ----------
 /** Changes one drive (and the mechanism) through the Studio's change(); stale search results go. */
 private editDrive(id:string,message:string,fn:(d:Drive,m:Mechanism)=>void){
  if(this.search?.drive===id){this.search.worker.terminate();this.search=undefined;}delete this.sweeps[id];
  this.host.change(()=>{const e=this.entry()!,d=e.drives?.find(x=>x.id===id);if(!d)throw Error('Antrieb fehlt.');fn(d,e.mechanism);},message);}
 /** A new drive beside its axis: on the carrying link (the wagon on a path), shaft parallel to the axis. */
 private createDrive(m:Mechanism){
  const j=m.joints.find(x=>x.id===this.newDrive.axis);if(!j)return;const carrier=j.joint.kind==='path'?j.b:j.a,drives=this.drives();
  let k=1;while(m.bodies.some(b=>b.id===`M${k}`)||drives.some(d=>d.id===`M${k}`))k++;const id=`M${k}`;
  const d:Drive={id,spec:this.newDrive.spec,body:carrier.body,frame:compose(carrier.local,{position:[80,0,0],rotation:[0,0,0,1]}),axis:j.id,target:linearAxis(j)?8:4,tolerance:5};
  this.host.change(()=>{const e=this.entry()!;e.drives=[...(e.drives??[]),d];placeMotor(e.mechanism,d);},`Motor ${id} neben ${j.id} gesetzt – per Klick auf eine Fläche oder mit den Zahlen genau platzieren.`);
  this.item=`drive:${id}`;this.renderProperties();}
 /** Starts the route search of a drive in the frame of its carrying link at the current pose. */
 private async findGear(id:string){
  const m=this.mechanism(),drives=this.drives(),d=drives.find(x=>x.id===id);if(!m||!d)return;this.search?.worker.terminate();this.search=undefined;
  try{
   const values=this.values(m),ref=await this.poseAt(m,values),task=driveTask(m,drives,d,a=>this.assets.get(a),ref.poses[0].bodies,values);
   const w=new Worker('./mechanics-drive-worker.js'),search={drive:id,worker:w,info:task.info,results:[] as NonNullable<MechanismEditor['search']>['results'],state:'running' as 'running'|'done'|'error',text:`Suche läuft · ${task.request.environment!.obstacles.length} Sperrzonen aus dem Modell …`};this.search=search;
   w.onmessage=({data})=>{if(this.search!==search)return;
    if(data.type==='progress')search.text=`Suche läuft · ${Math.round(100*data.visited/data.budget)} % · ${search.results.length} Lösung(en)`;
    if(data.type==='solution'){search.results.push(data.solution);search.results.sort((a,b)=>a.summary.elements-b.summary.elements||a.summary.length-b.summary.length);}
    if(data.type==='done'){w.terminate();search.state='done';search.text=search.results.length?`${search.results.length} Getriebe gefunden.`:'Kein Getriebe gefunden. Motor näher an die Achse, Ziel oder Stufenzahl ändern, oder Sperrzonen prüfen.';}
    if(data.type==='error'){w.terminate();search.state='error';search.text='Suche fehlgeschlagen: '+data.message;}
    this.renderSearch();};
   w.postMessage({request:task.request,options:task.options});
  }catch(e){this.host.status('Suche nicht möglich: '+(e instanceof Error?e.message:e));}
  this.renderProperties();}
 private ratioText(kind:TaskInfo['kind'],ratio:number){return kind==='rotation'?`1 : ${ratio.toFixed(2)}`:kind==='translation'?`${ratio.toFixed(2)} mm/U`:`${(2*Math.PI*20/ratio).toFixed(2)} mm/U`;}
 private renderSearch(){
  const s=this.search,progress=document.getElementById('drive-progress'),list=document.getElementById('drive-results');if(!s||!progress||!list||progress.dataset.drive!==s.drive)return;
  progress.textContent=s.text;progress.dataset.state=s.state;list.replaceChildren();
  s.results.forEach((r,i)=>{const take=el('button',{textContent:'Übernehmen'});take.dataset.adopt=String(i);take.onclick=()=>void this.adopt(i);
   list.append(el('div',{className:'drive-result'},el('span',{textContent:`${r.label}`}),el('small',{textContent:`${this.ratioText(s.info.kind,r.ratio)} · ${r.summary.elements} Teile`}),take));});}
 /** Merges a found train into the mechanism, then checks it over the axis range. */
 private async adopt(i:number){
  const s=this.search,e=this.entry();if(!s||!e)return;const found=s.results[i];if(!found)return;
  const m=structuredClone(e.mechanism),drives=structuredClone(e.drives??[]),d=drives.find(x=>x.id===s.drive);if(!d)return;
  try{this.host.status('Getriebe wird übernommen …');
   const values=this.values(m),fixed:Record<string,number[]>={};for(const j of this.axes(m))if(j.id!==d.axis)fixed[j.id]=[values[j.id]];Object.assign(fixed,heldTrains(drives.filter(x=>x.axis!==d.axis),values));
   const gear=await adoptGear(m,d,found.mechanism,s.info,found.label,found.ratio,fixed);
   s.worker.terminate();this.search=undefined;
   this.host.change(()=>{const x=this.entry()!;x.mechanism=m;x.drives=drives;},`Getriebe für ${d.id} übernommen: ${found.label}${gear.notes.length?' · '+gear.notes.join(' '):''}`);
   void this.checkSweep(d.id);
  }catch(err){this.host.status('Übernahme fehlgeschlagen: '+(err instanceof Error?err.message:err));}
  this.renderProperties();}
 /** Drive parts and motor against the model's parts while the driven axis runs through its range. */
 private async checkSweep(id:string){
  const m=this.mechanism(),d=this.drives().find(x=>x.id===id);if(!m||!d?.gear)return;
  this.sweeps[id]={state:'running',text:'Prüfe Kollisionen über den Achsbereich …'};this.renderSweep(id);
  try{const hits=await sweepCollisions(m,this.drives(),d,a=>this.assets.get(a),async(axis,v)=>(await this.poseAt(m,this.values(m,{[axis]:v}))).poses[0].bodies,13);
   this.sweeps[id]=hits.length?{state:'hit',text:'Kollision: '+hits.map(h=>`${h.a} ↔ ${h.b} bei ${h.at.join(', ')}`).join('; '),hits}:{state:'ok',text:`Kollisionsfrei über den ganzen Bereich von ${d.axis} (13 Stellungen).`};}
  catch(err){this.sweeps[id]={state:'error',text:'Prüfung fehlgeschlagen: '+(err instanceof Error?err.message:err)};}
  this.renderSweep(id);}
 private renderSweep(id:string){const p=document.getElementById('drive-check');if(!p||p.dataset.drive!==id)return;const s=this.sweeps[id];p.textContent=s?.text??'Noch nicht geprüft.';p.dataset.state=s?.state??'';}
 private drivePage(m:Mechanism,id:string|undefined,ui:{number:(label:string,value:number,write:(n:number)=>void,step?:string)=>HTMLElement;select:(label:string,value:string,options:[string,string][],write:(v:string)=>void)=>HTMLElement;frameFields:(label:string,f:Frame,write:(f:Frame)=>void)=>HTMLElement[]}):HTMLElement[]{
  const drives=this.drives(),axes=modelAxes(m,drives),catalog=driveCatalog.map(s=>[s.id,s.label] as [string,string]);
  if(!id){
   if(!axes.length)return [el('h3',{textContent:'＋ Antrieb setzen'}),el('p',{className:'muted',textContent:'Erst Achsen anlegen: ein Antrieb treibt immer eine Achse.'})];
   if(!axes.some(j=>j.id===this.newDrive.axis))this.newDrive.axis=(axes.find(j=>!drives.some(d=>d.axis===j.id))??axes[0]).id;
   const create=el('button',{textContent:'Motor setzen',className:'primary'});create.dataset.createDrive='true';create.onclick=()=>this.createDrive(m);
   return [el('h3',{textContent:'＋ Antrieb setzen'}),el('p',{className:'muted',textContent:'Ein Motor oder Handrad sitzt auf dem Glied, das die Achse trägt (auf einem Pfad: auf dem Wagen). Er wird neben die Achse gesetzt, die Welle parallel. Danach per Klick auf eine Fläche oder mit den Zahlen genau platzieren.'}),
    ui.select('Achse',this.newDrive.axis,axes.map(j=>[j.id,`${j.id} · ${jointName(j.joint.kind)}`]),v=>{this.newDrive.axis=v;}),ui.select('Antrieb',this.newDrive.spec,catalog,v=>{this.newDrive.spec=v;}),create];
  }
  const d=drives.find(x=>x.id===id);if(!d)return [el('p',{className:'muted',textContent:'Antrieb fehlt.'})];
  const j=m.joints.find(x=>x.id===d.axis),linear=!!j&&linearAxis(j),spec=driveSpec(d.spec),links=m.bodies.filter(b=>!owned(drives,b.id)).map(b=>[b.id,b.ground?'Basis':b.id] as [string,string]);
  const out:HTMLElement[]=[el('h3',{textContent:`⚡ Antrieb ${id}`}),el('p',{className:'muted',textContent:`${spec.label} · ${spec.note}`}),
   ui.select('Antrieb',d.spec,catalog,v=>this.editDrive(id,'Antrieb geändert',(x,mm)=>{x.spec=v;removeGear(mm,x);placeMotor(mm,x);})),
   ui.select('Treibt Achse',d.axis,axes.map(a=>[a.id,`${a.id} · ${jointName(a.joint.kind)}`]),v=>this.editDrive(id,'Achse des Antriebs geändert',(x,mm)=>{removeGear(mm,x);x.axis=v;})),
   ui.select('Sitzt auf Glied',d.body,links,v=>this.editDrive(id,'Motor auf anderes Glied gesetzt',(x,mm)=>{const from=mm.bodies.find(b=>b.id===x.body)!,to=mm.bodies.find(b=>b.id===v)!;x.frame=compose(compose(inverse(to.frame),from.frame),x.frame);x.body=v;removeGear(mm,x);placeMotor(mm,x);})),
   ui.number(linear?'Weg je Motorumdrehung [mm/U]':'Untersetzung (Motorumdrehungen je Achsumdrehung)',Math.round(d.target*1000)/1000,n=>{if(n>0&&n<=1000)this.editDrive(id,'Ziel geändert',x=>{x.target=n;});}),
   ui.number('Toleranz [%]',d.tolerance,n=>{if(n>=0&&n<=50)this.editDrive(id,'Toleranz geändert',x=>{x.tolerance=n;});}),
   ui.select('Stufen höchstens',String(d.maxStages??3),[['1','1'],['2','2'],['3','3'],['4','4']],v=>this.editDrive(id,'Stufenzahl geändert',x=>{x.maxStages=Number(v);}))];
  const lego=el('input',{type:'checkbox',checked:!!d.lego});lego.onchange=()=>this.editDrive(id,'Teileauswahl geändert',x=>{x.lego=lego.checked||undefined;});out.push(el('label',{className:'check'},lego,' auch LEGO-Teile verwenden'));
  // Placement.
  const click=el('button',{textContent:'Auf Fläche klicken'});click.dataset.driveTool=id;click.setAttribute('aria-pressed',String(this.tool?.mode==='motor'));click.onclick=()=>{this.tool=this.tool?.mode==='motor'?undefined:{mode:'motor',drive:id};this.host.status(this.tool?'Fläche am Modell anklicken: der Motor steht darauf, die Welle zeigt von der Fläche weg.':'Werkzeug beendet.');this.renderProperties();};
  const parallel=el('button',{textContent:'Welle parallel zur Achse'});parallel.onclick=()=>this.editDrive(id,'Motorwelle parallel zur Achse',(x,mm)=>{x.frame=parallelTo(mm,x);removeGear(mm,x);placeMotor(mm,x);});
  out.push(el('h2',{textContent:'Lage des Motors'}),el('div',{className:'button-row'},click,parallel),...ui.frameFields('Flansch auf dem Glied (z = Welle)',d.frame,f=>this.editDrive(id,'Motor verschoben',(x,mm)=>{x.frame=f;removeGear(mm,x);placeMotor(mm,x);})));
  // Gear.
  const s=this.search?.drive===id?this.search:undefined,find=el('button',{textContent:s?.state==='running'?'Suche läuft …':'Getriebe finden',className:'primary'});find.dataset.findGear=id;find.disabled=s?.state==='running';find.onclick=()=>void this.findGear(id);
  const progress=el('p',{className:'muted',id:'drive-progress',textContent:s?.text??(d.gear?'':'Die Suche läuft im Glied, auf dem der Motor sitzt; die Teile des Modells sind Sperrzonen.')});progress.dataset.drive=id;if(s)progress.dataset.state=s.state;
  const results=el('div',{id:'drive-results',className:'drive-results'});
  out.push(el('h2',{textContent:'Getriebe'}),find,progress,results);
  if(d.gear){
   const check=el('p',{id:'drive-check',className:'muted'});check.dataset.drive=id;
   const again=el('button',{textContent:'Über den Bereich prüfen'});again.onclick=()=>void this.checkSweep(id);
   const drop=el('button',{textContent:'Getriebe entfernen',className:'danger'});drop.onclick=()=>this.editDrive(id,'Getriebe entfernt',(x,mm)=>{removeGear(mm,x);});
   out.push(el('p',{className:'drive-gear',textContent:`Übernommen: ${d.gear.label} · ${this.ratioText(j?.joint.kind==='path'?'path':linear?'translation':'rotation',d.gear.ratio)}`}),...d.gear.notes.map(n=>el('p',{className:'muted',textContent:'Hinweis: '+n})),check,el('div',{className:'button-row'},again,drop));
   queueMicrotask(()=>this.renderSweep(id));
  }
  const del=el('button',{textContent:'Antrieb löschen',className:'danger'});del.onclick=()=>{if(this.search?.drive===id){this.search.worker.terminate();this.search=undefined;}this.host.change(()=>{const e=this.entry()!,x=e.drives?.find(y=>y.id===id);if(x)removeDrive(e.mechanism,x);e.drives=(e.drives??[]).filter(y=>y.id!==id);},`Antrieb ${id} gelöscht`);this.item='model';this.renderProperties();};
  out.push(del);
  queueMicrotask(()=>this.renderSearch());
  return out;
 }

 // ---------- fabrication: bearings and structures ----------
 private fabrication(){const e=this.entry()!;return e.fabrication??{};}
 private editFabrication(message:string,fn:(f:NonNullable<NonNullable<ReturnType<MechanismEditor['entry']>>['fabrication']>)=>void){this.planCache=undefined;this.host.change(()=>{const e=this.entry()!;e.fabrication=e.fabrication??{};fn(e.fabrication);},message);}
 private assetsOf(m:Mechanism){return (id:string)=>{const a=this.assets.get(id);return a?{parts:a.parts}:undefined;};}
 /** The bearing plan for the current document (cached). */
 private plan(m:Mechanism):BearingPlan|undefined{
  const settings=this.fabrication().bearings??{},key=JSON.stringify([m.bodies.length,m.elements.map(e=>[e.id,e.mounts[0].pose.position]),m.joints.map(j=>[j.id,j.a.local.position,j.limits]),this.drives().map(d=>[d.id,d.frame,!!d.gear]),settings,[...this.assets.keys()]]);
  if(this.planCache?.key!==key){try{this.planCache={key,plan:planBearings(m,this.drives(),this.assetsOf(m),settings as Partial<BearingSettings>)};}catch{return undefined;}}
  return this.planCache.plan;
 }
 /** Bearings as rings in the view: outer and inner ring of every purchased seat. */
 private showBearings(plan:BearingPlan){
  const items:{body:string;positions:Float32Array;color:number}[]=[];
  for(const x of plan.seats){const spec=bearingCatalog.find(b=>b.id===x.part);if(!spec)continue;const P:number[]=[],n=28,f=x.frame,ro=spec.D/2,ri=spec.d/2+.8,h=spec.B/2;
   const at=(r:number,a:number,z:number)=>compose(f,{position:[r*Math.cos(a),r*Math.sin(a),z],rotation:[0,0,0,1]}).position;
   for(let i=0;i<n;i++){const a0=2*Math.PI*i/n,a1=2*Math.PI*(i+1)/n;for(const [r,flip] of [[ro,1],[ri,-1]] as [number,number][]){const q=[at(r,a0,-h),at(r,a1,-h),at(r,a1,h),at(r,a0,h)];if(flip>0)P.push(...q[0],...q[1],...q[2],...q[0],...q[2],...q[3]);else P.push(...q[0],...q[2],...q[1],...q[0],...q[3],...q[2]);}
    for(const z of [-h,h]){const q=[at(ri,a0,z),at(ro,a0,z),at(ro,a1,z),at(ri,a1,z)];if(z>0)P.push(...q[0],...q[1],...q[2],...q[0],...q[2],...q[3]);else P.push(...q[0],...q[2],...q[1],...q[0],...q[3],...q[2]);}}
   items.push({body:x.link,positions:Float32Array.from(P),color:0xe8a24a});}
  this.view.setOverlay('bearings',items);
 }
 private bearingsPage(m:Mechanism,ui:{number:(label:string,value:number,write:(n:number)=>void,step?:string)=>HTMLElement;select:(label:string,value:string,options:[string,string][],write:(v:string)=>void)=>HTMLElement}):HTMLElement[]{
  const out:HTMLElement[]=[el('h3',{textContent:'⊚ Lager & Wellen'}),el('p',{className:'muted',textContent:'Jede Welle bekommt Lager aus dem Katalog: auf ihrer Achse, mit Abstand zu den Rädern und mit einem Weg zum Einsetzen. Die Lagersitze, Motorflansche und Klemmnaben sind die Haltepunkte der Struktur.'})];
  const s=this.fabrication().bearings??{},set=(k:string,v:string|number)=>this.editFabrication('Lagereinstellung geändert',f=>{f.bearings={...(f.bearings??{}),[k]:v};});
  out.push(ui.select('Lagerart',String(s.prefer??'ball'),[['ball','Kugellager (Kaufteil)'],['plain','Gleitlager gedruckt (Loch mit Spiel)']],v=>set('prefer',v)),
   ui.select('Zwischenräder',String(s.axles??'rotating'),[['rotating','Welle dreht, Lager im Glied'],['fixed','feste Achse, Rad läuft darauf']],v=>set('axles',v)),
   ui.number('Mindestabstand Lager–Zahnrad [mm]',Number(s.gearGap??2),n=>{if(n>=0&&n<=20)set('gearGap',n);}),ui.number('Wand um den Lagersitz [mm]',Number(s.wall??2.5),n=>{if(n>=1&&n<=10)set('wall',n);}),
   ui.number('Aufmaß Lagersitz (Durchmesser) [mm]',Number(s.fit??.15),n=>{if(n>=-.2&&n<=.6)set('fit',n);},'0.05'),ui.select('Gelenkwellen',String(s.axisShaft??8),[['5','Ø5'],['6','Ø6'],['8','Ø8'],['10','Ø10'],['12','Ø12']],v=>set('axisShaft',Number(v))));
  const plan=this.plan(m);
  if(!plan){out.push(el('p',{className:'muted',textContent:'Erst alle Antriebe mit Getriebe versehen.'}));return out;}
  this.showBearings(plan);
  const table=el('div',{className:'bearing-lines'});table.id='bearing-lines';
  for(const l of plan.lines){const row=el('div',{className:'bearing-line'},el('span',{textContent:l.state==='pass'?'✓':'✗'}),el('b',{textContent:l.id}),el('small',{textContent:`${({train:'Getriebewelle',motor:'Motorwelle',axis:'Gelenk',spindle:'Spindel',rod:'Führung',roller:'Laufrollen'} as Record<string,string>)[l.kind]} · in ${l.link} · ${l.message}`}));row.dataset.state=l.state;table.append(row);}
  out.push(el('h2',{textContent:`Wellen (${plan.lines.length})`}),table,el('h2',{textContent:'Stückliste'}),el('ul',{className:'bom'},...plan.bom.map(b=>el('li',{textContent:`${b.count}× ${b.label}`}))));
  const go=el('button',{textContent:'Weiter: Struktur je Glied',className:'primary'});go.onclick=()=>{this.item='structure';this.renderProperties();};out.push(go);
  return out;
 }
 private structurePage(m:Mechanism,ui:{number:(label:string,value:number,write:(n:number)=>void,step?:string)=>HTMLElement;select:(label:string,value:string,options:[string,string][],write:(v:string)=>void)=>HTMLElement}):HTMLElement[]{
  const out:HTMLElement[]=[el('h3',{textContent:'🕸 Struktur je Glied'}),el('p',{className:'muted',textContent:'Jedes Glied wird als optimiertes Tragwerk erzeugt: Streben zwischen Lagersitzen, Motorflanschen und der Verbindung zum Vorgänger, um Räder, Wellen und die bewegten Nachbarglieder herum. Das Modell diente nur zum Platzieren.'})];
  const s=this.fabrication().structure??{},set=(k:string,v:string|number)=>this.editFabrication('Struktureinstellung geändert',f=>{f.structure={...(f.structure??{}),[k]:v};});
  out.push(ui.number('Last je Haltepunkt [N]',Number(s.load??20),n=>{if(n>0&&n<=1000)set('load',n);},'5'),ui.number('Dünnste Strebe (Radius) [mm]',Number(s.rMin??3),n=>{if(n>=1&&n<=8)set('rMin',n);}),
   ui.select('Form',String(s.bracing??1),[['0','baumartig (reiner Baum)'],['1','Baum mit Querstreben'],['2','netzartig']],v=>set('bracing',Number(v))),ui.select('Auflösung',String(s.resolution??.8),[['1.2','grob (schnell)'],['0.8','mittel'],['0.5','fein']],v=>set('resolution',Number(v))));
  const job=this.structureJob,go=el('button',{textContent:job?.state==='running'?'Wird erzeugt …':'Strukturen erzeugen',className:'primary'});go.dataset.generateStructures='true';go.disabled=job?.state==='running'||!this.plan(m);go.onclick=()=>this.generateStructures(m);
  const progress=el('p',{className:'muted',id:'structure-progress',textContent:job?.text??(this.plan(m)?'':'Erst alle Antriebe mit Getriebe versehen.')});if(job)progress.dataset.state=job.state;
  const hide=el('input',{type:'checkbox',checked:this.view.hideModel});hide.onchange=()=>{this.view.hideModel=hide.checked;this.view.clearOverlay('none');};
  out.push(go,progress,el('label',{className:'check'},hide,' Modell ausblenden'));
  const list=el('div',{className:'structure-results',id:'structure-results'});
  for(const [link,x] of this.structures){const r=x.report,row=el('div',{className:'structure-row'});row.dataset.link=link;row.dataset.state=x.error||x.checks.some(c=>c.state==='fail')?'fail':'ok';
   row.append(el('b',{textContent:link}),el('small',{textContent:x.error?'Fehler: '+x.error:`${r?.struts} Streben · ${Number(r?.mass).toFixed(0)} g · Auslastung ${(Number(r?.utilisation)*100).toFixed(0)} % · ${Number(r?.seconds).toFixed(0)} s`}));
   for(const c of x.checks)if(c.state!=='pass')row.append(el('small',{className:c.state==='warn'?'warn':'fail',textContent:(c.state==='warn'?'! ':'✗ ')+c.message}));
   if(x.stl){const dl=el('button',{textContent:'STL'});dl.dataset.structureStl=link;dl.onclick=()=>this.download(new Blob([x.stl! as BlobPart],{type:'model/stl'}),`${this.entry()!.label}-${link}.stl`.replace(/\s+/g,'-'));row.append(dl);}
   list.append(row);}
  out.push(list);
  if([...this.structures.values()].some(x=>x.stl)){const zip=el('button',{textContent:'Alle Druckteile als ZIP'});zip.dataset.structureZip='true';zip.onclick=async()=>{const z=new JSZip();for(const [link,x] of this.structures)if(x.stl)z.file(`${link}.stl`,x.stl);const plan=this.plan(m);if(plan)z.file('stueckliste.txt',plan.bom.map(b=>`${b.count}x ${b.label}`).join('\n'));this.download(await z.generateAsync({type:'blob'}),`${this.entry()!.label}-druckteile.zip`.replace(/\s+/g,'-'));};out.push(zip);}
  return out;
 }
 private download(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
 /** Runs bearing plan and structure generation in a worker; shows each link as it is done. */
 private generateStructures(m:Mechanism){
  this.structureJob?.worker.terminate();this.structures.clear();this.view.clearOverlay('structure');
  const fab=this.fabrication(),assets:Record<string,{parts:{id:string;positions:Float32Array}[]}>={};
  for(const b of m.bodies)if(b.display?.kind==='mesh'){const a=this.assets.get(b.display.asset);if(a)assets[a.id]={parts:a.parts.map(p=>({id:p.id,positions:p.positions}))};}
  const w=new Worker('./mechanics-structure-worker.js'),job={worker:w,state:'running' as 'running'|'done'|'error',text:'Lager werden geplant …',key:''};this.structureJob=job;
  const st=fab.structure??{},settings={load:Number(st.load??20),structure:{material:{rMin:Number(st.rMin??3)},bracing:Number(st.bracing??1),resolution:Number(st.resolution??.8)}};
  const render=()=>{const p=document.getElementById('structure-progress');if(p){p.textContent=job.text;p.dataset.state=job.state;}if(this.item==='structure')this.renderProperties();};
  w.onmessage=({data})=>{if(this.structureJob!==job)return;
   if(data.type==='plan'){this.showBearings(data.plan);job.text='Lager geplant. Strukturen werden erzeugt (Spitze zuerst) …';render();}
   if(data.type==='progress'){job.text=`${data.link}: ${data.stage} …`;const p=document.getElementById('structure-progress');if(p)p.textContent=job.text;}
   if(data.type==='link'){this.structures.set(data.link,{positions:data.positions,stl:data.stl,report:data.report,checks:data.checks,error:data.error});
    this.view.setOverlay('structure',[...this.structures.entries()].filter(([,x])=>x.positions).map(([link,x])=>({body:link,positions:x.positions!,color:linkColor(m.bodies.findIndex(b=>b.id===link),false)})));render();}
   if(data.type==='done'){w.terminate();job.state='done';const fails=[...this.structures.values()].filter(x=>x.error||x.checks.some(c=>c.state==='fail')).length;job.text=fails?`${fails} Glied(er) mit Fehlern.`:`Fertig: ${this.structures.size} Glieder erzeugt und geprüft.`;this.view.hideModel=true;this.view.clearOverlay('none');render();}
   if(data.type==='error'){w.terminate();job.state='error';job.text='Fehlgeschlagen: '+data.message;render();}};
  w.postMessage({mechanism:m,drives:this.drives(),assets,bearings:fab.bearings??{},settings});
  render();
 }

 // ---------- properties ----------
 renderProperties(root:HTMLElement=document.getElementById('properties')!):void{
  root.replaceChildren();const entry=this.entry();if(!entry)return;const m=entry.mechanism;
  const edit=(message:string,fn:(m:Mechanism)=>void)=>this.host.change(()=>fn(this.mechanism()!),message);
  const number=(label:string,value:number,write:(n:number)=>void,step='0.1')=>{const input=el('input',{type:'number',step,value:String(value)});input.onchange=()=>{const n=Number(input.value);if(input.value===''||!Number.isFinite(n)){input.value=String(value);return;}write(n);};return el('label',{},label,input);};
  const text=(label:string,value:string,write:(v:string)=>void)=>{const input=el('input',{type:'text',value});input.onchange=()=>write(input.value.trim());return el('label',{},label,input);};
  const select=(label:string,value:string,options:[string,string][],write:(v:string)=>void)=>{const s=el('select');for(const [v,t] of options)s.add(new Option(t,v));s.value=value;s.onchange=()=>write(s.value);return el('label',{},label,s);};
  const triple=(label:string,values:number[],write:(i:number,n:number)=>void)=>{const row=el('div',{className:'triple'});values.forEach((v,i)=>{const input=el('input',{type:'number',step:'0.1',value:String(Number(v.toFixed(3)))});input.setAttribute('aria-label',`${label} ${'XYZ'[i]}`);input.onchange=()=>{const n=Number(input.value);if(Number.isFinite(n))write(i,n);};row.append(el('label',{},'XYZ'[i],input));});return [heading(label),row];};
  const frameFields=(label:string,f:Frame,write:(f:Frame)=>void)=>{const e=new THREE.Euler().setFromQuaternion(new THREE.Quaternion(...f.rotation),'XYZ');
   return [...triple(`${label}: Position [mm]`,f.position,(i,n)=>{const p=[...f.position] as V;p[i]=n;write({...f,position:p});}),...triple(`${label}: Drehung XYZ [°]`,[e.x*deg,e.y*deg,e.z*deg],(i,n)=>{const a=[e.x,e.y,e.z];a[i]=n/deg;write({...f,rotation:new THREE.Quaternion().setFromEuler(new THREE.Euler(a[0],a[1],a[2],'XYZ')).toArray() as Frame['rotation']});})];};
  const remove=(label:string,fn:(m:Mechanism)=>void)=>{const b=el('button',{textContent:label,className:'danger'});b.onclick=()=>{edit(label,fn);this.item='mechanism';};return b;};
  const bodies=m.bodies.map(b=>[b.id,b.id] as [string,string]),joints=m.joints.map(j=>[j.id,`${j.id} (${j.joint.kind})`] as [string,string]);
  root.append(el('h3',{textContent:`⚙ ${entry.label}`}));if(m.bodies.some(b=>b.display?.kind==='mesh'))root.append(this.steps(m));root.append(el('p',{id:'mechanism-preview',className:'muted'}));this.renderStatus();
  const back=el('button',{textContent:'← Zur Getriebe-Baugruppe'});back.onclick=()=>{this.exit();this.host.leave();};

  if(this.item==='mechanism'){
   root.append(text('Name',entry.label,v=>{if(v)this.host.change(()=>{entry.label=v;},'Mechanismus umbenannt');}),
    el('p',{className:'muted',textContent:`${m.bodies.length} Körper · ${m.joints.length} Gelenke · ${m.contacts.length} Kontakte · ${m.patterns.length} Muster. Links Teile wählen; Pfadpunkte im 3D-Fenster ziehen.`}));
   const addBody=el('button',{textContent:'+ Körper'});addBody.onclick=()=>{const id=`koerper${m.bodies.length}`;edit('Körper hinzugefügt',x=>{x.bodies.push({id,frame:identity(),display:{kind:'box',size:[40,40,40]}});x.joints.push({id:`gelenk-${id}`,joint:{kind:'fixed'},a:{body:'ground',local:identity()},b:{body:id,local:identity()}});});this.item=`body:${id}`;};
   const addGear=el('button',{textContent:'+ Zahnrad'});addGear.onclick=()=>{const body=m.bodies.find(b=>!b.ground)?.id;if(!body){this.host.status('Zuerst einen Körper anlegen.');return;}const id=`rad${m.elements.length+1}`;edit('Zahnrad hinzugefügt',x=>{x.elements.push(spur(id,body,2,20,10));});this.item=`element:${id}`;};
   const addContact=el('button',{textContent:'+ Kontakt'});addContact.onclick=()=>{const es=m.elements.filter(e=>e.surfaces.length);if(es.length<2){this.host.status('Ein Kontakt braucht zwei Elemente mit Wirkfläche.');return;}const id=`kontakt${m.contacts.length+1}`;edit('Kontakt hinzugefügt',x=>{x.contacts.push({id,kind:'roll',mode:'fixed-axes',a:{element:es[0].id,surface:es[0].surfaces[0].id},b:{element:es[1].id,surface:es[1].surfaces[0].id},params:{offsetA:0,offsetB:0}});});this.item=`contact:${id}`;};
   const addPattern=el('button',{textContent:'+ Muster'});addPattern.onclick=()=>{edit('Muster hinzugefügt',x=>{x.patterns.push({kind:'mirror',plane:identity(),source:[]});});this.item=`pattern:${m.patterns.length}`;};
   const del=el('button',{textContent:'Mechanismus löschen',className:'danger'});del.onclick=()=>{const id=this.activeId;this.exit();this.host.change(()=>{const d=this.host.doc();d.mechanisms=(d.mechanisms??[]).filter(x=>x.id!==id);},'Mechanismus gelöscht');this.host.leave();};
   root.append(el('div',{className:'button-row'},addBody,addGear,addContact,addPattern),back,del);return;
  }
  if(this.item==='model'){
   const meshBodies=m.bodies.filter(b=>b.display?.kind==='mesh'),asset=meshBodies[0]?.display?.kind==='mesh'?this.assets.get(meshBodies[0].display.asset):undefined;
   root.append(el('h3',{textContent:'🧩 Modell & Glieder'}),el('p',{className:'muted',textContent:'Ein Glied ist alles, was sich gemeinsam bewegt. Die Basis steht still. Neues Glied anlegen, dann im 3D-Fenster die Teile anklicken, die dazugehören.'}));
   const names=el('div',{className:'link-names'});
   for(const b of m.bodies){const input=el('input',{type:'text',value:b.ground?'Basis (steht still)':b.id,disabled:!!b.ground});input.setAttribute('aria-label','Name von '+b.id);input.onchange=()=>this.renameBody(b.id,input.value.trim());const count=b.display?.kind==='mesh'?b.display.parts.length:0;const swatch=el('span',{className:'swatch',textContent:'■'});swatch.style.color='#'+linkColor(m.bodies.indexOf(b),b.ground).toString(16).padStart(6,'0');names.append(el('div',{className:'link-name'},swatch,input,el('small',{textContent:`${count} Teil${count===1?'':'e'}`})));}
   root.append(heading('Glieder'),names);
   const addLink=el('button',{textContent:'+ Glied'});addLink.dataset.addLink='true';addLink.onclick=()=>{const id=`glied${m.bodies.length}`;edit('Glied angelegt',x=>{x.bodies.push({id,frame:identity(),display:{kind:'mesh',asset:asset?.id??'',parts:[]}});x.joints.push({id:`halt-${id}`,joint:{kind:'fixed'},a:{body:'ground',local:identity()},b:{body:id,local:identity()}});});this.brush=id;};
   const links=m.bodies.map(b=>[b.id,b.ground?'Basis':b.id] as [string,string]);
   root.append(addLink,select('Klick im 3D-Fenster weist zu',this.brush,[['','– nur auswählen –'],...links],v=>{this.brush=v;this.renderProperties();}));
   if(!asset){root.append(el('p',{className:'muted',textContent:'Modell wird geladen …'}));return;}
   const table=el('div',{className:'part-list'});
   for(const part of asset.parts){const owner=meshBodies.find(b=>b.display?.kind==='mesh'&&b.display.parts.includes(part.id))?.id??'';const key=`${asset.id}/${part.id}`;
    const row=el('div',{className:'part-row'});row.dataset.part=part.id;row.setAttribute('aria-selected',String(this.selectedPart===key));
    const s=el('select');for(const [v,t] of links)s.add(new Option(t,v));s.value=owner;s.setAttribute('aria-label','Glied für '+part.name);s.onchange=()=>this.assignPart(asset.id,part.id,s.value);
    const name=el('button',{textContent:part.name,className:'part-name'});name.onclick=()=>{this.selectedPart=key;this.view.highlight=new Set([key]);this.refresh();this.renderProperties();};
    row.append(name,s);table.append(row);}
   root.append(heading(`Teile (${asset.parts.length})`),table);return;
  }
  if(this.item==='axis-new'){
   const links=m.bodies.map(b=>[b.id,b.ground?'Basis':b.id] as [string,string]);if(!this.draft.b)this.draft.b=m.bodies.find(b=>!b.ground)?.id??'';
   root.append(el('h3',{textContent:'＋ Achse anlegen'}),el('p',{className:'muted',textContent:'Achse zwischen zwei Gliedern: Typ wählen, dann am Modell die Geometrie anklicken, aus der die Achse folgt.'}),
    select('Glied A (trägt)',this.draft.a,links,v=>{this.draft.a=v;}),select('Glied B (bewegt sich)',this.draft.b,links,v=>{this.draft.b=v;}),
    select('Typ',this.draft.kind,[['revolute','Drehachse'],['prismatic','Linearachse']],v=>{this.draft.kind=v as 'revolute'|'prismatic';}));
   root.append(...this.axisTools());return;
  }
  if(this.item==='bearings'){root.append(...this.bearingsPage(m,{number,select}));return;}
  if(this.item==='structure'){root.append(...this.structurePage(m,{number,select}));return;}
  if(this.item==='drive-new'||this.item.startsWith('drive:')){root.append(...this.drivePage(m,this.item==='drive-new'?undefined:this.item.slice(6),{number,select,frameFields}));return;}
  if(this.item==='parameters'){
   root.append(el('p',{className:'muted',textContent:'Zahl oder Ausdruck aus früheren Parametern, z. B. torHoehe/3. Werte im Dokument können Ausdrücke als {"expr": …} tragen.'}));
   m.parameters.forEach((p,i)=>{const raw=typeof p.value==='number'?String(p.value):(p.value as {expr:string}).expr;root.append(el('div',{className:'param-row'},text(p.id,raw,v=>edit('Parameter geändert',x=>{const n=Number(v);x.parameters[i].value=(v!==''&&Number.isFinite(n)?n:{expr:v}) as number;})),remove('×',x=>{x.parameters.splice(i,1);})));});
   const name=el('input',{type:'text',placeholder:'Name'});const add=el('button',{textContent:'+ Parameter'});add.onclick=()=>{const id=name.value.trim();if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(id)){this.host.status('Parametername: Buchstaben, Ziffern, Unterstrich.');return;}edit('Parameter hinzugefügt',x=>{x.parameters.push({id,value:0});});};
   root.append(el('div',{className:'button-row'},name,add));return;
  }
  if(this.item==='io'){
   const coordinate=(t:Mechanism['input'],write:(t:Mechanism['input'])=>void,label:string)=>{const joint=t.kind==='coordinate'?t.joint:m.joints[0]?.id??'';const j=m.joints.find(x=>x.id===joint);
    return [select(`${label}: Gelenk`,joint,joints,v=>write({kind:'coordinate',joint:v,coordinate:0})),select(`${label}: Koordinate`,String(t.kind==='coordinate'?t.coordinate:0),Array.from({length:Math.max(1,j?jointDofs(j.joint):1)},(_,k)=>[String(k),k===0?'Hauptbewegung':`Koordinate ${k+1}`] as [string,string]),v=>write({kind:'coordinate',joint,coordinate:Number(v) as 0|1|2}))];};
   root.append(...coordinate(m.input,t=>edit('Eingang geändert',x=>{x.input=t;}),'Eingang'),...coordinate(m.output,t=>edit('Ausgang geändert',x=>{x.output=t;}),'Ausgang'),
    heading('Bewegungsbereich des Eingangs'),number('Von',m.range.from,n=>edit('Bereich geändert',x=>{x.range.from=n;})),number('Bis',m.range.to,n=>edit('Bereich geändert',x=>{x.range.to=n;})),number('Stellungen',m.range.samples,n=>edit('Bereich geändert',x=>{x.range.samples=Math.max(1,Math.min(400,Math.round(n)));}),'1'),
    el('p',{className:'muted',textContent:'Drehgelenke in Grad, Schub- und Pfadgelenke in Millimetern. „Bewegung berechnen“ unten löst alle Stellungen.'}));return;
  }
  if(this.item.startsWith('body:')){
   const id=this.item.slice(5),b=m.bodies.find(x=>x.id===id);if(!b){this.item='mechanism';return this.renderProperties(root);}
   const write=(fn:(b:Body)=>void)=>edit('Körper geändert',x=>fn(x.bodies.find(y=>y.id===id)!));
   root.append(el('h3',{textContent:`▭ ${id}`}),...frameFields('Lage',b.frame,f=>write(x=>{x.frame=f;})));
   if(b.display?.kind==='box')root.append(...triple('Anzeigebox [mm]',b.display.size,(i,n)=>write(x=>{if(x.display?.kind==='box')x.display.size[i]=Math.max(.1,n);})));
   root.append(el('p',{className:'muted',textContent:'Die Lage ist nur der Startwert; die Gelenke bestimmen, wo der Körper wirklich steht.'}),
    remove('Körper entfernen',x=>{x.bodies=x.bodies.filter(y=>y.id!==id);x.joints=x.joints.filter(j=>j.a.body!==id&&j.b.body!==id);x.elements=x.elements.filter(e=>e.mounts.every(mt=>mt.body!==id));x.patterns.forEach(p=>{p.source=p.source.filter(s=>s!==id);});}));return;
  }
  if(this.item.startsWith('joint:')){
   const id=this.item.slice(6),j=m.joints.find(x=>x.id===id);if(!j){this.item='mechanism';return this.renderProperties(root);}
   const write=(fn:(j:JointRelation)=>void)=>edit('Gelenk geändert',x=>fn(x.joints.find(y=>y.id===id)!));
   const kinds:[Joint['kind'],string][]=[['fixed','Fest'],['revolute','Drehgelenk / Scharnier'],['prismatic','Schubgelenk'],['cylindrical','Dreh-Schub'],['screw','Schraube / Spindel'],['path','Läufer auf Pfad'],['spherical','Kugelgelenk']];
   root.append(el('h3',{textContent:`⟳ ${id}`}),select('Art',j.joint.kind,kinds,v=>write(x=>{x.joint=defaultJoint(v as Joint['kind']);})),
    select('Körper A (trägt)',j.a.body,bodies,v=>write(x=>{x.a.body=v;})),select('Körper B (bewegt)',j.b.body,bodies,v=>write(x=>{x.b.body=v;})));
   if(j.joint.kind==='screw'){const lead=j.joint.lead;root.append(number('Steigung [mm/U]',lead,n=>write(x=>{if(x.joint.kind==='screw'&&n)x.joint.lead=n;})));}
   if(j.joint.kind==='path'){
    const c=j.joint.curve;
    root.append(heading('Pfad'),number('Eckenradius [mm]',c.cornerRadius,n=>write(x=>{if(x.joint.kind==='path')x.joint.curve.cornerRadius=Math.max(0,n);})),
     select('Rolle',j.joint.roll,[['locked','fest (Schiene)'],['free','frei drehbar (Seil)']],v=>write(x=>{if(x.joint.kind==='path')x.joint.roll=v as 'locked'|'free';})),
     ...triple('Achse der Normalebene',c.axis??[0,0,1],(i,n)=>write(x=>{if(x.joint.kind==='path'){const a=[...(x.joint.curve.axis??[0,0,1])] as V;a[i]=n;x.joint.curve.axis=a;}})));
    const table=el('div',{className:'points'});
    c.points.forEach((p,i)=>{const row=el('div',{className:'triple'});p.forEach((v,k)=>{const input=el('input',{type:'number',step:'1',value:String(v)});input.setAttribute('aria-label',`Punkt ${i+1} ${'XYZ'[k]}`);input.onchange=()=>{const n=Number(input.value);if(Number.isFinite(n))write(x=>{if(x.joint.kind==='path')x.joint.curve.points[i][k]=n;});};row.append(el('label',{},'XYZ'[k],input));});
     const del=el('button',{textContent:'×',title:'Punkt entfernen'});del.disabled=c.points.length<=2;del.onclick=()=>write(x=>{if(x.joint.kind==='path')x.joint.curve.points.splice(i,1);});row.append(del);table.append(row);});
    const addPoint=el('button',{textContent:'+ Punkt'});addPoint.onclick=()=>write(x=>{if(x.joint.kind!=='path')return;const pts=x.joint.curve.points,last=pts[pts.length-1],prev=pts[pts.length-2];pts.push(add(last,[last[0]-prev[0],last[1]-prev[1],last[2]-prev[2]]) as V);});
    root.append(heading('Punkte (im Rahmen von Körper A)'),table,addPoint,el('p',{className:'muted',textContent:'Punkte auch im 3D-Fenster ziehen. Jede Ecke wird mit dem Eckenradius verrundet.'}));
   }
   if(j.joint.kind!=='fixed'&&j.joint.kind!=='spherical'){const unitLabel=j.joint.kind==='revolute'||j.joint.kind==='screw'?'°':'mm',lim=j.limits??(unitLabel==='°'?{min:-180,max:180}:{min:0,max:200});
    root.append(heading(`Bereich [${unitLabel}]`),number('Min',lim.min,n=>write(x=>{x.limits={...(x.limits??lim),min:n};})),number('Max',lim.max,n=>write(x=>{x.limits={...(x.limits??lim),max:n};})));
    if(m.bodies.some(b=>b.display?.kind==='mesh'))root.append(heading('Achse am Modell neu erkennen'),...this.axisTools(id));}
   root.append(...frameFields('Gelenk an A',j.a.local,f=>write(x=>{x.a.local=f;})),...frameFields('Gelenk an B',j.b.local,f=>write(x=>{x.b.local=f;})),
    remove('Gelenk entfernen',x=>{x.joints=x.joints.filter(y=>y.id!==id);x.patterns.forEach(p=>{p.source=p.source.filter(s=>s!==id);});if(x.input.kind==='coordinate'&&x.input.joint===id||x.output.kind==='coordinate'&&x.output.joint===id)throw Error('Gelenk ist Ein- oder Ausgang; zuerst dort ein anderes wählen.');}));
   const addJoint=el('button',{textContent:'+ Gelenk'});addJoint.onclick=()=>{const nid=`gelenk${m.joints.length+1}`;edit('Gelenk hinzugefügt',x=>{x.joints.push({id:nid,joint:{kind:'revolute'},a:{body:'ground',local:identity()},b:{body:x.bodies.find(b=>!b.ground)?.id??'ground',local:identity()}});});this.item=`joint:${nid}`;};
   root.append(addJoint);return;
  }
  if(this.item.startsWith('element:')){
   const id=this.item.slice(8),e=m.elements.find(x=>x.id===id);if(!e){this.item='mechanism';return this.renderProperties(root);}
   const write=(fn:(e:Element)=>void)=>edit('Element geändert',x=>fn(x.elements.find(y=>y.id===id)!));
   const s=e.surfaces[0],p=s?.profile;
   root.append(el('h3',{textContent:`◉ ${id}`}),el('p',{className:'muted',textContent:e.source.kind==='library'?`Kaufteil ${e.source.library} ${e.source.part} – wird nicht gedruckt.`:'Druckteil'}));
   if(s){
    root.append(el('p',{className:'muted',textContent:`Wälzkurve: ${({circle:'Kreis',line:'Gerade',polyline:'Polygon',polar:'unrund (polar)',path:'Pfad'} as Record<string,string>)[s.pitch.kind]} · Profil: ${({involute:'Evolvente',library:'Bibliothek',generated:'erzeugt aus '+(p?.kind==='generated'?p.from.element:''),belt:'Riemen',helical:'Schraube',friction:'Reibung'} as Record<string,string>)[p!.kind]}`}));
    if(s.pitch.kind==='circle'&&p?.kind==='involute'){const z=Math.round(2*s.pitch.r/p.module);
     root.append(number('Zähnezahl',z,n=>write(x=>{const sf=x.surfaces[0];if(sf.pitch.kind==='circle'&&sf.profile.kind==='involute'){sf.pitch.r=sf.profile.module*Math.max(3,Math.round(n))/2;x.envelope.radius=sf.pitch.r+sf.profile.module;}}),'1'),
      number('Modul [mm]',p.module,n=>write(x=>{const sf=x.surfaces[0];if(sf.pitch.kind==='circle'&&sf.profile.kind==='involute'&&n>0){const zz=Math.round(2*sf.pitch.r/sf.profile.module);sf.profile.module=n;sf.pitch.r=n*zz/2;x.envelope.radius=sf.pitch.r+n;}}),'0.1'));}
    root.append(number('Breite [mm]',s.z[1]-s.z[0],n=>write(x=>{if(n>0){const mid=(x.surfaces[0].z[0]+x.surfaces[0].z[1])/2;x.surfaces[0].z=[mid-n/2,mid+n/2];x.envelope.min=mid-n/2;x.envelope.max=mid+n/2;}})));
   }
   root.append(select('Sitzt auf Körper',e.mounts[0].body,bodies,v=>write(x=>{x.mounts[0].body=v;})),...frameFields('Lage auf dem Körper',e.mounts[0].pose,f=>write(x=>{x.mounts[0].pose=f;})));
   if(e.source.kind==='printed'){const make=el('button',{textContent:'STL erzeugen'});make.dataset.generateStl=id;const note=el('p',{className:'muted'});
    make.onclick=()=>{note.textContent='Wird erzeugt …';make.disabled=true;setTimeout(()=>{try{const part=partMesh(this.mechanism()!,id),url=URL.createObjectURL(new Blob([stl(part.mesh,part.name)],{type:'model/stl'})),a=document.createElement('a');a.href=url;a.download=`${entry.label}-${id}.stl`.replace(/\s+/g,'-');a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);note.textContent=`${part.method} · ${part.mesh.triangles.length} Dreiecke · heruntergeladen.`;note.dataset.state='ok';}catch(err){note.textContent='Nicht erzeugbar: '+(err instanceof Error?err.message:err);note.dataset.state='error';}make.disabled=false;},20);};
    root.append(heading('Fertigung'),make,note);}
   root.append(remove('Element entfernen',x=>{x.elements=x.elements.filter(y=>y.id!==id);x.contacts=x.contacts.filter(c=>c.a.element!==id&&c.b.element!==id);}));return;
  }
  if(this.item.startsWith('contact:')){
   const id=this.item.slice(8),c=m.contacts.find(x=>x.id===id);if(!c){this.item='mechanism';return this.renderProperties(root);}
   const write=(fn:(c:Contact)=>void)=>edit('Kontakt geändert',x=>fn(x.contacts.find(y=>y.id===id)!));
   const surfaces=m.elements.flatMap(e=>e.surfaces.map(s=>[`${e.id}/${s.id}`,`${e.id} · ${s.id}`] as [string,string]));
   root.append(el('h3',{textContent:`⚙ ${id}`}),select('Art',c.kind,[['roll','Abrollen (Zahnrad, Rolle)'],['belt','Riemen'],['helical','Schnecke']],v=>write(x=>{x.kind=v as Contact['kind'];})),
    select('Modus',c.mode,[['fixed-axes','feste Achsen'],['follower','Läufer auf Kurve (Ritzel auf Zahnstange)']],v=>write(x=>{x.mode=v as Contact['mode'];})),
    select('Seite A (Rad)',`${c.a.element}/${c.a.surface}`,surfaces,v=>write(x=>{const [element,surface]=v.split('/');x.a={element,surface};})),
    select('Seite B',`${c.b.element}/${c.b.surface}`,surfaces,v=>write(x=>{const [element,surface]=v.split('/');x.b={element,surface};})));
   if(c.mode==='follower')root.append(select('Ritzel liegt',String(c.params.side??1),[['1','auf der linken Seite der Kurve'],['-1','auf der rechten Seite der Kurve']],v=>write(x=>{x.params.side=Number(v) as 1|-1;})));
   root.append(number('Achsabstand [mm] (leer = aus Radien)',c.params.distance??0,n=>write(x=>{if(n>0)x.params.distance=n;else delete x.params.distance;})),
    el('p',{className:'muted',textContent:'Ob die Flächen kämmen, folgt aus dem Bezugsprofil (gleicher Modul und Eingriffswinkel) oder daraus, dass eine aus der anderen erzeugt ist.'}),
    remove('Kontakt entfernen',x=>{x.contacts=x.contacts.filter(y=>y.id!==id);}));return;
  }
  if(this.item.startsWith('pattern:')){
   const i=Number(this.item.slice(8)),p=m.patterns[i];if(!p){this.item='mechanism';return this.renderProperties(root);}
   const write=(fn:(p:Pattern)=>void)=>edit('Muster geändert',x=>fn(x.patterns[i]));
   root.append(el('h3',{textContent:`⟷ Muster ${i+1}`}),select('Art',p.kind,[['mirror','Spiegelung (abgeleitet, nur geprüft)'],['array','Reihe (eigene Gelenke, gelöst)']],v=>edit('Muster geändert',x=>{x.patterns[i]=v==='mirror'?{kind:'mirror',plane:identity(),source:p.source}:{kind:'array',count:2,step:{position:[100,0,0],rotation:[0,0,0,1]},source:p.source};})));
   if(p.kind==='mirror')root.append(...frameFields('Spiegelebene (xy-Ebene des Rahmens)',p.plane,f=>write(x=>{if(x.kind==='mirror')x.plane=f;})));
   else{
    root.append(number('Anzahl (mit Original)',p.count,n=>write(x=>{if(x.kind==='array')x.count=Math.max(2,Math.min(64,Math.round(n)));}),'1'));
    const along='alongJoint' in p.step;
    root.append(select('Versatz',along?'path':'frame',[['frame','fester Versatz'],['path','entlang Pfadgelenk']],v=>write(x=>{if(x.kind!=='array')return;const paths=m.joints.filter(j=>j.joint.kind==='path');x.step=v==='path'&&paths.length?{alongJoint:paths[0].id,offset:-100}:{position:[100,0,0],rotation:[0,0,0,1]};})));
    if('alongJoint' in p.step){const step=p.step;root.append(select('Pfadgelenk',step.alongJoint,m.joints.filter(j=>j.joint.kind==='path').map(j=>[j.id,j.id] as [string,string]),v=>write(x=>{if(x.kind==='array'&&'alongJoint' in x.step)x.step.alongJoint=v;})),number('Abstand entlang Pfad [mm]',step.offset,n=>write(x=>{if(x.kind==='array'&&'alongJoint' in x.step)x.step.offset=n;})));}
    else root.append(...frameFields('Schritt',p.step,f=>write(x=>{if(x.kind==='array')x.step=f;})));
    if(p.chain?.length)root.append(el('p',{className:'muted',textContent:`Verbindet Kopien über ${p.chain.map(c=>`${c.id} (${c.joint.kind})`).join(', ')}.`}));
   }
   const box=el('div',{className:'sources'});
   for(const id of [...m.bodies.filter(b=>!b.ground).map(b=>b.id),...m.joints.map(j=>j.id)]){const c=el('input',{type:'checkbox',checked:p.source.includes(id)});c.onchange=()=>write(x=>{x.source=c.checked?[...x.source,id]:x.source.filter(s=>s!==id);});box.append(el('label',{className:'check'},c,' '+id));}
   root.append(heading('Quelle'),box,remove('Muster entfernen',x=>{x.patterns.splice(i,1);}));
  }
 }
}
const jointName=(k:string)=>({fixed:'fest',revolute:'Drehachse',prismatic:'Linearachse',cylindrical:'Dreh-Schub',screw:'Schraube',path:'Pfad',spherical:'Kugelgelenk'} as Record<string,string>)[k]??k;
function spur(id:string,body:string,module:number,teeth:number,width:number):Element{
 const r=module*teeth/2;return {id,source:{kind:'printed'},surfaces:[{id:'teeth',pitch:{kind:'circle',r},profile:{kind:'involute',module,pressureAngle:20,backlash:.15},z:[-width/2,width/2],side:'external'}],interfaces:[{id:'bore',kind:'bore',diameter:5,z:[-width/2,width/2]}],envelope:{radius:r+module,min:-width/2,max:width/2},mounts:[{interface:'bore',body,pose:identity()}],phase:0};
}
function defaultJoint(kind:Joint['kind']):Joint{
 switch(kind){
  case 'screw':return {kind,lead:8};
  case 'path':return {kind,curve:{kind:'path',points:[[0,0,0],[0,200,0],[200,200,0]],closed:false,cornerRadius:60,axis:[0,0,1]},roll:'locked'};
  default:return {kind} as Joint;
 }
}
export {rotate};
