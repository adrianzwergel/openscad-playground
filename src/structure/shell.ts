// Shell mode of the structure core (LAGER-UND-STRUKTUR.md, B6): a housing for a
// circuit board, with a lid, the board's hole pattern on standoffs, openings
// for its connectors, slots over its pin headers and a clip for a 35 mm top-hat
// rail (EN 60715 TH35-7.5). Stands on its own, without any mechanism. The board
// sits on heat-set M3 inserts, the lid snaps in with two hooks into windows of the
// end walls. The base
// is built from plates (floor, walls) so that standoffs inside are not cut by a
// cavity; openings and holes are cut at the end. The rail clip is a part of its
// own, screwed to the floor: its latch is a tongue in its plate, so clip and
// base both print flat without supports.
import type {V,Frame} from './vec.ts';
import {Scene} from './sdf.ts';
import type {Prim} from './sdf.ts';
import {surfaceNets,largestPart,inspect} from './mesh.ts';
import type {Mesh} from './mesh.ts';
import {PLA} from './truss.ts';
import {featureGeometry,snapWindow,snapStrain} from './features.ts';
import type {Feature} from './features.ts';
import {axisAngle} from './vec.ts';

/** A connector opening in a side wall: `along` its centre along that side (board coordinates), `width`, and its
 * height above the board's top face. Openings stay open to the top so that the board goes in from above. */
export type Opening={label:string;side:'-x'|'+x'|'-y'|'+y';along:number;width:number;height:number};
/** Board coordinates: x along the length, y across, origin at a corner, top face up. `height`: tallest part above
 * the top face; `headers`: pin header rows reached through slots in the lid. */
export type Board={id:string;label:string;size:[number,number];thickness:number;holes:[number,number][];hole:number;height:number;openings:Opening[];headers:{from:[number,number];to:[number,number]}[]};
export const boards:Board[]=[
 {id:'arduino-uno',label:'Arduino Uno R3',size:[68.6,53.3],thickness:1.6,holes:[[13.97,2.54],[15.24,50.8],[66.04,7.62],[66.04,35.56]],hole:3.2,height:11.5,
  openings:[{label:'USB-B',side:'-x',along:37.8,width:13,height:11.5},{label:'Netzbuchse',side:'-x',along:7.75,width:9.8,height:11.5}],
  headers:[{from:[17.3,50.8],to:[63.8,50.8]},{from:[27.4,2.54],to:[63.8,2.54]}]},
];
/** `din`: clip for a 35 mm top-hat rail along x under the floor (a third part). `screw`: pilot hole for M3 self-tapping
 * (the clip's screws); the board's screws go into heat-set inserts. */
export type ShellSettings={wall:number;floor:number;clearance:number;standoff:number;lid:number;lip:number;fit:number;resolution:number;din:boolean;screw:number};
export const defaultShell:ShellSettings={wall:2.2,floor:2.5,clearance:1,standoff:5,lid:2,lip:3,fit:.25,resolution:.35,din:true,screw:2.6};
export type ShellPart={id:'unterteil'|'deckel'|'hutschienenclip';mesh:Mesh;volume:number;mass:number;closed:boolean};
export type ShellResult={board:Board;settings:ShellSettings;parts:ShellPart[];/** Base, lid and rail geometry as fields, for checks. */fields:{base:(p:V)=>number;lid:(p:V)=>number;clip:(p:V)=>number};
 /** Key heights (z, floor bottom at 0) and the clip's numbers. */layout:{boardBottom:number;boardTop:number;wallTop:number;inner:{min:V;max:V};rail:{y:number;x0:number;x1:number;top:number};screws:[number,number][];latch:{length:number;thickness:number;travel:number;strain:number};
 /** Inserts under the board's holes; the lid's snap hooks (their frames: root at the lid's underside, lip outwards). */
 inserts:{at:[number,number];feature:Extract<Feature,{kind:'insert'}>}[];hooks:{frame:Frame;feature:Extract<Feature,{kind:'snap'}>;strain:number}[]}};

const at=(x:number,y:number,z:number):Frame=>({position:[x,y,z],rotation:[0,0,0,1]});
const box=(min:V,max:V,round=0):Prim=>({kind:'box',frame:at((min[0]+max[0])/2,(min[1]+max[1])/2,(min[2]+max[2])/2),half:[(max[0]-min[0])/2,(max[1]-min[1])/2,(max[2]-min[2])/2],round});
const cyl=(x:number,y:number,r:number,z0:number,z1:number):Prim=>({kind:'cylinder',frame:at(x,y,0),r,z0,z1});
/** A profile in the y–z plane (counter-clockwise seen from +x), extruded along x from x0 to x1. */
const prism=(points:[number,number][],x0:number,x1:number):Prim=>({kind:'slab',frame:{position:[x0,0,0],rotation:[.5,.5,.5,.5]},points,z0:0,z1:x1-x0});

/** TH35-7.5 top-hat rail along x, its top (the flanges, z = top) facing the device: flanges 1 mm thick from 12.5 to
 * 17.5 mm off the centre line, walls down to the channel 7.5 mm deep (open towards the device in the middle). */
export function railField(y:number,x0:number,x1:number,top=0){const prims:Prim[]=[box([x0,y-17.5,top-1],[x1,y-12.5,top]),box([x0,y+12.5,top-1],[x1,y+17.5,top]),box([x0,y-13.5,top-7.5],[x1,y-12.5,top]),box([x0,y+12.5,top-7.5],[x1,y+13.5,top]),box([x0,y-13.5,top-7.5],[x1,y+13.5,top-6.5])];
 const s=new Scene(0,10);for(const p of prims)s.hardSolid(p);return (p:V)=>s.distance(p);}

export function generateShell(boardId='arduino-uno',settings:Partial<ShellSettings>={}):ShellResult{
 const board=boards.find(b=>b.id===boardId);if(!board)throw Error(`Platine ${boardId} nicht im Katalog.`);
 const s={...defaultShell,...settings},[L,W]=board.size,c=s.clearance,w=s.wall;
 const boardBottom=s.floor+s.standoff,boardTop=boardBottom+board.thickness,wallTop=boardTop+board.height+s.lip+1;
 const inner={min:[-c,-c,s.floor] as V,max:[L+c,W+c,wallTop] as V},outer={min:[-c-w,-c-w,0] as V,max:[L+c+w,W+c+w,wallTop] as V};
 // Lid hooks outside the end walls (inside they would reach into the parts' room), on −x between the barrel jack and
 // the USB socket, on +x in the middle: root at the lid's underside, the lip reaching into a window of the wall; they
 // bend outwards to snap and are pulled outwards to open.
 const hook:Extract<Feature,{kind:'snap'}>={kind:'snap',length:12,width:8,thickness:1.6,lip:.8};
 const hookY=(side:-1|1)=>{if(side>0)return W/2;const ops=board.openings.filter(o=>o.side==='-x').map(o=>[o.along-o.width/2,o.along+o.width/2]).sort((a,b)=>a[0]-b[0]);let best=W/2,room=-1;
  for(let i=0;i+1<ops.length;i++){const gap=ops[i+1][0]-ops[i][1];if(gap>room){room=gap;best=(ops[i][1]+ops[i+1][0])/2;}}return best;};
 const hooks=([-1,1] as const).map(side=>({frame:{position:[side<0?outer.min[0]-s.fit:outer.max[0]+s.fit,hookY(side),wallTop],rotation:axisAngle(side<0?[1,0,0]:[0,1,0],180)} as Frame,feature:hook,strain:snapStrain(hook)}));
 const insert:Extract<Feature,{kind:'insert'}>={kind:'insert',outer:8,hole:4,depth:5.7,height:s.standoff+1};
 // ---- base ----
 const base=new Scene(1,12);
 base.hardSolid(box(outer.min,[outer.max[0],outer.max[1],s.floor],1));
 for(const [a,b] of [[[outer.min[0],outer.min[1],0],[inner.min[0],outer.max[1],wallTop]],[[inner.max[0],outer.min[1],0],[outer.max[0],outer.max[1],wallTop]],[[outer.min[0],outer.min[1],0],[outer.max[0],inner.min[1],wallTop]],[[outer.min[0],inner.max[1],0],[outer.max[0],outer.max[1],wallTop]]] as [V,V][])base.hardSolid(box(a,b,.6));
 // Board on heat-set inserts: their bosses stand on the floor, the face under the board.
 for(const [x,y] of board.holes){const g=featureGeometry(insert,at(x,y,boardBottom));g.solids.forEach(p=>base.solid(p));g.holes.forEach(p=>base.hole(p));}
 // Windows for the lid's hooks in the end walls.
 for(const h of hooks)base.hole(snapWindow(h.feature,h.frame,w));
 // Connector openings: through the wall from just under the board's top face up to the wall's top.
 // An opening's box: through the wall (a cut reaches past both faces) or exactly the wall (a plug).
 const slot=(o:Opening,grow:number,z0:number,z1:number,cut=true)=>{const e=cut?1:0,f=cut?.5:0;
  const [x0,x1]=o.side==='-x'?[outer.min[0]-e,inner.min[0]+f]:o.side==='+x'?[inner.max[0]-f,outer.max[0]+e]:[o.along-o.width/2-grow,o.along+o.width/2+grow];
  const [y0,y1]=o.side==='-y'?[outer.min[1]-e,inner.min[1]+f]:o.side==='+y'?[inner.max[1]-f,outer.max[1]+e]:[o.along-o.width/2-grow,o.along+o.width/2+grow];
  return box([x0,y0,z0],[x1,y1,z1]);};
 for(const o of board.openings)base.hole(slot(o,0,boardTop-.5,wallTop+1));
 // ---- rail clip, a part of its own under the floor (mounted: floor bottom z = 0, clip plate below, rail under it) ----
 // Plate with four M3 holes over the rail's open channel (screws from inside through the floor), a fixed hook on +y,
 // and on −y a tongue cut free in the plate that bends outwards when the clip snaps on; its hook has a lead-in chamfer.
 const ry=W/2,cx=L/2,T=3,top=-T,gap=.3,lipZ:[number,number]=[top-1-gap-1.6,top-1-gap],armT=2.2,cut=1,len=28;
 const screws:[number,number][]=[[cx-12,ry-6],[cx+12,ry-6],[cx-12,ry+6],[cx+12,ry+6]];
 // The lip reaches 1.8 mm in from the tongue, 1.5 mm under the rail's flange: snapping on bends the tongue by that.
 const latch={length:len,thickness:armT,travel:1.8-gap,strain:0};
 const clip=new Scene(.6,12),y0=ry-17.5-gap,px0=cx-18,px1=cx+18,ax1=px0+len;
 if(s.din){
  clip.hardSolid(box([px0,y0-armT,top],[px1,ry+17.5+gap+2.4,0],.5));
  // Fixed hook: a wall outside the flange's edge and a lip under it.
  clip.hardSolid(box([px0,ry+17.5+gap,lipZ[0]],[px1,ry+17.5+gap+2.4,top]));
  clip.hardSolid(box([px0,ry+17.5-1.8,lipZ[0]],[px1,ry+17.5+gap+.1,lipZ[1]]));
  // Tongue: the plate's strip outside the flange edge, free along its length (a slot) and joined at +x; at its free end
  // a web down past the flange and the lip with a lead-in chamfer, and a tab to pull it open.
  clip.hole(box([px0-1,y0,top-1],[ax1,y0+cut,1]));
  clip.hardSolid(box([px0,y0-armT,lipZ[0]],[px0+9,y0,top]));
  clip.hardSolid(prism([[y0-.05,lipZ[0]],[y0+1.8,lipZ[0]+1.1],[y0+1.8,lipZ[1]],[y0-.05,lipZ[1]]],px0,px0+9));
  clip.hardSolid(box([px0,y0-armT-5,top],[px0+6,y0-armT+.1,0],.4));
  for(const [x,y] of screws){clip.hole(cyl(x,y,s.screw/2,top-1,1));base.hole(cyl(x,y,1.7,-1,s.floor+1));}
  // Strain at the root of a cantilever bent by δ at its end: ε = 1.5·t·δ / L².
  latch.strain=1.5*armT*latch.travel/(len*len);}
 // ---- lid: plate over the outer footprint (reaching over the hooks), a lip inside the walls, the two snap hooks,
 // header slots ----
 const lid=new Scene(1,12),lz=wallTop,over=s.fit+hook.thickness;
 lid.hardSolid(box([outer.min[0]-over,outer.min[1],lz],[outer.max[0]+over,outer.max[1],lz+s.lid],1));
 const li={min:[inner.min[0]+s.fit,inner.min[1]+s.fit] as [number,number],max:[inner.max[0]-s.fit,inner.max[1]-s.fit] as [number,number]},t=1.4;
 const lipBox=(a:[number,number],b:[number,number])=>lid.hardSolid(box([a[0],a[1],lz-s.lip],[b[0],b[1],lz+.5]));
 lipBox([li.min[0],li.min[1]],[li.max[0],li.min[1]+t]);lipBox([li.min[0],li.max[1]-t],[li.max[0],li.max[1]]);
 lipBox([li.min[0],li.min[1]],[li.min[0]+t,li.max[1]]);lipBox([li.max[0]-t,li.min[1]],[li.max[0],li.max[1]]);
 for(const h of hooks)featureGeometry(h.feature,h.frame).solids.forEach(p=>lid.hardSolid(p));
 // The openings are open to the top of the wall (the board goes in from above): the lid closes them down to the
 // connector with a plug (the lip lies above the connectors).
 for(const o of board.openings)lid.hardSolid(slot(o,-s.fit,boardTop+o.height+.4,lz+.5,false));
 for(const h of board.headers)lid.hole(box([h.from[0]-1.6,h.from[1]-1.75,lz-1],[h.to[0]+1.6,h.to[1]+1.75,lz+s.lid+1],.5));
 // ---- meshes ----
 const mesh=(sc:Scene)=>{const b=sc.bounds(),{mesh}=largestPart(surfaceNets(p=>sc.distance(p),b.min,b.max,s.resolution,4));const info=inspect(mesh);return {mesh,volume:info.volume,closed:info.closed&&info.components===1};};
 const mb=mesh(base),ml=mesh(lid),mc=s.din?mesh(clip):undefined;
 return {board,settings:s,parts:[{id:'unterteil',...mb,mass:mb.volume*PLA.density},{id:'deckel',...ml,mass:ml.volume*PLA.density},...(mc?[{id:'hutschienenclip' as const,...mc,mass:mc.volume*PLA.density}]:[])],
  fields:{base:p=>base.distance(p),lid:p=>lid.distance(p),clip:p=>s.din?clip.distance(p):Infinity},
  layout:{boardBottom,boardTop,wallTop,inner,rail:{y:ry,x0:px0-10,x1:px1+10,top},screws,latch,inserts:board.holes.map(at=>({at,feature:insert})),hooks}};
}
