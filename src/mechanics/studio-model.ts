import {parseCatalog,catalogAllows} from './graph/catalog.ts';
import type {SearchCatalog} from './graph/catalog.ts';
import {parseMechanism,resolveMechanism} from './graph/model.ts';
import {assessConstruction} from './graph/construction.ts';
import {parseProject} from './model.ts';
import type {Mechanism} from './graph/contracts.ts';
import type {Mechanism as Kinematics} from './kinematics/model.ts';
import {parseMechanism as parseKinematics} from './kinematics/model.ts';
/** `mechanisms` are kinematics-1 documents edited in the Studio (stored raw: parameters may be expressions). */
export type StudioDocument={version:1;catalog?:SearchCatalog;assemblies:{id:string;graph:Mechanism;adopted?:boolean}[];mechanisms?:{id:string;label:string;mechanism:Kinematics}[];routes:{id:string;assembly:string;source:'input';target:'output';ratio?:number}[]};
const id=(x:unknown)=>{if(typeof x!=='string'||! /^[a-zA-Z0-9_-]{1,80}$/.test(x))throw Error('Ungültige Studio-ID');return x;};
export function parseStudio(value:unknown):StudioDocument{
 const p=value as StudioDocument;if(!p||p.version!==1||!Array.isArray(p.assemblies)||p.assemblies.length<1||p.assemblies.length>16||!Array.isArray(p.routes)||p.routes.length<1||p.routes.length>32)throw Error('Ungültiges Studio-Projekt');
 const assemblies=p.assemblies.map(a=>{if(!a||a.adopted!==undefined&&typeof a.adopted!=='boolean')throw Error('Ungültige Baugruppe');const graph=parseMechanism(a.graph);if(a.adopted&&(!resolveMechanism(graph).valid||!assessConstruction(graph,1,false).valid))throw Error('Übernommene Baugruppe ist nicht gültig');return {id:id(a.id),graph,...(a.adopted===undefined?{}:{adopted:a.adopted})};});
 const routes=p.routes.map(r=>{if(!r||r.source!=='input'||r.target!=='output'||!assemblies.some(a=>a.id===r.assembly)||r.ratio!==undefined&&(!Number.isFinite(r.ratio)||r.ratio<=0||r.ratio>1000))throw Error('Ungültige Route');return {id:id(r.id),assembly:id(r.assembly),source:'input' as const,target:'output' as const,...(r.ratio===undefined?{}:{ratio:r.ratio})};});
 if(p.mechanisms!==undefined&&(!Array.isArray(p.mechanisms)||p.mechanisms.length>16))throw Error('Ungültige Mechanismenliste');
 const mechanisms=p.mechanisms?.map(m=>{if(!m||typeof m.label!=='string'||!m.label.trim()||m.label.length>80)throw Error('Mechanismus braucht einen Namen');try{parseKinematics(structuredClone(m.mechanism));}catch(e){throw Error(`Mechanismus ${m.label}: ${e instanceof Error?e.message:e}`);}return {id:id(m.id),label:m.label,mechanism:structuredClone(m.mechanism)};});
 if(mechanisms&&new Set(mechanisms.map(m=>m.id)).size!==mechanisms.length)throw Error('Doppelte Studio-ID');
 if(new Set(assemblies.map(a=>a.id)).size!==assemblies.length||new Set(routes.map(r=>r.id)).size!==routes.length)throw Error('Doppelte Studio-ID');return {version:1,assemblies,routes,...(mechanisms?{mechanisms}:{}),...(p.catalog===undefined?{}:{catalog:parseCatalog(p.catalog)})};
}
export function importStudio(text:string){if(text.length>2000000)throw Error('Projekt zu groß (max. 2 MB)');const p=JSON.parse(text);if(p.format==='mechanics10'){const project=parseProject(text);if(!project.graph)throw Error('Migration unterstützt derzeit Mechanics-Projekte mit Elementgraph.');const value=resolveMechanism(project.graph).value;return parseStudio({version:1,assemblies:[{id:'main',graph:project.graph}],routes:[{id:'route-1',assembly:'main',source:'input',target:'output',ratio:Number.isFinite(value)&&value>0&&value<=1000?value:1}]});}return parseStudio(p);}
export const serializeStudio=(doc:StudioDocument)=>JSON.stringify(parseStudio(doc),null,2);
export function adoptSolution(doc:StudioDocument,routeId:string,candidate:unknown){const next=parseStudio(doc),route=next.routes.find(r=>r.id===routeId);if(!route)throw Error('Route fehlt');const assembly=next.assemblies.find(a=>a.id===route.assembly)!,g=parseMechanism(candidate),k=resolveMechanism(g);
 for(const key of ['input','output'] as const){const a=assembly.graph[key],b=g[key];if(JSON.stringify([a.local,a.target,a.constraint,a.motion,a.stroke,a.tolerance])!==JSON.stringify([b.local,b.target,b.constraint,b.motion,b.stroke,b.tolerance]))throw Error('Lösung gehört zu anderen Anschlüssen');}
 if(JSON.stringify(g.environment)!==JSON.stringify(assembly.graph.environment)||!k.valid||!assessConstruction(g,1,false).valid||Math.abs(k.value-(route.ratio??1))/(route.ratio??1)>.010000001)throw Error('Lösung erfüllt die Vorgaben nicht');if(next.catalog&&!catalogAllows(g,next.catalog))throw Error('Lösung überschreitet den freigegebenen Teilebestand');assembly.graph=g;assembly.adopted=true;return next;
}
export class StudioHistory{
 private past:StudioDocument[]=[];private future:StudioDocument[]=[];
 get canUndo(){return this.past.length>0;}get canRedo(){return this.future.length>0;}
 record(before:StudioDocument,after:StudioDocument){if(serializeStudio(before)===serializeStudio(after))return;this.past.push(parseStudio(before));if(this.past.length>100)this.past.shift();this.future=[];}
 undo(current:StudioDocument){if(!this.canUndo)return current;this.future.push(parseStudio(current));return this.past.pop()!;}
 redo(current:StudioDocument){if(!this.canRedo)return current;this.past.push(parseStudio(current));return this.future.pop()!;}
}
