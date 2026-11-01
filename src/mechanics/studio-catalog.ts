import {legoPart,legoSearchable,legoCapabilities} from './graph/lego';
import {CatalogPreview} from './catalog-preview';
import {defaultCatalog,partAllowed,parseCatalog,partKey} from './graph/catalog';
import type {SearchCatalog} from './graph/catalog';
import {registry} from './graph/registry';

const labels:Record<string,string>={teeth:'Zähne',module:'Modul [mm]',width:'Breite [mm]',bore:'Bohrung [mm]',length:'Länge [mm]',lead:'Vorschub [mm/U]',starts:'Gänge',diameter:'Durchmesser [mm]'};
const familyNames:Record<string,string>={spur:'Stirnrad',bevel:'Kegelrad','gt2-pulley':'GT2-Scheibe','gt2-belt':'GT2-Riemen',worm:'Schnecke','worm-wheel':'Schneckenrad','tr8-screw':'TR8-Spindel','tr8-nut':'TR8-Mutter',rack:'Zahnstange'};
function shortName(p:SearchCatalog['parts'][number],base:SearchCatalog){return p.family==='lego-technic'?p.name:p.name!==base.parts.find(x=>x.id===p.id)!.name?p.name:[familyNames[p.family]??p.family,p.params.teeth?`${p.params.teeth} Z`:p.params.length?`${p.params.length} mm`:'',p.params.starts?`${p.params.starts} G`:p.params.lead?`${p.params.lead} mm/U`:''].filter(Boolean).join(' · ');}
/** Groups by kind of transmission, whatever the parts' make: LEGO spur gears are spur gears. The first rule names the group. */
export const catalogKinds:{title:string;rules:string[]}[]=[
 {title:'Stirnräder',rules:['external-spur','lego-spur']},{title:'Kegelräder',rules:['bevel-mesh','lego-bevel-90']},{title:'Schnecke / Schneckenrad',rules:['worm-mesh','lego-worm']},
 {title:'GT2-Zahnriemen',rules:['gt2-belt']},{title:'Spindel / Mutter',rules:['screw-nut']},{title:'Ritzel / Zahnstange',rules:['rack-drive']},
];
export function renderStock(c:SearchCatalog,names:Record<string,string>,stroke:number|undefined,edit:(change:(c:SearchCatalog)=>void)=>void){
 const root=document.getElementById('catalog-items')!,query=(document.getElementById('catalog-filter') as HTMLInputElement).value.toLowerCase();
 const opened=new Set([...root.querySelectorAll('details[open]')].map(e=>(e as HTMLElement).dataset.key));root.replaceChildren();
 const whitelist=document.getElementById('catalog-whitelist') as HTMLInputElement;whitelist.checked=c.whitelist;whitelist.onchange=()=>edit(c=>{c.whitelist=whitelist.checked;});
 document.getElementById('catalog-clear-filters')!.onclick=()=>edit(c=>{c.excludedRules=[];c.whitelist=false;for(const p of c.parts){delete p.allowed;delete p.listed;delete p.quantity;}});
 const permitted=c.parts.filter(p=>partAllowed(c,p)).length;
 document.getElementById('search-types')!.textContent=`${permitted} / ${c.parts.length} Teile freigegeben · ${c.whitelist?'Warenkorb aktiv':'Gesamtkatalog mit Einzelfiltern'}. Typen: ${catalogKinds.filter(k=>k.rules.some(id=>!c.excludedRules.includes(id))).map(k=>k.title).join(', ')||'keine'}. Spindel und Zahnstange benötigen einen linearen Ausgang.`;
 void names;
 const details=(key:string,title:string)=>{const d=document.createElement('details'),s=document.createElement('summary');d.dataset.key=key;d.open=opened.has(key);s.textContent=title;d.append(s);return d;};
 const checkbox=(parent:HTMLElement,text:string,value:boolean,action:(value:boolean)=>void)=>{const l=document.createElement('label'),i=document.createElement('input');i.type='checkbox';i.checked=value;i.onchange=()=>action(i.checked);l.append(i,document.createTextNode(' '+text));parent.append(l);return i;};
 const base=defaultCatalog(),seen=new Set<string>();
 const cart=document.getElementById('catalog-cart')!;cart.replaceChildren();
 for(const p of c.parts.filter(p=>p.listed)){
  const row=document.createElement('div');row.className='cart-row';const label=document.createElement('span');label.textContent=shortName(p,base)+(p.family==='lego-technic'&&!legoSearchable(legoPart(p.params))?' (Paarung offen)':p.allowed===false?' (gesperrt)':'');label.title=p.name;
  const qty=document.createElement('input');qty.type='number';qty.min='0';qty.max='10000';qty.step='1';qty.placeholder='∞';qty.value=p.quantity===undefined?'':String(p.quantity);qty.setAttribute('aria-label','Stückzahl '+label.textContent);qty.onchange=()=>edit(c=>{const part=c.parts.find(x=>x.id===p.id)!;if(qty.value==='')delete part.quantity;else part.quantity=Number(qty.value);});
  const remove=document.createElement('button');remove.textContent='×';remove.setAttribute('aria-label',label.textContent+' entfernen');remove.onclick=()=>edit(c=>{const part=c.parts.find(x=>x.id===p.id)!;delete part.listed;delete part.quantity;});row.append(label,qty,remove);cart.append(row);
 }
 if(!cart.children.length)cart.textContent=c.whitelist?'Warenkorb leer – keine Teile freigegeben.':'Warenkorb leer – gesamter Katalog verfügbar.';
 // Parts of each kind: those its rules can place (by the stock definition, so edited parts stay in their group).
 const keyOf=new Map(base.parts.map(p=>[p.id,partKey(p.family,p.params)])),kinds=[...catalogKinds.map(k=>{const keys=new Set<string>();for(const id of k.rules){const rule=registry.rules.get(id);if(!rule?.search)continue;for(const choice of rule.search.catalog({stroke}))for(const e of choice.elements)keys.add(partKey(e.family,e.params));}
   return {...k,has:(p:SearchCatalog['parts'][number])=>keys.has(keyOf.get(p.id)!)||k.rules.includes('gt2-belt')&&p.family==='gt2-belt'};}),
  {title:'Weitere LEGO-Teile (ohne Paarungsregel)',rules:[] as string[],has:(p:SearchCatalog['parts'][number])=>p.family==='lego-technic'}];
 for(const kind of kinds){const rule={id:kind.rules[0]??'lego-other'};
  const parts=c.parts.filter(p=>!seen.has(p.id)&&kind.has(p)).filter(p=>!query||`${kind.title} ${p.name} ${p.family} ${JSON.stringify(p.params)}`.toLowerCase().includes(query));if(!parts.length)continue;
  const group=details(rule.id,kind.title);group.dataset.rule=rule.id;group.open=true;
  if(parts.some(p=>p.family==='lego-technic')){const hint=document.createElement('p');hint.className='muted';hint.textContent='LEGO-Teile stehen bei ihrer Bauart und sind gesperrt, bis du sie freigibst (Bearbeiten). ◇ Sondermodelle ohne Suchregel.';group.append(hint);}
  if(kind.rules.length)checkbox(group,'Gruppe für Suche freigeben',kind.rules.some(id=>!c.excludedRules.includes(id)),value=>edit(c=>{c.excludedRules=value?c.excludedRules.filter(id=>!kind.rules.includes(id)):[...new Set([...c.excludedRules,...kind.rules])];})).dataset.catalogRule=rule.id;
  for(const p of parts){
   if(seen.has(p.id))continue;seen.add(p.id);
   const row=document.createElement('article');row.className='catalog-row';row.dataset.partId=p.id;
   const description=document.createElement('div'),title=document.createElement('strong'),spec=document.createElement('small'),badge=document.createElement('span');
   const original=base.parts.find(x=>x.id===p.id)!;
   title.textContent=(p.family==='lego-technic'&&!legoSearchable(legoPart(p.params))?'◇ ':'')+shortName(p,base);
   spec.textContent=Object.entries(p.params).filter(([k])=>k!=='teeth').map(([k,v])=>`${labels[k]??k}: ${v}`).join(' · ');
   if(p.family==='lego-technic'&&!legoSearchable(legoPart(p.params)))spec.textContent+=' · Nur Katalog, Paarungsregel noch offen';badge.className='catalog-badge';badge.textContent=p.allowed===false?'Gesperrt':p.quantity===0?'Nicht verfügbar':`${p.quantity===undefined?'Unbegrenzt':p.quantity+' Stück'}${p.listed?' · Whitelist':''}`;
   description.append(title);description.title=spec.textContent+' · '+badge.textContent;const button=document.createElement('button');button.textContent='Bearbeiten';button.dataset.editPart=p.id;button.setAttribute('aria-label',`${title.textContent} bearbeiten`);
   button.onclick=()=>{
    const dialog=document.createElement('dialog');dialog.className='catalog-dialog';dialog.setAttribute('aria-labelledby','catalog-dialog-title');
    const heading=document.createElement('h2');heading.id='catalog-dialog-title';heading.textContent='Teil bearbeiten';
    const subtitle=document.createElement('p');subtitle.className='muted';subtitle.textContent=`${p.family} · ${p.id} — Änderungen gelten für alle passenden Paarungen in neuen Suchen.`;
    const previewHost=document.createElement('div');previewHost.className='catalog-preview';const previewStatus=document.createElement('p');previewStatus.className='muted';previewStatus.id='catalog-preview-status';const previewColumn=document.createElement('div');previewColumn.className='catalog-preview-column';previewColumn.append(previewHost,previewStatus);
    const form=document.createElement('form');form.className='catalog-part-form';
    const fieldsRoot=document.createElement('div');fieldsRoot.className='catalog-fields';
    const field=(name:string,value:string,type:string,key:string)=>{const l=document.createElement('label'),i=document.createElement('input');l.textContent=name;i.type=type;i.value=value;i.name=key;if(type==='number')i.step='any';l.append(i);fieldsRoot.append(l);return i;};
    const name=field('Bezeichnung',p.name,'text','name');name.required=true;name.maxLength=200;name.parentElement!.className='catalog-full';
    const quantity=field('Stückzahl (leer = unbegrenzt)',p.quantity===undefined?'':String(p.quantity),'number','quantity');quantity.min='0';quantity.max='10000';quantity.step='1';quantity.parentElement!.className='catalog-full';
    const fields=Object.entries(p.params).map(([k,v])=>{const i=field(labels[k]??k,String(v),'number',k);i.required=true;return [k,i] as const;});
    const toggles=document.createElement('div');toggles.className='catalog-toggles';
    const excluded=checkbox(toggles,'Teil von der Suche ausschließen',p.allowed===false,()=>{}),listed=checkbox(toggles,'Im Warenkorb',p.listed===true,()=>{});
    const error=document.createElement('p');error.className='catalog-error';error.setAttribute('role','alert');
    const actions=document.createElement('div');actions.className='catalog-actions';
    const save=document.createElement('button');save.type='submit';save.textContent='Änderungen speichern';save.className='primary';
    const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Abbrechen';cancel.onclick=()=>dialog.close();
    const reset=document.createElement('button');reset.type='button';reset.textContent='Standardwerte';reset.onclick=()=>{name.value=original.name;for(const [k,i] of fields)i.value=String(original.params[k]);error.textContent='';updatePreview();};
    actions.append(reset,cancel,save);form.append(fieldsRoot,toggles,error,actions);const layout=document.createElement('div');layout.className='catalog-edit-layout';layout.append(previewColumn,form);if(p.family==='lego-technic'){
     const item=legoPart(p.params);subtitle.textContent=`LEGO ${item.id} · Kaufteil · ${item.teeth?item.teeth+' Zähne · ':''}${legoSearchable(item)?legoCapabilities(item)+'. 5-mm-Welle mit gefrästem Kreuzsitz; Passung extern auslegen.':'Sonderform: im Katalog verfügbar, automatische Paarung noch nicht freigegeben.'}`;
     const attribution=document.createElement('p');attribution.className='muted';attribution.textContent=`LDraw-Modell von ${item.author}. ${item.license} Geometrie der Kaufteilnummer ist unveränderlich. `;
     const source=document.createElement('a');source.href=item.source;source.target='_blank';source.rel='noopener';source.textContent='Quelldatei';const license=document.createElement('a');license.href='./mechanics-assets/ldraw/CAreadme.txt';license.target='_blank';license.textContent='Lizenzen / Herkunft';attribution.append(source,document.createTextNode(' · '),license);previewColumn.append(attribution);
     for(const [,input] of fields){input.readOnly=true;input.parentElement!.hidden=true;}
    }
    dialog.append(heading,subtitle,layout);document.body.append(dialog);
    let preview:CatalogPreview|undefined;const updatePreview=()=>preview?.update({...p,params:Object.fromEntries(fields.map(([k,i])=>[k,i.value===''?NaN:Number(i.value)]))});
    form.addEventListener('input',e=>{if(fields.some(([,i])=>i===e.target))updatePreview();});
    dialog.addEventListener('close',()=>{preview?.dispose();dialog.remove();root.querySelector<HTMLButtonElement>(`[data-rule="${rule.id}"] [data-edit-part="${p.id}"]`)?.focus();});
    form.onsubmit=e=>{e.preventDefault();try{const next=structuredClone(c),part=next.parts.find(x=>x.id===p.id)!;part.name=name.value.trim();part.params=Object.fromEntries(fields.map(([k,i])=>[k,Number(i.value)]));part.allowed=!excluded.checked;part.listed=listed.checked;if(quantity.value==='')delete part.quantity;else part.quantity=Number(quantity.value);parseCatalog(next);edit(c=>{c.parts[c.parts.findIndex(x=>x.id===p.id)]=part;if(part.listed)c.whitelist=true;});dialog.close();}catch(e){error.textContent=e instanceof Error?e.message:String(e);}};
    dialog.showModal();try{preview=new CatalogPreview(previewHost,previewStatus);updatePreview();}catch(e){previewStatus.textContent='3D-Vorschau nicht verfügbar: '+String(e);}name.focus();
   };
   const add=document.createElement('button');add.textContent=p.listed?'✓':'+';add.title='In den Warenkorb';add.setAttribute('aria-label',title.textContent+' hinzufügen');add.dataset.addPart=p.id;add.onclick=()=>edit(c=>{const part=c.parts.find(x=>x.id===p.id)!;part.quantity=part.listed?(part.quantity??0)+1:1;part.listed=true;part.allowed=true;c.whitelist=true;});row.append(description,button,add);group.append(row);
  }
  root.append(group);
 }
 if(!root.children.length)root.textContent='Keine passenden Katalogeinträge.';
}
