import {legoPart} from './graph/lego';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';
import {BELTS} from './motion';
import {registry} from './graph/registry';
import {identity} from './graph/frames';
import type {CatalogPart} from './graph/catalog';

export function partPreviewSource(p:CatalogPart){
 const e={id:'preview',family:p.family,params:p.params,body:'preview',pose:identity(),phase:0};
 let body:string;
 if(p.family==='gt2-belt'){
  if(!BELTS.includes(p.params.length)||p.params.width!==6)throw Error('Ungültige Riemenlänge');
  body=`linear_extrude(${p.params.width},center=true) difference(){circle(r=${p.params.length/(2*Math.PI)+.75});circle(r=${p.params.length/(2*Math.PI)-.75});}`;
 }else{
  const family=registry.getFamily(p.family);family.validate(p.params);
  body=family.scad(e,{elements:[e,{...e,id:'mate'}],frames:[identity(),identity()],params:{angle:90,azimuth:0}});
 }
 return 'include <BOSL2/std.scad>\ninclude <BOSL2/gears.scad>\n$fn=48;\n'+body;
}
export class CatalogPreview{
 private renderer:THREE.WebGLRenderer;private scene=new THREE.Scene();private camera=new THREE.PerspectiveCamera(40,1,.1,10000);private controls:OrbitControls;
 private request?:AbortController;private mesh?:THREE.Mesh;private worker?:Worker;private timer?:ReturnType<typeof setTimeout>;private timeout?:ReturnType<typeof setTimeout>;private generation=0;private observer:ResizeObserver;
 constructor(private host:HTMLElement,private status:HTMLElement){
  this.renderer=new THREE.WebGLRenderer({antialias:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));host.append(this.renderer.domElement);this.scene.background=new THREE.Color('#15212b');this.scene.add(new THREE.HemisphereLight(0xffffff,0x344454,2));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(80,-100,150);this.scene.add(light);this.camera.up.set(0,0,1);this.camera.position.set(80,-100,70);this.controls=new OrbitControls(this.camera,this.renderer.domElement);
  this.observer=new ResizeObserver(()=>{const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();});this.observer.observe(host);
  this.renderer.setAnimationLoop(()=>{this.controls.update();this.renderer.render(this.scene,this.camera);});
 }
 private clear(){if(this.mesh){this.scene.remove(this.mesh);this.mesh.geometry.dispose();(this.mesh.material as THREE.Material).dispose();this.mesh=undefined;}}
 private install(geometry:THREE.BufferGeometry){geometry.computeVertexNormals();geometry.computeBoundingBox();const bounds=geometry.boundingBox!,center=bounds.getCenter(new THREE.Vector3()),size=Math.max(bounds.getSize(new THREE.Vector3()).length(),10);geometry.translate(-center.x,-center.y,-center.z);this.mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0x63cbb3,roughness:.55,metalness:.15}));this.scene.add(this.mesh);this.controls.target.set(0,0,0);this.camera.position.copy(new THREE.Vector3(1,-1,.8).normalize().multiplyScalar(size*1.7));this.controls.update();}
 update(p:CatalogPart){
  const token=++this.generation;this.request?.abort();clearTimeout(this.timer);clearTimeout(this.timeout);this.worker?.terminate();this.worker=undefined;this.clear();
  if(p.family==='lego-technic'){
   this.status.dataset.state='loading';this.status.textContent='LEGO-Kaufteil wird geladen …';const controller=new AbortController();this.request=controller;
   try{const part=legoPart(p.params);fetch('./mechanics-assets/ldraw/meshes/'+part.id+'.stl',{signal:controller.signal}).then(async response=>{if(!response.ok)throw Error('LEGO-Modell fehlt');return response.arrayBuffer();}).then(bytes=>{if(token!==this.generation)return;this.install(new STLLoader().parse(bytes));this.status.dataset.state='ready';this.status.textContent='LDraw-Kaufteilmodell · Millimeter · Ziehen zum Drehen';}).catch(e=>{if(token!==this.generation)return;this.status.dataset.state='error';this.status.textContent=String(e);});}catch(e){this.status.dataset.state='error';this.status.textContent=String(e);}return;
  }
  let source:string;try{source=partPreviewSource(p);}catch(e){this.status.dataset.state='error';this.status.textContent=String(e);return;}
  this.status.dataset.state='loading';this.status.textContent='3D-Vorschau wird aktualisiert …';
  this.timer=setTimeout(()=>{
   const worker=new Worker('./mechanics-render-worker.js');this.worker=worker;
   const fail=(message:string)=>{if(token!==this.generation)return;worker.terminate();clearTimeout(this.timeout);this.status.dataset.state='error';this.status.textContent=message;};
   this.timeout=setTimeout(()=>fail('Vorschau dauert zu lange. Parameter erneut ändern.'),120000);
   worker.onerror=e=>fail(e.message);worker.onmessage=({data})=>{if(token!==this.generation)return;if(data.error){fail(data.error);return;}worker.terminate();clearTimeout(this.timeout);try{
    const geometry=new STLLoader().parse(new Uint8Array(data.stl).buffer);this.install(geometry);this.status.dataset.state='ready';this.status.textContent='Ziehen zum Drehen · Scrollen zum Zoomen'+(p.family==='bevel'?' · Beispiel: gleich großes Gegenrad, 90°':p.family==='gt2-belt'?' · Riemen vereinfacht als Ring':p.family.startsWith('tr8')||p.family==='gt2-pulley'?' · Vereinfachtes Kaufteilprofil':'');
   }catch(e){fail(String(e));}};worker.postMessage({source});
  },450);
 }
 dispose(){this.generation++;this.request?.abort();clearTimeout(this.timer);clearTimeout(this.timeout);this.worker?.terminate();this.observer.disconnect();this.renderer.setAnimationLoop(null);this.controls.dispose();this.clear();this.renderer.dispose();this.renderer.forceContextLoss();}
}
