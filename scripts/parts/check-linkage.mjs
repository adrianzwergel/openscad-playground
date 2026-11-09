// Linkages from hardpoints: a pushrod corner of a 1:10 formula car is determined, closes at every pose of its slider,
// lifts the wheel, compresses the damper, gains negative camber; its printed links, brackets and shopping list come
// from the points alone. Broken ones say what is missing; the file is checked.
import assert from 'node:assert/strict';
import {pushrodCorner,solveLinkage,read,sweep,motionRatio,freedomOf,linkageIssues,linkSolids,mountSolids,linkageShopping,parseLinkage,linkBody,LinkageSolver} from '../../src/mechanics/parts/linkage.ts';
const g={links:pushrodCorner()},around={now:{},rest:{}};
assert.equal(freedomOf(g),0,'bestimmt');assert.deepEqual(linkageIssues(g),[]);
const p0=solveLinkage(g,around,{unten:0});assert.ok(p0.error<1e-6);assert.ok(Math.abs(read(g,p0).lift)<1e-6);
const t0=performance.now(),up=solveLinkage(g,around,{unten:6},p0.x),ms=performance.now()-t0;assert.ok(up.error<1e-6,`schließt bei 6°: ${up.error}`);
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]),rod=g.links.find(l=>l.id==='pushrod');
assert.ok(Math.abs(dist(up.at(rod.points[0].body,rod.points[0].at),up.at(rod.points[1].body,rod.points[1].at))-dist(rod.points[0].at,rod.points[1].at))<1e-6,'Pushrod behält die Länge');
const r=read(g,up);assert.ok(r.lift>3,`Rad federt ein: ${r.lift}`);assert.ok(r.dampers[0].travel>0,'Dämpfer wird kürzer');assert.ok(r.camber<0,`negativer Sturz beim Einfedern: ${r.camber}`);
const rows=sweep(g,around,21);assert.equal(rows.length,21);assert.ok(rows.every(x=>x.error<1e-5),'ganzer Bereich schließt');
const mr=motionRatio(rows);assert.ok(mr>.3&&mr<2,`Motion Ratio ${mr}`);
// Steps of a slider: the solver keeps the last pose.
const s=new LinkageSolver();s.solve(g,around,{unten:1});const t1=performance.now();for(let k=2;k<=8;k++)s.solve(g,around,{unten:k});const step=(performance.now()-t1)/7;
// Something missing: without the tie rod the carrier turns about its ball joints.
const loose={links:g.links.filter(l=>l.id!=='spur')};assert.equal(freedomOf(loose),1);assert.match(linkageIssues(loose).at(-1).message,/1 freie Bewegung/);
const bad=structuredClone(g);bad.links.find(l=>l.id==='daempfer').points[1].at=[0,-80,62];assert.match(linkageIssues(bad)[0].message,/Dämpfer kann 51–65 mm/);
// Printed: every link with tubes and holes, brackets on the world, what to buy.
for(const id of ['unten','oben','traeger','hebel']){const x=linkSolids(g,id);assert.ok(x.solids.length>=3&&x.holes.length>=2,id);}
const m=mountSolids(g);assert.ok(m.solids.length>=12&&m.holes.length>=6);assert.ok(m.floor<14);
const buy=linkageShopping(g).map(x=>`${x.count} × ${x.label}`).join('\n');assert.match(buy,/Spannschloss M3.*47,0 mm/);assert.match(buy,/Öldämpfer 1:10 · 65 mm/);assert.match(buy,/Zylinderschraube M3 × 60/);assert.match(buy,/Rad 1:10/);
// The file.
assert.deepEqual(parseLinkage(JSON.parse(JSON.stringify(g))),g);assert.throws(()=>parseLinkage({links:[{id:'x',label:'x',kind:'zauber',points:[]}]}),/Lenker ungültig/);
assert.equal(linkBody('a'),'lenker:a');
console.log(`Gestänge: Pushrod-Ecke bestimmt, ${r.lift.toFixed(1)} mm Einfedern bei 6°, Dämpfer ${r.dampers[0].travel.toFixed(1)} mm, Sturz ${r.camber.toFixed(2)}°, MR ${mr.toFixed(2)}, ${ms.toFixed(1)} ms / Pose, ${step.toFixed(1)} ms je Reglerschritt.`);
{const rows=sweep(g,around,21),toe=rows.map(x=>x.reading.toe),d=rows.map(x=>x.reading.dampers[0]);assert.ok(Math.max(...toe)-Math.min(...toe)<.05,'kaum Spuränderung');assert.ok(d.every(x=>x.fits),'Dämpfer bleibt im Hub');}
// Driven from outside: the ride height example's stab hangs on the nut of a lead screw. The nut ahead lowers the wheel
// (the car rises), back raises it; every pose closes, camber and toe are read along the car's own direction.
{const {buildExamples}=await import('../../src/mechanics/parts/examples.ts');const {newBuild}=await import('../../src/mechanics/parts/build.ts');
 const b={...newBuild('h','H'),plates:[]};buildExamples.find(x=>x.key==='hoehe').make(b);const h=b.linkage;assert.equal(freedomOf(h),0);assert.deepEqual(linkageIssues(h,new Set(['teil:mutter'])),[]);
 const id={position:[0,0,0],rotation:[0,0,0,1]},at=v=>({now:{'teil:mutter':{position:[0,v,0],rotation:[0,0,0,1]}},rest:{'teil:mutter':id}});
 const r=v=>{const p=solveLinkage(h,at(v),{});assert.ok(p.error<1e-6,`schließt bei ${v} mm: ${p.error}`);return read(h,p);};
 const z=r(0),fw=r(6),bw=r(-6);assert.ok(Math.abs(z.lift)<1e-9&&Math.abs(z.camber)<1e-9&&Math.abs(z.toe)<1e-9);assert.ok(fw.lift<-3,`vor: ${fw.lift}`);assert.ok(bw.lift>3,`zurück: ${bw.lift}`);
 console.log(`Höhenverstellung: Schlitten ±6 mm → Radhub ${fw.lift.toFixed(1)} / +${bw.lift.toFixed(1)} mm, Sturz ${fw.camber.toFixed(2)}° / ${bw.camber.toFixed(2)}°, Spur ${fw.toe.toFixed(2)}° / ${bw.toe.toFixed(2)}°.`);}
