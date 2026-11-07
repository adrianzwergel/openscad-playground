// A closed housing around what stands on a plate: the plate is its floor, the holders stay what they are. Walls follow
// the plate's outline, every plug that reaches a wall gets its opening there, a lid snaps in with two hooks on the
// walls that have the fewest openings. Unlike the board housing in structure/shell.ts it takes any set of parts.
import type {Prim} from '../../structure/sdf.ts';
import {featureGeometry,snapWindow,snapStrain} from '../../structure/features.ts';
import type {Feature} from '../../structure/features.ts';
import {partOf,plateRect,plateHoles,holderGeometry,plugRects,liftOf,flipped} from './build.ts';
import type {Sheet,Plate} from './build.ts';
import {quaternionFromBasis,cross} from '../kinematics/math.ts';
import type {Frame,V} from '../kinematics/math.ts';

export type CaseSettings={wall:number;lid:number;top:number;fit:number};
export const defaultCase:CaseSettings={wall:2.2,lid:2,top:3,fit:.25};
type Side='-x'|'+x'|'-y'|'+y';
export type Opening={item:string;label:string;side:Side;along:[number,number];z:[number,number]};
const id:Frame['rotation']=[0,0,0,1];
const box=(lo:V,hi:V):Prim=>({kind:'box',frame:{position:[(lo[0]+hi[0])/2,(lo[1]+hi[1])/2,(lo[2]+hi[2])/2],rotation:id},half:[(hi[0]-lo[0])/2,(hi[1]-lo[1])/2,(hi[2]-lo[2])/2]});
const hole=(at:[number,number],r:number,z0:number,z1:number):Prim=>({kind:'cylinder',frame:{position:[at[0],at[1],0],rotation:id},r,z0,z1});
/** Parts that do not fit into a closed box: below the plate, or a motor's shaft out of it. */
export function caseBlockers(s:Sheet){return s.items.filter(i=>{const p=partOf(s,i);return i.side!=='top'||flipped(p,i)||p.mount!=='board';});}
/** Where a plug's way crosses a wall of the plate's outline. */
export function openings(s:Sheet):Opening[]{const r=plateRect(s),out:Opening[]=[];
 for(const i of s.items){const p=partOf(s,i),bottom=liftOf(i)+p.size[2];for(const c of plugRects(p,i)){const x=c.rect.corners.map(q=>q[0]),y=c.rect.corners.map(q=>q[1]),x0=Math.min(...x),x1=Math.max(...x),y0=Math.min(...y),y1=Math.max(...y),z:[number,number]=[bottom-.5,bottom+c.height+1];
  if(x1>r.x1&&x0<r.x1)out.push({item:i.id,label:c.label,side:'+x',along:[y0,y1],z});else if(x0<r.x0&&x1>r.x0)out.push({item:i.id,label:c.label,side:'-x',along:[y0,y1],z});else if(y1>r.y1&&y0<r.y1)out.push({item:i.id,label:c.label,side:'+y',along:[x0,x1],z});else if(y0<r.y0&&y1>r.y0)out.push({item:i.id,label:c.label,side:'-y',along:[x0,x1],z});}}
 return out;}
export function caseParts(s:Sheet,o:Partial<CaseSettings>={}){
 const c={...defaultCase,...o},blocked=caseBlockers(s);if(blocked.length)throw Error(`${partOf(s,blocked[0]).label} passt nicht in ein geschlossenes Gehäuse (Unterseite oder Motor).`);if(!s.items.length)throw Error('Das Gehäuse braucht Teile auf der Platte.');
 const r=plateRect(s),t=s.plate.thickness,w=c.wall,H=Math.max(...s.items.map(i=>liftOf(i)+partOf(s,i).box.max[2]))+c.top,all=openings(s),O={x0:r.x0-w,x1:r.x1+w,y0:r.y0-w,y1:r.y1+w};
 const solids:Prim[]=[box([O.x0,O.y0,-t],[O.x1,O.y1,0]),box([O.x0,O.y0,0],[r.x0,O.y1,H]),box([r.x1,O.y0,0],[O.x1,O.y1,H]),box([r.x0,O.y0,0],[r.x1,r.y0,H]),box([r.x0,r.y1,0],[r.x1,O.y1,H])],holes:Prim[]=plateHoles(s).map(h=>hole(h.at,h.d/2,-t-1,1));
 for(const i of s.items){const g=holderGeometry(s,i);solids.push(...g.solids);holes.push(...g.holes);}
 for(const a of all){const z0=Math.max(.5,a.z[0]),z1=Math.min(H-.5,a.z[1]);holes.push(a.side==='+x'?box([r.x1-.1,a.along[0],z0],[O.x1+1,a.along[1],z1]):a.side==='-x'?box([O.x0-1,a.along[0],z0],[r.x0+.1,a.along[1],z1]):a.side==='+y'?box([a.along[0],r.y1-.1,z0],[a.along[1],O.y1+1,z1]):box([a.along[0],O.y0-1,z0],[a.along[1],r.y0+.1,z1]));}
 // Hooks on the pair of walls with fewer openings, in the middle or beside what is there.
 const count=(sides:Side[])=>all.filter(a=>sides.includes(a.side)).length,onX=count(['-x','+x'])<=count(['-y','+y']),L=Math.min(12,Math.max(6,H-3)),hook:Extract<Feature,{kind:'snap'}>={kind:'snap',length:L,width:8,thickness:1.6,lip:.8};
 const lidSolids:Prim[]=[box([O.x0,O.y0,H],[O.x1,O.y1,H+c.lid])],inner={x0:r.x0+c.fit,x1:r.x1-c.fit,y0:r.y0+c.fit,y1:r.y1-c.fit},lipT=1.6,lipD=3;
 lidSolids.push(box([inner.x0,inner.y0,H-lipD],[inner.x0+lipT,inner.y1,H]),box([inner.x1-lipT,inner.y0,H-lipD],[inner.x1,inner.y1,H]),box([inner.x0+lipT,inner.y0,H-lipD],[inner.x1-lipT,inner.y0+lipT,H]),box([inner.x0+lipT,inner.y1-lipT,H-lipD],[inner.x1-lipT,inner.y1,H]));
 const hooks:{frame:Frame;side:Side}[]=[];
 for(const sign of [-1,1] as const){const side=(onX?(sign>0?'+x':'-x'):(sign>0?'+y':'-y')) as Side,mid=onX?(r.y0+r.y1)/2:(r.x0+r.x1)/2,span=onX?r.y1-r.y0:r.x1-r.x0,taken=all.filter(a=>a.side===side);let along=mid;for(let k=0;k<=span/2;k+=4){const a=[mid+k,mid-k].find(v=>!taken.some(q=>v+hook.width/2+2>q.along[0]&&v-hook.width/2-2<q.along[1]));if(a!==undefined){along=a;break;}}
  const face:V=onX?[sign>0?r.x1:r.x0,along,H]:[along,sign>0?r.y1:r.y0,H],x:V=onX?[sign,0,0]:[0,sign,0],z:V=[0,0,-1],rotation=quaternionFromBasis(x,cross(z,x),z),wallFrame:Frame={position:face,rotation},armFrame:Frame={position:[face[0]-x[0]*c.fit,face[1]-x[1]*c.fit,face[2]],rotation};
  lidSolids.push(...featureGeometry(hook,armFrame).solids);holes.push(snapWindow(hook,wallFrame,w));hooks.push({frame:armFrame,side});}
 return {base:{solids,holes},lid:{solids:lidSolids,holes:[] as Prim[]},height:H,outer:[O.x1-O.x0,O.y1-O.y0,H+t+c.lid] as V,openings:all,hooks,strain:snapStrain(hook),tight:Math.min(s.plate.margin,99)<3};
}
export type {Plate};
