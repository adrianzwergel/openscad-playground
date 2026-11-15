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
import {CadClient} from '../shaft/cad-client.ts';
import {ShaftPreview} from '../shaft/preview.ts';
import {gearCsv,gearNotes} from './notes.ts';
import JSZip from 'jszip';

const FORMAT='gear-1',SHAFT='shaft-1';
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const el=<K extends keyof HTMLElementTagNameMap>(tag:K,props:Record<string,unknown>={},...children:(Node|string)[]):HTMLElementTagNameMap[K]=>{const e=document.createElement(tag);Object.assign(e,props);e.append(...children);return e;};
const n=(x:number)=>String(+x.toFixed(3)).replace('.',',');

const store=await ProjectStore.open('getriebe',FORMAT),shaftStore=await ProjectStore.open('wellen',SHAFT);
let open:{id:string;name:string;doc:GearDoc;readOnly:boolean}|undefined,files:Record<string,ShaftFile>={},names:{id:string;name:string}[]=[],plan:GearPlan|undefined;
let saveTimer:ReturnType<typeof setTimeout>|undefined,past:string[]=[],future:string[]=[],before:string|undefined;
const status=(m:string)=>{$('status').textContent=m;};
// ---------- CAD: the same worker as the shaft generator, with the gearbox and its shafts ----------
const cad=new CadClient();let preview:ShaftPreview|undefined,meshed='',meshTimer:ReturnType<typeof setTimeout>|undefined,filesFor='',made:Promise<{name:string;data:ArrayBuffer}[]>|undefined;
const previewState=(text:string,state:string)=>{const e=$('preview-state');e.textContent=text;e.dataset.state=state;};
/** The gearbox and the files of the shafts it uses, as one key and one message. */
const payload=()=>{const used=Object.fromEntries(open!.doc.shafts.map(s=>s.shaft).filter(id=>files[id]).map(id=>[id,files[id]])),z=editor.pose,pose=z.turn||Object.values(z.groups).some(Boolean)?{turn:z.turn,groups:{...z.groups}}:undefined,made=JSON.stringify([open!.doc,used]);return {doc:open!.doc,files:used,pose,made,key:made+JSON.stringify(pose??0)};};
/** The plan of what is open: made once per state, the editor asks for it often. */
let memo:{key:string;files:Record<string,ShaftFile>;plan:GearPlan}|undefined;
function planNow(){const key=JSON.stringify(open!.doc);if(!memo||memo.key!==key||memo.files!==files)memo={key,files,plan:planGear(open!.doc,files)};return memo.plan;}
function schedulePreview(){if(!open)return;const p=payload();if(p.key===meshed)return;meshed=p.key;clearTimeout(meshTimer);previewState('3D-Modell rechnet …','busy');
 meshTimer=setTimeout(()=>{void cad.request('mesh',p.doc,{files:p.files,...(p.pose?{pose:p.pose}:{})}).then(r=>{if(meshed!==p.key)return;if(r.kind==='error'){previewState(`Kein 3D-Modell: ${r.message}`,'error');return;}if(r.kind!=='mesh')return;preview??=new ShaftPreview($('preview'));preview.show(r.meshes);previewState('Ziehen dreht, Rad zoomt, rechte Taste verschiebt. Gekaufte Teile sind durchsichtig.','ready');},e=>{if(meshed===p.key){meshed='';previewState(`Kein 3D-Modell: ${e.message}`,'error');}});},300);}
function gearFiles(){const p=payload();if(p.made!==filesFor||!made){filesFor=p.made;made=cad.request('files',p.doc,{files:p.files}).then(r=>{if(r.kind==='error')throw Error(r.message);if(r.kind!=='files')throw Error('Unerwartete Antwort');return r.files;});made.catch(()=>{if(filesFor===p.made)made=undefined;});}return made;}
const base=()=>open!.name.replace(/[^wäöüÄÖÜß-]+/g,'_');
function save_(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=el('a',{href:url,download:name});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);status(`${name} gespeichert.`);}
function download(name:string){status('Datei wird erzeugt …');void gearFiles().then(all=>{const f=all.find(x=>x.name===name);if(!f)throw Error(`${name} fehlt`);save_(new Blob([f.data]),`${base()}-${name}`);},e=>status(`Datei nicht erzeugt: ${e.message}`));}
function downloadZip(){const o=open!,p=plan!;status('ZIP wird erzeugt …');void gearFiles().then(async all=>{const zip=new JSZip();for(const f of all)zip.file(f.name,f.data);zip.file('stueckliste.csv','﻿'+gearCsv(p));zip.file('zusammenbau.txt',gearNotes(o.name,o.doc,p));save_(await zip.generateAsync({type:'blob',compression:'DEFLATE'}),`${base()}.zip`);},e=>status(`ZIP nicht erzeugt: ${e.message}`));}
function renderFiles(p:GearPlan){const row=(label:string,file:string,formats:string[])=>el('li',{className:'file-row'},el('span',{textContent:label}),...formats.map(x=>{const b=el('button',{className:'ghost',textContent:x.toUpperCase()});b.dataset.file=`${file}.${x}`;b.onclick=()=>download(`${file}.${x}`);return b;}));
 const zip=el('button',{className:'primary',textContent:'Alles als ZIP (Platten, Säulen, Wellen, Stückliste)'});zip.dataset.file='zip';zip.onclick=downloadZip;
 $('files').replaceChildren(...p.layers.flatMap((l,i)=>l.pair?[row(`Schicht ${i+1} unten`,`schicht-${i+1}-unten`,['step','stl']),row(`Schicht ${i+1} oben`,`schicht-${i+1}-oben`,['step','stl'])]:[row(`Schicht ${i+1}`,`schicht-${i+1}`,['step','stl'])]),...p.columns.map((c,i)=>row(`Säule ${c.from} – ${c.to} (${p.bolts.filter(b=>b.body===c.body).length}×)`,`saeule-${i+1}`,['step','stl'])),row('Baugruppe mit Wellen und Kaufteilen','baugruppe',['step']),el('li',{className:'file-row zip'},zip));}
const editor=new GearEditor({
 editShaft:id=>editShaft(id),
 doc:()=>open!.doc,plan:()=>planNow(),files:()=>files,fileNames:()=>names,readOnly:()=>!!open?.readOnly,
 begin:()=>{before??=JSON.stringify(open!.doc);},
 commit:m=>{if(before!==undefined&&before!==JSON.stringify(open!.doc)){past.push(before);if(past.length>200)past.shift();future=[];save();}before=undefined;if(m)status(m);draw();},
 live:()=>draw(),
},status);

/** The shaft generator's files, read fresh: a gearbox follows its shafts. */
async function loadShafts(){const out:Record<string,ShaftFile>={},list=await shaftStore.list();for(const e of list){try{const f=await shaftStore.read(e.id);out[e.id]={name:f.name,doc:parseShaft(f.doc)};}catch{/* a broken file shows as missing */}}files=out;names=list.filter(e=>out[e.id]).map(e=>({id:e.id,name:out[e.id].name}));}
async function list(){const all=await store.list(),root=$('gear-list');root.replaceChildren(...all.map(f=>{const b=el('button',{className:'shaft-open',textContent:f.name});b.dataset.openGear=f.id;b.setAttribute('aria-current',String(f.id===open?.id));b.onclick=()=>void openGear(f.id);return b;}));if(!all.length)root.append(el('p',{className:'muted',textContent:'Noch keine Getriebe.'}));}
async function create(name:string,doc:GearDoc){const id=crypto.randomUUID().slice(0,12);await store.write(id,{format:FORMAT,name,updated:new Date().toISOString(),doc:parseGear(doc)});await openGear(id);}
async function openGear(id:string){await flush();let f;try{f=await store.read(id);}catch(e){status(`Getriebe konnte nicht geöffnet werden: ${e}`);return;}
 const free=await store.claim(id);await loadShafts();open={id,name:f.name,doc:parseGear(f.doc),readOnly:!free};past=[];future=[];editor.sel=undefined;editor.layer=0;editor.pose={turn:0,groups:{}};await store.setActive(id);
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
 const p=plan=planNow();editor.layer=Math.min(editor.layer,Math.max(0,p.layers.length-1));
 editor.renderLibrary($('library'));
 $('layer-tabs').replaceChildren(...p.layers.map((l,i)=>{const b=el('button',{className:'ghost',textContent:`Schicht ${i+1}${l.body?` · ${p.groups.find(g=>g.id===l.body)?.name??'Schwinge'}`:''} · ${n(l.z0)} bis ${n(l.z1)} mm`});b.dataset.layer=String(i);b.dataset.tone='1';b.style.setProperty('--dot',['#5f86a3','#9a7cc0','#b3aa55','#4fae93','#c47a7e','#6a89e0'][l.body?p.groups.findIndex(g=>g.id===l.body)%5+1:0]);b.setAttribute('aria-pressed',String(i===editor.layer));b.onclick=()=>{editor.layer=i;editor.sel={kind:'layer',index:i};draw();};return b;}));
 editor.renderPose($('pose'));editor.renderTop($('top'));editor.renderLayers($('side'));editor.renderProperties($('properties'));
 $('drives').replaceChildren(...p.meshes.map(m=>{const a=p.wheels.find(w=>w.key===m.a)!,b=p.wheels.find(w=>w.key===m.b)!;return el('li',{},`${a.label} kämmt mit ${b.label} (${a.teeth} : ${b.teeth})`);}),...p.belts.map(bt=>el('li',{},`Riemen ${n(bt.length)} mm${bt.stock?`, Normlänge ${bt.stock} mm`:''}`)),...p.drive.lines.map(t=>{const li=el('li',{className:'drive-line',textContent:t});return li;}),
  ...open.doc.shafts.filter(s=>p.rates[s.id]!==undefined).map(s=>el('li',{className:'muted'},`${p.shafts.find(x=>x.id===s.id)?.label}: ${n(p.rates[s.id])} U je Umdrehung des Eingangs`)));
 const counts=['fehler','warnung'].map(l=>p.issues.filter(i=>i.level===l).length);$('issues-title').textContent=counts[0]?`Meldungen · ${counts[0]} Fehler`:counts[1]?`Meldungen · ${counts[1]} ${counts[1]===1?'Warnung':'Warnungen'}`:'Meldungen · alles passt';
 renderFiles(p);schedulePreview();
 $('bom').replaceChildren(...p.bom.map(b=>el('li',{},`${b.count} × ${b.what}`,b.note?el('small',{className:'muted',textContent:` · ${b.note}`}):'')));
 $('issues').replaceChildren(...p.issues.map(i=>{const li=el('li',{className:i.level,textContent:i.message});li.dataset.level=i.level;const r=i.ref;if(r){li.classList.add('link');li.onclick=()=>{if(r.startsWith('steg:')){const [a,b]=r.slice(5).split('|');editor.sel={kind:'web',a,b};}else if(r.startsWith('bolzen:'))editor.sel={kind:'bolt',index:Number(r.slice(7))};else if(r.startsWith('schwinge:'))editor.sel={kind:'group',id:r.slice(9)};else if(open!.doc.shafts.some(s=>s.id===r))editor.sel={kind:'shaft',id:r};draw();};}return li;}));}

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
 else if(e.key==='Escape'&&!typing){if(!$('shaft-dialog').hidden){void closeShaft();return;}editor.sel=undefined;draw();}});
// ---------- the shaft editor over the page ----------
// The shaft generator in a frame (#open=<id>&embed); every save there reads the shafts here again, so the gearbox
// behind follows. A new shaft (#new) is put into the gearbox when the dialog closes.
let editing:{id?:string;created?:string}|undefined,reloadTimer:ReturnType<typeof setTimeout>|undefined;
function editShaft(id?:string){editing={...(id?{id}:{})};const frame=$('shaft-frame') as HTMLIFrameElement;frame.src=`./welle.html#${id?`open=${encodeURIComponent(id)}`:'new=1'}&embed=1`;
 ($('shaft-dialog-tab') as HTMLAnchorElement).href=id?`./welle.html#open=${encodeURIComponent(id)}`:'./welle.html';$('shaft-dialog-title').textContent=id?`Welle bearbeiten: ${files[id]?.name??''}`:'Neue Welle';$('shaft-dialog').hidden=false;}
async function closeShaft(){const d=$('shaft-dialog');if(d.hidden)return;const frame=$('shaft-frame') as HTMLIFrameElement;
 // Let the frame write what is still waiting, then read the shafts.
 try{frame.contentWindow?.dispatchEvent(new Event('pagehide'));}catch{/* other origin: not here */}
 d.hidden=true;// The keys belong to the gearbox again, not to the emptied frame.
 frame.blur();window.focus();(document.activeElement as HTMLElement|null)?.blur?.();
 await new Promise(r=>setTimeout(r,350));frame.src='about:blank';await loadShafts();
 const made=editing?.created;editing=undefined;if(made&&open&&!open.doc.shafts.some(s=>s.shaft===made))editor.place(made);else draw();}
$('shaft-dialog-close').onclick=()=>void closeShaft();
addEventListener('message',e=>{const m=e.data as {source?:string;type?:string;id?:string;name?:string};if(e.origin!==location.origin||m?.source!=='welle'||!m.id)return;
 if(m.type==='created'&&editing){editing.created=m.id;$('shaft-dialog-title').textContent=`Neue Welle: ${m.name}`;}
 if(m.type==='saved'){if(editing?.created===m.id)$('shaft-dialog-title').textContent=`Neue Welle: ${m.name}`;clearTimeout(reloadTimer);reloadTimer=setTimeout(()=>void loadShafts().then(draw),150);}});
// Back from the shaft generator in another tab: read the shafts again.
addEventListener('focus',()=>{if(open)void loadShafts().then(draw);});
addEventListener('resize',()=>{if(open)draw();});
addEventListener('pagehide',()=>{void flush();});

const last=await store.active();if(last&&(await store.list()).some(f=>f.id===last))await openGear(last);else{draw();await list();}
document.body.dataset.ready='true';
