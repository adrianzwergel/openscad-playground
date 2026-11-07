// The tree-and-net generator as a carrier: instead of a plate, one printed structure holds the parts where they are in
// the room. Every holder is an anchor (the same seats a link takes), feet stand on the floor under the build, and the
// struts keep out of the parts and the ways of their plugs.
import {generateStructure} from '../../structure/generate.ts';
import type {Anchor,StructureResult,StructureSettings} from '../../structure/generate.ts';
import {PrimIndex} from '../../structure/sdf.ts';
import type {Prim} from '../../structure/sdf.ts';
import {partOf,partSeats,standing,plateRect,sheet,plugRects,worldOf,itemMass} from './build.ts';
import {torqueOf} from './catalog.ts';
import type {Build,BuildItem} from './build.ts';
import type {Frame,V} from '../kinematics/math.ts';
import {compose,rotate} from '../kinematics/math.ts';

const LIFT=1,GAP=1.5,PLUG=.5;
/** The stance is laid out to tip no earlier than this (degrees). */
const TIP=15;
/** Design load per part (N), shared by its holding points: electronics weigh grams, this is a hand plugging in a cable. */
export const DEFAULT_LOAD=10;
/** Parts without anything to hold them: they would float. */
export const unheld=(b:Build)=>b.items.filter(i=>{const p=partOf(b,i);return p.mount!=='support'&&!i.plate&&(i.holder.kind==='none'||i.holder.kind!=='clip'&&!p.holes.length);});
/** The supports the build names itself; without any it gets feet. */
const supportsOf=(b:Build)=>b.items.filter(i=>partOf(b,i).mount==='support');
const room=(frame:Frame,lo:V,hi:V,grow:number):Prim=>({kind:'box',frame:compose(frame,{position:[(lo[0]+hi[0])/2,(lo[1]+hi[1])/2,(lo[2]+hi[2])/2],rotation:[0,0,0,1]}),half:[(hi[0]-lo[0])/2+grow,(hi[1]-lo[1])/2+grow,(hi[2]-lo[2])/2+grow]});
/** What the struts stay out of: every part with its plugs' ways, every plate. */
export function netRoom(b:Build):Prim[]{const out:Prim[]=[];
 for(const i of b.items){const p=partOf(b,i),f=standing(b,i,{}),under=GAP-.2;if(p.mount==='support')continue;
  // The domes come from below the mounted face: on that side the room ends just under the part.
  // A flanged part: its body behind the face; in front only boss and shaft, between the screws.
  if(p.body>0)out.push(room(f,[p.box.min[0],p.box.min[1],p.box.min[2]+under],p.box.max,GAP));else{const r=(p.pilot??10)/2;out.push(room(f,p.box.min,[p.box.max[0],p.box.max[1],-under],GAP),room(f,[-r,-r,0],[r,r,p.box.max[2]],.5));}
  const flat:BuildItem={...i,at:[0,0],angle:0,side:p.body>0?'top':'bottom'};for(const c of plugRects(p,flat)){const x=c.rect.corners.map(q=>q[0]),y=c.rect.corners.map(q=>q[1]);out.push(room(f,[Math.min(...x),Math.min(...y),0],[Math.max(...x),Math.max(...y),c.height+2],PLUG));}}
 for(const n of b.plates){const r=plateRect(sheet(b,n.id));out.push(room(worldOf(n.free,{}),[r.x0,r.y0,-n.thickness],[r.x1,r.y1,0],GAP));}
 return out;}
/** The force a part's holders must take (N): what a hand does, three times its weight for knocks, and a motor's torque
 * as a couple over its screw circle. */
export function designLoad(b:Build,i:BuildItem,base=DEFAULT_LOAD){const p=partOf(b,i),t=torqueOf(p),r=p.holes.length?Math.max(...p.holes.map(h=>Math.hypot(h.at[0],h.at[1]))):0;return base+3*9.81*itemMass(b,i)/1000+(t&&r?t/(2*r/1000):0);}
/** Centre of gravity of the parts: [x, y, z], mass in g. */
export function partsCentre(b:Build){let m=0;const c:V=[0,0,0];for(const i of b.items){const p=partOf(b,i);if(p.mount==='support')continue;const g=itemMass(b,i),q=compose(standing(b,i,{}),{position:p.box.min.map((v,k)=>(v+p.box.max[k])/2) as V,rotation:[0,0,0,1]}).position;m+=g;c[0]+=q[0]*g;c[1]+=q[1]*g;c[2]+=q[2]*g;}return {centre:m?c.map(v=>v/m) as V:c,mass:m};}
/** The angle a stance tips over at: the least, over its sides, of the angle from the centre of gravity to that side. */
export function tipAngle(centre:V,feet:[number,number][],floor:number){const n=feet.length,h=Math.max(1e-3,centre[2]-floor);let best=Infinity;for(let k=0;k<n;k++){const [ax,ay]=feet[k],[bx,by]=feet[(k+1)%n],l=Math.hypot(bx-ax,by-ay)||1,inside=((bx-ax)*(centre[1]-ay)-(by-ay)*(centre[0]-ax))/l;best=Math.min(best,inside);}return Math.atan2(best,h)*180/Math.PI;}
/** Anchors of all holders, and four feet under them on the floor below the lowest part, wide enough not to tip. */
export function netAnchors(b:Build,load=DEFAULT_LOAD){
 const seats=partSeats(b,'netz'),byLine=new Map(b.items.map(i=>[i.id,designLoad(b,i,load)])),share=(line:string)=>(byLine.get(line)??load)/seats.filter(s=>s.line===line).length,anchors:Anchor[]=seats.map(s=>({id:s.id,frame:s.frame,feature:s.feature,role:'load',load:share(s.line)}));if(!anchors.length)throw Error('Kein Teil hat einen Halter: Dome oder Clip wählen.');
 const own=supportsOf(b);if(own.length){for(const i of own){const p=partOf(b,i);anchors.push({id:i.id,frame:compose(standing(b,i,{}),{position:[0,0,0],rotation:[1,0,0,0]}),feature:{kind:'pad',...p.pad!,top:true},role:'support'});}return {anchors,rooms:netRoom(b),floor:undefined,own:true};}
 const pts=anchors.map(a=>a.frame.position),rooms=netRoom(b),floor=Math.min(...pts.map(p=>p[2]))-14,{centre}=partsCentre(b),reach=Math.max(0,centre[2]-floor)*Math.tan(TIP*Math.PI/180)+8,x=[...pts.map(p=>p[0]),centre[0]-reach,centre[0]+reach],y=[...pts.map(p=>p[1]),centre[1]-reach,centre[1]+reach],cx=(Math.min(...x)+Math.max(...x))/2,cy=(Math.min(...y)+Math.max(...y))/2,w=Math.max(30,(Math.max(...x)-Math.min(...x))/2),h=Math.max(30,(Math.max(...y)-Math.min(...y))/2);
 ([[-1,-1],[1,-1],[1,1],[-1,1]] as const).forEach(([a,c],k)=>anchors.push({id:`fuss${k+1}`,frame:{position:[cx+a*w,cy+c*h,floor],rotation:[1,0,0,0]},feature:{kind:'pad',width:30,depth:30,thickness:5,holes:[[-8,0],[8,0]],hole:4.5,top:true},role:'support'}));
 return {anchors,rooms,floor,own:false};}
export type NetSettings={bracing:number;load:number};
/** The structure itself. `bracing`: 0 a pure tree, 1 a light net, 2 a dense one. */
export async function generateNet(b:Build,s:Partial<NetSettings>={},progress?:(stage:string,f:number)=>void):Promise<StructureResult>{
 const o={bracing:1,load:DEFAULT_LOAD,...s},{anchors,rooms,floor}=netAnchors(b,o.load),index=new PrimIndex(15,40);for(const r of rooms)index.add(r);
 const settings:Partial<StructureSettings>={bracing:o.bracing,load:o.load};
 const hullOf=(p:number[][])=>{const s=[...p].sort((a,c)=>a[0]-c[0]||a[1]-c[1]),half=(l:number[][])=>{const h:number[][]=[];for(const q of l){while(h.length>1&&(h.at(-1)![0]-h.at(-2)![0])*(q[1]-h.at(-2)![1])-(h.at(-1)![1]-h.at(-2)![1])*(q[0]-h.at(-2)![0])<=0)h.pop();h.push(q);}return h.slice(0,-1);};return [...half(s),...half([...s].reverse())] as [number,number][];};
 const r=await generateStructure({id:b.id,anchors,clearance:(p:V)=>floor===undefined?index.distance(p):Math.min(index.distance(p),p[2]-floor-LIFT),settings},progress);
 // Standing: parts and structure together, on the feet as built.
 const parts=partsCentre(b),v=r.mesh.vertices,n=v.length/3;let sx=0,sy=0,sz=0;for(let k=0;k<v.length;k+=3){sx+=v[k];sy+=v[k+1];sz+=v[k+2];}const all=parts.mass+r.report.mass,centre:V=[(parts.centre[0]*parts.mass+sx/n*r.report.mass)/all,(parts.centre[1]*parts.mass+sy/n*r.report.mass)/all,(parts.centre[2]*parts.mass+sz/n*r.report.mass)/all];
 const pads=anchors.filter(a=>a.role==='support'),flat=pads.every(a=>rotate(a.frame.rotation,[0,0,1])[2]<-.99),base=Math.min(...pads.map(a=>a.frame.position[2])),feet=hullOf(pads.map(a=>[a.frame.position[0],a.frame.position[1]])),tip=flat&&feet.length>=3&&(floor!==undefined||!b.items.some(i=>partOf(b,i).pad?.holes.length===1))?tipAngle(centre,feet,floor??base):undefined;
 r.report.checks.push(tip===undefined?{id:'stand',state:'pass',message:'Wird festgeschraubt: kein Kippen.'}:{id:'stand',state:tip<5?'fail':tip<TIP-1?'warn':'pass',message:`Kippt ab ${tip.toFixed(0)}° (Schwerpunkt ${(centre[2]-(floor??base)).toFixed(0)} mm hoch, ${all.toFixed(0)} g mit Teilen).`});
 return r;
}
