import {nearMissPreviewGraph} from './graph/near-misses';
import * as THREE from 'three';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';
import {mechanismCAD} from './graph/model';
import type {Mechanism} from './graph/contracts';

/** One active CAD render; stale worker replies cannot replace a newer selection. */
export class StudioDetailPreview {
 readonly group=new THREE.Group();
 private worker?:Worker;
 private timer?:ReturnType<typeof setTimeout>;
 private generation=0;
 private current?:Mechanism;private nearMiss=false;
 private cache=new Map<string,Uint8Array>();
 constructor(private state:(state:string,message:string)=>void){}
 clear(){
  this.generation++;this.worker?.terminate();this.worker=undefined;clearTimeout(this.timer);
  for(const child of [...this.group.children]){
   this.group.remove(child);
   if(child instanceof THREE.Mesh){child.geometry.dispose();(child.material as THREE.Material).dispose();}
  }
  this.current=undefined;this.state('empty','Noch keine Lösung ausgewählt.');
 }
 retry(){if(this.current)this.show(this.current,this.nearMiss);}
 private install(bytes:Uint8Array){
  const geometry=new STLLoader().parse(bytes.slice().buffer as ArrayBuffer);
  if(!geometry.getAttribute('position')?.count){geometry.dispose();throw Error('Leere CAD-Geometrie');}
  geometry.computeVertexNormals();geometry.computeBoundingSphere();
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:this.nearMiss?0xe5b65f:0x63cbb3,roughness:.55,metalness:.15}));
  mesh.name='cad-detail';this.group.add(mesh);
 }
 show(graph:Mechanism,nearMiss=false){
  this.clear();this.current=graph;this.nearMiss=nearMiss;const token=this.generation;
  const fail=(message:string)=>{if(token!==this.generation)return;clearTimeout(this.timer);this.worker?.terminate();this.worker=undefined;this.state('error',`Detailvorschau fehlgeschlagen: ${message}`);};
  try{
   const source=mechanismCAD(nearMiss?nearMissPreviewGraph(graph):graph).source,cached=this.cache.get(source);
   const ready=()=>this.state('ready',(nearMiss?'Ziel nicht erreicht · Detailvorschau des Kandidaten.':'Detailvorschau bereit.')+(graph.relations.some(r=>r.rule==='gt2-belt')?' GT2-Kaufteile vereinfacht; ohne exaktes Zahnprofil.':''));
   if(cached){this.install(cached);ready();return;}
   this.state('loading','OpenSCAD erzeugt die Detailgeometrie …');
   const worker=new Worker('./mechanics-render-worker.js');this.worker=worker;
   this.timer=setTimeout(()=>fail('Zeitlimit überschritten. Erneut laden möglich.'),120000);
   worker.onerror=e=>{e.preventDefault();fail(e.message);};
   worker.onmessage=({data})=>{
    if(token!==this.generation)return;
    if(data.error){fail(data.error);return;}
    clearTimeout(this.timer);worker.terminate();this.worker=undefined;
    try{
     const bytes=new Uint8Array(data.stl);this.install(bytes);
     this.cache.set(source,bytes);while(this.cache.size>3)this.cache.delete(this.cache.keys().next().value!);
     ready();
    }catch(e){fail(String(e));}
   };
   worker.postMessage({source});
  }catch(e){fail(String(e));}
 }
}
