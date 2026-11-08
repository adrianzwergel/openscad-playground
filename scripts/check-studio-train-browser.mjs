// Studio: a gear train by hand. z16 dragged into the view, z40 beside it snaps to the mesh distance, the ratio shows,
// a third wheel on the same shaft stacks; undo works, a reload keeps it; the button makes it a mechanism with sliders
// and bearings. The planetary stage from the blocks becomes a mechanism too.
import puppeteer from 'puppeteer';import {goTo,phase,menu,newProject} from './studio-ui.mjs';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-train-'));
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(dir,'profil'),args:['--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const stored=p=>p.evaluate(async()=>{const dir=await (await navigator.storage.getDirectory()).getDirectoryHandle('projekte'),id=await (await (await dir.getFileHandle('geoeffnet.txt')).getFile()).text();return JSON.parse(await (await (await dir.getFileHandle(id+'.json')).getFile()).text());});
const settled=async(p,test)=>{for(let i=0;i<80;i++){const f=await stored(p).catch(()=>undefined);if(f&&test(f))return f;await wait(100);}throw Error('Datei nicht wie erwartet: '+JSON.stringify((await stored(p)).doc.builds?.[0]?.train).slice(0,400));};
const gear=(p,teeth)=>p.$$eval('[data-gear]',(x,z)=>x.find(e=>e.textContent.startsWith(`LEGO z${z}`)).dataset.gear,teeth);
const dragGear=async(p,id,to)=>{await p.evaluate(i=>{const e=document.querySelector(`[data-gear="${i}"]`);e.closest('details').open=true;e.scrollIntoView({block:'center'});},id);const r=await p.$eval(`[data-gear="${id}"]`,e=>{const b=e.getBoundingClientRect();return [b.x+b.width/2,b.y+b.height/2];}),[x,y]=await p.evaluate(a=>window.studioScreen(a),to);await p.mouse.move(...r);await p.mouse.down();await p.mouse.move(r[0]+30,r[1],{steps:3});await p.mouse.move(x,y,{steps:8});await wait(80);await p.mouse.up();await wait(200);};
try{const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1440,height:1000});await p.goto('http://localhost:4001/studio');await p.waitForSelector('canvas');
 await newProject(p);await p.waitForSelector('[data-gear]');
 // First wheel, second beside it: it snaps to 28 mm.
 await dragGear(p,await gear(p,16),[0,0,0]);let f=await settled(p,x=>x.doc.builds?.[0]?.train?.wheels.length===1);
 await dragGear(p,await gear(p,40),[30,0,2]);f=await settled(p,x=>x.doc.builds[0].train.wheels.length===2);let t=f.doc.builds[0].train;const [a,b]=t.shafts;assert.ok(Math.abs(Math.hypot(b.at[0]-a.at[0],b.at[1]-a.at[1])-28)<1e-6,`Abstand ${JSON.stringify(t.shafts)}`);assert.equal(t.input,a.id);assert.equal(t.output,b.id);
 await p.waitForSelector('#train-ratio');assert.match(await p.$eval('#train-ratio',e=>e.textContent),/1 : 2,50, Ausgang dreht gegensinnig/);assert.match(await p.$eval('#build-issues',e=>e.textContent),/kämmen/);
 // A third wheel onto the second shaft stacks beside it.
 await dragGear(p,await gear(p,16),[...[b.at[0]],0,b.at[1]]);f=await settled(p,x=>x.doc.builds[0].train.wheels.length===3);t=f.doc.builds[0].train;assert.equal(t.shafts.length,2);const on=t.wheels.filter(w=>w.shaft===b.id);assert.equal(on.length,2);assert.ok(Math.abs(on[0].z-on[1].z)>=8);
 // Undo, redo; delete by key.
 await p.click('#undo');await settled(p,x=>x.doc.builds[0].train.wheels.length===2);await p.click('#redo');await settled(p,x=>x.doc.builds[0].train.wheels.length===3);
 await p.evaluate(()=>[...document.querySelectorAll('[data-wheel]')].at(-1).click());await p.waitForSelector('[data-remove]');await p.click('[data-remove]');await settled(p,x=>x.doc.builds[0].train.wheels.length===2);
 // Around its neighbour by angle: z40 straight above the z16, still meshing at 28 mm. The grids sit in the library.
 assert.equal(await p.$eval('[data-field="Winkelraster am Nachbarrad"]',s=>s.value),'15');
 await p.evaluate(()=>[...document.querySelectorAll('[data-wheel]')].find(x=>x.textContent.includes('z40')).click());await p.waitForSelector('[data-field="Winkel am LEGO z16 [°]"]');
 await p.$eval('[data-field="Winkel am LEGO z16 [°]"]',e=>{e.value='90';e.dispatchEvent(new Event('change'));});f=await settled(p,x=>{const s=x.doc.builds[0].train.shafts;return Math.abs(s[1].at[0]-s[0].at[0])<1e-9;});t=f.doc.builds[0].train;assert.ok(Math.abs(t.shafts[1].at[1]-t.shafts[0].at[1]-28)<1e-9,JSON.stringify(t.shafts));await p.waitForFunction(()=>/2,50/.test(document.getElementById('train-ratio')?.textContent??''));
 // Target grid: a z16 dropped near the z40 (now at 0/28) lands on the exact grid point 28/28; undo takes it back.
 await p.click('[data-field="Zielraster"]');await settled(p,x=>x.doc.builds[0].train.target===true);
 await dragGear(p,await gear(p,16),[25,0,30]);f=await settled(p,x=>x.doc.builds[0].train.wheels.length===3);assert.deepEqual(f.doc.builds[0].train.shafts.at(-1).at,[28,28]);assert.match(await p.$eval('#status',e=>e.textContent),/kämmt mit LEGO z40/);
 await p.click('#undo');await settled(p,x=>x.doc.builds[0].train.wheels.length===2);
 // A reload keeps it; ② opens the train.
 await wait(500);await p.reload();await p.waitForSelector('[data-wheel]',{timeout:20000});await phase(p,2);await p.waitForSelector('#train-ratio',{timeout:20000});assert.match(await p.$eval('#train-ratio',e=>e.textContent),/2,50/);
 // The wheels turn by hand in any phase: the slider under the view, the output read off at 1 : 2,5.
 await phase(p,1);await p.waitForSelector('input[data-axis="Zahnräder"]');await p.$eval('input[data-axis="Zahnräder"]',e=>{e.value='100';e.dispatchEvent(new Event('input'));});assert.match(await p.$eval('#axes',e=>e.textContent),/100° → Ausgang -40°/);
 // In ③ the button: a mechanism with a slider, its train driven, bearings planned.
 await phase(p,3);await p.waitForSelector('[data-compile]');
 await p.click('[data-compile]');await p.waitForFunction(()=>document.body.dataset.scene==='mechanism',{timeout:20000});await p.waitForSelector('input[data-axis="Abtrieb"]',{timeout:20000});f=await settled(p,x=>x.doc.mechanisms?.length===1);assert.ok(!(f.doc.builds??[]).some(x=>x.train?.wheels.length),'die Räder sind jetzt der Mechanismus');const m=f.doc.mechanisms[0];assert.equal(m.drives[0].target,2.5);assert.ok(m.drives[0].gear);assert.equal(m.fabrication.bearings.shaft,'lego');
 await goTo(p,'Lager & Wellen');await wait(500);assert.match(await p.$eval('#properties',e=>e.textContent),/Gleitlager/);
 // One device, one mechanism: here the block is locked; in a new project it becomes its mechanism.
 await phase(p,1);await p.waitForSelector('[data-planet-make]');assert.equal(await p.$eval('[data-planet-make]',b=>b.disabled),true);
 await newProject(p);await p.waitForSelector('[data-planet-make]');await p.evaluate(()=>{const b=document.querySelector('[data-planet-make]');b.closest('details.store-group').open=true;b.closest('details.templates').open=true;});await p.click('[data-planet-make]');await p.waitForFunction(()=>document.body.dataset.scene==='mechanism',{timeout:20000});f=await settled(p,x=>x.doc.mechanisms?.length===1&&/z16\/z16/.test(x.doc.mechanisms[0].label));assert.equal(f.doc.mechanisms[0].drives[0].target,4);
 assert.deepEqual(errors,[]);console.log('Studio Getriebe: gezogen, eingerastet (28 mm), 1 : 2,5, aufgesteckt, Reload, Mechanismus mit Regler und Lagern, Planetenstufe.');
}finally{await browser.close();await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});}
