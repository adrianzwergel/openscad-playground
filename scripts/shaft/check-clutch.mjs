// Slip clutch on a shaft: friction discs keyed on a D of the wheel's bore, the wheel free between them, the spring over
// the shaft, a spring plate; the slip torque 2·μ·F·r_m; a bearing beside it on the D; the parts list and the solids;
// a LEGO wheel, a spring too tight for the shaft and a preload to block are said; in a gearbox the wheel drives.
import assert from 'node:assert/strict';import fs from 'node:fs';
import opencascade from 'replicad-opencascadejs';import {setOC,localGC} from 'replicad';
import {planShaft} from '../../src/shaft/plan.ts';import {parseShaft,defaultSettings} from '../../src/shaft/model.ts';import {buildParts} from '../../src/shaft/cad.ts';
import {clutchLayout,slipTorque,defaultClutch} from '../../src/shaft/clutch.ts';import {onPart} from '../../src/shaft/catalog.ts';import {springCatalog} from '../../src/shaft/springs.ts';
const near=(a,b,e=1e-9)=>Math.abs(a-b)<=e,shaft=(clutch)=>parseShaft({length:70,making:'druck',items:[{id:'l1',part:'lager-685',x:0},{id:'k',part:'rutschkupplung',x:8,...(clutch?{clutch}:{})},{id:'l2',part:'lager-685',x:65}],inserts:[],works:[],settings:{...defaultSettings}});
const p=planShaft(shaft());assert.deepEqual(p.issues.filter(i=>i.level!=='hinweis').map(i=>i.message),[]);
const k=p.placed.find(t=>t.id==='k'),wheel=p.placed.find(t=>t.id==='k-rad');assert.deepEqual(k.bore,{kind:'d',d:5,flat:.5},'die Scheiben drehen mit: D5');
assert.equal(wheel.inside,'k');assert.ok(!wheel.free,'das Rad treibt (für das Getriebe kein Losrad)');assert.equal(wheel.part.teeth,40);
// The pieces in a row: disc, wheel, disc, spring, plate; the slip torque from spring, friction and radius.
const l=clutchLayout(defaultClutch,onPart),cat=springCatalog(),sp=cat[defaultClutch.spring];assert.ok(near(l.width,2*2.5+8+(sp.L0-3)+2));assert.ok(near(k.x1-k.x0,l.width));
const t=slipTorque(defaultClutch,l,5);assert.ok(near(t.F,sp.R*3)&&near(t.T,2*.3*t.F*((3+l.discD/2)/2)),`Moment ${t.T}`);assert.ok(near(k.clutch.T,t.T));
assert.ok(p.issues.some(i=>/Rutschkupplung rutscht ab etwa [\d,]+ N·cm/.test(i.message)));assert.ok(p.issues.some(i=>/sitzt auf dem D5/.test(i.message)),'das Lager daneben auf dem D');
// Parts list and solids.
const bom=p.bom.map(b=>`${b.count}× ${b.what}`).join(' | ');assert.match(bom,/2× Reibscheibe/);assert.match(bom,/1× Federteller/);assert.match(bom,/1× Druckfeder 9,5 × 16/);assert.match(bom,/Stirnrad z40 m1/);
const oc=await opencascade({print:()=>{},printErr:()=>{},wasmBinary:fs.readFileSync('node_modules/replicad-opencascadejs/dist/replicad_single.wasm')});setOC(oc);
const [keep,gc]=localGC(),parts=buildParts(shaft(),p,keep).parts;assert.equal(parts.filter(x=>/^kupplung-k-\d$/.test(x.file)&&x.made).length,3);assert.ok(parts.some(x=>x.file==='feder-k'&&!x.made));assert.ok(parts.some(x=>x.file==='k-rad'));gc();
// Said: a LEGO wheel (cross bore), a spring too tight over the shaft, a preload to block, none at all.
const say=(c,re,level='fehler')=>assert.ok(planShaft(shaft({...defaultClutch,...c})).issues.some(i=>i.level===level&&re.test(i.message)),String(re));
say({wheel:'lego-3649',width:8},/kann nicht rutschen/);say({spring:'druck-5,5x17,5'},/geht nicht über die Welle/);say({preload:12},/auf Block/);say({preload:0},/überträgt nichts/,'warnung');
// Measured springs count: a harder one, more torque.
const hard=planShaft(shaft(),springCatalog({[defaultClutch.spring]:{points:[{g:1000,L:13}]}})).placed.find(x=>x.id==='k').clutch;assert.ok(hard.T>k.clutch.T,'gemessen härter: mehr Moment');
console.log(`Rutschkupplung: D5 unter den Scheiben, z40 m1 lose, ${sp.label} mit 3 mm Vorspannung → ${(t.F).toFixed(1)} N, rutscht ab ${(t.T/10).toFixed(2)} N·cm; Lager auf dem D; Stückliste, drei Druckteile und die Feder; LEGO-Rad, enge Feder, Block, ohne Vorspannung gemeldet.`);
