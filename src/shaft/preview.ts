// The read-only 3D preview: the meshes the CAD worker made from the same solids that go to STEP and STL. Made parts
// solid with their edges, bought parts as glass. The camera fits the shaft the first time and when it changes a lot.
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';

/** The original models (LDraw gears, NopSCADlib motors), loaded once each; a missing one leaves the stand-in. */
const originals=new Map<string,Promise<THREE.BufferGeometry|undefined>>();
const original=(url:string)=>{let g=originals.get(url);if(!g){g=new STLLoader().loadAsync(url).then(x=>{x.computeVertexNormals();return x;},()=>undefined);originals.set(url,g);}return g;};
import type {MeshData} from './cad.ts';

export class ShaftPreview{
 private renderer:THREE.WebGLRenderer;private scene=new THREE.Scene();private camera=new THREE.PerspectiveCamera(35,1,.1,10000);private controls:OrbitControls;
 private group=new THREE.Group();private fitted?:number;private observer:ResizeObserver;
 constructor(private host:HTMLElement){
  this.renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));host.append(this.renderer.domElement);
  this.scene.background=new THREE.Color('#10161c');this.scene.add(new THREE.HemisphereLight(0xffffff,0x334455,2.2));const sun=new THREE.DirectionalLight(0xffffff,1.6);sun.position.set(40,-60,80);this.scene.add(sun,this.group);
  this.camera.up.set(0,0,1);this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=true;
  this.observer=new ResizeObserver(()=>{const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();});this.observer.observe(host);
  this.renderer.setAnimationLoop(()=>{this.controls.update();this.renderer.render(this.scene,this.camera);});
 }
 private shown=0;
 show(meshes:MeshData[]){const shown=++this.shown;
  for(const c of [...this.group.children]){this.group.remove(c);const o=c as THREE.Mesh;if(!o.userData.original)o.geometry?.dispose();(o.material as THREE.Material)?.dispose();}
  for(const m of meshes){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(m.vertices,3));g.setAttribute('normal',new THREE.BufferAttribute(m.normals,3));g.setIndex(new THREE.BufferAttribute(m.triangles,1));
   const bought=m.kind==='kauf',mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:m.color,metalness:bought?.55:.35,roughness:bought?.4:.55,side:THREE.DoubleSide}));mesh.name=m.name;mesh.userData.kind=m.kind;
   // A bought part with its original model: that replaces the stand-in once it is loaded.
   if(m.asset){const a=m.asset,stand=mesh;void original(a.url).then(g=>{if(!g||shown!==this.shown||!stand.parent)return;const o=new THREE.Mesh(g,stand.material as THREE.Material);o.matrixAutoUpdate=false;o.matrix.fromArray(a.matrix);o.name=stand.name;o.userData={...stand.userData,original:a.url};this.group.add(o);this.group.remove(stand);stand.geometry.dispose();});}this.group.add(mesh);
   // The stand-in's edges would not fit the original.
   if(m.edges.length&&!m.asset){const e=new THREE.BufferGeometry();e.setAttribute('position',new THREE.BufferAttribute(m.edges,3));this.group.add(new THREE.LineSegments(e,new THREE.LineBasicMaterial({color:'#1b2329'})));}}
  const box=new THREE.Box3().setFromObject(this.group);if(box.isEmpty())return;const size=box.getSize(new THREE.Vector3()).length();
  if(this.fitted===undefined||Math.abs(size-this.fitted)>this.fitted*.25){const c=box.getCenter(new THREE.Vector3());this.controls.target.copy(c);this.camera.position.set(c.x+size*.35,c.y-size*.9,c.z+size*.45);this.camera.near=size/100;this.camera.far=size*20;this.camera.updateProjectionMatrix();this.fitted=size;}
 }
 /** For checks: what is shown. */
 summary(){return this.group.children.filter(c=>c instanceof THREE.Mesh).map(c=>{const g=(c as THREE.Mesh).geometry;return {name:c.name,kind:c.userData.kind as string,triangles:(g.index?.count??g.getAttribute('position').count)/3,...(c.userData.original?{original:c.userData.original as string}:{})};});}
}
