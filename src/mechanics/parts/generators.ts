// Holder generators: how a part is fastened to whatever carries it. Every generator answers with the same
// FeatureGeometry the structure core uses, so a carrier (plate today, housing and frame later) takes any holder
// without knowing it, and a new holder only has to be registered here.
import type {Part} from './catalog.ts';
import {featureGeometry} from '../../structure/features.ts';
import type {FeatureGeometry} from '../../structure/features.ts';
import type {Frame} from '../../structure/vec.ts';

export type HolderParam={key:string;label:string;step?:number;min?:number};
/** A hole of the placed part: `at` on the carrier (mm), its Ø as chosen; `side` +1: the part sits on the carrier's top. */
export type HolderHole={at:[number,number];d:number};
export type HolderInput={part:Part;holes:HolderHole[];side:1|-1;params:Record<string,number>;/** Carrier faces (z). */top:number;bottom:number;/** Pilot on the carrier, if the part needs one. */pilot?:{at:[number,number];d:number}};
export type Generator={id:string;label:string;params:HolderParam[];accepts:(part:Part)=>boolean;defaults:(part:Part)=>Record<string,number>;/** Height of the mounted face above the carrier. */lift:(params:Record<string,number>)=>number;build:(input:HolderInput)=>FeatureGeometry};

const empty=():FeatureGeometry=>({solids:[],holes:[],keep:[],ports:[]});
const up:[number,number,number,number]=[0,0,0,1],down:[number,number,number,number]=[1,0,0,0];
const merge=(list:FeatureGeometry[])=>list.reduce((a,b)=>({solids:[...a.solids,...b.solids],holes:[...a.holes,...b.holes],keep:[...a.keep,...b.keep],ports:[...a.ports,...b.ports]}),empty());
const through=(at:[number,number],d:number,top:number,bottom:number,extra=1)=>({kind:'cylinder' as const,frame:{position:[at[0],at[1],0] as [number,number,number],rotation:up},r:d/2,z0:bottom-extra,z1:top+extra});

export const generators:Generator[]=[
 {id:'dome',label:'Schraubdome',
  params:[{key:'height',label:'Domhöhe [mm]',step:.5,min:.5},{key:'outer',label:'Dom-Ø [mm]',step:.5,min:2},{key:'pilot',label:'Kernloch-Ø [mm]',step:.1,min:.5},{key:'through',label:'Loch durch die Platte (0/1)',step:1,min:0}],
  accepts:p=>p.holes.length>0&&p.mount==='board',
  defaults:p=>{const d=Math.max(...p.holes.map(h=>h.d));return {height:Math.max(4,Math.ceil(-p.box.min[2])+1),outer:Math.max(5,Math.round((d+3.2)*2)/2),pilot:Math.round((d-.4)*10)/10,through:0};},
  lift:p=>p.height,
  // The structure core's standoff, its head on the part's face: the same feature the housings stand their boards on.
  build:({holes,side,params,top,bottom})=>merge(holes.map(h=>{const face=side>0?top+params.height:bottom-params.height,frame:Frame={position:[h.at[0],h.at[1],face],rotation:side>0?up:down},g=featureGeometry({kind:'standoff',height:params.height,outer:params.outer,hole:params.pilot},frame);
   return {...g,solids:g.solids,keep:[],holes:params.through?[through(h.at,params.pilot,Math.max(face,top),Math.min(face,bottom))]:g.holes};}))},
 {id:'through',label:'Durchgangsbohrungen',
  params:[{key:'grow',label:'Bohrung größer als das Loch [mm]',step:.1,min:0}],
  accepts:p=>p.holes.length>0,
  defaults:()=>({grow:.4}),
  lift:()=>0,
  build:({holes,pilot,params,top,bottom})=>({...empty(),holes:[...holes.map(h=>through(h.at,h.d+params.grow,top,bottom)),...(pilot?[through(pilot.at,pilot.d,top,bottom)]:[])]})},
 {id:'none',label:'Nur aufgelegt',params:[],accepts:()=>true,defaults:()=>({}),lift:()=>0,build:empty},
];
export const generator=(id:string)=>generators.find(g=>g.id===id);
/** The holder a new part gets: a motor is bolted through, a board stands on domes. */
export const defaultHolder=(part:Part)=>{const g=part.mount==='flange'?generators[1]:generators.find(x=>x.accepts(part))!;return {kind:g.id,params:g.defaults(part)};};
