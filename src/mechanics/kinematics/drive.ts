// Drive sources on a target mechanism (KINEMATIK-KERN.md 15): a motor or hand
// wheel sits on a link and drives one axis. The route search runs in the frame
// of that carrying link, where motor shaft and axis stand still to each other;
// the parts of all links become obstacles. A found train is merged into the
// mechanism: its last part sits on the driven link (or, on a path, rolls on a
// rail along it). Train shafts follow their axis with fixed rates, so sliders
// hold them analytically and the solver checks the train over the range.
import type {V,Frame} from './math.ts';
import type {Q} from './math.ts';
import {identity,compose,inverse,rotate,axisAngle,add,scale,norm,dot,cross} from './math.ts';
import type {Mechanism,Element,Region,JointRelation,Body} from './model.ts';
import type {RouteRequest,RouteOptions} from './search/route.ts';
import {solve} from './solver.ts';
import {separation} from '../graph/space.ts';
import type {Hull} from '../graph/space.ts';

/** `torque`: holding torque in Nm (a hand wheel: what a hand puts on it). */
export type DriveSpec={id:string;label:string;kind:'motor'|'hand';size:V;shaft:{diameter:number;length:number};torque:number;note:string};
export const driveCatalog:DriveSpec[]=[
 {id:'nema14',label:'NEMA 14 Schrittmotor',kind:'motor',size:[35.2,35.2,34],shaft:{diameter:5,length:20},torque:.18,note:'Flansch 35,2 mm · Welle 5 mm · ca. 0,18 Nm'},
 {id:'nema17',label:'NEMA 17 Schrittmotor (40 mm)',kind:'motor',size:[42.3,42.3,40],shaft:{diameter:5,length:24},torque:.45,note:'Flansch 42,3 mm · Welle 5 mm · ca. 0,45 Nm'},
 {id:'nema17-48',label:'NEMA 17 Schrittmotor (48 mm)',kind:'motor',size:[42.3,42.3,48],shaft:{diameter:5,length:24},torque:.55,note:'Flansch 42,3 mm · Welle 5 mm · ca. 0,55 Nm'},
 {id:'nema23',label:'NEMA 23 Schrittmotor',kind:'motor',size:[56.4,56.4,56],shaft:{diameter:6.35,length:21},torque:1.3,note:'Flansch 56,4 mm · Welle 6,35 mm · ca. 1,3 Nm'},
 {id:'handrad',label:'Handrad mit Lagerbock',kind:'hand',size:[50,50,20],shaft:{diameter:8,length:30},torque:2,note:'Lagerbock 50 mm · Welle 8 mm · Handrad hinter dem Bock'},
];
export const driveSpec=(id:string)=>{const s=driveCatalog.find(x=>x.id===id);if(!s)throw Error(`Antrieb ${id} nicht im Katalog.`);return s;};

/** `rates`: degrees (or mm) each train joint moves per unit of the driven axis, from `reference`. */
/** `offsets`: joint values at the reference (a spindle's angle follows from where its nut sits). */
export type DriveGear={reference:number;rates:Record<string,number>;offsets?:Record<string,number>;label:string;ratio:number;notes:string[]};
/** `frame`: flange centre on the carrying link, z along the shaft (pointing out of the motor). `target`:
 * reduction (motor turns per axis turn) for rotary axes, millimetres per motor turn for linear axes and paths. */
/** `lego`: no longer used (LEGO parts come from the catalog like any other part). */
export type Drive={id:string;spec:string;body:string;frame:Frame;axis:string;target:number;tolerance:number;maxStages?:number;lego?:boolean;gear?:DriveGear};

/** Quaternion turning +z onto `v`. */
export function toward(v:V):Q{const z:V=[0,0,1],c=cross(z,v),s=norm(c),d=v[2]/norm(v);if(s<1e-9)return d>0?[0,0,0,1]:axisAngle([1,0,0],180) as Q;return axisAngle(c.map(n=>n/s) as V,Math.atan2(s/norm(v),d)*180/Math.PI) as Q;}
/** Outward normal of the triangle nearest to a point on a soup (winding gives the outside). */
export function faceNormal(p:Float32Array,point:V):V{
 let best=Infinity,normal:V=[0,0,1];
 for(let t=0;t<p.length;t+=9){const a:V=[p[t],p[t+1],p[t+2]],b:V=[p[t+3],p[t+4],p[t+5]],c:V=[p[t+6],p[t+7],p[t+8]],n=cross(add(b,scale(a,-1)),add(c,scale(a,-1))),l=norm(n);if(l<1e-12)continue;const u=scale(n,1/l);
  // Distance to the plane plus how far the foot lies outside the triangle (edge tests by barycentric signs).
  const foot=add(point,scale(u,-dot(add(point,scale(a,-1)),u))),inside=[[a,b],[b,c],[c,a]].every(([x,y])=>dot(cross(add(y,scale(x,-1)),add(foot,scale(x,-1))),u)>=-1e-6);
  const centre=scale(add(add(a,b),c),1/3),d=Math.abs(dot(add(point,scale(a,-1)),u))+(inside?0:norm(add(foot,scale(centre,-1)))*.5);if(d<best){best=d;normal=u;}}
 return normal;
}
/** Flange frame for a motor standing on a face: body on the face, shaft along the outward normal. */
export function standOn(d:Pick<Drive,'spec'>,point:V,normal:V):Frame{const n=scale(normal,1/norm(normal));return {position:add(point,scale(n,driveSpec(d.spec).size[2])),rotation:toward(n)};}
/** Same flange, shaft turned parallel to the driven axis (the nearer of both directions). */
export function parallelTo(m:Mechanism,d:Drive):Frame{
 const j=axisJoint(m,d.axis),side=j.a.body===d.body?j.a:j.b.body===d.body?j.b:undefined;if(!side)throw Error('Der Motor sitzt nicht an dieser Achse.');
 const a=rotate(side.local.rotation,[0,0,1]),z=rotate(d.frame.rotation,[0,0,1]);return {position:d.frame.position,rotation:toward(dot(a,z)<0?scale(a,-1):a)};
}
export const owned=(drives:Drive[],id:string)=>drives.some(d=>id===d.id||id.startsWith(d.id+'/'));
export const axisJoint=(m:Mechanism,id:string)=>{const j=m.joints.find(x=>x.id===id);if(!j)throw Error(`Achse ${id} fehlt.`);return j;};
export const linearAxis=(j:JointRelation)=>j.joint.kind==='prismatic'||j.joint.kind==='path';
/** Axes with a slider: movable joints that are neither placeholders nor part of a drive. */
export function modelAxes(m:Mechanism,drives:Drive[]){return m.joints.filter(j=>!j.id.startsWith('halt-')&&!owned(drives,j.id)&&['revolute','prismatic','cylindrical','screw','path'].includes(j.joint.kind));}

export function parseDrives(value:unknown,m:Mechanism):Drive[]{
 if(value===undefined)return [];if(!Array.isArray(value)||value.length>32)throw Error('Antriebe: Liste erwartet.');
 const seen=new Set<string>();
 return value.map((d:Drive)=>{
  if(!d||typeof d.id!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,30}$/.test(d.id)||seen.has(d.id))throw Error('Antrieb: ungültige ID.');seen.add(d.id);driveSpec(d.spec);
  if(!m.bodies.some(b=>b.id===d.body))throw Error(`Antrieb ${d.id}: Glied ${d.body} fehlt.`);if(!m.joints.some(j=>j.id===d.axis))throw Error(`Antrieb ${d.id}: Achse ${d.axis} fehlt.`);
  const f=d.frame;if(!f||f.position?.length!==3||f.rotation?.length!==4||![...f.position,...f.rotation].every(Number.isFinite)||Math.abs(Math.hypot(...f.rotation)-1)>1e-6)throw Error(`Antrieb ${d.id}: Lage ungültig.`);
  if(!(d.target>0&&d.target<=1000)||!(d.tolerance>=0&&d.tolerance<=50))throw Error(`Antrieb ${d.id}: Ziel oder Toleranz ungültig.`);
  if(d.gear&&(!Number.isFinite(d.gear.reference)||typeof d.gear.rates!=='object'||!Object.values(d.gear.rates).every(Number.isFinite)))throw Error(`Antrieb ${d.id}: Getriebe ungültig.`);
  return structuredClone(d);
 });
}

/** Motor body on the carrying link: a box behind the flange, held by a fixed joint. */
export function placeMotor(m:Mechanism,d:Drive){
 const spec=driveSpec(d.spec),carrier=m.bodies.find(b=>b.id===d.body);if(!carrier)throw Error(`Glied ${d.body} fehlt.`);
 m.bodies=m.bodies.filter(b=>b.id!==d.id);m.joints=m.joints.filter(j=>j.id!==`${d.id}/halter`);
 m.bodies.push({id:d.id,frame:compose(carrier.frame,d.frame),display:{kind:'box',size:[...spec.size] as V,offset:[0,0,-spec.size[2]/2]},shaft:{diameter:spec.shaft.diameter,start:0,end:spec.shaft.length}});
 m.joints.push({id:`${d.id}/halter`,joint:{kind:'fixed'},a:{body:d.body,local:d.frame},b:{body:d.id,local:identity()}});
}
/** Removes the train of a drive (the motor stays). */
export function removeGear(m:Mechanism,d:Drive){
 const mine=(id:string)=>id.startsWith(d.id+'/')&&id!==`${d.id}/halter`;
 m.bodies=m.bodies.filter(b=>!mine(b.id));m.joints=m.joints.filter(j=>!mine(j.id));
 const gone=new Set(m.elements.filter(e=>mine(e.id)).map(e=>e.id));m.elements=m.elements.filter(e=>!gone.has(e.id));m.contacts=m.contacts.filter(c=>!mine(c.id)&&!gone.has(c.a.element)&&!gone.has(c.b.element));
 delete d.gear;
}
export function removeDrive(m:Mechanism,d:Drive){removeGear(m,d);m.bodies=m.bodies.filter(b=>b.id!==d.id);m.joints=m.joints.filter(j=>j.id!==`${d.id}/halter`);}
/** Held coordinates of every adopted train for the given axis values. */
export function heldTrains(drives:Drive[],values:Record<string,number>){
 const out:Record<string,number[]>={};
 for(const d of drives)if(d.gear){const q=values[d.axis];if(q===undefined)continue;for(const [id,rate] of Object.entries(d.gear.rates))out[id]=[(d.gear.offsets?.[id]??0)+rate*(q-d.gear.reference)];}
 return out;
}

// ---------- obstacles from model parts ----------
export type Box={min:V;max:V};
const boxCache=new WeakMap<Float32Array,Box[]>(),fineCache=new WeakMap<Float32Array,Box[]>();
/** One box per triangle: follows round parts closely when they turn (collision sweeps). */
export function triangleBoxes(p:Float32Array):Box[]{
 const cached=fineCache.get(p);if(cached)return cached;const out:Box[]=[];
 for(let t=0;t<p.length;t+=9){const min:V=[Infinity,Infinity,Infinity],max:V=[-Infinity,-Infinity,-Infinity];for(let v=0;v<3;v++)for(let k=0;k<3;k++){min[k]=Math.min(min[k],p[t+v*3+k]);max[k]=Math.max(max[k],p[t+v*3+k]);}out.push({min,max});}
 fineCache.set(p,out);return out;
}
/** Boxes around a triangle soup: one box for compact parts, else one per 40 mm cell of triangle centroids. */
export function partBoxes(p:Float32Array,cell=40,compact=300):Box[]{
 const cached=boxCache.get(p);if(cached)return cached;
 const min:V=[Infinity,Infinity,Infinity],max:V=[-Infinity,-Infinity,-Infinity];
 for(let i=0;i<p.length;i+=3)for(let k=0;k<3;k++){min[k]=Math.min(min[k],p[i+k]);max[k]=Math.max(max[k],p[i+k]);}
 let out:Box[]=[{min,max}];
 if(Math.max(...max.map((x,k)=>x-min[k]))>compact){const cells=new Map<string,Box>();
  for(let t=0;t<p.length;t+=9){const c=[0,1,2].map(k=>(p[t+k]+p[t+3+k]+p[t+6+k])/3),key=c.map(x=>Math.floor(x/cell)).join(',');let b=cells.get(key);if(!b){b={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};cells.set(key,b);}
   for(let v=0;v<3;v++)for(let k=0;k<3;k++){b.min[k]=Math.min(b.min[k],p[t+v*3+k]);b.max[k]=Math.max(b.max[k],p[t+v*3+k]);}}
  out=[...cells.values()];}
 boxCache.set(p,out);return out;
}
export type Assets=(asset:string)=>{parts:{id:string;positions:Float32Array}[]}|undefined;
/** Part boxes of the links as frames in `into` coordinates (world poses from `frames`). */
function linkBoxes(m:Mechanism,assets:Assets,frames:Record<string,Frame>,into:Frame,fine=false){
 const out:{body:string;id:string;frame:Frame;size:V}[]=[];
 for(const b of m.bodies){if(b.display?.kind!=='mesh'||!frames[b.id])continue;const asset=assets(b.display.asset);if(!asset)continue;
  const local=compose(compose(inverse(into),frames[b.id]),inverse(b.frame));
  for(const id of b.display.parts){const part=asset.parts.find(p=>p.id===id);if(!part)continue;
   (fine?triangleBoxes(part.positions):partBoxes(part.positions)).forEach((x,k)=>out.push({body:b.id,id:`${b.id}:${id}:${k}`,frame:compose(local,{position:x.min.map((n,i)=>(n+x.max[i])/2) as V,rotation:[0,0,0,1]}),size:x.max.map((n,i)=>Math.max(.5,n-x.min[i])) as V}));}}
 return out;
}
function motorBox(m:Mechanism,d:Drive,frames:Record<string,Frame>,into:Frame){const spec=driveSpec(d.spec),carrier=frames[d.body];if(!carrier)return undefined;return {id:'motor:'+d.id,frame:compose(compose(compose(inverse(into),carrier),d.frame),{position:[0,0,-spec.size[2]/2],rotation:[0,0,0,1]}),size:[...spec.size] as V};}

// ---------- search task ----------
/** `rail`: for a path drive, what `pinionEnd` needs to judge a found train. */
export type TaskInfo={rail?:{local:Frame;motor:Frame;size:V};drive:string;kind:'rotation'|'translation'|'path';carrier:string;driven:string;outPerAxis:number;reference:number;lo:number;hi:number;frames:Record<string,Frame>;pinion?:{module:number;teeth:number;radius:number}};
export type DriveTask={request:RouteRequest;options:RouteOptions;info:TaskInfo};
const PINION={module:2,teeth:20,radius:20};
/** The route request of a drive in the frame of its carrying link at the given pose. */
/** `catalog`: what the Studio's catalog leaves to the search: transmission rules switched off and parts locked (part keys,
 * family and parameters as in graph/catalog). Without it the printed kinds are used (Node tests and scripts). */
export type DriveCatalog={excludedRules:string[];lockedParts:string[]};
export function driveTask(m:Mechanism,drives:Drive[],d:Drive,assets:Assets,frames:Record<string,Frame>,values:Record<string,number>,o:{budget?:number;seed?:number;catalog?:DriveCatalog}={}):DriveTask{
 const j=axisJoint(m,d.axis),side=j.a.body===d.body?'a':j.b.body===d.body?'b':undefined;
 if(!side)throw Error(`Der Motor muss auf einem der beiden Glieder der Achse ${j.id} sitzen (${j.a.body} oder ${j.b.body}).`);
 const c=j[side],driven=(side==='a'?j.b:j.a).body,sign=side==='a'?1:-1,WC=frames[d.body];if(!WC||!frames[driven])throw Error('Stellung der Glieder unbekannt.');
 const lo=j.limits?.min??(linearAxis(j)?0:-180),hi=j.limits?.max??(linearAxis(j)?200:180),reference=values[j.id]??0;
 let output:RouteRequest['output'],kind:TaskInfo['kind'],outPerAxis=sign,target=d.target,pinion:TaskInfo['pinion'];
 if(j.joint.kind==='revolute'){kind='rotation';output={kind:'frame',body:'out',local:identity(),target:c.local,constraint:'axis'};}
 else if(j.joint.kind==='prismatic'){kind='translation';output={kind:'frame',body:'out',local:identity(),target:c.local,constraint:'axis'};}
 else if(j.joint.kind==='path'){
  if(side!=='b')throw Error('Auf einem Pfad sitzt der Antrieb auf dem Wagen (Glied B des Pfads).');
  // The pinion rolls on a rail along the path; its centre sits on the wagon's normal through the path point.
  kind='path';pinion={...PINION};output={kind:'frame',body:'out',local:identity(),target:compose(c.local,{position:[0,pinion.radius,0],rotation:[0,0,0,1]}),constraint:'axis'};
  outPerAxis=-180/Math.PI/pinion.radius;target=2*Math.PI*pinion.radius/d.target;}
 else throw Error('Antriebe treiben Dreh-, Linear- und Pfadachsen.');
 // Parallel trains and spindles keep the shaft direction: face the output the way the motor looks.
 if(dot(rotate(d.frame.rotation,[0,0,1]),rotate(output.target.rotation,[0,0,1]))<-.5){output={...output,target:compose(output.target,{position:[0,0,0],rotation:axisAngle([1,0,0],180)})};outPerAxis=-outPerAxis;}
 // Only the axis line counts: start the search where the motor flange meets it, not deep inside the model.
 {const t=output.target,z=rotate(t.rotation,[0,0,1]),reachOut=dot(add(d.frame.position,scale(t.position,-1)),z)+driveSpec(d.spec).shaft.length/2;output={...output,target:{...t,position:add(t.position,scale(z,reachOut))}};}
 const own=linkBoxes(m,assets,frames,WC).filter(b=>!b.body.startsWith(d.id+'/')),motors=drives.map(x=>motorBox(m,x,frames,WC)).filter(x=>!!x);
 // Only what lies near the motor and the axis can matter; far parts only slow the search.
 const a=d.frame.position,b=output.target.position,ab=add(b,scale(a,-1)),reach=(p:V)=>{const t=Math.max(0,Math.min(1,dot(add(p,scale(a,-1)),ab)/Math.max(1e-9,dot(ab,ab))));return norm(add(p,scale(add(a,scale(ab,t)),-1)));};
 const near=(r:{frame:Frame;size:V})=>reach(r.frame.position)-norm(r.size)/2<=260;
 const obstacles:Region[]=[...own.filter(near).map(x=>({id:x.id,frame:x.frame,size:x.size,...(x.body===driven&&kind!=='path'?{role:'output' as const}:x.body===d.body?{role:'carrier' as const}:{})})),...motors.filter(near)];
 // The catalog decides: its rules (LEGO pairs with their kind) minus those switched off; locked parts are filtered out.
 // With the catalog (LEGO pairs among the rest) the search has many more pairs: it gets 15000 steps instead of 6000.
 const rules=['external-spur','gt2-belt','bevel-mesh','worm-mesh',...(kind==='translation'?['screw-nut','rack-drive']:[]),...(o.catalog?['lego-spur','lego-bevel-90','lego-worm']:[])].filter(id=>!o.catalog?.excludedRules.includes(id));
 const request:RouteRequest={input:{kind:'frame',body:'s0',local:identity(),target:d.frame,constraint:'frame'},output,environment:{obstacles,margin:1,terminals:'given'},...(kind==='translation'?{motion:'translation' as const,stroke:Math.min(400,hi-lo)}:{})};
 const options:RouteOptions&{lockedParts?:string[]}={target,tolerance:d.tolerance,maxStages:d.maxStages??3,budget:o.budget??(o.catalog?15000:6000),seed:o.seed??1,rules,axialGap:1,...(o.catalog?.lockedParts.length?{lockedParts:o.catalog.lockedParts}:{})};
 return {request,options,info:{drive:d.id,kind,carrier:d.body,driven,outPerAxis,reference,lo,hi,frames,...(pinion?{pinion,rail:{local:c.local,motor:d.frame,size:driveSpec(d.spec).size}}:{})}};
}

// ---------- adopting a found train ----------
/** A path drive's pinion goes to an end of the found chain's last shaft (beside its outermost part); its rail lies at
 * that height across the path plane. The rail must lie on the wagon's side of the path plane (where its motor sits):
 * on the other side the wagon reaches round the track and the rail's holders cannot get to it (`wagonSide`). Of the
 * ends on that side the one where the rail keeps most room from the wagon's other wheels and motor body is taken
 * (`room`, mm); ties: the end away from the motor. */
export function pinionEnd(found:Mechanism,rail:{local:Frame;motor:Frame;size:V}){
 const shafts=found.bodies.filter(b=>/^s\d+$/.test(b.id)).map(b=>Number(b.id.slice(1))),lastId='s'+Math.max(...shafts),frameC=(id:string)=>found.bodies.find(b=>b.id===id)!.frame;
 const lastPart=found.elements.filter(e=>e.mounts[0].body===lastId||e.mounts[0].body===`${lastId}/rotor`).sort((a,b)=>a.mounts[0].pose.position[2]-b.mounts[0].pose.position[2]);
 const zs=[lastPart[0].mounts[0].pose.position[2]+lastPart[0].envelope.min-1-5,lastPart[lastPart.length-1].mounts[0].pose.position[2]+lastPart[lastPart.length-1].envelope.max+1+5];
 const pz=(p:V)=>compose(inverse(rail.local),{position:p,rotation:[0,0,0,1]}).position[2],normal=rotate(rail.local.rotation,[0,0,1]),items:[number,number][]=[];
 for(const e of found.elements){const k=e.mounts[0].body.replace(/\/rotor$/,'');if(k===lastId||!/^s\d+$/.test(k))continue;const f=compose(compose(frameC(k),e.mounts[0].pose),shift((e.envelope.min+e.envelope.max)/2)),c=pz(f.position),cos=Math.abs(dot(rotate(f.rotation,[0,0,1]),normal)),r=cos*(e.envelope.max-e.envelope.min)/2+Math.sqrt(Math.max(0,1-cos*cos))*e.envelope.radius;items.push([c-r,c+r]);}
 {const zsMotor=[0,1].flatMap(a=>[0,1].flatMap(b=>[0,1].map(c=>pz(compose(rail.motor,{position:[(a-.5)*rail.size[0],(b-.5)*rail.size[1],-c*rail.size[2]],rotation:[0,0,0,1]}).position))));items.push([Math.min(...zsMotor),Math.max(...zsMotor)]);}
 const room=(z:number)=>{const zr=pz(compose(frameC(lastId),shift(z)).position);return Math.min(...items.map(([a,b])=>Math.max(0,a-(zr+6),(zr-6)-b)));};
 const motorAlong=compose(inverse(frameC(lastId)),rail.motor).position[2],far=Math.abs(zs[0]-motorAlong)>=Math.abs(zs[1]-motorAlong)?0:1,r=[room(zs[0]),room(zs[1])];
 const motorZ=pz(compose(rail.motor,shift(-rail.size[2]/2)).position),side=(z:number)=>Math.sign(pz(compose(frameC(lastId),shift(z)).position))===Math.sign(motorZ)||Math.abs(motorZ)<1,ok=[side(zs[0]),side(zs[1])];
 const score=(k:number)=>(ok[k]?1000:0)+r[k],at=Math.abs(score(0)-score(1))>1?(score(0)>score(1)?0:1):far;
 return {z:zs[at],room:r[at],wagonSide:ok[at]};
}
// ---------- adopting a found train ----------
const shift=(z:number):Frame=>({position:[0,0,z],rotation:[0,0,0,1]});
function spurElement(id:string,body:string,pose:Frame,module:number,teeth:number,width:number):Element{
 const r=module*teeth/2;return {id,source:{kind:'printed'},surfaces:[{id:'teeth',pitch:{kind:'circle',r},profile:{kind:'involute',module,pressureAngle:20,backlash:.15},z:[-width/2,width/2],side:'external'}],interfaces:[{id:'bore',kind:'bore',diameter:5.1,z:[-width/2,width/2]}],envelope:{radius:r+module,min:-width/2,max:width/2},mounts:[{interface:'bore',body,pose}],phase:0};
}
/** Joint rates of a found chain relative to its output, from a short solve. */
async function chainRates(found:Mechanism,last:number){
 const out=`ground/s${last}`,probe:Mechanism={...structuredClone(found),input:{kind:'coordinate',joint:'ground/s0',coordinate:0},output:{kind:'coordinate',joint:out,coordinate:0},range:{from:0,to:60,samples:3}};
 const s=await solve(probe,{yield:false});if(s.checks.some(c=>c.id==='closure'&&c.state==='fail'))throw Error('Gefundenes Getriebe schließt beim Drehen nicht.');
 const q0=s.poses[0].coordinates,q1=s.poses[s.poses.length-1].coordinates,dOut=q1[out][0]-q0[out][0];if(Math.abs(dOut)<1e-9)throw Error('Ausgang des Getriebes bewegt sich nicht.');
 const rates:Record<string,number>={};for(const jr of probe.joints)if(jr.joint.kind==='revolute'||jr.joint.kind==='screw')rates[jr.id]=(q1[jr.id][0]-q0[jr.id][0])/dOut;
 return rates;
}
/** Merges a found chain (in carrier coordinates, as the route search returns it) into the mechanism. */
/** `fixed`: the other axes and trains as held for the reference pose. */
export async function adoptGear(m:Mechanism,d:Drive,found:Mechanism,info:TaskInfo,label:string,ratio:number,fixed:Record<string,number[]>={}):Promise<DriveGear>{
 removeGear(m,d);
 const spec=driveSpec(d.spec),j=axisJoint(m,d.axis),WC=info.frames[info.carrier],FO=compose(inverse(WC),info.frames[info.driven]);
 const last=Math.max(...found.bodies.filter(b=>/^s\d+$/.test(b.id)).map(b=>Number(b.id.slice(1)))),lastId='s'+last,keepLast=info.kind==='path';
 const rel=await chainRates(found,last);
 const frameC=(id:string)=>found.bodies.find(b=>b.id===id)!.frame;
 const name=(id:string)=>id==='ground'?info.carrier:id===lastId&&!keepLast?info.driven:`${d.id}/${id}`;
 const remap=(body:string,local:Frame)=>body===lastId&&!keepLast?compose(inverse(FO),compose(frameC(lastId),local)):local;
 const notes:string[]=[];
 for(const b of found.bodies){if(b.ground||b.id===lastId&&!keepLast)continue;m.bodies.push({...structuredClone(b),id:name(b.id),frame:compose(WC,b.frame)} as Body);}
 for(const jr of found.joints){if(jr.id===`ground/${lastId}`&&!keepLast)continue;m.joints.push({...structuredClone(jr),id:`${d.id}/${jr.id}`,a:{body:name(jr.a.body),local:remap(jr.a.body,jr.a.local)},b:{body:name(jr.b.body),local:remap(jr.b.body,jr.b.local)}});}
 const added:Element[]=[];
 for(const e of found.elements){const x:Element={...structuredClone(e),id:`${d.id}/${e.id}`,mounts:e.mounts.map(mt=>({...mt,body:name(mt.body),pose:remap(mt.body,mt.pose)}))};
  // The motor shaft decides the bore of what sits on it.
  if(e.mounts[0].body==='s0')for(const i of x.interfaces)if(i.kind==='bore')i.diameter=spec.shaft.diameter+.1;
  added.push(x);}
 const contacts=found.contacts.map(c=>({...structuredClone(c),id:`${d.id}/${c.id}`,a:{...c.a,element:`${d.id}/${c.a.element}`},b:{...c.b,element:`${d.id}/${c.b.element}`}}));
 // Travel of the driven link relative to the reference, in output units.
 const travel=[info.lo,info.hi].map(q=>(q-info.reference)*info.outPerAxis),dMin=Math.min(...travel),dMax=Math.max(...travel);
 const worldC=(e:Element)=>{const mt=e.mounts[0],body=mt.body===info.carrier?identity():mt.body===info.driven?FO:compose(inverse(WC),m.bodies.find(b=>b.id===mt.body)!.frame);return compose(body,mt.pose);};
 // Spindle drive: the nut sits where the axis was drawn on the driven link, not where the search left it.
 let nutShift=0;
 const screw=m.joints.find(x=>x.id.startsWith(d.id+'/')&&x.joint.kind==='screw'&&x.b.body===info.driven),nut=added.find(e=>e.mounts[0].body===info.driven&&!e.surfaces.length);
 if(screw&&nut){const t=rotate(frameC(lastId).rotation,[0,0,1]),aim=compose(FO,(j.a.body===info.carrier?j.b:j.a).local).position;nutShift=dot(add(aim,scale(worldC(nut).position,-1)),t);
  const move=(pose:Frame)=>compose(inverse(FO),compose({position:scale(t,nutShift),rotation:[0,0,0,1]},compose(FO,pose)));nut.mounts[0].pose=move(nut.mounts[0].pose);screw.b.local=move(screw.b.local);}
 for(const e of added){
  const s=e.surfaces[0];if(!s)continue;
  // Straight rack on the driven link: long enough for the whole stroke.
  if(s.pitch.kind==='line'&&e.mounts[0].body===info.driven){const rack=worldC(e),c=contacts.find(k=>k.b.element===e.id),pinion=added.find(x=>x.id===c?.a.element);if(!pinion)continue;
   const p=compose(inverse(rack),worldC(pinion)).position,along=dot(rotate(rack.rotation,[1,0,0]),rotate(frameC(lastId).rotation,[0,0,1])),r=pinion.envelope.radius;
   const xs=[dMin,dMax].map(t=>p[0]-t*along),x0=Math.min(...xs)-r-10,x1=Math.max(...xs)+r+10;
   e.mounts[0].pose=compose(e.mounts[0].pose,{position:[x0,0,0],rotation:[0,0,0,1]});s.pitch={kind:'line',length:x1-x0};}
  // Spindle: covers the nut travel.
  if(s.profile.kind==='helical'&&e.source.kind==='library'&&j.joint.kind==='prismatic'){const along=dot(rotate(worldC(e).rotation,[0,0,1]),rotate(frameC(lastId).rotation,[0,0,1]))>0?1:-1,zs=[dMin,dMax].map(t=>30+(nutShift+t)*along),z0=Math.min(...zs)-15,z1=Math.max(...zs)+15,lo=Math.min(0,z0);
   s.z=[lo,z1];e.envelope={...e.envelope,min:lo,max:z1};for(const i of e.interfaces)if(i.kind==='bore')i.z=[lo,z1];if(lo<0)notes.push(`Spindel ragt ${(-lo).toFixed(0)} mm hinter ihren Antrieb: Motor weiter vom Weg weg setzen.`);}
 }
 if(keepLast){
  // Path: a pinion beside the last part rolls on a rail along the path.
  const pin=info.pinion!;
  // Height above the path plane (z of the path frame = plane normal of a planar path).
  const pathFrame=(z:number)=>compose(inverse(j.b.local),compose(frameC(lastId),shift(z))).position[2];
  const {z}=pinionEnd(found,{local:j.b.local,motor:d.frame,size:driveSpec(d.spec).size}),ritzel=spurElement(`${d.id}/ritzel`,`${d.id}/${lastId}`,shift(z),pin.module,pin.teeth,10);
  // Rail on the path's a-side in its frame; z along the path plane normal at the pinion's height.
  const zr=pathFrame(z);
  if(j.joint.kind!=='path')throw Error('Pfad erwartet.');
  added.push(ritzel,{id:`${d.id}/schiene`,source:{kind:'printed'},surfaces:[{id:'teeth',pitch:structuredClone(j.joint.curve),profile:{kind:'involute',module:pin.module,pressureAngle:20,backlash:.15},z:[zr-6,zr+6],side:'external'}],interfaces:[{id:'flange',kind:'flange',frame:identity()}],envelope:{radius:0,min:zr-6,max:zr+6},mounts:[{interface:'flange',body:j.a.body,pose:j.a.local}],phase:0});
  contacts.push({id:`${d.id}/eingriff`,kind:'roll',mode:'follower',a:{element:`${d.id}/ritzel`,surface:'teeth'},b:{element:`${d.id}/schiene`,surface:'teeth'},params:{offsetA:0,offsetB:0,side:1}});
 }
 m.elements.push(...added);m.contacts.push(...contacts);
 // Motor shaft length: the first part should sit on it.
 const first=Math.max(...added.filter(e=>e.mounts[0].body===`${d.id}/s0`&&e.source.kind==='printed').map(e=>e.mounts[0].pose.position[2]+e.envelope.max));
 if(first>spec.shaft.length+.5)notes.push(`Das erste Rad reicht ${first.toFixed(0)} mm vor den Flansch, die Motorwelle ist ${spec.shaft.length} mm: Kupplung oder längere Welle vorsehen.`);
 // On a path the pinion's turn per millimetre comes from the rolling contact itself: measure it.
 let outPerAxis=info.outPerAxis;
 if(keepLast){const step=info.reference+5<=info.hi?5:-5,out=`${d.id}/ground/${lastId}`,run=await solve({...structuredClone(m),input:{kind:'coordinate',joint:d.axis,coordinate:0},output:{kind:'coordinate',joint:out,coordinate:0},range:{from:info.reference,to:info.reference+step,samples:2}},{yield:false,fixed});
  if(run.checks.some(c=>c.id==='closure'&&c.state==='fail'))throw Error('Ritzel rollt nicht auf der Schiene ab.');outPerAxis=(run.poses[1].coordinates[out][0]-run.poses[0].coordinates[out][0])/step;}
 const rates:Record<string,number>={};for(const [id,r] of Object.entries(rel)){if(id===`ground/${lastId}`&&!keepLast)continue;rates[`${d.id}/${id}`]=r*outPerAxis;}
 // Reference values of the train: solve the reference pose with the axis held and the train free.
 const at=await solve({...structuredClone(m),input:{kind:'none'},output:{kind:'none'},range:{from:0,to:0,samples:1}},{yield:false,fixed:{...fixed,[d.axis]:[info.reference]}});
 if(at.checks.some(c=>c.id==='closure'&&c.state==='fail'))throw Error('Getriebe passt in der Bezugsstellung nicht ins Modell.');
 const offsets=Object.fromEntries(Object.keys(rates).map(id=>[id,at.poses[0].coordinates[id]?.[0]??0]));
 const gear:DriveGear={reference:info.reference,rates,offsets,label,ratio,notes};d.gear=gear;return gear;
}

// ---------- collisions over the axis range ----------
const hull=(frame:Frame,center:V,half:V):Hull=>({center:compose(frame,{position:center,rotation:[0,0,0,1]}).position,axes:[[1,0,0],[0,1,0],[0,0,1]].map(v=>rotate(frame.rotation,v as V)),half});
export type Collision={a:string;b:string;at:number[]};
/** Drive parts and motors against link parts at sampled values of the driven axis. `pose` solves the mechanism. */
export async function sweepCollisions(m:Mechanism,drives:Drive[],d:Drive,assets:Assets,pose:(axis:string,value:number)=>Promise<Record<string,Frame>>,samples=13){
 const j=axisJoint(m,d.axis),lo=j.limits?.min??(linearAxis(j)?0:-180),hi=j.limits?.max??(linearAxis(j)?200:180),found=new Map<string,Collision>();
 const driven=(j.a.body===d.body?j.b:j.a).body,mine=m.elements.filter(e=>e.id.startsWith(d.id+'/')&&(e.surfaces[0]?.pitch.kind??'circle')==='circle');
 for(let k=0;k<samples;k++){const q=lo+(hi-lo)*k/(samples-1),frames=await pose(d.axis,q);
  const parts=linkBoxes(m,assets,frames,identity(),true).map(b=>({...b,hull:hull(b.frame,[0,0,0],scale(b.size,.5))}));
  // A round part is the intersection of two squares turned by 45° (an octagon), whatever its own turn.
  const items:{id:string;body:string;hulls:Hull[]}[]=mine.map(e=>{const f=compose(frames[e.mounts[0].body],e.mounts[0].pose),c:V=[0,0,(e.envelope.min+e.envelope.max)/2],h:V=[e.envelope.radius,e.envelope.radius,(e.envelope.max-e.envelope.min)/2];return {id:e.id,body:e.mounts[0].body,hulls:[hull(f,c,h),hull(compose(f,{position:[0,0,0],rotation:axisAngle([0,0,1],45)}),c,h)]};});
  const mb=motorBox(m,d,frames,identity());if(mb)items.push({id:d.id,body:d.body,hulls:[hull(mb.frame,[0,0,0],scale(mb.size,.5))]});
  for(const it of items)for(const p of parts){if(p.body===it.body||it.body===driven&&p.body===driven)continue;if(it.hulls.every(h=>separation(h,p.hull)<-.5)){const key=it.id+'|'+p.body;const c=found.get(key)??{a:it.id,b:p.body,at:[]};const at=Math.round(q*10)/10;if(!c.at.includes(at))c.at.push(at);found.set(key,c);}}
 }
 return [...found.values()];
}
export {axisAngle};
