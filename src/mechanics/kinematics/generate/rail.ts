// Rails by rolling (KINEMATIK-KERN.md 5.3, 9): a pinion rolls without slip
// along a planar pitch curve; the lower envelope of its outline, measured in
// curve coordinates (arc length s, height h toward the pinion), cuts the
// tooth gaps of the rail. Works for straight racks and for curved guides.
import type {V} from '../math.ts';
import {add,scale,cross,dot,norm,rotate} from '../math.ts';
import type {Curve} from '../curves.ts';
import {curve} from '../curves.ts';
import {closestArc} from '../contacts.ts';
import {involuteOutline} from './involute.ts';
import type {V2} from './involute.ts';
import type {Mesh} from './mesh.ts';

export type RailOptions={path:Curve;module:number;pinionTeeth:number;pressureAngle?:number;backlash?:number;side?:1|-1;from:number;to:number;width:number;backing?:number;step?:number;poseStep?:number;phase?:number};
export type RailProfile={s:number[];top:number[];addendum:number;root:number;base:number;side:1|-1;pinion:V2[];options:RailOptions};

/** Plane basis of a planar curve: e1, e2 with e1 × e2 = axis. */
function planeOf(path:Curve){
 const fn=curve(path),z=fn.planar?[0,0,1] as V:rotate(fn.frame(0).rotation,[0,0,1]);
 if(!fn.planar){for(let i=0;i<=16;i++){const zi=rotate(fn.frame(Number.isFinite(fn.length)?fn.length*i/16:i).rotation,[0,0,1]);if(norm(cross(z,zi))>1e-6)throw Error('Zahnstange entlang eines Pfads braucht einen ebenen Pfad mit fester Achse.');}}
 const helper:V=Math.abs(z[0])<.9?[1,0,0]:[0,1,0],e1=cross(cross(z,helper),z),l=norm(e1),u=scale(e1,1/l);
 return {fn,z,e1:u,e2:cross(z,u)};
}
/** Pinion outline in world coordinates while its contact point sits at arc length c. */
export function pinionAt(profile:Pick<RailProfile,'pinion'|'side'|'options'>,c:number):V[]{
 const o=profile.options,{fn,z,e1,e2}=planeOf(o.path),ra=o.module*o.pinionTeeth/2,side=profile.side;
 const q=fn.point(c),n=fn.normal(c),centre=add(q,scale(n,side*ra));
 // Angle of the direction toward the rail in the plane, plus the rolling angle relative to that normal.
 const toward=scale(n,-side),theta=Math.atan2(dot(toward,e2),dot(toward,e1))-side*(c-o.from)/ra+(o.phase??0)*Math.PI/180;
 const ct=Math.cos(theta),st=Math.sin(theta);
 return profile.pinion.map(([x,y])=>{const u=x*ct-y*st,v=x*st+y*ct;return add(centre,add(scale(e1,u),scale(e2,v)));});
 void z;
}
export function railProfile(o:RailOptions):RailProfile{
 const m=o.module,side=o.side??1,step=o.step??.05,poseStep=o.poseStep??.1,{fn}=planeOf(o.path);
 if(!(o.to>o.from))throw Error('Zahnstange: Bereich leer.');
 if(Number.isFinite(fn.length)&&(o.from<0||o.to>fn.length))throw Error('Zahnstange: Bereich liegt außerhalb der Wälzkurve.');
 const ra=m*o.pinionTeeth/2;
 // The pinion must fit inside every bend on its side of the rail.
 // A bend whose centre lies on the pinion's side must be wider than the pinion tip circle.
 const samples=Math.ceil((o.to-o.from)/1);for(let i=0;i<=samples;i++){const s=o.from+(o.to-o.from)*i/samples,k=fn.curvature(s);if(k>1e-9){const d=1e-3,turn=dot(add(fn.tangent(s+d),scale(fn.tangent(s-d),-1)),fn.normal(s)),inner=Math.sign(turn)===side;if(inner&&1/k<ra+m)throw Error(`Zahnstange: Krümmungsradius ${(1/k).toFixed(1)} mm kleiner als Ritzel (${(ra+m).toFixed(1)} mm).`);}}
 const pinion=involuteOutline({module:m,teeth:o.pinionTeeth,pressureAngle:o.pressureAngle??20,backlash:o.backlash??.15,samples:16});
 const count=Math.round((o.to-o.from)/step)+1,s=Array.from({length:count},(_,i)=>o.from+(o.to-o.from)*i/(count-1)),addendum=m,root=-1.25*m,top=Array(count).fill(addendum);
 const profile={s,top,addendum,root,base:root-(o.backing??3*m),side,pinion,options:o} as RailProfile;
 const window=Math.sqrt(2*ra*2.5*m)+2*m,consider=addendum+.2*m;
 const index=(x:number)=>(x-o.from)/(o.to-o.from)*(count-1);
 for(let c=o.from-window;c<=o.to+window+1e-9;c+=poseStep){
  if(Number.isFinite(fn.length)&&(c<0||c>fn.length))continue;
  const world=pinionAt(profile,c),contact=fn.point(c),near=world.map(p=>norm(add(p,scale(contact,-1)))<window+m);
  let prev:{s:number;h:number}|undefined,prevNear=false;
  const local=(p:V)=>{const sa=closestArc(fn,p,c),q=fn.point(sa);return {s:sa,h:side*dot(add(p,scale(q,-1)),fn.normal(sa))};};
  for(let k=0;k<=world.length;k++){const i=k%world.length;if(!near[i]){prev=undefined;prevNear=false;continue;}
   const cur=local(world[i]);
   if(prev&&prevNear&&(prev.h<consider||cur.h<consider)){
    const lo=Math.max(0,Math.ceil(index(Math.min(prev.s,cur.s)))),hi=Math.min(count-1,Math.floor(index(Math.max(prev.s,cur.s))));
    for(let j=lo;j<=hi;j++){const ds=cur.s-prev.s,t=Math.abs(ds)<1e-12?0:(s[j]-prev.s)/ds,h=prev.h+(cur.h-prev.h)*Math.max(0,Math.min(1,t));if(h<top[j])top[j]=h;}
   }
   prev=cur;prevNear=true;}
 }
 // Tooth gaps get bottom clearance below the pinion tip.
 for(let j=0;j<count;j++){if(top[j]<=-m+.02*m)top[j]=root;top[j]=Math.max(root,top[j]);}
 return profile;
}
/** Closed mesh of the rail: top profile, flat base, two side faces and two end caps. */
export function railMesh(p:RailProfile):Mesh{
 const o=p.options,{fn,z}=planeOf(o.path),w0=-o.width/2,w1=o.width/2,positions:V[]=[],triangles:[number,number,number][]=[];
 const n=p.s.length,at=(s:number,h:number,w:number)=>add(add(fn.point(s),scale(fn.normal(s),p.side*h)),scale(z,w));
 // Vertex grid: index(i, row) with rows top/w0, top/w1, base/w0, base/w1.
 for(let i=0;i<n;i++){positions.push(at(p.s[i],p.top[i],w0),at(p.s[i],p.top[i],w1),at(p.s[i],p.base,w0),at(p.s[i],p.base,w1));}
 const v=(i:number,r:number)=>4*i+r;
 // Orientation: outward normals for side=+1 (height toward +normal, s along tangent, z = tangent × normal).
 const quad=(a:number,b:number,c:number,d:number)=>{triangles.push([a,b,c],[a,c,d]);};
 for(let i=0;i<n-1;i++){
  quad(v(i,0),v(i,1),v(i+1,1),v(i+1,0));      // top surface
  quad(v(i,2),v(i+1,2),v(i+1,3),v(i,3));      // base
  quad(v(i,0),v(i+1,0),v(i+1,2),v(i,2));      // face at w0
  quad(v(i,1),v(i,3),v(i+1,3),v(i+1,1));      // face at w1
 }
 quad(v(0,0),v(0,2),v(0,3),v(0,1));            // start cap
 quad(v(n-1,0),v(n-1,1),v(n-1,3),v(n-1,2));    // end cap
 if(p.side<0)for(const t of triangles)[t[1],t[2]]=[t[2],t[1]];
 return {positions,triangles};
}
/** Tooth flanks crossing the pitch line: positions where the profile passes h = level. */
export function crossings(p:RailProfile,level=0){const out:{s:number;rising:boolean}[]=[];for(let i=1;i<p.s.length;i++){const a=p.top[i-1]-level,b=p.top[i]-level;if(a<0&&b>=0||a>=0&&b<0){const t=a/(a-b);out.push({s:p.s[i-1]+(p.s[i]-p.s[i-1])*t,rising:b>=0});}}return out;}
