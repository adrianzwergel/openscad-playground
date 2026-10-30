import React,{useEffect,useRef,useState} from 'react';
import type {IndexedPolyhedron} from '../io/common';
import type {Mechanism} from './graph/contracts';
import {inspectionMesh} from './graph/inspection-mesh';
import {exportGlb} from '../io/export_glb';
export function SpaceViewer({mesh,graph,id}:{mesh:IndexedPolyhedron;graph:Mechanism;id:string}){
 const [layers,setLayers]=useState({bounds:true,obstacles:true,clearances:true}),[url,setUrl]=useState(''),[error,setError]=useState('');
 const viewer=useRef<any>(),camera=useRef<{orbit:string;target:string}>();
 useEffect(()=>{camera.current=undefined;},[mesh,graph]);
 useEffect(()=>{let active=true,objectURL='';setError('');
  if(viewer.current?.loaded)camera.current={orbit:viewer.current.getCameraOrbit().toString(),target:viewer.current.getCameraTarget().toString()};
  exportGlb(inspectionMesh(mesh,graph,layers)).then(blob=>{if(!active)return;objectURL=URL.createObjectURL(blob);setUrl(objectURL);}).catch(e=>{if(active)setError(String(e));});
  return ()=>{active=false;if(objectURL)URL.revokeObjectURL(objectURL);};
 },[mesh,graph,layers]);
 return <div data-space-viewer={id}><fieldset><legend>3D-Prüfebenen</legend>{(['bounds','obstacles','clearances'] as const).map(key=><label key={key} style={{display:'inline-block',marginRight:16}}><input data-space-layer={key} type="checkbox" checked={layers[key]} onChange={e=>setLayers({...layers,[key]:e.target.checked})}/>{key==='bounds'?'Blau: Bauraum':key==='obstacles'?'Rot: Sperrzonen':'Gelb: reservierte Freiräume'}</label>)}</fieldset><button data-space-fit onClick={()=>{camera.current=undefined;if(viewer.current){viewer.current.cameraOrbit='auto auto auto';viewer.current.cameraTarget='auto auto auto';}}}>Alles einpassen</button><p>Freiräume zeigen konservative Bauteil-, Lager-, Zugangs-, Riemen- und Bewegungshüllen über den gesamten Hub. Raumgrenzen sind ohne zusätzliche Abstandshülle dargestellt; die Prüfung berücksichtigt weiterhin den eingestellten Mindestabstand. Hilfsgeometrie gehört nicht zum Teileexport.</p>{error&&<p role="alert">Vorschau fehlgeschlagen: {error}</p>}<div style={{height:440}}>{url?React.createElement('model-viewer',{ref:viewer,id,src:url,loading:'eager','camera-controls':true,'camera-orbit':camera.current?.orbit??'auto auto auto','camera-target':camera.current?.target??'auto auto auto',orientation:'0deg -90deg 0deg',style:{width:'100%',height:'100%'}}):<p>3D-Ansicht wird vorbereitet …</p>}</div></div>;
}
