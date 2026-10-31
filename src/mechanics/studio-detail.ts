import {nearMissPreviewGraph} from './graph/near-misses';
import * as THREE from 'three';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';
import {mechanismCAD,worldElement} from './graph/model';
import {matrix} from './graph/frames';
import {legoPart} from './graph/lego';
import type {Mechanism} from './graph/contracts';

/** Purchase meshes are visual assets, not necessarily closed CAD solids. */
export class StudioDetailPreview {
 readonly group=new THREE.Group();
 private generation=0;private controller?:AbortController;
 private current?:Mechanism;private nearMiss=false;
 private cache=new Map<string,Uint8Array>();
 constructor(private state:(state:string,message:string)=>void){}
 clear(){
  this.generation++;this.controller?.abort();this.controller=undefined;
  for(const child of [...this.group.children]){this.group.remove(child);if(child instanceof THREE.Mesh){child.geometry.dispose();(child.material as THREE.Material).dispose();}}
  this.current=undefined;this.state('empty','Noch keine Lösung ausgewählt.');
 }
 retry(){if(this.current)void this.show(this.current,this.nearMiss);}
 private install(bytes:Uint8Array,name='cad-detail',placement?:THREE.Matrix4){
  const geometry=new STLLoader().parse(bytes.slice().buffer as ArrayBuffer);
  if(!geometry.getAttribute('position')?.count){geometry.dispose();throw Error('Leere CAD-Geometrie');}
  geometry.computeVertexNormals();geometry.computeBoundingSphere();
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:this.nearMiss?0xe5b65f:0x63cbb3,roughness:.55,metalness:.15,side:placement?THREE.DoubleSide:THREE.FrontSide}));
  mesh.name=name;if(placement){mesh.matrixAutoUpdate=false;mesh.matrix.copy(placement);}this.group.add(mesh);
 }
 private render(source:string,signal:AbortSignal):Promise<Uint8Array>{
  const cached=this.cache.get(source);if(cached)return Promise.resolve(cached);
  return new Promise((resolve,reject)=>{
   const worker=new Worker('./mechanics-render-worker.js');
   const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);worker.terminate();};
   const fail=(message:string)=>{cleanup();reject(Error(message));};
   const abort=()=>fail('Vorschau abgebrochen');const timer=setTimeout(()=>fail('Zeitlimit überschritten. Erneut laden möglich.'),120000);
   signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return;}
   worker.onerror=e=>{e.preventDefault();fail(e.message);};worker.onmessage=({data})=>{if(data.error){fail(data.error);return;}cleanup();const bytes=new Uint8Array(data.stl);this.cache.set(source,bytes);while(this.cache.size>3)this.cache.delete(this.cache.keys().next().value!);resolve(bytes);};worker.postMessage({source});
  });
 }
 async show(input:Mechanism,nearMiss=false){
  this.clear();this.current=input;this.nearMiss=nearMiss;const token=this.generation,controller=new AbortController();this.controller=controller;
  try{
   const graph=nearMiss?nearMissPreviewGraph(input):input,source=mechanismCAD(graph,undefined,{omitPurchased:true}).source;
   const purchases=graph.elements.filter(e=>e.family==='lego-technic');
   this.state('loading','OpenSCAD-Geometrie und LEGO-Kaufteile werden geladen …');
   const [bytes,meshes]=await Promise.all([this.render(source,controller.signal),Promise.all(purchases.map(async e=>{
    const part=legoPart(e.params),response=await fetch('./mechanics-assets/ldraw/meshes/'+part.id+'.stl',{signal:controller.signal});if(!response.ok)throw Error('LEGO-Modell fehlt: '+part.id);
    return {id:e.id,bytes:new Uint8Array(await response.arrayBuffer()),placement:new THREE.Matrix4().fromArray(matrix(worldElement(graph,e)).flat()).transpose().multiply(new THREE.Matrix4().makeRotationZ(e.phase*Math.PI/180))};
   }))]);
   if(token!==this.generation)return;
   this.install(bytes);for(const mesh of meshes)this.install(mesh.bytes,'purchase-'+mesh.id,mesh.placement);
   this.state('ready',(nearMiss?'Ziel nicht erreicht · Detailvorschau des Kandidaten.':'Detailvorschau bereit.')+(meshes.length?` ${meshes.length} LEGO-Kaufteile aus LDraw; Wellen als Rohkörper.`:'')+(graph.relations.some(r=>r.rule==='gt2-belt')?' GT2-Kaufteile vereinfacht; ohne exaktes Zahnprofil.':''));
  }catch(e){if(token!==this.generation)return;controller.abort();for(const child of [...this.group.children]){this.group.remove(child);if(child instanceof THREE.Mesh){child.geometry.dispose();(child.material as THREE.Material).dispose();}}this.state('error','Detailvorschau fehlgeschlagen: '+String(e));}
 }
}
