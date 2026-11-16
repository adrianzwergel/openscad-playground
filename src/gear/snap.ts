// Placing a shaft on the plane: dragged near a wheel of another shaft that one of its own wheels could mesh with (same
// module, facing heights), it lands on the circle at the sum of the pitch radii, in angle steps round the partner; else
// on the mm grid. Pure: works on the plan as it was when the drag began.
import type {GearPlan} from './plan.ts';

export type Snap={at:[number,number];partner?:{shaft:string;wheel:string;mine:string;angle:number;distance:number}};
const overlap=(a0:number,a1:number,b0:number,b1:number)=>Math.min(a1,b1)-Math.max(a0,b0);
const grid=(v:number,g:number)=>g>0?Math.round(v/g)*g:v;
/** Where the shaft `id` lands for the pointer at `at` (mm). `tol`: how far from the mesh circle it still snaps (mm). */
export function snapShaft(p:GearPlan,id:string,at:[number,number],o:{angle:number;grid:number;tol:number;free?:boolean}):Snap{
 if(o.free)return {at};
 let best:{d:number;snap:Snap}|undefined;
 for(const mine of p.wheels.filter(w=>w.on===id&&!w.pulley&&!w.chain))for(const other of p.wheels){if(other.on===id||other.pulley||other.chain||other.module!==mine.module||overlap(mine.z0,mine.z1,other.z0,other.z1)<=.3)continue;
  const r=mine.pitch+other.pitch,dx=at[0]-other.at[0],dy=at[1]-other.at[1],d=Math.abs(Math.hypot(dx,dy)-r);if(d>o.tol||best&&d>=best.d)continue;
  const step=o.angle>0?o.angle:0,raw=Math.atan2(dy,dx)*180/Math.PI,angle=step?Math.round(raw/step)*step:raw,a=angle*Math.PI/180;
  best={d,snap:{at:[+(other.at[0]+r*Math.cos(a)).toFixed(4),+(other.at[1]+r*Math.sin(a)).toFixed(4)],partner:{shaft:other.on,wheel:other.key,mine:mine.key,angle:((angle%360)+360)%360,distance:r}}};}
 return best?.snap??{at:[grid(at[0],o.grid),grid(at[1],o.grid)]};}
/** Where a shaft stands at `angle` (degrees) round its partner at `distance`. */
export const around=(c:[number,number],distance:number,angle:number):[number,number]=>{const a=angle*Math.PI/180;return [+(c[0]+distance*Math.cos(a)).toFixed(4),+(c[1]+distance*Math.sin(a)).toFixed(4)];};

/** Moving a shaft along its axis by `dz` (mm) in the side view, like a clip on a timeline. It snaps where one of its
 * wheels comes level with a wheel it can run with on another shaft (gears of one module, or two pulleys): middle on
 * middle first, then edge on edge; else where one of its bearings comes level with a bearing of another shaft (the same
 * layer); else onto the grid. `to`: what it snapped to, in words. */
export function snapHeight(p:GearPlan,id:string,dz:number,o:{tol:number;grid:number;free?:boolean}):{dz:number;to?:string}{
 if(o.free)return {dz};const mid=(x:{z0:number;z1:number})=>(x.z0+x.z1)/2;let best:{d:number;dz:number;to:string}|undefined;
 const take=(want:number,to:string,rank:number)=>{const d=Math.abs(want-dz)+rank*1e-3;if(Math.abs(want-dz)<=o.tol&&(!best||d<best.d))best={d,dz:want,to};};
 for(const w of p.wheels.filter(x=>x.on===id))for(const v of p.wheels){if(v.on===id||w.pulley!==v.pulley||!!w.chain!==!!v.chain||!w.pulley&&!w.chain&&w.module!==v.module)continue;const to=`${w.label} auf der Höhe von ${v.label}`;take(mid(v)-mid(w),to,0);take(v.z0-w.z0,to,1);take(v.z1-w.z1,to,1);}
 if(!best)for(const b of p.bearings.filter(x=>x.on===id&&!x.motor&&!x.hub))for(const c of p.bearings){if(c.on===id||c.motor||c.hub)continue;const to=`${b.label} auf der Höhe von ${c.label}`;take(c.z0-b.z0,to,2);take(c.z1-b.z1,to,2);}
 if(best)return {dz:+best.dz.toFixed(4),to:best.to};const x=p.shafts.find(v=>v.id===id);return {dz:x&&o.grid>0?+(Math.round((x.z0+dz)/o.grid)*o.grid-x.z0).toFixed(4):dz};}
