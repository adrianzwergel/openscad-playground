// Examples for the start page, built from the same parts and connections one places by hand: shafts and wheels,
// racks, lead screws, belts, parts and plates with their connections. Each fills an empty build; everything in it can be
// clicked and changed. Coordinates are the Studio's room (z up); shafts run along y, a train's plane is x and height.
import type {Build} from './build.ts';
import {newItem,newPlateNode} from './build.ts';
import {partById} from './catalog.ts';
import {legoGears,newTrain,setEnds} from './train.ts';
import {pushrodCorner} from './linkage.ts';
import type {Train,Wheel} from './train.ts';
import {compose,inverse,axisAngle} from '../kinematics/math.ts';
import type {Frame,V} from '../kinematics/math.ts';

const lego=(id:string,shaft:string,teeth:number,z=0):Wheel=>{const p=legoGears.find(x=>x.teeth===teeth)!;return {id,shaft,z,teeth,module:1,width:p.size[2],part:p.id};};
const pulley=(id:string,shaft:string,teeth:number):Wheel=>({id,shaft,z:0,teeth,module:1,width:6,pulley:true});
const item=(id:string,part:string,frame:Frame,more:object={})=>({...newItem(id,partById(part)!,[0,0]),free:{frame,...more}});
const at=(position:V,rotation:Frame['rotation']=[0,0,0,1]):Frame=>({position,rotation});
const train=(b:Build):Train=>b.train??=newTrain();

export type Example={key:string;title:string;text:string;make:(b:Build)=>void};
export const buildExamples:Example[]=[
 {key:'zahnstange',title:'Zahnstangen-Schlitten',text:'Ein LEGO-Ritzel schiebt eine Zahnstange; ein Pico an ihr fährt mit.',make:b=>{const t=train(b);
  t.shafts.push({id:'ritzel',at:[0,40]});t.wheels.push(lego('z16','ritzel',16));t.racks=[{id:'stange',at:[0,32],dir:'x',z:0,length:160,module:1,width:8,min:-60,max:60}];setEnds(t,[{shaft:'ritzel',drive:'lego-achse'}],[]);
  b.items.push(item('pico','rpi-pico',at([0,0,-24]),{body:'zahnstange:stange'}));}},
 {key:'spindel',title:'Spindel-Lineareinheit',text:'NEMA 17 an einer TR8-Spindel, die Mutter trägt eine Schlittenplatte mit Motortreiber.',make:b=>{const t=train(b);
  t.shafts.push({id:'spindel',at:[0,30],kind:'spindel',lead:8,d:8,length:200,z:0});setEnds(t,[{shaft:'spindel',drive:'nema17'}],[]);
  const nut=at([0,0,30],axisAngle([1,0,0],-90));b.items.push(item('mutter','tr8-mutter',at([0,0,0],axisAngle([1,0,0],-90)),{body:'welle:spindel',joint:{kind:'mutter',axis:'y',lead:8,min:-85,max:85}}));
  const plate={...newPlateNode('schlitten',compose(inverse(nut),at([0,0,52])),'teil:mutter'),mode:'fixed' as const,size:[90,60] as [number,number]};b.plates.push(plate);
  b.items.push({...newItem('treiber',partById('l298n')!,[0,0]),plate:'schlitten'});}},
 {key:'riemen',title:'Riemenantrieb GT2',text:'Ein Motor treibt über einen GT2-Riemen z20 → z40 an: 1 : 2 im gleichen Drehsinn.',make:b=>{const t=train(b);
  t.shafts.push({id:'motor',at:[0,40]},{id:'abtrieb',at:[100,40]});t.wheels.push(pulley('klein','motor',20),pulley('gross','abtrieb',40));t.belts=[{id:'riemen',a:'klein',b:'gross'}];setEnds(t,[{shaft:'motor',drive:'nema17'}],['abtrieb']);}},
 {key:'planet-steg',title:'Planetenstufe mit fester Sonne',text:'Die Sonne z16 steht, der Steg wird gedreht: zwei Planeten z24 laufen um und drehen sich dabei.',make:b=>{const t=train(b);
  t.shafts.push({id:'sonne',at:[0,40],fixed:true},{id:'steg',at:[0,40]},{id:'p1',at:[20,40],on:{body:'welle:steg',frame:at([20,0,0])}},{id:'p2',at:[-20,40],on:{body:'welle:steg',frame:at([-20,0,0])}});
  t.wheels.push(lego('sonne','sonne',16),lego('stegrad','steg',24,14),lego('planet1','p1',24),lego('planet2','p2',24));setEnds(t,[{shaft:'steg',drive:'lego-achse'}],['p1']);}},
 {key:'drehgeber',title:'Drehgeber auf der Welle',text:'z8 treibt z24; ein Sensor sitzt fest auf der Welle des z24 und dreht mit.',make:b=>{const t=train(b);
  t.shafts.push({id:'antrieb',at:[0,40]},{id:'abtrieb',at:[16,40]});t.wheels.push(lego('z8','antrieb',8),lego('z24','abtrieb',24));setEnds(t,[{shaft:'antrieb',drive:'lego-achse'}],['abtrieb']);
  b.items.push(item('sensor','d1-mini',at([0,-14,0]),{body:'welle:abtrieb'}));}},
 {key:'schwenkarm',title:'Schwenkarm',text:'Eine Platte als Arm dreht mit eigenem Motor um ihr Ende; ein Pico auf ihr fährt mit.',make:b=>{
  const arm={...newPlateNode('arm',at([60,0,40])),mode:'fixed' as const,size:[160,30] as [number,number],center:[0,0] as [number,number]};arm.free.joint={kind:'drehen',axis:'z',at:[-10,0,40],min:-90,max:90,input:{drive:'nema17'}};b.plates.push(arm);
  b.items.push({...newItem('pico',partById('rpi-pico')!,[50,0]),plate:'arm'},item('motor','nema17-40',at([-10,0,0])));}},
 {key:'aufhaengung',title:'Pushrod-Aufhängung 1:10',text:'Doppelquerlenker, Pushrod auf Umlenkhebel und Öldämpfer, Spurstange: Gelenkpunkte setzen, Lenker und Halter entstehen daraus.',make:b=>{b.linkage={links:pushrodCorner()};}},
];
