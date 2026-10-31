// Search catalog: what the route search may place. Providers keep the ids of
// the element-graph pairing rules so existing options (`rules`) carry over.
// Element specs are complete elements minus id, mounts and phase.
import type {Element,Interface,Envelope,Contact} from './model.ts';
import type {Surface} from './surfaces.ts';
import type {Profile} from './profiles.ts';
import {spurSurface,teeth as surfaceTeeth} from './surfaces.ts';
import {reference} from './profiles.ts';
import {coneAngles} from './contacts.ts';
import {BELTS} from '../motion.ts';
import {legoParts} from '../graph/lego-parts.ts';
import {legoBevelIds,legoWormProfiles} from '../graph/lego-config.ts';

/** `legacy` names the element-graph family and parameters of the same part for the two-way adapter. */
export type ElementSpec={key:string;label:string;source:Element['source'];surfaces:Surface[];interfaces:Interface[];envelope:Envelope;mount:'bore'|'technic-cross';compoundRotor:boolean;rearSupport?:boolean;shaftLimit?:number;scad?:string;legacy:{family:string;params:Record<string,number>}};
export type Variable={key:string;lo:number;hi:number};
/** `linear` marks pairs whose driven part translates: a nut on a spindle or a rack on a pinion. */
/** `mate` overrides the surface geometry with a provider's own mate frame (rules registered at runtime). */
export type PairChoice={rule:string;kind:Contact['kind'];a:ElementSpec;b:ElementSpec;params:Record<string,number>;variables:Variable[];changesAxis:boolean;sharedRotor:boolean;ratio:number;factor:number;contactParams?:{distance?:number};linear?:'screw'|'rack';mate?:(params:Record<string,number>)=>import('./math.ts').Frame};
/** `input` is a given part on the input shaft (e.g. a library gear); `teeth` bounds generated mates. */
export type CatalogContext={input?:ElementSpec;teeth?:[number,number];stroke?:number};
export type Provider={id:string;changesAxis:boolean;sharedRotor:boolean;linear?:boolean;variables:Variable[];catalog:(context?:CatalogContext)=>PairChoice[]};

const involute=(module:number):Profile=>({kind:'involute',module,pressureAngle:20,backlash:.15});
export const legoProfile:Profile={kind:'library',id:'lego-m1',reference:{module:1,pressureAngle:20},tolerance:.03,apexOffset:2};
const azimuth:Variable={key:'azimuth',lo:-360,hi:360};
const bore=(d:number,z:[number,number]):Interface=>({id:'bore',kind:'bore',diameter:d,z});

export function spurSpec(teeth:number,module=2,width=10,boreDiameter=5.1):ElementSpec{
 const s=spurSurface('teeth',module,teeth,width);
 return {key:`spur:${module}:${teeth}:${width}:${boreDiameter}`,label:`Stirnrad z${teeth} m${module}`,source:{kind:'printed'},surfaces:[s],interfaces:[bore(boreDiameter,[-width/2,width/2])],envelope:{radius:module*(teeth/2+1),min:-width/2,max:width/2},mount:'bore',compoundRotor:true,
  scad:`spur_gear(mod=${module},teeth=${teeth},thickness=${width},shaft_diam=${boreDiameter},profile_shift=0,pressure_angle=20,backlash=0.15,gear_spin=PHASE);`,legacy:{family:'spur',params:{teeth,module,width,bore:boreDiameter}}};
}
export function bevelSpec(teeth:number,mateTeeth:number,sigma:number,first:boolean,module=2,width=6,boreDiameter=5.1):ElementSpec{
 const ra=module*teeth/2,rb=module*mateTeeth/2,{d1,d2}=coneAngles(first?ra:rb,first?rb:ra,sigma),cone=(first?d1:d2)*180/Math.PI;
 const s:Surface={id:'teeth',pitch:{kind:'circle',r:ra},profile:involute(module),z:[0,width],plane:0,side:'external',cone};
 return {key:`bevel:${module}:${teeth}:${mateTeeth}:${sigma.toFixed(6)}:${width}:${boreDiameter}`,label:`Kegelrad z${teeth} m${module}`,source:{kind:'printed'},surfaces:[s],interfaces:[bore(boreDiameter,[0,width])],envelope:{radius:module*(teeth/2+2),min:-12,max:width},mount:'bore',compoundRotor:true,rearSupport:true,
  scad:`bevel_gear(mod=${module},teeth=${teeth},mate_teeth=${mateTeeth},shaft_angle=${sigma},face_width=${width},bottom=4,cone_backing=false,spiral=0,cutter_radius=0,shaft_diam=${boreDiameter},backlash=0.15,gear_spin=PHASE);`,legacy:{family:'bevel',params:{teeth,module,width,bore:boreDiameter}}};
}
export function pulleySpec(teeth:number,boreDiameter=5.1):ElementSpec{
 const r=teeth/Math.PI,s:Surface={id:'belt',pitch:{kind:'circle',r},profile:{kind:'belt',pitch:2,toothed:true},z:[-3,3],side:'external'};
 return {key:`gt2-pulley:${teeth}:6:${boreDiameter}`,label:`GT2-Scheibe z${teeth}`,source:{kind:'printed'},surfaces:[s],interfaces:[bore(boreDiameter,[-3,3])],envelope:{radius:Math.max(r+1.5,8),min:-4,max:12},mount:'bore',compoundRotor:true,
  scad:`rotate([0,0,PHASE]) difference(){union(){cylinder(r=${r},h=6,center=true);for(z=[-4,3])translate([0,0,z])cylinder(r=${r+1.5},h=1);translate([0,0,4])cylinder(r=8,h=8);}translate([0,0,-5])cylinder(d=${boreDiameter},h=18);}`,legacy:{family:'gt2-pulley',params:{teeth,width:6,bore:boreDiameter}}};
}
export function wormSpec(starts:number,module=2,diameter=24,width=24,boreDiameter=5.1):ElementSpec{
 const s:Surface={id:'thread',pitch:{kind:'circle',r:diameter/2},profile:{kind:'helical',lead:Math.PI*module*starts,starts},z:[-width/2,width/2],side:'external'};
 return {key:`worm:${starts}:${module}:${diameter}:${width}:${boreDiameter}`,label:`Schnecke ${starts}-gängig`,source:{kind:'printed'},surfaces:[s],interfaces:[bore(boreDiameter,[-width/2,width/2])],envelope:{radius:diameter/2+2,min:-width/2,max:width/2},mount:'bore',compoundRotor:true,
  scad:`difference(){worm(mod=${module},d=${diameter},l=${width},starts=${starts},left_handed=false,pressure_angle=20,backlash=0.15,gear_spin=PHASE);cylinder(d=${boreDiameter},h=${width+2},center=true);}`,legacy:{family:'worm',params:{starts,module,diameter,width,bore:boreDiameter}}};
}
export const wormWheelThroat=(teeth:number,starts:number,module=2,wormDiameter=24)=>module*teeth/2/Math.sqrt(1-(starts*module/wormDiameter)**2);
export function wormWheelSpec(teeth:number,starts:number,module=2,width=10,boreDiameter=5.1):ElementSpec{
 const s:Surface={id:'teeth',pitch:{kind:'circle',r:module*teeth/2},profile:involute(module),z:[-width/2,width/2],side:'external'};
 return {key:`worm-wheel:${teeth}:${starts}:${module}:${width}:${boreDiameter}`,label:`Schneckenrad z${teeth}`,source:{kind:'printed'},surfaces:[s],interfaces:[bore(boreDiameter,[-width/2,width/2])],envelope:{radius:wormWheelThroat(teeth,starts,module)+4,min:-width/2,max:width/2},mount:'bore',compoundRotor:true,
  scad:`difference(){worm_gear(mod=${module},teeth=${teeth},thickness=${width},worm_diam=24,worm_starts=${starts},left_handed=false,profile_shift=0,pressure_angle=20,backlash=0.15,slices=8,search_steps=24,gear_spin=PHASE);cylinder(d=${boreDiameter},h=${width+2},center=true);}`,legacy:{family:'worm-wheel',params:{teeth,starts,module,width,bore:boreDiameter}}};
}
type LegoPart=typeof legoParts[number];
export const legoSearchable=(p:LegoPart)=>p.search||!!legoWormProfiles[p.id];
export function legoSpec(part:LegoPart,role:'spur'|'bevel'|'worm',mateTeeth?:number):ElementSpec{
 const half=part.size[2]/2,base={label:`LEGO ${part.id} ${part.name.replace(/^Technic /,'')}`,source:{kind:'library' as const,library:'lego',part:String(part.model)},interfaces:[{id:'bore',kind:'technic-cross',z:[-half,half]} as Interface],envelope:{radius:part.radius,min:-half,max:half},mount:'technic-cross' as const,compoundRotor:false,scad:`rotate([0,0,PHASE]) import("/lego/${part.id}.stl");`,legacy:{family:'lego-technic',params:{model:part.model}}};
 if(role==='worm'){const w=legoWormProfiles[part.id];return {...base,key:`lego:${part.id}:worm`,surfaces:[{id:'thread',pitch:{kind:'circle',r:w.pitchRadius},profile:{kind:'helical',lead:Math.PI*w.starts,starts:w.starts},z:[-half,half],side:'external'}]};}
 const ra=part.teeth/2;
 if(role==='bevel'){const rb=mateTeeth!/2,{d1}=coneAngles(ra,rb,90);return {...base,key:`lego:${part.id}:bevel:${mateTeeth}`,surfaces:[{id:'teeth',pitch:{kind:'circle',r:ra},profile:legoProfile,z:[-half,half],plane:0,side:'external',cone:d1*180/Math.PI}],shaftLimit:half,rearSupport:true};}
 return {...base,key:`lego:${part.id}`,surfaces:[{id:'teeth',pitch:{kind:'circle',r:ra},profile:legoProfile,z:[-half,half],side:'external'}]};
}
const choice=(rule:string,kind:Contact['kind'],a:ElementSpec,b:ElementSpec,params:Record<string,number>,variables:Variable[],changesAxis:boolean,sharedRotor:boolean,gain:number,contactParams?:{distance?:number}):PairChoice=>({rule,kind,a,b,params,variables,changesAxis,sharedRotor,ratio:Math.abs(gain),factor:1/Math.abs(gain),...(contactParams?{contactParams}:{})});
/** TR8 spindle (length 200) and its nut: the nut sits 30 mm up the spindle and travels `lead` per turn. */
export function screwSpec(lead:number):ElementSpec{return {key:`tr8-screw:${lead}`,label:`TR8×${lead} Spindel`,source:{kind:'library',library:'purchase',part:`tr8x${lead}`},surfaces:[{id:'thread',pitch:{kind:'circle',r:4},profile:{kind:'helical',lead,starts:1},z:[0,200],side:'external'}],interfaces:[bore(8,[0,200])],envelope:{radius:4,min:0,max:200},mount:'bore',compoundRotor:false,legacy:{family:'tr8-screw',params:{lead,length:200}}};}
export function nutSpec(lead:number):ElementSpec{return {key:`tr8-nut:${lead}`,label:`TR8×${lead} Mutter`,source:{kind:'library',library:'purchase',part:`tr8x${lead}-nut`},surfaces:[],interfaces:[{id:'flange',kind:'flange',frame:{position:[0,0,0],rotation:[0,0,0,1]}}],envelope:{radius:11,min:-8,max:8},mount:'bore',compoundRotor:false,legacy:{family:'tr8-nut',params:{lead}}};}
export function rackSpec(teeth=41,module=2,width=10):ElementSpec{return {key:`rack:${module}:${teeth}:${width}`,label:`Zahnstange m${module}`,source:{kind:'printed'},surfaces:[{id:'teeth',pitch:{kind:'line',length:teeth*Math.PI*module},profile:involute(module),z:[-width/2,width/2],side:'external'}],interfaces:[{id:'flange',kind:'flange',frame:{position:[0,0,0],rotation:[0,0,0,1]}}],envelope:{radius:16,transverse:[5,16],min:-teeth*Math.PI,max:teeth*Math.PI},mount:'bore',compoundRotor:false,legacy:{family:'rack',params:{teeth,module,width}}};}
const teethList=[20,30,40];
/** Printed spur mates for a given part: same basic rack, any tooth count in range. The pairing
 * is admissible by the basic-rack rule, so no list of allowed partners is needed. */
export function matesFor(spec:ElementSpec,[lo,hi]:[number,number]=[8,80]):PairChoice[]{
 const surface=spec.surfaces.find(s=>s.pitch.kind==='circle'&&!s.cone&&s.profile.kind!=='helical'),ref=surface&&reference(surface.profile),za=surface&&surfaceTeeth(surface);
 if(!surface||!ref||za===undefined)return [];
 const width=Math.max(6,Math.min(12,surface.z[1]-surface.z[0]));
 return Array.from({length:hi-lo+1},(_,i)=>lo+i).map(zb=>choice('generated-mate','roll',spec,spurSpec(zb,ref.module,width),{azimuth:0},[azimuth],false,false,-Math.round(za)/zb));
}
export const providers:Provider[]=[
 {id:'external-spur',changesAxis:false,sharedRotor:true,variables:[azimuth],catalog:()=>teethList.flatMap(a=>teethList.map(b=>choice('external-spur','roll',spurSpec(a),spurSpec(b),{azimuth:0},[azimuth],false,true,-a/b)))},
 {id:'bevel-mesh',changesAxis:true,sharedRotor:true,variables:[azimuth,{key:'angle',lo:60,hi:120}],catalog:()=>teethList.flatMap(a=>teethList.map(b=>choice('bevel-mesh','roll',bevelSpec(a,b,90,true),bevelSpec(b,a,90,false),{azimuth:0,angle:90},[azimuth,{key:'angle',lo:60,hi:120}],true,true,-a/b)))},
 {id:'gt2-belt',changesAxis:false,sharedRotor:true,variables:[azimuth],catalog:()=>teethList.flatMap(a=>teethList.flatMap(b=>BELTS.map(length=>choice('gt2-belt','belt',pulleySpec(a),pulleySpec(b),{azimuth:0,length,release:2,tension:1},[azimuth],false,true,a/b))))},
 {id:'worm-mesh',changesAxis:true,sharedRotor:false,variables:[azimuth],catalog:()=>[1,2].flatMap(starts=>teethList.map(teeth=>choice('worm-mesh','helical',wormSpec(starts),wormWheelSpec(teeth,starts),{azimuth:0},[azimuth],true,false,starts/teeth,{distance:12+wormWheelThroat(teeth,starts)})))},
 {id:'lego-spur',changesAxis:false,sharedRotor:true,variables:[azimuth],catalog:()=>{const parts=legoParts.filter(p=>p.search);return parts.flatMap(a=>parts.map(b=>choice('lego-spur','roll',legoSpec(a,'spur'),legoSpec(b,'spur'),{azimuth:0},[azimuth],false,true,-a.teeth/b.teeth)));}},
 {id:'lego-bevel-90',changesAxis:true,sharedRotor:true,variables:[azimuth],catalog:()=>{const parts=legoParts.filter(p=>legoBevelIds.includes(p.id));return parts.flatMap(a=>parts.map(b=>choice('lego-bevel-90','roll',legoSpec(a,'bevel',b.teeth),legoSpec(b,'bevel',a.teeth),{azimuth:0},[azimuth],true,true,-a.teeth/b.teeth)));}},
 {id:'screw-nut',changesAxis:false,sharedRotor:false,linear:true,variables:[],catalog:context=>[2,8].map(lead=>({...choice('screw-nut','helical',screwSpec(lead),nutSpec(lead),{stroke:context?.stroke??100},[],false,false,lead),linear:'screw' as const}))},
 {id:'rack-drive',changesAxis:false,sharedRotor:true,linear:true,variables:[azimuth],catalog:context=>teethList.map(teeth=>({...choice('rack-drive','roll',spurSpec(teeth),rackSpec(),{azimuth:0,stroke:context?.stroke??100},[azimuth],false,true,2*Math.PI*teeth),linear:'rack' as const}))},
 {id:'generated-mate',changesAxis:false,sharedRotor:false,variables:[azimuth],catalog:context=>context?.input?matesFor(context.input,context.teeth):[]},
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
