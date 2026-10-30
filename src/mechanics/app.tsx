import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {parseOff} from '../io/import_off';
import {exportGlb} from '../io/export_glb';
import {CATALOG, Project, initialProject, parseProject, serializeProject, resolveProject, generateScad, solverCatalog, distanceXY, Vec3} from './model';
import {KIND_NAMES, SearchResult, Solution} from './search';
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
 const active=useRef<{worker:Worker,reject:(e:Error)=>void}>();
 const generation=useRef(0);
 const fileInput=useRef<HTMLInputElement>(null);
 const resolved=resolveProject(project);
 const source=resolved.valid?generateScad(project):'';
 useEffect(()=>()=>{active.current?.reject(new Error('Ansicht geschlossen'));},[]);
 useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview);},[preview]);
 useEffect(()=>()=>{if(download)URL.revokeObjectURL(download);},[download]);
 function edit(next:Project,keepResults=false){generation.current++;active.current?.reject(new Error('Projekt geändert'));setBusy(false);setProject(next);setPreview('');setDownload('');setLogs('');if(!keepResults){setResults(undefined);setVersion(undefined);}setStatus('Projekt geändert — Vorschau neu rendern.');setStorageStatus('Ungespeicherte Änderungen');}
 function job(file:string,data:unknown){return new Promise<any>((resolve,reject)=>{
  const worker=new Worker(file);const timer=setTimeout(()=>finish(new Error('Zeitlimit überschritten (120 s).')),120000);
  const finish=(error?:Error,value?:unknown)=>{clearTimeout(timer);worker.terminate();if(active.current?.worker===worker)active.current=undefined;error?reject(error):resolve(value);};
  active.current={worker,reject:e=>finish(e)};worker.onerror=e=>finish(new Error(e.message));worker.onmessage=e=>e.data.error?finish(new Error(e.data.error)):finish(undefined,e.data);worker.postMessage(data);
 });}
 function cancel(){generation.current++;active.current?.reject(new Error('Abgebrochen'));setBusy(false);setStatus('Abgebrochen');}
 async function run(search:boolean,current=project){
  const id=++generation.current;setBusy(true);setLogs('');
  try{
   if(search){setResults(undefined);setStatus('Prolog sucht Katalogkombinationen …');const p=await job('./prolog-worker.js',{target:current.targetRatio,catalog:solverCatalog(),search:current.search,span:distanceXY(current.axes.input,current.axes.output)});if(id!==generation.current)return;setVersion(p.version);
    setStatus('Positionen und Freiräume werden geprüft …');const found:SearchResult=await job('./mechanics-search-worker.js',{project:current,candidates:p.candidates});if(id!==generation.current)return;setResults(found);setFilter('all');setStatus(found.valid?`${found.valid} gültige Anordnungen gefunden. Eine Variante zum Übernehmen auswählen.`:'Keine passende Anordnung im untersuchten Suchraum. Achsabstand, Abweichung, Ebenen oder Freiraum prüfen.');return;
   }
   setPreview('');setDownload('');
   const scad=generateScad(current);setStatus('OpenSCAD rendert …');
   const r=await job('./mechanics-render-worker.js',{source:scad});if(id!==generation.current)return;
   const glb=await exportGlb(parseOff(r.off));if(id!==generation.current)return;
   setPreview(URL.createObjectURL(glb));setDownload(URL.createObjectURL(new Blob([r.stl],{type:'application/octet-stream'})));setLogs(r.logs.join('\n'));setStatus('Fertig — Projekt → OpenSCAD → 3D');
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
 return <main><header><span>MECHANICS–10 / LAB</span><h1>Feste Achsen. Passende Getriebe.</h1><p>Etappe C · Räumliche Suche und Variantenvergleich auf bis zu zwei Ebenen.</p></header>
 <section className="project-bar"><label>Projektname<input aria-label="Projektname" value={project.name} maxLength={100} disabled={busy} onChange={e=>{if(e.target.value.trim())edit({...project,name:e.target.value});}}/></label><div className="actions"><button id="save-project" onClick={saveLocal} disabled={busy}>Lokal speichern</button><button id="export-project" onClick={exportProject} disabled={busy}>JSON exportieren</button><button id="import-project" onClick={()=>fileInput.current?.click()} disabled={busy}>JSON öffnen</button><button id="new-project" onClick={()=>edit(initialProject())} disabled={busy}>Neues Projekt</button><input ref={fileInput} id="project-file" type="file" accept=".json,application/json" hidden onChange={e=>importProject(e.target.files?.[0])}/></div><p id="storage-status" aria-live="polite">{storageStatus||'Noch nicht lokal gespeichert.'}</p></section>
 <section className="layout"><aside><h2>Suchvorgaben</h2><label htmlFor="ratio">Soll-Untersetzung (Eingang / Ausgang)</label><input id="ratio" type="number" min="0.01" max="100" step="0.1" value={project.targetRatio} disabled={busy} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n)&&n>0&&n<=100)edit({...project,targetRatio:n});}}/>
 <p>Die Achsen bleiben fest. Zahnräder dürfen entlang der parallelen +Z-Wellen auf zwei Ebenen liegen.</p>
 {(['input','output'] as const).map(which=><fieldset key={which}><legend>{which==='input'?'Eingangsachse':'Ausgangsachse'}</legend><div className="coordinates">{['X','Y'].map((axis,k)=><label key={axis}>{axis} [mm]<input aria-label={`${which} axis ${axis}`} type="number" value={project.axes[which][k]} disabled={busy} onChange={e=>axisEdit(which,k,Number(e.target.value))}/></label>)}</div></fieldset>)}
 <label>Ebene 1 · Z [mm]<input aria-label="plane Z" type="number" value={project.axes.input[2]} disabled={busy} onChange={e=>axisEdit('input',2,Number(e.target.value))}/></label>
 <label>Ebenen<select id="max-layers" disabled={busy} value={project.search.maxLayers} onChange={e=>edit({...project,search:{...project.search,maxLayers:Number(e.target.value) as 1|2}})}><option value="1">Eine Ebene</option><option value="2">Bis zu zwei Ebenen</option></select></label>
 {([{key:'layerSpacing',label:'Ebenenabstand [mm]',min:10,max:100},{key:'margin',label:'Minimaler Freiraum [mm]',min:0,max:20},{key:'maxError',label:'Maximale Abweichung [%]',min:0,max:1000}] as const).map(f=><label key={f.key}>{f.label}<input id={f.key} type="number" step="0.1" min={f.min} max={f.max} disabled={busy} value={project.search[f.key]} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n)&&n>=f.min&&n<=f.max)edit({...project,search:{...project.search,[f.key]:n}});}}/></label>)}
 <label>Drehrichtung<select id="direction" value={project.search.direction} disabled={busy} onChange={e=>edit({...project,search:{...project.search,direction:e.target.value as Project['search']['direction']}})}><option value="any">Beliebig</option><option value="same">Gleichläufig</option><option value="opposite">Gegenläufig</option></select></label>
 <div className="actions"><button id="search" onClick={()=>run(true)} disabled={busy}>Anordnungen suchen</button><button id="render" onClick={()=>run(false)} disabled={busy||!resolved.valid}>Projekt rendern</button><button id="cancel" onClick={cancel} disabled={!busy}>Abbrechen</button></div><p role="status">{status}</p>
 <h2>Aktuelles Projekt</h2><dl><dt>Zähne Eingang → Ausgang</dt><dd>{resolved.components[0].gear.teeth} → {resolved.components[resolved.components.length-1].gear.teeth}</dd><dt>Ist-Untersetzung</dt><dd>{Number(resolved.ratio.toFixed(4))}:1 · {resolved.direction}</dd><dt>Abweichung</dt><dd>{(resolved.error*100).toFixed(2)} %</dd><dt>Achsabstand</dt><dd>{resolved.actualDistance.toFixed(3)} mm</dd>{version&&<><dt>SWI-Prolog</dt><dd>{Math.floor(version/10000)}.{Math.floor(version/100)%100}.{version%100}</dd></>}</dl>
 {download&&<a download="mechanics10-assembly.stl" href={download}>STL herunterladen</a>}<p className="note">Geometrisches Paarungsmodell. Lager, Gehäuse, Fertigung und Montage sind noch nicht validiert.</p></aside>
 <div className="viewer">{preview?React.createElement('model-viewer',{src:preview,'camera-controls':true,'camera-orbit':'45deg 45deg auto',loading:'eager',orientation:'0deg -90deg 0deg',style:{width:'100%',height:'100%'}}):<div className="empty">{resolved.valid?'Projekt bereit für die Vorschau.':'Paarung prüfen und korrigieren.'}<small>Gerenderte Ergebnisse werden bei Änderungen verworfen.</small></div>}</div></section>
 {results&&<section className="card results"><h2>Lösungen vergleichen</h2><p>{results.templates} Katalogkombinationen · {results.placements} Positionierungen · {results.rejected} verworfen · {results.valid} gültig.{results.truncated?' Gezeigt werden bis zu 60 Varianten einschließlich der besten je Bauart.':''}</p><p className="note">Vier Kettenvorlagen: Direktpaar, ein oder zwei Zwischenräder, ein Doppelzahnrad. Zwei Zwischenräder: 15°-Winkelraster. Keine Vollständigkeitsgarantie. Hüllkörper und Wellenkorridore geprüft; Lager, Gehäuse und Montage folgen in Etappe D.</p>
 <div className="compare-controls"><label>Bauart<select id="kind-filter" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Alle Bauarten</option>{Object.entries(KIND_NAMES).map(([key,name])=><option key={key} value={key}>{name}</option>)}</select></label><label>Sortierung<select id="sort" value={sort} onChange={e=>setSort(e.target.value)}><option value="error">Geringste Abweichung</option><option value="area">Kleinste Hüllfläche</option><option value="shafts">Wenigste Wellen</option></select></label></div>
 <div className="table-scroll"><table id="solutions"><thead><tr><th>Bauart / Zähne</th><th>Ist / Abweichung</th><th>Drehrichtung</th><th>Wellen / Ebenen</th><th>Hülle X × Y</th><th>Auswahl</th></tr></thead><tbody>{compared.map((s,i)=><tr key={i} data-kind={s.kind}><td>{KIND_NAMES[s.kind]}<small>{s.project.components.map(c=>`${CATALOG.find(g=>g.id===c.catalogId)!.teeth} (m${CATALOG.find(g=>g.id===c.catalogId)!.module})`).join(' → ')}</small></td><td>{Number(s.ratio.toFixed(4))}:1<small>{(s.error*100).toFixed(2)} %</small></td><td>{s.direction}</td><td>{s.shafts} / {s.layers}</td><td>{s.width.toFixed(1)} × {s.height.toFixed(1)} mm</td><td><button disabled={busy} onClick={()=>choose(s)}>Übernehmen & rendern</button></td></tr>)}</tbody></table></div>{!compared.length&&<p>Keine Variante für diese Auswahl. Suchvorgaben oder Bauartfilter ändern.</p>}</section>}
 <section className="edit-grid">{project.components.map(c=><section className="card" key={c.id}><h2>{c.id===project.input.component?'Eingang':c.id===project.output.component?'Ausgang':'Zwischenrad'} · {c.id}</h2><label>Katalogbauteil<select aria-label={`${c.id} Katalog`} disabled={busy} value={c.catalogId} onChange={e=>edit({...project,components:project.components.map(i=>i.id===c.id?{...i,catalogId:e.target.value}:i)})}>{CATALOG.map(g=><option key={g.id} value={g.id}>Modul {g.module} · {g.teeth} Zähne · 10 mm breit</option>)}</select></label>
 <div className="coordinates">{['X','Y','Z'].map((axis,k)=><label key={axis}>{axis} [mm]<input aria-label={`${c.id} ${axis}`} type="number" step="1" min="-10000" max="10000" value={c.position[k]} disabled={busy} onChange={e=>{const n=Number(e.target.value);if(!Number.isFinite(n)||Math.abs(n)>10000)return;const position=[...c.position] as [number,number,number];position[k]=n;edit({...project,components:project.components.map(i=>i.id===c.id?{...i,position}:i)});}}/></label>)}</div><p className="note">Anschlüsse: shaft (Bohrung Ø 5,1 mm) · teeth (Außenverzahnung). Achse +Z. Position bezeichnet die Zahnradmitte; Zahnstellung wird aus der Paarung abgeleitet.</p></section>)}</section>
 <section className="card"><h2>Paarungsregeln</h2>{project.connections.map((c,i)=><p key={i}>{c.a.component}.{c.a.port} ↔ {c.b.component}.{c.b.port} · {c.kind==='rigid-shaft'?'starr verbunden':'Verzahnung'}</p>)}<ul id="checks">{resolved.checks.map(c=><li key={c.id} data-state={c.state}><strong>{c.state==='pass'?'✓':c.state==='fail'?'✕':'?'} </strong>{c.message}</li>)}</ul></section>
 <details><summary>Anschlüsse im Weltkoordinatensystem</summary><pre>{JSON.stringify(resolved.ports,null,2)}</pre></details><details><summary>Projektdatei · Version 2</summary><pre>{serializeProject(project)}</pre></details><details open><summary>Generierter OpenSCAD-Code</summary><pre>{source||'Erzeugung blockiert: Paarungsregeln verletzt.'}</pre></details><details><summary>OpenSCAD-Protokoll</summary><pre>{logs}</pre></details></main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
