// Holder generators: how a part is fastened to whatever carries it. Every generator answers with the same
// FeatureGeometry the structure core uses, so a carrier (plate today, housing and frame later) takes any holder
// without knowing it, and a new holder only has to be registered here.
import type {Part} from './catalog.ts';
import {featureGeometry,snapStrain} from '../../structure/features.ts';
import type {FeatureGeometry,Feature} from '../../structure/features.ts';
import type {Frame} from '../../structure/vec.ts';
import {quaternionFromBasis,cross} from '../kinematics/math.ts';
import type {V} from '../kinematics/math.ts';

export type HolderParam={key:string;label:string;step?:number;min?:number};
/** A hole of the placed part: `at` on the carrier (mm), its Ø as chosen; `side` +1: the part sits on the carrier's top. */
export type HolderHole={at:[number,number];d:number};
export type HolderInput={part:Part;holes:HolderHole[];side:1|-1;params:Record<string,number>;/** Carrier faces (z). */top:number;bottom:number;/** Pilot on the carrier, if the part needs one. */pilot?:{at:[number,number];d:number};/** Part frame → carrier. */map:(p:[number,number])=>[number,number]};
export type Generator={id:string;label:string;params:HolderParam[];accepts:(part:Part)=>boolean;defaults:(part:Part)=>Record<string,number>;/** Height of the mounted face above the carrier. */lift:(params:Record<string,number>)=>number;build:(input:HolderInput)=>FeatureGeometry};

const empty=():FeatureGeometry=>({solids:[],holes:[],keep:[],ports:[]});
const up:[number,number,number,number]=[0,0,0,1],down:[number,number,number,number]=[1,0,0,0];
const merge=(list:FeatureGeometry[])=>list.reduce((a,b)=>({solids:[...a.solids,...b.solids],holes:[...a.holes,...b.holes],keep:[...a.keep,...b.keep],ports:[...a.ports,...b.ports]}),empty());
const through=(at:[number,number],d:number,top:number,bottom:number,extra=1)=>({kind:'cylinder' as const,frame:{position:[at[0],at[1],0] as [number,number,number],rotation:up},r:d/2,z0:bottom-extra,z1:top+extra});

// ---------- clip ----------
/** The arm that holds a board of thickness `t` on supports `height` high: its catch just above the board. */
export const clipArm=(t:number,p:Record<string,number>):Extract<Feature,{kind:'snap'}>=>({kind:'snap',length:p.height+t+p.fit+1.5*p.lip+1,width:p.width,thickness:p.thickness,lip:p.lip});
/** A clip around a board's outline: two spring arms on the long sides, where the plugs of small boards seldom are;
 * supports and stops at the short ends, because pin rows run along the long sides. All in the part's frame. */
export function clipLayout(part:Part,p:Record<string,number>){
 const [l,w,t]=part.size,long=l>=w,half:[number,number]=long?[l/2,w/2]:[w/2,l/2],at=(a:number,c:number):[number,number]=>long?[a,c]:[c,a],gap=half[1]+p.fit;
 return {t,arms:[1,-1].map(s=>({at:at(p.shift,s*gap),inward:at(0,-s)})),
  posts:[1,-1].map(s=>({at:at(s*(half[0]-Math.min(2,half[1]/2)),0),feature:{kind:'standoff' as const,height:p.height,outer:Math.min(5,half[1]),hole:0}})),
  stops:[1,-1].map(s=>({at:at(s*(half[0]+p.fit+1),0),feature:{kind:'standoff' as const,height:p.height+.7*t,outer:2,hole:0}}))};
}
/** Frame on a carrier face: +x pointing `inward` for an arm, z away from the face. */
const armFrame=(position:V,inward:[number,number],side:1|-1):Frame=>{const z:V=[0,0,side],x:V=[inward[0],inward[1],0];return {position,rotation:quaternionFromBasis(x,cross(z,x),z)};};
const unitOf=(a:[number,number],b:[number,number]):[number,number]=>{const l=Math.hypot(b[0]-a[0],b[1]-a[1])||1;return [(b[0]-a[0])/l,(b[1]-a[1])/l];};
const clipDefaults=(part:Part)=>{const t=part.size[2],p={height:Math.max(3,Math.ceil(-part.box.min[2])+1),fit:.2,thickness:1.2,width:6,lip:1,shift:0};while(snapStrain(clipArm(t,p))>.018)p.height+=.5;return p;};

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
 {id:'clip',label:'Clip (Federarme)',
  params:[{key:'height',label:'Auflagehöhe [mm]',step:.5,min:.5},{key:'fit',label:'Luft um das Teil [mm]',step:.05,min:0},{key:'thickness',label:'Armdicke [mm]',step:.1,min:.6},{key:'width',label:'Armbreite [mm]',step:.5,min:2},{key:'lip',label:'Hakentiefe [mm]',step:.1,min:.3},{key:'shift',label:'Arme längs verschieben [mm]',step:1}],
  accepts:p=>p.mount==='board'&&p.size[2]<=4,
  defaults:clipDefaults,
  lift:p=>p.height,
  build:({part,side,params,top,bottom,map})=>{const c=clipLayout(part,params),base=side>0?top:bottom,arm=clipArm(c.t,params);
   const face=(at:[number,number],rise:number,rotation=side>0?up:down):Frame=>{const q=map(at);return {position:[q[0],q[1],base+side*rise],rotation};};
   return merge([...c.arms.map(a=>{const q=map(a.at),inner=map([a.at[0]+a.inward[0],a.at[1]+a.inward[1]]);return featureGeometry(arm,armFrame([q[0],q[1],base],unitOf(q,inner),side));}),
    ...c.posts.map(x=>featureGeometry(x.feature,face(x.at,x.feature.height))),...c.stops.map(x=>featureGeometry(x.feature,face(x.at,x.feature.height)))].map(g=>({...g,keep:[]})));}},
 {id:'none',label:'Nur aufgelegt',params:[],accepts:()=>true,defaults:()=>({}),lift:()=>0,build:empty},
];
export const generator=(id:string)=>generators.find(g=>g.id===id);
/** The holder a new part gets: a motor is bolted through, a board stands on domes, one without holes in a clip. */
export const defaultHolder=(part:Part)=>{const g=part.mount==='flange'?generators[1]:generators.find(x=>x.accepts(part))!;return {kind:g.id,params:g.defaults(part)};};
