// Roller chain ISO 606 04C (ANSI #25, ¼" pitch) and its sprockets. The sprockets are the ones sourcing map sells: z9 to
// z17, z19, z24, z25 with a hub on one side (type B), bore 5, 6 or 8 mm, two set screws; and a tensioner sprocket z20
// with a bearing inside (bore 8, 13 mm wide, teeth in the middle). Teeth after ISO 606: pitch Ø d = p / sin(180°/z),
// root Ø d − d1, tip Ø d + p·(1 − 1,6/z) − d1 (the standard's least, as sold). Hubs are not in the standard: estimated,
// to be measured.
//
// A chain runs round sprockets that it wraps (the loop goes round them) and tensioners that press on it from outside or
// inside. Its length counts in links: over a sprocket as many links as teeth it wraps, along a straight span its length
// over the pitch. A closed chain has a whole number of links, an even one without a cranked link.

/** The chain: pitch, roller Ø, inner width; `plate`: height of its plates; `width`: over the pins. */
export const CHAIN={pitch:6.35,roller:3.3,inner:3.18,plate:6,width:7.9,/** Tooth width of a sprocket. */tooth:2.8};
export const SPROCKET_TEETH=[9,10,11,12,13,14,15,16,17,19,24,25];
export const SPROCKET_BORES=[5,6,8];
export const pitchDiameter=(z:number)=>CHAIN.pitch/Math.sin(Math.PI/z);
export const tipDiameter=(z:number)=>pitchDiameter(z)+CHAIN.pitch*(1-1.6/z)-CHAIN.roller;
export const rootDiameter=(z:number)=>pitchDiameter(z)-CHAIN.roller;
/** A sprocket's hub (estimated): Ø and length beside the teeth. */
export const hubOf=(z:number,bore:number)=>({D:+Math.min(rootDiameter(z)-2,Math.max(bore+8,.55*pitchDiameter(z))).toFixed(1),length:8});
/** Where the teeth lie within a sprocket's width, from its x0: hub on the right (higher x) or left; a tensioner: middle. */
export function toothBand(c:{width:number;hub?:boolean},w:number,hub:'links'|'rechts'='rechts'):[number,number]{
 if(!c.hub){const m=w/2;return [m-CHAIN.tooth/2,m+CHAIN.tooth/2];}
 return hub==='rechts'?[0,CHAIN.tooth]:[w-CHAIN.tooth,w];}

/** A wheel on the chain's way: its centre, pitch radius, teeth; `side`: +1 the loop goes round it (a sprocket, or a
 * tensioner inside the loop), −1 it presses from outside. */
export type ChainWheel={at:[number,number];r:number;teeth:number;side:1|-1};
export type ChainPath={/** In pitches. */links:number;/** In mm, along the pitch line. */length:number;spans:[[number,number],[number,number]][];/** Wrap angle per wheel (rad). */wraps:number[]};
/** The chain round wheels in this order, counter-clockwise: straight spans tangent from wheel to wheel, wraps between.
 * Undefined if the order cannot be (wheels too close for a tangent). */
export function chainPath(ws:ChainWheel[]):ChainPath|undefined{
 const n=ws.length,th:number[]=[],spans:ChainPath['spans']=[];let straight=0;
 for(let i=0;i<n;i++){const a=ws[i],b=ws[(i+1)%n],dx=b.at[0]-a.at[0],dy=b.at[1]-a.at[1],D=Math.hypot(dx,dy),sa=a.side*a.r,sb=b.side*b.r;
  // Left normal n at θ: the wheel on the left of the way when side +1 (centre = touch point + s·n).
  if(D<Math.abs(sb-sa)+1e-9)return undefined;const t=Math.atan2(dy,dx)+Math.acos((sb-sa)/D);th.push(t);
  const nx=Math.cos(t),ny=Math.sin(t),p:[number,number]=[a.at[0]-sa*nx,a.at[1]-sa*ny],q:[number,number]=[b.at[0]-sb*nx,b.at[1]-sb*ny];spans.push([p,q]);straight+=Math.hypot(q[0]-p[0],q[1]-p[1]);}
 const wraps:number[]=[];let links=straight/CHAIN.pitch;
 for(let i=0;i<n;i++){const w=ws[i],tin=th[(i-1+n)%n],tout=th[i],two=2*Math.PI,m=(x:number)=>((x%two)+two)%two;
  // Round a wheel inside the loop the way turns left (counter-clockwise), outside it right.
  const wrap=w.side>0?m(tout-tin):m(tin-tout);wraps.push(wrap);links+=wrap/two*w.teeth;}
 return {links,length:links*CHAIN.pitch,spans,wraps};}
/** The chain round two sprockets and the tensioners. A tensioner goes into the straight span it reaches into: from
 * outside the loop it presses the chain in, from inside it pushes it out (and is wrapped like a sprocket). One that
 * does not reach the chain stays out of its way: `loose`. */
export function chainRound(a:ChainWheel,b:ChainWheel,via:ChainWheel[]):ChainPath&{order:ChainWheel[];loose:number[]}|undefined{
 const base=chainPath([a,b]);if(!base)return undefined;const spans:{w:ChainWheel;t:number}[][]=[[],[]],loose:number[]=[];
 via.forEach((v,k)=>{let best:{i:number;d:number;t:number}|undefined;
  base.spans.forEach(([p,q],i)=>{const u=q[0]-p[0],w=q[1]-p[1],l=Math.hypot(u,w)||1,t=((v.at[0]-p[0])*u+(v.at[1]-p[1])*w)/l,d=((v.at[1]-p[1])*u-(v.at[0]-p[0])*w)/l;if(t<0||t>l)return;if(!best||Math.abs(d)<Math.abs(best.d))best={i,d,t};});
  // d > 0: left of the way, inside the counter-clockwise loop.
  if(!best||Math.abs(best.d)>=v.r-1e-6){loose.push(k);return;}spans[best.i].push({w:{...v,side:best.d>0?1:-1},t:best.t});});
 const order=[a,...spans[0].sort((x,y)=>x.t-y.t).map(x=>x.w),b,...spans[1].sort((x,y)=>x.t-y.t).map(x=>x.w)],p=chainPath(order);
 return p?{...p,order,loose}:undefined;}
/** Links of a closed chain for a way of `links` pitches: the next even number (a little slack beats too tight). */
export const linksFor=(links:number)=>2*Math.ceil(links/2-1e-3);
/** The parameter t in [lo, hi] at which f(t) = target (f rising), by halving. */
export function solve(f:(t:number)=>number,target:number,lo:number,hi:number){let a=lo,b=hi;const fa=f(a)-target,fb=f(b)-target;if(!Number.isFinite(fa)||!Number.isFinite(fb)||fa*fb>0)return NaN;
 for(let i=0;i<60;i++){const m=(a+b)/2,fm=f(m)-target;if(!Number.isFinite(fm))return NaN;if((fm>0)===(fb>0))b=m;else a=m;}return (a+b)/2;}
/** A sprocket's outline in the plane, centre at 0: tip circle with a seat for each roller and flanks out to the tip. */
export function sprocketOutline(z:number,steps=6):[number,number][]{
 const R=pitchDiameter(z)/2,Ra=tipDiameter(z)/2,ri=.505*CHAIN.roller+.069*Math.cbrt(CHAIN.roller),pts:[number,number][]=[],da=2*Math.PI/z;
 // Per tooth: the seat (an arc of ri round the roller's centre on the pitch circle), then the flank on to the tip,
 // the tip arc, the other flank down to the next seat.
 const half=Math.PI/2*.62;// how far round the roller the seat goes each way (rad)
 for(let k=0;k<z;k++){const c=k*da,cx=R*Math.cos(c),cy=R*Math.sin(c);
  for(let i=-steps;i<=steps;i++){const a=c+Math.PI-half*i/steps;pts.push([cx+ri*Math.cos(a),cy+ri*Math.sin(a)]);}
  // From the seat's end straight out to the tip, half way to the next roller.
  const e=pts.at(-1)!,m=c+da/2,tip:[number,number]=[Ra*Math.cos(m-da*.12),Ra*Math.sin(m-da*.12)],tip2:[number,number]=[Ra*Math.cos(m+da*.12),Ra*Math.sin(m+da*.12)];
  if(Math.hypot(...e)<Ra)pts.push(tip,tip2);}
 return pts;}
