import React from 'react';
import type {Mechanism,Environment,Region} from './graph/contracts';
import type {V} from './graph/frames';
import {identity} from './graph/frames';
import {assessConstruction} from './graph/construction';

export function EnvironmentEditor({graph,onChange,busy}:{graph:Mechanism;onChange:(g:Mechanism)=>void;busy:boolean}){
 const env=graph.environment;
 const update=(environment:Environment)=>onChange({...graph,version:4,environment});
 function fit():Region{
  const boxes=assessConstruction(graph).boxes;
  const extent=(i:number,sign:number)=>boxes.map(b=>b.center[i]+sign*b.axes.reduce((s,a,j)=>s+Math.abs(a[i])*b.half[j],0));
  const low=[0,1,2].map(i=>Math.min(0,...extent(i,-1))-20),high=[0,1,2].map(i=>Math.max(0,...extent(i,1))+20);
  return {id:'workspace',frame:{...identity(),position:low.map((n,i)=>(n+high[i])/2) as V},size:low.map((n,i)=>high[i]-n) as V};
 }
 const fields=(r:Region,change:(r:Region)=>void)=><div className="coordinates">{(['position','size'] as const).map(key=>[0,1,2].map(i=><label key={key+i}>{key==='position'?'Zentrum':'Größe'} {'XYZ'[i]} [mm]<input aria-label={`${r.id} ${key} ${'XYZ'[i]}`} type="number" value={key==='position'?r.frame.position[i]:r.size[i]} onChange={e=>{if(e.target.value==='')return;const n=Number(e.target.value);if(!Number.isFinite(n)||Math.abs(n)>10000||(key==='size'&&n<=0))return;const values=[...(key==='position'?r.frame.position:r.size)] as V;values[i]=n;change(key==='position'?{...r,frame:{...r.frame,position:values}}:{...r,size:values});}}/></label>))}</div>;
 return <section className="card" id="environment-editor"><h2>Bauraum & Sperrzonen</h2><p>Quader in Weltkoordinaten. Geprüft werden auch Wellen, Riemen, Verbundhüllen, Hub- und reservierte Lager-/Werkzeugräume. Die Suche verändert diese Vorgaben nicht. Gedrehte Raumrahmen lassen sich im Graph-JSON einstellen; die schematische Ansicht zeigt alle Raumquader.</p>
 {!env?<button id="environment-enable" disabled={busy} onClick={()=>update({bounds:fit(),obstacles:[],margin:1})}>Bauraum und Sperrzonen aktivieren</button>:<fieldset disabled={busy}>
 <label>Abstand zu Raumgrenzen und Sperrzonen [mm]<input id="environment-margin" type="number" min="0" max="10" step="0.1" value={env.margin} onChange={e=>{const n=Number(e.target.value);if(e.target.value!==''&&Number.isFinite(n)&&n>=0&&n<=10)update({...env,margin:n});}}/></label>
 <label><input id="environment-bounds" type="checkbox" checked={!!env.bounds} onChange={e=>{const {bounds,...rest}=env;update(e.target.checked?{...rest,bounds:fit()}:rest);}}/>Begrenzten Bauraum verwenden</label>
 {env.bounds&&<div><h3>Bauraum</h3>{fields(env.bounds,bounds=>update({...env,bounds}))}<button onClick={()=>update({...env,bounds:fit()})}>Bauraum an aktuelle Hüllen anpassen</button></div>}
 {env.obstacles.map((o,i)=><div key={o.id} data-obstacle={o.id}><h3>Sperrzone {o.id}</h3>{fields(o,region=>update({...env,obstacles:env.obstacles.map((x,j)=>i===j?region:x)}))}<button onClick={()=>update({...env,obstacles:env.obstacles.filter((_,j)=>i!==j)})}>Sperrzone entfernen</button></div>)}
 <button id="environment-add-zone" disabled={env.obstacles.length>=12} onClick={()=>{let i=1;while(env.obstacles.some(o=>o.id==='zone-'+i))i++;update({...env,obstacles:[...env.obstacles,{id:'zone-'+i,frame:{...identity(),position:env.bounds?[...env.bounds.frame.position]:[0,0,0]},size:[20,20,20]}]});}}>Sperrzone hinzufügen</button> <button id="environment-remove" onClick={()=>{const {environment,...rest}=graph;onChange(rest);}}>Raumvorgaben entfernen</button>
 </fieldset>}</section>;
}
