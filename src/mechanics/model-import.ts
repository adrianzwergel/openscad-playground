// Imports 3D models for the target mechanism: STL, OBJ, GLB/glTF. Every mesh
// becomes a part (triangle soup in model coordinates, millimetres). A single
// STL is split into connected pieces. Assets live in IndexedDB; documents only
// reference them by id.
import * as THREE from 'three';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';
import {OBJLoader} from 'three/addons/loaders/OBJLoader.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

export type AssetPart={id:string;name:string;positions:Float32Array};
export type Asset={id:string;name:string;parts:AssetPart[];scale:number};

const soupOf=(g:THREE.BufferGeometry,m?:THREE.Matrix4)=>{const n=(g.index?g.toNonIndexed():g.clone());if(m)n.applyMatrix4(m);const p=new Float32Array(n.getAttribute('position').array as ArrayLike<number>);n.dispose();return p;};
/** Connected pieces of a triangle soup (vertices merged at 1e-4). Returns one piece if there are too many. */
export function splitConnected(p:Float32Array,maxPieces=200):Float32Array[]{
 const n=p.length/9,parent=Array.from({length:n},(_,i)=>i),find=(i:number):number=>parent[i]===i?i:(parent[i]=find(parent[i])),owner=new Map<string,number>();
 for(let t=0;t<n;t++)for(let k=0;k<3;k++){const o=t*9+k*3,key=`${Math.round(p[o]*1e4)},${Math.round(p[o+1]*1e4)},${Math.round(p[o+2]*1e4)}`,u=owner.get(key);if(u===undefined)owner.set(key,t);else{const a=find(u),b=find(t);if(a!==b)parent[a]=b;}}
 const groups=new Map<number,number[]>();for(let t=0;t<n;t++){const r=find(t),g=groups.get(r);if(g)g.push(t);else groups.set(r,[t]);}
 if(groups.size>maxPieces||groups.size<2)return [p];
 return [...groups.values()].sort((a,b)=>b.length-a.length).map(ts=>{const out=new Float32Array(ts.length*9);ts.forEach((t,i)=>out.set(p.subarray(t*9,t*9+9),i*9));return out;});
}
async function partsOf(file:File):Promise<{name:string;positions:Float32Array}[]>{
 const ext=file.name.toLowerCase().split('.').pop();
 if(ext==='stl'){const g=new STLLoader().parse(await file.arrayBuffer()),soup=soupOf(g);g.dispose();const pieces=splitConnected(soup);return pieces.map((positions,i)=>({name:pieces.length>1?`${file.name} · Teil ${i+1}`:file.name,positions}));}
 let root:THREE.Object3D;
 if(ext==='obj')root=new OBJLoader().parse(await file.text());
 else if(ext==='glb'||ext==='gltf'){const data=ext==='glb'?await file.arrayBuffer():await file.text();root=(await new GLTFLoader().parseAsync(data,'')).scene;}
 else throw Error(`Format .${ext} wird nicht unterstützt (STL, OBJ, GLB, glTF).`);
 root.updateMatrixWorld(true);const out:{name:string;positions:Float32Array}[]=[];
 root.traverse(o=>{if(o instanceof THREE.Mesh&&o.geometry.getAttribute('position'))out.push({name:o.name||o.parent?.name||`Teil ${out.length+1}`,positions:soupOf(o.geometry,o.matrixWorld)});});
 if(!out.length)throw Error(`${file.name} enthält keine Netze.`);
 return out;
}
/** Reads files into one asset. Models smaller than 10 units are taken as metres and scaled to millimetres. */
export async function importModel(files:File[]):Promise<Asset>{
 const parts:AssetPart[]=[];for(const f of files)for(const p of await partsOf(f))parts.push({id:'p'+parts.length,name:p.name,positions:p.positions});
 if(!parts.length)throw Error('Keine Teile gefunden.');
 const box=new THREE.Box3();for(const p of parts){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p.positions,3));g.computeBoundingBox();box.union(g.boundingBox!);}
 const size=box.getSize(new THREE.Vector3()).length(),scale=size<10?1000:1;if(scale!==1)for(const p of parts)for(let i=0;i<p.positions.length;i++)p.positions[i]*=scale;
 return {id:'asset-'+crypto.randomUUID().slice(0,8),name:files.map(f=>f.name).join(', '),parts,scale};
}
// ---------- storage ----------
function database():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const r=indexedDB.open('mechanics-studio-assets',1);r.onupgradeneeded=()=>r.result.createObjectStore('assets',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function storeAsset(a:Asset){const db=await database();await new Promise<void>((resolve,reject)=>{const t=db.transaction('assets','readwrite');t.objectStore('assets').put(a);t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);});db.close();}
const cache=new Map<string,Promise<Asset|undefined>>();
export function loadAsset(id:string):Promise<Asset|undefined>{let p=cache.get(id);if(!p){p=database().then(db=>new Promise<Asset|undefined>((resolve,reject)=>{const r=db.transaction('assets').objectStore('assets').get(id);r.onsuccess=()=>{db.close();resolve(r.result);};r.onerror=()=>reject(r.error);}));cache.set(id,p);}return p;}
export function rememberAsset(a:Asset){cache.set(a.id,Promise.resolve(a));}
