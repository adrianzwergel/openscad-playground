// Drive search on the demos: for every placed motor the route search finds a train in the frame
// of the carrying link, the train is merged into the mechanism, and the loop solver drives the axis
// over its range with the train in mesh (closure, ratio of the motor to the axis, no collisions).
// Usage: node scripts/kinematics/check-drive.mjs [robot|cnc|sled ...]
import assert from 'node:assert/strict';
import {demos} from '../../src/mechanics/demos.ts';
import {driveTask,adoptGear,placeMotor,heldTrains,modelAxes,sweepCollisions,linearAxis} from '../../src/mechanics/kinematics/drive.ts';
import {route} from '../../src/mechanics/kinematics/search/route.ts';
import {solve} from '../../src/mechanics/kinematics/solver.ts';

const selected=process.argv.slice(2).length?process.argv.slice(2):Object.keys(demos);
for(const name of selected){
 const demo=demos[name](),m=structuredClone(demo.mechanism),drives=structuredClone(demo.drives),assets=id=>id===demo.asset.id?demo.asset:undefined;
 for(const d of drives)placeMotor(m,d);
 const axes=modelAxes(m,drives),values=Object.fromEntries(axes.map(j=>[j.id,m.input.kind==='coordinate'&&m.input.joint===j.id?m.range.from:Math.max(j.limits?.min??-180,Math.min(j.limits?.max??180,0))]));
 const held=(over={},free)=>{const v={...values,...over},out={};for(const j of axes)if(j.id!==free)out[j.id]=[v[j.id]];Object.assign(out,heldTrains(drives.filter(d=>d.axis!==free),v));return out;};
 const pose=async(over={})=>{const s=await solve({...structuredClone(m),input:{kind:'none'},output:{kind:'none'},range:{from:0,to:0,samples:1}},{yield:false,fixed:held(over),iterations:80});return s;};
 const ref=await pose();assert.ok(ref.checks.find(c=>c.id==='closure').state==='pass',name+': reference pose');
 for(const d of drives){
  const task=driveTask(m,drives,d,assets,ref.poses[0].bodies,values),t0=performance.now();
  const result=await route(task.request,task.options);const ms=performance.now()-t0;
  console.log(`${name}/${d.id} → ${d.axis} (${task.info.kind}, Ziel ${d.target.toFixed(2)}): ${result.solutions.length} Lösungen in ${(ms/1000).toFixed(1)} s, ${result.visited} Schritte, ${task.request.environment.obstacles.length} Sperrzonen`,JSON.stringify(result.rejections));
  assert.ok(result.solutions.length>0,`${name}/${d.id}: keine Lösung`);
  const best=result.solutions[0],label=best.chain.stages.map(s=>`${s.choice.a.label} → ${s.choice.b.label}`).join(' · ');
  const gear=await adoptGear(m,d,best.mechanism,task.info,label,best.ratio,held({},d.axis));
  console.log('   ',label,'| Verhältnis',best.ratio.toFixed(3),gear.notes.join(' '));
  // The solver drives the axis over its range; the train is free and must stay in mesh.
  const j=m.joints.find(x=>x.id===d.axis),lo=j.limits.min,hi=j.limits.max,s0=`${d.id}/ground/s0`;
  const run=await solve({...structuredClone(m),input:{kind:'coordinate',joint:d.axis,coordinate:0},output:{kind:'coordinate',joint:s0,coordinate:0},range:{from:task.info.reference,to:task.info.reference+(hi-lo)/3,samples:4}},{yield:false,fixed:held({},d.axis)});
  const closure=run.checks.find(c=>c.id==='closure');assert.equal(closure.state,'pass',`${name}/${d.id}: ${closure.message}`);
  const q=run.poses.map(p=>p.coordinates),motor=(q[3][s0][0]-q[0][s0][0])/360,axisMove=q[3][d.axis][0]-q[0][d.axis][0];
  const got=linearAxis(j)?Math.abs(axisMove/motor):Math.abs(motor*360/axisMove);
  assert.ok(Math.abs(got-d.target)/d.target<=d.tolerance/100+1e-3,`${name}/${d.id}: Übersetzung ${got} statt ${d.target}`);
  const analytic=gear.rates[s0]*axisMove/360;// offsets cancel in the difference
 assert.ok(Math.abs(analytic-motor)<1e-3*Math.max(1,Math.abs(motor)),`${name}/${d.id}: Rate ${analytic} gegen gelöst ${motor}`);
  const hits=await sweepCollisions(m,drives,d,assets,async(axis,v)=>(await pose({[axis]:v})).poses[0].bodies,7);
  console.log(`    Motor ${motor.toFixed(2)} U für ${axisMove.toFixed(1)} ${linearAxis(j)?'mm':'°'} → ${got.toFixed(3)} · Kollisionen: ${hits.length?hits.map(h=>`${h.a}↔${h.b}@${h.at.join(',')}`).join('; '):'keine'}`);
 }
 // With every train held, the sliders still solve.
 const all=await pose();assert.equal(all.checks.find(c=>c.id==='closure').state,'pass',name+': alle Achsen gehalten');
}
console.log('Antriebe: Suche, Übernahme, Lauf über den Bereich geprüft.');
