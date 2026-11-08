// Connections of a build, as CAD assemblies have them. Every part and plate is connected to one other thing: the world,
// a link of the model, a shaft, a loose wheel, another part or a plate (`Free.body`). The connection is fixed, or it
// turns about an axis through a pivot, or it slides along one, in the directions of what it is connected to (the
// world: X, Y, Z); then it moves between `min` and
// `max`, and with an input a slider drives it. Wheels sit on shafts, shafts turn (or stand) in the world: parts/train.ts.
// What is connected to something that moves goes with it: bodyFrames chains the frames from the world outwards.
import type {Build,Free} from './build.ts';
import {compose,axisAngle} from '../kinematics/math.ts';
import type {Frame,V} from '../kinematics/math.ts';

export type Axis='x'|'y'|'z';
export type Joint={kind:'drehen'|'schieben';axis:Axis;/** Pivot of a turning joint in the frame of what it is connected to; without, where the part stands. */at?:V;min:number;max:number;/** Driven by this drive, with a slider. */input?:{drive:string}};
export const itemBody=(id:string)=>`teil:${id}`;
export const plateBody=(id:string)=>`platte:${id}`;
const unit:Record<Axis,V>={x:[1,0,0],y:[0,1,0],z:[0,0,1]};
/** How far a joint has moved, in the frame of what it is connected to: turned about its pivot or shifted along its axis. */
export function jointMove(j:Joint,value:number,pivot:V=[0,0,0]):Frame{const v=Math.min(j.max,Math.max(j.min,value));
 if(j.kind==='schieben')return {position:unit[j.axis].map(k=>k*v) as V,rotation:[0,0,0,1]};
 const p=j.at??pivot,q=axisAngle(unit[j.axis],v);return compose(compose({position:p,rotation:[0,0,0,1]},{position:[0,0,0],rotation:q}),{position:p.map(k=>-k) as V,rotation:[0,0,0,1]});}
/** The frame of every part and plate in the room, joints moved by `values` (by body), each on the frame of what it is
 * connected to; `base` holds the frames of the world's bodies (links of the model, shafts, loose wheels). */
export function bodyFrames(b:Build,base:Record<string,Frame>,values:Record<string,number>={}):Record<string,Frame>{
 const out:Record<string,Frame>={},free=new Map<string,Free>([...b.items.filter(i=>i.free).map(i=>[itemBody(i.id),i.free!] as const),...b.plates.map(p=>[plateBody(p.id),p.free] as const)]),busy=new Set<string>();
 const frameOf=(key:string):Frame|undefined=>{if(out[key])return out[key];const f=free.get(key);if(!f)return base[key];if(busy.has(key))return undefined;busy.add(key);
  const parent=f.body?frameOf(f.body):undefined,j=f.joint,local=j?compose(jointMove(j,values[key]??0,f.frame.position),f.frame):f.frame,moved=parent?compose(parent,local):local;busy.delete(key);out[key]=moved;return moved;};
 for(const key of free.keys())frameOf(key);return out;}
/** Bodies a part may be connected to without a loop: everything but itself and what hangs on it. */
export function hangsOn(b:Build,key:string){const below=new Set([key]);for(let grew=true;grew;){grew=false;for(const [k,f] of [...b.items.filter(i=>i.free).map(i=>[itemBody(i.id),i.free!] as const),...b.plates.map(p=>[plateBody(p.id),p.free] as const)])if(f.body&&below.has(f.body)&&!below.has(k)){below.add(k);grew=true;}}return below;}
export function parseJoint(j:unknown):Joint|undefined{if(j===undefined)return undefined;const x=j as Joint;if(!x||x.kind!=='drehen'&&x.kind!=='schieben'||!(x.axis in unit)||!Number.isFinite(x.min)||!Number.isFinite(x.max)||x.min>x.max||x.at!==undefined&&(!Array.isArray(x.at)||x.at.length!==3||!x.at.every(Number.isFinite))||x.input!==undefined&&typeof x.input?.drive!=='string')throw Error('Aufbau: Verbindung ungültig');return structuredClone(x);}
