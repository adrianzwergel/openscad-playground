// Springs: the assortment and its numbers (DIN EN 13906), a measured rate beating the estimate, and a tension spring in
// a gearbox between the frame and a swing arm: length, stretch, force and moment over the arm's range, the columns split
// for the hooks, the parts list, the solid; slack, overstretched, in the way.
import assert from 'node:assert/strict';import fs from 'node:fs';
import opencascade from 'replicad-opencascadejs';import {setOC,localGC} from 'replicad';
import {springParts,springOf,springCatalog,forceAt,parseMeasures} from '../../src/shaft/springs.ts';
import {gearExamples} from '../../src/gear/examples.ts';import {planGear} from '../../src/gear/plan.ts';import {parseGear} from '../../src/gear/model.ts';import {buildGearParts} from '../../src/gear/cad.ts';import {springFits} from '../../src/gear/springs.ts';
const near=(a,b,e=1e-6)=>Math.abs(a-b)<=e;
// ---- the catalogue ----
assert.equal(springParts.length,17);assert.equal(springParts.filter(p=>p.kind==='zug').length,9);assert.equal(springParts.reduce((t,p)=>t+p.count,0),188,'die Posten des Etiketts: 188 (außen steht 200x)');
// The rate from wire and coils: G d⁴ / (8 Dm³ n).
const c=springOf({id:'t',kind:'druck',D:11,L0:40,count:1,source:''},{d:1,n:10});assert.ok(near(c.R,81500/(8*1000*10),1e-9),`Rate ${c.R}`);assert.ok(near(c.Lc,12),'Blocklänge (n+2)·d');
const slim=springOf({id:'t',kind:'druck',D:11,L0:80,count:1,source:''},{d:1,n:20});assert.ok(slim.sBuckle!==undefined&&slim.sBuckle<slim.smax,'eine lange schlanke Druckfeder knickt');assert.equal(springOf({id:'t',kind:'druck',D:11,L0:12,count:1,source:''},{d:1,n:2}).sBuckle,undefined,'eine kurze nicht');
// Two lengths under two masses: rate and initial tension of a tension spring.
const part=springParts.find(p=>p.id==='zug-7x49'),R=.15,F0=.6,L=g=>part.L0+(g/1000*9.81-F0)/R,m=springOf(part,{points:[{g:200,L:L(200)},{g:500,L:L(500)}]});
assert.ok(near(m.R,R,1e-9)&&near(m.F0,F0,1e-9)&&!m.estimated.R,`gemessen ${m.R} ${m.F0}`);assert.ok(springOf(part).estimated.R);
assert.equal(forceAt(m,part.L0-1),0,'schlaff zieht nicht');assert.ok(near(forceAt(m,part.L0+10),F0+10*R));
assert.deepEqual(parseMeasures({'zug-7x49':{d:.7,points:[{g:100,L:55},{g:-1,L:3}]},'gibt-es-nicht':{d:1}}),{'zug-7x49':{d:.7,points:[{g:100,L:55}]}});
// ---- in the gearbox: frame bolt 1 to the rocker's third bolt ----
const ex=gearExamples.find(e=>e.key==='rocker-lego'),files=Object.fromEntries(ex.shafts.map(s=>[s.key,{name:s.name,doc:s.doc}])),ids=Object.fromEntries(ex.shafts.map(s=>[s.key,s.key]));
const doc=parseGear({...ex.make(ids),springs:[{id:'f1',part:'zug-5x20,5',a:{body:'',bolt:0},b:{body:'g1',bolt:2}}]}),p=planGear(doc,files),sp=p.springs[0];
assert.deepEqual(p.issues.filter(i=>i.level!=='hinweis').map(i=>i.message),[]);
assert.equal(sp.poses.length,7,'Rocker von −15° bis 15° in 5°-Schritten');assert.ok(sp.range.L[1]-sp.range.L[0]>10,'Länge ändert sich mit dem Rocker');
for(const q of sp.poses){assert.ok(q.s>0,'nie schlaff');assert.ok(near(q.F,sp.part.F0+sp.part.R*q.s,1e-9));}
// The moment on the rocker: the spring pulls its bolt towards the frame's.
const A=p.bolts[sp.bolts[0]].at,B=p.bolts[sp.bolts[1]].at,u=[(A[0]-B[0])/Math.hypot(A[0]-B[0],A[1]-B[1]),(A[1]-B[1])/Math.hypot(A[0]-B[0],A[1]-B[1])];assert.ok(near(sp.rest.M.g1,(B[0]*u[1]-B[1]*u[0])*sp.rest.F,1e-6),'Moment um den Rocker-Drehpunkt');
// Both columns split for the hooks; the parts list says so and lists the spring.
assert.equal(p.splits.length,2);assert.ok(p.bom.some(b=>/Zugfeder 5 × 20,5/.test(b.what)&&b.count===1));assert.equal(p.bom.filter(b=>/geteilt für den Haken/.test(b.note??'')).reduce((t,b)=>t+b.count,0),2);
// The best fit between those bolts is a spring that stretches right.
const fits=springFits(sp,springCatalog());assert.ok(fits[0].ok&&fits.some(f=>!f.ok));
// Slack and overstretched are said.
const slack=planGear(parseGear({...doc,springs:[{...doc.springs[0],part:'zug-4x78'}]}),files);assert.ok(slack.issues.some(i=>/wird schlaff/.test(i.message)));
const far=planGear(parseGear({...doc,springs:[{...doc.springs[0],part:'zug-9,5x19',b:{body:'g1',bolt:0}}]}),files);assert.ok(far.issues.some(i=>i.level==='fehler'&&/der Draht hält/.test(i.message)));
assert.ok(planGear(parseGear({...doc,springs:[{...doc.springs[0],part:'druck-9x35'}]}),files).issues.some(i=>/nur eine Zugfeder/.test(i.message)));
// The solid: the spring between its bolts, the split columns in two pieces each.
const oc=await opencascade({print:()=>{},printErr:()=>{},wasmBinary:fs.readFileSync('node_modules/replicad-opencascadejs/dist/replicad_single.wasm')});setOC(oc);
const [keep,gc]=localGC(),parts=buildGearParts(doc,p,files,keep,{turn:0,groups:{g1:10}});assert.ok(parts.some(x=>x.spring&&x.file==='feder-f1'));assert.equal(parts.filter(x=>/^saeule-\d+-\d+-(unten|oben)$/.test(x.file)).length,4);gc();
console.log(`Federn: 17 Sorten, 188 Stück; Rate nach DIN EN 13906, gemessen schlägt geschätzt; im Getriebe ${sp.label} zwischen Gestell und Rocker ${sp.range.L.map(v=>v.toFixed(1)).join('–')} mm, ${sp.range.F.map(v=>v.toFixed(1)).join('–')} N, Moment ${(sp.rest.M.g1/10).toFixed(1)} N·cm, Säulen geteilt, schlaff/überdehnt/Druckfeder gemeldet.`);
