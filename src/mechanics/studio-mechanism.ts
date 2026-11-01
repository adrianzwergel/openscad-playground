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
import {KinematicsView} from './kinematics-view';
import type {MotionSolution} from './kinematics-view';

type Item='mechanism'|'parameters'|'io'|`body:${string}`|`joint:${string}`|`pattern:${number}`;
export type EditorHost={doc:()=>StudioDocument;change:(edit:()=>void,message:string)=>void;status:(text:string)=>void;leave:()=>void;fit:()=>void};
const el=<K extends keyof HTMLElementTagNameMap>(tag:K,props:Record<string,unknown>={},...children:(Node|string)[]):HTMLElementTagNameMap[K]=>{const e=document.createElement(tag);Object.assign(e,props);e.append(...children);return e;};
const heading=(text:string)=>el('h2',{textContent:text});
const deg=180/Math.PI;

export class MechanismEditor{
 readonly view=new KinematicsView();
 readonly handles=new THREE.Group();
 activeId?:string;private item:Item='mechanism';private fitNext=false;private worker?:Worker;private preview?:MotionSolution;private previewError='';
 constructor(private host:EditorHost){}
 get active(){return !!this.activeId&&!!this.entry();}
 private entry(){return this.host.doc().mechanisms?.find(m=>m.id===this.activeId);}
 mechanism(){return this.entry()?.mechanism;}
 enter(id:string){this.activeId=id;this.item='mechanism';this.fitNext=true;this.refresh();}
 exit(){this.activeId=undefined;this.worker?.terminate();this.worker=undefined;this.view.clear();this.clearHandles();this.preview=undefined;}
 motionSource(){const e=this.entry();return e?{label:e.label,mechanism:e.mechanism}:undefined;}

 // ---------- preview ----------
 refresh(){
  if(!this.active){if(this.activeId)this.exit();return;}
  const m=this.mechanism()!;this.worker?.terminate();const w=new Worker('./mechanics-kinematics-worker.js');this.worker=w;
  w.onmessage=({data})=>{if(this.worker!==w)return;w.terminate();this.worker=undefined;
   if(data.type==='error'){this.previewError=data.message;this.preview=undefined;this.view.clear();this.host.status('Vorschau nicht lösbar: '+data.message);}
   else{this.previewError='';this.preview=data.solution;this.view.show(data.solution);}
   this.drawHandles();this.renderStatus();if(this.fitNext&&this.preview){this.fitNext=false;this.host.fit();}};
  w.postMessage({mechanism:m,range:{from:m.range.from,to:m.range.from,samples:1}});
  this.drawHandles();
 }
 private renderStatus(){const p=document.getElementById('mechanism-preview');if(!p)return;
  if(this.previewError){p.textContent='Vorschau: '+this.previewError;p.dataset.state='error';return;}
  if(!this.preview){p.textContent='Vorschau wird gelöst …';p.dataset.state='loading';return;}
  // A pose that does not close means the geometry contradicts itself (e.g. a link too short for the edited guide).
  const open=this.preview.checks.filter(c=>c.state==='fail'&&(c.id==='closure'||c.id==='mobility'||c.id.startsWith('redundant/')));
  p.dataset.state=open.length?'open':'ok';p.textContent=open.length?`Geht nicht auf · ${open.map(c=>c.message).join(' ')}`:`Vorschau gelöst · ${this.preview.mobility.message}`;}
 private bodyFrame(id:string):Frame{return this.preview?.poses[0].bodies[id]??this.mechanism()?.bodies.find(b=>b.id===id)?.frame??identity();}
 private clearHandles(){for(const c of [...this.handles.children]){this.handles.remove(c);(c as THREE.Mesh).geometry.dispose();((c as THREE.Mesh).material as THREE.Material).dispose();}}
 private drawHandles(){
  this.clearHandles();const m=this.mechanism();if(!m)return;
  for(const j of m.joints){if(j.joint.kind!=='path')continue;const base=compose(this.bodyFrame(j.a.body),j.a.local),selected=this.item===`joint:${j.id}`;
   j.joint.curve.points.forEach((p,i)=>{const world=compose(base,{position:p,rotation:[0,0,0,1]}).position,size=Math.max(6,Math.min(30,j.joint.kind==='path'?j.joint.curve.cornerRadius/8:8));
    const h=new THREE.Mesh(new THREE.SphereGeometry(size,12,8),new THREE.MeshBasicMaterial({color:selected?0xffcc66:0xc98f2e}));h.position.fromArray(world);h.name=`path:${j.id}:${i}`;h.userData.pathPoint={joint:j.id,index:i};this.handles.add(h);});}
 }
 pick(ray:THREE.Raycaster){return ray.intersectObjects(this.handles.children,false)[0]?.object;}
 selectHandle(o:THREE.Object3D){const point=o.userData.pathPoint;if(point){this.item=`joint:${point.joint}`;this.renderProperties();this.drawHandles();}}
 /** Writes a dragged path point back into the document (in the guide's a-side frame). */
 onDrag(o:THREE.Object3D){const point=o.userData.pathPoint,m=this.mechanism();if(!point||!m)return;const j=m.joints.find(x=>x.id===point.joint);if(!j||j.joint.kind!=='path')return;
  const local=compose(inverse(compose(this.bodyFrame(j.a.body),j.a.local)),{position:o.position.toArray() as V,rotation:[0,0,0,1]});j.joint.curve.points[point.index]=local.position.map(n=>Math.round(n*100)/100) as V;}

 // ---------- explorer ----------
 renderTree(root:HTMLElement){
  root.append(el('div',{className:'tree-group',textContent:'Mechanismen'}));
  for(const m of this.host.doc().mechanisms??[]){
   const open=el('button',{textContent:`⚙ ${m.label}`});open.dataset.mechanism=m.id;open.setAttribute('aria-selected',String(this.activeId===m.id&&this.item==='mechanism'));open.onclick=()=>{this.enter(m.id);this.host.leave();};
   root.append(el('div',{className:'tree-row'},open));
   if(this.activeId!==m.id)continue;
   const sub=(label:string,item:Item)=>{const b=el('button',{textContent:label,className:'tree-sub'});b.setAttribute('aria-selected',String(this.item===item));b.onclick=()=>{this.item=item;this.renderProperties();this.drawHandles();this.host.leave();};root.append(el('div',{className:'tree-row'},b));};
   sub('  Parameter','parameters');sub('  Ein-/Ausgang, Bereich','io');
   for(const b of m.mechanism.bodies)if(!b.ground)sub(`  ▭ ${b.id}`,`body:${b.id}`);
   for(const j of m.mechanism.joints)sub(`  ⟳ ${j.id} (${j.joint.kind})`,`joint:${j.id}`);
   m.mechanism.patterns.forEach((p,i)=>sub(`  ⟷ Muster ${i+1} (${p.kind==='mirror'?'Spiegelung':'Reihe'})`,`pattern:${i}`));
  }
  const add=el('div',{className:'mechanism-add'});
  for(const [key,t] of Object.entries(templates)){const b=el('button',{textContent:'+ '+t.label});b.dataset.mechanismTemplate=key;b.onclick=()=>{const id='mech-'+crypto.randomUUID().slice(0,8);this.host.change(()=>{const d=this.host.doc();d.mechanisms=[...(d.mechanisms??[]),{id,label:t.label.replace(' (Vorlage)',''),mechanism:t.build()}];},`${t.label} angelegt`);this.enter(id);this.host.leave();};add.append(b);}
  root.append(add);
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
  root.append(el('h3',{textContent:`⚙ ${entry.label}`}),el('p',{id:'mechanism-preview',className:'muted'}));this.renderStatus();
  const back=el('button',{textContent:'← Zur Getriebe-Baugruppe'});back.onclick=()=>{this.exit();this.host.leave();};

  if(this.item==='mechanism'){
   root.append(text('Name',entry.label,v=>{if(v)this.host.change(()=>{entry.label=v;},'Mechanismus umbenannt');}),
    el('p',{className:'muted',textContent:`${m.bodies.length} Körper · ${m.joints.length} Gelenke · ${m.contacts.length} Kontakte · ${m.patterns.length} Muster. Links Teile wählen; Pfadpunkte im 3D-Fenster ziehen.`}));
   const addBody=el('button',{textContent:'+ Körper'});addBody.onclick=()=>{const id=`koerper${m.bodies.length}`;edit('Körper hinzugefügt',x=>{x.bodies.push({id,frame:identity(),display:{kind:'box',size:[40,40,40]}});x.joints.push({id:`gelenk-${id}`,joint:{kind:'fixed'},a:{body:'ground',local:identity()},b:{body:id,local:identity()}});});this.item=`body:${id}`;};
   const addPattern=el('button',{textContent:'+ Muster'});addPattern.onclick=()=>{edit('Muster hinzugefügt',x=>{x.patterns.push({kind:'mirror',plane:identity(),source:[]});});this.item=`pattern:${m.patterns.length}`;};
   const del=el('button',{textContent:'Mechanismus löschen',className:'danger'});del.onclick=()=>{const id=this.activeId;this.exit();this.host.change(()=>{const d=this.host.doc();d.mechanisms=(d.mechanisms??[]).filter(x=>x.id!==id);},'Mechanismus gelöscht');this.host.leave();};
   root.append(el('div',{className:'button-row'},addBody,addPattern),back,del);return;
  }
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
   if(b.display)root.append(...triple('Anzeigebox [mm]',b.display.size,(i,n)=>write(x=>{x.display!.size[i]=Math.max(.1,n);})));
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
   root.append(...frameFields('Gelenk an A',j.a.local,f=>write(x=>{x.a.local=f;})),...frameFields('Gelenk an B',j.b.local,f=>write(x=>{x.b.local=f;})),
    remove('Gelenk entfernen',x=>{x.joints=x.joints.filter(y=>y.id!==id);x.patterns.forEach(p=>{p.source=p.source.filter(s=>s!==id);});if(x.input.kind==='coordinate'&&x.input.joint===id||x.output.kind==='coordinate'&&x.output.joint===id)throw Error('Gelenk ist Ein- oder Ausgang; zuerst dort ein anderes wählen.');}));
   const addJoint=el('button',{textContent:'+ Gelenk'});addJoint.onclick=()=>{const nid=`gelenk${m.joints.length+1}`;edit('Gelenk hinzugefügt',x=>{x.joints.push({id:nid,joint:{kind:'revolute'},a:{body:'ground',local:identity()},b:{body:x.bodies.find(b=>!b.ground)?.id??'ground',local:identity()}});});this.item=`joint:${nid}`;};
   root.append(addJoint);return;
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
function defaultJoint(kind:Joint['kind']):Joint{
 switch(kind){
  case 'screw':return {kind,lead:8};
  case 'path':return {kind,curve:{kind:'path',points:[[0,0,0],[0,200,0],[200,200,0]],closed:false,cornerRadius:60,axis:[0,0,1]},roll:'locked'};
  default:return {kind} as Joint;
 }
}
export {rotate};
