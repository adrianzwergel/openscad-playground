// Drive loads (loads.ts): lead screw thrust from torque, efficiency and lead; tooth forces on the seats of every
// train shaft, growing with the torque down the train; the pinion on the sled's rail loads the rail.
import assert from 'node:assert/strict';
import {adopted} from './adopted.mjs';
import {planBearings,applyBearings} from '../../src/mechanics/kinematics/bearings.ts';
import {driveLoads,defaultDriveLoads} from '../../src/mechanics/kinematics/loads.ts';
import {driveSpec} from '../../src/mechanics/kinematics/drive.ts';
const close=(a,b,tol,what)=>assert.ok(Math.abs(a-b)<=tol,`${what}: ${a} vs ${b}`);
const prepared=async name=>{const {mechanism:m,drives,asset}=await adopted(name),plan=planBearings(m,drives,id=>id===asset.id?asset:undefined);applyBearings(m,plan);return {m,drives,plan};};

// CNC Z: TR8×2 on a NEMA 17 → thrust 2π·T·η/lead into the fixed bearing and, opposite, into the nut.
{const {m,drives,plan}=await prepared('cnc'),c=driveLoads(m,drives,plan).find(x=>x.drive==='M3');
 const thrust=2*Math.PI*driveSpec('nema17').torque*1000*defaultDriveLoads.factor*defaultDriveLoads.efficiency/2;
 const fixed=c.forces.get('M3/s0/lager1'),nut=c.forces.get('Z/mutter');
 close(Math.hypot(...fixed),thrust,1e-6,'Schub ins Festlager');close(Math.hypot(...nut),thrust,1e-6,'Schub in die Mutter');
 assert.ok(!c.forces.has('M3/s0/lager2'),'Loslager ohne Schub');}

// Robot: seats on several train shafts are loaded, and more towards the output, where the torque is larger.
{const {m,drives,plan}=await prepared('robot');
 for(const c of driveLoads(m,drives,plan)){const shafts=[...new Set([...c.forces.keys()].filter(k=>/\/s\d\/lager/.test(k)).map(k=>k.replace(/\/lager\d$/,'')))];
  assert.ok(shafts.length>=2,`${c.drive}: Lasten auf mehreren Getriebewellen`);
  const size=id=>[...c.forces].filter(([k])=>k.startsWith(id+'/')).reduce((t,[,v])=>t+Math.hypot(...v),0);
  assert.ok(size(shafts.at(-1))>size(`${c.drive}/s0`)||!c.forces.has(`${c.drive}/s0/lager1`),`${c.drive}: Last wächst mit dem Moment`);}}

// Sled: the pinion's tooth force goes into the rail (applied at the holders one at a time).
{const {m,drives,plan}=await prepared('sled'),[c]=driveLoads(m,drives,plan);
 assert.ok(c.rail&&c.rail.tangential>0&&c.rail.radial>0,'Schiene belastet');close(c.rail.radial/c.rail.tangential,Math.tan(20*Math.PI/180),1e-9,'Eingriffswinkel');}
console.log('Antriebslasten: Spindelschub, Zahnkräfte entlang des Getriebes, Ritzel auf der Schiene geprüft.');
