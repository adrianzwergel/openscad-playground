// A printed strut (Federbein) with a compression spring of the assortment, coil-over: a tube with the lower ball cup's
// thread, a rod sliding in its bore with a head that carries the upper cup's thread, the spring round the rod between
// the tube's end and the head. All sizes follow from the spring and the points: the rod as thick as the coil's inside
// allows, the tube long enough that the rod keeps a guide in it at full extension and stays clear of its bottom at block.
// Lengths along the strut from the lower ball centre (0) to the upper one (E); the cups' threads end `reach` from them.
import type {Spring,SpringCatalog} from '../../shaft/springs.ts';
import {springCatalog} from '../../shaft/springs.ts';
import type {Prim} from '../../structure/sdf.ts';
import type {Frame} from '../kinematics/math.ts';

/** What the user chooses: the spring, and how far it is compressed at the design pose (preload). */
export type StrutSpec={spring:string;preload:number};
/** Wall, play of the rod in its bore, depth of a cup's tapped hole, the head's length, the gap kept to block. */
/** The springs as the page knows them (measured where measured): set once the measures are read. */
let known:SpringCatalog=springCatalog();
export const setStrutSprings=(c:SpringCatalog)=>{known=c;};
export const strutSprings=()=>known;
export const STRUT={wall:1.6,play:.4,tap:2.5,tapDepth:9,head:10,block:.5};
export type Strut={spring:Spring;E:number;/** spring length at the design pose */Ls:number;rod:number;bore:number;tube:number;/** tube length from its end at the lower cup */tubeLen:number;
 /** rod length below the head */rodLen:number;guide:number;reach:number;/** eye to eye where the spring is at block (+0,5) and where it is free */Emin:number;Emax:number;issues:string[]};
const de=(x:number)=>String(+x.toFixed(1)).replace('.',',');
/** The strut between two ball centres `E` apart at the design pose. */
export function strutOf(spec:StrutSpec,E:number,reach:number,catalog:SpringCatalog=known):Strut|undefined{
 const spring=catalog[spec.spring];if(!spring)return undefined;const issues:string[]=[];
 if(spring.kind!=='druck')issues.push(`${spring.label}: ein Federbein braucht eine Druckfeder.`);
 const Lc=spring.Lc??spring.L0*.4,Ls=spring.L0-Math.max(0,spec.preload),inside=spring.D-2*spring.d,rod=Math.max(2.5,Math.floor((inside-.6)*2)/2),bore=rod+STRUT.play,tube=Math.round(Math.max(bore+2*STRUT.wall,spring.D+.4)*10)/10,guide=Math.max(8,1.5*rod);
 if(rod<3.5)issues.push(`${spring.label}: innen nur ${de(inside)} mm, die Stange wird ${de(rod)} mm dünn: lieber eine dickere Feder.`);
 // Tube: room for the lower tap, the rod's travel to block, and its guide when the spring is free.
 const rodLen=spring.L0+guide,minTube=STRUT.tapDepth+1+(rodLen-Lc-STRUT.block),tubeLen=E-2*reach-Ls-STRUT.head;
 if(tubeLen<minTube-1e-6)issues.push(`Federbein mit ${spring.label}: die Punkte sind ${de(E)} mm auseinander, es braucht mindestens ${de(E+minTube-tubeLen)} mm (oder weniger Vorspannung, eine kürzere Feder).`);
 if(spec.preload>spring.L0-Lc-STRUT.block)issues.push(`${spring.label}: ${de(spec.preload)} mm Vorspannung drückt sie auf Block.`);
 return {spring,E,Ls,rod,bore,tube,tubeLen:Math.max(tubeLen,minTube),rodLen,guide,reach,Emin:E-(Ls-Lc-STRUT.block),Emax:E+(spring.L0-Ls),issues};}
/** The strut at eye-to-eye length `L`: its spring's length and force; at block, loose (the spring free, the rod held only
 * by its guide), or pulled apart. */
export function strutAt(s:Strut,L:number){const Ls=s.Ls+(L-s.E),Lc=s.spring.Lc??0;return {Ls,F:Ls<s.spring.L0?s.spring.R*(s.spring.L0-Ls):0,block:Ls<Lc+STRUT.block-1e-6,loose:Ls>s.spring.L0+1e-6,apart:Ls>s.spring.L0+s.guide-2};}
/** The two printed parts, standing along z in `frame`, the lower ball centre at its origin: the tube (with the lower
 * tap and the bore) and the rod (with the head and the upper tap). */
export function strutSolids(s:Strut,part:'rohr'|'stange',frame:Frame={position:[0,0,0],rotation:[0,0,0,1]}):{solids:Prim[];holes:Prim[]}{
 const cyl=(r:number,z0:number,z1:number):Prim=>({kind:'cylinder',frame,r,z0,z1}),t=STRUT.tap/2,r=s.reach;
 if(part==='rohr'){const top=r+s.tubeLen;return {solids:[cyl(s.tube/2,r,top)],holes:[cyl(t,r-1,r+STRUT.tapDepth),cyl(s.bore/2,r+STRUT.tapDepth+1,top+1)]};}
 const top=s.E-r,head=top-STRUT.head;return {solids:[cyl(s.spring.D/2,head,top),cyl(s.rod/2,head-s.rodLen,head+.5)],holes:[cyl(t,top-STRUT.tapDepth,top+1)]};}
/** The shortest eye-to-eye length a strut with this spring can have at its design pose. */
export function strutShortest(spec:StrutSpec,reach:number,catalog:SpringCatalog=known){const s=strutOf(spec,1000,reach,catalog);if(!s)return 0;return 1000-s.tubeLen+(STRUT.tapDepth+1+s.rodLen-(s.spring.Lc??0)-STRUT.block);}
