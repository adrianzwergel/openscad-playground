// Printed ring gear (internal teeth) with four lugs to screw it to the frame. The tooth gaps are cut as the outline of
// an external involute gear of the same tooth count, shifted by +0.25 m: its tips reach the ring's root circle
// (r + 1.25 m), its roots the ring's tip circle (r − m); its teeth are the ring's gaps, widened by the backlash.
import * as THREE from 'three';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {involuteOutline} from './involute.ts';
import type {Mesh} from './mesh.ts';
import type {V} from '../math.ts';
import type {Element} from '../model.ts';

/** A ring gear element's outer radius: its outer-ring interface (the envelope also covers the lugs). */
export const ringOuter=(e:Element)=>{const i=e.interfaces.find(x=>x.kind==='outer-ring');return i&&i.kind==='outer-ring'?i.diameter/2:e.envelope.radius;};

export type RingOptions={module:number;teeth:number;pressureAngle?:number;backlash:number;z0:number;z1:number;outer:number};
/** Lugs: four at 45°, 135°, … just outside the ring, each with a hole for an M3 screw into a heat-set insert. */
export const ringLugs=(o:Pick<RingOptions,'outer'>)=>({radius:o.outer+6,size:6,hole:3.4,angles:[45,135,225,315]});
/** Lug hole centres in the element frame (z on the ring's face at z1). */
export const ringMounts=(o:Pick<RingOptions,'outer'|'z1'>):V[]=>{const l=ringLugs(o);return l.angles.map(a=>[l.radius*Math.cos(a*Math.PI/180),l.radius*Math.sin(a*Math.PI/180),o.z1]);};

export function ringMesh(o:RingOptions):Mesh{
 const alpha=(o.pressureAngle??20)*Math.PI/180,shift=.25,widened=2*shift*o.module*Math.tan(alpha);
 // The hole's teeth are the ring's gaps: as wide as a tooth plus the backlash (the shift already widens them).
 const gaps=involuteOutline({module:o.module,teeth:o.teeth,pressureAngle:o.pressureAngle??20,shift,backlash:2*(widened-o.backlash),samples:10});
 const lug=ringLugs(o),outline:THREE.Vector2[]=[],n=720;
 // Outer contour: the ring's circle and the four lugs (star-shaped about the axis).
 for(let i=0;i<n;i++){const t=2*Math.PI*i/n;let r=o.outer;
  for(const a of lug.angles){const phi=t-a*Math.PI/180,s=Math.sin(phi),c=Math.cos(phi);if(Math.abs(s)*lug.radius<=lug.size&&c>0)r=Math.max(r,lug.radius*c+Math.sqrt(lug.size**2-(lug.radius*s)**2));}
  outline.push(new THREE.Vector2(r*Math.cos(t),r*Math.sin(t)));}
 const shape=new THREE.Shape(outline);
 shape.holes.push(new THREE.Path(gaps.map(([x,y])=>new THREE.Vector2(x,y))));
 for(const [x,y] of ringMounts(o)){const h=new THREE.Path();h.absarc(x,y,lug.hole/2,0,2*Math.PI,false);shape.holes.push(h);}
 const g=mergeVertices(new THREE.ExtrudeGeometry(shape,{depth:o.z1-o.z0,bevelEnabled:false,curveSegments:24}).deleteAttribute('normal').deleteAttribute('uv'),1e-4);
 const p=g.getAttribute('position'),idx=g.getIndex()!,positions:V[]=[],triangles:[number,number,number][]=[];
 for(let i=0;i<p.count;i++)positions.push([p.getX(i),p.getY(i),p.getZ(i)+o.z0]);
 for(let i=0;i<idx.count;i+=3)triangles.push([idx.getX(i),idx.getX(i+1),idx.getX(i+2)]);
 return {positions,triangles};
}
