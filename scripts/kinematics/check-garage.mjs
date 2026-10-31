// Acceptance B: a sectional garage door. Three panels on rollers in a mirrored
// straight–arc–straight guide, hinged to each other, pulled by a spindle through
// a link. The loop mechanism must close in every position with one degree of
// freedom and give the motor-to-door transfer as a curve.
import assert from 'node:assert/strict';
import {solve} from '../../src/mechanics/kinematics/solver.ts';
import {curve} from '../../src/mechanics/kinematics/curves.ts';
import {identity,compose,inverse,axisAngle,rotate} from '../../src/mechanics/kinematics/math.ts';

const P={torHoehe:2100,torBreite:2400,paneele:3,kurvenRadius:300,rollenRadius:20,spindelSteigung:8};
P.paneelHoehe=P.torHoehe/P.paneele;P.lagerAbstand=P.paneelHoehe;  // rollers on the hinge lines, as on a sectional door
const zL=-P.torBreite/2;
// Guide: up the wall, quarter arc, along the ceiling. The roller axis is the door width (z).
const guide={kind:'path',points:[[0,0,zL],[0,P.torHoehe+P.kurvenRadius,zL],[P.kurvenRadius+P.torHoehe,P.torHoehe+P.kurvenRadius,zL]],closed:false,cornerRadius:P.kurvenRadius,axis:[0,0,1]};
const guideFn=curve(guide);
const at=(x,y,z,rot=[0,0,0,1])=>({position:[x,y,z],rotation:rot});
const bodies=[{id:'ground',frame:identity(),ground:true}];
const joints=[];
const body=(id,frame)=>{bodies.push({id,frame});return id;};
/** Joint between two bodies at a world frame whose z is the axis; locals follow from the body frames. */
const joint=(id,kind,a,b,world,extra={})=>{const A=bodies.find(x=>x.id===a).frame,B=bodies.find(x=>x.id===b).frame;joints.push({id,joint:{kind,...extra},a:{body:a,local:compose(inverse(A),world)},b:{body:b,local:compose(inverse(B),world)}});};

// Panel 1 closed at the top of the wall; rollers on its top and bottom edge.
const top=P.torHoehe,centre=top-P.paneelHoehe/2,sA=centre+P.lagerAbstand/2,sB=centre-P.lagerAbstand/2;
body('paneel1',at(0,centre,0));
body('rolle1a',guideFn.frame(sA));body('rolle1b',guideFn.frame(sB));
joints.push({id:'fuehrungA',joint:{kind:'path',curve:guide,roll:'locked'},a:{body:'ground',local:identity()},b:{body:'rolle1a',local:identity()}});
joints.push({id:'fuehrungB',joint:{kind:'path',curve:guide,roll:'locked'},a:{body:'ground',local:identity()},b:{body:'rolle1b',local:identity()}});
joint('lagerA','revolute','rolle1a','paneel1',at(0,sA,zL));
joint('lagerB','revolute','rolle1b','paneel1',at(0,sB,zL));
// Drive: spindle along the ceiling, nut on a prismatic guide, link to the top edge of panel 1.
const ySpindel=P.torHoehe+P.kurvenRadius+100,xNut=300,linkLength=Math.hypot(xNut,ySpindel-top);
const alongX=axisAngle([0,1,0],90);
body('spindel',at(0,ySpindel,0,alongX));body('mutter',at(xNut,ySpindel,0));body('koppel',at(xNut/2,(ySpindel+top)/2,0));
joint('spindellager','revolute','ground','spindel',at(0,ySpindel,0,alongX));
joint('mutterfuehrung','prismatic','ground','mutter',at(xNut,ySpindel,0,alongX));
joint('spindel-mutter','screw','spindel','mutter',at(xNut,ySpindel,0,alongX),{lead:P.spindelSteigung});
joint('mutter-koppel','revolute','mutter','koppel',at(xNut,ySpindel,0));
joint('koppel-paneel','revolute','koppel','paneel1',at(0,top,0));

const panelLocal=(y)=>({position:[0,y-centre,0],rotation:[0,0,0,1]});
const doc={format:'kinematics-1',parameters:Object.entries(P).map(([id,value])=>({id,value})),bodies,elements:[],joints,contacts:[],
 patterns:[
  // Panels 2 and 3 follow the guide one panel height lower, hinged to the panel above.
  {kind:'array',count:P.paneele,step:{alongJoint:'fuehrungA',offset:-P.paneelHoehe},source:['paneel1','rolle1a','rolle1b','fuehrungA','fuehrungB','lagerA','lagerB'],
   chain:[{id:'scharnier',joint:{kind:'revolute'},a:{body:'paneel1',local:panelLocal(centre-P.paneelHoehe/2)},b:{body:'paneel1',local:panelLocal(centre+P.paneelHoehe/2)}}]},
  // The right-hand guide, rollers and bearings mirror the left-hand ones.
  {kind:'mirror',plane:identity(),source:['rolle1a','rolle1b','fuehrungA','fuehrungB','lagerA','lagerB']}],
 input:{kind:'coordinate',joint:'spindellager',coordinate:0},output:{kind:'coordinate',joint:'fuehrungA',coordinate:0},
 range:{from:0,to:-(P.torHoehe-sA+guideFn.length-P.torHoehe-P.kurvenRadius*Math.PI/2-200)/P.spindelSteigung*360,samples:30}};

const t0=performance.now();const s=await solve(doc,{yield:false});const ms=Math.round(performance.now()-t0);
const byId=id=>s.checks.find(c=>c.id===id);
assert.equal(byId('closure').state,'pass',byId('closure').message);
assert.equal(byId('mobility').state,'pass',s.mobility.message);
const redundant=s.checks.filter(c=>c.id.startsWith('redundant/'));assert.ok(redundant.length>=8,'mirrored joints are checked: '+redundant.length);
for(const c of redundant)assert.equal(c.state,'pass',c.message);
assert.equal(s.mechanism.bodies.filter(b=>b.id.startsWith('paneel1')).length,3,'three panels');
assert.equal(s.mechanism.joints.filter(j=>j.id.startsWith('scharnier')).length,2,'two hinges');
// Transfer: the door travels monotonically; the ratio changes while the top panel rounds the arc.
const out=s.transfer.samples.map(p=>p.output);
for(let i=1;i<out.length;i++)assert.ok(out[i]>out[i-1]+1,`door travel monotone at sample ${i}: ${out[i-1]} → ${out[i]}`);
const rates=out.slice(1).map((v,i)=>(v-out[i])/(s.transfer.samples[i+1].input-s.transfer.samples[i].input));
const spread=(Math.max(...rates)-Math.min(...rates))/Math.abs(rates[0]);assert.ok(spread>.02,'ratio varies through the arc: '+spread);
assert.equal(s.transfer.constant,undefined,'no constant ratio through a linkage');
// Final position: the top roller is well onto the ceiling section.
assert.ok(out.at(-1)>P.torHoehe+P.kurvenRadius*Math.PI/2,'top roller reaches the ceiling section: '+out.at(-1));
// The roller radius fits the arc.
assert.ok(P.rollenRadius<P.kurvenRadius);
console.log(`Kinematics garage door: 3 panels, 2 hinges, mirrored guides, spindle drive; closes over ${s.poses.length} positions in ${ms} ms, travel ${out[0].toFixed(0)} → ${out.at(-1).toFixed(0)} mm.`);
