// Pitch curves: the universal primitive of rolling contact. Every curve is
// parametrised by arc length and offers point, tangent, normal, curvature and a
// moving frame. Circles and lines are closed formulas; polylines are rounded at
// every corner into exact arcs; polar curves are periodic cubic splines; paths
// in space carry a rotation-minimising frame or a preferred axis.
import type {V,Frame} from './math.ts';
import {add,scale,norm,cross,dot,unit,frameFromBasis,TAU} from './math.ts';

export type V2=[number,number];
export type Curve2=
 |{kind:'circle';r:number}
 |{kind:'line';length?:number}
 |{kind:'polyline';points:V2[];closed:boolean;cornerRadius:number}
 |{kind:'polar';samples:number[]};
export type Curve3={kind:'path';points:V[];closed:boolean;cornerRadius:number;axis?:V};
export type Curve=Curve2|Curve3;

export interface CurveFn{
 readonly length:number;readonly closed:boolean;readonly planar:boolean;
 point(s:number):V;tangent(s:number):V;normal(s:number):V;curvature(s:number):number;
 /** x = tangent, y = normal, z = axis of rotation (planar: +z). */
 frame(s:number):Frame;
 /** Radius, slope and curvature of the radius about the origin; only star-shaped closed planar curves. */
 polar?(theta:number):{r:number;dr:number;ddr:number};
}

const Z:V=[0,0,1];
const wrap=(s:number,length:number)=>((s%length)+length)%length;

function circle(r:number):CurveFn{
 if(!(r>0))throw Error('Kreisradius muss positiv sein.');
 const length=TAU*r;
 return {length,closed:true,planar:true,
  point:s=>{const t=s/r;return [r*Math.cos(t),r*Math.sin(t),0];},
  tangent:s=>{const t=s/r;return [-Math.sin(t),Math.cos(t),0];},
  normal:s=>{const t=s/r;return [-Math.cos(t),-Math.sin(t),0];},
  curvature:()=>1/r,
  frame(s){const t=s/r;return frameFromBasis(this.point(s),[-Math.sin(t),Math.cos(t),0],[-Math.cos(t),-Math.sin(t),0],Z);},
  polar:()=>({r,dr:0,ddr:0})};
}
function line(length=Infinity):CurveFn{
 if(!(length>0))throw Error('Länge einer Geraden muss positiv sein.');
 return {length,closed:false,planar:true,point:s=>[s,0,0],tangent:()=>[1,0,0],normal:()=>[0,1,0],curvature:()=>0,frame:s=>frameFromBasis([s,0,0],[1,0,0],[0,1,0],Z)};
}

type Piece={s0:number;length:number}&({kind:'segment';a:V;dir:V}|{kind:'arc';center:V;r:number;u:V;v:V});
/** Rounds every corner of a polyline into a tangent arc. Throws for sharp corners
 * without radius and for radii that do not fit the adjacent segments. */
function pieces(points:V[],closed:boolean,rho:number):Piece[]{
 const n=points.length;if(n<2)throw Error('Polylinie braucht mindestens zwei Punkte.');
 const count=closed?n:n-1,dirs:V[]=[],lengths:number[]=[];
 for(let i=0;i<count;i++){const d=add(points[(i+1)%n],scale(points[i],-1)),l=norm(d);if(l<1e-9)throw Error('Polylinie enthält doppelte Punkte.');dirs.push(scale(d,1/l));lengths.push(l);}
 // Tangent length consumed by the rounding at each corner.
 const corners=closed?n:n-2,cut:number[]=Array(n).fill(0),turn:number[]=Array(n).fill(0);
 for(let k=0;k<corners;k++){const i=closed?(k+1)%n:k+1,d1=dirs[(i-1+count)%count],d2=dirs[i%count],c=Math.max(-1,Math.min(1,dot(d1,d2))),theta=Math.acos(c);
  if(theta<1e-9)continue;if(Math.PI-theta<1e-6)throw Error('Polylinie kehrt an einer Ecke um.');if(!(rho>0))throw Error('Ecke ohne Eckenradius lässt sich nicht abrollen.');
  turn[i]=theta;cut[i]=rho*Math.tan(theta/2);}
 for(let i=0;i<count;i++){const a=i,b=(i+1)%n;if(cut[a]+cut[b]>lengths[i]+1e-9)throw Error('Eckenradius zu groß für die angrenzenden Segmente.');}
 const out:Piece[]=[];let s0=0;
 const push=(p:Piece)=>{out.push({...p,s0});s0+=p.length;};
 for(let i=0;i<count;i++){
  const a=add(points[i],scale(dirs[i],cut[i])),length=lengths[i]-cut[i]-cut[(i+1)%n];
  if(length>1e-12)push({kind:'segment',a,dir:dirs[i],length,s0:0});
  const j=(i+1)%n;if(turn[j]>0&&(closed||j<n-1)){const d1=dirs[i],d2=dirs[j%count],n1=unit(add(d2,scale(d1,-dot(d1,d2)))),start=add(points[j],scale(d1,-cut[j])),center=add(start,scale(n1,rho));
   push({kind:'arc',center,r:rho,u:scale(n1,-1),v:d1,length:rho*turn[j],s0:0});}
 }
 return out;
}
function pieceCurve(list:Piece[],closed:boolean,planar:boolean,axisHint?:V):CurveFn{
 const length=list.reduce((s,p)=>s+p.length,0);
 const locate=(s:number)=>{const x=closed?wrap(s,length):Math.max(0,Math.min(length,s));let lo=0,hi=list.length-1;while(lo<hi){const mid=(lo+hi+1)>>1;if(list[mid].s0<=x)lo=mid;else hi=mid-1;}return {p:list[lo],t:x-list[lo].s0};};
 const point=(s:number):V=>{const {p,t}=locate(s);if(p.kind==='segment')return add(p.a,scale(p.dir,t));const a=t/p.r;return add(p.center,scale(add(scale(p.u,Math.cos(a)),scale(p.v,Math.sin(a))),p.r));};
 const tangent=(s:number):V=>{const {p,t}=locate(s);if(p.kind==='segment')return p.dir;const a=t/p.r;return add(scale(p.u,-Math.sin(a)),scale(p.v,Math.cos(a)));};
 const curvature=(s:number)=>{const {p}=locate(s);return p.kind==='segment'?0:1/p.r;};
 let binormal:(s:number)=>V;
 if(planar)binormal=()=>Z;
 else if(axisHint){const a=unit(axisHint);binormal=s=>{const t=tangent(s),b=add(a,scale(t,-dot(a,t)));if(norm(b)<1e-6)throw Error('Pfadachse liegt parallel zur Pfadtangente.');return unit(b);};}
 else {
  // Rotation-minimising frame by double reflection on a fine sampling.
  const steps=Math.max(64,Math.ceil(length/2)),table:V[]=[];let t0=tangent(0),seed:V=Math.abs(t0[2])<.9?[0,0,1]:[1,0,0],b=unit(add(seed,scale(t0,-dot(seed,t0))));table.push(b);
  for(let i=1;i<=steps;i++){const s1=length*i/steps,s_=length*(i-1)/steps,p0=point(s_),p1=point(s1),t1=tangent(s1),v1=add(p1,scale(p0,-1)),c1=dot(v1,v1);
   if(c1<1e-18){table.push(b);continue;}const bL=add(b,scale(v1,-2*dot(v1,b)/c1)),tL=add(t0,scale(v1,-2*dot(v1,t0)/c1)),v2=add(t1,scale(tL,-1)),c2=dot(v2,v2);b=c2<1e-18?bL:add(bL,scale(v2,-2*dot(v2,bL)/c2));b=unit(add(b,scale(t1,-dot(b,t1))));t0=t1;table.push(b);}
  binormal=s=>{const x=closed?wrap(s,length):Math.max(0,Math.min(length,s)),f=x/length*steps,i=Math.min(steps-1,Math.floor(f)),w=f-i,t=tangent(s),m=add(scale(table[i],1-w),scale(table[i+1],w));return unit(add(m,scale(t,-dot(m,t))));};
 }
 const normal=(s:number):V=>cross(binormal(s),tangent(s));
 return {length,closed,planar,point,tangent,normal,curvature,frame:s=>frameFromBasis(point(s),tangent(s),normal(s),binormal(s))};
}

/** Periodic cubic spline through samples at equal angular steps. */
function periodicSpline(y:number[]){
 const n=y.length;if(n<4)throw Error('Polarkurve braucht mindestens vier Stützwerte.');const h=TAU/n;
 // Solve for second derivatives M: M[i-1]+4M[i]+M[i+1] = 6/h² (y[i-1]-2y[i]+y[i+1]), cyclic.
 const rhs=y.map((_,i)=>6/(h*h)*(y[(i-1+n)%n]-2*y[i]+y[(i+1)%n]));
 // The cyclic system is strictly diagonally dominant (4 against 1+1), so
 // Gauss–Seidel from the trivial start converges geometrically.
 const M=rhs.map(r=>r/4);
 for(let it=0;it<400;it++){let delta=0;for(let i=0;i<n;i++){const v=(rhs[i]-M[(i-1+n)%n]-M[(i+1)%n])/4;delta=Math.max(delta,Math.abs(v-M[i]));M[i]=v;}if(delta<1e-14)break;}
 return (theta:number)=>{const x=wrap(theta,TAU),f=x/h,i=Math.floor(f)%n,j=(i+1)%n,t=f-i,a=1-t,y0=y[i],y1=y[j],m0=M[i],m1=M[j];
  const r=a*y0+t*y1+((a*a*a-a)*m0+(t*t*t-t)*m1)*h*h/6;
  const dr=(y1-y0)/h+((-(3*a*a-1))*m0+(3*t*t-1)*m1)*h/6;
  const ddr=a*m0+t*m1;return {r,dr,ddr};};
}
function polar(samples:number[]):CurveFn{
 if(samples.some(r=>!(r>0)))throw Error('Polarkurve braucht positive Radien.');
 const spline=periodicSpline(samples),fine=Math.max(2048,samples.length*16),ds:number[]=[0];
 const speed=(theta:number)=>{const {r,dr}=spline(theta);return Math.hypot(r,dr);};
 for(let i=1;i<=fine;i++){const a=TAU*(i-1)/fine,b=TAU*i/fine;ds.push(ds[i-1]+(b-a)/6*(speed(a)+4*speed((a+b)/2)+speed(b)));}
 const length=ds[fine];
 const theta=(s:number)=>{const x=wrap(s,length);let lo=0,hi=fine;while(lo<hi){const mid=(lo+hi+1)>>1;if(ds[mid]<=x)lo=mid;else hi=mid-1;}let t=TAU*lo/fine+(x-ds[lo])/speed(TAU*lo/fine);for(let k=0;k<3;k++){const a=TAU*lo/fine,b=t,est=ds[lo]+(b-a)/6*(speed(a)+4*speed((a+b)/2)+speed(b));t-=(est-x)/speed(t);}return t;};
 const at=(s:number)=>{const th=theta(s),{r,dr,ddr}=spline(th),c=Math.cos(th),sn=Math.sin(th),tx=dr*c-r*sn,ty=dr*sn+r*c,l=Math.hypot(tx,ty);return {r,dr,ddr,c,sn,t:[tx/l,ty/l,0] as V};};
 return {length,closed:true,planar:true,
  point:s=>{const {r,c,sn}=at(s);return [r*c,r*sn,0];},
  tangent:s=>at(s).t,
  normal:s=>{const {t}=at(s);return [-t[1],t[0],0];},
  curvature:s=>{const {r,dr,ddr}=at(s);return (r*r+2*dr*dr-r*ddr)/Math.pow(r*r+dr*dr,1.5);},
  frame(s){const {r,c,sn,t}=at(s);return frameFromBasis([r*c,r*sn,0],t,[-t[1],t[0],0],Z);},
  polar:th=>spline(th)};
}

const cache=new WeakMap<object,CurveFn>();
/** Evaluates a curve description. Results are cached per description object. */
export function curve(c:Curve):CurveFn{
 const hit=cache.get(c);if(hit)return hit;let fn:CurveFn;
 switch(c.kind){
  case 'circle':fn=circle(c.r);break;
  case 'line':fn=line(c.length);break;
  case 'polyline':fn=pieceCurve(pieces(c.points.map(p=>[p[0],p[1],0] as V),c.closed,c.cornerRadius),c.closed,true);break;
  case 'polar':fn=polar(c.samples);break;
  case 'path':fn=pieceCurve(pieces(c.points,c.closed,c.cornerRadius),c.closed,false,c.axis);break;
  default:throw Error('Unbekannte Kurvenart.');
 }
 cache.set(c,fn);return fn;
}
/** Points at equal arc length; closed curves omit the repeated end point. */
export function sample(fn:CurveFn,n:number){if(!Number.isFinite(fn.length))throw Error('Unendliche Kurve lässt sich nicht abtasten.');const count=fn.closed?n:n-1;return Array.from({length:n},(_,i)=>fn.point(fn.length*i/count));}
/** Resamples a closed planar curve as a polar curve about the origin.
 * Throws when a ray from the origin crosses the curve more than once. */
export function toPolar(fn:CurveFn,n=360):Curve2{
 if(!fn.closed||!fn.planar)throw Error('Nur geschlossene ebene Kurven haben eine Polardarstellung.');
 const fine=Math.max(4*n,1024),th:number[]=[],rs:number[]=[];let prev=0,acc=0;
 for(let i=0;i<=fine;i++){const p=fn.point(fn.length*i/fine),a=Math.atan2(p[1],p[0]);let d=a-prev;if(i){d=((d+Math.PI)%TAU+TAU)%TAU-Math.PI;if(d<=0)throw Error('Kurve ist nicht sternförmig um die Achse.');acc+=d;}else acc=a;prev=a;th.push(acc);rs.push(Math.hypot(p[0],p[1]));}
 if(Math.abs(acc-th[0]-TAU)>1e-6)throw Error('Kurve umläuft die Achse nicht genau einmal.');
 const samples:number[]=[];for(let k=0;k<n;k++){const target=th[0]+TAU*k/n;let lo=0,hi=fine;while(lo<hi){const mid=(lo+hi+1)>>1;if(th[mid]<=target)lo=mid;else hi=mid-1;}const j=Math.min(fine,lo+1),w=th[j]===th[lo]?0:(target-th[lo])/(th[j]-th[lo]);samples.push(rs[lo]*(1-w)+rs[j]*w);}
 return {kind:'polar',samples};
}
