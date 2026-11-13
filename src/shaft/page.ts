// The shaft generator's page: a list of shafts (own files beside the Studio's projects); an open shaft in the editor
// (catalog, timeline, properties), its messages and parts list. Undo per open shaft; saved a moment after a change.
import {ProjectStore} from '../mechanics/project-store.ts';
import {newShaft,parseShaft} from './model.ts';
import type {ShaftDoc} from './model.ts';
import {planShaft} from './plan.ts';
import type {Plan} from './plan.ts';
import {shaftExamples} from './examples.ts';
import {ShaftEditor} from './editor.ts';
import {CadClient} from './cad-client.ts';
import {ShaftPreview} from './preview.ts';

const FORMAT='shaft-1';
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const el=<K extends keyof HTMLElementTagNameMap>(tag:K,props:Record<string,unknown>={},...children:(Node|string)[]):HTMLElementTagNameMap[K]=>{const e=document.createElement(tag);Object.assign(e,props);e.append(...children);return e;};

const store=await ProjectStore.open('wellen',FORMAT);
let open:{id:string;name:string;doc:ShaftDoc;readOnly:boolean}|undefined;
let plan:Plan|undefined,saveTimer:ReturnType<typeof setTimeout>|undefined;
let past:string[]=[],future:string[]=[],before:string|undefined;
const status=(m:string)=>{$('status').textContent=m;};
// ---------- CAD: preview a moment after a change, files on request ----------
const cad=new CadClient(Number(new URLSearchParams(location.search).get('cadlimit'))||undefined);
let preview:ShaftPreview|undefined,meshed='',meshTimer:ReturnType<typeof setTimeout>|undefined,filesFor='',files:Promise<{name:string;data:ArrayBuffer}[]>|undefined;
const previewState=(text:string,state:string)=>{const e=$('preview-state');e.textContent=text;e.dataset.state=state;};
function schedulePreview(){if(!open)return;const key=JSON.stringify(open.doc);if(key===meshed)return;meshed=key;clearTimeout(meshTimer);previewState('3D-Modell rechnet …','busy');
 meshTimer=setTimeout(()=>{const doc=JSON.parse(key);void cad.request('mesh',doc).then(r=>{if(meshed!==key)return;if(r.kind==='error'){previewState(`Kein 3D-Modell: ${r.message}`,'error');return;}if(r.kind!=='mesh')return;preview??=new ShaftPreview($('preview'));preview.show(r.meshes);previewState('Ziehen dreht, Rad zoomt, rechte Taste verschiebt. Gekaufte Teile sind durchsichtig.','ready');},e=>{if(meshed===key){meshed='';previewState(`Kein 3D-Modell: ${e.message}`,'error');}});},250);}
/** The files of the open shaft, made once per state. */
function shaftFiles(){const key=JSON.stringify(open!.doc);if(key!==filesFor||!files){filesFor=key;files=cad.request('files',JSON.parse(key)).then(r=>{if(r.kind==='error')throw Error(r.message);if(r.kind!=='files')throw Error('Unerwartete Antwort');return r.files;});files.catch(()=>{if(filesFor===key)files=undefined;});}return files;}
function download(name:string){const base=open!.name.replace(/[^wäöüÄÖÜß-]+/g,'_');status('Datei wird erzeugt …');void shaftFiles().then(all=>{const f=all.find(x=>x.name===name);if(!f)throw Error(`${name} fehlt`);const url=URL.createObjectURL(new Blob([f.data],{type:name.endsWith('.stl')?'model/stl':'model/step'})),a=el('a',{href:url,download:`${base}-${name}`});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);status(`${base}-${name} gespeichert.`);},e=>status(`Datei nicht erzeugt: ${e.message}`));}
function renderFiles(p:Plan){const row=(label:string,file:string,formats:string[])=>el('li',{className:'file-row'},el('span',{textContent:label}),...formats.map(x=>{const b=el('button',{className:'ghost',textContent:x.toUpperCase()});b.dataset.file=`${file}.${x}`;b.onclick=()=>download(`${file}.${x}`);return b;}));
 $('files').replaceChildren(row('Welle','welle',['step','stl']),...p.sleeves.map((sl,i)=>row(sl.label,`${sl.kind}-${i+1}`,['step','stl'])),row('Baugruppe mit Kaufteilen','baugruppe',['step']));}
const editor=new ShaftEditor({
 doc:()=>open!.doc,plan:()=>plan!,readOnly:()=>!!open?.readOnly,
 begin:()=>{before??=JSON.stringify(open!.doc);},
 commit:message=>{if(before!==undefined&&before!==JSON.stringify(open!.doc)){past.push(before);if(past.length>200)past.shift();future=[];save();}before=undefined;if(message)status(message);draw();},
 live:()=>draw(),
},status);

async function list(){
 const all=await store.list(),root=$('shaft-list');
 root.replaceChildren(...all.map(f=>{const b=el('button',{className:'shaft-open',textContent:f.name});b.dataset.openShaft=f.id;b.setAttribute('aria-current',String(f.id===open?.id));b.onclick=()=>void openShaft(f.id);return b;}));
 if(!all.length)root.append(el('p',{className:'muted',textContent:'Noch keine Wellen.'}));
}
async function create(name:string,doc:ShaftDoc){const id=crypto.randomUUID().slice(0,12);await store.write(id,{format:FORMAT,name,updated:new Date().toISOString(),doc:parseShaft(doc)});await openShaft(id);}
async function openShaft(id:string){
 await flush();let f;try{f=await store.read(id);}catch(e){status(`Welle konnte nicht geöffnet werden: ${e}`);return;}
 const free=await store.claim(id);open={id,name:f.name,doc:parseShaft(f.doc),readOnly:!free};past=[];future=[];editor.sel=undefined;await store.setActive(id);
 $('save-state').textContent=free?'Gespeichert':'Nur Ansicht';status(free?`${f.name} geöffnet.`:`${f.name} ist in einem anderen Tab offen: Änderungen hier werden nicht gespeichert.`);draw();void list();
}
function save(){if(!open||open.readOnly)return;clearTimeout(saveTimer);$('save-state').textContent='Speichert …';saveTimer=setTimeout(()=>void flush(),300);}
async function flush(){if(saveTimer===undefined||!open)return;clearTimeout(saveTimer);saveTimer=undefined;const o=open;try{await store.write(o.id,{format:FORMAT,name:o.name,updated:new Date().toISOString(),doc:o.doc});$('save-state').textContent='Gespeichert';}catch(e){$('save-state').textContent=`Nicht gespeichert: ${e}`;}}
function undo(back:boolean){if(!open||open.readOnly)return;const from=back?past:future,to=back?future:past,state=from.pop();if(state===undefined)return;to.push(JSON.stringify(open.doc));open.doc=parseShaft(JSON.parse(state));editor.sel=undefined;save();draw();status(back?'Rückgängig':'Wiederholt');}

function draw(){
 document.body.dataset.view=open?'shaft':'start';$('shaft-name').textContent=open?.name??'';
 ($('undo') as HTMLButtonElement).disabled=!past.length;($('redo') as HTMLButtonElement).disabled=!future.length;
 if(!open)return;plan=planShaft(open.doc);const p=plan;
 if(!$('catalog').childElementCount)editor.renderCatalog($('catalog'));
 editor.renderTimeline($('timeline'));editor.renderProperties($('properties'));
 const counts=['fehler','warnung','hinweis'].map(l=>p.issues.filter(i=>i.level===l).length);
 $('issues-title').textContent=counts[0]?`Meldungen · ${counts[0]} Fehler`:counts[1]?`Meldungen · ${counts[1]} ${counts[1]===1?'Warnung':'Warnungen'}`:'Meldungen · alles montierbar';
 $('issues').replaceChildren(...p.issues.map(i=>{const li=el('li',{className:i.level,textContent:i.message});li.dataset.level=i.level;if(i.ref){li.classList.add('link');li.onclick=()=>{editor.selectRef(i.ref!);draw();};}return li;}));
 renderFiles(p);schedulePreview();
 $('bom').replaceChildren(...p.bom.map(b=>el('li',{},`${b.count} × ${b.what}`,b.note?el('small',{className:'muted',textContent:` · ${b.note}`}):'')));
}

$('new-shaft').onclick=()=>void create('Neue Welle',newShaft());
$('examples').replaceChildren(...shaftExamples.map(x=>{const b=el('button',{className:'start-card'},el('strong',{textContent:x.title}),el('small',{textContent:x.text}));b.dataset.example=x.key;b.onclick=()=>void create(x.title,x.make());return b;}));
$('shaft-rename').onclick=()=>{if(!open)return;const name=prompt('Neuer Name',open.name)?.trim();if(!name)return;open.name=name;save();draw();void list();};
$('shaft-delete').onclick=()=>{if(!open||!confirm(`Welle „${open.name}“ löschen?`))return;const id=open.id;clearTimeout(saveTimer);saveTimer=undefined;open=undefined;void store.remove(id).then(()=>{draw();void list();});};
$('shaft-close').onclick=()=>void flush().then(()=>{open=undefined;draw();void list();});
$('undo').onclick=()=>undo(true);$('redo').onclick=()=>undo(false);
$('zoom-in').onclick=()=>editor.setZoom(editor.zoom*1.5);$('zoom-out').onclick=()=>editor.setZoom(editor.zoom/1.5);$('zoom-fit').onclick=()=>editor.setZoom(1);
addEventListener('keydown',e=>{if(!open)return;const typing=(e.target as HTMLElement).closest('input,select,textarea');
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!typing){e.preventDefault();undo(!e.shiftKey);}
 else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'&&!typing){e.preventDefault();undo(false);}
 else if((e.key==='Delete'||e.key==='Backspace')&&!typing){e.preventDefault();editor.removeSelected();}
 else if(e.key==='Escape'&&!typing){editor.sel=undefined;draw();}});
addEventListener('resize',()=>{if(open)draw();});
addEventListener('pagehide',()=>{void flush();});

const last=await store.active();if(last&&(await store.list()).some(f=>f.id===last))await openShaft(last);else{draw();await list();}
document.body.dataset.ready="true";
