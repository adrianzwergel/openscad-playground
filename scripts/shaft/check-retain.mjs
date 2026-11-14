// Holding things on the shaft. A user's shaft: a NEMA 17 shaft 24 mm deep from the left, a 626, a LEGO z16 and a 625,
// a retaining ring at the right end. Machining never turns the shaft round: the motor stays in the collar, everything
// goes on from the right, the ring on the cross is reported with the LEGO bush as the way. With the bush instead, all of
// it mounts; the bush needs no shoulder. Set collars DIN 705 hold on round shafts and bring their set screw; E-clips DIN
// 6799 sit where a DIN 471 ring could not be spread over the end.
import assert from 'node:assert/strict';
import {planShaft} from '../../src/shaft/plan.ts';
import {newShaft,parseShaft} from '../../src/shaft/model.ts';
import {eclipFor} from '../../src/shaft/din.ts';
import {onPart} from '../../src/shaft/catalog.ts';
import {rund} from '../../src/shaft/profile.ts';
const plan=o=>planShaft(parseShaft({...newShaft(),...o})),errors=p=>p.issues.filter(i=>i.level==='fehler'),sec=(p,x)=>p.sections.find(c=>x>=c.x0&&x<=c.x1).profile;
const user={length:47,items:[{id:'a',part:'lager-626',x:24.5},{id:'z',part:'lego-4019',x:31},{id:'b',part:'lager-625',x:41}],inserts:[{id:'m',part:'motor-nema17-27',end:'links',depth:24}],works:[{id:'s',kind:'madenschraube',x:11,m:4},{id:'r',kind:'ring',x:46.5}]};
{const p=plan(user);assert.ok(sec(p,10).kind==='rund'&&sec(p,10).d>=9,'Motor bleibt im Bund');assert.ok(p.placed.every(t=>t.side==='rechts'),'alles von rechts');
 assert.ok(!errors(p).some(i=>!i.work),`keine Montagefehler: ${errors(p).map(i=>i.message)}`);assert.deepEqual(errors(p),[],'Ring ins Kreuz gestochen: kein Fehler');const r=p.machining.find(m=>m.work.id==='r').ring;assert.deepEqual(r,{d2:3.8,m:.5,norm:'471',label:'Sicherungsring DIN 471 4 × 0,4'},'Ring für Ø4, Nut Ø3,8');
 assert.ok(p.issues.some(i=>i.ref==='r'&&i.level==='hinweis'&&/gespreizt/.test(i.message)));assert.ok(!p.issues.some(i=>/nach rechts nicht gesichert/.test(i.message)),'Ring sichert');
 const e=plan({...user,works:[user.works[0],{id:'r',kind:'ring',x:46.5,norm:'6799'}]});assert.deepEqual(e.machining.find(m=>m.work.id==='r').ring.d2,3.2,'E-Ring 3,2 im Kreuz');assert.ok(!e.issues.some(i=>i.ref==='r'));}
{const p=plan({...user,items:[user.items[0],user.items[1],{id:'bu',part:'lego-buchse-halb',x:41}],works:[user.works[0]]});
 assert.deepEqual(errors(p),[]);assert.equal(p.sleeves.length,0,'Buchse braucht keine Hülse');assert.ok(!p.issues.some(i=>/nach rechts nicht gesichert/.test(i.message)),'Buchse sichert');assert.ok(p.bom.some(b=>/LEGO-Buchse ½/.test(b.what)));}
// A bush in the middle of the cross, far from anything: it clamps, no spacer, no missing stop.
{const p=plan({length:40,items:[{id:'z',part:'lego-4019',x:2,side:'links'},{id:'bu',part:'lego-buchse',x:20,side:'links'}]});assert.ok(!p.issues.some(i=>/keinen Anschlag/.test(i.message)&&i.ref==='bu'));assert.ok(!p.sleeves.some(s=>s.for==='bu'));}
// Set collar on a round shaft, with its screw in the parts list.
{const p=plan({length:40,items:[{id:'l',part:'lager-608',x:10},{id:'st',part:'stellring-8',x:30}]});assert.ok(!errors(p).length,errors(p).map(i=>i.message).join());assert.ok(p.bom.some(b=>/Madenschraube M4 \(im Stellring\)/.test(b.what)));assert.equal(onPart('stellring-8').checked,false);}
// E-clips: table, groove, and where a DIN 471 ring cannot be spread over either end.
assert.equal(eclipFor(5).d2,4);assert.equal(eclipFor(6).d2,5);assert.equal(eclipFor(8).d2,7);assert.equal(eclipFor(1),undefined);
{const p=plan({length:40,items:[{id:'l',part:'lager-608',x:15}],sections:[{x0:0,x1:5,profile:rund(12)},{x0:5,x1:35,profile:rund(8)},{x0:35,x1:40,profile:rund(12)}],works:[{id:'r',kind:'ring',x:24},{id:'e',kind:'ring',x:26,norm:'6799'}]});
 assert.ok(p.issues.some(i=>i.ref==='r'&&/nicht aufschieben.*E-Ring/.test(i.message)),'471 eingesperrt');assert.ok(!p.issues.some(i=>i.ref==='e'));assert.deepEqual(p.machining.find(m=>m.work.id==='e').ring,{d2:7,m:.94,norm:'6799',label:'Sicherungsscheibe DIN 6799 7'});assert.ok(p.bom.some(b=>b.what==='Sicherungsscheibe DIN 6799 7'));}
{const p=plan({length:20,collar:6.5,works:[{id:'r',kind:'ring',x:10}]});assert.ok(p.issues.some(i=>i.ref==='r'&&/Ein E-Ring DIN 6799 passt/.test(i.message)),'Ø6,5: kein 471, aber 6799');}
assert.throws(()=>parseShaft({...newShaft(),works:[{id:'r',kind:'ring',x:1,norm:'999'}]}),/Bearbeitung/);
console.log('Sicherungen: Bearbeitungen drehen die Welle nicht um, Sicherungsring DIN 471 Ø4 und E-Ring 3,2 ins LEGO-Kreuz gestochen, LEGO-Buchse klemmt auf dem Kreuz, Stellring mit Madenschraube, E-Ring DIN 6799 wo DIN 471 nicht aufgeht.');
