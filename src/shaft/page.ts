// The shaft generator's page: a list of shafts (own files beside the Studio's projects), the open shaft as a section
// drawing with its messages and parts list. Editing on tracks follows in the timeline.
import {ProjectStore} from '../mechanics/project-store.ts';
import {newShaft,parseShaft} from './model.ts';
import type {ShaftDoc} from './model.ts';
import {planShaft} from './plan.ts';
import type {Plan} from './plan.ts';
import {silhouette} from './draw.ts';
import {shaftExamples} from './examples.ts';
import {label} from './profile.ts';

const FORMAT='shaft-1';
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const el=<K extends keyof HTMLElementTagNameMap>(tag:K,props:Record<string,unknown>={},...children:(Node|string)[]):HTMLElementTagNameMap[K]=>{const e=document.createElement(tag);Object.assign(e,props);e.append(...children);return e;};
const mm=(x:number)=>`${String(+x.toFixed(2)).replace('.',',')} mm`;

const store=await ProjectStore.open('wellen',FORMAT);
let open:{id:string;name:string;doc:ShaftDoc;readOnly:boolean}|undefined;
let plan:Plan|undefined,saveTimer:ReturnType<typeof setTimeout>|undefined;

async function list(){
 const all=await store.list(),root=$('shaft-list');
 root.replaceChildren(...all.map(f=>{const b=el('button',{className:'shaft-open',textContent:f.name});b.dataset.openShaft=f.id;b.setAttribute('aria-current',String(f.id===open?.id));b.onclick=()=>void openShaft(f.id);return b;}));
 if(!all.length)root.append(el('p',{className:'muted',textContent:'Noch keine Wellen.'}));
}
async function create(name:string,doc:ShaftDoc){const id=crypto.randomUUID().slice(0,12);await store.write(id,{format:FORMAT,name,updated:new Date().toISOString(),doc:parseShaft(doc)});await openShaft(id);}
async function openShaft(id:string){
 await store.settled().catch(()=>{});let f;try{f=await store.read(id);}catch(e){$('status').textContent=`Welle konnte nicht geöffnet werden: ${e}`;return;}
 const free=await store.claim(id);open={id,name:f.name,doc:parseShaft(f.doc),readOnly:!free};await store.setActive(id);
 $('save-state').textContent=free?'Gespeichert':'Nur Ansicht';draw();void list();
}
function changed(){if(!open||open.readOnly)return;clearTimeout(saveTimer);$('save-state').textContent='Speichert …';const o=open;saveTimer=setTimeout(()=>void store.write(o.id,{format:FORMAT,name:o.name,updated:new Date().toISOString(),doc:o.doc}).then(()=>{$('save-state').textContent='Gespeichert';},e=>{$('save-state').textContent=`Nicht gespeichert: ${e}`;}),300);draw();}

function draw(){
 document.body.dataset.view=open?'shaft':'start';$('shaft-name').textContent=open?.name??'';
 if(!open)return;plan=planShaft(open.doc);const p=plan,d=open.doc;
 $('drawing').innerHTML=silhouette(p);
 const length=el('input',{type:'number',min:'1',step:'0.5',value:String(d.length),id:'shaft-length'});length.onchange=()=>{const v=Number(length.value);if(v>0){d.length=v;changed();}};
 const making=el('select',{id:'shaft-making'},el('option',{value:'druck',textContent:'3D-Druck'}),el('option',{value:'cnc',textContent:'CNC (Drehen/Fräsen)'}));making.value=d.making;making.onchange=()=>{d.making=making.value as ShaftDoc['making'];changed();};
 $('shaft-settings').replaceChildren(el('label',{},'Länge [mm] ',length),el('label',{},'Fertigung ',making));
 const counts=['fehler','warnung','hinweis'].map(l=>p.issues.filter(i=>i.level===l).length);
 $('issues-title').textContent=counts[0]?`Meldungen · ${counts[0]} Fehler`:counts[1]?`Meldungen · ${counts[1]} ${counts[1]===1?"Warnung":"Warnungen"}`:'Meldungen · alles montierbar';
 $('issues').replaceChildren(...p.issues.map(i=>{const li=el('li',{className:i.level,textContent:i.message});li.dataset.level=i.level;return li;}));
 $('sections').replaceChildren(...p.sections.map(c=>el('li',{},el('b',{textContent:label(c.profile)}),` ${mm(c.x0)} bis ${mm(c.x1)}`,el('small',{className:'muted',textContent:` · ${({sitz:'Sitz',frei:'frei',bund:'Bund',eigen:'von Hand'})[c.role]}`}))));
 $('things').replaceChildren(...p.placed.map(t=>el('li',{},el('b',{textContent:t.label}),` ${mm(t.x0)} · ${label(t.bore)} · von ${t.side}${t.adapter?' · auf Adapter':''}`)),...p.sleeves.map(s=>el('li',{},el('b',{textContent:s.label}),` ${mm(s.x0)} bis ${mm(s.x1)} · ${s.auto?'erzeugt':'von Hand'}`)),...p.inserts.map(i=>el('li',{},el('b',{textContent:i.label}),` von ${i.end}, ${mm(i.x1-i.x0)} tief`)));
 $('bom').replaceChildren(...p.bom.map(b=>el('li',{},`${b.count} × ${b.what}`,b.note?el('small',{className:'muted',textContent:` · ${b.note}`}):'')));
}

$('new-shaft').onclick=()=>void create('Neue Welle',newShaft());
$('examples').replaceChildren(...shaftExamples.map(x=>{const b=el('button',{className:'start-card'},el('strong',{textContent:x.title}),el('small',{textContent:x.text}));b.dataset.example=x.key;b.onclick=()=>void create(x.title,x.make());return b;}));
$('shaft-rename').onclick=()=>{if(!open)return;const name=prompt('Neuer Name',open.name)?.trim();if(!name)return;open.name=name;changed();void list();};
$('shaft-delete').onclick=()=>{if(!open||!confirm(`Welle „${open.name}“ löschen?`))return;const id=open.id;open=undefined;void store.remove(id).then(()=>{draw();void list();});};
$('shaft-close').onclick=()=>{open=undefined;draw();void list();};

const last=await store.active();if(last&&(await store.list()).some(f=>f.id===last))await openShaft(last);else{draw();await list();}
