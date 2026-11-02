// Planetary stage of LEGO parts (demo Planetengetriebe): sun z16, three planets z40, a printed ring gear z96. The
// mechanism closes over the whole range at 1 : 7, the trains held by their rates close too; the ring is one closed
// part whose gaps leave every planet tooth room; the bearings: input and output in the frame, each planet axle in two
// plain bearings of the one-sided carrier, the carrier on the output axle by a cross hole, the ring on four heat-set
// inserts; frame and carrier keep clear of the ring and its lugs. OUT=dir writes ring, carrier and frame as STL.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {adopted} from '../structure/adopted.mjs';
import {heldTrains} from '../../src/mechanics/kinematics/drive.ts';
import {solve} from '../../src/mechanics/kinematics/solver.ts';
import {planBearings,applyBearings} from '../../src/mechanics/kinematics/bearings.ts';
import {linkStructures} from '../../src/mechanics/kinematics/link-structure.ts';
import {partMesh} from '../../src/mechanics/kinematics/generate/part.ts';
import {watertight,volume,stl} from '../../src/mechanics/kinematics/generate/mesh.ts';
import {involuteOutline} from '../../src/mechanics/kinematics/generate/involute.ts';
import {compose,inverse} from '../../src/mechanics/kinematics/math.ts';
import {stlBinary} from '../../src/structure/mesh.ts';
const {mechanism:m,drives,asset,fabrication}=await adopted('planet'),assets=id=>id===asset.id?asset:undefined;
// Kinematics: free trains over the range, and held by their rates.
const free=await solve({...structuredClone(m),range:{from:-180,to:180,samples:13}},{yield:false});
assert.deepEqual(free.checks.filter(c=>c.state==='fail').map(c=>c.id),[],'Planetengetriebe geht auf');
const sun=free.poses.map(p=>p.coordinates['H1/ground/s0'][0]),out=free.poses.map(p=>p.coordinates.Abtrieb[0]),ratio=(sun.at(-1)-sun[0])/(out.at(-1)-out[0]);
assert.ok(Math.abs(ratio-7)<1e-6,`Übersetzung 1 : ${ratio}`);
for(const q of [-120,45,170]){const h=await solve({...structuredClone(m),range:{from:q,to:q,samples:1}},{yield:false,fixed:heldTrains(drives,{Abtrieb:q})});assert.ok(h.checks.every(c=>c.state!=='fail'),`mit Raten gehalten bei ${q}°`);}
// Ring gear: closed, and every planet tooth stays in a gap (involute z40 m1 as the LEGO planet) over one pitch.
const ring=partMesh(m,'hohlrad');assert.ok(watertight(ring.mesh)&&volume(ring.mesh)>0,'Hohlrad geschlossen');
{const hole=involuteOutline({module:1,teeth:96,shift:.25,backlash:2*(2*.25*Math.tan(20*Math.PI/180)-.2),samples:10}),planet=involuteOutline({module:1,teeth:40,backlash:.1,samples:10});
 const inside=(poly,x,y)=>{let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [xi,yi]=poly[i],[xj,yj]=poly[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)c=!c;}return c;};
 const seg=(px,py,[ax,ay],[bx,by])=>{const dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/(dx*dx+dy*dy)));return Math.hypot(px-ax-t*dx,py-ay-t*dy);};
 let best=-Infinity;for(let i=0;i<40;i++){const phase=i/40*2*Math.PI/40;let worst=Infinity;
  for(let k=0;k<=30;k++){const psi=k/30*2*Math.PI/96,phi=psi*96/40+phase;for(const [x,y] of planet){const X=28+x*Math.cos(phi)-y*Math.sin(phi),Y=x*Math.sin(phi)+y*Math.cos(phi),xr=X*Math.cos(-psi)-Y*Math.sin(-psi),yr=X*Math.sin(-psi)+Y*Math.cos(-psi);
   if(Math.hypot(xr,yr)<46)continue;let d=Infinity;for(let n=0;n<hole.length;n++)d=Math.min(d,seg(xr,yr,hole[n],hole[(n+1)%hole.length]));worst=Math.min(worst,inside(hole,xr,yr)?d:-d);}}
  best=Math.max(best,worst);}
 assert.ok(best>.05,`Planet läuft im Hohlrad mit Luft: ${best.toFixed(3)} mm`);var play=best;}
// Bearings.
const plan=planBearings(m,drives,assets,fabrication.bearings);assert.ok(plan.lines.every(l=>l.state==='pass'),plan.lines.map(l=>l.message).join(' | '));
const of=link=>plan.seats.filter(x=>x.link===link);
assert.equal(of('Steg').filter(x=>x.kind==='plain').length,6,'je Planet zwei Gleitlager im Steg');assert.ok(of('Steg').some(x=>x.kind==='hub'&&x.feature.cross),'Steg mit Kreuzbohrung');
assert.equal(of('ground').filter(x=>x.kind==='mount').length,4,'Hohlrad an vier Einpressmuttern');
assert.ok(plan.seats.every(x=>x.kind!=='plain'||x.feature.d+x.feature.clearance===5),'Gleitlager Ø5,0');
const axles=plan.bom.filter(b=>/LEGO-Kreuzachse/.test(b.label)).reduce((n,b)=>n+b.count,0);assert.equal(axles,5,'fünf LEGO-Achsen');
// Structures: frame and carrier clear of the ring and its lugs (the carrier turns: nothing of it in the ring's slab beyond the planets).
applyBearings(m,plan);const links=await linkStructures(m,drives,plan,assets,{});assert.ok(links.every(x=>x.skipped||x.result&&x.checks.every(c=>c.state!=='fail')),links.map(x=>x.error??x.link).join(', '));
const axis=compose(m.bodies.find(b=>b.id==='ground').frame,m.elements.find(e=>e.id==='hohlrad').mounts[0].pose),lugs=[45,135,225,315].map(a=>[60*Math.cos(a*Math.PI/180),60*Math.sin(a*Math.PI/180)]);
for(const x of links.filter(x=>x.result)){const frame=m.bodies.find(b=>b.id===x.link).frame,v=x.result.mesh.vertices;let hits=0;
 for(let k=0;k<v.length;k+=3){const p=compose(inverse(axis),compose(frame,{position:[v[k],v[k+1],v[k+2]],rotation:[0,0,0,1]})).position,r=Math.hypot(p[0],p[1]);
  // At the lugs the inserts bear on the ring's face (z = 4): only reaching into the lug counts.
  if(Math.abs(p[2])<4.3&&(x.link==="Steg"?r>46:r>46&&r<54.3)||x.link!=="Steg"&&Math.abs(p[2])<3.8&&lugs.some(([a,b])=>Math.hypot(p[0]-a,p[1]-b)<6.3))hits++;}
 assert.equal(hits,0,`${x.link} berührt das Hohlrad`);}
if(process.env.OUT){fs.writeFileSync(path.join(process.env.OUT,'hohlrad.stl'),stl(ring.mesh,'hohlrad'));for(const x of links.filter(x=>x.result))fs.writeFileSync(path.join(process.env.OUT,`${x.link}.stl`),stlBinary(x.result.mesh,x.link));}
console.log(`Planetengetriebe: 1 : ${ratio.toFixed(2)}, Hohlrad dicht (${(volume(ring.mesh)/1000).toFixed(1)} cm³), Luft Planet–Hohlrad ${play.toFixed(2)} mm, ${plan.seats.length} Sitze, ${links.filter(x=>x.result).map(x=>`${x.link} ${x.result.report.mass.toFixed(0)} g`).join(', ')}, Hohlrad frei.`);
