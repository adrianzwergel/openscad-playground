// Search catalog: what the route search may place. Providers keep the ids of
// the element-graph pairing rules so existing options (`rules`) carry over.
// Element specs are complete elements minus id, mounts and phase.
import type {Element,Interface,Envelope,Contact} from './model.ts';
import type {Surface} from './surfaces.ts';
import type {Profile} from './profiles.ts';
import {spurSurface} from './surfaces.ts';
import {coneAngles} from './contacts.ts';
import {BELTS} from '../motion.ts';
import {legoParts} from '../graph/lego-parts.ts';
import {legoBevelIds,legoWormProfiles} from '../graph/lego-config.ts';

export type ElementSpec={key:string;label:string;source:Element['source'];surfaces:Surface[];interfaces:Interface[];envelope:Envelope;mount:'bore'|'technic-cross';compoundRotor:boolean;rearSupport?:boolean;shaftLimit?:number;scad?:string};
export type Variable={key:string;lo:number;hi:number};
export type PairChoice={rule:string;kind:Contact['kind'];a:ElementSpec;b:ElementSpec;params:Record<string,number>;variables:Variable[];changesAxis:boolean;sharedRotor:boolean;ratio:number;factor:number;contactParams?:{distance?:number}};
export type Provider={id:string;changesAxis:boolean;sharedRotor:boolean;variables:Variable[];catalog:()=>PairChoice[]};

const involute=(module:number):Profile=>({kind:'involute',module,pressureAngle:20,backlash:.15});
export const legoProfile:Profile={kind:'library',id:'lego-m1',reference:{module:1,pressureAngle:20},tolerance:.03,apexOffset:2};
const azimuth:Variable={key:'azimuth',lo:-360,hi:360};
const bore=(d:number,z:[number,number]):Interface=>({id:'bore',kind:'bore',diameter:d,z});

export function spurSpec(teeth:number,module=2,width=10,boreDiameter=5.1):ElementSpec{
 const s=spurSurface('teeth',module,teeth,width);
 return {key:`spur:${module}:${teeth}:${width}:${boreDiameter}`,label:`Stirnrad z${teeth} m${module}`,source:{kind:'printed'},surfaces:[s],interfaces:[bore(boreDiameter,[-width/2,width/2])],envelope:{radius:module*(teeth/2+1),min:-width/2,max:width/2},mount:'bore',compoundRotor:true,
  scad:`spur_gear(mod=${module},teeth=${teeth},thickness=${width},shaft_diam=${boreDiameter},profile_shift=0,pressure_angle=20,backlash=0.15,gear_spin=PHASE);`};
}
export function bevelSpec(teeth:number,mateTeeth:number,sigma:number,first:boolean,module=2,width=6,boreDiameter=5.1):ElementSpec{
 const ra=module*teeth/2,rb=module*mateTeeth/2,{d1,d2}=coneAngles(first?ra:rb,first?rb:ra,sigma),cone=(first?d1:d2)*180/Math.PI;
 const s:Surface={id:'teeth',pitch:{kind:'circle',r:ra},profile:involute(module),z:[0,width],plane:0,side:'external',cone};
 return {key:`bevel:${module}:${teeth}:${mateTeeth}:${sigma.toFixed(6)}:${width}:${boreDiameter}`,label:`Kegelrad z${teeth} m${module}`,source:{kind:'printed'},surfaces:[s],interfaces:[bore(boreDiameter,[0,width])],envelope:{radius:module*(teeth/2+2),min:-12,max:width},mount:'bore',compoundRotor:true,rearSupport:true,
  scad:`bevel_gear(mod=${module},teeth=${teeth},mate_teeth=${mateTeeth},shaft_angle=${sigma},face_width=${width},bottom=4,cone_backing=false,spiral=0,cutter_radius=0,shaft_diam=${boreDiameter},backlash=0.15,gear_spin=PHASE);`};
}
export function pulleySpec(teeth:number,boreDiameter=5.1):ElementSpec{
 const r=teeth/Math.PI,s:Surface={id:'belt',pitch:{kind:'circle',r},profile:{kind:'belt',pitch:2,toothed:true},z:[-3,3],side:'external'};
 return {key:`gt2-pulley:${teeth}:6:${boreDiameter}`,label:`GT2-Scheibe z${teeth}`,source:{kind:'printed'},surfaces:[s],interfaces:[bore(boreDiameter,[-3,3])],envelope:{radius:Math.max(r+1.5,8),min:-4,max:12},mount:'bore',compoundRotor:true,
  scad:`rotate([0,0,PHASE]) difference(){union(){cylinder(r=${r},h=6,center=true);for(z=[-4,3])translate([0,0,z])cylinder(r=${r+1.5},h=1);translate([0,0,4])cylinder(r=8,h=8);}translate([0,0,-5])cylinder(d=${boreDiameter},h=18);}`};
}
export function wormSpec(starts:number,module=2,diameter=24,width=24,boreDiameter=5.1):ElementSpec{
 const s:Surface={id:'thread',pitch:{kind:'circle',r:diameter/2},profile:{kind:'helical',lead:Math.PI*module*starts,starts},z:[-width/2,width/2],side:'external'};
 return {key:`worm:${starts}:${module}:${diameter}:${width}:${boreDiameter}`,label:`Schnecke ${starts}-gängig`,source:{kind:'printed'},surfaces:[s],interfaces:[bore(boreDiameter,[-width/2,width/2])],envelope:{radius:diameter/2+2,min:-width/2,max:width/2},mount:'bore',compoundRotor:true,
  scad:`difference(){worm(mod=${module},d=${diameter},l=${width},starts=${starts},left_handed=false,pressure_angle=20,backlash=0.15,gear_spin=PHASE);cylinder(d=${boreDiameter},h=${width+2},center=true);}`};
}
export const wormWheelThroat=(teeth:number,starts:number,module=2,wormDiameter=24)=>module*teeth/2/Math.sqrt(1-(starts*module/wormDiameter)**2);
export function wormWheelSpec(teeth:number,starts:number,module=2,width=10,boreDiameter=5.1):ElementSpec{
 const s:Surface={id:'teeth',pitch:{kind:'circle',r:module*teeth/2},profile:involute(module),z:[-width/2,width/2],side:'external'};
 return {key:`worm-wheel:${teeth}:${starts}:${module}:${width}:${boreDiameter}`,label:`Schneckenrad z${teeth}`,source:{kind:'printed'},surfaces:[s],interfaces:[bore(boreDiameter,[-width/2,width/2])],envelope:{radius:wormWheelThroat(teeth,starts,module)+4,min:-width/2,max:width/2},mount:'bore',compoundRotor:true,
  scad:`difference(){worm_gear(mod=${module},teeth=${teeth},thickness=${width},worm_diam=24,worm_starts=${starts},left_handed=false,profile_shift=0,pressure_angle=20,backlash=0.15,slices=8,search_steps=24,gear_spin=PHASE);cylinder(d=${boreDiameter},h=${width+2},center=true);}`};
}
type LegoPart=typeof legoParts[number];
export const legoSearchable=(p:LegoPart)=>p.search||!!legoWormProfiles[p.id];
export function legoSpec(part:LegoPart,role:'spur'|'bevel'|'worm',mateTeeth?:number):ElementSpec{
 const half=part.size[2]/2,base={label:`LEGO ${part.id} ${part.name.replace(/^Technic /,'')}`,source:{kind:'library' as const,library:'lego',part:String(part.model)},interfaces:[{id:'bore',kind:'technic-cross',z:[-half,half]} as Interface],envelope:{radius:part.radius,min:-half,max:half},mount:'technic-cross' as const,compoundRotor:false,scad:`rotate([0,0,PHASE]) import("/lego/${part.id}.stl");`};
 if(role==='worm'){const w=legoWormProfiles[part.id];return {...base,key:`lego:${part.id}:worm`,surfaces:[{id:'thread',pitch:{kind:'circle',r:w.pitchRadius},profile:{kind:'helical',lead:Math.PI*w.starts,starts:w.starts},z:[-half,half],side:'external'}]};}
 const ra=part.teeth/2;
 if(role==='bevel'){const rb=mateTeeth!/2,{d1}=coneAngles(ra,rb,90);return {...base,key:`lego:${part.id}:bevel:${mateTeeth}`,surfaces:[{id:'teeth',pitch:{kind:'circle',r:ra},profile:legoProfile,z:[-half,half],plane:0,side:'external',cone:d1*180/Math.PI}],shaftLimit:half,rearSupport:true};}
 return {...base,key:`lego:${part.id}`,surfaces:[{id:'teeth',pitch:{kind:'circle',r:ra},profile:legoProfile,z:[-half,half],side:'external'}]};
}
const choice=(rule:string,kind:Contact['kind'],a:ElementSpec,b:ElementSpec,params:Record<string,number>,variables:Variable[],changesAxis:boolean,sharedRotor:boolean,gain:number,contactParams?:{distance?:number}):PairChoice=>({rule,kind,a,b,params,variables,changesAxis,sharedRotor,ratio:Math.abs(gain),factor:1/Math.abs(gain),...(contactParams?{contactParams}:{})});
const teethList=[20,30,40];
export const providers:Provider[]=[
 {id:'external-spur',changesAxis:false,sharedRotor:true,variables:[azimuth],catalog:()=>teethList.flatMap(a=>teethList.map(b=>choice('external-spur','roll',spurSpec(a),spurSpec(b),{azimuth:0},[azimuth],false,true,-a/b)))},
 {id:'bevel-mesh',changesAxis:true,sharedRotor:true,variables:[azimuth,{key:'angle',lo:60,hi:120}],catalog:()=>teethList.flatMap(a=>teethList.map(b=>choice('bevel-mesh','roll',bevelSpec(a,b,90,true),bevelSpec(b,a,90,false),{azimuth:0,angle:90},[azimuth,{key:'angle',lo:60,hi:120}],true,true,-a/b)))},
 {id:'gt2-belt',changesAxis:false,sharedRotor:true,variables:[azimuth],catalog:()=>teethList.flatMap(a=>teethList.flatMap(b=>BELTS.map(length=>choice('gt2-belt','belt',pulleySpec(a),pulleySpec(b),{azimuth:0,length,release:2,tension:1},[azimuth],false,true,a/b))))},
 {id:'worm-mesh',changesAxis:true,sharedRotor:false,variables:[azimuth],catalog:()=>[1,2].flatMap(starts=>teethList.map(teeth=>choice('worm-mesh','helical',wormSpec(starts),wormWheelSpec(teeth,starts),{azimuth:0},[azimuth],true,false,starts/teeth,{distance:12+wormWheelThroat(teeth,starts)})))},
 {id:'lego-spur',changesAxis:false,sharedRotor:true,variables:[azimuth],catalog:()=>{const parts=legoParts.filter(p=>p.search);return parts.flatMap(a=>parts.map(b=>choice('lego-spur','roll',legoSpec(a,'spur'),legoSpec(b,'spur'),{azimuth:0},[azimuth],false,true,-a.teeth/b.teeth)));}},
 {id:'lego-bevel-90',changesAxis:true,sharedRotor:true,variables:[azimuth],catalog:()=>{const parts=legoParts.filter(p=>legoBevelIds.includes(p.id));return parts.flatMap(a=>parts.map(b=>choice('lego-bevel-90','roll',legoSpec(a,'bevel',b.teeth),legoSpec(b,'bevel',a.teeth),{azimuth:0,angle:90},[azimuth],true,true,-a.teeth/b.teeth)));}},
 {id:'lego-worm',changesAxis:true,sharedRotor:true,variables:[azimuth],catalog:()=>{const worms=legoParts.filter(p=>legoWormProfiles[p.id]),wheels=legoParts.filter(p=>p.search&&!legoBevelIds.includes(p.id));return worms.flatMap(a=>wheels.map(b=>choice('lego-worm','helical',legoSpec(a,'worm'),legoSpec(b,'spur'),{azimuth:0},[azimuth],true,true,legoWormProfiles[a.id].starts/b.teeth)));}},
];
export function selectProviders(rules?:string[]){
 const chosen=providers.filter(p=>!rules||rules.includes(p.id));
 if(!chosen.length||rules?.some(id=>!providers.some(p=>p.id===id)))throw Error('Keine gültige Auswahl von Suchprovidern.');
 return chosen;
}
/** Bevel specs depend on the pair; the angle variable changes the cone of both. */
export function withAngle(c:PairChoice,sigma:number):PairChoice{
 if(c.rule!=='bevel-mesh'||Math.abs((c.params.angle??90)-sigma)<1e-12)return c;
 const teethOf=(s:ElementSpec)=>Number(s.key.split(':')[2]),ta=teethOf(c.a),tb=teethOf(c.b);
 return {...c,a:bevelSpec(ta,tb,sigma,true),b:bevelSpec(tb,ta,sigma,false),params:{...c.params,angle:sigma}};
}
