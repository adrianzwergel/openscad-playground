// Demo mechanisms for the Studio, built from primitives and stored like imported
// models: links, axes and drive sources are set up, so "Getriebe finden" can run
// at once. They double as feasibility checks of the drive search:
//  - Roboterarm: three rotary axes, motors on the carrying links,
//  - CNC-Portal: three linear axes (spindles, belts or racks),
//  - Schlitten: a wagon on an up-and-down path, the motor rides on the wagon and
//    a pinion rolls on a rail along the path.
import type {V,Frame,Q} from './kinematics/math.ts';
import {identity,compose,axisAngle,inverse} from './kinematics/math.ts';
import type {Mechanism,JointRelation} from './kinematics/model.ts';
import type {Drive} from './kinematics/drive.ts';
import {toward} from './kinematics/drive.ts';
import {curve} from './kinematics/curves.ts';

export type Asset={id:string;name:string;scale:number;parts:{id:string;name:string;positions:Float32Array}[]};
export type Demo={label:string;asset:Asset;mechanism:Mechanism;drives:Drive[]};

// ---------- triangle soups ----------
type Tri=[V,V,V];
const soup=(ts:Tri[])=>{const out=new Float32Array(ts.length*9);ts.forEach((t,i)=>t.forEach((v,k)=>out.set(v,i*9+k*3)));return out;};
const quad=(a:V,b:V,c:V,d:V):Tri[]=>[[a,b,c],[a,c,d]];
function box(center:V,size:V):Float32Array{
 const [x,y,z]=center,[a,b,c]=size.map(n=>n/2),p=(i:number,j:number,k:number):V=>[x+(i?a:-a),y+(j?b:-b),z+(k?c:-c)];
 return soup([...quad(p(0,0,0),p(0,1,0),p(1,1,0),p(1,0,0)),...quad(p(0,0,1),p(1,0,1),p(1,1,1),p(0,1,1)),...quad(p(0,0,0),p(1,0,0),p(1,0,1),p(0,0,1)),...quad(p(0,1,0),p(0,1,1),p(1,1,1),p(1,1,0)),...quad(p(0,0,0),p(0,0,1),p(0,1,1),p(0,1,0)),...quad(p(1,0,0),p(1,1,0),p(1,1,1),p(1,0,1))]);
}
/** Cylinder along x, y or z through `center`. */
function cylinder(axis:'x'|'y'|'z',center:V,r:number,h:number,n=40):Float32Array{
 const k=axis==='x'?0:axis==='y'?1:2,u=(k+1)%3,w=(k+2)%3,at=(t:number,s:number):V=>{const p:V=[...center] as V;p[k]+=s*h/2;p[u]+=r*Math.cos(t);p[w]+=r*Math.sin(t);return p;},c=(s:number):V=>{const p:V=[...center] as V;p[k]+=s*h/2;return p;};
 const ts:Tri[]=[];for(let i=0;i<n;i++){const t0=2*Math.PI*i/n,t1=2*Math.PI*(i+1)/n;ts.push(...quad(at(t0,-1),at(t1,-1),at(t1,1),at(t0,1)),[c(1),at(t0,1),at(t1,1)],[c(-1),at(t1,-1),at(t0,-1)]);}
 return soup(ts);
}
const transformed=(p:Float32Array,f:Frame)=>{const out=new Float32Array(p.length);for(let i=0;i<p.length;i+=3)out.set(compose(f,{position:[p[i],p[i+1],p[i+2]],rotation:[0,0,0,1]}).position,i);return out;};

function build(id:string,name:string,parts:[string,Float32Array][]){const asset:Asset={id,name,scale:1,parts:parts.map(([n,positions],i)=>({id:'p'+i,name:n,positions}))};
 const mesh=(names:string[])=>({kind:'mesh' as const,asset:id,parts:names.map(n=>{const i=parts.findIndex(p=>p[0]===n);if(i<0)throw Error('Teil fehlt: '+n);return 'p'+i;})});return {asset,mesh};}
const joint=(id:string,kind:'revolute'|'prismatic',a:string,b:string,frame:Frame,min:number,max:number):JointRelation=>({id,joint:{kind},a:{body:a,local:frame},b:{body:b,local:frame},limits:{min,max}});
const drive=(id:string,body:string,position:V,shaft:V,axis:string,target:number,spec='nema17'):Drive=>({id,spec,body,frame:{position,rotation:toward(shaft)},axis,target,tolerance:5});
const along={x:axisAngle([0,1,0],90) as Q,y:axisAngle([1,0,0],-90) as Q,z:[0,0,0,1] as Q};

/** Arm with a gear space below the turntable and stub shafts beside the joints for the output gears. */
export function robotArm():Demo{
 const {asset,mesh}=build('demo-roboterarm','Demo Roboterarm',[
  ['Sockel',box([0,0,10],[220,220,20])],
  ['Säule',cylinder('z',[0,0,75],12,110)],['Drehteller',cylinder('z',[0,0,136],55,12)],['Gabel links',box([-45,0,187],[10,70,90])],['Gabel rechts',box([45,0,187],[10,70,90])],
  ['Schulterwelle',cylinder('x',[0,0,210],9,230)],['Schulternabe',cylinder('x',[0,0,210],26,70)],['Oberarm',box([0,0,300],[40,40,180])],
  ['Ellbogenwelle',cylinder('x',[0,0,400],8,190)],['Ellbogennabe',cylinder('x',[0,0,400],20,40)],['Unterarm',box([0,0,495],[30,30,170])],['Greifer',box([0,0,595],[60,24,30])],
 ]);
 const at=(z:number,rotation:Q=[0,0,0,1]):Frame=>({position:[0,0,z],rotation});
 const mechanism:Mechanism={format:'kinematics-1',parameters:[],elements:[],contacts:[],patterns:[],
  bodies:[{id:'ground',frame:identity(),ground:true,display:mesh(['Sockel'])},{id:'Drehteller',frame:identity(),display:mesh(['Säule','Drehteller','Gabel links','Gabel rechts'])},{id:'Oberarm',frame:identity(),display:mesh(['Schulterwelle','Schulternabe','Oberarm'])},{id:'Unterarm',frame:identity(),display:mesh(['Ellbogenwelle','Ellbogennabe','Unterarm','Greifer'])}],
  joints:[joint('Drehen','revolute','ground','Drehteller',at(20),-170,170),joint('Schulter','revolute','Drehteller','Oberarm',at(210,along.x),-100,100),joint('Ellbogen','revolute','Oberarm','Unterarm',at(400,along.x),-135,135)],
  input:{kind:'coordinate',joint:'Drehen',coordinate:0},output:{kind:'coordinate',joint:'Drehen',coordinate:0},range:{from:0,to:170,samples:35}};
 // Motors stand on the carrying link, shafts parallel to their axis.
 const drives=[drive('M1','ground',[100,0,60],[0,0,1],'Drehen',4),drive('M2','Drehteller',[90,-55,210],[1,0,0],'Schulter',6),drive('M3','Oberarm',[60,0,320],[1,0,0],'Ellbogen',3)];
 return {label:'Demo Roboterarm',asset,mechanism,drives};
}

/** Gantry with three linear axes: X portal on the frame, Y wagon on the beam, Z slide on the wagon. */
export function cncPortal():Demo{
 const {asset,mesh}=build('demo-cnc','Demo CNC-Portal',[
  ['Schiene links',box([0,-150,15],[640,30,30])],['Schiene rechts',box([0,150,15],[640,30,30])],['Grundplatte',box([0,0,-5],[700,380,10])],
  ['Ständer links',box([0,-150,130],[40,30,200])],['Ständer rechts',box([0,150,130],[40,30,200])],['Traverse',box([0,0,250],[40,340,40])],
  ['Wagenplatte',box([70,0,260],[20,120,120])],
  ['Z-Schlitten',box([120,0,210],[40,60,160])],['Fräser',cylinder('z',[120,0,110],10,40)],
 ]);
 const f=(p:V,q:Q):Frame=>({position:p,rotation:q});
 const mechanism:Mechanism={format:'kinematics-1',parameters:[],elements:[],contacts:[],patterns:[],
  bodies:[{id:'ground',frame:identity(),ground:true,display:mesh(['Schiene links','Schiene rechts','Grundplatte'])},{id:'Portal',frame:identity(),display:mesh(['Ständer links','Ständer rechts','Traverse'])},{id:'Wagen',frame:identity(),display:mesh(['Wagenplatte'])},{id:'Z',frame:identity(),display:mesh(['Z-Schlitten','Fräser'])}],
  joints:[joint('X','prismatic','ground','Portal',f([0,0,40],along.x),-150,150),joint('Y','prismatic','Portal','Wagen',f([40,0,250],along.y),-100,100),joint('Z','prismatic','Wagen','Z',f([93,0,250],[0,0,0,1]),-80,40)],
  input:{kind:'coordinate',joint:'X',coordinate:0},output:{kind:'coordinate',joint:'X',coordinate:0},range:{from:-150,to:150,samples:31}};
 const drives=[drive('M1','ground',[-330,0,40],[1,0,0],'X',8),drive('M2','Portal',[40,190,250],[0,-1,0],'Y',8),drive('M3','Wagen',[93,0,335],[0,0,-1],'Z',2)];
 return {label:'Demo CNC-Portal',asset,mechanism,drives};
}

/** A wagon on a track that runs up and down; the motor rides on the wagon. */
export function slopeSled():Demo{
 const guide={kind:'path' as const,points:[[0,0,0],[200,0,0],[400,160,0],[600,160,0],[800,0,0],[1000,0,0],[1200,160,0]] as V[],closed:false,cornerRadius:150,axis:[0,0,1] as V};
 // The path lies in the xy-plane of a frame that stands upright: path y is world z (up).
 const plane:Frame={position:[0,0,0],rotation:axisAngle([1,0,0],90) as Q},fn=curve(guide),s0=150;
 const sweep=(y:[number,number],z:[number,number])=>{const ts:Tri[]=[],n=Math.ceil(fn.length/8),ring=(s:number)=>{const fr=compose(plane,fn.frame(s));return [[y[0],z[0]],[y[1],z[0]],[y[1],z[1]],[y[0],z[1]]].map(([a,b])=>compose(fr,{position:[0,a,b],rotation:[0,0,0,1]}).position);};
  for(let i=0;i<n;i++){const a=ring(fn.length*i/n),b=ring(fn.length*(i+1)/n);for(let k=0;k<4;k++)ts.push(...quad(a[k],a[(k+1)%4],b[(k+1)%4],b[k]));}return soup(ts);};
 const wagon=compose(plane,fn.frame(s0));
 const {asset,mesh}=build('demo-schlitten','Demo Schlitten',[
  ['Fahrbahn',sweep([-40,-6],[-15,15])],
  ['Wagenplatte',transformed(box([0,50,30],[140,80,10]),wagon)],['Laufrolle vorn',transformed(cylinder('z',[-50,-12,0],8,24),wagon)],['Laufrolle hinten',transformed(cylinder('z',[50,-12,0],8,24),wagon)],
 ]);
 const mechanism:Mechanism={format:'kinematics-1',parameters:[],elements:[],contacts:[],patterns:[],
  bodies:[{id:'ground',frame:identity(),ground:true,display:mesh(['Fahrbahn'])},{id:'Wagen',frame:wagon,display:mesh(['Wagenplatte','Laufrolle vorn','Laufrolle hinten'])}],
  joints:[{id:'Fahrt',joint:{kind:'path',curve:guide,roll:'locked'},a:{body:'ground',local:plane},b:{body:'Wagen',local:identity()},limits:{min:s0,max:Math.floor(fn.length-150)}}],
  input:{kind:'coordinate',joint:'Fahrt',coordinate:0},output:{kind:'coordinate',joint:'Fahrt',coordinate:0},range:{from:s0,to:Math.floor(fn.length-150),samples:41}};
 // Motor on the inner face of the wagon plate, shaft towards and past the track.
 const drives=[drive('M1','Wagen',[30,70,-15],[0,0,-1],'Fahrt',2*Math.PI*20/4)];
 return {label:'Demo Schlitten',asset,mechanism,drives};
}
export const demos={robot:robotArm,cnc:cncPortal,sled:slopeSled};
export {inverse};
