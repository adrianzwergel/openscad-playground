import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {parseOff} from '../io/import_off';
import {exportGlb} from '../io/export_glb';
import {CATALOG, Project, initialProject, parseProject, serializeProject, resolveProject, generateScad, alignPair, solverCatalog, applySolution} from './model';
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
 const active=useRef<{worker:Worker,reject:(e:Error)=>void}>();
 const generation=useRef(0);
 const fileInput=useRef<HTMLInputElement>(null);
 const resolved=resolveProject(project);
 const source=resolved.valid?generateScad(project):'';
 useEffect(()=>()=>{active.current?.reject(new Error('Ansicht geschlossen'));},[]);
 useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview);},[preview]);
 useEffect(()=>()=>{if(download)URL.revokeObjectURL(download);},[download]);
 function edit(next:Project){generation.current++;active.current?.reject(new Error('Projekt geändert'));setBusy(false);setProject(next);setPreview('');setDownload('');setLogs('');setVersion(undefined);setStatus('Projekt geändert — Vorschau neu rendern.');setStorageStatus('Ungespeicherte Änderungen');}
 function job(file:string,data:unknown){return new Promise<any>((resolve,reject)=>{
  const worker=new Worker(file);const timer=setTimeout(()=>finish(new Error('Zeitlimit überschritten (120 s).')),120000);
  const finish=(error?:Error,value?:unknown)=>{clearTimeout(timer);worker.terminate();if(active.current?.worker===worker)active.current=undefined;error?reject(error):resolve(value);};
  active.current={worker,reject:e=>finish(e)};worker.onerror=e=>finish(new Error(e.message));worker.onmessage=e=>e.data.error?finish(new Error(e.data.error)):finish(undefined,e.data);worker.postMessage(data);
 });}
 function cancel(){generation.current++;active.current?.reject(new Error('Abgebrochen'));setBusy(false);setStatus('Abgebrochen');}
 async function run(search:boolean){
  const id=++generation.current;setBusy(true);setPreview('');setDownload('');setLogs('');let current=project;
  try{
   if(search){setStatus('Prolog lädt und sucht …');const p=await job('./prolog-worker.js',{target:project.targetRatio,catalog:solverCatalog()});if(id!==generation.current)return;current=applySolution(project,p.solution.IdA,p.solution.IdB);setProject(current);setStorageStatus('Ungespeicherte Änderungen');setVersion(p.version);}
   const scad=generateScad(current);setStatus('OpenSCAD rendert …');
   const r=await job('./mechanics-render-worker.js',{source:scad});if(id!==generation.current)return;
   const glb=await exportGlb(parseOff(r.off));if(id!==generation.current)return;
   setPreview(URL.createObjectURL(glb));setDownload(URL.createObjectURL(new Blob([r.stl],{type:'application/octet-stream'})));setLogs(r.logs.join('\n'));setStatus('Fertig — Projekt → OpenSCAD → 3D');
  }catch(e){if(id===generation.current)setStatus(String(e));}finally{if(id===generation.current)setBusy(false);}
 }
 function saveLocal(){try{localStorage.setItem(STORAGE_KEY,serializeProject(project));setStorageStatus('Lokal gespeichert. Wird beim nächsten Öffnen wiederhergestellt.');}catch(e){setStorageStatus(`Speichern fehlgeschlagen: ${e}`);}}
 function exportProject(){const url=URL.createObjectURL(new Blob([serializeProject(project)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='mechanics10-project.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 async function importProject(file?:File){if(!file)return;try{if(file.size>100000)throw Error('Projektdatei ist zu groß (max. 100 KB).');const p=parseProject(await file.text());edit(p);setStorageStatus('Projektdatei geladen. Zum Behalten lokal speichern.');}catch(e){setStorageStatus(`Import abgelehnt: ${e}`);}finally{if(fileInput.current)fileInput.current.value='';}}
 return <main><header><span>MECHANICS–10 / LAB</span><h1>Deine Komponenten. Ein gemeinsames Modell.</h1><p>Etappe B · Katalog, Anschlüsse, Paarungsregeln und speicherbare Projekte.</p></header>
 <section className="project-bar"><label>Projektname<input aria-label="Projektname" value={project.name} maxLength={100} disabled={busy} onChange={e=>{if(e.target.value.trim())edit({...project,name:e.target.value});}}/></label><div className="actions"><button id="save-project" onClick={saveLocal} disabled={busy}>Lokal speichern</button><button id="export-project" onClick={exportProject} disabled={busy}>JSON exportieren</button><button id="import-project" onClick={()=>fileInput.current?.click()} disabled={busy}>JSON öffnen</button><button id="new-project" onClick={()=>edit(initialProject())} disabled={busy}>Neues Projekt</button><input ref={fileInput} id="project-file" type="file" accept=".json,application/json" hidden onChange={e=>importProject(e.target.files?.[0])}/></div><p id="storage-status" aria-live="polite">{storageStatus||'Noch nicht lokal gespeichert.'}</p></section>
 <section className="layout"><aside><h2>Stirnradpaar</h2><label htmlFor="ratio">Soll-Untersetzung (Eingang / Ausgang)</label><input id="ratio" type="number" min="0.01" max="100" step="0.1" value={project.targetRatio} disabled={busy} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n)&&n>0&&n<=100)edit({...project,targetRatio:n});}}/>
 <p>Prolog sucht im gemeinsamen Katalog. Die Suche ersetzt beide Räder und ordnet den Ausgang entlang +X relativ zum Eingang an.</p>
 <div className="actions"><button id="search" onClick={()=>run(true)} disabled={busy}>Suchen & rendern</button><button id="render" onClick={()=>run(false)} disabled={busy||!resolved.valid}>Projekt rendern</button><button id="cancel" onClick={cancel} disabled={!busy}>Abbrechen</button></div><p role="status">{status}</p>
 <dl><dt>Zähne Eingang → Ausgang</dt><dd>{resolved.components[0].gear.teeth} → {resolved.components[1].gear.teeth}</dd><dt>Ist-Untersetzung</dt><dd>{resolved.ratio}:1 · {resolved.direction}</dd><dt>Abweichung</dt><dd>{(resolved.error*100).toFixed(2)} %</dd><dt>Achsabstand</dt><dd>{resolved.actualDistance.toFixed(3)} mm</dd>{version&&<><dt>SWI-Prolog</dt><dd>{Math.floor(version/10000)}.{Math.floor(version/100)%100}.{version%100}</dd></>}</dl>
 {download&&<a download="mechanics10-pair.stl" href={download}>STL herunterladen</a>}<p className="note">Geometrisches Paarungsmodell. Lager, Gehäuse, Fertigung und Montage sind noch nicht validiert.</p></aside>
 <div className="viewer">{preview?React.createElement('model-viewer',{src:preview,'camera-controls':true,'camera-orbit':'45deg 45deg auto',loading:'eager',orientation:'0deg -90deg 0deg',style:{width:'100%',height:'100%'}}):<div className="empty">{resolved.valid?'Projekt bereit für die Vorschau.':'Paarung prüfen und korrigieren.'}<small>Gerenderte Ergebnisse werden bei Änderungen verworfen.</small></div>}</div></section>
 <section className="edit-grid">{project.components.map(c=><section className="card" key={c.id}><h2>{c.id===project.input.component?'Eingang':'Ausgang'} · {c.id}</h2><label>Katalogbauteil<select aria-label={`${c.id} Katalog`} disabled={busy} value={c.catalogId} onChange={e=>edit({...project,components:project.components.map(i=>i.id===c.id?{...i,catalogId:e.target.value}:i)})}>{CATALOG.map(g=><option key={g.id} value={g.id}>Modul {g.module} · {g.teeth} Zähne · 10 mm breit</option>)}</select></label>
 <div className="coordinates">{['X','Y','Z'].map((axis,k)=><label key={axis}>{axis} [mm]<input aria-label={`${c.id} ${axis}`} type="number" step="1" min="-10000" max="10000" value={c.position[k]} disabled={busy} onChange={e=>{const n=Number(e.target.value);if(!Number.isFinite(n)||Math.abs(n)>10000)return;const position=[...c.position] as [number,number,number];position[k]=n;edit({...project,components:project.components.map(i=>i.id===c.id?{...i,position}:i)});}}/></label>)}</div><p className="note">Anschlüsse: shaft (Bohrung Ø 5,1 mm) · teeth (Außenverzahnung). Achse +Z. Position bezeichnet die Zahnradmitte; Zahnstellung wird aus der Paarung abgeleitet.</p></section>)}</section>
 <section className="card"><h2>Paarungsregeln</h2><p>Verbindung: {project.connections[0].a.component}.teeth ↔ {project.connections[0].b.component}.teeth</p><ul id="checks">{resolved.checks.map(c=><li key={c.id} data-state={c.state}><strong>{c.state==='pass'?'✓':c.state==='fail'?'✕':'?'} </strong>{c.message}</li>)}</ul><button id="align" disabled={busy} onClick={()=>edit(alignPair(project))}>Ausgang passend auf +X anordnen</button></section>
 <details><summary>Anschlüsse im Weltkoordinatensystem</summary><pre>{JSON.stringify(resolved.ports,null,2)}</pre></details><details><summary>Projektdatei · Version 1</summary><pre>{serializeProject(project)}</pre></details><details open><summary>Generierter OpenSCAD-Code</summary><pre>{source||'Erzeugung blockiert: Paarungsregeln verletzt.'}</pre></details><details><summary>OpenSCAD-Protokoll</summary><pre>{logs}</pre></details></main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
