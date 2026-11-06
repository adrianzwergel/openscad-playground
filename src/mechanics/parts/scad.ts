// The structure core's primitives as OpenSCAD: exact booleans for what goes to the printer. The same prims stand
// behind holes and solids in the view, so what is shown and what is printed cannot drift apart.
import type {Prim} from '../../structure/sdf.ts';
import type {Frame} from '../../structure/vec.ts';

const n=(x:number)=>String(Math.round(x*1e5)/1e5);
function matrix({position:p,rotation:[x,y,z,w]}:Frame){
 const m=[[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w),p[0]],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w),p[1]],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y),p[2]]];
 return `multmatrix([${m.map(r=>`[${r.map(n).join(',')}]`).join(',')},[0,0,0,1]])`;
}
export function primScad(s:Prim):string{
 switch(s.kind){
  case 'sphere':return `translate([${s.center.map(n).join(',')}]) sphere(r=${n(s.r)});`;
  case 'capsule':return `hull(){translate([${s.a.map(n).join(',')}]) sphere(r=${n(s.r)});translate([${s.b.map(n).join(',')}]) sphere(r=${n(s.rb??s.r)});}`;
  case 'cylinder':return `${matrix(s.frame)} translate([0,0,${n(s.z0)}]) cylinder(r=${n(s.r)},h=${n(s.z1-s.z0)});`;
  case 'box':return `${matrix(s.frame)} cube([${s.half.map(v=>n(2*v)).join(',')}],center=true);`;
  case 'slab':return `${matrix(s.frame)} translate([0,0,${n(s.z0)}]) linear_extrude(height=${n(s.z1-s.z0)}) polygon([${s.points.map(([x,y])=>`[${n(x)},${n(y)}]`).join(',')}]);`;
 }
}
export const solidScad=(g:{solids:Prim[];holes:Prim[]})=>`$fn=64;\ndifference(){\n union(){\n${g.solids.map(s=>'  '+primScad(s)).join('\n')}\n }\n${g.holes.map(s=>' '+primScad(s)).join('\n')}\n}\n`;
