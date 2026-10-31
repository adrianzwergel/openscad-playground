// Loop solver: gear pair transfer, slider crank against closed form, redundant
// mirrored copies and mobility diagnosis.
import assert from 'node:assert/strict';
import {solve} from '../../src/mechanics/kinematics/solver.ts';
import {spurSurface} from '../../src/mechanics/kinematics/surfaces.ts';
import {identity,axisAngle,compose} from '../../src/mechanics/kinematics/math.ts';

const close=(a,b,tol,what)=>assert.ok(Math.abs(a-b)<=tol,`${what}: ${a} vs ${b}`);
const ground={id:'ground',frame:identity(),ground:true};
const at=(x,y,z=0,rot=[0,0,0,1])=>({position:[x,y,z],rotation:rot});
const rev=(id,a,aLocal,b,bLocal=identity())=>({id,joint:{kind:'revolute'},a:{body:a,local:aLocal},b:{body:b,local:bLocal}});
const gear=(id,body,module,teeth,width,pose=identity())=>({id,source:{kind:'printed'},surfaces:[spurSurface('teeth',module,teeth,width)],interfaces:[{id:'bore',kind:'bore',diameter:5,z:[-width/2,width/2]}],envelope:{radius:module*teeth/2+2,min:-width/2,max:width/2},mounts:[{interface:'bore',body,pose}],phase:0});
const doc=(parts)=>({format:'kinematics-1',parameters:[],patterns:[],contacts:[],elements:[],...parts});

// Gear pair 20:40 on fixed axes: closure, mobility and the constant transfer, also along a swept range.
{const m=doc({bodies:[ground,{id:'s0',frame:at(0,0)},{id:'s1',frame:at(60,0)}],joints:[rev('g0','ground',at(0,0),'s0'),rev('g1','ground',at(60,0),'s1')],
  elements:[gear('a','s0',2,20,10),gear('b','s1',2,40,10)],contacts:[{id:'c',kind:'roll',a:{element:'a',surface:'teeth'},b:{element:'b',surface:'teeth'},mode:'fixed-axes',params:{offsetA:0,offsetB:0}}],
  input:{kind:'coordinate',joint:'g0',coordinate:0},output:{kind:'coordinate',joint:'g1',coordinate:0},range:{from:0,to:180,samples:7},target:{kind:'ratio',value:2,tolerance:.01}});
 const r=await solve(m,{yield:false});
 assert.equal(r.checks.find(c=>c.id==='closure').state,'pass');assert.equal(r.checks.find(c=>c.id==='mobility').state,'pass',r.mobility.message);
 close(r.transfer.constant,-.5,1e-12,'analytic ratio');assert.equal(r.checks.find(c=>c.id==='target').state,'pass');
 r.transfer.samples.forEach(s=>close(s.output-r.transfer.samples[0].output,-.5*s.input,1e-6,'rolling at '+s.input));
 // Wrong centre distance cannot close.
 const bad=structuredClone(m);bad.joints[1].a.local=at(70,0);bad.bodies[2].frame=at(70,0);const rb=await solve(bad,{yield:false});assert.equal(rb.checks.find(c=>c.id==='closure').state,'fail');}

// Slider crank: crank 30, rod 100; slider position x = r cos θ + sqrt(L² − r² sin² θ).
const crank=(mirrorToo=false)=>{const r=30,L=100,x0=r+L;
 const m=doc({bodies:[ground,{id:'crank',frame:at(0,0)},{id:'rod',frame:at(r,0)},{id:'slider',frame:at(x0,0)}],
  joints:[rev('a','ground',at(0,0),'crank'),rev('b','crank',at(r,0),'rod'),rev('c','rod',at(L,0),'slider'),{id:'d',joint:{kind:'prismatic'},a:{body:'ground',local:at(0,0,0,axisAngle([0,1,0],90))},b:{body:'slider',local:at(0,0,0,axisAngle([0,1,0],90))}}],
  input:{kind:'coordinate',joint:'a',coordinate:0},output:{kind:'coordinate',joint:'d',coordinate:0},range:{from:0,to:360,samples:25}});
 if(mirrorToo)m.patterns=[{kind:'mirror',plane:at(0,0,0,axisAngle([1,0,0],90)),source:['crank','rod','slider','a','b','c','d']}];
 return {m,r,L,x0};};
{const {m,r,L,x0}=crank();const s=await solve(m,{yield:false});
 assert.equal(s.checks.find(c=>c.id==='closure').state,'pass',s.checks.find(c=>c.id==='closure').message);
 assert.equal(s.checks.find(c=>c.id==='mobility').state,'pass',s.mobility.message);assert.equal(s.transfer.constant,undefined,'no constant ratio through a linkage');
 for(const {input,output} of s.transfer.samples){const th=input*Math.PI/180,x=r*Math.cos(th)+Math.sqrt(L*L-r*r*Math.sin(th)**2);close(output,x,1e-5,'slider at '+input);}}
{const {m}=crank(true);const s=await solve(m,{yield:false});
 assert.equal(s.checks.find(c=>c.id==='closure').state,'pass');const red=s.checks.filter(c=>c.id.startsWith('redundant/'));assert.equal(red.length,4,'four mirrored joints checked');red.forEach(c=>assert.equal(c.state,'pass',c.message));}

// Missing joint: a free body is reported, not silently placed.
{const {m}=crank();m.joints=m.joints.filter(j=>j.id!=='c');const s=await solve(m,{yield:false});assert.equal(s.checks.find(c=>c.id==='mobility').state,'fail');assert.ok(s.mobility.freedom>0);}

// Design variable: the second axis position is found so the pair meshes.
{const m=doc({bodies:[ground,{id:'s0',frame:at(0,0)},{id:'s1',frame:at(55,10)}],joints:[rev('g0','ground',at(0,0),'s0'),rev('g1','ground',at(55,10),'s1')],
  elements:[gear('a','s0',2,20,10),gear('b','s1',2,40,10)],contacts:[{id:'c',kind:'roll',a:{element:'a',surface:'teeth'},b:{element:'b',surface:'teeth'},mode:'fixed-axes',params:{offsetA:0,offsetB:0}}],
  input:{kind:'coordinate',joint:'g0',coordinate:0},output:{kind:'coordinate',joint:'g1',coordinate:0},range:{from:0,to:0,samples:1}});
 const v=[{id:'x',get:m=>m.joints[1].a.local.position[0],set:(m,x)=>{m.joints[1].a.local.position[0]=x;},lo:0,hi:200}];
 const s=await solve(m,{variables:v,yield:false});assert.equal(s.checks.find(c=>c.id==='closure').state,'pass',s.checks.find(c=>c.id==='closure').message);
 close(Math.hypot(s.mechanism.joints[1].a.local.position[0],10),60,1e-5,'centre distance solved');}
console.log('Kinematics solver: gear pair, slider crank, mirrored redundancy, mobility and design variables passed.');
