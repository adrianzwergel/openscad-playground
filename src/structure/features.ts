// Holding features of the structure core: the places where purchased parts are
// clamped in or bolted on. Each feature is a boss (solid), cut-outs (holes),
// zones that must stay free (assembly access) and ports where struts attach.
// Frames: z is the feature axis (bearing axis, flange normal, pad normal).
import type {V,Frame} from './vec.ts';
import {apply,compose,axisAngle} from './vec.ts';
import type {Prim} from './sdf.ts';

/** `open`: side the part is pushed in from (+1: +z, -1: -z). */
export type Feature=
 |{kind:'bearing';d:number;D:number;B:number;fit:number;wall:number;open:1|-1}
 |{kind:'plain';d:number;length:number;clearance:number;wall:number}
 |{kind:'hub';d:number;length:number;wall:number;setScrew:boolean}
 |{kind:'linear';D:number;B:number;fit:number;wall:number}
 |{kind:'rod';d:number;length:number;wall:number}
 |{kind:'flange';size:number;pilot:number;spacing:number;hole:number;thickness:number}
 |{kind:'nut';flange:number;body:number;circle:number;hole:number;thickness:number}
 |{kind:'pad';width:number;depth:number;thickness:number;holes:[number,number][];hole:number}
 |{kind:'din';width:number;thickness:number}
 |{kind:'standoff';height:number;outer:number;hole:number}
 /** Boss for a heat-set threaded insert (M3: hole 4.0, depth 5.7), its face at z = 0, the boss below. */
 |{kind:'insert';outer:number;hole:number;depth:number;height:number}
 /** Snap hook: a cantilever along +z from its root at z = 0 (thickness along x, width along y), a lip at its tip
  * reaching `lip` out in +x with a lead-in chamfer; it bends towards −x when pushed in. */
 |{kind:'snap';length:number;width:number;thickness:number;lip:number}
 /** A plate joining several seats (convex outline in the frame's xy plane, CCW). */
 |{kind:'plate';points:[number,number][];thickness:number};

export type FeatureGeometry={solids:Prim[];holes:Prim[];keep:Prim[];ports:V[]};
const cyl=(frame:Frame,r:number,z0:number,z1:number):Prim=>({kind:'cylinder',frame,r,z0,z1});
const at=(f:Frame,x:number,y:number,z:number):Frame=>compose(f,{position:[x,y,z],rotation:[0,0,0,1]});
const ring=(f:Frame,r:number,zs:number[],count=8)=>zs.flatMap(z=>Array.from({length:count},(_,i)=>{const a=2*Math.PI*(i+.5)/count;return apply(f,[r*Math.cos(a),r*Math.sin(a),z]);}));
const rim=(f:Frame,w:number,h:number,z:number)=>[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]].map(([x,y])=>apply(f,[x*w/2,y*h/2,z]));
/** The window a snap hook catches in, cut into the mating wall (frame of the hook, the wall's inner face at x = 0):
 * as high as the lip plus `play`, as wide as the hook plus `play` on each side. */
export function snapWindow(f:Extract<Feature,{kind:'snap'}>,frame:Frame,wall:number,play=.3):Prim{const c=f.lip*1.5;return {kind:'box',frame:at(frame,wall/2,0,f.length-c/2-.5),half:[wall/2+1,f.width/2+play,(c+1)/2+play]};}
/** Strain at the root of a snap hook pushed in by its lip: ε = 1.5·t·δ / L² (PLA stays below about 2 %). */
export const snapStrain=(f:Extract<Feature,{kind:'snap'}>)=>1.5*f.thickness*f.lip/(f.length*f.length);
/** Radial screw hole along +x at height z (set screw, clamp). */
const radial=(f:Frame,z:number,from:number,to:number,r=1.25):Prim=>cyl(compose(at(f,0,0,z),{position:[0,0,0],rotation:axisAngle([0,1,0],90)}),r,from,to);

/** Outer extent of a feature along its axis and radially (for layout checks). */
export function featureSize(f:Feature):{radius:number;z0:number;z1:number}{
 switch(f.kind){
  case 'bearing':return {radius:f.D/2+f.wall,z0:f.open>0?-f.B/2-1.5:-f.B/2,z1:f.open>0?f.B/2:f.B/2+1.5};
  case 'plain':return {radius:f.d/2+f.wall+1,z0:-f.length/2,z1:f.length/2};
  case 'hub':return {radius:f.d/2+f.wall+2,z0:-f.length/2,z1:f.length/2};
  case 'linear':return {radius:f.D/2+f.wall,z0:-f.B/2-1,z1:f.B/2+1};
  case 'rod':return {radius:f.d/2+f.wall+1,z0:-f.length/2,z1:f.length/2};
  case 'flange':return {radius:f.size*.71,z0:0,z1:f.thickness};
  // The bought nut's flange is an obstacle of its link: the boss reaches 6 mm past it, so struts leave with room.
  case 'nut':return {radius:f.flange/2+6,z0:-f.thickness/2,z1:f.thickness/2};
  case 'pad':return {radius:Math.hypot(f.width,f.depth)/2,z0:-f.thickness,z1:0};
  case 'din':return {radius:f.width*.75,z0:-f.thickness-8,z1:0};
  case 'standoff':return {radius:f.outer/2,z0:-f.height,z1:0};
  case 'insert':return {radius:f.outer/2,z0:-f.height,z1:0};
  case 'snap':return {radius:Math.hypot(f.thickness+f.lip,f.width/2),z0:0,z1:f.length};
  case 'plate':return {radius:Math.max(...f.points.map(([x,y])=>Math.hypot(x,y))),z0:-f.thickness/2,z1:f.thickness/2};
 }
}
export function featureGeometry(f:Feature,frame:Frame):FeatureGeometry{
 const s=featureSize(f);
 switch(f.kind){
  case 'bearing':{const o=f.open,face=o*f.B/2;
   return {solids:[cyl(frame,s.radius,s.z0,s.z1)],
    holes:[cyl(frame,(f.D+f.fit)/2,o>0?-f.B/2:-f.B/2-2,o>0?f.B/2+2:f.B/2),cyl(frame,f.d/2+1.2,s.z0-3,s.z1+3)],
    // The bearing goes in from the open side: keep a corridor free.
    keep:[cyl(frame,f.D/2+1,o>0?face:face-30,o>0?face+30:face)],ports:ring(frame,s.radius,[s.z0+1.2,s.z1-1.2])};}
  case 'plain':return {solids:[cyl(frame,s.radius,s.z0,s.z1)],holes:[cyl(frame,(f.d+f.clearance)/2,s.z0-3,s.z1+3)],keep:[],ports:ring(frame,s.radius,[s.z0+1.2,s.z1-1.2])};
  case 'hub':return {solids:[cyl(frame,s.radius,s.z0,s.z1)],holes:[cyl(frame,(f.d+.05)/2,s.z0-3,s.z1+3),...(f.setScrew?[radial(frame,0,f.d/2-.5,s.radius+3)]:[])],keep:[],ports:ring(frame,s.radius,[s.z0+1.2,s.z1-1.2])};
  case 'linear':return {solids:[cyl(frame,s.radius,s.z0,s.z1)],holes:[cyl(frame,(f.D+f.fit)/2,s.z0-3,s.z1+3)],keep:[],ports:ring(frame,s.radius,[s.z0+1.2,s.z1-1.2])};
  case 'rod':return {solids:[cyl(frame,s.radius,s.z0,s.z1)],holes:[cyl(frame,(f.d+.1)/2,s.z0-3,s.z1+3),radial(frame,0,f.d/2-.5,s.radius+3)],keep:[],ports:ring(frame,s.radius,[s.z0+1.2,s.z1-1.2])};
  case 'flange':{const c=f.spacing/2,t=f.thickness;
   return {solids:[{kind:'box',frame:at(frame,0,0,t/2),half:[f.size/2,f.size/2,t/2],round:2}],
    holes:[cyl(frame,f.pilot/2+.3,-2,t+2),...[[1,1],[1,-1],[-1,1],[-1,-1]].map(([x,y])=>cyl(at(frame,x*c,y*c,0),f.hole/2,-2,t+2))],
    keep:[],ports:rim(frame,f.size,f.size,t/2)};}
  case 'nut':{const t=f.thickness;
   return {solids:[cyl(frame,s.radius,-t/2,t/2)],holes:[cyl(frame,f.body/2+.2,-t/2-3,t/2+3),...[0,1,2,3].map(i=>{const a=Math.PI/4+i*Math.PI/2;return cyl(at(frame,f.circle/2*Math.cos(a),f.circle/2*Math.sin(a),0),f.hole/2,-t/2-3,t/2+3);})],
    // Ports round the rim and on both faces: the thrust along the screw can leave the flange axially, not only by bending.
    keep:[],ports:[...ring(frame,s.radius,[0],8),...ring(frame,s.radius-2,[-t/2,t/2],8)]};}
  case 'pad':{const t=f.thickness;
   return {solids:[{kind:'box',frame:at(frame,0,0,-t/2),half:[f.width/2,f.depth/2,t/2],round:1.5}],holes:f.holes.map(([x,y])=>cyl(at(frame,x,y,0),f.hole/2,-t-2,2)),keep:[],ports:rim(frame,f.width,f.depth,-t/2)};}
  case 'din':{
   // 35 mm top-hat rail clip: a base plate with a fixed hook and a sprung hook (EN 60715).
   const t=f.thickness,w=f.width;
   return {solids:[{kind:'box',frame:at(frame,0,0,-t/2),half:[w/2,22,t/2],round:1},{kind:'box',frame:at(frame,0,18.75,-t-2.5),half:[w/2,1.5,3.5]},{kind:'box',frame:at(frame,0,17.25,-t-5.2),half:[w/2,3,.8]},
     {kind:'box',frame:at(frame,0,-18.75,-t-2.5),half:[w/2,1.5,3.5]},{kind:'box',frame:at(frame,0,-17.25,-t-5.2),half:[w/2,3,.8]}],
    holes:[{kind:'box',frame:at(frame,0,-12,-t/2),half:[w/2+1,1,t/2+1]}],keep:[{kind:'box',frame:at(frame,0,0,-t-5),half:[w/2+2,16.5,4.2]}],ports:rim(frame,w,44,-t/2)};}
  case 'plate':{const t=f.thickness;return {solids:[{kind:'slab',frame,points:f.points,z0:-t/2,z1:t/2}],holes:[],keep:[],ports:f.points.flatMap((p,i)=>{const q=f.points[(i+1)%f.points.length];return [apply(frame,[p[0],p[1],0]),apply(frame,[(p[0]+q[0])/2,(p[1]+q[1])/2,0])];})};}
  case 'standoff':return {solids:[cyl(frame,f.outer/2,-f.height,0)],holes:[cyl(frame,f.hole/2,-f.height-2,2)],keep:[cyl(frame,f.outer/2+1,0,8)],ports:ring(frame,f.outer/2,[-f.height+1.2],4)};
  // The insert is pressed in from the face: its hole, a little deeper for the melt, and room above for the iron.
  case 'insert':return {solids:[cyl(frame,f.outer/2,-f.height,0)],holes:[cyl(frame,f.hole/2,-f.depth-.5,1)],keep:[cyl(frame,f.outer/2+1,0,10)],ports:ring(frame,f.outer/2,[-f.height+1.2],4)};
  case 'snap':{const t=f.thickness,L=f.length,w=f.width,c=f.lip*1.5;
   return {solids:[{kind:'box',frame:at(frame,-t/2,0,L/2),half:[t/2,w/2,L/2]},
     // Lip: square face towards the root (it holds), chamfer towards the tip (it slides in).
     {kind:'slab',frame:compose(at(frame,0,-w/2,0),{position:[0,0,0],rotation:axisAngle([1,0,0],-90)}),points:[[0,-(L-c-1)],[0,-L],[f.lip,-(L-c-1)]] as [number,number][],z0:0,z1:w}],
    holes:[],keep:[{kind:'box',frame:at(frame,-t-f.lip/2-.5,0,L/2+1),half:[f.lip/2+.5,w/2+.5,L/2+1]}],ports:rim(frame,2*t,w,0).filter((_,i)=>i%2===0)};}
 }
}
