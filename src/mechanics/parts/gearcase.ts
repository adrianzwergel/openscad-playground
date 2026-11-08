// A housing for the wheels of a starr group: two bearing shields across the shafts, beside the wheels, with a hole for
// every shaft exactly at its axis distance, and a floor joining them. Holes: LEGO axles run in 4.8 mm plus play, other
// shafts in their diameter plus play. Coordinates are the Studio's room: shafts run along y, the train's plane is x and
// height (z).
import type {Prim} from '../../structure/sdf.ts';
import type {Train} from './train.ts';
import {outerOf} from './train.ts';
import {axisAngle} from '../kinematics/math.ts';
import type {V} from '../kinematics/math.ts';

export type GearCase={wall:number;gap:number;clearance:number;margin:number;floor:number};
export const defaultGearCase:GearCase={wall:3,gap:1.5,clearance:.3,margin:5,floor:3};
const alongY=axisAngle([1,0,0],-90);
/** The housing of these wheels (by id): solids, holes, its outer size and the hole of each shaft. */
export function gearCase(t:Train,wheels:ReadonlySet<string>,c:GearCase=defaultGearCase){
 const own=t.wheels.filter(w=>wheels.has(w.id));if(!own.length)throw Error('Keine Räder in der Gruppe.');
 const shafts=t.shafts.filter(s=>own.some(w=>w.shaft===s.id)),y0=Math.min(...own.map(w=>w.z-w.width/2))-c.gap,y1=Math.max(...own.map(w=>w.z+w.width/2))+c.gap;
 const x0=Math.min(...own.map(w=>t.shafts.find(s=>s.id===w.shaft)!.at[0]-outerOf(w)))-c.margin,x1=Math.max(...own.map(w=>t.shafts.find(s=>s.id===w.shaft)!.at[0]+outerOf(w)))+c.margin;
 const z0=Math.min(...own.map(w=>t.shafts.find(s=>s.id===w.shaft)!.at[1]-outerOf(w)))-c.margin,z1=Math.max(...own.map(w=>t.shafts.find(s=>s.id===w.shaft)!.at[1]+outerOf(w)))+c.margin;
 const cx=(x0+x1)/2,hx=(x1-x0)/2,hz=(z1-z0)/2,cz=(z0+z1)/2;
 const shield=(y:number):Prim=>({kind:'box',frame:{position:[cx,y,cz],rotation:[0,0,0,1]},half:[hx,c.wall/2,hz]});
 const solids:Prim[]=[shield(y0-c.wall/2),shield(y1+c.wall/2),{kind:'box',frame:{position:[cx,(y0+y1)/2,z0-c.floor/2],rotation:[0,0,0,1]},half:[hx,(y1-y0)/2+c.wall,c.floor/2]}];
 const bores=shafts.map(s=>{const lego=own.some(w=>w.shaft===s.id&&w.part)||s.kind==='lego',d=(lego?4.8:s.d??5)+2*c.clearance;return {shaft:s.id,d,at:s.at};});
 const holes:Prim[]=bores.map(h=>({kind:'cylinder',frame:{position:[h.at[0],0,h.at[1]],rotation:alongY},r:h.d/2,z0:y0-c.wall-5,z1:y1+c.wall+5}));
 return {solids,holes,outer:[x1-x0,y1-y0+2*c.wall,z1-z0+c.floor] as V,bores};}
