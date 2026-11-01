// Teil A: bearing plan on the three demos with their adopted trains. Every shaft line gets its seats,
// no seat hits a wheel, a motor or another seat, and the parts list is complete.
import assert from 'node:assert/strict';
import {adopted} from './adopted.mjs';
import {planBearings} from '../../src/mechanics/kinematics/bearings.ts';
const selected=process.argv.slice(2).length?process.argv.slice(2):['robot','cnc','sled'];
for(const name of selected){
 const {mechanism:m,drives,asset}=await adopted(name),plan=planBearings(m,drives,id=>id===asset.id?asset:undefined);
 console.log(`== ${name}: ${plan.lines.length} Wellenlinien, ${plan.seats.length} Haltepunkte`);
 for(const l of plan.lines)console.log(`  ${l.state==='pass'?'✓':'✗'} ${l.id} [${l.kind}, ${l.link}, Ø${l.d}, ${l.z0.toFixed(0)}…${l.z1.toFixed(0)}] ${l.message} → ${l.seats.map(id=>{const s=plan.seats.find(x=>x.id===id);return `${s.kind}${s.part?':'+s.part:''}@${s.link}`;}).join(', ')}`);
 for(const s of plan.seats.filter(x=>x.kind==='flange'||x.kind==='nut'))console.log(`  ◆ ${s.id} ${s.kind} auf ${s.link}`);
 console.log('  Stückliste:',plan.bom.map(b=>`${b.count}× ${b.label}`).join(' · '));
 assert.ok(plan.lines.every(l=>l.state==='pass'),name+': nicht alle Linien gelagert');
}
console.log('Lagerplanung: alle Wellenlinien gelagert.');
