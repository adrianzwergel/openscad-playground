import {resolveMixed} from './mixed.ts';
import type {Project,Vec3} from './model.ts';
import {resolveProject,parseProject,serializeProject} from './model.ts';
import {resolveSpatial} from './spatial.ts';
import {resolveMotion} from './motion.ts';
export const VARIANT_KEY='mechanics10.variants.v1';
export function readVariants(text:string):Project[]{const data=JSON.parse(text);if(!Array.isArray(data)||data.length>8)throw Error('Maximal acht Varianten erlaubt.');return data.map(p=>parseProject(JSON.stringify(p)));}
export function snapshot(p:Project){return parseProject(serializeProject(p));}
export function metrics(p:Project){
 if(p.mixed){const m=p.mixed,a=m.selected?resolveMixed(m,m.selected):null;return {kind:'mixed',detail:a?`Schnecke → ${a.c.kind}`:'Noch keine Kette gewählt',value:a?.ratio??0,unit:':1',valid:a?.valid??false,checks:a?.checks??[],ports:[{name:'input',position:m.input,axis:[1,0,0] as Vec3},{name:'output',position:m.output,axis:[0,0,1] as Vec3}]};}
 if(p.spatial){const a=resolveSpatial(p.spatial);return {kind:p.spatial.kind,detail:`${p.spatial.teeth} Zähne · ${p.spatial.kind==='worm'?p.spatial.starts+' Gänge · ':''}${p.spatial.clearance} mm Freiraum`,value:a.ratio,unit:':1',valid:a.valid,checks:a.checks,ports:a.ports.map(s=>({name:s.name,position:s.position as Vec3,axis:s.axis as Vec3}))};}
 if(p.motion){const a=resolveMotion(p.motion);return {kind:p.motion.kind,detail:p.motion.kind==='belt'?`${p.motion.teethA}/${p.motion.teethB} Zähne · ${p.motion.beltLength} mm Riemen`:`${p.motion.stroke} mm Hub · ${p.motion.guideLength} mm Führung`,value:p.motion.kind==='belt'?a.ratio:a.mmPerTurn,unit:p.motion.kind==='belt'?':1':'mm/U',valid:a.valid,checks:a.checks,ports:a.ports.map((s,i)=>({name:i?'output':'input',position:s.position as Vec3,axis:s.axis as Vec3}))};}
 const a=resolveProject(p);return {kind:'spur',detail:`${a.shaftCount} Wellen · ${a.layers} Ebenen · ${a.bounds.width.toFixed(1)} × ${a.bounds.height.toFixed(1)} mm`,value:a.ratio,unit:':1',valid:a.valid,checks:a.checks,ports:(['input','output'] as const).map(name=>({name,position:p.axes[name],axis:[0,0,1] as Vec3}))};
}
export type Rotor={id:string;position:Vec3;axis:Vec3;radius:number;angle:number};
export function rotors(p:Project,angle:number):Rotor[]{
 if(p.mixed){if(!p.mixed.selected)return [];const a=resolveMixed(p.mixed,p.mixed.selected),gain=a.c.starts/a.c.wheel,sg=resolveProject(a.gearProject).components;return [
 {id:'Schnecke',position:[a.origin[0],p.mixed.input[1],p.mixed.input[2]],axis:[1,0,0],radius:12,angle},
 {id:'Schneckenrad',position:a.origin,axis:[0,0,1],radius:a.w.wheelRadius,angle:angle*gain},
 {id:'Oberstufe Eingang',position:[a.origin[0],a.origin[1],p.mixed.output[2]],axis:[0,0,1],radius:a.c.kind==='spur'?a.c.za:a.c.za/Math.PI,angle:a.angle+angle*gain},
 {id:'Oberstufe Ausgang',position:p.mixed.output,axis:[0,0,1],radius:a.c.kind==='spur'?a.c.zb:a.c.zb/Math.PI,angle:a.angle+(a.c.kind==='spur'?sg[1].spin:0)+angle*(a.c.kind==='spur'?-1:1)/a.ratio}];}

 if(p.spatial){const a=resolveSpatial(p.spatial);return a.shafts.map((s,i)=>({id:s.name,position:s.origin,axis:s.axis,radius:i?a.wheelRadius:p.spatial!.kind==='worm'?12:20,angle:(p.spatial!.phase+angle)*(i?a.outputGain:1)}));}
 if(p.motion){const a=resolveMotion(p.motion);if(p.motion.kind!=='belt')return [];return [{id:'Eingang',position:[0,0,20],axis:[0,0,1],radius:a.r,angle},{id:'Ausgang',position:[a.c,0,20],axis:[0,0,1],radius:a.R,angle:angle/a.ratio}];}
 return resolveProject(p).components.map(c=>({id:c.id,position:c.position,axis:[0,0,1],radius:c.gear.module*c.gear.teeth/2,angle:c.spin+angle*c.speed}));
}
// View-only displacement. Never used to manufacture parts or evaluate clearances.
export function projectPoint(v:Vec3,view:string):[number,number]{return view==='xy'?[v[0],-v[1]]:view==='xz'?[v[0],-v[2]]:view==='yz'?[v[1],-v[2]]:[v[0]-.65*v[1],-v[2]+.35*v[0]+.35*v[1]];}
export function rim(r:Rotor,t:number,explode:number):Vec3{
 const a=r.axis,base:Vec3=Math.abs(a[2])>.5?[1,0,0]:[0,0,1];
 const b:Vec3=[a[1]*base[2]-a[2]*base[1],a[2]*base[0]-a[0]*base[2],a[0]*base[1]-a[1]*base[0]];
 return r.position.map((n,i)=>n+a[i]*explode+r.radius*(base[i]*Math.cos(t)+b[i]*Math.sin(t))) as Vec3;
}
