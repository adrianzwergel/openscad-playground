// What turns with a shaft and is not round: an arm. The example "Abtrieb mit Hebel": the arm sits between the layers on
// the output and swings ±45° (the range set at the output; the input follows with its ratio). What it sweeps is a fan:
// bolts stay out of it over the whole height, nothing reports. Without a range it turns endlessly and its full circle
// runs over the input shaft. Pointing at the input within its range it hits it. An arm in a layer's height is refused,
// one of another shaft through a web is reported with the word for what moves. Two arms that turn together are stepped
// through their range (side by side they never meet, though their fans overlap); cut loose from each other they may.
import assert from 'node:assert/strict';
import {parseShaft,newShaft} from '../../src/shaft/model.ts';
import {rund} from '../../src/shaft/profile.ts';
import {parseGear,newGear} from '../../src/gear/model.ts';
import {planGear} from '../../src/gear/plan.ts';
import {primDistance,capsuleDistance,primsApart,bound} from '../../src/gear/sweep.ts';
import {gearExamples} from '../../src/gear/examples.ts';
import {topView,posePlan} from '../../src/gear/draw.ts';
const near=(a,e,t,w)=>assert.ok(Math.abs(a-e)<=t,`${w}: ${a} statt ${e}`),say=p=>p.issues.map(i=>`${i.level}: ${i.message}`).join(' | '),errors=p=>p.issues.filter(i=>i.level==='fehler');
// ---- the geometry of sweeps ----
{// The hull of two discs, exactly: beside the bar, at the round ends, inside.
 near(capsuleDistance([5,7],[0,0],2,[10,0],2),5,1e-9,'neben dem Steg');near(capsuleDistance([-5,0],[0,0],2,[10,0],4),3,1e-9,'vor dem kleinen Ende');near(capsuleDistance([15,0],[0,0],2,[10,0],4),1,1e-9,'hinter dem großen Ende');assert.ok(capsuleDistance([5,0],[0,0],2,[10,0],2)<0);
 near(capsuleDistance([0,9],[0,0],5,[1,0],1),4,1e-9,'ein Kreis im anderen: der größere');
 // A disc swept along an arc: a band; beside it, beyond its ends, inside.
 const band={a:[10,0],ra:2,b:[10,0],rb:2,sweep:{c:[0,0],from:0,to:90}};near(primDistance([0,15],band),3,1e-9,'außen am Bogenende');near(primDistance([5,5],band),10-Math.hypot(5,5)-2,1e-9,'innen vom Bogen');near(primDistance([10,-5],band),3,1e-9,'vor dem Anfang');assert.ok(primDistance([7.07,7.07],band)<0);
 // A fan: a capsule turning about its own start.
 const fan={a:[0,0],ra:3,b:[20,0],rb:2,sweep:{c:[0,0],from:-30,to:30}};near(primDistance([30,0],fan),8,1e-9,'vor dem Fächer');near(primDistance([0,30],fan),capsuleDistance([0,30],[0,0],3,[20*Math.cos(Math.PI/6),10],2),1e-9,'neben dem Fächer: die Endlage');assert.ok(primDistance([15,5],fan)<0);
 near(primDistance([-9,0],{...fan,sweep:{c:[0,0],from:0,to:360}}),-13,1e-9,'endlos: der volle Kreis');
 // Anything else is stepped: a bar off the centre, swept a quarter turn.
 const bar={a:[10,0],ra:1,b:[20,0],rb:1,sweep:{c:[0,0],from:0,to:90}};near(primDistance([0,25],bar),4,.02,'gestufter Schwenk');near(primsApart({a:[0,30],ra:2,b:[0,40],rb:2},bar),7,.05,'Form gegen Schwenk');
 const bd=bound(fan);assert.ok(Math.hypot(bd.c[0]-20,bd.c[1])<bd.r&&Math.hypot(bd.c[0],bd.c[1])<=bd.r,'der Kreis um einen Fächer fasst ihn');}
// ---- the example ----
const ex=gearExamples.find(x=>x.key==='hebel'),files={},ids={};for(const s of ex.shafts){ids[s.key]=s.key;files[s.key]={name:s.name,doc:parseShaft(s.doc)};}
const base=ex.make(ids),doc=o=>parseGear({...base,...o}),B=[30,0],reach=35+5;
{const p=planGear(doc({}),files),a=p.arms[0],o=p.obstacles.find(x=>x.key===a.key);
 assert.deepEqual(errors(p),[],say(p));assert.equal(p.arms.length,1);near(a.angle%360,0,1e-9,'um 180° gedreht zeigt der Hebel nach +x');assert.deepEqual(a.spin,[-45,45]);assert.equal(a.rate,1);assert.deepEqual(p.turnRate,{b:1,a:-2},'der Antrieb dreht doppelt so weit, andersherum');
 assert.deepEqual(o.spin,{from:-45,to:45});assert.deepEqual([o.z0,o.z1],[34,40]);near(o.b[0],65,1e-9,'Ende des Hebels');
 // Bolts: out of the fan (with their eye and the clearance), though inside the circle of its reach they may be.
 const fan={a:o.a,ra:o.ra,b:o.b,rb:o.rb,sweep:{c:o.a,from:-45,to:45}};assert.ok(p.bolts.length>=3);for(const b of p.bolts)assert.ok(primDistance(b.at,fan)>=b.eye+1-1e-6,`Bolzen ${b.at} im Fächer`);
 assert.ok(p.bolts.some(b=>Math.hypot(b.at[0]-B[0],b.at[1]-B[1])<reach+b.eye),'neben dem Fächer ist Platz, auch im Kreis seiner Reichweite');
 // A bolt set by hand into the fan is refused.
 const hand=planGear(doc({bolts:[[60,5],[-18,0],[30,30]]}),files);assert.ok(hand.bolts[0].hit&&!hand.bolts[1].hit);assert.ok(hand.issues.some(i=>i.ref==='bolzen:0'&&/trifft/.test(i.message)));
 // The view: the fan and the arm are drawn; in a pose the arm stands where it then is.
 const svg=topView(p,p.layers[0]);assert.match(svg,/class="fan"/);assert.match(svg,/data-arm="b\/h"/);const posed=posePlan(p,{turn:45,groups:{}}).arms[0];near(posed.angle%360,45,1e-9,'Stellung 45°');near(posed.zero%360,0,1e-9,'der Fächer bleibt');}
// Endless: the full circle runs over the input shaft (30 mm away, reach 40).
{const p=planGear(doc({turn:undefined}),files);assert.equal(p.arms[0].spin,undefined);assert.ok(p.issues.some(i=>/dreht endlos \(voller Kreis\)/.test(i.message)));assert.ok(p.issues.some(i=>i.level==='fehler'&&/Hebel auf Abtrieb mit Hebel stößt beim Drehen an Antrieb z20/.test(i.message)),say(p));
 for(const b of p.bolts)assert.ok(Math.hypot(b.at[0]-B[0],b.at[1]-B[1])>=reach+b.eye+1-1e-6,`Bolzen ${b.at} im Kreis`);assert.match(topView(p,p.layers[0]),/class="fan endless"/);}
// Pointing at the input within its range.
{const p=planGear(doc({shafts:base.shafts.map(s=>s.id==='b'?{...s,turn:0}:s)}),files);near(p.arms[0].angle,180,1e-9,'ungedreht zeigt er nach −x');assert.ok(p.issues.some(i=>i.level==='fehler'&&/stößt beim Drehen an Antrieb z20/.test(i.message)),say(p));}
// The range may be set at the input: the output turns half as far.
{const p=planGear(doc({turn:{on:'a',from:-60,to:60}}),files);assert.deepEqual(p.arms[0].spin,[-30,30]);assert.equal(p.arms[0].rate,-.5);}
// More than a full turn is endless.
assert.equal(planGear(doc({turn:{on:'a',from:-400,to:400}}),files).arms[0].spin,undefined);
// ---- an arm in a layer's height, an arm of another shaft through a web ----
{const low={name:'Hebel unten',doc:parseShaft({...newShaft(),length:60,items:[{id:'h',part:'hebel',x:3,width:5,arm:{length:18,width:8,angle:0,hole:0}},{id:'l2',part:'lager-608',x:50}]})},f={...files,low};
 const p=planGear(doc({turn:undefined,shafts:[...base.shafts,{id:'c',shaft:'low',at:[15,-20],z:0}]}),f);
 assert.ok(p.issues.some(i=>i.level==='fehler'&&/Schicht 1: der Steg .* geht durch Hebel auf Hebel unten beim Drehen/.test(i.message)),say(p));assert.ok(p.layers[0].webs.some(w=>w.hits.some(h=>/Hebel/.test(h))));
 // On the shaft of a bearing in that layer it is said plainly.
 const own={name:'Hebel im Lager',doc:parseShaft({...newShaft(),length:60,items:[{id:'l1',part:'lager-608',x:2},{id:'h',part:'hebel',x:10,width:5,arm:{length:18,width:8,angle:0,hole:0}},{id:'l2',part:'lager-608',x:50}]})};
 const q=planGear(parseGear({...newGear(),shafts:[{id:'a',shaft:'own',at:[0,0],z:0}],layers:[{id:'u',z0:2,z1:16},{id:'o',z0:50,z1:57}]}),{own});assert.ok(q.issues.some(i=>i.level==='fehler'&&/dreht in der Höhe der Platte/.test(i.message)),say(q));}
// ---- two arms that turn together ----
{const arm=(name)=>({name,doc:parseShaft({...newShaft(),length:60,items:[{id:'l1',part:'lager-608',x:2},{id:'r',part:'gt2-z20',x:12,bore:rund(8)},{id:'h',part:'hebel',x:34,width:6,arm:{length:30,width:8,angle:0,hole:0}},{id:'l2',part:'lager-608',x:50}]})}),f={x:arm('Links'),y:arm('Rechts')};
 const two=o=>parseGear({...newGear(),shafts:[{id:'a',shaft:'x',at:[0,0],z:0,turn:-90},{id:'b',shaft:'y',at:[40,0],z:0,turn:-90}],belts:[{id:'r1',a:{on:'a',item:'r'},b:{on:'b',item:'r'}}],input:'a',turn:{on:'a',from:-60,to:60},...o});
 const p=planGear(two({}),f),hitting=q=>q.issues.filter(i=>/stößt beim Drehen/.test(i.message));
 near(p.arms[0].angle,90,1e-9,'beide zeigen nach +y');assert.deepEqual(p.turnRate,{a:1,b:1},'der Riemen dreht beide gleich herum');
 // Their fans overlap: each sweeps where the other one stood.
 const [oa,ob]=p.arms.map(a=>p.obstacles.find(o=>o.key===a.key)),fan=o=>({a:o.a,ra:o.ra,b:o.b,rb:o.rb,sweep:{c:o.a,from:o.spin.from,to:o.spin.to}});assert.ok(primsApart(fan(oa),fan(ob))<0,'die Fächer überdecken sich');
 assert.deepEqual(hitting(p),[],say(p));
 // Without the belt the second arm turns as it likes: now they can meet.
 const loose=planGear(two({belts:[]}),f);assert.equal(loose.arms[1].spin,undefined);assert.ok(hitting(loose).some(i=>/Hebel auf (Links|Rechts) stößt beim Drehen an Hebel auf (Links|Rechts)/.test(i.message)),say(loose));}
console.log('Hebel im Getriebe: Abstände zu Schwenkflächen genau, Fächer aus Drehbereich und Übersetzung, Bolzen bleiben draußen, endlos als voller Kreis, Anstoßen an Wellen, Hebel in der Plattenhöhe und durch einen Steg, zwei gekoppelte Hebel Stellung für Stellung.');
