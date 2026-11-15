// A linked gearbox screwed to a plate of the build (the deck of a rover onto the frame of each side): a printed angle
// bracket. Its leg lies flat on the outer face of the gearbox's frame plate that faces the plate and is held by the
// frame's own column bolts (each a few mm longer); its flange reaches under the plate and is screwed to it. The leg
// takes only bolts it can reach without touching what sticks out of that face or swings past it: motors, shafts, parts
// of swing arms over their whole range, and points of the Studio (ball studs) on the swing arms.
// Everything here is in three frames: the gearbox's (`g`, mirrored like the view: z → 2m − z), the world, the plate's.
import type {GearPlan} from '../../gear/plan.ts';
import {links} from '../../gear/sweep.ts';
import type {Frame,V} from '../kinematics/math.ts';
import {compose,inverse,rotate,dot,cross,unit} from '../kinematics/math.ts';
import type {Prim} from '../../structure/sdf.ts';

type P=[number,number];
/** What stands in the way on the face, in the gearbox's xy: a circle or a square (a motor), with a name. */
type Keep={c:P;r:number;square?:boolean;what:string};
export type MountInput={plan:GearPlan;mirror:boolean;/** The gearbox's frame in the room. */gear:Frame;/** The plate's frame in the room, its top at z 0. */plate:Frame;
 thickness:number;/** The plate's outline (in its own frame). */rect:{x0:number;x1:number;y0:number;y1:number};/** Points on the gearbox's swing arms in the room as drawn: `group` the arm. */studs?:{at:V;group:string;what:string}[]};
export type Mount={/** Leg and flange as solids, with their holes (room). */solids:Prim[];holes:Prim[];/** Holes in the plate (its frame), Ø. */plateHoles:P[];d:number;
 /** The frame bolts it is screwed to (gearbox xy). */bolts:P[];issues:string[];bom:{count:number;what:string}[]};
/** Leg and flange thickness, bolt hole Ø, how far the flange reaches under the plate, the room kept to anything. */
export const MOUNT={t:4,d:3.4,overlap:14,gap:1.5,eye:5};
const sub=(a:P,b:P):P=>[a[0]-b[0],a[1]-b[1]],len=(a:P)=>Math.hypot(a[0],a[1]),rot=(p:P,c:P,deg:number):P=>{const a=deg*Math.PI/180,x=p[0]-c[0],y=p[1]-c[1];return [c[0]+x*Math.cos(a)-y*Math.sin(a),c[1]+x*Math.sin(a)+y*Math.cos(a)];};
/** Distance from a point to a segment. */
const toSeg=(p:P,a:P,b:P)=>{const ab=sub(b,a),l=dot([ab[0],ab[1],0],[ab[0],ab[1],0]),t=l?Math.max(0,Math.min(1,((p[0]-a[0])*ab[0]+(p[1]-a[1])*ab[1])/l)):0;return len(sub(p,[a[0]+ab[0]*t,a[1]+ab[1]*t]));};
/** How far a capsule (segment a–b, radius r) stays from a keep-out; below 0 they overlap. */
function clear(a:P,b:P,r:number,k:Keep){if(!k.square)return toSeg(k.c,a,b)-r-k.r;
 // A square: sampled along the segment, distance to the box.
 let best=Infinity;for(let i=0;i<=20;i++){const p:P=[a[0]+(b[0]-a[0])*i/20,a[1]+(b[1]-a[1])*i/20],dx=Math.max(Math.abs(p[0]-k.c[0])-k.r,0),dy=Math.max(Math.abs(p[1]-k.c[1])-k.r,0),inside=Math.abs(p[0]-k.c[0])<k.r&&Math.abs(p[1]-k.c[1])<k.r;best=Math.min(best,inside?-1:Math.hypot(dx,dy));}return best-r;}
/** Convex hull, counter-clockwise. */
function hull(pts:P[]):P[]{const s=[...pts].sort((a,b)=>a[0]-b[0]||a[1]-b[1]),x=(o:P,a:P,b:P)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]),lo:P[]=[],hi:P[]=[];
 for(const p of s){while(lo.length>=2&&x(lo[lo.length-2],lo[lo.length-1],p)<=0)lo.pop();lo.push(p);}for(const p of [...s].reverse()){while(hi.length>=2&&x(hi[hi.length-2],hi[hi.length-1],p)<=0)hi.pop();hi.push(p);}return [...lo.slice(0,-1),...hi.slice(0,-1)];}
const circle=(c:P,r:number,n=16):P[]=>Array.from({length:n},(_,i)=>[c[0]+r*Math.cos(2*Math.PI*i/n),c[1]+r*Math.sin(2*Math.PI*i/n)]);

export function gearMount(x:MountInput):Mount{
 const {plan,t,issues}={plan:x.plan,t:MOUNT.t,issues:[] as string[]},m=middle(plan),flip=(p:V):V=>x.mirror?[p[0],p[1],2*m-p[2]]:p;
 const toWorld=(p:V)=>compose(x.gear,{position:flip(p),rotation:[0,0,0,1]}).position,toGear=(p:V)=>flip(compose(inverse(x.gear),{position:p,rotation:[0,0,0,1]}).position);
 const dirWorld=(v:V)=>rotate(x.gear.rotation,x.mirror?[v[0],v[1],-v[2]]:v),dirGear=(v:V):V=>{const q=rotate(inverse(x.gear).rotation,v);return x.mirror?[q[0],q[1],-q[2]]:q;};
 const none=(why:string):Mount=>({solids:[],holes:[],plateHoles:[],d:MOUNT.d,bolts:[],issues:[why],bom:[]});
 // The face: the frame's plate nearest to the plate.
 const frame=plan.layers.filter(l=>!l.body);if(!frame.length)return none('Das Getriebe hat keine Platte im Gestell.');
 const zlo=Math.min(...frame.map(l=>l.band[0])),zhi=Math.max(...frame.map(l=>l.band[1])),centre=toGear(compose(x.plate,{position:[(x.rect.x0+x.rect.x1)/2,(x.rect.y0+x.rect.y1)/2,0],rotation:[0,0,0,1]}).position),s=centre[2]<(zlo+zhi)/2?-1:1,zf=s<0?zlo:zhi;
 const faceLayer=frame.find(l=>(s<0?l.band[0]:l.band[1])===zf)!;
 // Where the plate's underside meets the face: a line; e points across it towards the plate's top side.
 const n=dirGear(rotate(x.plate.rotation,[0,0,1])),p0=toGear(compose(x.plate,{position:[0,0,-x.thickness],rotation:[0,0,0,1]}).position),a=Math.hypot(n[0],n[1]);
 if(a<.3)return none('Die Platte liegt parallel zum Gestell: dort hält kein Winkel.');
 const e:P=[n[0]/a,n[1]/a],d:P=[-e[1],e[0]],c=(dot(n,p0)-n[2]*zf)/a,uv=(p:P)=>({u:p[0]*d[0]+p[1]*d[1],v:p[0]*e[0]+p[1]*e[1]-c}),at=(u:number,v:number):P=>[u*d[0]+(v+c)*e[0],u*d[1]+(v+c)*e[1]];
 // What is in the way beyond the face, over the whole range of the swing arms.
 const beyond=(z0:number,z1:number)=>s<0?z0<zf-.1:z1>zf+.1,keep:Keep[]=[];
 const sweep=(body:string,p:P):P[]=>{if(!body)return [p];const chain:string[]=[];for(let g=plan.groups.find(v=>v.id===body);g&&chain.length<6;g=plan.groups.find(v=>v.id===g!.parent))chain.push(g.id);
  let poses:Record<string,number>[]=[{}];for(const id of chain){const g=plan.groups.find(v=>v.id===id)!,steps=Array.from({length:7},(_,i)=>g.from+(g.to-g.from)*i/6);poses=poses.flatMap(q=>steps.map(v=>({...q,[id]:v})));}
  return poses.map(q=>links(plan.groups,body,q).reduce((r,g)=>g.angle?rot(r,g.at,g.angle):r,p));};
 for(const mo of plan.motors){const z0=mo.down?mo.face-mo.depth:mo.face,z1=mo.down?mo.face:mo.face+mo.depth;if(!beyond(z0,z1))continue;const sh=plan.shafts.find(v=>v.id===mo.on);if(sh)keep.push({c:sh.at,r:mo.part.size[0]/2,square:true,what:mo.label});}
 for(const o of plan.obstacles){if(!beyond(o.z0,o.z1)||o.on.length!==1)continue;const mo=plan.motors.find(v=>v.on===o.on[0]);if(mo&&Math.abs(o.z0-(mo.down?mo.face-mo.depth:mo.face))<.01)continue;const sh=plan.shafts.find(v=>v.id===o.on[0]);if(!sh)continue;for(const c of sweep(o.body??'',sh.at))keep.push({c,r:o.ra,what:o.label});}
 for(const st of x.studs??[]){const q=toGear(st.at);if(s*(q[2]-zf)<=0)continue;for(const c of sweep(st.group,[q[0],q[1]]))keep.push({c,r:4,what:st.what});}
 // The frame's bolts through the face plate that the leg reaches without touching anything.
 const g=MOUNT.gap,eye=MOUNT.eye,band:[number,number]=[-t-3,3],chosen:P[]=[];
 for(const b of plan.bolts){if(b.body||!b.attach[faceLayer.id])continue;const {u,v}=uv(b.at);if(Math.abs(v)>90)continue;const foot=at(u,Math.max(band[0],Math.min(band[1],v)));
  if(keep.every(k=>clear(b.at,foot,eye,k)>g))chosen.push(b.at);}
 if(!chosen.length)return none(`Kein Säulenbolzen des Gestells ist frei zu erreichen (${keep.map(k=>k.what).filter((w,i,all)=>all.indexOf(w)===i).join(', ')||'nichts im Weg, aber keine Bolzen'}). Im Getriebe-Generator einen Bolzen setzen.`);
 if(chosen.length<2)issues.push('Der Winkel hält nur an einem Bolzen: er kann sich drehen. Im Getriebe-Generator einen zweiten Bolzen am Gestell setzen.');
 let us=chosen.map(b=>uv(b).u),u0=Math.min(...us)-eye-3,u1=Math.max(...us)+eye+3;if(u1-u0<30){const mid=(u0+u1)/2;u0=mid-15;u1=mid+15;}
 const strip:P[]=[at(u0,band[0]),at(u1,band[0]),at(u1,band[1]),at(u0,band[1])];
 for(const k of keep)if(clear(at(u0,(band[0]+band[1])/2),at(u1,(band[0]+band[1])/2),(band[1]-band[0])/2,k)<=g)issues.push(`Der Winkel kommt ${k.what} zu nahe.`);
 // The leg: the strip and a web to each bolt, between the face and t beyond it (unmirrored z for the room).
 const z0=Math.min(zf,zf+s*t),z1=Math.max(zf,zf+s*t),fz=(z:number)=>x.mirror?2*m-z:z,legFrame:Frame=x.gear,lz:[number,number]=[Math.min(fz(z0),fz(z1)),Math.max(fz(z0),fz(z1))];
 const solids:Prim[]=[{kind:'slab',frame:legFrame,points:hull(strip),z0:lz[0],z1:lz[1]},...chosen.map(b=>{const {u,v}=uv(b);return {kind:'slab' as const,frame:legFrame,points:hull([...circle(b,eye),...circle(at(u,Math.max(band[0],Math.min(band[1],v))),eye)]),z0:lz[0],z1:lz[1]};})];
 const holes:Prim[]=chosen.map(b=>({kind:'cylinder',frame:compose(legFrame,{position:[b[0],b[1],0],rotation:[0,0,0,1]}),r:MOUNT.d/2,z0:lz[0]-1,z1:lz[1]+1}));
 // The flange: in a frame on the face's line at the plate's underside, x along the line, y towards the plate, z its normal.
 const origin=toWorld([...at(0,0),zf] as V),nz=unit(rotate(x.plate.rotation,[0,0,1]));let ax=unit(dirWorld([d[0],d[1],0])),ay=cross(nz,ax);
 const towards=sub3(compose(x.plate,{position:[(x.rect.x0+x.rect.x1)/2,(x.rect.y0+x.rect.y1)/2,-x.thickness],rotation:[0,0,0,1]}).position,origin);let sign=1;if(dot(ay,towards)<0){ax=ax.map(v=>-v) as V;ay=cross(nz,ax);sign=-1;}
 const flangeFrame:Frame={position:origin,rotation:quat(ax,ay,nz)};
 // How far from the face the plate begins, along y: a ray into its outline.
 const inPlate=compose(inverse(x.plate),flangeFrame),o=inPlate.position,dir=rotate(inPlate.rotation,[0,1,0]);let enter=-Infinity,leave=Infinity;
 for(const [k,lo,hi] of [[0,x.rect.x0,x.rect.x1],[1,x.rect.y0,x.rect.y1]] as [0|1,number,number][]){if(Math.abs(dir[k])<1e-9){if(o[k]<lo||o[k]>hi){enter=Infinity;}continue;}const ta=(lo-o[k])/dir[k],tb=(hi-o[k])/dir[k];enter=Math.max(enter,Math.min(ta,tb));leave=Math.min(leave,Math.max(ta,tb));}
 if(!(enter<leave)||enter===Infinity)return {...none('Die Platte liegt nicht vor dem Gestell: der Flansch fände sie nicht.'),bolts:chosen};
 if(enter<g)issues.push('Die Platte reicht bis ans Gestell: sie stößt an den Winkel. Platte schmaler machen.');
 if(enter>60)issues.push(`Die Platte ist ${enter.toFixed(0)} mm vom Gestell weg: der Flansch wird lang und weich.`);
 const reach=Math.max(enter,0)+MOUNT.overlap,fu0=sign*u0,fu1=sign*u1,[a0,a1]=[Math.min(fu0,fu1),Math.max(fu0,fu1)];
 solids.push({kind:'slab',frame:flangeFrame,points:[[a0,0],[a1,0],[a1,reach],[a0,reach]],z0:-t,z1:0});
 const screws:P[]=[[a0+6,Math.max(enter,0)+MOUNT.overlap/2],[a1-6,Math.max(enter,0)+MOUNT.overlap/2]];
 for(const q of screws)holes.push({kind:'cylinder',frame:compose(flangeFrame,{position:[q[0],q[1],0],rotation:[0,0,0,1]}),r:MOUNT.d/2,z0:-t-1,z1:x.thickness+1});
 const plateHoles=screws.map(q=>{const w=compose(inPlate,{position:[q[0],q[1],0],rotation:[0,0,0,1]}).position;return [w[0],w[1]] as P;});
 return {solids,holes,plateHoles,d:MOUNT.d,bolts:chosen,issues,bom:[{count:1,what:'Winkel (gedruckt)'},{count:chosen.length,what:`M3-Bolzen der Gestell-Säulen ${t} mm länger`},{count:2,what:`Schraube M3 × ${Math.ceil(t+x.thickness+3)} mit Mutter (Flansch an die Platte)`}]};}
const sub3=(a:V,b:V):V=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
/** A rotation from its three axes. */
function quat(x:V,y:V,z:V):[number,number,number,number]{const [m00,m10,m20]=x,[m01,m11,m21]=y,[m02,m12,m22]=z,tr=m00+m11+m22;
 if(tr>0){const S=Math.sqrt(tr+1)*2;return [(m21-m12)/S,(m02-m20)/S,(m10-m01)/S,S/4];}
 if(m00>m11&&m00>m22){const S=Math.sqrt(1+m00-m11-m22)*2;return [S/4,(m01+m10)/S,(m02+m20)/S,(m21-m12)/S];}
 if(m11>m22){const S=Math.sqrt(1+m11-m00-m22)*2;return [(m01+m10)/S,S/4,(m12+m21)/S,(m02-m20)/S];}
 const S=Math.sqrt(1+m22-m00-m11)*2;return [(m02+m20)/S,(m12+m21)/S,S/4,(m10-m01)/S];}
/** The middle of a gearbox's height: what it is mirrored across. */
export function middle(plan:GearPlan){const zs=[...plan.shafts.flatMap(x=>[x.z0,x.z1]),...plan.layers.flatMap(l=>l.band)];return zs.length?(Math.min(...zs)+Math.max(...zs))/2:0;}
