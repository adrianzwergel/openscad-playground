// Linkages from hardpoints, as suspensions are designed: what one chooses are the joint points, the members follow from
// them. A link has points; each point joins it to another body (the world '', another link, a part, a plate, a shaft)
// with a ball joint (`kugel`) or about an axis through two points (`dreh`). Three kinds of link:
// - `lenker`: printed, rigid; its shape is generated from all points on it (its own and those of others that end on it),
// - `stab`: bought, a turnbuckle with two ball cups: only the distance of its two ends is fixed,
// - `feder`: a bought damper between two points: it holds nothing, its length is what one reads off.
// Points are in the room at the design pose (all inputs 0); there a link's frame is the identity, so a point's
// coordinates are its place on the link. Closed loops are solved here, at every pose, by Levenberg–Marquardt over the
// six coordinates of every rigid link. Room: z up; a car's x forward, y to its left.
import type {Frame,V,Q} from '../kinematics/math.ts';
import {add,scale,norm,cross,dot,rotate,multiply,inverseQ,compose,inverse,unit} from '../kinematics/math.ts';
import {solveLinear} from '../kinematics/solver.ts';
import type {Prim} from '../../structure/sdf.ts';

export type JointKind='kugel'|'dreh';
/** `to`: the second point of a turning axis (both are where its lugs sit). `part`: the ball joint, by id. */
export type Point={id:string;at:V;kind:JointKind;to?:V;body:string;part?:string};
export type LinkKind='lenker'|'stab'|'feder';
/** `d`: tube Ø of a printed link. `part`: the damper of a `feder`. `wheel`: hub face (`at`) and wheel centre (`to`) on a
 * link that carries a wheel. `input`: a slider turns the link about its axis point `point`, in degrees. */
export type Link={id:string;label:string;kind:LinkKind;points:Point[];d?:number;part?:string;wheel?:{at:V;to:V;part:string};input?:{point:string;min:number;max:number}};
/** `floor`: where the brackets on the world stand (z); without, a little below the lowest of them. */
export type Linkage={links:Link[];floor?:number};

// ---------- bought parts, 1:10 ----------
/** An oil damper: eye to eye extended (`length`) and its stroke; body and spring Ø for the view. */
export type Damper={id:string;label:string;length:number;stroke:number;body:number;spring:number;note:string};
export type BallJoint={id:string;label:string;ball:number;/** ball centre to the face of the part it screws into */offset:number;/** ball centre to the end of the cup's thread */reach:number;note:string};
export type WheelPart={id:string;label:string;d:number;width:number;note:string};
const typical='Typische Maße, von Hand eingetragen: bitte am eigenen Teil nachmessen.';
export const dampers:Damper[]=[
 {id:'daempfer-55',label:'Öldämpfer 1:10 · 55 mm',length:55,stroke:10,body:11,spring:16,note:typical},
 {id:'daempfer-65',label:'Öldämpfer 1:10 · 65 mm',length:65,stroke:14,body:12,spring:17,note:typical},
 {id:'daempfer-75',label:'Öldämpfer 1:10 · 75 mm',length:75,stroke:18,body:12,spring:17,note:typical},
];
export const ballJoints:BallJoint[]=[
 {id:'kugel-5.8',label:'Kugelkopf 5,8 mm · M3',ball:5.8,offset:4,reach:10,note:'Kugelbolzen M3 mit 5,8-mm-Kugel und Kugelpfanne, der verbreitete 1:10-Standard. '+typical},
 {id:'kugel-6.8',label:'Kugelkopf 6,8 mm · M3',ball:6.8,offset:4.5,reach:11,note:'Größere Kugel für Querlenker und Dämpfer. '+typical},
];
export const wheelParts:WheelPart[]=[
 {id:'rad-56',label:'Rad 1:10 Formel vorn · Ø 56 × 26',d:56,width:26,note:typical},
 {id:'rad-64',label:'Rad 1:10 Formel hinten · Ø 64 × 36',d:64,width:36,note:typical},
];
export const damperOf=(id?:string)=>dampers.find(d=>d.id===id)??dampers[1];
export const ballOf=(id?:string)=>ballJoints.find(b=>b.id===id)??ballJoints[0];
export const wheelOf=(id?:string)=>wheelParts.find(w=>w.id===id)??wheelParts[0];

export const linkBody=(id:string)=>`lenker:${id}`;
export const linkOfBody=(key:string)=>key.startsWith('lenker:')?key.slice(7):undefined;
export const newLinkage=():Linkage=>({links:[]});
const sub=(a:V,b:V):V=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const dist=(a:V,b:V)=>norm(sub(a,b));
/** A stab with two ball ends is only a distance; anything else rigid is a body with six coordinates. */
export const isDistance=(l:Link)=>l.kind==='stab'&&l.points.length===2&&l.points.every(p=>p.kind==='kugel');
export const isBody=(l:Link)=>l.kind!=='feder'&&!isDistance(l);
/** Points of other links that end on this one. */
export const pointsOn=(g:Linkage,id:string)=>g.links.flatMap(l=>l.points.filter(p=>p.body===linkBody(id)).map(p=>({link:l,point:p})));

// ---------- solving ----------
/** Poses of the rigid links as six numbers: shift and rotation vector (radians), applied to the design coordinates. */
const quat=(r:number[]):Q=>{const a=Math.hypot(r[0],r[1],r[2]);if(a<1e-12)return [r[0]/2,r[1]/2,r[2]/2,1];const s=Math.sin(a/2)/a;return [r[0]*s,r[1]*s,r[2]*s,Math.cos(a/2)];};
const poseOf=(x:number[]):Frame=>({position:[x[0],x[1],x[2]],rotation:quat(x.slice(3,6))});
/** What the world around the linkage does: frames of the bodies now and at the design pose (the inputs at 0). */
export type Around={now:Record<string,Frame>;rest:Record<string,Frame>};
export type LinkPose={/** Frames of the rigid links (keys `lenker:id`). */bodies:Record<string,Frame>;/** Coordinates by link, for the next warm start. */x:Record<string,number[]>;error:number;
 /** Where a design point of a body is now. */at:(body:string,p:V)=>V};
/** Free movements left once the inputs are held: 0 is a mechanism that is determined, more is something that wobbles. */
export function freedomOf(g:Linkage){const bodies=g.links.filter(isBody).length;let c=0;
 for(const l of g.links){if(l.kind==='feder')continue;if(isDistance(l)){c+=1;continue;}for(const p of l.points)c+=p.kind==='kugel'?3:5;if(l.input)c+=1;}
 return 6*bodies-c;}
/** The relative turn of `l` against the body of its axis point, about that axis (degrees). */
function turnOf(l:Link,p:Point,own:Frame,other:Frame){const u=unit(sub(p.to!,p.at)),q=multiply(inverseQ(other.rotation),own.rotation);return 2*Math.atan2(dot([q[0],q[1],q[2]],u),q[3])*180/Math.PI;}
/** Solves the linkage for these inputs (degrees, by link id), starting from `start`. */
export function solveLinkage(g:Linkage,around:Around,inputs:Record<string,number>,start:Record<string,number[]>={}):LinkPose{
 const bodies=g.links.filter(isBody),index=new Map(bodies.map((l,i)=>[linkBody(l.id),i])),n=bodies.length*6;
 const outer=(key:string)=>{const now=around.now[key],rest=around.rest[key];return now&&rest?compose(now,inverse(rest)):now??undefined;};
 const frameIn=(x:number[],key:string):Frame|undefined=>{const i=index.get(key);if(i!==undefined)return poseOf(x.slice(6*i,6*i+6));return key?outer(key):undefined;};
 const worldIn=(x:number[],key:string,p:V):V=>{const f=frameIn(x,key);return f?add(f.position,rotate(f.rotation,p)):p;};
 const x0=bodies.flatMap(l=>start[l.id]?.length===6?start[l.id]:[0,0,0,0,0,0]);
 const residuals=(x:number[])=>{const out:number[]=[];
  for(const l of g.links){if(l.kind==='feder')continue;const me=linkBody(l.id);
   if(isDistance(l)){const [a,b]=l.points;out.push(dist(worldIn(x,a.body,a.at),worldIn(x,b.body,b.at))-dist(a.at,b.at));continue;}
   for(const p of l.points){out.push(...sub(worldIn(x,me,p.at),worldIn(x,p.body,p.at)));if(p.kind==='dreh'&&p.to)out.push(...sub(worldIn(x,me,p.to),worldIn(x,p.body,p.to)));}
   if(l.input){const p=l.points.find(q=>q.id===l.input!.point);if(p?.kind==='dreh'&&p.to){const own=frameIn(x,me)!,other=frameIn(x,p.body)??{position:[0,0,0] as V,rotation:[0,0,0,1] as Q};out.push(turnOf(l,p,own,other)-(inputs[l.id]??0));}}}
  // A light pull to the start keeps what is free (a stab turning about itself, a link nothing holds) where it was.
  for(let i=0;i<n;i++)out.push(1e-6*(x[i]-x0[i]));
  return out;};
 let x=[...x0],res=residuals(x),cost=res.reduce((s,v)=>s+v*v,0),lambda=1e-3;
 for(let it=0;it<60&&cost>1e-20&&n;it++){
  const jac:number[][]=[];for(let i=0;i<n;i++){const h=i%6<3?1e-5:1e-7,xp=[...x];xp[i]+=h;const rp=residuals(xp);jac.push(rp.map((v,r)=>(v-res[r])/h));}
  const normal=jac.map((a,i)=>jac.map((b,j)=>{let s=0;for(let r=0;r<res.length;r++)s+=a[r]*b[r];return s+(i===j?lambda*(1+s):0);})),rhs=jac.map(a=>{let s=0;for(let r=0;r<res.length;r++)s-=a[r]*res[r];return s;});
  const d=solveLinear(normal,rhs);if(!d)break;const trial=x.map((v,i)=>v+d[i]),r2=residuals(trial),c2=r2.reduce((s,v)=>s+v*v,0);
  if(c2<cost){x=trial;res=r2;cost=c2;lambda=Math.max(1e-12,lambda*.2);}else{lambda*=10;if(lambda>1e8)break;}}
 // The error leaves the pull out: what counts is whether every joint closes.
 const error=Math.sqrt(res.slice(0,res.length-n).reduce((s,v)=>s+v*v,0));
 const out:Record<string,Frame>={},xs:Record<string,number[]>={};bodies.forEach((l,i)=>{const xi=x.slice(6*i,6*i+6);out[linkBody(l.id)]=poseOf(xi);xs[l.id]=xi;});
 return {bodies:out,x:xs,error,at:(key,p)=>worldIn(x,key,p)};
}
/** Keeps the last pose: a linkage that moves in small steps (a slider) solves in a few iterations from there. */
export class LinkageSolver{private last?:{key:string;pose:LinkPose};private warm:Record<string,number[]>={};
 solve(g:Linkage,around:Around,inputs:Record<string,number>){const used=new Set(g.links.flatMap(l=>l.points.map(p=>p.body)).filter(k=>k&&!linkOfBody(k)));
  const key=JSON.stringify([g.links,inputs,[...used].map(k=>[around.now[k],around.rest[k]])]);if(this.last?.key===key)return this.last.pose;
  const pose=solveLinkage(g,around,inputs,this.warm);if(pose.error<1e-3)this.warm=pose.x;this.last={key,pose};return pose;}
 reset(){this.last=undefined;this.warm={};}}

// ---------- what one reads off ----------
export type Reading={/** wheel centre up from the design pose (mm) */lift?:number;/** degrees, negative: top of the wheel inwards */camber?:number;/** degrees, positive: front of the wheel inwards */toe?:number;
 dampers:{id:string;label:string;length:number;/** compressed from the design pose (mm) */travel:number;/** within its stroke */fits:boolean}[]};
export function read(g:Linkage,pose:LinkPose):Reading{const out:Reading={dampers:[]};
 const wheel=g.links.find(l=>l.wheel);if(wheel?.wheel){const key=linkBody(wheel.id),c=pose.at(key,wheel.wheel.to),h=pose.at(key,wheel.wheel.at),a=unit(sub(c,h));out.lift=c[2]-wheel.wheel.to[2];out.camber=-Math.atan2(a[2],Math.abs(a[1]))*180/Math.PI;out.toe=Math.atan2(a[0],Math.abs(a[1]))*180/Math.PI*Math.sign(a[1]||1);}
 for(const l of g.links)if(l.kind==='feder'&&l.points.length===2){const [a,b]=l.points,d=damperOf(l.part),length=dist(pose.at(a.body,a.at),pose.at(b.body,b.at));out.dampers.push({id:l.id,label:l.label,length,travel:dist(a.at,b.at)-length,fits:length<=d.length+1e-6&&length>=d.length-d.stroke-1e-6});}
 return out;}
/** The linkage over the range of its first input: readings at `samples` steps. From the design pose outwards both
 * ways, each step solved from the one before, so it stays on its branch. */
export function sweep(g:Linkage,around:Around,samples=21){const l=g.links.find(x=>x.input);if(!l)return [];const {min,max}=l.input!;
 const values=Array.from({length:samples},(_,k)=>min+(max-min)*k/(samples-1)),zero=values.reduce((b,v,k)=>Math.abs(v)<Math.abs(values[b])?k:b,0),out:{input:number;reading:Reading;error:number}[]=[];
 const base=solveLinkage(g,around,{[l.id]:values[zero]});out[zero]={input:values[zero],reading:read(g,base),error:base.error};
 for(const dir of [-1,1]){let warm=base.x;for(let k=zero+dir;k>=0&&k<samples;k+=dir){const pose=solveLinkage(g,around,{[l.id]:values[k]},warm);warm=pose.x;out[k]={input:values[k],reading:read(g,pose),error:pose.error};}}
 return out;}
/** Damper travel per wheel travel near the design pose. */
export function motionRatio(rows:ReturnType<typeof sweep>){const i=rows.findIndex(r=>r.input===0)>=0?rows.findIndex(r=>r.input===0):Math.floor(rows.length/2),a=rows[Math.max(0,i-1)],b=rows[Math.min(rows.length-1,i+1)];
 const dl=(b.reading.lift??0)-(a.reading.lift??0),dd=(b.reading.dampers[0]?.travel??0)-(a.reading.dampers[0]?.travel??0);return Math.abs(dl)>1e-9?dd/dl:undefined;}

// ---------- checking ----------
export type LinkIssue={links:string[];message:string};
export function linkageIssues(g:Linkage,bodies:ReadonlySet<string>=new Set()):LinkIssue[]{const out:LinkIssue[]=[],ids=new Set(g.links.map(l=>l.id));
 for(const l of g.links){
  for(const p of l.points){if(p.body===linkBody(l.id))out.push({links:[l.id],message:`${l.label}: Punkt ${p.id} hängt an sich selbst.`});const other=linkOfBody(p.body);
   if(other&&!ids.has(other))out.push({links:[l.id],message:`${l.label}: Punkt ${p.id} hängt an einem Lenker, den es nicht mehr gibt.`});
   else if(other&&!isBody(g.links.find(x=>x.id===other)!))out.push({links:[l.id],message:`${l.label}: an einem Stab oder Federbein kann nichts hängen.`});
   else if(p.body&&!other&&!bodies.has(p.body))out.push({links:[l.id],message:`${l.label}: Punkt ${p.id} hängt an etwas, das es nicht mehr gibt.`});
   if(p.kind==='dreh'&&(!p.to||dist(p.at,p.to)<2))out.push({links:[l.id],message:`${l.label}: die Drehachse bei ${p.id} braucht zwei Punkte mindestens 2 mm auseinander.`});}
  if((l.kind==='stab'||l.kind==='feder')&&l.points.length!==2)out.push({links:[l.id],message:`${l.label}: braucht genau zwei Enden.`});
  if(l.kind==='feder'&&l.points.length===2){const d=damperOf(l.part),len=dist(l.points[0].at,l.points[1].at);if(len>d.length+1e-6||len<d.length-d.stroke-1e-6)out.push({links:[l.id],message:`${l.label}: Abstand der Augen ${len.toFixed(1).replace('.',',')} mm, der Dämpfer kann ${d.length-d.stroke}–${d.length} mm.`});}
  if(l.kind==='lenker'&&l.points.length+pointsOn(g,l.id).length<2)out.push({links:[l.id],message:`${l.label}: hängt an weniger als zwei Punkten.`});}
 const f=freedomOf(g),stabs=g.links.filter(isDistance).length;
 if(g.links.some(isBody)&&f>0)out.push({links:[],message:`Das Gestänge hat noch ${f} freie Bewegung${f===1?'':'en'}: ein Gelenk, ein Stab oder ein Eingang fehlt${stabs?'':''}.`});
 return out;}

// ---------- printed parts ----------
const LUG=4,GAP=.3,BORE=1.6,TAP=1.25;
/** One end of a printed link: where its tubes meet, a boss and its hole. */
type Node={at:V;boss:Prim[];hole:Prim[]};
const cyl=(a:V,b:V,r:number):Prim=>{const d=sub(b,a),l=norm(d),z=scale(d,1/l),x=Math.abs(z[0])<.9?unit(cross([1,0,0],z)):unit(cross([0,1,0],z)),y=cross(z,x);
 const m=[[x[0],y[0],z[0]],[x[1],y[1],z[1]],[x[2],y[2],z[2]]],t=1+m[0][0]+m[1][1]+m[2][2];let q:Q;
 if(t>1e-6){const s=Math.sqrt(t)*2;q=[(m[2][1]-m[1][2])/s,(m[0][2]-m[2][0])/s,(m[1][0]-m[0][1])/s,s/4];}else if(m[0][0]>m[1][1]&&m[0][0]>m[2][2]){const s=Math.sqrt(1+m[0][0]-m[1][1]-m[2][2])*2;q=[s/4,(m[0][1]+m[1][0])/s,(m[0][2]+m[2][0])/s,(m[2][1]-m[1][2])/s];}
 else if(m[1][1]>m[2][2]){const s=Math.sqrt(1+m[1][1]-m[0][0]-m[2][2])*2;q=[(m[0][1]+m[1][0])/s,s/4,(m[1][2]+m[2][1])/s,(m[0][2]-m[2][0])/s];}else{const s=Math.sqrt(1+m[2][2]-m[0][0]-m[1][1])*2;q=[(m[0][2]+m[2][0])/s,(m[1][2]+m[2][1])/s,s/4,(m[1][0]-m[0][1])/s];}
 return {kind:'cylinder',frame:{position:a,rotation:q},r,z0:0,z1:l};};
const perp=(v:V,d:V):V=>sub(v,scale(d,dot(v,d)));
const centreOf=(ps:V[])=>scale(ps.reduce((s,p)=>add(s,p),[0,0,0] as V),1/Math.max(1,ps.length));
/** Every place where a body takes part in a joint, with the direction of what holds on there. */
function ends(g:Linkage,body:string){const out:{point:Point;owner:Link;own:boolean}[]=[];
 for(const l of g.links)for(const p of l.points){if(linkBody(l.id)===body)out.push({point:p,owner:l,own:true});else if(p.body===body)out.push({point:p,owner:l,own:false});}return out;}
/** Direction along which the cup on `owner` comes in at point `p`: from its other end (a stab, a damper) or from its centre. */
function cupDirection(g:Linkage,owner:Link,p:Point):V{const others=owner.kind==='lenker'?[...owner.points.filter(q=>q!==p).flatMap(q=>q.to?[q.at,q.to]:[q.at]),...pointsOn(g,owner.id).map(x=>x.point.at)]:owner.points.filter(q=>q!==p).map(q=>q.at);
 const c=centreOf(others);const d=sub(p.at,c);return norm(d)>1e-9?unit(d):[0,1,0];}
/** The nodes of a body for its printed shape: for a link its own and attached points, for the world its brackets. */
function nodesOf(g:Linkage,body:string):Node[]{const all=ends(g,body),here=all.flatMap(e=>e.point.to?[e.point.at,e.point.to]:[e.point.at]),c=centreOf(here),out:Node[]=[];
 for(const {point:p,owner,own} of all){
  if(p.kind==='dreh'&&p.to){const u=unit(sub(p.to,p.at));
   // The owner turns in a sleeve between the two lugs; the other side carries the lugs. A screw M3 runs through all.
   if(own){const a=add(p.at,scale(u,LUG/2+GAP)),b=sub(p.to,scale(u,LUG/2+GAP));out.push({at:a,boss:[cyl(a,b,4)],hole:[cyl(sub(p.at,scale(u,LUG)),add(p.to,scale(u,LUG)),BORE)]},{at:b,boss:[],hole:[]});}
   else for(const e of [p.at,p.to])out.push({at:e,boss:[cyl(sub(e,scale(u,LUG/2)),add(e,scale(u,LUG/2)),4.5)],hole:[cyl(sub(e,scale(u,LUG)),add(e,scale(u,LUG)),BORE)]});
   continue;}
  const ball=ballOf(p.part),d=cupDirection(g,owner,p);
  if(own){// The cup screws onto a short threaded pin in the owner: a boss back along its direction, a tap hole M3.
   const seat=sub(p.at,scale(d,ball.reach)),back=sub(seat,scale(d,6));out.push({at:back,boss:[cyl(back,seat,4)],hole:[cyl(sub(seat,scale(d,9)),add(seat,scale(d,1)),TAP)]});}
  else{// The ball stud screws into this side, across the direction of the cup, away from this body's middle.
   let n=perp(body?sub(p.at,c):[0,0,1],d);if(norm(n)<1e-6)n=perp([0,0,1],d);if(norm(n)<1e-6)n=perp([1,0,0],d);n=unit(n);if(!body&&n[2]<0)n=scale(n,-1);
   const face=sub(p.at,scale(n,ball.offset)),back=sub(face,scale(n,7));out.push({at:back,boss:[cyl(back,face,4)],hole:[cyl(sub(face,scale(n,9)),add(face,scale(n,1)),TAP)]});}}
 return out;}
/** The printed shape of a link at the design pose: bosses at its joints, tubes between them. */
export function linkSolids(g:Linkage,id:string){const l=g.links.find(x=>x.id===id);if(!l||l.kind!=='lenker')throw Error('Kein gedruckter Lenker.');const nodes=nodesOf(g,linkBody(id)),r=(l.d??6)/2,solids:Prim[]=[],holes:Prim[]=[];
 for(const n of nodes){solids.push(...n.boss);holes.push(...n.hole);}
 // Every pair up to five nodes, a spanning tree beyond: a triangle stays a triangle, a carrier a frame.
 const at=nodes.map(n=>n.at);if(at.length<=5){for(let i=0;i<at.length;i++)for(let j=i+1;j<at.length;j++)if(dist(at[i],at[j])>.5)solids.push({kind:'capsule',a:at[i],b:at[j],r});}
 else{const inTree=[0];while(inTree.length<at.length){let best:[number,number,number]|undefined;for(const i of inTree)for(let j=0;j<at.length;j++)if(!inTree.includes(j)){const d=dist(at[i],at[j]);if(!best||d<best[2])best=[i,j,d];}inTree.push(best![1]);solids.push({kind:'capsule',a:at[best![0]],b:at[best![1]],r});}}
 if(l.wheel){const u=unit(sub(l.wheel.to,l.wheel.at));solids.push(cyl(sub(l.wheel.at,scale(u,8)),l.wheel.at,7));holes.push(cyl(sub(l.wheel.at,scale(u,12)),add(l.wheel.at,scale(u,1)),2.5));
  solids.push({kind:'capsule',a:sub(l.wheel.at,scale(u,8)),b:centreOf(at),r});}
 return {solids,holes};}
/** Brackets on the world: a column from the floor up to each joint, a foot with a screw hole. */
export function mountSolids(g:Linkage){const nodes=nodesOf(g,''),solids:Prim[]=[],holes:Prim[]=[];if(!nodes.length)return {solids,holes,floor:0};
 const floor=g.floor??Math.min(...nodes.map(n=>n.at[2]))-10;
 for(const n of nodes){solids.push(...n.boss);holes.push(...n.hole);const top:V=[n.at[0],n.at[1],Math.max(floor+4,n.at[2])];
  solids.push({kind:'box',frame:{position:[top[0],top[1],(floor+top[2])/2],rotation:[0,0,0,1]},half:[3.5,3.5,(top[2]-floor)/2]},{kind:'box',frame:{position:[top[0],top[1],floor+1.5],rotation:[0,0,0,1]},half:[9,9,1.5]});
  holes.push({kind:'cylinder',frame:{position:[top[0]+6,top[1],floor],rotation:[0,0,0,1]},r:1.7,z0:-1,z1:4});}
 return {solids,holes,floor};}
const screws=[8,10,12,16,20,25,30,35,40,45,50,60];
/** What to buy: ball joints, turnbuckles by length, dampers, wheels, screws through the axes. */
export function linkageShopping(g:Linkage){const lines=new Map<string,number>(),add1=(k:string,n=1)=>lines.set(k,(lines.get(k)??0)+n);
 for(const l of g.links){
  if(l.kind==='feder')add1(damperOf(l.part).label);
  if(l.kind==='stab'&&l.points.length===2)add1(`Spannschloss M3 mit 2 Kugelpfannen, Kugelmitte zu Kugelmitte ${dist(l.points[0].at,l.points[1].at).toFixed(1).replace('.',',')} mm`);
  if(l.wheel)add1(wheelOf(l.wheel.part).label);
  for(const p of l.points){if(p.kind==='kugel'){const b=ballOf(p.part);add1(`Kugelbolzen ${b.ball.toString().replace('.',',')} mm M3`);if(l.kind==='lenker')add1(`Kugelpfanne ${b.ball.toString().replace('.',',')} mm mit Gewindestift M3`);}
   else if(p.to){const need=dist(p.at,p.to)+LUG+4;add1(`Zylinderschraube M3 × ${screws.find(s=>s>=need)??Math.ceil(need)} mit Mutter`);}}}
 return [...lines].map(([label,count])=>({label,count}));}

// ---------- reading a file ----------
const vec=(x:unknown,what:string):V=>{if(!Array.isArray(x)||x.length!==3||!x.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<1e5))throw Error(`Gestänge: ${what} ungültig`);return [x[0],x[1],x[2]];};
const name=(x:unknown,what:string)=>{if(typeof x!=='string'||!/^[\wäöüÄÖÜß.-]{1,40}$/.test(x))throw Error(`Gestänge: ${what} ungültig`);return x;};
export function parseLinkage(value:unknown):Linkage{const g=value as Linkage;if(!g||!Array.isArray(g.links)||g.links.length>64)throw Error('Gestänge ungültig');
 const links=g.links.map((l):Link=>{if(!l||!['lenker','stab','feder'].includes(l.kind)||!Array.isArray(l.points)||l.points.length>12||typeof l.label!=='string'||l.label.length>60)throw Error('Gestänge: Lenker ungültig');
  const points=l.points.map((p):Point=>{if(p.kind!=='kugel'&&p.kind!=='dreh'||typeof p.body!=='string'||p.body.length>80)throw Error('Gestänge: Punkt ungültig');return {id:name(p.id,'Punkt'),at:vec(p.at,'Punkt'),kind:p.kind,...(p.to?{to:vec(p.to,'Achse')}:{}),body:p.body,...(typeof p.part==='string'?{part:p.part}:{})};});
  if(new Set(points.map(p=>p.id)).size!==points.length)throw Error('Gestänge: Punkt doppelt');
  const out:Link={id:name(l.id,'Lenker'),label:l.label,kind:l.kind,points};
  if(l.d!==undefined){if(typeof l.d!=='number'||!(l.d>=2&&l.d<=30))throw Error('Gestänge: Rohr-Ø ungültig');out.d=l.d;}
  if(typeof l.part==='string')out.part=l.part;
  if(l.wheel)out.wheel={at:vec(l.wheel.at,'Radnabe'),to:vec(l.wheel.to,'Radmitte'),part:typeof l.wheel.part==='string'?l.wheel.part:wheelParts[0].id};
  if(l.input){const i=l.input;if(typeof i.point!=='string'||!Number.isFinite(i.min)||!Number.isFinite(i.max)||i.min>i.max)throw Error('Gestänge: Eingang ungültig');out.input={point:i.point,min:i.min,max:i.max};}
  return out;});
 if(new Set(links.map(l=>l.id)).size!==links.length)throw Error('Gestänge: Lenker doppelt');
 return {links,...(typeof g.floor==='number'&&Number.isFinite(g.floor)?{floor:g.floor}:{})};}

// ---------- a corner to start from ----------
/** A front corner of a 1:10 formula car, left side: double wishbones, pushrod onto a rocker, damper across, tie rod.
 * The numbers are a starting point to move, not a reference car. */
export function pushrodCorner(prefix=''):Link[]{const k=(s:string)=>prefix+s,on=(s:string)=>linkBody(k(s));return [
 {id:k('unten'),label:'Querlenker unten',kind:'lenker',d:6,points:[{id:'innen',kind:'dreh',at:[-25,25,14],to:[25,25,14],body:''},{id:'aussen',kind:'kugel',at:[0,76,16],body:on('traeger'),part:'kugel-6.8'}],input:{point:'innen',min:-10,max:10}},
 {id:k('oben'),label:'Querlenker oben',kind:'lenker',d:5,points:[{id:'innen',kind:'dreh',at:[-22,30,40],to:[22,30,40],body:''},{id:'aussen',kind:'kugel',at:[0,72,42],body:on('traeger'),part:'kugel-5.8'}]},
 {id:k('traeger'),label:'Radträger',kind:'lenker',d:7,points:[],wheel:{at:[0,82,28],to:[0,95,28],part:'rad-56'}},
 {id:k('spur'),label:'Spurstange',kind:'stab',points:[{id:'innen',kind:'kugel',at:[-14,27,24],body:''},{id:'aussen',kind:'kugel',at:[-14,74,26],body:on('traeger')}]},
 {id:k('hebel'),label:'Umlenkhebel',kind:'lenker',d:5,points:[{id:'achse',kind:'dreh',at:[-6,18,48],to:[6,18,48],body:''}]},
 {id:k('pushrod'),label:'Pushrod',kind:'stab',points:[{id:'unten',kind:'kugel',at:[0,64,18],body:on('unten')},{id:'oben',kind:'kugel',at:[0,26,58],body:on('hebel')}]},
 {id:k('daempfer'),label:'Federbein',kind:'feder',part:'daempfer-65',points:[{id:'hebel',kind:'kugel',at:[0,10,60],body:on('hebel')},{id:'chassis',kind:'kugel',at:[0,-48.5,62],body:''}]},
];}
