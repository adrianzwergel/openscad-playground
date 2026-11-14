// The gearbox generator's page: gearboxes as files of their own (OPFS folder `getriebe`), their shafts linked to the
// shaft generator's files (folder `wellen`, read again whenever the page gets the focus back). The editor places shafts,
// layers, webs and belts; undo per open gearbox, saved a moment after a change.
import {ProjectStore} from '../mechanics/project-store.ts';
import {parseShaft} from '../shaft/model.ts';
import {newGear,parseGear} from './model.ts';
import type {GearDoc} from './model.ts';
import {planGear} from './plan.ts';
import type {GearPlan,ShaftFile} from './plan.ts';
import {gearExamples} from './examples.ts';
import {GearEditor} from './editor.ts';

const FORMAT='gear-1',SHAFT='shaft-1';
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const el=<K extends keyof HTMLElementTagNameMap>(tag:K,props:Record<string,unknown>={},...children:(Node|string)[]):HTMLElementTagNameMap[K]=>{const e=document.createElement(tag);Object.assign(e,props);e.append(...children);return e;};
const n=(x:number)=>String(+x.toFixed(3)).replace('.',',');

const store=await ProjectStore.open('getriebe',FORMAT),shaftStore=await ProjectStore.open('wellen',SHAFT);
let open:{id:string;name:string;doc:GearDoc;readOnly:boolean}|undefined,files:Record<string,ShaftFile>={},names:{id:string;name:string}[]=[],plan:GearPlan|undefined;
let saveTimer:ReturnType<typeof setTimeout>|undefined,past:string[]=[],future:string[]=[],before:string|undefined;
const status=(m:string)=>{$('status').textContent=m;};
const editor=new GearEditor({
 doc:()=>open!.doc,plan:()=>planGear(open!.doc,files),files:()=>files,fileNames:()=>names,readOnly:()=>!!open?.readOnly,
 begin:()=>{before??=JSON.stringify(open!.doc);},
 commit:m=>{if(before!==undefined&&before!==JSON.stringify(open!.doc)){past.push(before);if(past.length>200)past.shift();future=[];save();}before=undefined;if(m)status(m);draw();},
 live:()=>draw(),
},status);

/** The shaft generator's files, read fresh: a gearbox follows its shafts. */
async function loadShafts(){const out:Record<string,ShaftFile>={},list=await shaftStore.list();for(const e of list){try{const f=await shaftStore.read(e.id);out[e.id]={name:f.name,doc:parseShaft(f.doc)};}catch{/* a broken file shows as missing */}}files=out;names=list.filter(e=>out[e.id]).map(e=>({id:e.id,name:out[e.id].name}));}
async function list(){const all=await store.list(),root=$('gear-list');root.replaceChildren(...all.map(f=>{const b=el('button',{className:'shaft-open',textContent:f.name});b.dataset.openGear=f.id;b.setAttribute('aria-current',String(f.id===open?.id));b.onclick=()=>void openGear(f.id);return b;}));if(!all.length)root.append(el('p',{className:'muted',textContent:'Noch keine Getriebe.'}));}
async function create(name:string,doc:GearDoc){const id=crypto.randomUUID().slice(0,12);await store.write(id,{format:FORMAT,name,updated:new Date().toISOString(),doc:parseGear(doc)});await openGear(id);}
async function openGear(id:string){await flush();let f;try{f=await store.read(id);}catch(e){status(`Getriebe konnte nicht geöffnet werden: ${e}`);return;}
 const free=await store.claim(id);await loadShafts();open={id,name:f.name,doc:parseGear(f.doc),readOnly:!free};past=[];future=[];editor.sel=undefined;editor.layer=0;await store.setActive(id);
 $('save-state').textContent=free?'Gespeichert':'Nur Ansicht';status(`${f.name} geöffnet.`);draw();void list();}
/** An example writes its shafts into the shaft generator first, then the gearbox linking to them. */
async function fromExample(key:string){const x=gearExamples.find(e=>e.key===key)!,ids:Record<string,string>={};
 for(const s of x.shafts){const id=crypto.randomUUID().slice(0,12);ids[s.key]=id;await shaftStore.write(id,{format:SHAFT,name:s.name,updated:new Date().toISOString(),doc:parseShaft(s.doc)});}
 await shaftStore.settled();await create(x.title,x.make(ids));}
function save(){if(!open||open.readOnly)return;clearTimeout(saveTimer);$('save-state').textContent='Speichert …';saveTimer=setTimeout(()=>void flush(),300);}
async function flush(){if(saveTimer===undefined||!open)return;clearTimeout(saveTimer);saveTimer=undefined;const o=open;try{await store.write(o.id,{format:FORMAT,name:o.name,updated:new Date().toISOString(),doc:o.doc});$('save-state').textContent='Gespeichert';}catch(e){$('save-state').textContent=`Nicht gespeichert: ${e}`;}}
function undo(back:boolean){if(!open||open.readOnly)return;const from=back?past:future,to=back?future:past,state=from.pop();if(state===undefined)return;to.push(JSON.stringify(open.doc));open.doc=parseGear(JSON.parse(state));editor.sel=undefined;save();draw();status(back?'Rückgängig':'Wiederholt');}

function draw(){
 document.body.dataset.view=open?'gear':'start';$('gear-name').textContent=open?.name??'';($('undo') as HTMLButtonElement).disabled=!past.length;($('redo') as HTMLButtonElement).disabled=!future.length;if(!open)return;
 const p=plan=planGear(open.doc,files);editor.layer=Math.min(editor.layer,Math.max(0,p.layers.length-1));
 editor.renderLibrary($('library'));
 $('layer-tabs').replaceChildren(...p.layers.map((l,i)=>{const b=el('button',{className:'ghost',textContent:`Schicht ${i+1} · ${n(l.z0)} bis ${n(l.z1)} mm`});b.dataset.layer=String(i);b.setAttribute('aria-pressed',String(i===editor.layer));b.onclick=()=>{editor.layer=i;editor.sel={kind:'layer',index:i};draw();};return b;}));
 editor.renderTop($('top'));editor.renderLayers($('side'));editor.renderProperties($('properties'));
 $('drives').replaceChildren(...p.meshes.map(m=>{const a=p.wheels.find(w=>w.key===m.a)!,b=p.wheels.find(w=>w.key===m.b)!;return el('li',{},`${a.label} kämmt mit ${b.label} (${a.teeth} : ${b.teeth})`);}),...p.belts.map(bt=>el('li',{},`Riemen ${n(bt.length)} mm${bt.stock?`, Normlänge ${bt.stock} mm`:''}`)),
  ...open.doc.shafts.filter(s=>p.rates[s.id]!==undefined).map(s=>el('li',{className:'muted'},`${p.shafts.find(x=>x.id===s.id)?.label}: ${n(p.rates[s.id])} U je Umdrehung des Eingangs`)));
 const counts=['fehler','warnung'].map(l=>p.issues.filter(i=>i.level===l).length);$('issues-title').textContent=counts[0]?`Meldungen · ${counts[0]} Fehler`:counts[1]?`Meldungen · ${counts[1]} ${counts[1]===1?'Warnung':'Warnungen'}`:'Meldungen · alles passt';
 $('issues').replaceChildren(...p.issues.map(i=>{const li=el('li',{className:i.level,textContent:i.message});li.dataset.level=i.level;const r=i.ref;if(r){li.classList.add('link');li.onclick=()=>{if(r.startsWith('steg:')){const [a,b]=r.slice(5).split('|');editor.sel={kind:'web',a,b};}else if(open!.doc.shafts.some(s=>s.id===r))editor.sel={kind:'shaft',id:r};draw();};}return li;}));}

$('new-gear').onclick=()=>void create('Neues Getriebe',newGear());
$('examples').replaceChildren(...gearExamples.map(x=>{const b=el('button',{className:'start-card'},el('strong',{textContent:x.title}),el('small',{textContent:x.text}));b.dataset.example=x.key;b.onclick=()=>void fromExample(x.key);return b;}));
$('gear-close').onclick=()=>void flush().then(()=>{open=undefined;draw();void list();});
$('gear-rename').onclick=()=>{if(!open)return;const name=prompt('Neuer Name',open.name)?.trim();if(!name)return;open.name=name;save();draw();void list();};
$('gear-delete').onclick=()=>{if(!open||!confirm(`Getriebe „${open.name}“ löschen? Die Wellen bleiben im Wellen-Generator.`))return;const id=open.id;clearTimeout(saveTimer);saveTimer=undefined;open=undefined;void store.remove(id).then(()=>{draw();void list();});};
$('undo').onclick=()=>undo(true);$('redo').onclick=()=>undo(false);
addEventListener('keydown',e=>{if(!open)return;const typing=(e.target as HTMLElement).closest('input,select,textarea');
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!typing){e.preventDefault();undo(!e.shiftKey);}
 else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'&&!typing){e.preventDefault();undo(false);}
 else if((e.key==='Delete'||e.key==='Backspace')&&!typing){e.preventDefault();editor.removeSelected();}
 else if(e.key==='Escape'&&!typing){editor.sel=undefined;draw();}});
// Back from the shaft generator in another tab: read the shafts again.
addEventListener('focus',()=>{if(open)void loadShafts().then(draw);});
addEventListener('resize',()=>{if(open)draw();});
addEventListener('pagehide',()=>{void flush();});

const last=await store.active();if(last&&(await store.list()).some(f=>f.id===last))await openGear(last);else{draw();await list();}
document.body.dataset.ready='true';
