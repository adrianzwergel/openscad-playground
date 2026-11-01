// Demo "Roboterarm": a small arm built from primitives, stored like an imported
// model, with links and three axes already set up. Shows the whole flow
// (model → links → axes → sliders) in one click.
import * as THREE from 'three';
import type {Asset} from './model-import';
import type {Mechanism} from './kinematics/model';
import type {Frame} from './kinematics/math';
import {axisAngle,identity} from './kinematics/math';

const soup=(g:THREE.BufferGeometry,x:number,y:number,z:number)=>{g.translate(x,y,z);const n=g.index?g.toNonIndexed():g;return new Float32Array(n.getAttribute('position').array as ArrayLike<number>);};
const cylinderAlong=(axis:'x'|'z',r:number,h:number)=>{const g=new THREE.CylinderGeometry(r,r,h,48);if(axis==='z')g.rotateX(Math.PI/2);else g.rotateZ(Math.PI/2);return g;};

export function demoRobot():{asset:Asset;mechanism:Mechanism}{
 const parts=[
  ['Sockel',soup(new THREE.BoxGeometry(140,140,40),0,0,20)],
  ['Drehteller',soup(cylinderAlong('z',50,30),0,0,55)],
  ['Schulterbock',soup(new THREE.BoxGeometry(50,90,50),0,0,95)],
  ['Schultergelenk',soup(cylinderAlong('x',26,80),0,0,125)],
  ['Oberarm',soup(new THREE.BoxGeometry(40,40,200),0,0,235)],
  ['Ellbogengelenk',soup(cylinderAlong('x',20,64),0,0,340)],
  ['Unterarm',soup(new THREE.BoxGeometry(30,30,170),0,0,430)],
  ['Greifer',soup(new THREE.BoxGeometry(60,24,30),0,0,530)],
 ] as const;
 const asset:Asset={id:'demo-roboterarm',name:'Demo Roboterarm',scale:1,parts:parts.map(([name,positions],i)=>({id:'p'+i,name,positions}))};
 const mesh=(names:string[])=>({kind:'mesh' as const,asset:asset.id,parts:names.map(n=>'p'+parts.findIndex(p=>p[0]===n))});
 // Axis frames: z along the axis. Shoulder and elbow turn about x.
 const alongX=axisAngle([0,1,0],90) as Frame['rotation'],at=(z:number,rotation:Frame['rotation']=[0,0,0,1]):Frame=>({position:[0,0,z],rotation});
 const joint=(id:string,a:string,b:string,frame:Frame,min:number,max:number)=>({id,joint:{kind:'revolute' as const},a:{body:a,local:frame},b:{body:b,local:frame},limits:{min,max}});
 const mechanism:Mechanism={format:'kinematics-1',parameters:[],elements:[],contacts:[],patterns:[],
  bodies:[{id:'ground',frame:identity(),ground:true,display:mesh(['Sockel'])},{id:'Drehteller',frame:identity(),display:mesh(['Drehteller','Schulterbock'])},{id:'Oberarm',frame:identity(),display:mesh(['Schultergelenk','Oberarm'])},{id:'Unterarm',frame:identity(),display:mesh(['Ellbogengelenk','Unterarm','Greifer'])}],
  joints:[joint('Drehen','ground','Drehteller',at(40),-170,170),joint('Schulter','Drehteller','Oberarm',at(125,alongX),-100,100),joint('Ellbogen','Oberarm','Unterarm',at(340,alongX),-135,135)],
  input:{kind:'coordinate',joint:'Drehen',coordinate:0},output:{kind:'coordinate',joint:'Drehen',coordinate:0},range:{from:-170,to:170,samples:35}};
 return {asset,mechanism};
}
