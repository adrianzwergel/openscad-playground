import React,{useEffect,useRef,useState} from 'react';
import type {Mechanism} from './graph/contracts';
import {mechanismCAD} from './graph/model';
import {parseOff} from '../io/import_off';
import type {IndexedPolyhedron} from '../io/common';
import {SpaceViewer} from './SpaceViewer';
export function SolutionPreview({graph,label,onClose}:{graph:Mechanism;label:string;onClose:()=>void}){
 const container=useRef<HTMLElement>(null);
 const [mesh,setMesh]=useState<IndexedPolyhedron>(),[status,setStatus]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{
  container.current?.scrollIntoView({block:'start'});
  let active=true,worker:Worker|undefined,timer:ReturnType<typeof setTimeout>;
  setMesh(undefined);setStatus('3D-Geometrie wird erzeugt …');
  const fail=(message:string)=>{clearTimeout(timer);worker?.terminate();if(active)setStatus(message);};
  try{
   worker=new Worker('./mechanics-render-worker.js');
   timer=setTimeout(()=>fail('Zeitlimit überschritten. Bitte erneut versuchen.'),120000);
   worker.onerror=e=>{e.preventDefault();fail(`3D-Vorschau fehlgeschlagen: ${e.message}`);};
   worker.onmessage=async ({data})=>{
    clearTimeout(timer);worker?.terminate();if(!active)return;
    if(data.error){fail(`3D-Vorschau fehlgeschlagen: ${data.error}`);return;}
    try{const mesh=parseOff(data.off);mesh.colors=mesh.colors.map(()=>[.12,.3,.28,1]);if(!active)return;setMesh(mesh);setStatus('3D-Vorschau bereit.');}
    catch(e){fail(`3D-Vorschau fehlgeschlagen: ${String(e)}`);}
   };
   worker.postMessage({source:mechanismCAD(graph).source});
  }catch(e){fail(String(e));}
  return ()=>{active=false;clearTimeout(timer);worker?.terminate();};
 },[graph,retry]);
 return <section ref={container} id="solution-preview" className="card" aria-label="3D-Prüfung einer Suchlösung"><h3>{label} · 3D-Prüfung</h3><button onClick={onClose}>Vorschau schließen</button> <button id="solution-preview-retry" onClick={()=>setRetry(n=>n+1)}>Neu laden</button><p id="solution-preview-status" role="status">{status}</p>{mesh&&<SpaceViewer mesh={mesh} graph={graph} id="solution-model"/>}<p>Mit der Maus drehen und zoomen. Diese Vorschau verändert das Projekt nicht. Geometrischer Prüfaufbau mit schaltbaren Prüfebenen. Keine Montagefreigabe.</p></section>;
}
