// Mechanics Studio: one project is one device, shown in one 3D scene. The start page opens projects, templates and
// examples. In a project three phases lead through the work: ① build up (model, links, parts), ② move (axes, drives,
// gear trains), ③ make (bearings, structures, housings). Left: the library of the phase and the scene's tree; right: the
// selection and what is still missing. The editors below (mechanism, build, gear train) do the work.
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {TransformControls} from 'three/addons/controls/TransformControls.js';
import {StudioHistory,importStudio,serializeStudio,parseStudio} from './studio-model';
import type {StudioDocument} from './studio-model';
import {MotionPanel} from './studio-motion';
import {MechanismEditor} from './studio-mechanism';
import type {GripOptions} from './studio-mechanism';
import {BuildEditor} from './studio-build';
import {partSeats,newBuild,newItem} from './parts/build';
import {partById} from './parts/catalog';
import type {Seat} from './kinematics/bearings';
import {ProjectStore} from './project-store';
import type {ProjectView} from './project-store';
import {renderStock} from './studio-catalog';
import {defaultCatalog} from './graph/catalog';
import {demos} from './demos';
import {templates} from './kinematics/templates';

type Phase=1|2|3;
type Scene={kind:'mechanism'|'build';id:string;label:string};
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const el=<K extends keyof HTMLElementTagNameMap>(tag:K,props:Record<string,unknown>={},...children:(Node|string)[]):HTMLElementTagNameMap[K]=>{const e=document.createElement(tag);Object.assign(e,props);e.append(...children);return e;};
/** A new project: empty, with the parts list every project has. */
const fresh=():StudioDocument=>({version:1,assemblies:[],routes:[],builds:[emptyBuild()]});
function emptyBuild(){return {...newBuild('teile-'+crypto.randomUUID().slice(0,8),'Teile'),plates:[]};}
const isEmpty=(b:{items:unknown[];plates:unknown[];train?:{wheels:unknown[]}})=>!b.items.length&&!b.plates.length&&!b.train?.wheels.length;
/** One device: once the project has its mechanism, the parts belong to it (an empty list goes); without one there is
 * always a list to place into. */
function unify(d:StudioDocument){
 const ms=d.mechanisms??[],ids=new Set(ms.map(m=>m.id));for(const b of d.builds??[])if(b.mechanism&&!ids.has(b.mechanism))delete b.mechanism;
 if(ms.length){d.builds=(d.builds??[]).filter(b=>b.mechanism||!isEmpty(b));if(ms.length===1&&!d.builds.some(b=>b.mechanism)){const lone=d.builds.find(b=>!b.mechanism);if(lone)lone.mechanism=ms[0].id;}}
 else if(!d.builds?.length)d.builds=[emptyBuild()];
 return d;}
const phaseNames:Record<Phase,string>={1:'① Aufbauen',2:'② Bewegen',3:'③ Fertigen'};

// ---------- the open project file ----------
// Read before anything else is set up, so the first drawing already shows it. The old single save slot moves into a
// first project once.
const store=await ProjectStore.open();
let firstRun=false,doc=fresh(),loadError='',project={id:'',name:'',readOnly:false},openView:ProjectView|undefined;
const newProjectId=()=>'p-'+crypto.randomUUID().slice(0,8);
{const list=await store.list(),wanted=await store.active().catch(()=>undefined),id=list.find(p=>p.id===wanted)?.id??list[0]?.id;let ready=false;
 if(id)try{const f=await store.read(id);doc=parseStudio(unify(parseStudio(f.doc)));project={id,name:f.name,readOnly:false};openView=f.view;ready=true;}catch(e){loadError=`Projektdatei konnte nicht gelesen werden: ${e}. Die Datei bleibt unverändert.`;}
 if(!ready){try{const saved=localStorage.getItem('mechanics-studio');if(saved&&!list.length)doc=unify(importStudio(saved));}catch(e){loadError=`Gespeichertes Projekt konnte nicht geladen werden: ${e}. Speicher wurde nicht verändert.`;}
  project={id:newProjectId(),name:list.length?`Projekt ${list.length+1}`:'Mein Projekt',readOnly:false};if(!list.length)firstRun=true;await store.write(project.id,{format:'studio-project-1',name:project.name,updated:new Date().toISOString(),doc:parseStudio(doc)});}
 project.readOnly=!await store.claim(project.id);await store.setActive(project.id);}
let history=new StudioHistory(),dragBefore:StudioDocument|undefined,phase:Phase=1,sceneKey='',startOpen=firstRun;
/** A mechanism is being made (a demo, a compiled train, an imported model): the scene follows it once it exists. */
let followMechanism=false;

// ---------- 3D view ----------
const host=$('view'),status=$('status');
const renderer=new THREE.WebGLRenderer({antialias:true});host.appendChild(renderer.domElement);const scene=new THREE.Scene();scene.background=new THREE.Color('#15212b');scene.add(new THREE.HemisphereLight(0xd9efff,0x344454,2));const keyLight=new THREE.DirectionalLight(0xffffff,3);keyLight.position.set(150,250,300);scene.add(keyLight);
const camera=new THREE.PerspectiveCamera(50,1,.1,10000);camera.position.set(280,240,330);const orbit=new OrbitControls(camera,renderer.domElement);orbit.target.set(0,60,0);orbit.update();
const transform=new TransformControls(camera,renderer.domElement);scene.add(transform.getHelper());transform.addEventListener('dragging-changed',e=>{orbit.enabled=!e.value;});
const grid=new THREE.GridHelper(600,30,0x33424e,0x22303a);scene.add(grid);
// Mechanisms and builds are z-up; the y-up view shows them upright.
const mechRoot=new THREE.Group();mechRoot.rotation.x=-Math.PI/2;scene.add(mechRoot);
const motion=new MotionPanel(()=>mech.active?mech.motionSource():undefined,on=>{mech.view.group.visible=!on&&mech.active;},text=>{status.textContent=text;});
const mech:MechanismEditor=new MechanismEditor({doc:()=>doc,change:(edit,message)=>change(edit,message),
 sideProperties:()=>{if(!build.holdsProperties)return false;build.renderProperties();return true;},selectedElsewhere:():boolean=>build.holdsProperties,deselect:()=>build.deselect(),
 extraSeats:():Seat[]=>{const b=doc.builds?.find(x=>x.mechanism===mech.activeId);return b?partSeats(b):[];},
 status:text=>{status.textContent=text;},leave:()=>{motion.close();draw();},fit:()=>fit(),grip:(o,options)=>{if(o)grip(o,options!);else if(transform.object?.userData.motor)transform.detach();},dragging:()=>transform.dragging,free:()=>free});
const build:BuildEditor=new BuildEditor({doc:()=>doc,change:(edit,message)=>change(edit,message),status:text=>{status.textContent=text;},leave:()=>{motion.close();draw();},fit:()=>fit(),canvas:()=>renderer.domElement,ray:e=>hits(e as MouseEvent),orbit:on=>{orbit.enabled=on;},
 frames:()=>mech.active?mech.framesNow():{},surface:ray=>mech.active?mech.surfaceAt(ray):undefined,model:()=>mech.active?mech.clashContext():undefined,range:()=>mech.posesOverRange(),
 grip:(o,options)=>{if(o)grip(o,options!);else if(transform.object?.userData.buildGizmo)transform.detach();},dragging:()=>transform.dragging,
 adopt:(d,consume)=>void adoptModel(()=>mech.addDemo(d,consume?x=>{for(const b of x.builds??[])if(!b.mechanism)delete b.train;}:undefined),2),phase:()=>phase,loadModel:()=>modelFile.click()});
mechRoot.add(mech.view.group,mech.handles,motion.view.group,build.group);
// The gizmo on a handle: mode, steps (Alt held: none) and axes as the handle asks.
let steps:{step:number;angle:number}={step:0,angle:0},free=false;
function snaps(){transform.setTranslationSnap(!free&&steps.step?steps.step:null);transform.setRotationSnap(!free&&steps.angle?steps.angle*Math.PI/180:null);}
function grip(o:THREE.Object3D,options:GripOptions){setMode(options.mode);transform.setSpace(options.space);steps={step:options.step,angle:options.angle};snaps();if(transform.object!==o)transform.attach(o);}
function setMode(mode:'translate'|'rotate'){transform.setMode(mode);for(const [id,m] of [['move','translate'],['rotate','rotate']])$(id).setAttribute('aria-pressed',String(mode===m));}
window.addEventListener('keydown',e=>{if(e.key==='Alt'&&!free){free=true;snaps();e.preventDefault();}});window.addEventListener('keyup',e=>{if(e.key==='Alt'){free=false;snaps();}});window.addEventListener('blur',()=>{free=false;snaps();});
// Test and script entries: a point of the scene on the page; where the first part on a link stands; pick a model part.
(window as unknown as {studioScreen:(p:[number,number,number])=>[number,number]}).studioScreen=p=>{mechRoot.updateMatrixWorld(true);const v=mechRoot.localToWorld(new THREE.Vector3(...p)).project(camera),r=renderer.domElement.getBoundingClientRect();return [r.left+(v.x+1)/2*r.width,r.top+(1-v.y)/2*r.height];};
(window as unknown as {studioPart:()=>number[]|undefined}).studioPart=()=>build.followerAt();
// Test entry: the document as the old save slot held it (checks read it from there).
(window as unknown as {studioSave:()=>void}).studioSave=()=>localStorage.setItem('mechanics-studio',serializeStudio(doc));
window.addEventListener('studio-pick',e=>{const d=(e as CustomEvent).detail;if(!mech.pickByName(d.part,d.local))status.textContent='Teil nicht gefunden: '+d.part;});
const ray=new THREE.Raycaster();ray.params.Line={threshold:4};function hits(e:MouseEvent){const r=renderer.domElement.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);return ray;}
renderer.domElement.addEventListener('pointerdown',e=>{if(e.button!==0||transform.dragging||transform.axis)return;const s=current();if(!s)return;
 if(s.kind!=='mechanism'){build.pointerDown(e,hits(e));return;}
 if(build.pointerDown(e,hits(e)))return;const h=mech.click(hits(e));if(h){grip(h,mech.handleOptions(h));mech.selectHandle(h);}else transform.detach();});
renderer.domElement.addEventListener('pointermove',e=>{if(transform.dragging)return;const s=current();renderer.domElement.style.cursor=(s&&(build.hover(hits(e))||s.kind==='mechanism'&&mech.hover(hits(e))))?'pointer':'default';});
function fit(){const bounds=new THREE.Box3();scene.updateMatrixWorld(true);for(const g of [mech.view.group,motion.view.group,mech.handles,build.group])if(g.visible&&g.children.length)bounds.union(new THREE.Box3().setFromObject(g));if(bounds.isEmpty())return;const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3()).length();orbit.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(.75,.6,.95).normalize().multiplyScalar(Math.max(80,size*1.25)));camera.near=Math.max(.1,size/500);camera.far=size*50+1000;camera.updateProjectionMatrix();orbit.update();}
$('fit').onclick=fit;
for(const [id,mode] of [['move','translate'],['rotate','rotate']] as const)$(id).onclick=()=>{if(transform.object?.userData.motor){mech.gripMode(mode);return;}setMode(mode);};
new ResizeObserver(()=>{const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();}).observe(host);
renderer.setAnimationLoop(()=>{build.follow();catchUp();$('gizmo-tools').hidden=!transform.object;renderer.render(scene,camera);});

// ---------- changes and history ----------
function syncHistory(){($('undo') as HTMLButtonElement).disabled=!history.canUndo;($('redo') as HTMLButtonElement).disabled=!history.canRedo;}
function change(edit:()=>void,message:string){const before=structuredClone(doc);try{motion.close();edit();doc=parseStudio(unify(doc));history.record(before,doc);draw();status.textContent=message;}catch(e){doc=before;draw();status.textContent=String(e);}}
transform.addEventListener('mouseDown',()=>{dragBefore=structuredClone(doc);motion.close();});
transform.addEventListener('objectChange',()=>{const o=transform.object;if(!o||!dragBefore)return;if(o.userData.buildGizmo){build.onDrag();return;}if(mech.active)mech.onDrag(o);});
function finishDrag(cancel=false){if(!dragBefore)return;const before=dragBefore;dragBefore=undefined;let failed=false;try{if(cancel)doc=before;else{doc=parseStudio(doc);history.record(before,doc);}}catch(e){doc=before;failed=true;status.textContent=String(e);}draw();if(mech.active)mech.dragEnd(cancel||failed);}
transform.addEventListener('mouseUp',()=>finishDrag());
function travelHistory(redo=false){finishDrag();motion.close();doc=redo?history.redo(doc):history.undo(doc);draw();status.textContent=redo?'Wiederhergestellt':'Rückgängig';}
$('undo').onclick=()=>travelHistory();$('redo').onclick=()=>travelHistory(true);
window.addEventListener('keydown',e=>{if(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement||e.target instanceof HTMLSelectElement)return;if(current()&&!e.ctrlKey&&!e.metaKey&&build.key(e)){e.preventDefault();return;}if(e.key==='Escape'){finishDrag(true);return;}if((e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();travelHistory(e.shiftKey||e.key.toLowerCase()==='y');}});

// ---------- scenes and phases ----------
/** What a project can show: its mechanisms, and builds and gear trains that stand alone. */
function scenes():Scene[]{return [...(doc.mechanisms??[]).map(m=>({kind:'mechanism' as const,id:m.id,label:m.label})),...(doc.builds??[]).filter(b=>!b.mechanism).map(b=>({kind:'build' as const,id:b.id,label:b.label}))];}
const keyOf=(s:Scene)=>`${s.kind}:${s.id}`;
function current():Scene|undefined{const all=scenes();return all.find(s=>keyOf(s)===sceneKey)??all[0];}
/** Every project has all three phases; what a phase has nothing for says so in the tree. */
const phasesOf=(_s:Scene):Phase[]=>[1,2,3];
function enterScene(s:Scene){if(s.kind==='mechanism'){if(build.activeId)build.exit();if(mech.activeId!==s.id)mech.enter(s.id);}else{if(mech.activeId)mech.exit();if(build.activeId!==s.id)build.enter(s.id);}}
function setPhase(p:Phase){const s=current();if(!s)return;phase=phasesOf(s).includes(p)?p:phasesOf(s)[0];build.deselect();
 if(s.kind==='mechanism'){enterScene(s);mech.open(mech.defaultPage(phase));return;}const b=doc.builds?.find(x=>x.id===s.id);if(phase===3&&b?.plates[0]&&!b.items.some(i=>i.free))build.selectPlate(b.plates[0].id);else if(phase===2&&b?.train?.wheels.length)build.openTrain();else build.overview();draw();}
function openScene(s:Scene,p?:Phase){sceneKey=keyOf(s);startOpen=false;enterScene(s);setPhase(p??1);}
for(const b of document.querySelectorAll<HTMLButtonElement>('#phases [data-phase]'))b.onclick=()=>setPhase(Number(b.dataset.phase) as Phase);

function draw(){drawView();persist();}
function drawView(){
 if(followMechanism&&mech.activeId){const m=scenes().find(x=>x.kind==='mechanism'&&x.id===mech.activeId);if(m){sceneKey=keyOf(m);followMechanism=false;}}
 const s=current();document.body.dataset.view=!s||startOpen?'start':'project';
 if(!s){mech.exit();build.exit();transform.detach();}
 if(!s||startOpen){renderStart();renderHeader(s);syncHistory();return;}
 enterScene(s);if(!phasesOf(s).includes(phase))phase=phasesOf(s)[0];document.body.dataset.scene=s.kind;document.body.dataset.phase=String(phase);
 mech.view.group.visible=s.kind==='mechanism'&&!motion.active;build.attach(s.kind==='mechanism'?s.id:undefined);build.group.visible=true;
 if(s.kind==='mechanism'){mech.refresh();mech.renderAxes($('axes'));}build.refresh();
 $('view-hint').textContent=phase===1?`Aus der Bibliothek in die Ansicht ziehen · Zahnräder rasten im Achsabstand ein · R dreht · Entf löscht · Alt: ohne Einrasten${s.kind==='mechanism'?' · Modellteile anklicken, um sie einem Glied zuzuweisen':''}`:`Linke Maus dreht · rechte Maus verschiebt · Mausrad zoomt${s.kind==='mechanism'?' · Regler unten bewegen die Achsen':''}`;
 renderHeader(s);renderLeft(s);renderRight(s);syncHistory();
}
function renderHeader(s:Scene|undefined){
 $('project-name').textContent=project.name;document.title=`${project.name} · Mechanics Studio`;
 for(const b of document.querySelectorAll<HTMLButtonElement>('#phases [data-phase]')){const p=Number(b.dataset.phase) as Phase,has=!!s&&!startOpen&&phasesOf(s).includes(p);b.disabled=!has;b.setAttribute('aria-pressed',String(has&&p===phase));}
 $('projects').setAttribute('aria-pressed',String(!s||startOpen));
}
function renderLeft(s:Scene){
 const lib=$('library'),tree=$('tree');lib.replaceChildren();tree.replaceChildren();
 const all=scenes();if(all.length>1){const row=el('div',{className:'scene-switch'});for(const x of all){const b=el('button',{textContent:(x.kind==='mechanism'?'⚙ ':'▦ ')+x.label});b.dataset.sceneSwitch=keyOf(x);b.setAttribute('aria-pressed',String(keyOf(x)===keyOf(s)));b.onclick=()=>openScene(x,x.kind===s.kind?phase:undefined);row.append(b);}tree.append(row);}
 let title='';
 if(phase===1){title='Bibliothek';build.renderStore(lib);}
 else if(phase===2&&s.kind==='mechanism'){title='Bestand für die Getriebesuche';lib.append(stockBox());renderCatalog();}
 $('library-box').hidden=!title;$('library-title').textContent=title;
 if(s.kind==='mechanism')mech.renderScene(tree,phase);build.renderPlaced(tree,phase);
}
function renderRight(s:Scene){
 if(s.kind==='mechanism'){if(build.holdsProperties)build.renderProperties();else mech.renderProperties();}else build.renderProperties();
 const box=$('todo'),items=[...(s.kind==='mechanism'?mech.todo().map(t=>({...t,go:()=>{phase=t.phase;mech.open(t.item);}})):[]),...build.todo().map(t=>({...t,phase:t.phase as Phase,go:()=>{phase=t.phase as Phase;build.deselect();t.open();draw();}}))];box.replaceChildren();$('todo-box').hidden=!items.length;
 const next=items.find(t=>!t.done);
 for(const t of items){const li=el('li',{});li.dataset.state=t.done?'done':t===next?'current':'open';const b=el('button',{textContent:`${t.done?'✓':phaseNames[t.phase].slice(0,1)} ${t.label}`});b.dataset.todo=t.label;b.onclick=()=>{t.go();};li.append(b);if(t===next)li.append(el('p',{textContent:t.hint}));box.append(li);}
 if(!next&&items.length)box.append(el('p',{className:'state-pass',textContent:'✓ Alles erledigt.'}));
}
// The search's stock: what the gear search may use (phase ②).
function stockBox(){return el('div',{id:'stock'},el('p',{className:'muted',textContent:'Die Getriebesuche nutzt nur freigegebene Teile. Mit „Nur Bestand“ nur, was du hier hinzufügst.'}),el('input',{id:'catalog-filter',type:'search',placeholder:'Teil suchen'}),el('label',{className:'check'},el('input',{id:'catalog-whitelist',type:'checkbox'}),'Nur Bestand verwenden'),el('div',{id:'catalog-cart'}),el('button',{id:'catalog-clear-filters',textContent:'Alles freigeben'}),el('p',{id:'search-types',className:'muted'}),el('div',{id:'catalog-items'}));}
function renderCatalog(){if(!$('catalog-items'))return;$('catalog-filter').oninput=renderCatalog;renderStock(doc.catalog??defaultCatalog(),{},undefined,edit=>change(()=>{doc.catalog??=defaultCatalog();edit(doc.catalog);},'Bestand aktualisiert: Die nächste Getriebesuche nutzt ihn.'));}

// ---------- start page ----------
const generic=(name:string)=>/^(Mein Projekt|Projekt \d+|Neues Projekt( \d+)?)$/.test(name);
const projectEmpty=()=>!doc.mechanisms?.length&&(doc.builds??[]).every(isEmpty);
/** New content for the open project if it is still empty (it takes the name, if it has none of its own), else a new
 * project. `here`: always the open one. */
async function intoProject(label:string,here=false){if(!project.id||!here&&!projectEmpty()){await createProject(label);}else if(project.name!==label&&generic(project.name)){project.name=label;savedState='';}}
async function adoptModel(make:()=>Promise<void>,p:Phase=1){followMechanism=true;await make();followMechanism=false;const s=scenes().find(x=>x.kind==='mechanism'&&x.id===mech.activeId);if(s)openScene(s,p);}
async function startWith(label:string,content:(d:StudioDocument)=>Scene|Promise<Scene|void>|void,p:Phase=1){await intoProject(label);let made:Scene|void=undefined;const before=structuredClone(doc);try{made=await content(doc);doc=parseStudio(unify(doc));history.record(before,doc);}catch(e){doc=before;status.textContent=String(e);}const s=(made&&scenes().find(x=>keyOf(x)===keyOf(made as Scene)))??scenes().at(-1);if(s)openScene(s,p);else draw();void renderProjects();}
const modelFile=el('input',{type:'file',accept:'.stl,.obj,.glb,.gltf',multiple:true,hidden:true});modelFile.id='model-file';document.body.append(modelFile);
// Into the open project: the library offers it only while the project has no mechanism.
modelFile.onchange=async()=>{const files=[...(modelFile.files??[])];modelFile.value='';if(!files.length)return;await intoProject(files[0].name.replace(/\.(stl|obj|glb|gltf)$/i,''),true);await adoptModel(()=>mech.importFiles(files),1);void renderProjects();};
function renderStart(){
 const root=$('start');root.replaceChildren();
 const card=(title:string,text:string,data:Record<string,string>,go:()=>void)=>{const b=el('button',{className:'start-card'},el('strong',{textContent:title}),el('small',{textContent:text}));Object.assign(b.dataset,data);b.onclick=go;return b;};
 /** The project's parts list (an empty project has one). */
 const partsOf=(d:StudioDocument):Scene=>{let x=d.builds?.find(y=>!y.mechanism);if(!x){x=emptyBuild();d.builds=[...(d.builds??[]),x];}return {kind:'build',id:x.id,label:x.label};};
 root.append(el('h1',{textContent:'Mechanics Studio'}),el('p',{className:'muted',textContent:'Ein Projekt ist ein Gerät. Jedes beginnt gleich: leer, mit derselben Bibliothek für 3D-Modell, Bodenplatten, Elektronik, Motoren und Zahnräder.'}),
  el('div',{className:'start-grid'},
   card('＋ Neues Projekt','Leer. Aus der Bibliothek holen, was das Gerät braucht.',{newProject:'true'},()=>void (async()=>{if(!projectEmpty()||!generic(project.name))await createProject('Neues Projekt');startOpen=false;const s=current();if(s)openScene(s,1);else draw();void renderProjects();})())),
  el('h2',{textContent:'Beispiele'}),el('p',{className:'muted',textContent:'Fertige Projekte zum Ansehen und Ändern: Jedes wird ein eigenes Projekt.'}),el('div',{className:'start-grid'},
   ...([['robot','Roboterarm','Drei Drehachsen mit NEMA-Motoren.'],['cnc','CNC-Portal','Drei Linearachsen mit Spindeln.'],['sled','Schlitten auf Wellenbahn','Ein Wagen auf einer gebogenen Bahn.'],['hand','Handgetriebe (LEGO)','z16 → z40 in Gleitlagern, von Hand gedreht.'],['planet','Planetengetriebe (LEGO)','Sonne z16, drei z40, Hohlrad gedruckt, 1 : 7.'],['planet16','Planetengetriebe 4 × LEGO z16','Hohlrad z48, 1 : 4.']] as const).map(([key,title,text])=>card(title,text,{demo:key},()=>void startWith(title,async()=>{followMechanism=true;await mech.addDemo(demos[key]());followMechanism=false;return scenes().find(x=>x.kind==='mechanism'&&x.id===mech.activeId);}))),
   card('Arduino Uno im Gehäuse','Eine Platine auf einer Platte, das Gehäuse folgt aus ihren Steckern.',{example:'case'},()=>void startWith('Arduino Uno im Gehäuse',d=>{const s=partsOf(d),b=d.builds!.find(x=>x.id===s.id)!,plate=newBuild('','').plates[0];b.plates.push(plate);b.items.push({...newItem('uno',partById('arduinouno3')!,[0,0]),plate:plate.id});return s;},3)),
   ...Object.entries(templates).map(([key,t])=>card(t.label.replace(' (Vorlage)',''),'Kinematik-Beispiel: Körper, Gelenke und Kontakte.',{mechanismTemplate:key},()=>void startWith(t.label.replace(' (Vorlage)',''),d=>{const id='mech-'+crypto.randomUUID().slice(0,8),label=t.label.replace(' (Vorlage)','');d.mechanisms=[...(d.mechanisms??[]),{id,label,mechanism:t.build()}];return {kind:'mechanism',id,label};})))),
  el('h2',{textContent:'Deine Projekte'}));
 const list=el('div',{className:'project-list',id:'project-list'});root.append(list);void store.settled().catch(()=>{}).then(()=>store.list()).then(all=>{list.replaceChildren(...all.map(p=>{const open=el('button',{className:'project-open',textContent:p.id===project.id?project.name:p.name});open.dataset.openProject=p.id;open.setAttribute('aria-current',String(p.id===project.id));open.onclick=()=>void switchProject(p.id).then(()=>{startOpen=false;draw();});return el('div',{className:'project-row'},open,el('small',{textContent:p.updated?new Date(p.updated).toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'}):''}));}));});
 if(current()){const back=el('button',{textContent:`← Zurück zu „${project.name}“`,className:'primary'});back.dataset.backToProject='true';back.onclick=()=>{startOpen=false;draw();};root.prepend(back);}
}
$('projects').onclick=()=>{startOpen=!startOpen||!current();finishDrag();draw();};

// ---------- project files ----------
// Every change lands in the open file a moment later; switching saves first. Undo belongs to the open file.
const saveState=$('save-state');
let saveTimer:ReturnType<typeof setTimeout>|undefined,savedState='';
const projectView=():ProjectView=>({...(current()?{scene:keyOf(current()!)}:{}),phase});
const fileState=()=>serializeStudio(doc)+JSON.stringify(projectView())+project.name;
// At most 0.3 s after a change: drawing goes on while a preview solves, so waiting for quiet could wait forever.
let lastSave=-Infinity,pending=false;
// A save goes out at once, or at most 0.3 s after the last one: by timer, by the next change, or by the drawing loop
// (timers can stall in a page that is still starting).
function persist(){if(performance.now()-lastSave>300){void saveNow();return;}pending=true;saveTimer??=setTimeout(()=>void saveNow(),300);}
const catchUp=()=>{if(pending&&performance.now()-lastSave>300)void saveNow();};
async function saveNow(){clearTimeout(saveTimer);saveTimer=undefined;pending=false;lastSave=performance.now();if(project.readOnly||dragBefore)return;let state:string;try{state=fileState();}catch{return;}if(state===savedState)return;savedState=state;saveState.textContent='Speichert …';
 try{await store.write(project.id,{format:'studio-project-1',name:project.name,updated:new Date().toISOString(),doc:parseStudio(doc),view:projectView()});saveState.textContent=store.persistent?'Gespeichert':'Nur im Speicher: dieser Browser hat kein Dateisystem';}catch(e){savedState='';saveState.textContent=`Nicht gespeichert: ${e}`;}}
async function renderProjects(){if(document.body.dataset.view==='start')renderStart();renderHeader(current());}
function restoreView(v:ProjectView|undefined){const s=scenes().find(x=>keyOf(x)===v?.scene)??(v?.mechanism?scenes().find(x=>x.kind==='mechanism'&&x.id===v.mechanism):v?.build?scenes().find(x=>x.id===v.build):undefined);if(s)sceneKey=keyOf(s);phase=(v?.phase as Phase)??1;const c=current();if(c){enterScene(c);if(c.kind==='mechanism')mech.open(mech.defaultPage(phasesOf(c).includes(phase)?phase:1));}}
async function switchProject(id:string){
 finishDrag();await saveNow();await store.settled().catch(()=>{});
 let f;try{f=await store.read(id);f={...f,doc:parseStudio(unify(parseStudio(f.doc)))};}catch(e){status.textContent=`Projekt konnte nicht geöffnet werden: ${e}`;return;}
 const free=await store.claim(id);motion.close();mech.exit();build.exit();history=new StudioHistory();doc=f.doc;project={id,name:f.name,readOnly:!free};sceneKey='';phase=1;await store.setActive(id);restoreView(f.view);drawView();syncHistory();savedState=fileState();saveState.textContent=free?'Gespeichert':'Nur Ansicht';await renderProjects();status.textContent=free?`Projekt ${f.name} geöffnet.`:`${f.name} ist in einem anderen Tab offen: Änderungen hier werden nicht gespeichert.`;
}
async function createProject(name:string,content=fresh()){const id=newProjectId();await store.write(id,{format:'studio-project-1',name,updated:new Date().toISOString(),doc:parseStudio(content)});await switchProject(id);}
$('project-rename').onclick=()=>{($('menu') as HTMLDetailsElement).open=false;const name=prompt('Neuer Name',project.name)?.trim();if(!name||name===project.name)return;project.name=name;savedState='';void saveNow().then(renderProjects);};
$('project-delete').onclick=()=>{($('menu') as HTMLDetailsElement).open=false;if(!confirm(`Projekt „${project.name}“ endgültig löschen?`))return;void (async()=>{const gone=project.id;savedState=fileState();await store.remove(gone);const rest=(await store.list()).filter(p=>p.id!==gone);if(rest[0])await switchProject(rest[0].id);else await createProject('Mein Projekt');startOpen=true;draw();})();};
$('export').onclick=()=>{($('menu') as HTMLDetailsElement).open=false;try{finishDrag();const url=URL.createObjectURL(new Blob([serializeStudio(doc)],{type:'application/json'})),a=el('a',{href:url,download:`${project.name.replace(/[^\wäöüÄÖÜß-]+/g,'_')}.json`});a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='Projekt als Datei exportiert.';}catch(e){status.textContent=String(e);}};
const importFile=$('import-file') as HTMLInputElement;
$('import').onclick=()=>{($('menu') as HTMLDetailsElement).open=false;finishDrag();importFile.click();};
importFile.onchange=async()=>{const chosen=importFile.files?.[0];importFile.value='';if(!chosen)return;try{if(chosen.size>2000000)throw Error('Projekt zu groß (max. 2 MB)');const imported=importStudio(await chosen.text());await createProject(chosen.name.replace(/\.json$/i,''),imported);startOpen=false;draw();status.textContent='Projekt importiert.';}catch(e){status.textContent=`Import abgelehnt: ${e}`;}};
window.addEventListener('pagehide',()=>{try{if(!project.readOnly&&fileState()!==savedState)store.stash(project.id,{format:'studio-project-1',name:project.name,updated:new Date().toISOString(),doc:parseStudio(doc),view:projectView()});}catch{/* nothing to keep */}void saveNow();});

restoreView(openView);draw();savedState=fileState();saveState.textContent=project.readOnly?'Nur Ansicht':'Gespeichert';
if(project.readOnly)status.textContent=`${project.name} ist in einem anderen Tab offen: Änderungen hier werden nicht gespeichert.`;if(loadError)status.textContent=loadError;
if(new URLSearchParams(location.search).has('tour')){const s=document.createElement('script');s.src='./tour.js';document.body.append(s);}
