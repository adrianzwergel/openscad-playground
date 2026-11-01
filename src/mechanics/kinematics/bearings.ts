// Bearing placement (LAGER-UND-STRUKTUR.md, Teil A): every shaft line of a
// target mechanism with its drives gets seats from a catalogue, on its axis,
// clear of wheels and of each other, with room to push the bearing in. Seats,
// motor flanges, nut flanges and shaft clamps are the anchors of the
// generated structure (Teil B). The imported model only tells where each
// link wants to be; it is not part of the result.
import type {V,Frame} from './math.ts';
import {compose,inverse,rotate,add,scale,norm,dot,cross,identity} from './math.ts';
import type {Mechanism,Element,JointRelation} from './model.ts';
import type {Drive,Assets} from './drive.ts';
import {owned,driveSpec,modelAxes,toward} from './drive.ts';
import type {Feature} from '../../structure/features.ts';
import {featureSize} from '../../structure/features.ts';

export type BearingSpec={id:string;label:string;kind:'ball'|'plain'|'linear';d:number;D:number;B:number;C0:number;price:number};
export const bearingCatalog:BearingSpec[]=[
 {id:'MR85',label:'Rillenkugellager MR85 (5×8×2,5)',kind:'ball',d:5,D:8,B:2.5,C0:180,price:1},
 {id:'685',label:'Rillenkugellager 685 (5×11×5)',kind:'ball',d:5,D:11,B:5,C0:450,price:1},
 {id:'625',label:'Rillenkugellager 625 (5×16×5)',kind:'ball',d:5,D:16,B:5,C0:670,price:1},
 {id:'626',label:'Rillenkugellager 626 (6×19×6)',kind:'ball',d:6,D:19,B:6,C0:1050,price:1.2},
 {id:'688',label:'Rillenkugellager 688 (8×16×5)',kind:'ball',d:8,D:16,B:5,C0:590,price:1.2},
 {id:'608',label:'Rillenkugellager 608 (8×22×7)',kind:'ball',d:8,D:22,B:7,C0:1370,price:1},
 {id:'6000',label:'Rillenkugellager 6000 (10×26×8)',kind:'ball',d:10,D:26,B:8,C0:2360,price:1.5},
 {id:'6001',label:'Rillenkugellager 6001 (12×28×8)',kind:'ball',d:12,D:28,B:8,C0:2800,price:1.6},
 {id:'LM8UU',label:'Linearkugellager LM8UU (8×15×24)',kind:'linear',d:8,D:15,B:24,C0:400,price:1.5},
 {id:'LM12UU',label:'Linearkugellager LM12UU (12×21×30)',kind:'linear',d:12,D:21,B:30,C0:800,price:2},
];
/** A printed plain bearing: bore with clearance, no purchased part. */
const plainSpec=(d:number):BearingSpec=>({id:`gleit-${d}`,label:`Gleitlager gedruckt Ø${d} mit Spiel`,kind:'plain',d,D:d,B:Math.max(8,1.5*d),C0:60,price:0});

export type BearingSettings={prefer:'ball'|'plain';gearGap:number;wall:number;fit:number;clearance:number;axisShaft:number;axles:'rotating'|'fixed';hubLength:number;rod:number;rodOffset:number;maxOverhang:number};
export const defaultBearingSettings:BearingSettings={prefer:'ball',gearGap:2,wall:2.5,fit:.15,clearance:.3,axisShaft:8,axles:'rotating',hubLength:18,rod:8,rodOffset:40,maxOverhang:40};

/** `link`: the link the seat is printed into; `frame` in that link's coordinates (pose 0), z along the axis. */
/** `keep`: space of the purchased part itself that the structure must leave free (a roller's outer ring). */
export type Seat={id:string;link:string;line:string;kind:'bearing'|'plain'|'hub'|'linear'|'rod'|'flange'|'nut'|'roller';part?:string;frame:Frame;feature:Feature;support?:boolean;keep?:{frame:Frame;r:number;z0:number;z1:number}};
export type ShaftLine={id:string;kind:'train'|'motor'|'axis'|'spindle'|'rod'|'roller';link:string;d:number;frame:Frame;z0:number;z1:number;seats:string[];state:'pass'|'fail';message:string};
export type BearingPlan={lines:ShaftLine[];seats:Seat[];bom:{part:string;label:string;count:number;length?:number}[];checks:{id:string;state:'pass'|'fail';message:string}[];edits:{element:string;bore:number}[]};

const shift=(f:Frame,z:number):Frame=>compose(f,{position:[0,0,z],rotation:[0,0,0,1]});
const bodyFrame=(m:Mechanism,id:string)=>m.bodies.find(b=>b.id===id)?.frame??identity();
/** Points of a link's model parts in world coordinates (pose 0), thinned to `limit`. */
export function modelPoints(m:Mechanism,assets:Assets|undefined,link:string,limit=3000):V[]{
 const b=m.bodies.find(x=>x.id===link);if(!b||b.display?.kind!=='mesh'||!assets)return [];const asset=assets(b.display.asset);if(!asset)return [];
 const out:V[]=[];for(const id of b.display.parts){const p=asset.parts.find(x=>x.id===id)?.positions;if(!p)continue;for(let i=0;i<p.length;i+=3)out.push([p[i],p[i+1],p[i+2]]);}
 // Long parts have few, large triangles: add midpoints so the sampling sees their faces.
 const step=Math.max(1,Math.ceil(out.length/limit));return out.filter((_,i)=>i%step===0);
}
function pick(d:number,s:BearingSettings,maxD=Infinity):BearingSpec[]{
 const balls=bearingCatalog.filter(x=>x.kind==='ball'&&x.d===d&&x.D<=maxD).sort((a,b)=>b.C0-a.C0);
 return s.prefer==='plain'?[plainSpec(d),...balls]:[...balls,plainSpec(d)];
}
const bearingFeature=(b:BearingSpec,s:BearingSettings,open:1|-1):Feature=>b.kind==='plain'?{kind:'plain',d:b.d,length:b.B,clearance:s.clearance,wall:s.wall+1}:{kind:'bearing',d:b.d,D:b.D,B:b.B,fit:s.fit,wall:s.wall,open};

export function planBearings(m:Mechanism,drives:Drive[],assets?:Assets,settings:Partial<BearingSettings>={}):BearingPlan{
 const s={...defaultBearingSettings,...settings},lines:ShaftLine[]=[],seats:Seat[]=[],checks:BearingPlan['checks']=[],edits:BearingPlan['edits']=[];
 const links=m.bodies.filter(b=>!owned(drives,b.id)).map(b=>b.id),world=(link:string,f:Frame)=>compose(bodyFrame(m,link),f),local=(link:string,f:Frame)=>compose(inverse(bodyFrame(m,link)),f);
 const carrierOf=(body:string):string=>{if(links.includes(body))return body;const j=m.joints.find(x=>x.b.body===body);return j?carrierOf(j.a.body):body;};
 const elementWorld=(e:Element)=>compose(bodyFrameDeep(e.mounts[0].body),e.mounts[0].pose);
 function bodyFrameDeep(id:string):Frame{if(links.includes(id))return bodyFrame(m,id);const j=m.joints.find(x=>x.b.body===id);if(!j)return bodyFrame(m,id);return compose(compose(bodyFrameDeep(j.a.body),j.a.local),inverse(j.b.local));}
 // Wheels as world cylinders (radius, axial extent) for seat collision tests.
 const wheels=m.elements.filter(e=>e.surfaces[0]?.pitch.kind==='circle'||!e.surfaces.length).map(e=>({e,f:elementWorld(e)}));
 const placed:{f:Frame;r:number;z0:number;z1:number;line:string}[]=[];
 const motorBoxes=drives.map(d=>{const spec=driveSpec(d.spec);return {f:compose(world(d.body,d.frame),{position:[0,0,-spec.size[2]/2],rotation:[0,0,0,1]}),half:scale(spec.size,.5) as V,id:d.id};});
 /** Does a seat cylinder (world frame f, radius r, z0..z1) hit a wheel, a motor or another seat? */
 const hits=(f:Frame,r:number,z0:number,z1:number,line:string,ignore:(e:Element)=>boolean)=>{
  const axis=rotate(f.rotation,[0,0,1]),samples:V[]=[];for(const z of [z0,(z0+z1)/2,z1])for(let k=0;k<12;k++){const a=k*Math.PI/6;samples.push(compose(f,{position:[r*Math.cos(a),r*Math.sin(a),z],rotation:[0,0,0,1]}).position);}samples.push(compose(f,{position:[0,0,z0],rotation:[0,0,0,1]}).position,compose(f,{position:[0,0,z1],rotation:[0,0,0,1]}).position);
  const inCyl=(p:V,c:Frame,rc:number,a:number,b:number)=>{const q=compose(inverse(c),{position:p,rotation:[0,0,0,1]}).position;return Math.hypot(q[0],q[1])<rc&&q[2]>a&&q[2]<b;};
  for(const w of wheels){if(ignore(w.e))continue;const g=s.gearGap;if(samples.some(p=>inCyl(p,w.f,w.e.envelope.radius+g,w.e.envelope.min-g,w.e.envelope.max+g)))return `Rad ${w.e.id}`;
   // and the wheel rim inside the seat
   const rim:V[]=[];for(let k=0;k<12;k++){const a=k*Math.PI/6;for(const z of [w.e.envelope.min,w.e.envelope.max])rim.push(compose(w.f,{position:[w.e.envelope.radius*Math.cos(a),w.e.envelope.radius*Math.sin(a),z],rotation:[0,0,0,1]}).position);}
   if(rim.some(p=>inCyl(p,f,r+g,z0-g,z1+g)))return `Rad ${w.e.id}`;}
  for(const mb of motorBoxes)if(samples.some(p=>{const q=compose(inverse(mb.f),{position:p,rotation:[0,0,0,1]}).position;return q.every((x,i)=>Math.abs(x)<mb.half[i]+1);}))return `Motor ${mb.id}`;
  for(const o of placed){if(o.line===line)continue;if(samples.some(p=>inCyl(p,o.f,o.r+1,o.z0-1,o.z1+1)))return 'anderes Lager';}
  void axis;return undefined;
 };
 /** Can a strut reach the seat? A free corridor (radius 5, 35 mm) axially outwards or radially in one of eight directions. */
 const reachable=(f:Frame,r:number,z0:number,z1:number,open:1|-1,line:string,ignore:(e:Element)=>boolean)=>{
  const corridors:{a:V;b:V}[]=[];const at=(x:number,y:number,z:number)=>compose(f,{position:[x,y,z],rotation:[0,0,0,1]}).position;
  corridors.push({a:at(0,0,open>0?z0:z1),b:at(0,0,open>0?z0-35:z1+35)});
  for(let k=0;k<8;k++){const a=k*Math.PI/4,c=Math.cos(a),sn=Math.sin(a),zm=(z0+z1)/2;corridors.push({a:at(c*(r+1),sn*(r+1),zm),b:at(c*(r+36),sn*(r+36),zm)});}
  const blocked=(p:V)=>{for(const w of wheels){if(ignore(w.e))continue;const q=compose(inverse(w.f),{position:p,rotation:[0,0,0,1]}).position;if(Math.hypot(q[0],q[1])<w.e.envelope.radius+s.gearGap+5&&q[2]>w.e.envelope.min-5&&q[2]<w.e.envelope.max+5)return true;}
   for(const mb of motorBoxes){const q=compose(inverse(mb.f),{position:p,rotation:[0,0,0,1]}).position;if(q.every((x,i)=>Math.abs(x)<mb.half[i]+5))return true;}
   for(const o of placed){if(o.line===line)continue;const q=compose(inverse(o.f),{position:p,rotation:[0,0,0,1]}).position;if(Math.hypot(q[0],q[1])<o.r+5&&q[2]>o.z0-5&&q[2]<o.z1+5)return true;}return false;};
  return corridors.some(({a,b})=>{for(let t=0;t<=1;t+=1/12)if(blocked(add(a,scale(add(b,scale(a,-1)),t))))return false;return true;});
 };
 /** Two seats on a line: on both sides of the occupied span if possible, else both on the freer side. */
 const seatLine=(line:ShaftLine,f:Frame,occupied:[number,number][],candidates:BearingSpec[],ignore:(e:Element)=>boolean,sides:{lo:boolean;hi:boolean}={lo:true,hi:true},spanLimit=s.maxOverhang*3)=>{
  const lo=Math.min(...occupied.map(x=>x[0])),hi=Math.max(...occupied.map(x=>x[1])),fails:string[]=[];
  // First only seats a strut can reach; if none, any free seat.
  for(const strict of [true,false])for(const b of candidates){
   const feat=(open:1|-1)=>bearingFeature(b,s,open),size=featureSize(feat(1));
   const free=(z:number,open:1|-1)=>{const fs=featureSize(feat(open));if(occupied.some(([a,c])=>z+fs.z1>a-s.gearGap&&z+fs.z0<c+s.gearGap))return 'belegt';const h=hits(world(line.link,f),fs.radius,z+fs.z0,z+fs.z1,line.id,ignore);if(h)return h;if(strict&&!reachable(shift(world(line.link,f),z),fs.radius,fs.z0,fs.z1,open,line.id,ignore))return 'nicht erreichbar';return undefined;};
   const scan=(from:number,dir:1|-1,open:1|-1,limit:number)=>{for(let k=0;k<=limit;k+=1){const z=from+dir*k;const why=free(z,open);if(!why)return z;if(k===limit)fails.push(`${b.id}: ${why}`);}return undefined;};
   const gap=s.gearGap+size.radius*0;const below=sides.lo?scan(lo-gap-size.z1,-1,-1,30):undefined,above=sides.hi?scan(hi+gap-size.z0,1,1,30):undefined;
   let zs:{z:number;open:1|-1}[]|undefined;
   if(below!==undefined&&above!==undefined)zs=[{z:below,open:-1},{z:above,open:1}];
   else{const spacing=Math.max(1.5*b.d,b.B+8,15);
    // Overhung: both seats on the free side, the inner one as close to the wheels as possible.
    const one=below!==undefined?{z:below,dir:-1 as const}:above!==undefined?{z:above,dir:1 as const}:undefined;
    if(one){const second=scan(one.z+one.dir*spacing,one.dir,one.dir,30);if(second!==undefined)zs=[{z:one.z,open:one.dir},{z:second,open:one.dir}];}}
   if(!zs)continue;
   if(Math.max(...zs.map(x=>x.z))-Math.min(...zs.map(x=>x.z))>spanLimit+hi-lo){fails.push(`${b.id}: zu weit`);continue;}
   zs.forEach((x,k)=>{const fr=shift(f,x.z),fs=featureSize(feat(x.open)),seat:Seat={id:`${line.id}/lager${k+1}`,link:line.link,line:line.id,kind:b.kind==='plain'?'plain':'bearing',part:b.id,frame:fr,feature:feat(x.open)};seats.push(seat);line.seats.push(seat.id);placed.push({f:world(line.link,fr),r:fs.radius,z0:fs.z0,z1:fs.z1,line:line.id});});
   line.z0=Math.min(lo,...zs.map(x=>x.z-b.B/2-2));line.z1=Math.max(hi,...zs.map(x=>x.z+b.B/2+2));line.state='pass';line.message=`${b.label}${zs.length===2&&zs[0].open===zs[1].open?' · fliegend':' · beidseitig'}`;
   return true;}
  line.state='fail';line.message='Kein Lagerplatz frei: '+[...new Set(fails)].slice(0,3).join('; ');return false;
 };
 // ---------- gear train shafts ----------
 for(const b of m.bodies){
  if(!b.shaft||!owned(drives,b.id)||!b.id.includes('/'))continue;
  const j=m.joints.find(x=>x.b.body===b.id&&!owned(drives,x.a.body));if(!j)continue;
  const d=drives.find(x=>b.id.startsWith(x.id+'/'))!,carrier=carrierOf(j.a.body),f=local(carrier,world(j.a.body,j.a.local));
  const on=m.elements.filter(e=>e.mounts[0].body===b.id||e.mounts[0].body===`${b.id}/rotor`),occupied=on.map(e=>[e.mounts[0].pose.position[2]+e.envelope.min,e.mounts[0].pose.position[2]+e.envelope.max] as [number,number]);
  if(!occupied.length)continue;
  const motor=b.id===`${d.id}/s0`,spindle=on.some(e=>e.source.kind==='library'&&e.surfaces[0]?.profile.kind==='helical'),diameter=spindle?8:b.shaft.diameter;
  const line:ShaftLine={id:b.id,kind:spindle?'spindle':motor?'motor':'train',link:carrier,d:diameter,frame:f,z0:b.shaft.start,z1:b.shaft.end,seats:[],state:'pass',message:''};lines.push(line);
  const mine=(e:Element)=>on.includes(e);
  if(spindle){
   // Fixed bearing at the motor end, floating at the far end; the nut runs in between.
   const sp=on.find(e=>e.surfaces[0]?.profile.kind==='helical')!,z0=sp.mounts[0].pose.position[2]+sp.envelope.min,z1=sp.mounts[0].pose.position[2]+sp.envelope.max,bb=pick(8,{...s,prefer:'ball'}).filter(x=>x.kind==='ball');
   for(const spec of bb){const fe=bearingFeature(spec,s,1),fz=featureSize(fe),zs=[z0+Math.max(0,-fz.z0)+1,z1-fz.z1-1];
    if(zs.every((z,k)=>!hits(world(carrier,shift(f,z)),fz.radius,z+fz.z0,z+fz.z1,line.id,e=>mine(e)||e.mounts[0].body===carrier||!e.surfaces.length))){
     zs.forEach((z,k)=>{const seat:Seat={id:`${line.id}/lager${k+1}`,link:carrier,line:line.id,kind:'bearing',part:spec.id,frame:shift(f,z),feature:bearingFeature(spec,s,k?1:-1)};seats.push(seat);line.seats.push(seat.id);placed.push({f:world(carrier,seat.frame),r:fz.radius,z0:fz.z0,z1:fz.z1,line:line.id});});
     line.message=`${spec.label} · Fest- und Loslager, Mutterweg dazwischen`;line.z0=z0;line.z1=z1;break;}}
   if(!line.seats.length){line.state='fail';line.message='Spindellager kollidieren.';}
   continue;}
  if(motor){
   // The motor carries its shaft; a wheel beyond the shaft end needs a support bearing.
   const spec=driveSpec(d.spec),far=Math.max(...occupied.map(x=>x[1]));
   if(far<=spec.shaft.length+1){line.message='im Motor gelagert';continue;}
   seatLine(line,f,occupied,pick(5,s),mine,{lo:false,hi:true});line.message='Stützlager: '+line.message+` · Wellenverlängerung bis ${line.z1.toFixed(0)} mm`;continue;}
  const fixedAxle=s.axles==='fixed';
  if(fixedAxle){
   // Fixed axle clamped in the link; the wheels run on it.
   const lo=Math.min(...occupied.map(x=>x[0])),hi=Math.max(...occupied.map(x=>x[1])),fe:Feature={kind:'hub',d:diameter,length:10,wall:s.wall,setScrew:true},fz=featureSize(fe);
   [lo-s.gearGap-fz.z1,hi+s.gearGap-fz.z0].forEach((z,k)=>{const seat:Seat={id:`${line.id}/halter${k+1}`,link:carrier,line:line.id,kind:'hub',frame:shift(f,z),feature:fe};seats.push(seat);line.seats.push(seat.id);});
   line.message='feste Achse, Räder laufen darauf';continue;}
  seatLine(line,f,occupied,pick(diameter,s),mine);
 }
 // ---------- model axes ----------
 const axes=modelAxes(m,drives);
 for(const j of axes){
  const A=j.a.body,B=j.b.body;
  if(j.joint.kind==='revolute'){
   const f=j.a.local,fw=world(A,f),axis=rotate(fw.rotation,[0,0,1]),d=s.axisShaft;
   const along=(p:V)=>{const q=compose(inverse(fw),{position:p,rotation:[0,0,0,1]}).position;return {z:q[2],r:Math.hypot(q[0],q[1])};};
   // Where does each link have material around the axis? B's arms leave its hub there; A's seats belong where A is close.
   const ptsA=modelPoints(m,assets,A).map(along),ptsB=modelPoints(m,assets,B).map(along),hubR=d/2+s.wall+2;
   const bBand=ptsB.filter(p=>p.r>Math.max(hubR+2,15)&&p.r<hubR+45).map(p=>p.z),coax=m.elements.filter(e=>!owned(drives,e.mounts[0].body)&&e.mounts[0].body===B).map(e=>({e,f:elementWorld(e)})).filter(x=>norm(cross(rotate(x.f.rotation,[0,0,1]),axis))<1e-3&&along(x.f.position).r<.5);
   const occupied=coax.map(x=>{const z=along(x.f.position).z,sg=dot(rotate(x.f.rotation,[0,0,1]),axis)>0?1:-1;return [z+Math.min(sg*x.e.envelope.min,sg*x.e.envelope.max),z+Math.max(sg*x.e.envelope.min,sg*x.e.envelope.max)] as [number,number];});
   let bz0=-s.hubLength/2,bz1=s.hubLength/2;
   if(bBand.length){const sorted=[...bBand].sort((a,b)=>a-b),q=(t:number)=>sorted[Math.floor(t*(sorted.length-1))];bz0=q(.02);bz1=q(.98);}
   const line:ShaftLine={id:j.id,kind:'axis',link:A,d,frame:f,z0:bz0,z1:bz1,seats:[],state:'pass',message:''};lines.push(line);
   // A's material distance per side decides where its seats go.
   const near=(z:number)=>Math.min(Infinity,...ptsA.map(p=>Math.hypot(p.r,p.z-z)));
   const sides=ptsA.length?{lo:near(bz0-12)<60,hi:near(bz1+12)<60}:{lo:true,hi:true};if(!sides.lo&&!sides.hi){sides.lo=near(bz0-12)<=near(bz1+12);sides.hi=!sides.lo;}
   const ok=seatLine(line,f,[[bz0,bz1],...occupied],pick(d,s),e=>coax.some(x=>x.e===e),sides,400);
   // The shaft is clamped in B where B's arms are; wheels on B along the axis sit on the same shaft.
   const hubZ=sides.lo&&!sides.hi?bz0+s.hubLength/2:sides.hi&&!sides.lo?bz1-s.hubLength/2:(bz0+bz1)/2,hub:Feature={kind:'hub',d,length:s.hubLength,wall:s.wall,setScrew:true};
   const hubFrame=local(B,compose(fw,{position:[0,0,hubZ],rotation:[0,0,0,1]})),seat:Seat={id:`${j.id}/nabe`,link:B,line:line.id,kind:'hub',frame:hubFrame,feature:hub,support:true};seats.push(seat);line.seats.push(seat.id);
   for(const x of coax)edits.push({element:x.e.id,bore:d+.1});
   // The shaft runs from the outer seat through the hub to the last wheel on it.
   const ends=[...line.seats.map(id=>seats.find(x=>x.id===id)!).filter(x=>x.link===A).map(x=>compose(inverse(f),x.frame).position[2]),hubZ-s.hubLength/2,hubZ+s.hubLength/2,...occupied.flat()];
   line.z0=Math.min(...ends)-6;line.z1=Math.max(...ends)+3;
   if(ok)line.message+=` · Welle Ø${d} in ${B} geklemmt`;
  }
  else if(j.joint.kind==='prismatic'){
   const f=j.a.local,fw=world(A,f),t=rotate(fw.rotation,[0,0,1]),lo=j.limits?.min??0,hi=j.limits?.max??200;
   // Two round rods beside the travel line, in the plane facing the moving link.
   const pts=modelPoints(m,assets,B),centre=pts.length?scale(pts.reduce((a,p)=>add(a,p),[0,0,0] as V),1/pts.length):add(fw.position,rotate(fw.rotation,[1,0,0]));
   let v=add(centre,scale(fw.position,-1));v=add(v,scale(t,-dot(v,t)));if(norm(v)<1e-6)v=rotate(fw.rotation,[1,0,0]);v=scale(v,1/norm(v));const u=cross(t,v);
   const lin=bearingCatalog.find(x=>x.id==='LM8UU')!,pad=lin.B/2+8+lin.B/2;
   const nut=m.elements.find(e=>e.mounts[0].body===B&&e.source.kind==='library'&&!e.surfaces.length);
   for(const side of [-1,1]){
    const base=add(fw.position,scale(u,side*s.rodOffset)),id=`${j.id}/stange${side<0?'A':'B'}`,rf:Frame={position:base,rotation:fw.rotation};
    const line:ShaftLine={id,kind:'rod',link:A,d:s.rod,frame:local(A,rf),z0:lo-pad-12,z1:hi+pad+12,seats:[],state:'pass',message:`Rundstange Ø${s.rod}, ${lin.label}`};lines.push(line);
    for(const [k,z] of [[1,line.z0+6],[2,line.z1-6]] as [number,number][]){const seat:Seat={id:`${id}/halter${k}`,link:A,line:id,kind:'rod',frame:local(A,shift(rf,z)),feature:{kind:'rod',d:s.rod,length:12,wall:s.wall}};seats.push(seat);line.seats.push(seat.id);}
    for(const [k,z] of [[1,-(8+lin.B)/2],[2,(8+lin.B)/2]] as [number,number][]){const seat:Seat={id:`${id}/linear${k}`,link:B,line:id,kind:'linear',part:lin.id,frame:local(B,shift(rf,z)),feature:{kind:'linear',D:lin.D,B:lin.B,fit:.1,wall:s.wall},support:true};seats.push(seat);line.seats.push(seat.id);}
   }
   if(nut){const nf=elementWorld(nut),seat:Seat={id:`${j.id}/mutter`,link:B,line:j.id,kind:'nut',part:'TR8-Flanschmutter',frame:local(B,nf),feature:{kind:'nut',flange:22,body:10.2,circle:16,hole:3.5,thickness:5}};seats.push(seat);}
  }
  else if(j.joint.kind==='path'){
   // Wagon rollers above and below the rail; the rail is held from the outer side.
   const rail=m.elements.find(e=>e.mounts[0].body===A&&e.surfaces[0]?.pitch.kind==='path');
   const zr=rail?(rail.surfaces[0].z[0]+rail.surfaces[0].z[1])/2:0,zw=rail?rail.surfaces[0].z[1]-rail.surfaces[0].z[0]:12,module=rail?.surfaces[0].profile.kind==='involute'?rail.surfaces[0].profile.module:2,depth=1.25*module+3*module;
   const roller=bearingCatalog.find(x=>x.id==='625')!,inner=zr-zw/2+roller.B/2+.5;
   const line:ShaftLine={id:j.id,kind:'roller',link:B,d:5,frame:j.b.local,z0:inner-roller.B/2,z1:inner+roller.B/2,seats:[],state:'pass',message:`4 Laufrollen ${roller.label}, Schiene von außen gehalten`};lines.push(line);
   for(const [k,x,y] of [[1,-50,-depth-roller.D/2-.5],[2,50,-depth-roller.D/2-.5],[3,-50,module+roller.D/2+.5],[4,50,module+roller.D/2+.5]] as [number,number,number][]){
    // The roller runs on the rail; its axle is held beside it, on the wagon's side.
    const at=compose(j.b.local,{position:[x,y,inner],rotation:[0,0,0,1]}),hubLen=8;
    const seat:Seat={id:`${j.id}/rolle${k}`,link:B,line:j.id,kind:'roller',part:roller.id,frame:compose(at,{position:[0,0,-(roller.B/2+1+hubLen/2)],rotation:[0,0,0,1]}),feature:{kind:'hub',d:5,length:hubLen,wall:s.wall,setScrew:false},support:true,keep:{frame:at,r:roller.D/2+1,z0:-roller.B/2-.5,z1:roller.B/2+.5}};seats.push(seat);line.seats.push(seat.id);}
  }
 }
 // ---------- motor flanges ----------
 for(const d of drives){const spec=driveSpec(d.spec),carrier=carrierOf(d.body);if(spec.kind!=='motor'){seats.push({id:`${d.id}/bock`,link:carrier,line:d.id,kind:'flange',frame:local(carrier,world(d.body,d.frame)),feature:{kind:'flange',size:spec.size[0],pilot:spec.shaft.diameter+8,spacing:spec.size[0]-12,hole:4.5,thickness:5}});continue;}
  const pilot=spec.size[0]>50?38.1:spec.size[0]>40?22:22,spacing=spec.size[0]>50?47.1:spec.size[0]>40?31:26;
  seats.push({id:`${d.id}/flansch`,link:carrier,line:d.id,kind:'flange',part:d.spec,frame:local(carrier,world(d.body,d.frame)),feature:{kind:'flange',size:spec.size[0]+12,pilot,spacing,hole:3.4,thickness:5}});}
 for(const e of edits){const x=m.elements.find(y=>y.id===e.element);void x;}
 // ---------- checks and parts list ----------
 for(const l of lines)checks.push({id:`lager/${l.id}`,state:l.state,message:`${l.id}: ${l.message}`});
 const count=new Map<string,{label:string;count:number;length?:number}>();
 for(const x of seats){if(!x.part)continue;const b=bearingCatalog.find(y=>y.id===x.part),motor=driveCatalogLabel(x.part),label=b?.label??motor??x.part;const c=count.get(x.part)??{label,count:0};c.count++;count.set(x.part,c);}
 for(const l of lines)if(l.kind==='axis'||l.kind==='train'||l.kind==='rod'){const key=`Welle Ø${l.d}`,len=Math.ceil((l.z1-l.z0)/5)*5,c=count.get(key+len)??{label:`Silberstahlwelle Ø${l.d} × ${len} mm`,count:0,length:len};c.count++;count.set(key+len,c);}
 const bom=[...count.entries()].map(([part,v])=>({part,...v}));
 return {lines,seats,bom,checks,edits};
}
/** Writes shaft extents and wheel bores from a plan into the mechanism (display and generation follow). */
export function applyBearings(m:Mechanism,plan:BearingPlan){
 for(const e of plan.edits){const x=m.elements.find(y=>y.id===e.element);if(x)for(const i of x.interfaces)if(i.kind==='bore')i.diameter=e.bore;}
 for(const l of plan.lines){const b=m.bodies.find(x=>x.id===l.id);if(b?.shaft)b.shaft={...b.shaft,start:Math.min(b.shaft.start,l.z0),end:Math.max(b.shaft.end,l.z1)};}
}
const driveCatalogLabel=(id:string)=>{try{return driveSpec(id).label;}catch{return undefined;}};
export {toward,dot as dotV,cross as crossV};
export type {JointRelation};
