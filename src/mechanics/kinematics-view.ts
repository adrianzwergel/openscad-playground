// Moving 3D view of a solved kinematics-1 mechanism: one mesh per surface,
// element envelope, shaft, body box and path joint, placed from the solver's
// poses. Lightweight on purpose; exact tooth geometry comes from generation.
import * as THREE from 'three';
import type {Frame} from './kinematics/math';
import {compose,inverse} from './kinematics/math';
import type {Expanded,Element} from './kinematics/model';
import type {Surface} from './kinematics/surfaces';
import {pitchPlane} from './kinematics/surfaces';
import {curve,sample} from './kinematics/curves';
import type {Pose,Transfer} from './kinematics/solver';
import type {Check} from './kinematics/conjugate';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';
import {legoParts} from './graph/lego-parts';

// LDraw meshes of library parts, loaded once per part.
const libraryMeshes=new Map<string,Promise<THREE.BufferGeometry>>();
function libraryMesh(part:string){let p=libraryMeshes.get(part);if(!p){p=fetch('./mechanics-assets/ldraw/meshes/'+part+'.stl').then(r=>{if(!r.ok)throw Error('LEGO-Modell fehlt: '+part);return r.arrayBuffer();}).then(b=>{const g=new STLLoader().parse(b);g.computeVertexNormals();g.userData.library=true;return g;});libraryMeshes.set(part,p);}return p;}
const soup=(positions:Float32Array)=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));g.computeVertexNormals();return g;};

export type MotionSolution={mechanism:Expanded;poses:Pose[];transfer:Transfer;checks:Check[];error:number;mobility:{message:string;freedom:number}};
const toMatrix=(f:Frame)=>new THREE.Matrix4().compose(new THREE.Vector3(...f.position),new THREE.Quaternion(...f.rotation),new THREE.Vector3(1,1,1));
const palette=[0x63cbb3,0x7aa7e8,0xe8a24a,0xc98fe0,0x9bd46a,0xe87a7a,0x6ad0e0,0xe0d06a];
/** Colour of a link in the view (index in the body list). */
export const linkColor=(index:number,ground=false)=>ground?0x7d8a96:palette[index%palette.length];
const material=(color:number,opacity=1)=>new THREE.MeshStandardMaterial({color,roughness:.6,metalness:.1,transparent:opacity<1,opacity});

/** Geometry of one surface in its element frame (axis = z, pitch plane at pitchPlane). */
function surfaceObject(s:Surface,color:number):THREE.Object3D{
 const width=s.z[1]-s.z[0],plane=pitchPlane(s),group=new THREE.Group();
 if(s.pitch.kind==='circle'){
  const r=s.pitch.r,cone=s.cone??0,top=cone?Math.max(.5,r-width*Math.tan(cone*Math.PI/180)):r;
  const disc=new THREE.Mesh(new THREE.CylinderGeometry(cone?top:r,r,width,Math.max(24,Math.round(r*2))),material(color));disc.rotation.x=Math.PI/2;disc.position.z=(s.z[0]+s.z[1])/2;group.add(disc);
  // Spoke: shows rotation.
  const spoke=new THREE.Mesh(new THREE.BoxGeometry(r,Math.max(.8,r*.08),width*1.05),material(0x223344));spoke.position.set(r/2,0,(s.z[0]+s.z[1])/2);group.add(spoke);
  return group;
 }
 const fn=curve(s.pitch);
 if(fn.closed&&fn.planar){
  const points=sample(fn,240).map(p=>new THREE.Vector2(p[0],p[1])),shape=new THREE.Shape(points);
  const mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:width,bevelEnabled:false}),material(color));mesh.position.z=s.z[0];group.add(mesh);
  const spoke=new THREE.Mesh(new THREE.BoxGeometry(points[0].length(),1,width*1.05),material(0x223344));spoke.position.set(points[0].length()/2,0,(s.z[0]+s.z[1])/2);group.add(spoke);
  return group;
 }
 // Open curves: rails and racks as a tube along the pitch curve.
 const length=Number.isFinite(fn.length)?fn.length:200,count=Math.max(8,Math.min(400,Math.ceil(length/4)));
 const points=Array.from({length:count+1},(_,i)=>{const p=fn.point(Number.isFinite(fn.length)?length*i/count:-100+200*i/count);return new THREE.Vector3(p[0],p[1],p[2]+plane);});
 group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),count*2,Math.max(1.5,width/4),8,false),material(color)));
 return group;
}
export class KinematicsView{
 readonly group=new THREE.Group();
 private items:{object:THREE.Object3D;body:string;local:Frame}[]=[];
 private holders=new Map<string,{holder:THREE.Group;color:number}>();private generation=0;
 /** Imported model parts by asset and part id (triangle soups in the model's frame at pose 0). */
 assets:(asset:string)=>{parts:{id:string;positions:Float32Array}[]}|undefined=()=>undefined;
 private geometries=new Map<string,THREE.BufferGeometry>();
 /** Parts highlighted in the view (asset/part keys) and per-body colours. */
 highlight=new Set<string>();
 readonly parts:THREE.Mesh[]=[];
 private solution?:MotionSolution;
 /** Extra meshes on bodies (bearings, generated structures), kept across re-solves. */
 private overlays=new Map<string,{body:string;positions:Float32Array;color:number;opacity?:number}[]>();
 private lastFrames?:Record<string,Frame>;
 /** Hides the imported model's parts (when generated structures replace them). */
 hideModel=false;
 setOverlay(key:string,items:{body:string;positions:Float32Array;color:number;opacity?:number}[]){this.overlays.set(key,items);if(this.solution){const frames=this.lastFrames;this.show(this.solution);if(frames)this.setFrames(frames);}}
 clearOverlay(key?:string){if(key)this.overlays.delete(key);else this.overlays.clear();if(this.solution){const frames=this.lastFrames;this.show(this.solution);if(frames)this.setFrames(frames);}}
 clear(){this.generation++;this.solution=undefined;this.items=[];this.holders.clear();this.parts.length=0;for(const child of [...this.group.children]){this.group.remove(child);child.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Line){if(!o.geometry.userData.library)o.geometry.dispose();(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());}});}}
 get poses(){return this.solution?.poses.length??0;}
 show(solution:MotionSolution){
  this.clear();this.solution=solution;const m=solution.mechanism;
  const add=(object:THREE.Object3D,body:string,local:Frame)=>{object.matrixAutoUpdate=false;this.group.add(object);this.items.push({object,body,local});};
  for(const e of m.elements as Element[]){
   const color=e.source.kind==='library'?0xe8a24a:e.surfaces.some(s=>s.pitch.kind!=='circle'&&!curve(s.pitch).closed)?0x9aa7b4:0x63cbb3;
   const holder=new THREE.Group();
   if(e.surfaces.length)for(const s of e.surfaces)holder.add(surfaceObject(s,color));
   else{const env=new THREE.Mesh(new THREE.CylinderGeometry(e.envelope.radius,e.envelope.radius,Math.max(1,e.envelope.max-e.envelope.min),24),material(color,.6));env.rotation.x=Math.PI/2;env.position.z=(e.envelope.min+e.envelope.max)/2;holder.add(env);}
   const mount=e.mounts[0];add(holder,mount.body,mount.pose);this.holders.set(e.id,{holder,color});
   // Library parts show their real mesh (LDraw) once it has loaded.
   if(e.source.kind==='library'&&e.source.library==='lego'){const model=Number(e.source.part),part=legoParts.find(p=>p.model===model);const token=this.generation;
    if(part)void libraryMesh(part.id).then(g=>{if(token!==this.generation)return;this.replace(e.id,new THREE.Mesh(g,material(color)));}).catch(()=>{});}
  }
  for(const b of m.bodies){
   if(b.shaft){const shaft=new THREE.Mesh(new THREE.CylinderGeometry(b.shaft.diameter/2,b.shaft.diameter/2,b.shaft.end-b.shaft.start,12),material(0xb8c4cc));shaft.rotation.x=Math.PI/2;shaft.position.z=(b.shaft.start+b.shaft.end)/2;const holder=new THREE.Group();holder.add(shaft);add(holder,b.id,{position:[0,0,0],rotation:[0,0,0,1]});}
   if(b.display?.kind==='mesh'){const asset=this.assets(b.display.asset),holder=new THREE.Group(),color=linkColor(m.bodies.indexOf(b),b.ground);
    for(const id of b.display.parts){const part=asset?.parts.find(p=>p.id===id);if(!part)continue;const key=`${b.display.asset}/${id}`;let g=this.geometries.get(key);if(!g){g=soup(part.positions);g.userData.library=true;this.geometries.set(key,g);}
     const mesh=new THREE.Mesh(g,material(this.highlight.has(key)?0xffcc66:color,this.hideModel?.12:1));mesh.userData.pick={body:b.id,asset:b.display.asset,part:id};holder.add(mesh);this.parts.push(mesh);}
    add(holder,b.id,inverse(b.frame));}
   if(b.display?.kind==='box'){const box=new THREE.Mesh(new THREE.BoxGeometry(...b.display.size),material(0x8fa3c8,.85));const holder=new THREE.Group();box.position.set(...(b.display.offset??[0,0,0]));holder.add(box);add(holder,b.id,{position:[0,0,0],rotation:[0,0,0,1]});}
  }
  for(const items of this.overlays.values())for(const o of items){const g=soup(o.positions);g.userData.library=false;const mesh=new THREE.Mesh(g,material(o.color,o.opacity??1));const holder=new THREE.Group();holder.add(mesh);add(holder,o.body,{position:[0,0,0],rotation:[0,0,0,1]});}
  // Path joints: the guide curve on the a-side body.
  const drawn=new Set<string>();
  for(const j of m.joints){if(j.joint.kind!=='path')continue;const key=JSON.stringify([j.joint.curve,j.a]);if(drawn.has(key))continue;drawn.add(key);
   const fn=curve(j.joint.curve),points=sample(fn,Math.max(32,Math.ceil(fn.length/8))).map(p=>new THREE.Vector3(...p));
   const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0xffcc66}));add(line,j.a.body,j.a.local);
  }
  this.setPose(0);
 }
 private replace(id:string,object:THREE.Object3D){const h=this.holders.get(id);if(!h)return;for(const c of [...h.holder.children]){h.holder.remove(c);c.traverse(o=>{if(o instanceof THREE.Mesh){if(!o.geometry.userData.library)o.geometry.dispose();(o.material as THREE.Material).dispose();}});}h.holder.add(object);}
 /** Replaces placeholders by generated printable parts (triangle soups in element coordinates). */
 setParts(parts:Record<string,Float32Array>){for(const [id,positions] of Object.entries(parts)){const h=this.holders.get(id);if(h)this.replace(id,new THREE.Mesh(soup(positions),material(h.color)));}}
 /** Places every item from given body frames (live sliders) without rebuilding the view. */
 setFrames(bodies:Record<string,Frame>){this.lastFrames=bodies;for(const item of this.items){const body=bodies[item.body];if(!body)continue;item.object.matrix.copy(toMatrix(compose(body,item.local)));item.object.matrixWorldNeedsUpdate=true;}}
 /** Places the items of one body (a motor being dragged) without touching the others. */
 moveBody(id:string,frame:Frame){for(const item of this.items)if(item.body===id){item.object.matrix.copy(toMatrix(compose(frame,item.local)));item.object.matrixWorldNeedsUpdate=true;}}
 /** Imported part under a ray, with the hit in the part's model coordinates (pose 0). */
 pick(ray:THREE.Raycaster){const hit=ray.intersectObjects(this.parts,false)[0];if(!hit)return undefined;const local=hit.point.clone().applyMatrix4(new THREE.Matrix4().copy(hit.object.matrixWorld).invert());return {...hit.object.userData.pick as {body:string;asset:string;part:string},local:local.toArray() as [number,number,number],world:hit.point.toArray() as [number,number,number]};}
 /** Shows pose k (fractional values interpolate to the nearest pose). */
 setPose(k:number){
  const s=this.solution;if(!s)return;const pose=s.poses[Math.max(0,Math.min(s.poses.length-1,Math.round(k)))];
  for(const item of this.items){const body=pose.bodies[item.body];if(!body)continue;item.object.matrix.copy(toMatrix(compose(body,item.local)));item.object.matrixWorldNeedsUpdate=true;}
 }
}
/** SVG chart of output over input with the current pose marked. */
export function transferChart(t:Transfer,current:number,width=360,height=140){
 const s=t.samples;if(s.length<2)return '';
 const xs=s.map(p=>p.input),ys=s.map(p=>p.output),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys),pad=24;
 const X=(x:number)=>pad+(x1===x0?0:(x-x0)/(x1-x0))*(width-2*pad),Y=(y:number)=>height-pad-(y1===y0?.5:(y-y0)/(y1-y0))*(height-2*pad);
 const path=s.map((p,i)=>`${i?'L':'M'}${X(p.input).toFixed(1)},${Y(p.output).toFixed(1)}`).join(' '),c=s[Math.max(0,Math.min(s.length-1,Math.round(current)))];
 const label=(v:number)=>Math.abs(v)>=100?v.toFixed(0):v.toFixed(2);
 return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Übersetzungsverlauf"><line x1="${pad}" y1="${height-pad}" x2="${width-pad}" y2="${height-pad}" class="axis"/><line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height-pad}" class="axis"/><path d="${path}" class="curve"/><circle cx="${X(c.input)}" cy="${Y(c.output)}" r="4" class="marker"/><text x="${width-pad}" y="${height-6}" text-anchor="end">Eingang ${label(x0)} … ${label(x1)}</text><text x="4" y="14">Ausgang ${label(y0)} … ${label(y1)}</text></svg>`;
}
