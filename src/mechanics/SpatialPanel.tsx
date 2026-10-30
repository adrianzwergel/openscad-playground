import React,{useEffect,useRef,useState} from 'react';
import JSZip from 'jszip';
import {resolveSpatial} from './spatial';
import type {Spatial} from './spatial';
import {spatialCAD,spatialInstructions} from './spatial-cad';
import {parseOff} from '../io/import_off';
import {exportGlb} from '../io/export_glb';
export function SpatialPanel({spatial,onChange,busy,onBusy,projectJSON}:{spatial:Spatial;onChange:(s:Spatial)=>void;busy:boolean;onBusy:(v:boolean)=>void;projectJSON:string}){
 const a=resolveSpatial(spatial),cad=spatialCAD(spatial);
 const [view,setView]=useState<'pair'|'housing'|'open'|'exploded'>('pair');
 const [explosion,setExplosion]=useState(35);
 const [status,setStatus]=useState('Bereit'),[preview,setPreview]=useState(''),[download,setDownload]=useState<{url:string;name:string}>();
 const worker=useRef<Worker>(),reject=useRef<(e:Error)=>void>(),generation=useRef(0);
 useEffect(()=>{setPreview('');setDownload(undefined);setStatus('Vorgaben geändert – Vorschau neu erzeugen.');},[spatial]);
 useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview);},[preview]);
 useEffect(()=>()=>{if(download)URL.revokeObjectURL(download.url);},[download]);
 useEffect(()=>()=>{generation.current++;reject.current?.(Error('Ansicht geschlossen'));worker.current?.terminate();},[]);
 function cancel(){generation.current++;reject.current?.(Error('Abgebrochen'));worker.current?.terminate();onBusy(false);setStatus('Abgebrochen');}
 function job(source:string){return new Promise<any>((resolve,fail)=>{const w=new Worker('./mechanics-render-worker.js');worker.current=w;const timer=setTimeout(()=>finish(Error('Zeitlimit überschritten.')),120000);function finish(e?:Error,result?:unknown){clearTimeout(timer);w.terminate();worker.current=undefined;reject.current=undefined;e?fail(e):resolve(result);}reject.current=e=>finish(e);w.onerror=e=>finish(Error(e.message));w.onmessage=e=>e.data.error?finish(Error(e.data.error)):finish(undefined,e.data);w.postMessage({source});});}
 async function run(part?:string){
  if(!cad)return;const id=++generation.current;onBusy(true);setDownload(undefined);
  try{
   if(!part){setStatus('OpenSCAD rendert …');setPreview('');const r=await job(spatialCAD(spatial,view,explosion).source);if(id!==generation.current)return;const mesh=parseOff(r.off);mesh.colors=mesh.colors.map(()=>[0.12,0.3,0.28,1]);const glb=await exportGlb(mesh);if(id!==generation.current)return;setPreview(URL.createObjectURL(glb));setStatus('Vorschau fertig.');}
   else{
    const parts=cad.parts.filter(p=>part==='all'||p.id===part),zip=new JSZip();
    for(const [i,p] of parts.entries()){setStatus(`STL ${i+1}/${parts.length}: ${p.name}`);const r=await job(p.source);if(id!==generation.current)return;zip.file(`${p.id}.stl`,r.stl);}
    let blob:Blob,name:string;
    if(part==='all'){zip.file('project.json',projectJSON);zip.file('parts.json',JSON.stringify({printed:cad.parts.map(({source,...p})=>p),purchased:cad.bom},null,2));zip.file('checks.json',JSON.stringify({checks:a.checks,ports:a.ports,shafts:a.shafts},null,2));zip.file('MONTAGE.txt',spatialInstructions(spatial));blob=await zip.generateAsync({type:'blob'});name=`mechanics10-${spatial.kind}.zip`;}
    else{blob=new Blob([new Uint8Array(await zip.file(`${part}.stl`)!.async('uint8array'))],{type:'model/stl'});name=`${part}.stl`;}
    if(id!==generation.current)return;setDownload({url:URL.createObjectURL(blob),name});setStatus('Export fertig.');
   }
  }catch(e){if(id===generation.current)setStatus(String(e));}finally{if(id===generation.current)onBusy(false);}
 }

 const names={internal:'Innenverzahnung',bevel:'Kegelradpaar',worm:'Schnecke und Schneckenrad'};
 return <section id="spatial-panel"><div className="layout"><aside><h2>{names[spatial.kind]}</h2><p>Modul 2 · 20° · abgestimmte Baugruppen-Vorlage. Keine automatische Suche gemischter Ketten.</p>
 <label>Zähne {spatial.kind==='internal'?'Hohlrad':spatial.kind==='bevel'?'Kegelrad':'Schneckenrad'}<select id="spatial-teeth" disabled={busy} value={spatial.teeth} onChange={e=>onChange({...spatial,teeth:Number(e.target.value)})}>{(spatial.kind==='internal'?[60,80]:spatial.kind==='bevel'?[20,40]:[30,40]).map(n=><option key={n}>{n}</option>)}</select></label>
 {spatial.kind==='worm'?<label>Gangzahl<select id="spatial-starts" value={spatial.starts} disabled={busy} onChange={e=>onChange({...spatial,starts:Number(e.target.value)})}><option value="1">1 · rechtsgängig</option><option value="2">2 · rechtsgängig</option></select></label>:<p>Eingangsritzel: 20 Zähne</p>}
 <label>Gehäusefreiraum [mm]<input id="spatial-clearance" type="number" min="1" max="3" step="0.5" value={spatial.clearance} disabled={busy} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n)&&n>=1&&n<=3)onChange({...spatial,clearance:n});}}/></label>
 <label>Eingangsdrehung: {spatial.phase}°<input id="spatial-phase" type="range" min="0" max="360" step="15" value={spatial.phase} disabled={busy} onChange={e=>onChange({...spatial,phase:Number(e.target.value)})}/></label>
 <dl><dt>Ist-Untersetzung</dt><dd>{a.ratio}:1</dd><dt>Ausgangswinkel pro Eingangswinkel</dt><dd>{a.outputGain.toFixed(4)} · bezogen auf die Portachsen</dd>{a.coneAngles?<><dt>Teilkonuswinkel</dt><dd>{a.coneAngles.map(n=>n.toFixed(2)).join('° / ')}°</dd></>:<><dt>Achsabstand</dt><dd>{a.spacing.toFixed(3)} mm</dd></>}</dl>
 <label>Ansicht<select id="spatial-view" disabled={busy} value={view} onChange={e=>{setView(e.target.value as typeof view);setPreview('');}}><option value="pair">Verzahnung</option><option value="housing">Gehäuse geschlossen</option><option value="open">Gehäuse geöffnet</option><option value="exploded">Gehäuseplatten explodiert</option></select></label>
 {view==='exploded'&&<label>Plattenabstand [mm]<input id="spatial-explosion" type="range" min="0" max="80" value={explosion} disabled={busy} onChange={e=>{setExplosion(Number(e.target.value));setPreview('');}}/><small>Nur Ansicht; Lager und Wellen bleiben in Einbaulage. Neu rendern, um den Abstand anzusehen.</small></label>}
 <div className="actions"><button id="spatial-render" disabled={busy} onClick={()=>run()}>Vorschau erzeugen</button><button id="spatial-export" disabled={busy} onClick={()=>run('all')}>Druckteile als ZIP</button><button id="spatial-cancel" disabled={!busy} onClick={cancel}>Abbrechen</button></div><p id="spatial-status" role="status">{status}</p>{download&&<a id="spatial-download" href={download.url} download={download.name}>{download.name} herunterladen</a>}
 </aside><div className="viewer">{preview?React.createElement('model-viewer',{src:preview,'camera-controls':true,'camera-orbit':'35deg 65deg auto',loading:'eager',orientation:'0deg -90deg 0deg',style:{width:'100%',height:'100%'}}):<div className="empty">Vorlage bereit für die Vorschau.<small>Wellen, Lagerung und Montage unten prüfen.</small></div>}</div></div>
 <section className="card"><h2>Ausrichtung, Freiraum & Montage</h2><ul id="spatial-checks">{a.checks.map(c=><li key={c.id} data-state={c.state}>{c.state==='pass'?'✓':'?'} {c.message}</li>)}</ul><details><summary>Wellenanschlüsse und Lagerpositionen</summary><pre>{JSON.stringify({ports:a.ports,shafts:a.shafts},null,2)}</pre></details><details><summary>Montagefolge und Grenzen</summary><pre>{spatialInstructions(spatial)}</pre></details></section>
 <section className="card housing"><h2>Einzelteile</h2><table id="spatial-parts"><thead><tr><th>Druckteil</th><th>Anzahl</th><th>Export</th></tr></thead><tbody>{cad.parts.map(p=><tr key={p.id}><td>{p.name}</td><td>{p.quantity}</td><td><button data-spatial-part={p.id} disabled={busy} onClick={()=>run(p.id)}>STL erzeugen</button></td></tr>)}</tbody></table><details><summary>Kaufteile / Zuschnitt</summary><ul>{cad.bom.map((b,i)=><li key={i}>{b}</li>)}</ul></details><details><summary>OpenSCAD</summary><pre>{spatialCAD(spatial,view,explosion).source}</pre></details></section></section>;
}
