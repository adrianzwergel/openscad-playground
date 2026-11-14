// The shaft generator's plan: profiles pass or not, the DIN tables, and whole shafts. The example from the brief: a 626
// at each end, a LEGO gear in the middle. One side stays round Ø6, the LEGO cross runs from the gear to the other end,
// and the bearing there gets an adapter (cross inside, Ø6 outside) with a collar against the gear.
import assert from 'node:assert/strict';
import {passes,largestPassing,rund,inner,outer} from '../../src/shaft/profile.ts';
import {thread,keyFor,ringFor,setScrew} from '../../src/shaft/din.ts';
import {onParts,inParts} from '../../src/shaft/catalog.ts';
import {newShaft,parseShaft} from '../../src/shaft/model.ts';
import {planShaft} from '../../src/shaft/plan.ts';

const kreuz={kind:'kreuz'},d5={kind:'d',d:5,flat:.5};
assert.ok(passes(kreuz,rund(6)),'Kreuz geht durch Ø6');assert.ok(!passes(rund(6),kreuz),'Ø6 nicht durchs Kreuz');
assert.ok(passes(d5,rund(5))&&!passes(rund(5),d5),'D5 durch Ø5, nicht umgekehrt');assert.ok(passes({kind:'d',d:5,flat:.8},d5),'tiefer abgeflacht geht durch');
assert.deepEqual(largestPassing([kreuz,rund(6)]),kreuz,'durch Kreuz und Ø6: das Kreuz');assert.deepEqual(largestPassing([rund(8),rund(6)]),rund(6));assert.equal(largestPassing([]),undefined);
assert.equal(inner(d5),4);assert.ok(Math.abs(outer({kind:'sechskant',sw:5})-5.7735)<1e-3);
assert.equal(thread(3).drill,2.5);assert.equal(thread(6).drill,5);assert.equal(thread(8).drill,6.8);
assert.equal(keyFor(6).b,2);assert.equal(keyFor(8).b,2);assert.equal(keyFor(8.5).b,3);assert.equal(keyFor(12).b,4);assert.equal(keyFor(5),undefined);
assert.equal(ringFor(6).d2,5.7);assert.deepEqual(setScrew(3,3.5),{length:3,proud:0});assert.equal(setScrew(3,2).proud,1);
assert.ok(onParts.some(p=>p.id==='lager-626')&&onParts.some(p=>p.id==='lego-3648b')&&inParts.some(p=>p.id==='motor-nema17-40'),'Katalog');

const shaft=(o)=>parseShaft({...newShaft(),...o});
const errors=p=>p.issues.filter(i=>i.level==='fehler').map(i=>i.message);
const sec=(p,x)=>p.sections.find(c=>x>=c.x0&&x<=c.x1).profile;

// The brief's example.
{const p=planShaft(shaft({length:60,items:[{id:'l1',part:'lager-626',x:2},{id:'z',part:'lego-3648b',x:26},{id:'l2',part:'lager-626',x:52}]}));
 assert.deepEqual(errors(p),[],'Beispiel ohne Fehler');
 const ad=p.sleeves.filter(s=>s.kind==='adapter');assert.equal(ad.length,1,'ein Adapter');
 const roundSide=ad[0].for==='l2'?'l1':'l2',crossSide=ad[0].for;
 const at=id=>p.placed.find(t=>t.id===id);assert.deepEqual(sec(p,at(roundSide).x0+1),rund(6),'eine Seite rund Ø6');
 assert.deepEqual(sec(p,at(crossSide).x0+1),kreuz,'unter dem Adapter das Kreuz');assert.deepEqual(sec(p,at('z').x0+1),kreuz,'Zahnrad auf dem Kreuz');
 assert.deepEqual(sec(p,crossSide==='l2'?59.9:.1),kreuz,'Kreuz bis zum Ende');assert.equal(at('z').side,at(crossSide).side,'Zahnrad und Adapter-Lager von derselben Seite');
 assert.deepEqual(ad[0].inner,kreuz);assert.deepEqual(ad[0].steps.find(s=>s.x0===at(crossSide).x0).outer,rund(6),'Adapter außen Ø6');assert.equal(ad[0].steps.length,2,'Adapter mit Bund bis ans Zahnrad');
 assert.ok(p.issues.some(i=>i.level==='warnung'&&/Wand nur 0,6/.test(i.message)),'dünne Adapterwand gemeldet');
 const bund=p.sections.find(c=>c.role==='bund');assert.ok(bund&&bund.profile.d>6&&bund.profile.d<=11.2,`Bund zwischen Lager und Zahnrad: ${JSON.stringify(bund)}`);
 assert.ok(p.bom.some(b=>/626/.test(b.what)&&b.count===2)&&p.bom.some(b=>/^Adapter/.test(b.what)),'Stückliste');}

// Bores that all pass: no adapter, one spacer where nothing stops a part.
{const p=planShaft(shaft({length:60,items:[{id:'a',part:'lager-608',x:2},{id:'g',part:'stirnrad-m1-z40',x:25,bore:rund(8)},{id:'b',part:'lager-608',x:50}]}));
 assert.deepEqual(errors(p),[]);assert.equal(p.sleeves.filter(s=>s.kind==='adapter').length,0);const sp=p.sleeves.filter(s=>s.kind==='huelse');assert.equal(sp.length,1,'eine Distanzhülse');
 assert.deepEqual(sp[0].inner,rund(8));assert.ok(sp[0].steps[0].outer.d>8&&sp[0].steps[0].outer.d<=8+.4*14+1e-9,'Hülse drückt nur auf den Innenring');}

// A motor's D shaft inside, held by a set screw on its flat; a 608 slid on from the other end.
{const p=planShaft(shaft({length:50,items:[{id:'b',part:'lager-608',x:40}],inserts:[{id:'m',part:'motor-nema17-40',end:'links',depth:15}],works:[{id:'s',kind:'madenschraube',x:7,m:3}]}));
 assert.deepEqual(errors(p),[]);assert.equal(p.placed[0].side,'rechts');const c=sec(p,5);assert.ok(c.d>=5+4,'Wand um die Motorwelle');
 const m=p.machining[0];assert.equal(m.drill,2.5,'Kernloch M3 nach DIN');assert.ok(Math.abs(m.depth-(c.d/2-2))<1e-9,'bis auf die Abflachung');assert.ok(p.bom.some(b=>b.what==='Gewindebohrer M3 (Kernloch Ø2,5)'));assert.ok(p.bom.some(b=>/DIN 913 M3/.test(b.what)));}

// Too little wall round a LEGO axle in a Ø6 seat; contradicting sides; a hand section a bearing cannot pass.
{const p=planShaft(shaft({length:30,items:[{id:'b',part:'lager-626',x:0}],inserts:[{id:'a',part:'lego-achse',end:'links',depth:10}]}));assert.ok(errors(p).some(e=>/Wand um LEGO-Achse nur 0,6/.test(e)));}
{const p=planShaft(shaft({length:40,items:[{id:'a',part:'lager-608',x:2,side:'rechts'},{id:'b',part:'lager-608',x:30,side:'links'}]}));assert.ok(errors(p).some(e=>/widersprechen/.test(e)));}
{const p=planShaft(shaft({length:40,items:[{id:'a',part:'lager-608',x:30,side:'rechts'}],sections:[{x0:35,x1:40,profile:rund(10)}]}));assert.ok(errors(p).some(e=>/geht von rechts nicht über Ø10/.test(e)),errors(p).join(' | '));}
// Keyway and ring groove look up their tables; overlaps are refused.
{const p=planShaft(shaft({length:40,items:[{id:'a',part:'lager-608',x:3,side:'links'}],sections:[{x0:10,x1:40,profile:rund(10)}],works:[{id:'n',kind:'nut',x0:20,x1:35},{id:'r',kind:'ring',x:1.5}]}));
 assert.deepEqual(p.machining.find(m=>m.key).key,{b:3,h:3,t1:1.8,length:14});assert.deepEqual(p.machining.find(m=>m.ring).ring,{d2:7.6,m:.9,norm:'471',label:'Sicherungsring DIN 471 8 × 0,8'});assert.ok(!p.issues.some(i=>/nach links nicht gesichert/.test(i.message)),'Ring sichert das Lager');}
{const p=planShaft(shaft({length:40,items:[{id:'a',part:'lager-608',x:0},{id:'b',part:'lager-608',x:5}]}));assert.ok(errors(p).some(e=>/überlappen/.test(e)));}
assert.throws(()=>parseShaft({...newShaft(),length:-1}),/Länge/);
console.log('Wellen-Plan: Profile und DIN-Tabellen, Beispiel 626 | LEGO z24 | 626 mit Adapter und Bund, Distanzhülse, Motorwelle mit Madenschraube, Wand-, Seiten- und Abschnittsfehler, Passfeder und Sicherungsring.');
