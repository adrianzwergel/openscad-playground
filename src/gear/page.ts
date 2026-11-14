// The gearbox generator's page: gearboxes as files of their own (OPFS folder `getriebe`), their shafts linked to the
// shaft generator's files (folder `wellen`). Step 1 shows a gearbox: from above per layer, its layers, meshes, belts,
// speeds and messages. Placing and editing follow.
import {ProjectStore} from '../mechanics/project-store.ts';
import {parseShaft} from '../shaft/model.ts';
import {newGear,parseGear} from './model.ts';
import type {GearDoc} from './model.ts';
import {planGear} from './plan.ts';
import type {GearPlan,ShaftFile} from './plan.ts';
import {topView} from './draw.ts';
import {gearExamples} from './examples.ts';

const FORMAT='gear-1',SHAFT='shaft-1';
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const el=<K extends keyof HTMLElementTagNameMap>(tag:K,props:Record<string,unknown>={},...children:(Node|string)[]):HTMLElementTagNameMap[K]=>{const e=document.createElement(tag);Object.assign(e,props);e.append(...children);return e;};
const n=(x:number)=>String(+x.toFixed(3)).replace('.',',');

const store=await ProjectStore.open('getriebe',FORMAT),shaftStore=await ProjectStore.open('wellen',SHAFT);
let open:{id:string;name:string;doc:GearDoc;readOnly:boolean}|undefined,files:Record<string,ShaftFile>={},plan:GearPlan|undefined,layer=0;
const status=(m:string)=>{$('status').textContent=m;};
/** The shaft generator's files, read fresh: a gearbox follows its shafts. */
async function loadShafts(){const out:Record<string,ShaftFile>={};for(const e of await shaftStore.list()){try{const f=await shaftStore.read(e.id);out[e.id]={name:f.name,doc:parseShaft(f.doc)};}catch{/* a broken file shows as missing */}}files=out;}
async function list(){const all=await store.list(),root=$('gear-list');root.replaceChildren(...all.map(f=>{const b=el('button',{className:'shaft-open',textContent:f.name});b.dataset.openGear=f.id;b.setAttribute('aria-current',String(f.id===open?.id));b.onclick=()=>void openGear(f.id);return b;}));if(!all.length)root.append(el('p',{className:'muted',textContent:'Noch keine Getriebe.'}));}
async function create(name:string,doc:GearDoc){const id=crypto.randomUUID().slice(0,12);await store.write(id,{format:FORMAT,name,updated:new Date().toISOString(),doc:parseGear(doc)});await openGear(id);}
async function openGear(id:string){await store.settled().catch(()=>{});let f;try{f=await store.read(id);}catch(e){status(`Getriebe konnte nicht geöffnet werden: ${e}`);return;}
 const free=await store.claim(id);await loadShafts();open={id,name:f.name,doc:parseGear(f.doc),readOnly:!free};layer=0;await store.setActive(id);$('save-state').textContent=free?'Gespeichert':'Nur Ansicht';status(`${f.name} geöffnet.`);draw();void list();}
/** An example writes its shafts into the shaft generator first, then the gearbox linking to them. */
async function fromExample(key:string){const x=gearExamples.find(e=>e.key===key)!,ids:Record<string,string>={};
 for(const s of x.shafts){const id=crypto.randomUUID().slice(0,12);ids[s.key]=id;await shaftStore.write(id,{format:SHAFT,name:s.name,updated:new Date().toISOString(),doc:parseShaft(s.doc)});}
 await shaftStore.settled();await create(x.title,x.make(ids));}

function draw(){
 document.body.dataset.view=open?'gear':'start';$('gear-name').textContent=open?.name??'';if(!open)return;
 const p=plan=planGear(open.doc,files);layer=Math.min(layer,Math.max(0,p.layers.length-1));
 $('layer-tabs').replaceChildren(...p.layers.map((l,i)=>{const b=el('button',{className:'ghost',textContent:`Schicht ${i+1} · ${n(l.z0)} bis ${n(l.z1)} mm`});b.dataset.layer=String(i);b.setAttribute('aria-pressed',String(i===layer));b.onclick=()=>{layer=i;draw();};return b;}));
 $('top').innerHTML=topView(p,p.layers[layer]);
 $('linked').replaceChildren(...open.doc.shafts.map(s=>{const sh=p.shafts.find(x=>x.id===s.id);return el('li',{},el('b',{textContent:sh?.label??`fehlt (${s.shaft})`}),` bei ${n(s.at[0])} / ${n(s.at[1])} mm, Höhe ${n(s.z)}${s.flip?', umgedreht':''}`,el('small',{className:'muted',textContent:p.rates[s.id]!==undefined?` · ${n(p.rates[s.id])} U je Umdrehung des Eingangs`:''}));}));
 $('layers').replaceChildren(...p.layers.map((l,i)=>el('li',{},el('b',{textContent:`Schicht ${i+1}`}),` ${n(l.z0)} bis ${n(l.z1)} mm, ${l.bearings.length} Lager, ${l.webs.length} Stege, Rand ${n(l.rim)} mm${l.holes.length?`, ${l.holes.length} Freiloch`:''}${l.parts>1?`, ${l.parts} Teile`:''}`)));
 $('drives').replaceChildren(...p.meshes.map(m=>{const a=p.wheels.find(w=>w.key===m.a)!,b=p.wheels.find(w=>w.key===m.b)!;return el('li',{},`${a.label} kämmt mit ${b.label} (${a.teeth} : ${b.teeth})`);}),...p.belts.map(bt=>el('li',{},`Riemen ${n(bt.length)} mm${bt.stock?`, Normlänge ${bt.stock} mm`:''}`)));
 const counts=['fehler','warnung'].map(l=>p.issues.filter(i=>i.level===l).length);$('issues-title').textContent=counts[0]?`Meldungen · ${counts[0]} Fehler`:counts[1]?`Meldungen · ${counts[1]} ${counts[1]===1?'Warnung':'Warnungen'}`:'Meldungen · alles passt';
 $('issues').replaceChildren(...p.issues.map(i=>{const li=el('li',{className:i.level,textContent:i.message});li.dataset.level=i.level;return li;}));}

$('new-gear').onclick=()=>void create('Neues Getriebe',newGear());
$('examples').replaceChildren(...gearExamples.map(x=>{const b=el('button',{className:'start-card'},el('strong',{textContent:x.title}),el('small',{textContent:x.text}));b.dataset.example=x.key;b.onclick=()=>void fromExample(x.key);return b;}));
$('gear-close').onclick=()=>{open=undefined;draw();void list();};
$('gear-delete').onclick=()=>{if(!open||!confirm(`Getriebe „${open.name}“ löschen? Die Wellen bleiben im Wellen-Generator.`))return;const id=open.id;open=undefined;void store.remove(id).then(()=>{draw();void list();});};
// Back from the shaft generator in another tab: read the shafts again.
addEventListener('focus',()=>{if(open)void loadShafts().then(draw);});

const last=await store.active();if(last&&(await store.list()).some(f=>f.id===last))await openGear(last);else{draw();await list();}
document.body.dataset.ready='true';
