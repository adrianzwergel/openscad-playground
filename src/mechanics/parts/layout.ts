// Places the tool finds itself. A part with a wish names a zone or leaves it open; everything without one is fixed and
// stays. On a plate the wishes are packed around the fixed parts. On a model a zone is a ball: candidates are points of
// the model's surface in it, and the goal decides among those that fit: the middle of the zone, or a short lever to the
// axes that have to carry the part (weight: what hangs far from an axis loads its drive).
import type {Part} from './catalog.ts';
import {partOf,footprint,freeAt,plateRect,sheet,snap} from './build.ts';
import type {Build,BuildItem,Sheet} from './build.ts';
import type {Frame,V} from '../kinematics/math.ts';
import {compose,inverse,rotate,cross,norm,dot} from '../kinematics/math.ts';
import type {Mechanism} from '../kinematics/model.ts';
import type {Assets,Drive} from '../kinematics/drive.ts';
import {owned} from '../kinematics/drive.ts';

export const flexible=(i:BuildItem)=>!!i.wish;
const inRect=(b:Sheet,p:Part,i:BuildItem)=>{if(b.plate.mode!=='fixed')return true;const r=plateRect(b);return footprint(p,i).corners.every(c=>c[0]>=r.x0-1e-6&&c[0]<=r.x1+1e-6&&c[1]>=r.y0-1e-6&&c[1]<=r.y1+1e-6);};
const boxOf=(b:Sheet,items:BuildItem[])=>{const c=items.flatMap(i=>footprint(partOf(b,i),i).corners);return c.length?{x0:Math.min(...c.map(p=>p[0])),x1:Math.max(...c.map(p=>p[0])),y0:Math.min(...c.map(p=>p[1])),y1:Math.max(...c.map(p=>p[1]))}:undefined;};
/** Places for the parts with a wish on one plate: fixed parts first, then zones, then the open ones, the largest first. */
export function solveSheet(b:Sheet){
 const fixed=b.items.filter(i=>!i.wish),rest=b.items.filter(flexible).sort((x,y)=>{const a=x.wish!.mode==='zone'?0:1,c=y.wish!.mode==='zone'?0:1,area=(i:BuildItem)=>{const s=partOf(b,i).box;return (s.max[0]-s.min[0])*(s.max[1]-s.min[1]);};return a-c||area(y)-area(x);});
 const done=[...fixed],placed:{id:string;at:[number,number];angle:number}[]=[],failed:string[]=[],step=Math.max(b.grid,2);
 for(const i of rest){const p=partOf(b,i),w=i.wish!,box=boxOf(b,done),r=plateRect({...b,items:done}),size=Math.hypot(p.box.max[0]-p.box.min[0],p.box.max[1]-p.box.min[1]);
  const area=w.mode==='zone'?{x0:w.center[0]-w.size[0]/2,x1:w.center[0]+w.size[0]/2,y0:w.center[1]-w.size[1]/2,y1:w.center[1]+w.size[1]/2}:b.plate.mode==='fixed'?r:{x0:(box?.x0??0)-size-20,x1:(box?.x1??0)+size+20,y0:(box?.y0??0)-size-20,y1:(box?.y1??0)+size+20};
  const aim:[number,number]=w.mode==='zone'?[w.center[0],w.center[1]]:box?[(box.x0+box.x1)/2,(box.y0+box.y1)/2]:[(area.x0+area.x1)/2,(area.y0+area.y1)/2];
  let best:{at:[number,number];angle:number;score:number}|undefined;
  for(const angle of [...new Set([i.angle,(i.angle+90)%360])])for(let x=snap(area.x0,step);x<=area.x1+1e-6;x+=step)for(let y=snap(area.y0,step);y<=area.y1+1e-6;y+=step){const at:[number,number]=[x,y],c:BuildItem={...i,at,angle};
   if(x<area.x0-1e-6||y<area.y0-1e-6||!inRect(b,p,c)||!freeAt(b,c,done))continue;
   // A zone wants its middle; an open part the smallest outline, then close to the others.
   const all=boxOf(b,[...done,c])!,score=w.mode==='zone'?Math.hypot(x-aim[0],y-aim[1])+(angle===i.angle?0:.5):(all.x1-all.x0)*(all.y1-all.y0)/100+Math.hypot(x-aim[0],y-aim[1])/10+(angle===i.angle?0:.05);
   if(!best||score<best.score)best={at,angle,score};}
  if(best){placed.push({id:i.id,at:best.at,angle:best.angle});done.push({...i,at:best.at,angle:best.angle});}else failed.push(i.id);}
 return {placed,failed};
}
/** Solves every plate of a build, in place. Returns the parts that found no place. */
export function solveBuild(b:Build){const failed:string[]=[];for(const n of b.plates){const r=solveSheet(sheet(b,n.id));failed.push(...r.failed);for(const q of r.placed){const i=b.items.find(x=>x.id===q.id)!;i.at=q.at;i.angle=q.angle;}}return failed;}

// ---------- on a model ----------
export type SurfacePoint={point:V;normal:V;body:string};
/** Points of the model's surface in a ball, about `step` apart. */
export function surfacePoints(m:Mechanism,drives:Drive[],assets:Assets,frames:Record<string,Frame>,center:V,radius:number,step=8){
 const out:SurfacePoint[]=[],inBall=(p:V)=>Math.hypot(p[0]-center[0],p[1]-center[1],p[2]-center[2])<=radius;
 for(const b of m.bodies){if(b.display?.kind!=='mesh'||owned(drives,b.id)||!frames[b.id])continue;const asset=assets(b.display.asset);if(!asset)continue;const local=compose(frames[b.id],inverse(b.frame));
  for(const id of b.display.parts){const q=asset.parts.find(x=>x.id===id)?.positions;if(!q)continue;
   for(let k=0;k+8<q.length;k+=9){const w=(n:number):V=>compose(local,{position:[q[k+n],q[k+n+1],q[k+n+2]],rotation:[0,0,0,1]}).position,a=w(0),c=w(3),d=w(6),e1:V=[c[0]-a[0],c[1]-a[1],c[2]-a[2]],e2:V=[d[0]-a[0],d[1]-a[1],d[2]-a[2]],n0=cross(e1,e2),l=norm(n0);if(l<1e-9)continue;const normal=n0.map(v=>v/l) as V,n=Math.min(60,Math.max(1,Math.ceil(Math.max(norm(e1),norm(e2))/step)));
    for(let u=0;u<=n;u++)for(let v=0;v<=n-u;v++){const f=(u+1/3)/(n+1),g=(v+1/3)/(n+1),p:V=[a[0]+f*e1[0]+g*e2[0],a[1]+f*e1[1]+g*e2[1],a[2]+f*e1[2]+g*e2[2]];if(inBall(p))out.push({point:p,normal,body:b.id});}}}}
 return out;
}
/** Sum of the lever arms to the revolute axes between a link and the ground: what a weight here costs the drives. */
export function axisLever(m:Mechanism,drives:Drive[],frames:Record<string,Frame>,body:string,point:V){
 const chain=new Map<string,string[]>([['ground',[]]]),open=['ground'];
 while(open.length){const here=open.pop()!;for(const j of m.joints){if(owned(drives,j.id)||j.id.startsWith('halt-')||j.joint.kind==='fixed')continue;const next=j.a.body===here?j.b.body:j.b.body===here?j.a.body:undefined;if(next&&!chain.has(next)){chain.set(next,[...chain.get(here)!,j.id]);open.push(next);}}}
 let sum=0;for(const id of chain.get(body)??[]){const j=m.joints.find(x=>x.id===id)!;if(j.joint.kind!=='revolute')continue;const f=compose(frames[j.a.body]??{position:[0,0,0],rotation:[0,0,0,1]},j.a.local),axis=rotate(f.rotation,[0,0,1]),r:V=[point[0]-f.position[0],point[1]-f.position[1],point[2]-f.position[2]],along=dot(r,axis);sum+=Math.hypot(r[0]-axis[0]*along,r[1]-axis[1]*along,r[2]-axis[2]*along);}
 return sum;
}
