// What goes with the files: the parts list as CSV (quoted where needed), the making notes with the fits for the CNC
// (bearing seat k6, bore for a motor shaft H7, keyway N9) or the play for the printer, and every machining step.
import assert from 'node:assert/strict';
import {planShaft} from '../../src/shaft/plan.ts';
import {partsCsv,makingNotes,fitFor} from '../../src/shaft/notes.ts';
import {shaftExamples} from '../../src/shaft/examples.ts';
const motor=shaftExamples.find(x=>x.key==='motor').make();
const cnc={...motor,making:'cnc',works:[...motor.works,{id:'n',kind:'nut',x0:20,x1:32}]},plan=planShaft(cnc),text=makingNotes('Motorwelle',cnc,plan);
assert.match(text,/k6 \(Lagersitz/,'Lagersitz k6');assert.match(text,/D5 \(0,5 flach\) für NEMA 17.*H7/,'Bohrung H7');assert.match(text,/Kernloch Ø2,5 \(im Modell\), Gewinde M3 schneiden/);
assert.match(text,/Passfedernut DIN 6885 A, b = \d N9/);assert.equal(fitFor(plan,0,1,'bund'),'Freimaß ISO 2768-m');
const print=makingNotes('Motorwelle',motor,planShaft(motor));assert.match(print,/0,1 mm Spiel je Seite/);assert.doesNotMatch(print,/k6/);
const csv=partsCsv(plan).split('\r\n');assert.equal(csv[0],'Menge;Teil;Hinweis');assert.ok(csv.some(l=>/^1;Gewindebohrer M3/.test(l)));
assert.equal(partsCsv({bom:[{what:'a;b',count:2,note:'sag "x"'}]}),'Menge;Teil;Hinweis\r\n2;"a;b";"sag ""x"""\r\n');
console.log('Fertigungsnotizen: Passungen für die CNC, Spiel beim Druck, Arbeitsschritte, Stückliste als CSV.');
