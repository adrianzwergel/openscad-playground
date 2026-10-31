// Acceptance D: a non-circular pair. A rounded triangle on fixed axes at 1:1;
// centre distance by bisection, closed mate, transfer as a curve with three
// periods per turn, teeth by rolling and a mate cut by A's teeth.
import assert from 'node:assert/strict';
import {curve,toPolar} from '../../src/mechanics/kinematics/curves.ts';
import {conjugate} from '../../src/mechanics/kinematics/conjugate.ts';
import {solve} from '../../src/mechanics/kinematics/solver.ts';
import {railProfile} from '../../src/mechanics/kinematics/generate/rail.ts';
import {generateConjugate,conjugateTurn,extrudeStar} from '../../src/mechanics/kinematics/generate/hull.ts';
import {watertight,volume} from '../../src/mechanics/kinematics/generate/mesh.ts';
import {identity,axisAngle} from '../../src/mechanics/kinematics/math.ts';

const close=(a,b,tol,what)=>assert.ok(Math.abs(a-b)<=tol,`${what}: ${a} vs ${b}`);
const TAU=2*Math.PI;
// Pitch curve A: rounded triangle, circumradius 40, corner radius 14, symmetric about x.
const triangle=curve({kind:'polyline',points:[[40,0],[-20,34.641016],[-20,-34.641016]],closed:true,cornerRadius:14});
const pitchA=toPolar(triangle,720),fnA=curve(pitchA);
const c=conjugate(fnA,{p:1,q:1},720),fnB=curve(c.mate),d=c.centerDistance;
assert.ok(c.closureError<1e-3,'mate closes: '+c.closureError);
close(fnB.length,fnA.length,fnA.length*2e-3,'equal perimeters at 1:1');

// Kinematics: the loop solver rolls A on B by arc length; the curves touch on the line of centres in every pose.
const surface=(pitch)=>({id:'pitch',pitch,profile:{kind:'friction'},z:[-5,5],side:'external'});
const element=(id,pitch,body)=>({id,source:{kind:'printed'},surfaces:[surface(pitch)],interfaces:[{id:'bore',kind:'bore',diameter:5,z:[-5,5]}],envelope:{radius:60,min:-5,max:5},mounts:[{interface:'bore',body,pose:identity()}],phase:0});
const flipped={position:[d,0,0],rotation:axisAngle([0,0,1],180)};
const doc={format:'kinematics-1',parameters:[],patterns:[],bodies:[{id:'ground',frame:identity(),ground:true},{id:'A',frame:identity()},{id:'B',frame:flipped}],
 joints:[{id:'ja',joint:{kind:'revolute'},a:{body:'ground',local:identity()},b:{body:'A',local:identity()}},{id:'jb',joint:{kind:'revolute'},a:{body:'ground',local:flipped},b:{body:'B',local:identity()}}],
 elements:[element('a',pitchA,'A'),element('b',c.mate,'B')],contacts:[{id:'roll',kind:'roll',mode:'fixed-axes',a:{element:'a',surface:'pitch'},b:{element:'b',surface:'pitch'},params:{offsetA:0,offsetB:0,distance:d}}],
 input:{kind:'coordinate',joint:'ja',coordinate:0},output:{kind:'coordinate',joint:'jb',coordinate:0},range:{from:0,to:360,samples:73}};
const s=await solve(doc,{yield:false});
assert.equal(s.checks.find(x=>x.id==='closure').state,'pass',s.checks.find(x=>x.id==='closure').message);
assert.equal(s.checks.find(x=>x.id==='mobility').state,'pass',s.mobility.message);
assert.equal(s.transfer.constant,undefined,'no constant ratio');
const out=s.transfer.samples.map(p=>p.output-s.transfer.samples[0].output);
close(out.at(-1),-360,.5,'one output turn per input turn');
for(const {input,output} of s.transfer.samples){
 const phi=input*Math.PI/180,beta=Math.PI-conjugateTurn(fnA.arcAt,fnB.arcAt,phi,fnB.length);
 close(output-s.transfer.samples[0].output,-beta*180/Math.PI,.05,'solver matches arc-length rolling at '+input);
 // A's contact sits at polar angle −φ, B's at β; both radii add up to the centre distance.
 close(fnA.polar(-phi).r+fnB.polar(beta).r,d,.02,'pitch curves touch at '+input);
}
// Transfer curve: three periods per turn and a clearly varying ratio.
const rate=x=>{const i=s.transfer.samples.findIndex(p=>p.input>=x);const a=s.transfer.samples[i],b=s.transfer.samples[i+1];return (b.output-a.output)/(b.input-a.input);};
for(const x of [10,35,70,95])close(rate(x),rate(x+120),.02,'period 120° at '+x);
const rates=s.transfer.samples.slice(0,-1).map((_,i)=>rate(s.transfer.samples[i].input));assert.ok(Math.max(...rates)-Math.min(...rates)>.2,'ratio varies: '+(Math.max(...rates)-Math.min(...rates)).toFixed(3));
// A requested ratio curve is checked against the solved curve.
{const m=structuredClone(doc);m.target={kind:'profile',samples:s.transfer.samples.map(p=>({input:p.input,output:p.output})),tolerance:.01};const t=await solve(m,{yield:false});assert.equal(t.checks.find(x=>x.id==='target').state,'pass');
 m.target={kind:'profile',samples:[{input:0,output:0},{input:360,output:-360}],tolerance:.5};const u=await solve(m,{yield:false});assert.equal(u.checks.find(x=>x.id==='target').state,'fail','a straight 1:1 curve does not fit the triangle pair');}

// Teeth: a z12 pinion cutter rolls around A; A's toothed outline then cuts B.
const teeth=Math.round(fnA.length/(Math.PI*1.5)/3)*3,module=fnA.length/(Math.PI*teeth);
const railA=railProfile({path:pitchA,module,pinionTeeth:12,side:-1,from:0,to:fnA.length,width:8,step:.04,poseStep:.06});
const outlineA=railA.s.map((t,i)=>{const q=fnA.point(t),n=fnA.normal(t),h=-railA.top[i];return [q[0]+n[0]*h,q[1]+n[1]*h];});
let risingA=0;for(let i=1;i<railA.s.length;i++)if(railA.top[i-1]<0&&railA.top[i]>=0)risingA++;
assert.ok(Math.abs(risingA-teeth)<=1,`A has ${risingA} teeth, expected ${teeth}`);
const mate=generateConjugate({cutter:outlineA,arcA:fnA.arcAt,arcB:fnB.arcAt,lengthB:fnB.length,radiusB:t=>fnB.polar(t).r,centerDistance:d,addendum:module,dedendum:1.25*module});
let risingB=0;for(let k=0;k<mate.radius.length;k++){const a=mate.radius[(k-1+mate.radius.length)%mate.radius.length]-fnB.polar(mate.theta[(k-1+mate.radius.length)%mate.radius.length]).r,b=mate.radius[k]-fnB.polar(mate.theta[k]).r;if(a<0&&b>=0)risingB++;}
assert.ok(Math.abs(risingB-teeth)<=1,`B has ${risingB} teeth, expected ${teeth}`);
// Independent interference check at poses between the generating ones.
let worst=0;
for(let phi=.0013;phi<TAU;phi+=.0371){const beta=conjugateTurn(fnA.arcAt,fnB.arcAt,phi,fnB.length),ca=Math.cos(phi),sa=Math.sin(phi),cb=Math.cos(-beta),sb=Math.sin(-beta);
 for(const [x,y] of outlineA){const wx=x*ca-y*sa-d,wy=x*sa+y*ca,px=wx*cb-wy*sb,py=wx*sb+wy*cb,r=Math.hypot(px,py),t=((Math.atan2(py,px)%TAU)+TAU)%TAU,n=mate.radius.length,k=Math.floor(t/TAU*n);
  if(r>Math.max(...[-1,0,1,2].map(o=>mate.radius[(k+o+n)%n])))continue;
  // Inside B (ray from the axis meets B's outline beyond the point) → depth = distance to B's nearest edge.
  const f=t/TAU*n,i=Math.floor(f)%n,j=(i+1)%n,R=Math.min(mate.radius[i],mate.radius[j]);if(r>=R)continue;
  let dmin=Infinity;for(let o=-40;o<=40;o++){const a2=(k+o+n)%n,b2=(a2+1)%n,[ax,ay]=mate.outline[a2],[bx,by]=mate.outline[b2],ex=bx-ax,ey=by-ay,l=ex*ex+ey*ey,u=l?Math.max(0,Math.min(1,((px-ax)*ex+(py-ay)*ey)/l)):0;dmin=Math.min(dmin,Math.hypot(px-ax-u*ex,py-ay-u*ey));}
  worst=Math.max(worst,dmin);}}
assert.ok(worst<.03,'A cuts into B by '+worst.toFixed(4)+' mm');
for(const [name,outline] of [['A',outlineA],['B',mate.outline]]){const mesh=extrudeStar(outline,0,8);assert.ok(watertight(mesh),name+' mesh closed');assert.ok(volume(mesh)>0,name+' outward');}
console.log(`Kinematics non-circular: rounded triangle at 1:1, centre distance ${d.toFixed(3)} mm, ${teeth} teeth of module ${module.toFixed(3)} on both wheels, transfer curve with three periods, no interference.`);
