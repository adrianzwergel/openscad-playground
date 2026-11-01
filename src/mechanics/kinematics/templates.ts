// Starting documents for the Studio's mechanism editor. Raw kinematics-1
// documents: parameters may be expressions and are resolved on parsing.
import type {Mechanism,JointRelation,Body,Element} from './model.ts';
import type {Frame,V} from './math.ts';
import {identity,compose,inverse,axisAngle} from './math.ts';
import {curve,toPolar} from './curves.ts';
import {conjugate} from './conjugate.ts';

const at=(x:number,y:number,z:number,rotation:[number,number,number,number]=[0,0,0,1]):Frame=>({position:[x,y,z],rotation});

/** One shaft on a revolute joint: the smallest mechanism to start from. */
export function emptyMechanism():Mechanism{
 return {format:'kinematics-1',parameters:[],bodies:[{id:'ground',frame:identity(),ground:true},{id:'welle',frame:identity(),shaft:{diameter:5,start:-20,end:20}}],elements:[],
  joints:[{id:'lager',joint:{kind:'revolute'},a:{body:'ground',local:identity()},b:{body:'welle',local:identity()}}],contacts:[],patterns:[],
  input:{kind:'coordinate',joint:'lager',coordinate:0},output:{kind:'coordinate',joint:'lager',coordinate:0},range:{from:0,to:360,samples:13}};
}
/** Sectional garage door: three panels on rollers in a mirrored straight–arc–straight guide,
 * hinged to each other, pulled by a spindle through a link (KINEMATIK-KERN.md, case B). */
export function garageDoor():Mechanism{
 const P={torHoehe:2100,torBreite:2400,paneele:3,kurvenRadius:300,spindelSteigung:8};
 const paneelHoehe=P.torHoehe/P.paneele,zL=-P.torBreite/2;
 const guide={kind:'path' as const,points:[[0,0,zL],[0,P.torHoehe+P.kurvenRadius,zL],[P.kurvenRadius+P.torHoehe,P.torHoehe+P.kurvenRadius,zL]] as V[],closed:false,cornerRadius:P.kurvenRadius,axis:[0,0,1] as V};
 const fn=curve(guide),bodies:Body[]=[{id:'ground',frame:identity(),ground:true}],joints:JointRelation[]=[];
 const body=(id:string,frame:Frame,display?:Body['display'])=>{bodies.push({id,frame,...(display?{display}:{})});};
 const joint=(id:string,kind:'revolute'|'prismatic'|'screw',a:string,b:string,world:Frame,extra:{lead?:number}={})=>{const A=bodies.find(x=>x.id===a)!.frame,B=bodies.find(x=>x.id===b)!.frame;joints.push({id,joint:kind==='screw'?{kind,lead:extra.lead!}:{kind},a:{body:a,local:compose(inverse(A),world)},b:{body:b,local:compose(inverse(B),world)}});};
 const top=P.torHoehe,centre=top-paneelHoehe/2,sA=top,sB=top-paneelHoehe;
 body('paneel1',at(0,centre,0),{kind:'box',size:[40,paneelHoehe-6,P.torBreite]});
 body('rolle1a',fn.frame(sA),{kind:'box',size:[30,30,30]});body('rolle1b',fn.frame(sB),{kind:'box',size:[30,30,30]});
 joints.push({id:'fuehrungA',joint:{kind:'path',curve:guide,roll:'locked'},a:{body:'ground',local:identity()},b:{body:'rolle1a',local:identity()}});
 joints.push({id:'fuehrungB',joint:{kind:'path',curve:guide,roll:'locked'},a:{body:'ground',local:identity()},b:{body:'rolle1b',local:identity()}});
 joint('lagerA','revolute','rolle1a','paneel1',at(0,sA,zL));joint('lagerB','revolute','rolle1b','paneel1',at(0,sB,zL));
 const ySpindel=P.torHoehe+P.kurvenRadius+100,xNut=300,alongX=axisAngle([0,1,0],90) as [number,number,number,number];
 body('spindel',at(0,ySpindel,0,alongX),{kind:'box',size:[12,12,1200],offset:[0,0,600]});body('mutter',at(xNut,ySpindel,0),{kind:'box',size:[50,40,40]});body('koppel',at(xNut/2,(ySpindel+top)/2,0),{kind:'box',size:[20,20,20]});
 joint('spindellager','revolute','ground','spindel',at(0,ySpindel,0,alongX));
 joint('mutterfuehrung','prismatic','ground','mutter',at(xNut,ySpindel,0,alongX));
 joint('spindel-mutter','screw','spindel','mutter',at(xNut,ySpindel,0,alongX),{lead:P.spindelSteigung});
 joint('mutter-koppel','revolute','mutter','koppel',at(xNut,ySpindel,0));
 joint('koppel-paneel','revolute','koppel','paneel1',at(0,top,0));
 const local=(y:number):Frame=>({position:[0,y-centre,0],rotation:[0,0,0,1]});
 return {format:'kinematics-1',parameters:Object.entries(P).map(([id,value])=>({id,value})),bodies,elements:[],joints,contacts:[],
  patterns:[
   {kind:'array',count:P.paneele,step:{alongJoint:'fuehrungA',offset:-paneelHoehe},source:['paneel1','rolle1a','rolle1b','fuehrungA','fuehrungB','lagerA','lagerB'],
    chain:[{id:'scharnier',joint:{kind:'revolute'},a:{body:'paneel1',local:local(centre-paneelHoehe/2)},b:{body:'paneel1',local:local(centre+paneelHoehe/2)}}]},
   {kind:'mirror',plane:identity(),source:['rolle1a','rolle1b','fuehrungA','fuehrungB','lagerA','lagerB']}],
  input:{kind:'coordinate',joint:'spindellager',coordinate:0},output:{kind:'coordinate',joint:'fuehrungA',coordinate:0},
  range:{from:0,to:-(fn.length-200-sA)/P.spindelSteigung*360,samples:30}};
}

/** A carriage runs on a straight–arc–straight guide; its pinion rolls on a rail along the guide. */
export function pinionOnRail():Mechanism{
 const m=2,zp=20,ra=m*zp/2,guide={kind:'path' as const,points:[[0,0,0],[0,200,0],[200,200,0]] as V[],closed:false,cornerRadius:120,axis:[0,0,1] as V};
 const fn=curve(guide),s0=40,start=fn.frame(s0),centre=compose(start,{position:[0,ra,0],rotation:[0,0,0,1]});
 return {format:'kinematics-1',parameters:[],patterns:[],
  bodies:[{id:'ground',frame:identity(),ground:true},{id:'wagen',frame:start,display:{kind:'box',size:[40,10,30],offset:[0,-8,0]}},{id:'ritzel',frame:centre}],
  joints:[{id:'schiene',joint:{kind:'path',curve:guide,roll:'locked'},a:{body:'ground',local:identity()},b:{body:'wagen',local:identity()}},
   {id:'achse',joint:{kind:'revolute'},a:{body:'wagen',local:{position:[0,ra,0],rotation:[0,0,0,1]}},b:{body:'ritzel',local:identity()}}],
  elements:[{id:'ritzel',source:{kind:'printed'},surfaces:[{id:'teeth',pitch:{kind:'circle',r:ra},profile:{kind:'involute',module:m,pressureAngle:20,backlash:.15},z:[-5,5],side:'external'}],interfaces:[{id:'bore',kind:'bore',diameter:5,z:[-5,5]}],envelope:{radius:ra+m,min:-5,max:5},mounts:[{interface:'bore',body:'ritzel',pose:identity()}],phase:0},
   {id:'zahnstange',source:{kind:'printed'},surfaces:[{id:'teeth',pitch:guide,profile:{kind:'involute',module:m,pressureAngle:20,backlash:.15},z:[-6,6],side:'external'}],interfaces:[{id:'flange',kind:'flange',frame:identity()}],envelope:{radius:0,min:-6,max:6},mounts:[{interface:'flange',body:'ground',pose:identity()}],phase:0}],
  contacts:[{id:'eingriff',kind:'roll',mode:'follower',a:{element:'ritzel',surface:'teeth'},b:{element:'zahnstange',surface:'teeth'},params:{offsetA:0,offsetB:0,side:1}}],
  input:{kind:'coordinate',joint:'achse',coordinate:0},output:{kind:'coordinate',joint:'schiene',coordinate:0},range:{from:0,to:-1000,samples:41}};
}
/** Two rounded-triangle wheels at 1:1; B is generated from A, the ratio varies three times per turn. */
export function noncircularPair():Mechanism{
 const tri=curve({kind:'polyline',points:[[40,0],[-20,34.641016],[-20,-34.641016]],closed:true,cornerRadius:14}),pitchA=toPolar(tri,720),fnA=curve(pitchA),c=conjugate(fnA,{p:1,q:1},720);
 const teethA=Math.round(fnA.length/(Math.PI*1.5)/3)*3,module=fnA.length/(Math.PI*teethA),flipped:Frame={position:[c.centerDistance,0,0],rotation:axisAngle([0,0,1],180) as Frame['rotation']};
 const wheel=(id:string,body:string,pitch:Element['surfaces'][number]['pitch'],profile:Element['surfaces'][number]['profile']):Element=>({id,source:{kind:'printed'},surfaces:[{id:'teeth',pitch,profile,z:[-4,4],side:'external'}],interfaces:[{id:'bore',kind:'bore',diameter:5,z:[-4,4]}],envelope:{radius:60,min:-4,max:4},mounts:[{interface:'bore',body,pose:identity()}],phase:0});
 return {format:'kinematics-1',parameters:[],patterns:[],
  bodies:[{id:'ground',frame:identity(),ground:true},{id:'A',frame:identity(),shaft:{diameter:5,start:-15,end:15}},{id:'B',frame:flipped,shaft:{diameter:5,start:-15,end:15}}],
  joints:[{id:'lagerA',joint:{kind:'revolute'},a:{body:'ground',local:identity()},b:{body:'A',local:identity()}},{id:'lagerB',joint:{kind:'revolute'},a:{body:'ground',local:flipped},b:{body:'B',local:identity()}}],
  elements:[wheel('radA','A',pitchA,{kind:'involute',module,pressureAngle:20,backlash:.15}),wheel('radB','B',c.mate,{kind:'generated',from:{element:'radA',surface:'teeth'}})],
  contacts:[{id:'abrollen',kind:'roll',mode:'fixed-axes',a:{element:'radA',surface:'teeth'},b:{element:'radB',surface:'teeth'},params:{offsetA:0,offsetB:0,distance:c.centerDistance}}],
  input:{kind:'coordinate',joint:'lagerA',coordinate:0},output:{kind:'coordinate',joint:'lagerB',coordinate:0},range:{from:0,to:360,samples:73}};
}
export const templates={empty:{label:'Leerer Mechanismus',build:emptyMechanism},garage:{label:'Garagentor (Vorlage)',build:garageDoor},rail:{label:'Ritzel auf gebogener Zahnstange (Vorlage)',build:pinionOnRail},noncircular:{label:'Unrundes Zahnradpaar (Vorlage)',build:noncircularPair}};
