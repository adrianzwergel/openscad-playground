// Demo mechanisms with every drive's first train adopted (deterministic search), cached per run.
import {demos} from '../../src/mechanics/demos.ts';
import {driveTask,adoptGear,placeMotor,heldTrains,modelAxes} from '../../src/mechanics/kinematics/drive.ts';
import {route} from '../../src/mechanics/kinematics/search/route.ts';
import {solve} from '../../src/mechanics/kinematics/solver.ts';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
export async function adopted(name){
 const cache=path.join(os.tmpdir(),`adopted-${name}.json`);const demo=demos[name]();
 const src=fs.readFileSync(new URL('../../src/mechanics/kinematics/drive.ts',import.meta.url),'utf8')+fs.readFileSync(new URL('../../src/mechanics/demos.ts',import.meta.url),'utf8');
 const key=String(src.length);
 if(fs.existsSync(cache)){const c=JSON.parse(fs.readFileSync(cache,'utf8'));if(c.key===key)return {...c,asset:demo.asset};}
 const m=structuredClone(demo.mechanism),drives=structuredClone(demo.drives);for(const d of drives)placeMotor(m,d);
 const axes=modelAxes(m,drives),values=Object.fromEntries(axes.map(j=>[j.id,m.input.kind==='coordinate'&&m.input.joint===j.id?m.range.from:Math.max(j.limits?.min??-180,Math.min(j.limits?.max??180,0))]));
 const held=(free)=>{const out={};for(const j of axes)if(j.id!==free)out[j.id]=[values[j.id]];Object.assign(out,heldTrains(drives.filter(d=>d.axis!==free),values));return out;};
 const ref=await solve({...structuredClone(m),input:{kind:'none'},output:{kind:'none'},range:{from:0,to:0,samples:1}},{yield:false,fixed:held()});
 for(const d of drives){const task=driveTask(m,drives,d,id=>id===demo.asset.id?demo.asset:undefined,ref.poses[0].bodies,values);const r=await route(task.request,task.options);const best=r.solutions[0];
  await adoptGear(m,d,best.mechanism,task.info,best.chain.stages.map(s=>s.choice.a.label+'→'+s.choice.b.label).join(' · '),best.ratio,held(d.axis));}
 const out={key,mechanism:m,drives,values};fs.writeFileSync(cache,JSON.stringify(out));return {...out,asset:demo.asset};
}
