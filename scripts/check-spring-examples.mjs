// The examples of springs and clutches: each opens clean and does what its text says.
// Shaft generator "Rutschkupplung zwischen zwei 685", gearbox "LEGO-Rocker mit Rückholfeder", Studio "Schwinge mit
// gedrucktem Federbein".
import assert from 'node:assert/strict';
import {shaftExamples} from '../src/shaft/examples.ts';import {planShaft} from '../src/shaft/plan.ts';import {parseShaft} from '../src/shaft/model.ts';
import {gearExamples} from '../src/gear/examples.ts';import {planGear} from '../src/gear/plan.ts';import {parseGear} from '../src/gear/model.ts';
import {buildExamples} from '../src/mechanics/parts/examples.ts';import {newBuild} from '../src/mechanics/parts/build.ts';import {linkageIssues,sweep} from '../src/mechanics/parts/linkage.ts';
const bad=issues=>issues.filter(i=>i.level==='fehler'||i.level==='warnung').map(i=>i.message);
// Shaft: the clutch slips at about 3 N·cm.
const sd=parseShaft(shaftExamples.find(e=>e.key==='kupplung').make()),sp=planShaft(sd),k=sp.placed.find(t=>t.clutch);assert.deepEqual(bad(sp.issues),[]);assert.ok(k.clutch.T>25&&k.clutch.T<40,`${k.clutch.T} N·mm`);
// Gearbox: the spring from frame to rocker, 2,7 to 6,9 N over ±15°, never slack.
const gx=gearExamples.find(e=>e.key==='rocker-feder'),files=Object.fromEntries(gx.shafts.map(s=>[s.key,{name:s.name,doc:s.doc}])),ids=Object.fromEntries(gx.shafts.map(s=>[s.key,s.key]));
const gp=planGear(parseGear(gx.make(ids)),files),f=gp.springs[0];assert.deepEqual(bad(gp.issues),[]);assert.ok(f&&f.range.F[0]>2.5&&f.range.F[1]<7.5&&f.poses.every(q=>q.s>0),JSON.stringify(f?.range));assert.equal(gp.splits.length,2);
// Studio: the swing arm with the printed strut, determined, in its range over the whole way, the spring's force rising.
const b=newBuild('b','Teile');buildExamples.find(e=>e.key==='federbein').make(b);assert.deepEqual(linkageIssues(b.linkage).map(i=>i.message),[]);
const rows=sweep(b.linkage,{now:{},rest:{}},13),d=rows.map(r=>r.reading.dampers[0]);assert.ok(rows.every(r=>r.error<1e-3),'schließt');assert.ok(d.every(x=>x.fits),'im Hub');
assert.ok(rows.every(r=>Math.abs(r.reading.toe)<.01),'Längsschwinge: keine Spur');const F=d.map(x=>x.force),lift=rows.map(r=>r.reading.lift);assert.ok(Math.min(...F)>.5&&Math.max(...F)>Math.min(...F)+5,`Kraft ${Math.min(...F)}–${Math.max(...F)}`);
console.log(`Beispiele: Rutschkupplung ${(k.clutch.T/10).toFixed(1)} N·cm; Rocker mit Rückholfeder ${f.range.F.map(v=>v.toFixed(1)).join('–')} N; Schwinge mit Federbein Radhub ${Math.min(...lift).toFixed(1)}…${Math.max(...lift).toFixed(1)} mm, Feder ${Math.min(...F).toFixed(1)}–${Math.max(...F).toFixed(1)} N.`);
