// What moving things cover, in the plane. A capsule is the hull of two discs (a disc: both ends the same); swept, it is
// everything it covers while turning about a point from one angle to another (degrees, counter-clockwise, relative to
// where it is drawn). A disc swept about a point is a band along an arc, a capsule that starts at the point a fan: both
// have exact distances. Anything else is stepped through its angles.
export type P=[number,number];
export type Capsule={a:P;ra:number;b:P;rb:number};
export type Sweep={c:P;from:number;to:number};
export type Prim=Capsule&{sweep?:Sweep};

const RAD=Math.PI/180;
const len=(a:P,b:P)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
export const rot=(p:P,c:P,deg:number):P=>{const s=Math.sin(deg*RAD),k=Math.cos(deg*RAD),x=p[0]-c[0],y=p[1]-c[1];return [c[0]+x*k-y*s,c[1]+x*s+y*k];};
export const turned=(g:Capsule,c:P,deg:number):Capsule=>({a:rot(g.a,c,deg),ra:g.ra,b:rot(g.b,c,deg),rb:g.rb});
/** Signed distance from a point to the hull of two discs (negative inside). */
export function capsuleDistance(p:P,a:P,ra:number,b:P,rb:number){
 const h=len(a,b);if(h<=Math.abs(ra-rb)+1e-9)return ra>=rb?len(p,a)-ra:len(p,b)-rb;
 const ux=(b[0]-a[0])/h,uy=(b[1]-a[1])/h,dx=p[0]-a[0],dy=p[1]-a[1],y=dx*ux+dy*uy,x=Math.abs(dx*uy-dy*ux),k=(ra-rb)/h,m=Math.sqrt(1-k*k),t=-x*k+y*m;
 if(t<0)return Math.hypot(x,y)-ra;if(t>m*h)return Math.hypot(x,y-h)-rb;return x*m+y*k-ra;}
const angle=(p:P,c:P)=>Math.atan2(p[1]-c[1],p[0]-c[0])/RAD;
/** Is the direction `a` (degrees) within `width` degrees counter-clockwise from `start`? */
const within=(a:number,start:number,width:number)=>(((a-start)%360)+360)%360<=width+1e-9;
/** How many steps a sweep is walked in: about one per mm of the farthest point's way. */
const steps=(g:Capsule,w:Sweep)=>Math.max(2,Math.min(720,Math.ceil(Math.abs(w.to-w.from)*RAD*Math.max(len(g.a,w.c)+g.ra,len(g.b,w.c)+g.rb))+1));
/** Signed distance from a point to a capsule or what it sweeps. */
export function primDistance(p:P,g:Prim):number{
 const w=g.sweep;if(!w||w.to-w.from<=1e-9)return capsuleDistance(p,g.a,g.ra,g.b,g.rb);
 const full=w.to-w.from>=360-1e-9,rho=len(p,w.c),disc=len(g.a,g.b)<=Math.abs(g.ra-g.rb)+1e-9;
 if(disc){const at=g.ra>=g.rb?g.a:g.b,r=Math.max(g.ra,g.rb),d=len(at,w.c);if(d<1e-9)return rho-r;
  if(full||within(angle(p,w.c),angle(at,w.c)+w.from,w.to-w.from))return Math.abs(rho-d)-r;return Math.min(len(p,rot(at,w.c,w.from)),len(p,rot(at,w.c,w.to)))-r;}
 // A fan: the capsule starts at the centre it turns about.
 const fan=len(g.a,w.c)<1e-9?g:len(g.b,w.c)<1e-9?{a:g.b,ra:g.rb,b:g.a,rb:g.ra}:undefined;
 if(fan){const reach=len(fan.a,fan.b)+fan.rb;if(full||within(angle(p,w.c),angle(fan.b,w.c)+w.from,w.to-w.from))return rho-reach;
  const s=turned(fan,w.c,w.from),e=turned(fan,w.c,w.to);return Math.min(capsuleDistance(p,s.a,s.ra,s.b,s.rb),capsuleDistance(p,e.a,e.ra,e.b,e.rb));}
 const n=steps(g,w);let best=Infinity;for(let i=0;i<=n;i++){const q=rot(p,w.c,-(w.from+(w.to-w.from)*i/n));best=Math.min(best,capsuleDistance(q,g.a,g.ra,g.b,g.rb));}return best;}
/** Discs that cover a primitive: along a capsule, and through a sweep's angles. */
function samples(g:Prim):{q:P;r:number}[]{const along:{q:P;r:number}[]=[],disc=len(g.a,g.b)<1e-9,k=disc?0:g.sweep?12:32;
 for(let i=0;i<=k;i++){const t=k?i/k:0;along.push({q:[g.a[0]+(g.b[0]-g.a[0])*t,g.a[1]+(g.b[1]-g.a[1])*t],r:g.ra+(g.rb-g.ra)*t});}
 const w=g.sweep;if(!w||w.to-w.from<=1e-9)return along;const n=steps(g,w),out:{q:P;r:number}[]=[];
 for(let i=0;i<=n;i++){const deg=w.from+(w.to-w.from)*i/n;for(const s of along)out.push({q:rot(s.q,w.c,deg),r:s.r});}return out;}
/** Distance between two primitives (negative: they overlap). The one that is not swept is walked, the other measured. */
export function primsApart(s:Prim,t:Prim):number{if(s.sweep&&!t.sweep)[s,t]=[t,s];let best=Infinity;for(const x of samples(s))best=Math.min(best,primDistance(x.q,t)-x.r);return best;}
/** A disc round a primitive, to get past it: its centre and radius. */
export function bound(g:Prim):{c:P;r:number}{
 const w=g.sweep;if(!w||w.to-w.from<=1e-9)return {c:g.a,r:Math.max(g.ra,g.rb)};
 const far=Math.max(len(g.a,w.c)+g.ra,len(g.b,w.c)+g.rb);if(w.to-w.from>=180)return {c:w.c,r:far};
 // A narrow sweep: round the middle of what it covers.
 const mid=(w.from+w.to)/2,m=turned(g,w.c,mid),c:P=[(m.a[0]+m.b[0])/2,(m.a[1]+m.b[1])/2],s=turned(g,w.c,w.from);
 return {c,r:Math.max(len(c,s.a)+s.ra,len(c,s.b)+s.rb,len(c,m.a)+m.ra,len(c,m.b)+m.rb)};}
/** Points along the middle line of a band (a disc swept along an arc), every few degrees. */
export function arcPoints(at:P,w:Sweep,step=3):P[]{const n=Math.max(1,Math.ceil((w.to-w.from)/step)),out:P[]=[];for(let i=0;i<=n;i++)out.push(rot(at,w.c,w.from+(w.to-w.from)*i/n));return out;}
/** Where the gearbox stands for a look at it: the shaft the range is set at turned by `turn` degrees, each swing arm by its
 * angle. What is saved and made is always the gearbox as drawn. */
export type Pose={turn:number;groups:Record<string,number>};
/** A point carried by a chain of links, innermost first: each turns it about its pivot as drawn. */
export const carried=(p:P,chain:{at:P;angle:number}[]):P=>chain.reduce((q,g)=>g.angle?rot(q,g.at,g.angle):q,p);
/** A body's links with their angles in a pose, innermost first. */
export function links(groups:{id:string;at:P;parent:string}[],body:string,angles:Record<string,number>){const out:{at:P;angle:number}[]=[];for(let g=groups.find(v=>v.id===body),k=0;g&&k<50;g=groups.find(v=>v.id===g!.parent),k++)out.push({at:g.at,angle:angles[g.id]??0});return out;}
