// Mates by rolling (KINEMATIK-KERN.md 5.3): a cutter outline rolls without
// slip on a circular blank; the lower envelope of the cutter, in the blank's
// polar coordinates, is the mate's tooth outline. Profile and shape of the
// cutter do not matter, so library parts (LEGO, scans) get exact mates.
import type {V2} from './involute.ts';
import type {Mesh} from './mesh.ts';
import type {V} from '../math.ts';

export type MateOptions={cutter:V2[];cutterRadius:number;mateRadius:number;addendum:number;dedendum:number;internal?:false;bins?:number;poseStep?:number;phase?:number};
export type MateOutline={radius:number[];theta:number[];outline:V2[];pitchRadius:number};
const TAU=2*Math.PI;
const wrap=(a:number)=>((a%TAU)+TAU)%TAU;

export function generateMate(o:MateOptions):MateOutline{
 const ra=o.cutterRadius,rb=o.mateRadius,d=ra+rb,bins=o.bins??Math.max(1440,Math.ceil(TAU*rb/.03)),step=o.poseStep??.05;
 const top=rb+o.addendum,root=rb-o.dedendum,radius=Array(bins).fill(top),theta=Array.from({length:bins},(_,k)=>TAU*k/bins);
 const reach=Math.max(...o.cutter.map(([x,y])=>Math.hypot(x,y)));
 if(reach>=d-root)throw Error('Fräsrad reicht bis zur Gegenradachse.');
 // Poses over one revolution of the mate plus overlap, so every gap is cut by an approaching and a leaving tooth.
 const poses=Math.ceil((TAU*rb+4*reach)/step);
 for(let k=0;k<=poses;k++){
  const arc=-2*reach+k*step,psiB=arc/rb,psiA=-arc/ra+(o.phase??0)*Math.PI/180;
  // Mate frame: the cutter centre sits at angle −ψ_b at distance d; its outline is turned by ψ_a − ψ_b.
  const cx=d*Math.cos(-psiB),cy=d*Math.sin(-psiB),rot=psiA-psiB+Math.PI,c=Math.cos(rot),s=Math.sin(rot);
  let prev:{t:number;r:number}|undefined;
  for(let i=0;i<=o.cutter.length;i++){const [x,y]=o.cutter[i%o.cutter.length],px=cx+x*c-y*s,py=cy+x*s+y*c,r=Math.hypot(px,py);
   const cur={t:Math.atan2(py,px),r};
   if(prev&&(prev.r<top||cur.r<top)){
    let dt=cur.t-prev.t;if(dt>Math.PI)dt-=TAU;if(dt<-Math.PI)dt+=TAU;
    const t0=prev.t,lo=Math.ceil(Math.min(0,dt)*bins/TAU+wrap(t0)*bins/TAU),hi=Math.floor(Math.max(0,dt)*bins/TAU+wrap(t0)*bins/TAU);
    for(let j=lo;j<=hi;j++){const tj=j*TAU/bins,w=Math.abs(dt)<1e-12?0:(tj-wrap(t0))/dt,rr=prev.r+(cur.r-prev.r)*Math.max(0,Math.min(1,w)),idx=((j%bins)+bins)%bins;if(rr<radius[idx])radius[idx]=rr;}
   }
   prev=cur;}
 }
 for(let k=0;k<bins;k++)radius[k]=Math.max(root,radius[k]);
 return {radius,theta,outline:radius.map((r,k)=>[r*Math.cos(theta[k]),r*Math.sin(theta[k])] as V2),pitchRadius:rb};
}
/** Rolling pose of a non-circular pair on fixed axes, centre distance d, B on +x.
 * A turns by φ (counter-clockwise); B turns clockwise by β with S_B(β) = −S_A(−φ), and
 * B starts turned by π so its polar angle 0 faces A. Returns B's rotation angle. */
export function conjugateTurn(arcA:(t:number)=>number,arcB:(t:number)=>number,phi:number,lengthB:number){
 const s=-arcA(-phi);let lo=Math.floor(s/lengthB)*2*Math.PI-2*Math.PI,hi=lo+6*Math.PI;
 for(let i=0;i<80;i++){const mid=(lo+hi)/2;if(arcB(mid)<s)lo=mid;else hi=mid;}
 return Math.PI-(lo+hi)/2;
}
export type ConjugateOptions={cutter:V2[];arcA:(t:number)=>number;arcB:(t:number)=>number;lengthB:number;radiusB:(t:number)=>number;centerDistance:number;addendum:number;dedendum:number;bins?:number;step?:number};
/** Mate outline for a non-circular pair: the toothed outline of A rolls along both pitch curves. */
export function generateConjugate(o:ConjugateOptions):MateOutline{
 const bins=o.bins??2880,step=o.step??.002,d=o.centerDistance,theta=Array.from({length:bins},(_,k)=>TAU*k/bins);
 const top=theta.map(t=>o.radiusB(t)+o.addendum),root=theta.map(t=>o.radiusB(t)-o.dedendum),radius=[...top];
 // Roll until B has turned once completely, with overlap at both ends.
 const reach=Math.max(...o.cutter.map(([x,y])=>Math.hypot(x,y))),margin=2*reach;
 for(let phi=-margin/reach;-o.arcA(-phi)<=o.lengthB+margin;phi+=step){
  const beta=conjugateTurn(o.arcA,o.arcB,phi,o.lengthB),ca=Math.cos(phi),sa=Math.sin(phi),cb=Math.cos(-beta),sb=Math.sin(-beta);
  let prev:{t:number;r:number}|undefined;
  for(let i=0;i<=o.cutter.length;i++){const [x,y]=o.cutter[i%o.cutter.length],wx=x*ca-y*sa-d,wy=x*sa+y*ca,px=wx*cb-wy*sb,py=wx*sb+wy*cb,cur={t:Math.atan2(py,px),r:Math.hypot(px,py)};
   if(prev){let dt=cur.t-prev.t;if(dt>Math.PI)dt-=TAU;if(dt<-Math.PI)dt+=TAU;const t0=wrap(prev.t),lo=Math.ceil(Math.min(0,dt)*bins/TAU+t0*bins/TAU),hi=Math.floor(Math.max(0,dt)*bins/TAU+t0*bins/TAU);
    for(let j=lo;j<=hi;j++){const idx=((j%bins)+bins)%bins;if(prev.r>top[idx]&&cur.r>top[idx])continue;const w=Math.abs(dt)<1e-12?0:(j*TAU/bins-t0)/dt,rr=prev.r+(cur.r-prev.r)*Math.max(0,Math.min(1,w));if(rr<radius[idx])radius[idx]=rr;}}
   prev=cur;}
 }
 for(let k=0;k<bins;k++)radius[k]=Math.max(root[k],radius[k]);
 return {radius,theta,outline:radius.map((r,k)=>[r*Math.cos(theta[k]),r*Math.sin(theta[k])] as V2),pitchRadius:NaN};
}
/** Number of teeth: rising crossings of the pitch circle. */
export function countTeeth(m:MateOutline,level=m.pitchRadius){let n=0;for(let k=0;k<m.radius.length;k++){const a=m.radius[(k-1+m.radius.length)%m.radius.length]-level,b=m.radius[k]-level;if(a<0&&b>=0)n++;}return n;}
/** Mean angular tooth thickness at radius `level`, as arc length. */
export function toothThickness(radius:number[],level:number){
 const n=radius.length,cross:{k:number;rising:boolean}[]=[];
 for(let k=0;k<n;k++){const a=radius[(k-1+n)%n]-level,b=radius[k]-level;if(a<0&&b>=0||a>=0&&b<0){const t=a/(a-b);cross.push({k:k-1+t,rising:b>=0});}}
 const widths:number[]=[];for(let i=0;i<cross.length;i++){const c=cross[i],next=cross[(i+1)%cross.length];if(c.rising&&!next.rising){let dk=next.k-c.k;if(dk<0)dk+=n;widths.push(dk*TAU/n*level);}}
 return widths.reduce((a,b)=>a+b,0)/widths.length;
}
/** Radius of a star-shaped polygon outline in a direction. */
export function polarRadius(outline:V2[],t:number){
 let best=0;const dx=Math.cos(t),dy=Math.sin(t);
 for(let i=0;i<outline.length;i++){const [ax,ay]=outline[i],[bx,by]=outline[(i+1)%outline.length],ex=bx-ax,ey=by-ay,den=dx*ey-dy*ex;if(Math.abs(den)<1e-14)continue;const u=(ax*ey-ay*ex)/den,v=(ax*dy-ay*dx)/den;if(u>0&&v>=0&&v<=1)best=Math.max(best,u);}
 return best;
}
/** Prism from a star-shaped outline: fans on both caps and quads around. */
export function extrudeStar(outline:V2[],z0:number,z1:number):Mesh{
 const n=outline.length,positions:V[]=[[0,0,z0],[0,0,z1]],triangles:[number,number,number][]=[];
 for(const [x,y] of outline)positions.push([x,y,z0],[x,y,z1]);
 const lo=(i:number)=>2+2*(i%n),hi=(i:number)=>3+2*(i%n);
 for(let i=0;i<n;i++){triangles.push([0,lo(i+1),lo(i)],[1,hi(i),hi(i+1)],[lo(i),lo(i+1),hi(i+1)],[lo(i),hi(i+1),hi(i)]);}
 return {positions,triangles};
}
