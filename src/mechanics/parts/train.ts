// A gear train as you build it by hand: shafts in a plane, wheels on them. Which wheels mesh follows from where they
// stand, the ratio from which wheels mesh. `compileTrain` turns it into the mechanism format of the demos, so sliders,
// bearings and structures work on it as on any other mechanism. Train coordinates: `at` x and height of a shaft in the
// plane, `z` of a wheel along its shaft.
import {legoParts} from '../graph/lego-parts.ts';
import {legoSpec,spurSpec} from '../kinematics/catalog.ts';
import type {ElementSpec} from '../kinematics/catalog.ts';
import {compose,identity} from '../kinematics/math.ts';
import type {Frame,V} from '../kinematics/math.ts';
import type {Element,JointRelation,Mechanism,Contact} from '../kinematics/model.ts';
import type {Drive} from '../kinematics/drive.ts';
import {toward} from '../kinematics/drive.ts';
import {modelAsset,box,cylinder,along} from '../demos.ts';
import type {Demo} from '../demos.ts';

export const legoGears=legoParts.filter(p=>p.search&&p.teeth>0&&p.mount==='cross');
export type Shaft={id:string;at:[number,number]};
/** `part`: a LEGO gear by id; without one a printed spur gear of `module`. */
export type Wheel={id:string;shaft:string;z:number;teeth:number;module:number;width:number;part?:string;/** The group it sits in. */group?:string};
/** `input`, `output`: shafts. `drive`: what turns the input. `grid`: mm steps of a wheel standing alone, `angle`: degree
 * steps of a wheel around the one it meshes with (0: free). `target`: a meshing wheel's shaft lands only on points of the
 * mm grid where the mesh distance is exact. */
export type Train={shafts:Shaft[];wheels:Wheel[];input?:string;output?:string;drive:string;grid?:number;angle?:number;target?:boolean};
export const DEFAULT_ANGLE=15;
export const newTrain=():Train=>({shafts:[],wheels:[],drive:'lego-achse'});
export const parseTrain=(t:Train):Train=>{if(!t||!Array.isArray(t.shafts)||!Array.isArray(t.wheels)||t.wheels.length>64)throw Error('Ungültiges Getriebe');for(const w of t.wheels)if(!t.shafts.some(s=>s.id===w.shaft)||!(w.teeth>=6&&w.teeth<=200)||!(w.module>0)||!(w.width>0))throw Error('Getriebe: Rad ungültig');if(t.grid!==undefined&&!(t.grid>=0&&t.grid<=50)||t.angle!==undefined&&!(t.angle>=0&&t.angle<=180))throw Error('Getriebe: Raster ungültig');return structuredClone(t);};
export const pitchOf=(w:Wheel)=>w.module*w.teeth/2;
export const outerOf=(w:Wheel)=>{const p=w.part?legoParts.find(x=>x.id===w.part):undefined;return p?p.radius:pitchOf(w)+w.module;};
const shaftOf=(t:Train,w:Wheel)=>t.shafts.find(s=>s.id===w.shaft)!;
const apart=(a:Shaft,b:Shaft)=>Math.hypot(a.at[0]-b.at[0],a.at[1]-b.at[1]);
const facing=(a:Wheel,b:Wheel)=>Math.abs(a.z-b.z)<(a.width+b.width)/2-.01;
/** Wheels that mesh: facing each other at the sum of their pitch radii, of the same module. */
export function meshes(t:Train){const out:[Wheel,Wheel][]=[];t.wheels.forEach((a,i)=>{for(const b of t.wheels.slice(i+1))if(a.shaft!==b.shaft&&a.module===b.module&&facing(a,b)&&Math.abs(apart(shaftOf(t,a),shaftOf(t,b))-pitchOf(a)-pitchOf(b))<.05)out.push([a,b]);});return out;}
/** Turns of each shaft per turn of the input; a loop that disagrees locks the train. */
export function rates(t:Train){const rate=new Map<string,number>(),pairs=meshes(t);let locked=false;if(!t.input)return {rate,locked};rate.set(t.input,1);const open=[t.input];
 while(open.length){const s=open.pop()!;for(const [a,b] of pairs)for(const [x,y] of [[a,b],[b,a]]){if(x.shaft!==s)continue;const next=-rate.get(s)!*x.teeth/y.teeth,known=rate.get(y.shaft);if(known===undefined){rate.set(y.shaft,next);open.push(y.shaft);}else if(Math.abs(known-next)>1e-9)locked=true;}}
 return {rate,locked};}
/** Input turns per output turn. */
export function ratioOf(t:Train){const {rate}=rates(t),o=t.output?rate.get(t.output):undefined;return o?1/o:undefined;}
export type TrainIssue={wheels:string[];message:string};
const nameOf=(w:Wheel)=>`${w.part?'LEGO ':''}z${w.teeth}`;
export function trainIssues(t:Train):TrainIssue[]{const out:TrainIssue[]=[],pairs=meshes(t),{rate,locked}=rates(t);
 t.wheels.forEach((a,i)=>{for(const b of t.wheels.slice(i+1)){if(a.shaft===b.shaft){if(facing(a,b))out.push({wheels:[a.id,b.id],message:`${nameOf(a)} und ${nameOf(b)} sitzen auf derselben Welle ineinander.`});continue;}if(!facing(a,b)||pairs.some(p=>p.includes(a)&&p.includes(b)))continue;const d=apart(shaftOf(t,a),shaftOf(t,b));if(d<outerOf(a)+outerOf(b)+.5)out.push({wheels:[a.id,b.id],message:`${nameOf(a)} stößt an ${nameOf(b)}, ohne zu kämmen.`});}});
 if(locked)out.push({wheels:[],message:'Die Räder sperren sich: Ein Kreis aus Rädern kann sich so nicht drehen.'});
 if(!t.input||!t.output)out.push({wheels:[],message:'Eingang und Ausgang wählen.'});else if(t.input===t.output)out.push({wheels:[],message:'Eingang und Ausgang sind dieselbe Welle.'});else if(!rate.has(t.output))out.push({wheels:[],message:'Zwischen Eingang und Ausgang fehlt ein Eingriff.'});
 for(const s of t.shafts)if(t.input&&!rate.has(s.id)&&t.wheels.some(w=>w.shaft===s.id))out.push({wheels:t.wheels.filter(w=>w.shaft===s.id).map(w=>w.id),message:'Eine Welle hängt nicht am Getriebe.'});
 if(t.wheels.some(w=>w.part)&&t.wheels.some(w=>!w.part))out.push({wheels:[],message:'LEGO und gedruckte Räder lassen sich noch nicht mischen: Die Wellen sind verschieden.'});
 return out;}
/** Points of the `grid` (mm, from the origin) at exactly `d` from `c`. Few in general: 28 mm on a 1 mm grid has only the
 * four on the axes, 20 mm also 12/16 and its mirrors. */
export function gridPoints(c:[number,number],d:number,grid:number):[number,number][]{
 if(!(grid>0)||!(d>0)||d/grid>2000)return [];const out:[number,number][]=[],on=(v:number)=>Math.abs(v/grid-Math.round(v/grid))<1e-6;
 for(let i=Math.ceil((c[0]-d)/grid-1e-9);i*grid<=c[0]+d+1e-9;i++){const x=i*grid,rest=d*d-(x-c[0])**2;if(rest<-1e-6)continue;const dy=Math.sqrt(Math.max(0,rest));
  for(const y of dy<1e-9?[c[1]]:[c[1]-dy,c[1]+dy])if(on(y)){const q:[number,number]=[x,Math.round(y/grid)*grid];if(Math.abs(Math.hypot(q[0]-c[0],q[1]-c[1])-d)<1e-6&&!out.some(o=>o[0]===q[0]&&o[1]===q[1]))out.push(q);}}
 return out;}
/** Where a wheel goes for a pointer at `p`: on a shaft under it, at the mesh distance of a wheel near it (around it in
 * steps of `step` degrees, 0: free; with `target` on the exact grid point nearest the pointer), or on the grid of `grid`
 * mm (0: free). `partner`, `angle`: the wheel it meshes with and the direction from it, 0° along x, 90° up; `exact`: how
 * many exact grid points that circle has (0: none, so the angle steps were used). */
export function snapWheel(t:Train,w:Wheel,p:[number,number],grid=1,free=false,step=0,target=false):{at:[number,number];shaft?:string;z:number;partner?:string;angle?:number;exact?:number}{
 const others=t.wheels.filter(o=>o.id!==w.id&&o.shaft!==w.shaft);if(free)return {at:p,z:w.z};
 for(const s of t.shafts){if(!t.wheels.some(o=>o.shaft===s.id&&o.id!==w.id)||Math.hypot(p[0]-s.at[0],p[1]-s.at[1])>Math.max(3,Math.min(pitchOf(w),6))||s.id===w.shaft)continue;const on=t.wheels.filter(o=>o.shaft===s.id&&o.id!==w.id);return {at:s.at,shaft:s.id,z:Math.max(...on.map(o=>o.z+o.width/2))+w.width/2+.5};}
 let best:{at:[number,number];z:number;partner:string;angle:number;exact?:number}|undefined,miss=Infinity;
 for(const o of others){if(o.module!==w.module)continue;const c=shaftOf(t,o).at,d=pitchOf(o)+pitchOf(w),r=Math.hypot(p[0]-c[0],p[1]-c[1]),off=Math.abs(r-d);if(!(off<miss&&off<Math.max(6,d*.35)&&r>.1))continue;miss=off;
  const points=target?gridPoints(c,d,grid):[],q=points.sort((a,b)=>Math.hypot(a[0]-p[0],a[1]-p[1])-Math.hypot(b[0]-p[0],b[1]-p[1]))[0],angle=q?stepped(Math.atan2(q[1]-c[1],q[0]-c[0])*180/Math.PI,0):stepped(Math.atan2(p[1]-c[1],p[0]-c[0])*180/Math.PI,step);
  best={at:q??around(c,d,angle),z:o.z,partner:o.id,angle,...(target?{exact:points.length}:{})};}
 const g=(v:number)=>grid>0?Math.round(v/grid)*grid:v;
 return best??{at:[g(p[0]),g(p[1])],z:w.z};
}

const stepped=(a:number,step:number)=>{const s=step>0?Math.round(a/step)*step:a;return ((s%360)+360)%360;};
/** The point at `d` from `c` in the direction `angle` (degrees); exact at 0, 90, 180, 270. */
export function around(c:[number,number],d:number,angle:number):[number,number]{const q=Math.round(angle*1e6)/1e6,exact:Record<number,[number,number]>={0:[1,0],90:[0,1],180:[-1,0],270:[0,-1]},[x,y]=exact[q]??[Math.cos(angle*Math.PI/180),Math.sin(angle*Math.PI/180)];return [c[0]+d*x,c[1]+d*y];}
/** The first wheel `w` meshes with, and the direction to `w` from it (degrees). */
export function partnerOf(t:Train,w:Wheel){const pair=meshes(t).find(p=>p.some(x=>x.id===w.id));if(!pair)return undefined;const o=pair[0].id===w.id?pair[1]:pair[0],c=shaftOf(t,o).at,s=shaftOf(t,w).at;return {wheel:o,angle:stepped(Math.atan2(s[1]-c[1],s[0]-c[0])*180/Math.PI,0),distance:pitchOf(o)+pitchOf(w),centre:c};}

// ---------- to a mechanism ----------
function spec(w:Wheel):ElementSpec{const lego=w.part?legoParts.find(p=>p.id===w.part):undefined;return lego?legoSpec(lego,'spur'):spurSpec(w.teeth,w.module,w.width,5.1);}
/** The train as a mechanism on a base plate, like the gearbox demos: the plane stands upright on the plate, the shafts
 * run along y, the train belongs to the drive H1 and the output shaft is the axis the sliders turn. */
export function compileTrain(t:Train,label:string):Demo{
 const blocking=trainIssues(t);if(blocking.length)throw Error(blocking[0].message);
 const {rate}=rates(t),ratio=ratioOf(t)!,used=t.shafts.filter(s=>rate.has(s.id)&&t.wheels.some(w=>w.shaft===s.id)),wheels=t.wheels.filter(w=>rate.has(w.shaft));
 const y0=Math.min(...wheels.map(w=>w.z-w.width/2)),y1=Math.max(...wheels.map(w=>w.z+w.width/2)),low=Math.min(...wheels.map(w=>shaftOf(t,w).at[1]-outerOf(w))),H=6+10-low;
 const x0=Math.min(...wheels.map(w=>shaftOf(t,w).at[0]-outerOf(w))),x1=Math.max(...wheels.map(w=>shaftOf(t,w).at[0]+outerOf(w)));
 const centre=(s:Shaft):Frame=>({position:[s.at[0],0,s.at[1]+H],rotation:along.y}),out=t.shafts.find(s=>s.id===t.output)!,o=centre(out).position,lego=wheels.some(w=>w.part);
 const size:V=[x1-x0+48,y1-y0+72,6],start=y0-24;
 const {asset,mesh}=modelAsset(`getriebe-${crypto.randomUUID().slice(0,8)}`,label,[['Grundplatte',box([(x0+x1)/2,(y0+y1)/2,3],size)],['Abtriebsachse',cylinder('y',[o[0],(y0+y1)/2,o[2]],lego?2.4:2.5,y1-y0+48)]]);
 const body=(s:Shaft)=>s.id===t.output?'Abtrieb':`H1/s${used.filter(x=>x.id!==t.output).indexOf(s)}`,jointOf=(s:Shaft)=>s.id===t.output?'Abtrieb':`H1/ground/s${used.filter(x=>x.id!==t.output).indexOf(s)}`;
 // The input shaft comes first: the drive turns it.
 used.sort((a,b)=>(b.id===t.input?1:0)-(a.id===t.input?1:0));
 const span=(s:Shaft)=>{const on=wheels.filter(w=>w.shaft===s.id);return [Math.min(...on.map(w=>w.z-w.width/2)),Math.max(...on.map(w=>w.z+w.width/2))];};
 const mechanism:Mechanism={format:'kinematics-1',parameters:[],patterns:[],
  bodies:[{id:'ground',frame:identity(),ground:true,display:mesh(['Grundplatte'])},{id:'Abtrieb',frame:centre(out),display:mesh(['Abtriebsachse'])},...used.filter(s=>s!==out).map(s=>{const [a,b]=span(s);return {id:body(s),frame:centre(s),shaft:{diameter:lego?4.8:5,start:s.id===t.input?start:a-14,end:b+14}};})],
  joints:used.map((s):JointRelation=>({id:jointOf(s),joint:{kind:'revolute'},a:{body:'ground',local:centre(s)},b:{body:body(s),local:identity()},...(s===out?{limits:{min:-180,max:180}}:{})})),
  elements:wheels.map((w,k):Element=>{const e=spec(w),s=shaftOf(t,w);return {id:`H1/r${k+1}`,source:e.source,surfaces:e.surfaces,interfaces:e.interfaces,envelope:e.envelope,mounts:[{interface:'bore',body:body(s),pose:compose(identity(),{position:[0,0,w.z],rotation:[0,0,0,1]})}],phase:0};}),
  contacts:meshes(t).filter(([a,b])=>rate.has(a.shaft)&&rate.has(b.shaft)).map(([a,b],k):Contact=>({id:`H1/k${k+1}`,kind:'roll',mode:'fixed-axes',a:{element:`H1/r${wheels.indexOf(a)+1}`,surface:'teeth'},b:{element:`H1/r${wheels.indexOf(b)+1}`,surface:'teeth'},params:{offsetA:0,offsetB:0}})),
  input:{kind:'coordinate',joint:'Abtrieb',coordinate:0},output:{kind:'coordinate',joint:'Abtrieb',coordinate:0},range:{from:-180,to:180,samples:37}};
 const perOutput=Object.fromEntries(used.filter(s=>s!==out).map(s=>[jointOf(s),rate.get(s.id)!/rate.get(out.id)!])),inputShaft=t.shafts.find(s=>s.id===t.input)!,iC=centre(inputShaft).position;
 const drives:Drive[]=[{id:'H1',spec:t.drive,body:'ground',frame:{position:[iC[0],start-6,iC[2]],rotation:toward([0,1,0])},axis:'Abtrieb',target:Math.abs(ratio),tolerance:5,maxStages:Math.max(1,used.length-1),gear:{reference:0,rates:perOutput,offsets:Object.fromEntries(Object.keys(perOutput).map(id=>[id,0])),label:wheels.map(nameOf).join(' · '),ratio:Math.abs(ratio),notes:[]}}];
 return {label,asset,mechanism,drives,...(lego?{fabrication:{bearings:{shaft:'lego',prefer:'plain',clearance:.2,wall:4}}}:{})};
}
