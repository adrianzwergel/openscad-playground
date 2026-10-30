import React,{useEffect,useRef,useState} from 'react';
import type {Mechanism} from './graph/contracts';
import {mechanismCAD} from './graph/model';
import {parseOff} from '../io/import_off';
import {exportGlb} from '../io/export_glb';
export function SolutionPreview({graph,label,onClose}:{graph:Mechanism;label:string;onClose:()=>void}){
 const container=useRef<HTMLElement>(null);
 const [url,setUrl]=useState(''),[status,setStatus]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{
  container.current?.scrollIntoView({block:'start'});
  let active=true,objectURL='',worker:Worker|undefined,timer:ReturnType<typeof setTimeout>;
  setUrl('');setStatus('3D-Geometrie wird erzeugt …');
  const fail=(message:string)=>{clearTimeout(timer);worker?.terminate();if(active)setStatus(message);};
  try{
   worker=new Worker('./mechanics-render-worker.js');
   timer=setTimeout(()=>fail('Zeitlimit überschritten. Bitte erneut versuchen.'),120000);
   worker.onerror=e=>{e.preventDefault();fail(`3D-Vorschau fehlgeschlagen: ${e.message}`);};
   worker.onmessage=async ({data})=>{
    clearTimeout(timer);worker?.terminate();if(!active)return;
    if(data.error){fail(`3D-Vorschau fehlgeschlagen: ${data.error}`);return;}
    try{const mesh=parseOff(data.off);mesh.colors=mesh.colors.map(()=>[.12,.3,.28,1]);const glb=await exportGlb(mesh);if(!active)return;objectURL=URL.createObjectURL(glb);setUrl(objectURL);setStatus('3D-Vorschau bereit.');}
    catch(e){fail(`3D-Vorschau fehlgeschlagen: ${String(e)}`);}
   };
   worker.postMessage({source:mechanismCAD(graph).source});
  }catch(e){fail(String(e));}
  return ()=>{active=false;clearTimeout(timer);worker?.terminate();if(objectURL)URL.revokeObjectURL(objectURL);};
 },[graph,retry]);
 return <section ref={container} id="solution-preview" className="card" aria-label="3D-Prüfung einer Suchlösung"><h3>{label} · 3D-Prüfung</h3><button onClick={onClose}>Vorschau schließen</button> <button id="solution-preview-retry" onClick={()=>setRetry(n=>n+1)}>Neu laden</button><p id="solution-preview-status" role="status">{status}</p><div style={{height:440}}>{url&&React.createElement('model-viewer',{id:'solution-model',src:url,loading:'eager','camera-controls':true,orientation:'0deg -90deg 0deg',alt:label,style:{width:'100%',height:'100%'}})}</div><p>Mit der Maus drehen und zoomen. Diese Vorschau verändert das Projekt nicht. Geometrischer Prüfaufbau; reservierte Lager-/Bewegungsräume und Sperrzonen sind hier nicht als Körper dargestellt. Keine Montagefreigabe.</p></section>;
}
