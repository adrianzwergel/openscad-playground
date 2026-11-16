// Roller chain 04C and the sprockets of sourcing map.
// - Teeth after ISO 606: pitch Ø of z12, tip Ø of z25 near the 53,5 mm a seller gives; a chain round two equal
//   sprockets is 2·C/p + z links.
// - The catalogue: z9 to z17, z19, z24, z25 in bores 5, 6, 8 and the tensioner z20 with its bearing.
// - The rocker-bogie at twice the size with chains, narrow: no error or warning, all three wheels 0,36 × the motor, the
//   joints turn no wheel; the motor's chain of 38 links tensioned by its slots, one loop per swing arm round three z12
//   (110 and 108 links) taut over its tensioner, moving with its arm; two chain planes, 62,8 mm over the plates; chains
//   and connecting links in the parts list.
// - A loop over two arms that swing against each other is an error; a sprocket inside the loop too.
// - Two sprockets 100 mm apart hang slack; a tensioner from outside on a fixed axle: the chain runs over it, the button's
//   place makes it taut, its axle is held in both plates (no "no bearing").
// - Sprockets, the tensioner and the gearbox build as solids, every plate with faces (a web meeting a ring at a tangent
//   once broke the rocker's plates), the chains as bands round their wheels, also in a pose.
import assert from 'node:assert/strict';import fs from 'node:fs';
import opencascade from 'replicad-opencascadejs';
import {setOC,localGC} from 'replicad';
import {pitchDiameter,tipDiameter,chainPath,CHAIN} from '../../src/shaft/chain.ts';
import {onParts,onPart} from '../../src/shaft/catalog.ts';
import {newShaft} from '../../src/shaft/model.ts';
import {planShaft} from '../../src/shaft/plan.ts';
import {buildParts} from '../../src/shaft/cad.ts';
import {parseGear,newGear} from '../../src/gear/model.ts';
import {planGear} from '../../src/gear/plan.ts';
import {buildGearParts} from '../../src/gear/cad.ts';
import {gearExamples} from '../../src/gear/examples.ts';
const near=(a,b,t,m)=>assert.ok(Math.abs(a-b)<=t,`${m}: ${a} statt ${b}`);
near(pitchDiameter(12),24.53,.01,'Teilkreis z12');near(tipDiameter(25),53.5,.3,'Kopfkreis z25');
{const r=pitchDiameter(12)/2,p=chainPath([{at:[0,0],r,teeth:12,side:1},{at:[100,0],r,teeth:12,side:1}]);near(p.links,2*100/CHAIN.pitch+12,1e-9,'Glieder um zwei z12');}
const sp=onParts.filter(p=>p.sprocket);assert.equal(sp.length,37);assert.ok(onPart('04c-z9-b5')&&onPart('04c-z25-b8')&&onPart('04c-spanner-z20')?.sprocket?.idler,'Teile im Katalog');
// ---- the rocker-bogie with chains ----
const ex=gearExamples.find(e=>e.key==='rocker-kette'),files=Object.fromEntries(ex.shafts.map(s=>[s.key,{name:s.name,doc:s.doc}])),ids=Object.fromEntries(ex.shafts.map(s=>[s.key,s.key]));
const doc=parseGear(ex.make(ids)),p=planGear(doc,files);
assert.deepEqual(p.issues.filter(i=>i.level!=='hinweis').map(i=>i.message),[]);
for(const s of ex.shafts)assert.deepEqual(planShaft(s.doc).issues.filter(i=>i.level!=='hinweis').map(i=>i.message),[],s.name);
assert.equal(p.belts.length,3);
{const k=p.belts.find(b=>b.id==='k1');assert.equal(k.chain.links,38);assert.ok(k.tension,'Motor spannt die Kette');}
for(const [id,links,body,drive] of [['k2',110,'g1','b/a'],['k3',108,'g2','w3/r']]){const k=p.belts.find(b=>b.id===id);assert.equal(k.chain.links,links,id);near(k.chain.slack,0,.01,id+' straff');assert.equal(k.body,body,id);assert.deepEqual(k.drives,[drive]);assert.equal(k.via.length,1);assert.equal(k.loop.length,4,'drei Räder und ein Spanner');}
{const zs=p.layers.filter(l=>!l.motor).flatMap(l=>l.band);near(Math.max(...zs)-Math.min(...zs),62.8,.01,'Breite über die Platten');assert.equal(new Set(p.wheels.filter(w=>w.chain&&!w.idler).map(w=>((w.z0+w.z1)/2).toFixed(1))).size,2,'zwei Kettenebenen');}
for(const w of ['w1','w2','w3']){const v=p.drive.shafts[w];near(v[0],.36,1e-9,w);near(v[1],0,1e-9,w);near(v[2],0,1e-9,w);}
assert.deepEqual(p.drive.joints,{g1:[0,1,0],g2:[0,0,1]});
assert.ok(['38','110','108'].every(n=>p.bom.some(b=>b.what===`Rollenkette 04C (¼"), ${n} Glieder`))&&p.bom.some(b=>b.what==='Kettenschloss 04C'&&b.count===3),'Stückliste');
// A loop over the rocker's and the bogie's wheels: they swing against each other.
{const d=parseGear(ex.make(ids));d.belts[1].via.push({on:'w2',item:'r'});assert.ok(planGear(d,files).issues.some(i=>i.level==='fehler'&&/gegeneinander schwenken/.test(i.message)),'Kette über zwei Schwingen');}
console.log('Rocker-Bogie mit Kette: fehlerfrei, Räder 0,36 × Motor, Motorkette 38 Glieder über die Langlöcher, je Schwinge eine Kette um drei z12 (110 und 108 Glieder) straff über ihren Spanner, zwei Kettenebenen, 62,8 mm breit, Stückliste; Kette über zwei Schwingen gemeldet.');
// ---- a tensioner on a fixed axle ----
const L=(id,x)=>({id,part:'lager-688',x}),wheelShaft={...newShaft(),length:35,items:[L('l1',0),{id:'k',part:'04c-z12-b8',x:12},L('l2',30)]};
const axle={...newShaft(),length:38,items:[{id:'s',part:'04c-spanner-z20',x:13.4+1.5-6.5}]};
const tf={a:{name:'Rad A',doc:wheelShaft},b:{name:'Rad B',doc:wheelShaft},s:{name:'Spannerachse',doc:axle}};
const g0={...newGear(),shafts:[{id:'a',shaft:'a',at:[0,0],z:0},{id:'b',shaft:'b',at:[100,0],z:0}],belts:[{id:'k1',a:{on:'a',item:'k'},b:{on:'b',item:'k'}}]};
{const q=planGear(parseGear(g0),tf),k=q.belts[0];assert.equal(k.chain.links,44);near(k.chain.slack,.5,.01,'Spiel');assert.ok(q.issues.some(i=>i.level==='warnung'&&/hängen 0,5 Glied durch: Achsabstand auf 101,6 mm/.test(i.message)),'hängt durch');}
const g1=parseGear({...g0,shafts:[...g0.shafts,{id:'s',shaft:'s',at:[50,30],z:-1.5}],belts:[{...g0.belts[0],via:[{on:'s',item:'s'}]}]});
{const q=planGear(g1,tf),k=q.belts[0];assert.ok(k.via?.length===1&&k.path.length===3,'über den Spanner');
 {const inside=structuredClone(g1);inside.shafts.push({id:'c',shaft:'a',at:[50,0],z:0});inside.belts[0].via.push({on:'c',item:'k'});assert.ok(planGear(inside,tf).issues.some(i=>i.level==='fehler'&&/liegt innerhalb der Kette/.test(i.message)),'Rad innen');}assert.ok(k.fit.via,'Platz des Spanners');
 assert.ok(!q.issues.some(i=>/kein Lager/.test(i.message)),'Achse gehalten');assert.equal(q.bearings.filter(b=>b.item==='achse').length,2,'Achse in beiden Platten');
 {const far=structuredClone(g1);far.shafts[2].at=[50,40];assert.ok(planGear(far,tf).issues.some(i=>i.level==='warnung'&&/berührt die Kette nicht/.test(i.message)),'Spanner zu weit weg');}
 g1.shafts[2].at=k.fit.via.at;const q2=planGear(g1,tf),k2=q2.belts[0];near(k2.chain.slack,0,.01,'straff über den Spanner');assert.ok(k2.chain.links===44);
 assert.deepEqual(q2.issues.filter(i=>i.level==='fehler').map(i=>i.message),[]);
 console.log(`Spanner: 44 Glieder hängen 0,5 Glied durch, der Spanner bei ${k.fit.via.at.map(v=>v.toFixed(1)).join(' / ')} macht sie straff; seine Achse steht in beiden Platten.`);
 const oc=await opencascade({print:()=>{},printErr:()=>{},wasmBinary:fs.readFileSync('node_modules/replicad-opencascadejs/dist/replicad_single.wasm')});setOC(oc);
 {const sp=planShaft(axle),{parts,free}=buildParts(axle,sp);assert.ok(parts.some(x=>/Kettenspanner/.test(x.name)));free();}
 {const sp=planShaft(ex.shafts.find(s=>s.key==='b').doc),{parts,free}=buildParts(ex.shafts.find(s=>s.key==='b').doc,sp);assert.equal(parts.filter(x=>/Kettenrad/.test(x.name)).length,2);free();}
 {const [keep,gc]=localGC(),parts=buildGearParts(g1,q2,tf,keep);assert.ok(parts.filter(x=>x.kind==='platte').length>=2);gc();}
 const tris=x=>x.shape.mesh({tolerance:.1,angularTolerance:10}).triangles.length/3;
 for(const pose of [undefined,{turn:0,groups:{g1:10,g2:-8}}]){const [keep,gc]=localGC(),parts=buildGearParts(doc,p,files,keep,pose);
  const plates=parts.filter(x=>x.kind==='platte');assert.equal(plates.length,6);for(const x of plates)assert.ok(tris(x)>100,`${x.name} hat Flächen`);
  const chains=parts.filter(x=>/^Rollenkette/.test(x.name));assert.equal(chains.length,3,'drei Ketten im Modell');for(const x of chains)assert.ok(tris(x)>50,x.name);
  assert.deepEqual(chains.map(x=>x.body),['','g1','g2']);gc();}}
console.log('Kettenräder, Spanner und Getriebe als Volumen.');
