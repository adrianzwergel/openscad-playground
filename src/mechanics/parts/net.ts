// The tree-and-net generator as a carrier: instead of a plate, one printed structure holds the parts where they are in
// the room. Every holder is an anchor (the same seats a link takes), feet stand on the floor under the build, and the
// struts keep out of the parts and the ways of their plugs.
import {generateStructure} from '../../structure/generate.ts';
import type {Anchor,StructureResult,StructureSettings} from '../../structure/generate.ts';
import {PrimIndex} from '../../structure/sdf.ts';
import type {Prim} from '../../structure/sdf.ts';
import {partOf,partSeats,standing,plateRect,sheet,plugRects,worldOf} from './build.ts';
import type {Build,BuildItem} from './build.ts';
import type {Frame,V} from '../kinematics/math.ts';
import {compose} from '../kinematics/math.ts';

const LIFT=1,GAP=1.5,PLUG=.5;
/** Design load per part (N), shared by its holding points: electronics weigh grams, this is a hand plugging in a cable. */
export const DEFAULT_LOAD=10;
/** Parts without anything to hold them: they would float. */
export const unheld=(b:Build)=>b.items.filter(i=>{const p=partOf(b,i);return !i.plate&&(i.holder.kind==='none'||i.holder.kind!=='clip'&&!p.holes.length);});
const room=(frame:Frame,lo:V,hi:V,grow:number):Prim=>({kind:'box',frame:compose(frame,{position:[(lo[0]+hi[0])/2,(lo[1]+hi[1])/2,(lo[2]+hi[2])/2],rotation:[0,0,0,1]}),half:[(hi[0]-lo[0])/2+grow,(hi[1]-lo[1])/2+grow,(hi[2]-lo[2])/2+grow]});
/** What the struts stay out of: every part with its plugs' ways, every plate. */
export function netRoom(b:Build):Prim[]{const out:Prim[]=[];
 for(const i of b.items){const p=partOf(b,i),f=standing(b,i,{}),under=GAP-.2;
  // The domes come from below the mounted face: on that side the room ends just under the part.
  out.push(p.body>0?room(f,[p.box.min[0],p.box.min[1],p.box.min[2]+under],p.box.max,GAP):room(f,p.box.min,[p.box.max[0],p.box.max[1],p.box.max[2]-under],GAP));
  const flat:BuildItem={...i,at:[0,0],angle:0,side:p.body>0?'top':'bottom'};for(const c of plugRects(p,flat)){const x=c.rect.corners.map(q=>q[0]),y=c.rect.corners.map(q=>q[1]);out.push(room(f,[Math.min(...x),Math.min(...y),0],[Math.max(...x),Math.max(...y),c.height+2],PLUG));}}
 for(const n of b.plates){const r=plateRect(sheet(b,n.id));out.push(room(worldOf(n.free,{}),[r.x0,r.y0,-n.thickness],[r.x1,r.y1,0],GAP));}
 return out;}
/** Anchors of all holders, and four feet under them on the floor below the lowest part. */
export function netAnchors(b:Build,load=DEFAULT_LOAD){
 const seats=partSeats(b,'netz'),share=(line:string)=>load/seats.filter(s=>s.line===line).length,anchors:Anchor[]=seats.map(s=>({id:s.id,frame:s.frame,feature:s.feature,role:'load',load:share(s.line)}));if(!anchors.length)throw Error('Kein Teil hat einen Halter: Dome oder Clip wählen.');
 const pts=anchors.map(a=>a.frame.position),rooms=netRoom(b),floor=Math.min(...pts.map(p=>p[2]))-14,x=pts.map(p=>p[0]),y=pts.map(p=>p[1]),cx=(Math.min(...x)+Math.max(...x))/2,cy=(Math.min(...y)+Math.max(...y))/2,w=Math.max(30,(Math.max(...x)-Math.min(...x))/2),h=Math.max(30,(Math.max(...y)-Math.min(...y))/2);
 ([[-1,-1],[1,-1],[1,1],[-1,1]] as const).forEach(([a,c],k)=>anchors.push({id:`fuss${k+1}`,frame:{position:[cx+a*w,cy+c*h,floor],rotation:[1,0,0,0]},feature:{kind:'pad',width:30,depth:30,thickness:5,holes:[[-8,0],[8,0]],hole:4.5,top:true},role:'support'}));
 return {anchors,rooms,floor};}
export type NetSettings={bracing:number;load:number};
/** The structure itself. `bracing`: 0 a pure tree, 1 a light net, 2 a dense one. */
export async function generateNet(b:Build,s:Partial<NetSettings>={},progress?:(stage:string,f:number)=>void):Promise<StructureResult>{
 const o={bracing:1,load:DEFAULT_LOAD,...s},{anchors,rooms,floor}=netAnchors(b,o.load),index=new PrimIndex(15,40);for(const r of rooms)index.add(r);
 const settings:Partial<StructureSettings>={bracing:o.bracing,load:o.load};
 return generateStructure({id:b.id,anchors,clearance:(p:V)=>Math.min(index.distance(p),p[2]-floor-LIFT),settings},progress);
}
