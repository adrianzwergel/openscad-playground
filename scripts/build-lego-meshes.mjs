import {legoWormProfiles} from '../src/mechanics/graph/lego-config.ts';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import {LDrawLoader} from 'three/addons/loaders/LDrawLoader.js';
import {LDrawConditionalLineMaterial} from 'three/addons/materials/LDrawConditionalLineMaterial.js';
import {STLExporter} from 'three/addons/exporters/STLExporter.js';
if(!globalThis.ProgressEvent)globalThis.ProgressEvent=class{constructor(type,values){Object.assign(this,{type},values);}};
const dir='public/mechanics-assets/ldraw',manifest=JSON.parse(await fs.readFile(dir+'/manifest.json','utf8'));
const loader=new LDrawLoader();loader.setConditionalLineMaterial(LDrawConditionalLineMaterial);loader.setPartsLibraryPath('http://127.0.0.1:4002/mechanics-assets/ldraw/');await loader.preloadMaterials('http://127.0.0.1:4002/mechanics-assets/ldraw/LDConfig.ldr');
await fs.mkdir(dir+'/meshes',{recursive:true});
for(const p of manifest.parts){
 const group=await loader.loadAsync('http://127.0.0.1:4002/mechanics-assets/ldraw/'+p.file);group.rotation.x=p.search||legoWormProfiles[p.id]?0:Math.PI/2;group.scale.setScalar(.4);group.updateMatrixWorld(true);
 const bounds=new THREE.Box3().setFromObject(group),center=bounds.getCenter(new THREE.Vector3());group.position.sub(center);group.updateMatrixWorld(true);
 let radius=0;group.traverse(o=>{if(!o.isMesh)return;const pos=o.geometry.attributes.position,v=new THREE.Vector3();for(let i=0;i<pos.count;i++){v.fromBufferAttribute(pos,i).applyMatrix4(o.matrixWorld);radius=Math.max(radius,Math.hypot(v.x,v.y));}});p.radius=Math.ceil(radius*1e5)/1e5;
 // Normalize tooth center to +X for conventional straight gears; do not alter other source geometry.
 if(p.search){let sx=0,sy=0;const radius=Math.max(bounds.max.x-bounds.min.x,bounds.max.y-bounds.min.y)/2;group.traverse(o=>{if(!o.isMesh)return;const pos=o.geometry.attributes.position,v=new THREE.Vector3();for(let i=0;i<pos.count;i++){v.fromBufferAttribute(pos,i).applyMatrix4(o.matrixWorld);if(Math.hypot(v.x,v.y)>radius*.99){const a=Math.atan2(v.y,v.x)*p.teeth;sx+=Math.cos(a);sy+=Math.sin(a);}}});const phase=Math.atan2(sy,sx)/p.teeth;const root=new THREE.Group();root.add(group);root.rotation.z=-phase;root.updateMatrixWorld(true);p.phaseCorrection=-phase*180/Math.PI;const data=new STLExporter().parse(root,{binary:true});await fs.writeFile(dir+'/meshes/'+p.id+'.stl',Buffer.from(data.buffer));}
 else {const data=new STLExporter().parse(group,{binary:true});await fs.writeFile(dir+'/meshes/'+p.id+'.stl',Buffer.from(data.buffer));}
 p.size=bounds.getSize(new THREE.Vector3()).toArray().map(v=>Math.round(v*1e5)/1e5);
 group.traverse(o=>{o.geometry?.dispose();});console.log(p.id,p.size.join(' x '));
}
await fs.writeFile(dir+'/manifest.json',JSON.stringify(manifest,null,2));await fs.writeFile('src/mechanics/graph/lego-parts.ts','// Generated from the pinned LDraw manifest. See public/mechanics-assets/ldraw/README.txt.\nexport const legoParts='+JSON.stringify(manifest.parts,null,2)+';\n');
