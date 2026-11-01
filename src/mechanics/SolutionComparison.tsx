import React,{useMemo,useRef,useState} from 'react';
import type {Mechanism} from './graph/contracts';
import {connectionSummary} from './graph/topology';
import {solutionMetrics} from './graph/comparison';
import {resolveMechanism} from './graph/model';
import {SolutionPreview} from './SolutionPreview';
export function SolutionComparison({solutions,running,disabled,onAdopt}:{solutions:Mechanism[];running:boolean;disabled:boolean;onAdopt:(g:Mechanism)=>void}){
 const ids=useRef(new Map<string,number>()),[sort,setSort]=useState<'volume'|'stages'|'parts'>('volume'),[descending,setDescending]=useState(false),[selected,setSelected]=useState<{graph:Mechanism;id:number}>();
 const entries=useMemo(()=>solutions.map(graph=>{const key=JSON.stringify(graph);if(!ids.current.has(key))ids.current.set(key,ids.current.size+1);return {graph,id:ids.current.get(key)!,metrics:solutionMetrics(graph)};}),[solutions]);
 const rows=[...entries].sort((a,b)=>(descending?-1:1)*(a.metrics[sort]-b.metrics[sort])||a.id-b.id);
 return <section id="solution-comparison"><h3>Lösungen vergleichen</h3><label>Sortieren nach <select id="solution-sort" value={sort} onChange={e=>setSort(e.target.value as typeof sort)}><option value="volume">Bauraum (Hüllvolumen)</option><option value="stages">Stufenzahl</option><option value="parts">Bauteilanzahl</option></select></label> <label><input id="solution-descending" type="checkbox" checked={descending} onChange={e=>setDescending(e.target.checked)}/>Absteigend</label>
 <p>Bauraum: benötigte Hülle im Eingangsrahmen, einschließlich Wellen, Lager-/Zugangsreserven und vollständiger Bewegungsräume. Kein Materialvolumen. Bauteilanzahl: Katalogelemente plus Wellen/feste Achsen; noch keine vollständige Stückliste.</p>
 <div style={{overflowX:'auto'}}><table id="solution-table"><thead><tr><th>Lösung / Kette</th><th>Hüllmaße [mm]</th><th>Hüllvolumen [cm³]</th><th>Stufen</th><th>Bauteile</th><th>Prüfen / Übernehmen</th></tr></thead><tbody>{rows.map(({graph,id,metrics:m})=><tr key={id} data-solution-id={id} data-volume={m.volume} data-stages={m.stages} data-parts={m.parts} aria-selected={selected?.id===id}><td>Lösung {id}<br/>{graph.relations.map(r=>r.rule).join(' → ')}<br/>Ist {resolveMechanism(graph).value.toFixed(3)} {resolveMechanism(graph).unit}<br/>{connectionSummary(graph).freeCompounds} freie Verbünde · {connectionSummary(graph).freeIdlers} freie Zwischenräder</td><td>{m.size.map(n=>n.toFixed(1)).join(' × ')}</td><td>{m.volume.toFixed(1)}</td><td>{m.stages}</td><td>{m.parts}<small> ({m.elements} Elemente + {m.shafts} Wellen/Achsen)</small></td><td><button data-solution-preview={id} onClick={()=>setSelected({graph,id})}>In 3D prüfen</button> <button data-route-result={id} disabled={disabled} onClick={()=>onAdopt(graph)}>{running?'Übernehmen & Suche beenden':'Übernehmen'}</button></td></tr>)}</tbody></table></div>
 {selected&&<SolutionPreview graph={selected.graph} label={`Lösung ${selected.id}`} onClose={()=>setSelected(undefined)}/>}
 </section>;
}
