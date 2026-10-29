import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {parseOff} from '../io/import_off';
import {exportGlb} from '../io/export_glb';
import './style.css';

function App() {
  const [target,setTarget]=useState('2.1');
  const [status,setStatus]=useState('Bereit');
  const [busy,setBusy]=useState(false);
  const [result,setResult]=useState<any>();
  const [source,setSource]=useState('');
  const [preview,setPreview]=useState('');
  const [download,setDownload]=useState('');
  const [logs,setLogs]=useState('');
  const active=useRef<{worker:Worker,reject:(e:Error)=>void}>();
  const generation=useRef(0);
  useEffect(()=>()=>{active.current?.worker.terminate();},[]);
  useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview);},[preview]);
  useEffect(()=>()=>{if(download)URL.revokeObjectURL(download);},[download]);
  function job(file:string,data:unknown) {
    return new Promise<any>((resolve,reject)=>{
      const worker=new Worker(file);
      const timer=setTimeout(()=>finish(new Error('Zeitlimit überschritten (120 s).')),120000);
      const finish=(error?:Error,value?:unknown)=>{clearTimeout(timer);worker.terminate();if(active.current?.worker===worker)active.current=undefined;error?reject(error):resolve(value);};
      active.current={worker,reject:e=>finish(e)};
      worker.onerror=e=>finish(new Error(e.message));
      worker.onmessage=e=>e.data.error?finish(new Error(e.data.error)):finish(undefined,e.data);
      worker.postMessage(data);
    });
  }
  function cancel(){generation.current++;active.current?.reject(new Error('Abgebrochen'));setBusy(false);setStatus('Abgebrochen');}
  async function run(){
    const value=Number(target);if(!Number.isFinite(value)||value<=0||value>100){setStatus('Bitte eine Übersetzung größer 0 bis 100 eingeben.');return;}
    const id=++generation.current;setBusy(true);setResult(undefined);setPreview('');setDownload('');setSource('');setLogs('');
    try{
      setStatus('Prolog lädt und sucht …');
      const p=await job('./prolog-worker.js',{target:value});if(id!==generation.current)return;
      const s=p.solution;setResult({...s,version:p.version});
      const scad=`include <BOSL2/std.scad>\ninclude <BOSL2/gears.scad>\n$fn=48;\n// Prolog: ${s.A} -> ${s.B}; Soll ${value}; Ist ${s.Actual}\nspur_gear(mod=2, teeth=${s.A}, thickness=10, shaft_diam=5.1, pressure_angle=20, profile_shift=0, backlash=0.15, spin=-90);\ntranslate([${s.Distance},0,0]) spur_gear(mod=2, teeth=${s.B}, thickness=10, shaft_diam=5.1, pressure_angle=20, profile_shift=0, backlash=0.15, spin=90-180/${s.B});\n`;
      setSource(scad);setStatus('OpenSCAD rendert …');
      const r=await job('./mechanics-render-worker.js',{source:scad});if(id!==generation.current)return;
      const glb=await exportGlb(parseOff(r.off));if(id!==generation.current)return;
      setPreview(URL.createObjectURL(new Blob([glb],{type:'model/gltf-binary'})));
      setDownload(URL.createObjectURL(new Blob([r.stl],{type:'application/octet-stream'})));
      setLogs(r.logs.join('\n'));setStatus('Fertig — Prolog → OpenSCAD → 3D');
    }catch(e){if(id===generation.current)setStatus(String(e));}
    finally{if(id===generation.current)setBusy(false);}
  }
  return <main><header><span>MECHANICS–10 / LAB</span><h1>Von Regeln zu Geometrie.</h1><p>Etappe A · Prolog und OpenSCAD arbeiten lokal in deinem Browser.</p></header>
  <section className="layout"><aside><h2>Zahnradpaar suchen</h2><label htmlFor="ratio">Soll-Untersetzung (Eingang / Ausgang)</label><input id="ratio" type="number" min="0.01" max="100" step="0.1" value={target} disabled={busy} onChange={e=>setTarget(e.target.value)}/><p>Katalog: 20, 30, 40, 50 Zähne · Modul 2 · 20° · gegenläufig.</p><button onClick={run} disabled={busy}>Suchen & rendern</button> <button onClick={cancel} disabled={!busy}>Abbrechen</button><p role="status">{status}</p>
  {result&&<dl><dt>Zähne Eingang → Ausgang</dt><dd>{result.A} → {result.B}</dd><dt>Ist-Untersetzung</dt><dd>{result.Actual}:1</dd><dt>Abweichung</dt><dd>{(result.Error*100).toFixed(2)} %</dd><dt>Achsabstand</dt><dd>{result.Distance} mm</dd><dt>SWI-Prolog Laufzeit</dt><dd>{Math.floor(result.version/10000)}.{Math.floor(result.version/100)%100}.{result.version%100}</dd></dl>}
  {download&&<a download="mechanics10-pair.stl" href={download}>STL herunterladen</a>}<p className="note">Technischer Durchstich. Noch keine freie Platzierung, Lagerung, Gehäuse- oder Montageprüfung.</p></aside>
  <div className="viewer">{preview?React.createElement('model-viewer',{src:preview,'camera-controls':true,'camera-orbit':'45deg 45deg auto',loading:'eager',orientation:'0deg -90deg 0deg',style:{width:'100%',height:'100%'}}):<div className="empty">Eine Vorgabe. Zwei Laufzeiten.<br/>Ein echtes 3D-Modell.</div>}</div></section>
  <details open><summary>Generierter OpenSCAD-Code</summary><pre>{source||'Wird aus dem Prolog-Ergebnis erzeugt.'}</pre></details><details><summary>OpenSCAD-Protokoll</summary><pre>{logs}</pre></details></main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
