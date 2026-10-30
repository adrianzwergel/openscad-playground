import React,{useEffect,useRef,useState} from 'react';
import JSZip from 'jszip';
import {resolveMotion,PULLEYS} from './motion';
import type {Motion,Box} from './motion';
import {motionCAD,motionInstructions} from './motion-cad';
import {parseOff} from '../io/import_off';
import {exportGlb} from '../io/export_glb';

export function MotionPanel({motion,onChange,busy,onBusy,projectJSON}:{motion:Motion;onChange:(m:Motion)=>void;busy:boolean;onBusy:(v:boolean)=>void;projectJSON:string}){
 const a=resolveMotion(motion),cad=a.valid?motionCAD(motion):null;
 const [status,setStatus]=useState('Bereit'),[preview,setPreview]=useState(''),[download,setDownload]=useState<{url:string;name:string}>();
 const worker=useRef<Worker>(),reject=useRef<(e:Error)=>void>(),generation=useRef(0);
 useEffect(()=>{setPreview('');setDownload(undefined);setStatus('Vorgaben geändert – Vorschau neu erzeugen.');},[motion]);
 useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview);},[preview]);
 useEffect(()=>()=>{if(download)URL.revokeObjectURL(download.url);},[download]);
 useEffect(()=>()=>{generation.current++;reject.current?.(Error('Ansicht geschlossen'));worker.current?.terminate();},[]);
 function cancel(){generation.current++;reject.current?.(Error('Abgebrochen'));worker.current?.terminate();onBusy(false);setStatus('Abgebrochen');}
 function job(source:string){return new Promise<any>((resolve,fail)=>{const w=new Worker('./mechanics-render-worker.js');worker.current=w;const timer=setTimeout(()=>finish(Error('Zeitlimit überschritten.')),120000);function finish(e?:Error,result?:unknown){clearTimeout(timer);w.terminate();worker.current=undefined;reject.current=undefined;e?fail(e):resolve(result);}reject.current=e=>finish(e);w.onerror=e=>finish(Error(e.message));w.onmessage=e=>e.data.error?finish(Error(e.data.error)):finish(undefined,e.data);w.postMessage({source});});}
 async function run(part?:string){
  if(!cad)return;const id=++generation.current;onBusy(true);setDownload(undefined);
  try{
   if(!part){setStatus('OpenSCAD rendert …');setPreview('');const r=await job(cad.source);if(id!==generation.current)return;const mesh=parseOff(r.off);mesh.colors=mesh.colors.map(()=>[0.12,0.3,0.28,1]);const glb=await exportGlb(mesh);if(id!==generation.current)return;setPreview(URL.createObjectURL(glb));setStatus('Vorschau fertig.');}
   else{
    const parts=cad.parts.filter(p=>part==='all'||p.id===part),zip=new JSZip();
    for(const [i,p] of parts.entries()){setStatus(`STL ${i+1}/${parts.length}: ${p.name}`);const r=await job(p.source);if(id!==generation.current)return;zip.file(`${p.id}.stl`,r.stl);}
    let blob:Blob,name:string;
    if(part==='all'){zip.file('project.json',projectJSON);zip.file('parts.json',JSON.stringify({printed:cad.parts.map(({source,...p})=>p),purchased:cad.bom},null,2));zip.file('checks.json',JSON.stringify({checks:a.checks,ports:a.ports,swept:a.swept},null,2));zip.file('MONTAGE.txt',motionInstructions(motion));blob=await zip.generateAsync({type:'blob'});name=`mechanics10-${motion.kind}.zip`;}
    else{blob=new Blob([new Uint8Array(await zip.file(`${part}.stl`)!.async('uint8array'))],{type:'model/stl'});name=`${part}.stl`;}
    if(id!==generation.current)return;setDownload({url:URL.createObjectURL(blob),name});setStatus('Export fertig.');
   }
  }catch(e){if(id===generation.current)setStatus(String(e));}finally{if(id===generation.current)onBusy(false);}
 }
 function number(key:keyof Motion,label:string,min:number,max:number,step=1){return <label key={key}>{label}<input id={`motion-${key}`} type="number" min={min} max={max} step={step} value={motion[key] as number} disabled={busy} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n)&&n>=min&&n<=max)onChange({...motion,[key]:n});}}/></label>;}
 return <section id="motion-panel"><div className="layout"><aside><h2>{motion.kind==='belt'?'GT2-Riementrieb':motion.kind==='screw'?'Spindelachse':'Zahnstangenachse'}</h2><p>Eigene Baugruppen-Vorlage. Die Stirnrad-Anordnung bleibt im Projekt erhalten; eine gemischte Antriebskette wird hier noch nicht automatisch zusammengesetzt.</p>
 {motion.kind==='belt'?<>
 {(['teethA','teethB'] as const).map((key,i)=><label key={key}>Zähne {i?'Ausgang':'Eingang'}<select id={`motion-${key}`} value={motion[key]} disabled={busy} onChange={e=>onChange({...motion,[key]:Number(e.target.value)})}>{PULLEYS.map(n=><option key={n}>{n}</option>)}</select></label>)}
 {number('center','Nenn-Achsabstand [mm]',40,350)}{number('travel','Freigegebener Stellweg gesamt [mm]',0,40)}
 <p>Die Ausgangs-Lagerbrücke darf sich um ±{motion.travel/2} mm verschieben. Die feste Eingangsachse bleibt stehen.</p>
 <dl><dt>Untersetzung</dt><dd>{a.ratio.toFixed(3)}:1 · gleichläufig</dd><dt>Gewählter Riemen</dt><dd>{motion.beltLength} mm · {motion.beltLength/2} Zähne</dd><dt>Berechneter Achsabstand</dt><dd>{Number.isFinite(a.c)?a.c.toFixed(3):'–'} mm</dd><dt>Umschlingung kleine Scheibe</dt><dd>{(a.wrap*180/Math.PI).toFixed(1)}°</dd></dl>
 </>:<>
 {number('stroke','Hub [mm]',20,500)}{number('guideLength','Länge Führungswellen [mm]',140,700)}
 <button id="size-guides" disabled={busy} onClick={()=>onChange({...motion,guideLength:motion.stroke+134})}>Führung auf Hub abstimmen</button>
 {motion.kind==='screw'&&<label>Spindelvorschub<select id="motion-lead" value={motion.lead} disabled={busy} onChange={e=>onChange({...motion,lead:Number(e.target.value)})}><option value="2">TR8 · 2 mm/U</option><option value="8">TR8 · 8 mm/U</option></select></label>}
 <dl><dt>Weg pro Eingangsumdrehung</dt><dd>{a.mmPerTurn.toFixed(3)} mm/U</dd><dt>Führung</dt><dd>2 × Ø8 mm · 4 × LM8UU</dd>{motion.kind==='rack'&&<><dt>Zahnstange</dt><dd>Modul 2 · {a.rackTeeth} Zähne · {a.rackLength.toFixed(1)} mm</dd></>}</dl>
 <label>Vorschauposition: {a.q.toFixed(1)} / {motion.stroke} mm<input id="motion-position" type="range" min="0" max="1" step="0.01" value={motion.position} disabled={busy} onChange={e=>onChange({...motion,position:Number(e.target.value)})}/></label><p className="note">Die Prüfung umfasst unabhängig von dieser Ansicht immer den ganzen Hub.</p>
 </>}
 {number('clearance','Mindestfreiraum [mm]',0.5,5,0.5)}
 <div className="actions"><button id="motion-render" disabled={busy||!a.valid} onClick={()=>run()}>Vorschau erzeugen</button><button id="motion-export" disabled={busy||!a.valid} onClick={()=>run('all')}>Druckteile als ZIP</button><button id="motion-cancel" disabled={!busy} onClick={cancel}>Abbrechen</button></div><p id="motion-status" role="status">{status}</p>{download&&<a id="motion-download" href={download.url} download={download.name}>{download.name} herunterladen</a>}
 </aside><div className="viewer">{preview?React.createElement('model-viewer',{src:preview,'camera-controls':true,'camera-orbit':'45deg 60deg auto',loading:'eager',orientation:'0deg -90deg 0deg',style:{width:'100%',height:'100%'}}):<div className="empty">{a.valid?'Vorlage bereit für die Vorschau.':'Vorgaben verletzen Prüfregeln.'}<small>Bewegungs- und Montageprüfung unten.</small></div>}</div></div>
 {motion.kind==='belt'&&<section className="card"><h2>Riemenlängen vergleichen</h2><p>Beispielkatalog für GT2, 6 mm breit. Auswahl nur mit mindestens 2 mm Entspannweg und 1 mm Nachspannreserve. Reserven sind keine berechnete Vorspannung.</p><table id="belt-candidates"><thead><tr><th>Länge / Zähne</th><th>Achsabstand</th><th>Entspannen / Nachspannen</th><th>Auswahl</th></tr></thead><tbody>{a.beltCandidates.map(c=><tr key={c.length}><td>{c.length} mm / {c.length/2}</td><td>{Number.isFinite(c.center)?c.center.toFixed(3):'–'} mm</td><td>{c.release.toFixed(2)} / {c.reserve.toFixed(2)} mm</td><td><button disabled={busy||!c.valid} onClick={()=>onChange({...motion,beltLength:c.length})}>{c.length===motion.beltLength?'Gewählt':'Übernehmen'}</button></td></tr>)}</tbody></table></section>}
 <section className="card housing"><h2>Hub- und Freiraumprüfung</h2><ul id="motion-checks">{a.checks.map(c=><li key={c.id} data-state={c.state}>{c.state==='pass'?'✓':c.state==='fail'?'✕':'?'} {c.message}</li>)}</ul>
 <button id="toggle-obstacle" disabled={busy} onClick={()=>onChange({...motion,obstacle:motion.obstacle?null:{x:motion.stroke/2,y:0,z:24,sx:10,sy:10,sz:10}})}>{motion.obstacle?'Sperrraum entfernen':'Sperrraum hinzufügen'}</button>
 {motion.obstacle&&<div className="coordinates">{(['x','y','z','sx','sy','sz'] as const).map(k=><label key={k}>{k.length===1?`Mitte ${k.toUpperCase()}`:`Größe ${k[1].toUpperCase()}`} [mm]<input id={`obstacle-${k}`} type="number" disabled={busy} value={motion.obstacle![k]} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n)&&Math.abs(n)<=2000&&(k.length===1||n>0))onChange({...motion,obstacle:{...motion.obstacle!,[k]:n} as Box});}}/></label>)}</div>}
 <p className="note">Sperrraum: achsparalleler Quader. Linearachsen verwenden die exakte überstrichene Hülle ihrer geradlinig verschobenen Bauteil-Hüllkörper. Vorgesehene Führung, Gewinde und Zahneingriff sind Paarungen, keine Kollisionen.</p><details><summary>Anschlüsse und Bewegungshüllen</summary><pre>{JSON.stringify({ports:a.ports,swept:motion.kind==='belt'?undefined:a.swept},null,2)}</pre></details></section>
 {cad&&<section className="card"><h2>Teile & Montage</h2><table id="motion-parts"><thead><tr><th>Druckteil</th><th>Anzahl</th><th>STL</th></tr></thead><tbody>{cad.parts.map(p=><tr key={p.id}><td>{p.name}</td><td>{p.quantity}</td><td><button disabled={busy} data-motion-part={p.id} onClick={()=>run(p.id)}>STL erzeugen</button></td></tr>)}</tbody></table><details><summary>Kaufteile / Zuschnitt</summary><ul>{cad.bom.map((b,i)=><li key={i}>{b}</li>)}</ul></details><details><summary>Montage und Grenzen</summary><pre>{motionInstructions(motion)}</pre></details><details><summary>OpenSCAD-Vorlage</summary><pre>{cad.source}</pre></details></section>}
 </section>;
}
