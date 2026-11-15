// Gearboxes in the Studio: an example gearbox made in the gearbox generator is linked into an empty project, drawn as
// its solids, its swing arms are bodies with sliders, mirrored it stays; a part connected to a swing arm follows its
// slider; "Bearbeiten" opens the generator in a window; the link survives a reload.
import puppeteer from 'puppeteer';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {newProject} from './studio-ui.mjs';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-gear-')),shots=process.argv[2];
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(dir,'profil'),protocolTimeout:240000});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try{const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1500,height:1000});
 // The gearbox, made in its generator.
 await p.goto('http://localhost:4001/getriebe');await p.waitForSelector('body[data-ready=true] [data-example="rocker-lego"]',{visible:true});await p.click('[data-example="rocker-lego"]');
 await p.waitForFunction(()=>document.querySelector('#gear-name').textContent.includes('Rocker-Bogie'));await wait(800);
 // Into an empty project of the Studio.
 await p.goto('http://localhost:4001/studio.html');await newProject(p);
 await p.evaluate(()=>{document.querySelector('[data-store-gearboxes]').open=true;});
 await p.waitForSelector('[data-store-gearboxes] [data-gearbox]',{visible:true,timeout:20000});
 const gear=await p.$eval('[data-store-gearboxes] [data-gearbox]',e=>e.dataset.gearbox);await p.click(`[data-store-gearboxes] [data-gearbox="${gear}"]`);
 await p.waitForSelector('[data-gearbox-row]',{timeout:20000});const link=await p.$eval('[data-gearbox-row]',e=>e.dataset.gearboxRow);
 assert.match(await p.$eval('[data-gearbox-row]',e=>e.textContent),/Rocker-Bogie/);
 await p.waitForFunction(l=>(window.studioGearbox(l)?.meshes??0)>10,{timeout:180000,polling:500},link);
 const drawn=await p.evaluate(l=>window.studioGearbox(l),link);assert.equal(drawn.arms,2,'Rocker und Bogie als Körper');
 // A slider per swing arm, each a body that turns.
 await p.waitForFunction(()=>document.querySelectorAll('#axes input[data-arm]').length===2,{timeout:20000});
 const arms=await p.$$eval('#axes input[data-arm]',e=>e.map(x=>x.dataset.arm));
 const before=await p.evaluate(k=>window.studioFrame(k),arms[1]);
 await p.$eval(`#axes input[data-arm="${arms[1]}"]`,e=>{e.value='10';e.dispatchEvent(new Event('input'));});await wait(300);
 const after=await p.evaluate(k=>window.studioFrame(k),arms[1]);assert.ok(Math.hypot(...after.map((v,i)=>v-before[i]))>1,'die Bogie schwenkt um ihren Drehpunkt');
 if(shots)await p.screenshot({path:path.join(shots,'studio-gearbox-1.png')});
 // A part from the library, connected to the bogie: it follows the rocker's slider.
 await p.evaluate(()=>{const row=document.querySelector('[data-part="arduino-uno"]')??document.querySelector('[data-part]');row.closest('details').open=true;row.scrollIntoView({block:'center'});});
 const part=await p.$eval('[data-part="arduino-uno"]',e=>e.dataset.part).catch(()=>undefined)??await p.$eval('[data-part]',e=>e.dataset.part);
 const r=await p.$eval(`[data-part="${part}"]`,e=>{const b=e.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};});await p.mouse.click(r.x,r.y);await wait(500);
 await p.waitForSelector('#properties select[data-field="Verbunden mit"]');
 const target=arms[1];assert.ok(await p.$eval('#properties select[data-field="Verbunden mit"]',(s,t)=>[...s.options].some(o=>o.value===t),target),'Schwinge in „Verbunden mit“');
 await p.select('#properties select[data-field="Verbunden mit"]',target);await wait(400);
 const item=await p.evaluate(()=>[...document.querySelectorAll('#tree [data-item]')].map(e=>e.dataset.item)[0]);
 const at0=await p.evaluate(k=>window.studioPart(k),`teil:${item}`);
 await p.$eval(`#axes input[data-arm="${arms[1]}"]`,e=>{e.value='-12';e.dispatchEvent(new Event('input'));});await wait(400);
 const at1=await p.evaluate(k=>window.studioPart(k),`teil:${item}`);assert.ok(Math.hypot(...at1.map((v,i)=>v-at0[i]))>2,`das Teil schwenkt mit (${at0} → ${at1})`);
 // Mirrored: the other side.
 await p.click(`[data-gearbox-row="${link}"]`);await p.waitForSelector('#properties input[data-field="Gespiegelt"]');await p.click('#properties input[data-field="Gespiegelt"]');await wait(400);
 assert.equal((await p.evaluate(l=>window.studioGearbox(l),link)).mirrored,true);
 if(shots)await p.screenshot({path:path.join(shots,'studio-gearbox-2.png')});
 // Editing: the generator in a window, on this gearbox.
 await p.click('#properties [data-gearbox-edit]');await p.waitForSelector('#gearbox-dialog:not([hidden])');
 const frame=await (await p.$('#gearbox-frame')).contentFrame();await frame.waitForSelector('body[data-ready=true].embedded',{timeout:30000});
 assert.match(await frame.$eval('#gear-name',e=>e.textContent),/Rocker-Bogie/);
 await p.click('#gearbox-dialog-close');await p.waitForSelector('#gearbox-dialog',{hidden:true});
 // After a reload the link is there again, drawn and mirrored.
 await wait(800);await p.reload();await p.waitForSelector('[data-gearbox-row]',{timeout:30000});
 await p.waitForFunction(l=>(window.studioGearbox(l)?.meshes??0)>10,{timeout:180000,polling:500},link);assert.equal((await p.evaluate(l=>window.studioGearbox(l),link)).mirrored,true);
 assert.deepEqual(errors,[]);
 console.log('Getriebe im Studio: verknüpft, als Körper gezeichnet, Schwingen mit Reglern, Teil schwenkt mit, gespiegelt, im Fenster bearbeitet, nach Neuladen da.');
}finally{await browser.close();await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});}
