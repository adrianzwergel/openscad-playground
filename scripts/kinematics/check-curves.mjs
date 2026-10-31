// Pitch curves: closed formulas, rounded polylines, polar splines and paths in
// space agree with each other and with geometry computed by hand.
import assert from 'node:assert/strict';
import {curve,sample,toPolar} from '../../src/mechanics/kinematics/curves.ts';
import {lcg,norm,dot,cross,rotate,TAU} from '../../src/mechanics/kinematics/math.ts';

const close=(a,b,tol,what)=>assert.ok(Math.abs(a-b)<=tol,`${what}: ${a} vs ${b}`);
const closeV=(a,b,tol,what)=>a.forEach((n,i)=>close(n,b[i],tol,what+'['+i+']'));
const orthonormal=(f,what)=>{const x=rotate(f.rotation,[1,0,0]),y=rotate(f.rotation,[0,1,0]),z=rotate(f.rotation,[0,0,1]);close(norm(x),1,1e-9,what+' |x|');close(dot(x,y),0,1e-9,what+' x·y');closeV(cross(x,y),z,1e-9,what+' x×y=z');return {x,y,z};};

// Circle: arc length parametrisation, inward normal, curvature 1/r.
{const r=17.5,c=curve({kind:'circle',r});close(c.length,TAU*r,1e-12,'circle length');
 for(const s of [0,3,r*Math.PI,c.length-1e-9]){const p=c.point(s),t=c.tangent(s),n=c.normal(s);close(norm(p),r,1e-9,'on circle');close(dot(p,t),0,1e-9,'tangent ⟂ radius');closeV(n,p.map(x=>-x/r),1e-9,'normal inward');close(c.curvature(s),1/r,1e-12,'curvature');const f=orthonormal(c.frame(s),'circle frame');closeV(f.x,t,1e-9,'frame x = tangent');}
 close(c.polar(1.2).r,r,1e-12,'polar radius');}

// Rounded square: length and curvature by hand; corner errors are reported.
{const L=50,rho=8,sq=curve({kind:'polyline',points:[[0,0],[L,0],[L,L],[0,L]],closed:true,cornerRadius:rho});
 close(sq.length,4*(L-2*rho)+TAU*rho,1e-9,'rounded square length');
 close(sq.curvature(L/2-rho),0,1e-12,'straight part');close(sq.curvature(L-2*rho+rho*Math.PI/4),1/rho,1e-12,'arc part');
 closeV(sq.point(0),[rho,0,0],1e-9,'start after first cut');closeV(sq.tangent(0),[1,0,0],1e-9,'start direction');
 closeV(sq.point(L-2*rho+rho*Math.PI/2),[L,rho,0],1e-9,'arc end');closeV(sq.tangent(L-2*rho+rho*Math.PI/2),[0,1,0],1e-9,'arc end direction');
 closeV(sq.normal(1),[0,1,0],1e-9,'left normal is inside for ccw');
 assert.throws(()=>curve({kind:'polyline',points:[[0,0],[10,0],[10,10]],closed:false,cornerRadius:0}),/Eckenradius/);
 assert.throws(()=>curve({kind:'polyline',points:[[0,0],[10,0],[10,10]],closed:false,cornerRadius:20}),/zu groß/);
 const open=curve({kind:'polyline',points:[[0,0],[10,0],[10,10]],closed:false,cornerRadius:3});close(open.length,7+7+3*Math.PI/2,1e-9,'open polyline length');closeV(open.point(open.length),[10,10,0],1e-9,'open end');}

// Polar spline of a circle reproduces the circle; of an ellipse reproduces the ellipse.
{const r=12,c=curve({kind:'polar',samples:Array.from({length:36},()=>r)});close(c.length,TAU*r,1e-6,'polar circle length');for(const s of [0,5,40]){close(norm(c.point(s)),r,1e-9,'polar circle radius');close(c.curvature(s),1/r,1e-9,'polar circle curvature');}
 const a=30,e=.4,p=a*(1-e*e),ell=curve({kind:'polar',samples:Array.from({length:180},(_,i)=>p/(1+e*Math.cos(TAU*i/180)))});
 // Perimeter of an ellipse (Ramanujan) with b = a√(1-e²).
 const b=a*Math.sqrt(1-e*e),h=((a-b)/(a+b))**2,perimeter=Math.PI*(a+b)*(1+3*h/(10+Math.sqrt(4-3*h)));close(ell.length,perimeter,perimeter*1e-5,'ellipse perimeter');
 const {r:r0,dr:d0,ddr:dd0}=ell.polar(0);close(r0,p/(1+e),1e-9,'ellipse r(0)');close(d0,0,1e-6,'ellipse r\'(0)');close(dd0,p*e/(1+e)**2,1e-3,'ellipse r\'\'(0)');
 // Curvature at the vertex of an ellipse is a/b².
 close(ell.curvature(0),a/(b*b),2e-4,'ellipse vertex curvature');}

// Polar form of a rounded triangle is star shaped; a circle offset beyond its radius is not.
{const tri=curve({kind:'polyline',points:[[40,0],[-20,34.641],[-20,-34.641]],closed:true,cornerRadius:12});const pol=curve(toPolar(tri,360));close(pol.length,tri.length,tri.length*1e-3,'polar triangle length');
 const off=curve({kind:'polyline',points:[[30,0],[50,0],[50,20],[30,20]],closed:true,cornerRadius:4});assert.throws(()=>toPolar(off),/sternförmig|umläuft/);}

// Path in space: garage track straight–arc–straight with a preferred axis.
{const H=2100,R=300,track=curve({kind:'path',points:[[0,0,0],[0,H+R,0],[R+H,H+R,0]],closed:false,cornerRadius:R,axis:[0,0,1]});
 close(track.length,H+Math.PI*R/2+H,1e-9,'track length');
 for(const s of [0,H/2,H+R*Math.PI/4,track.length-10]){const f=orthonormal(track.frame(s),'track frame');closeV(f.z,[0,0,1],1e-9,'axis stays z');closeV(f.x,track.tangent(s),1e-9,'frame x = tangent');}
 closeV(track.point(H+Math.PI*R/2),[R,H+R,0],1e-9,'arc end');closeV(track.tangent(track.length),[1,0,0],1e-9,'final direction');
 assert.throws(()=>curve({kind:'path',points:[[0,0,0],[0,10,0]],closed:false,cornerRadius:1,axis:[0,1,0]}).frame(5),/parallel/);}

// Rotation-minimising frame on a helix is orthonormal and continuous.
{const pts=Array.from({length:40},(_,i)=>{const t=i/39*TAU*1.5;return [50*Math.cos(t),50*Math.sin(t),20*t];}),hel=curve({kind:'path',points:pts,closed:false,cornerRadius:6});
 let prev=hel.frame(0);orthonormal(prev,'helix start');
 for(let i=1;i<=200;i++){const f=hel.frame(hel.length*i/200),b=orthonormal(f,'helix frame');const z0=rotate(prev.rotation,[0,0,1]);assert.ok(dot(b.z,z0)>.95,'binormal continuous');prev=f;}}

// Sampling: equal spacing, closed curves omit the end point.
{const c=curve({kind:'circle',r:10}),pts=sample(c,8);assert.equal(pts.length,8);close(norm(pts[2].map((x,i)=>x-pts[1][i])),2*10*Math.sin(Math.PI/8),1e-9,'equal chords');
 const random=lcg(5);for(let k=0;k<20;k++){const n=5+Math.floor(random()*8),r=5+random()*40,poly=curve({kind:'polyline',points:Array.from({length:n},(_,i)=>[r*Math.cos(TAU*i/n),r*Math.sin(TAU*i/n)]),closed:true,cornerRadius:random()*r*.2});
  const total=sample(poly,64).reduce((s,p,i,a)=>s+norm(p.map((x,j)=>x-a[(i+1)%64][j])),0);assert.ok(total<=poly.length+1e-9&&total>poly.length*.98,'polygon chord sum below arc length');}}

console.log('Kinematics curves: circle, rounded polylines, polar splines, star test, spatial paths and sampling passed.');
