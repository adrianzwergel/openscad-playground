import {MixedPanel} from './MixedPanel';
import {defaultMixed} from './mixed-model';
import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {parseOff} from '../io/import_off';
import {exportGlb} from '../io/export_glb';
import {CATALOG, Project, initialProject, parseProject, serializeProject, resolveProject, generateScad, solverCatalog, distanceXY, Vec3} from './model';
import {KIND_NAMES, SearchResult, Solution} from './search';
import {resolveHousing,housingScad,printableParts,assemblyInstructions} from './housing';
import JSZip from 'jszip';
import {Workbench} from './Workbench';
import {SpatialPanel} from './SpatialPanel';
import {defaultSpatial} from './spatial';
import type {Spatial} from './spatial';
import {MotionPanel} from './MotionPanel';
import {defaultMotion} from './motion';
import type {Motion} from './motion';
import './style.css';

const STORAGE_KEY='mechanics10.project.v1';
function loadInitial(){try{const s=localStorage.getItem(STORAGE_KEY);return {project:s?parseProject(s):initialProject(),message:s?'Lokal gespeichertes Projekt geladen.':''};}catch(e){return {project:initialProject(),message:`Gespeichertes Projekt konnte nicht geladen werden: ${e}`};}}
function App(){
 const [initial]=useState(loadInitial);
 const [project,setProject]=useState<Project>(initial.project);
 const [storageStatus,setStorageStatus]=useState(initial.message);
 const [status,setStatus]=useState('Bereit');
 const [busy,setBusy]=useState(false);
 const [version,setVersion]=useState<number>();
 const [preview,setPreview]=useState('');
 const [download,setDownload]=useState('');
 const [logs,setLogs]=useState('');
 const [results,setResults]=useState<SearchResult>();
 const [filter,setFilter]=useState('all');
 const [sort,setSort]=useState('error');
 const [view,setView]=useState('gears');
 const [partLinks,setPartLinks]=useState<{id:string;name:string;url:string}[]>([]);
 const active=useRef<{worker:Worker,reject:(e:Error)=>void}>();
 const generation=useRef(0);
 const fileInput=useRef<HTMLInputElement>(null);
 const resolved=resolveProject(project);
 const housing=resolveHousing(project);
 const source=resolved.valid?generateScad(project):'';
 useEffect(()=>()=>{active.current?.reject(new Error('Ansicht geschlossen'));},[]);
 useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview);},[preview]);
 useEffect(()=>()=>{if(download)URL.revokeObjectURL(download);},[download]);
 useEffect(()=>()=>{partLinks.forEach(p=>URL.revokeObjectURL(p.url));},[partLinks]);
 function edit(next:Project,keepResults=false){generation.current++;active.current?.reject(new Error('Projekt geändert'));setBusy(false);setProject(next);setPreview('');setDownload('');setPartLinks([]);setLogs('');if(!keepResults){setResults(undefined);setVersion(undefined);}setStatus('Projekt geändert — Vorschau neu rendern.');setStorageStatus('Ungespeicherte Änderungen');}
 function job(file:string,data:unknown){return new Promise<any>((resolve,reject)=>{
  const worker=new Worker(file);const timer=setTimeout(()=>finish(new Error('Zeitlimit überschritten (120 s).')),120000);
  const finish=(error?:Error,value?:unknown)=>{clearTimeout(timer);worker.terminate();if(active.current?.worker===worker)active.current=undefined;error?reject(error):resolve(value);};
  active.current={worker,reject:e=>finish(e)};worker.onerror=e=>finish(new Error(e.message));worker.onmessage=e=>e.data.error?finish(new Error(e.data.error)):finish(undefined,e.data);worker.postMessage(data);
 });}
 function cancel(){generation.current++;active.current?.reject(new Error('Abgebrochen'));setBusy(false);setStatus('Abgebrochen');}
 async function run(search:boolean,current=project,mode=view){
  const id=++generation.current;setBusy(true);setLogs('');
  try{
   if(search){setResults(undefined);setStatus('Prolog sucht Katalogkombinationen …');const p=await job('./prolog-worker.js',{target:current.targetRatio,catalog:solverCatalog(),search:current.search,span:distanceXY(current.axes.input,current.axes.output)});if(id!==generation.current)return;setVersion(p.version);
    setStatus('Positionen und Freiräume werden geprüft …');const found:SearchResult=await job('./mechanics-search-worker.js',{project:current,candidates:p.candidates});if(id!==generation.current)return;setResults(found);setFilter('all');setStatus(found.valid?`${found.valid} gültige Anordnungen gefunden. Eine Variante zum Übernehmen auswählen.`:'Keine passende Anordnung im untersuchten Suchraum. Achsabstand, Abweichung, Ebenen oder Freiraum prüfen.');return;
   }
   setPreview('');setDownload('');
   const scad=mode==='gears'?generateScad(current):housingScad(current,mode==='exploded');setStatus('OpenSCAD rendert …');
   const r=await job('./mechanics-render-worker.js',{source:scad});if(id!==generation.current)return;
   const mesh=parseOff(r.off);
   if(mode!=='gears'){
    const a=resolveHousing(current),lift=mode==='exploded'?35:0;
    mesh.colors=[[0.08,0.16,0.23,1],[0.05,0.4,0.26,1],[0.3,0.32,0.35,1],[0.12,0.2,0.27,1]];
    for(const face of mesh.faces){
     const vs=face.vertices.map(i=>mesh.vertices[i]),x=vs.reduce((s,v)=>s+v.x,0)/3,y=vs.reduce((s,v)=>s+v.y,0)/3,z=vs.reduce((s,v)=>s+v.z,0)/3;
     const atBearing=(z>=a.lower-2.5-lift-1e-5&&z<=a.lower-lift+1e-5)||(z>=a.upper+lift-1e-5&&z<=a.upper+2.5+lift+1e-5);
     const metal=a.shafts.some(g=>vs.every(v=>Math.hypot(v.x-g.pos[0],v.y-g.pos[1])<=(atBearing?4:3)+1e-5))||a.posts.some(p=>vs.every(v=>Math.hypot(v.x-p[0],v.y-p[1])<=(z<a.lower-a.h.plateThickness-lift||z>a.upper+a.h.plateThickness+lift?4.6:2)+1e-5));
     const plate=z<=a.lower-lift+1e-5||z>=a.upper+lift-1e-5;
     const post=a.posts.some(p=>Math.hypot(x-p[0],y-p[1])<=6+1e-5);
     face.colorIndex=metal?2:plate?0:post?3:1;
    }
   }
   const glb=await exportGlb(mesh);if(id!==generation.current)return;
   setPreview(URL.createObjectURL(glb));if(mode==='gears')setDownload(URL.createObjectURL(new Blob([r.stl],{type:'application/octet-stream'})));setLogs(r.logs.join('\n'));setStatus('Fertig — Projekt → OpenSCAD → 3D');
  }catch(e){if(id===generation.current)setStatus(String(e));}finally{if(id===generation.current)setBusy(false);}
 }
 function show(mode:string){setView(mode);void run(false,project,mode);}
 async function exportParts(only?:string){
  const id=++generation.current;setBusy(true);setPartLinks([]);
  try{
   const parts=printableParts(project).filter(p=>!only||p.id===only),links:{id:string;name:string;url:string}[]=[],zip=new JSZip();
   for(const [index,part] of parts.entries()){
    setStatus(`STL ${index+1}/${parts.length}: ${part.name} …`);
    const r=await job('./mechanics-render-worker.js',{source:part.source});if(id!==generation.current)return;
    zip.file(`${part.id}.stl`,r.stl);
   }
   if(id!==generation.current)return;
   if(only){const bytes=await zip.file(`${only}.stl`)!.async('uint8array');links.push({id:only,name:parts[0].name,url:URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'model/stl'}))});}
   else{
    zip.file('project.json',serializeProject(project));
    zip.file('parts.json',JSON.stringify({printed:parts.map(({source,...part})=>part),purchased:housing.bom},null,2));
    zip.file('MONTAGE.txt',assemblyInstructions(project));
    const blob=await zip.generateAsync({type:'blob'});if(id!==generation.current)return;
    links.push({id:'mechanics10-parts',name:'Alle Druckteile + Stückliste + Montagehinweise',url:URL.createObjectURL(blob)});
   }
   if(id!==generation.current){links.forEach(p=>URL.revokeObjectURL(p.url));return;}
   setPartLinks(links);setStatus('Einzelteil-Export fertig. Dateien herunterladen.');
  }catch(e){if(id===generation.current)setStatus(String(e));}finally{if(id===generation.current)setBusy(false);}
 }
 function choose(s:Solution){edit(s.project,true);void run(false,s.project);}
 function axisEdit(which:'input'|'output',coordinate:number,value:number){
  if(!Number.isFinite(value)||Math.abs(value)>10000)return;
  if(coordinate===2&&which==='input'&&project.components.some(c=>Math.abs(c.position[2]+value-project.axes.input[2])>10000))return;
  const axes={...project.axes,[which]:project.axes[which].map((n,i)=>i===coordinate?value:n) as Vec3};
  const delta=value-project.axes[which][coordinate];
  edit({...project,axes,components:project.components.map(c=>{
   const position=[...c.position] as Vec3;
   if(coordinate===2&&which==='input')position[2]+=delta;
   else if(coordinate<2&&c.id===project[which].component)position[coordinate]=value;
   return {...c,position};
  })});
 }
 const compared=(results?.solutions||[]).filter(s=>filter==='all'||s.kind===filter).slice().sort((a,b)=>sort==='area'?a.width*a.height-b.width*b.height:sort==='shafts'?a.shafts-b.shafts||a.error-b.error:a.error-b.error);
 function saveLocal(){try{localStorage.setItem(STORAGE_KEY,serializeProject(project));setStorageStatus('Lokal gespeichert. Wird beim nächsten Öffnen wiederhergestellt.');}catch(e){setStorageStatus(`Speichern fehlgeschlagen: ${e}`);}}
 function exportProject(){const url=URL.createObjectURL(new Blob([serializeProject(project)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='mechanics10-project.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 async function importProject(file?:File){if(!file)return;try{if(file.size>100000)throw Error('Projektdatei ist zu groß (max. 100 KB).');const p=parseProject(await file.text());edit(p);setStorageStatus('Projektdatei geladen. Zum Behalten lokal speichern.');}catch(e){setStorageStatus(`Import abgelehnt: ${e}`);}finally{if(fileInput.current)fileInput.current.value='';}}
 return <main><header><span>MECHANICS–10 / LAB</span><h1>Feste Achsen. Passende Getriebe.</h1><p>Gemischte Ketten · Feste Anschlüsse, gekoppelte Stufen und gemeinsame Konstruktion.</p></header>
 <section className="project-bar"><label>Projektname<input aria-label="Projektname" value={project.name} maxLength={100} disabled={busy} onChange={e=>{if(e.target.value.trim())edit({...project,name:e.target.value});}}/></label><div className="actions"><button id="save-project" onClick={saveLocal} disabled={busy}>Lokal speichern</button><button id="export-project" onClick={exportProject} disabled={busy}>JSON exportieren</button><button id="import-project" onClick={()=>fileInput.current?.click()} disabled={busy}>JSON öffnen</button><button id="new-project" onClick={()=>edit(initialProject())} disabled={busy}>Neues Projekt</button><input ref={fileInput} id="project-file" type="file" accept=".json,application/json" hidden onChange={e=>importProject(e.target.files?.[0])}/></div><p id="storage-status" aria-live="polite">{storageStatus||'Noch nicht lokal gespeichert.'}</p></section>
 <section className="card"><label>Baugruppen-Vorlage<select id="mechanism-kind" value={project.mixed?'mixed':project.spatial?.kind??project.motion?.kind??'gears'} disabled={busy} onChange={e=>{const {motion,spatial,mixed,...rest}=project;const kind=e.target.value;edit(kind==='gears'?rest:kind==='mixed'?{...rest,mixed:defaultMixed()}:['internal','bevel','worm'].includes(kind)?{...rest,spatial:defaultSpatial(kind as Spatial['kind'])}:{...rest,motion:defaultMotion(kind as Motion['kind'])});}}><option value="gears">Stirnradgetriebe (Etappen A–D)</option><option value="belt">GT2-Riementrieb</option><option value="screw">Geführte Spindelachse</option><option value="rack">Geführte Zahnstangenachse</option><option value="mixed">Gemischte Kettensuche</option><option value="internal">Innenverzahnung</option><option value="bevel">Kegelradpaar</option><option value="worm">Schnecke / Schneckenrad</option></select></label></section>
 <Workbench project={project} onChange={edit} busy={busy} axisEdit={axisEdit}/>
 {project.mixed?<MixedPanel mixed={project.mixed} onChange={mixed=>edit({...project,mixed})} busy={busy} onBusy={setBusy} projectJSON={serializeProject(project)}/>:project.spatial?<SpatialPanel spatial={project.spatial} onChange={spatial=>edit({...project,spatial})} busy={busy} onBusy={setBusy} projectJSON={serializeProject(project)}/>:project.motion?<MotionPanel motion={project.motion} onChange={motion=>edit({...project,motion})} busy={busy} onBusy={setBusy} projectJSON={serializeProject(project)}/>:<>
 <section className="layout"><aside><h2>Suchvorgaben</h2><label htmlFor="ratio">Soll-Untersetzung (Eingang / Ausgang)</label><input id="ratio" type="number" min="0.01" max="100" step="0.1" value={project.targetRatio} disabled={busy} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n)&&n>0&&n<=100)edit({...project,targetRatio:n});}}/>
 <p>Die Achsen bleiben fest. Zahnräder dürfen entlang der parallelen +Z-Wellen auf zwei Ebenen liegen.</p>
 {(['input','output'] as const).map(which=><fieldset key={which}><legend>{which==='input'?'Eingangsachse':'Ausgangsachse'}</legend><div className="coordinates">{['X','Y'].map((axis,k)=><label key={axis}>{axis} [mm]<input aria-label={`${which} axis ${axis}`} type="number" value={project.axes[which][k]} disabled={busy} onChange={e=>axisEdit(which,k,Number(e.target.value))}/></label>)}</div></fieldset>)}
 <label>Ebene 1 · Z [mm]<input aria-label="plane Z" type="number" value={project.axes.input[2]} disabled={busy} onChange={e=>axisEdit('input',2,Number(e.target.value))}/></label>
 <label>Ebenen<select id="max-layers" disabled={busy} value={project.search.maxLayers} onChange={e=>edit({...project,search:{...project.search,maxLayers:Number(e.target.value) as 1|2}})}><option value="1">Eine Ebene</option><option value="2">Bis zu zwei Ebenen</option></select></label>
 {([{key:'layerSpacing',label:'Ebenenabstand [mm]',min:10,max:100},{key:'margin',label:'Minimaler Freiraum [mm]',min:0,max:20},{key:'maxError',label:'Maximale Abweichung [%]',min:0,max:1000}] as const).map(f=><label key={f.key}>{f.label}<input id={f.key} type="number" step="0.1" min={f.min} max={f.max} disabled={busy} value={project.search[f.key]} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n)&&n>=f.min&&n<=f.max)edit({...project,search:{...project.search,[f.key]:n}});}}/></label>)}
 <label>Drehrichtung<select id="direction" value={project.search.direction} disabled={busy} onChange={e=>edit({...project,search:{...project.search,direction:e.target.value as Project['search']['direction']}})}><option value="any">Beliebig</option><option value="same">Gleichläufig</option><option value="opposite">Gegenläufig</option></select></label>
 <div className="actions"><button id="search" onClick={()=>run(true)} disabled={busy}>Anordnungen suchen</button><button id="render" onClick={()=>run(false)} disabled={busy||!(view==='gears'?resolved.valid:housing.valid)}>Projekt rendern</button><button id="cancel" onClick={cancel} disabled={!busy}>Abbrechen</button></div><p role="status">{status}</p>
 <p><a href="#housing-panel">Lagerung & Einzelteile ↓</a></p><h2>Aktuelles Projekt</h2><dl><dt>Zähne Eingang → Ausgang</dt><dd>{resolved.components[0].gear.teeth} → {resolved.components[resolved.components.length-1].gear.teeth}</dd><dt>Ist-Untersetzung</dt><dd>{Number(resolved.ratio.toFixed(4))}:1 · {resolved.direction}</dd><dt>Abweichung</dt><dd>{(resolved.error*100).toFixed(2)} %</dd><dt>Achsabstand</dt><dd>{resolved.actualDistance.toFixed(3)} mm</dd>{version&&<><dt>SWI-Prolog</dt><dd>{Math.floor(version/10000)}.{Math.floor(version/100)%100}.{version%100}</dd></>}</dl>
 {download&&<a download="mechanics10-assembly.stl" href={download}>STL herunterladen</a>}<p className="note">Die Anordnungsvorschau zeigt die Verzahnung. Gehäuse und Druckteile unten separat prüfen. Physischer Druck- und Montagetest steht aus.</p></aside>
 <div className="viewer">{preview?React.createElement('model-viewer',{src:preview,'camera-controls':true,'camera-orbit':'45deg 45deg auto',loading:'eager',orientation:'0deg -90deg 0deg',style:{width:'100%',height:'100%'}}):<div className="empty">{resolved.valid?'Projekt bereit für die Vorschau.':'Paarung prüfen und korrigieren.'}<small>Gerenderte Ergebnisse werden bei Änderungen verworfen.</small></div>}</div></section>
 <section className="card housing" id="housing-panel"><h2>Lagerung & Gehäuse</h2><p>Zwei abnehmbare Lagerplatten, vier Abstandshalter und zwei Lager je Welle. Lagersitze öffnen nach innen; die obere Platte lässt sich axial abnehmen.</p>
 <div className="edit-grid">{([{key:'plateThickness',label:'Plattendicke [mm]',min:4,max:15},{key:'clearance',label:'Gehäuse-Freiraum [mm]',min:1,max:20},{key:'bearingFit',label:'Lagersitz-Aufmaß im Durchmesser [mm]',min:0,max:0.5},{key:'endplay',label:'Axiales Gesamtspiel [mm]',min:0.1,max:0.8}] as const).map(f=><label key={f.key}>{f.label}<input id={`housing-${f.key}`} type="number" step="0.05" min={f.min} max={f.max} value={housing.h[f.key]} disabled={busy} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n)&&n>=f.min&&n<=f.max)edit({...project,housing:{...housing.h,[f.key]:n}});}}/></label>)}</div>
 <p id="housing-summary">{housing.shafts.length} Wellen · {housing.shafts.length*2} Lager 5 × 8 × 2,5 mm · Platten {housing.width.toFixed(1)} × {housing.depth.toFixed(1)} mm · Innenabstand {housing.gap.toFixed(1)} mm</p>
 <div className="actions"><button id="view-gears" disabled={busy||!resolved.valid} onClick={()=>show('gears')}>Verzahnung</button><button id="view-housing" disabled={busy||!housing.valid} onClick={()=>show('housing')}>Gehäuse montiert</button><button id="view-exploded" disabled={busy||!housing.valid} onClick={()=>show('exploded')}>Platten abheben</button><button id="export-parts" disabled={busy||!housing.valid} onClick={()=>exportParts()}>Alle Druckteile als ZIP erzeugen</button></div>
 <p aria-live="polite">{busy?status:housing.valid?'Geometrische Gehäuseprüfung bestanden. Druck- und Montageversuch noch offen.':'Gehäuseexport blockiert: Naben-/Montagefreiraum prüfen.'}</p>
 <details><summary>Gehäuse- und Montageprüfung</summary><ul id="housing-checks">{housing.checks.map(c=><li key={c.id} data-state={c.state}>{c.state==='pass'?'✓':c.state==='fail'?'✕':'?'} {c.message}</li>)}</ul></details>
 {housing.valid&&<div className="table-scroll"><table id="parts"><thead><tr><th>Druckteil</th><th>Anzahl</th><th>Export</th></tr></thead><tbody>{printableParts(project).map(p=><tr key={p.id}><td>{p.name}</td><td>{p.quantity}</td><td><button data-part={p.id} disabled={busy} onClick={()=>exportParts(p.id)}>STL erzeugen</button></td></tr>)}</tbody></table></div>}
 <div id="part-downloads" className="actions">{partLinks.map(p=><a key={p.id} href={p.url} download={`${p.id}.${p.id==='mechanics10-parts'?'zip':'stl'}`}>{p.name} herunterladen</a>)}</div>
 <details><summary>Kauf- und Zuschnittteile</summary><table id="bom"><thead><tr><th>Teil</th><th>Anzahl</th><th>Hinweis</th></tr></thead><tbody>{housing.bom.map((b,i)=><tr key={i}><td>{b.name}</td><td>{b.quantity}</td><td>{b.note}</td></tr>)}</tbody></table></details>
 <details><summary>Montagefolge und Druckhinweise</summary><pre>{assemblyInstructions(project)}</pre></details></section>
 {results&&<section className="card results"><h2>Lösungen vergleichen</h2><p>{results.templates} Katalogkombinationen · {results.placements} Positionierungen · {results.rejected} verworfen · {results.valid} gültig.{results.truncated?' Gezeigt werden bis zu 60 Varianten einschließlich der besten je Bauart.':''}</p><p className="note">Vier Kettenvorlagen: Direktpaar, ein oder zwei Zwischenräder, ein Doppelzahnrad. Zwei Zwischenräder: 15°-Winkelraster. Keine Vollständigkeitsgarantie. Hüllkörper und Wellenkorridore geprüft. Die gewählte Variante wird zusätzlich auf Gehäuse- und Nabenfreiraum geprüft.</p>
 <div className="compare-controls"><label>Bauart<select id="kind-filter" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Alle Bauarten</option>{Object.entries(KIND_NAMES).map(([key,name])=><option key={key} value={key}>{name}</option>)}</select></label><label>Sortierung<select id="sort" value={sort} onChange={e=>setSort(e.target.value)}><option value="error">Geringste Abweichung</option><option value="area">Kleinste Hüllfläche</option><option value="shafts">Wenigste Wellen</option></select></label></div>
 <div className="table-scroll"><table id="solutions"><thead><tr><th>Bauart / Zähne</th><th>Ist / Abweichung</th><th>Drehrichtung</th><th>Wellen / Ebenen</th><th>Hülle X × Y</th><th>Auswahl</th></tr></thead><tbody>{compared.map((s,i)=><tr key={i} data-kind={s.kind}><td>{KIND_NAMES[s.kind]}<small>{s.project.components.map(c=>`${CATALOG.find(g=>g.id===c.catalogId)!.teeth} (m${CATALOG.find(g=>g.id===c.catalogId)!.module})`).join(' → ')}</small></td><td>{Number(s.ratio.toFixed(4))}:1<small>{(s.error*100).toFixed(2)} %</small></td><td>{s.direction}</td><td>{s.shafts} / {s.layers}</td><td>{s.width.toFixed(1)} × {s.height.toFixed(1)} mm</td><td><button disabled={busy} onClick={()=>choose(s)}>Übernehmen & rendern</button></td></tr>)}</tbody></table></div>{!compared.length&&<p>Keine Variante für diese Auswahl. Suchvorgaben oder Bauartfilter ändern.</p>}</section>}
 <section className="edit-grid">{project.components.map(c=><section className="card" key={c.id}><h2>{c.id===project.input.component?'Eingang':c.id===project.output.component?'Ausgang':'Zwischenrad'} · {c.id}</h2><label>Katalogbauteil<select aria-label={`${c.id} Katalog`} disabled={busy} value={c.catalogId} onChange={e=>edit({...project,components:project.components.map(i=>i.id===c.id?{...i,catalogId:e.target.value}:i)})}>{CATALOG.map(g=><option key={g.id} value={g.id}>Modul {g.module} · {g.teeth} Zähne · 10 mm breit</option>)}</select></label>
 <div className="coordinates">{['X','Y','Z'].map((axis,k)=><label key={axis}>{axis} [mm]<input aria-label={`${c.id} ${axis}`} type="number" step="1" min="-10000" max="10000" value={c.position[k]} disabled={busy} onChange={e=>{const n=Number(e.target.value);if(!Number.isFinite(n)||Math.abs(n)>10000)return;const position=[...c.position] as [number,number,number];position[k]=n;edit({...project,components:project.components.map(i=>i.id===c.id?{...i,position}:i)});}}/></label>)}</div><p className="note">Anschlüsse: shaft (Bohrung Ø 5,1 mm) · teeth (Außenverzahnung). Achse +Z. Position bezeichnet die Zahnradmitte; Zahnstellung wird aus der Paarung abgeleitet.</p></section>)}</section>
 <section className="card"><h2>Paarungsregeln</h2>{project.connections.map((c,i)=><p key={i}>{c.a.component}.{c.a.port} ↔ {c.b.component}.{c.b.port} · {c.kind==='rigid-shaft'?'starr verbunden':'Verzahnung'}</p>)}<ul id="checks">{resolved.checks.map(c=><li key={c.id} data-state={c.state}><strong>{c.state==='pass'?'✓':c.state==='fail'?'✕':'?'} </strong>{c.message}</li>)}</ul></section>
 <details><summary>Anschlüsse im Weltkoordinatensystem</summary><pre>{JSON.stringify(resolved.ports,null,2)}</pre></details><details><summary>Projektdatei · Version 5</summary><pre>{serializeProject(project)}</pre></details><details open><summary>Generierter OpenSCAD-Code</summary><pre>{source||'Erzeugung blockiert: Paarungsregeln verletzt.'}</pre></details><details><summary>OpenSCAD-Protokoll</summary><pre>{logs}</pre></details></>}</main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
