// Studio: connections, as in CAD. A shaft is a part of its own: set to stand it becomes an axle and its wheels run
// loose; a wheel can run loose on its own. A part dropped on a gear is connected to its shaft. A part that slides
// along its x with an input moves by its slider. The connections folder lists what turns, stands and hangs on what.
import puppeteer from 'puppeteer';import {newProject} from './studio-ui.mjs';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-links-'));
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(dir,'profil'),args:['--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const stored=p=>p.evaluate(async()=>{const dir=await (await navigator.storage.getDirectory()).getDirectoryHandle('projekte'),id=await (await (await dir.getFileHandle('geoeffnet.txt')).getFile()).text();return JSON.parse(await (await (await dir.getFileHandle(id+'.json')).getFile()).text());});
const settled=async(p,test)=>{for(let i=0;i<80;i++){const f=await stored(p).catch(()=>undefined);try{if(f&&test(f))return f;}catch{/* not yet */}await wait(100);}throw Error('Datei nicht wie erwartet: '+JSON.stringify((await stored(p)).doc.builds?.[0]).slice(0,700));};
const screen=(p,at)=>p.evaluate(a=>window.studioScreen(a),at);
const drag=async(p,from,to)=>{await p.mouse.move(...from);await p.mouse.down();await p.mouse.move(from[0]+20,from[1]+4,{steps:3});await p.mouse.move(...to,{steps:10});await wait(100);await p.mouse.up();await wait(300);};
const card=async(p,sel)=>{await p.evaluate(s=>{const r=document.querySelector(s);const d=r.closest('details');if(d)d.open=true;r.scrollIntoView({block:'center'});},sel);return p.$eval(sel,e=>{const b=e.getBoundingClientRect();return [b.x+b.width/2,b.y+b.height/2];});};
const gear=(p,z)=>p.$$eval('[data-gear]',(x,z)=>x.find(e=>e.textContent.startsWith(`LEGO z${z}`)).dataset.gear,z);
const field=(p,name,value)=>p.$eval(`[data-field="${name}"]`,(e,v)=>{e.value=v;e.dispatchEvent(new Event('change'));},value);
try{const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1440,height:1000});await p.goto('http://localhost:4001/studio');await p.waitForSelector('canvas');
 await newProject(p);await p.waitForSelector('[data-gear]');
 for(const [z,at] of [[16,[0,0,0]],[40,[30,0,2]],[24,[-90,0,0]]]){await drag(p,await card(p,`[data-gear="${await gear(p,z)}"]`),await screen(p,at));}
 let f=await settled(p,x=>x.doc.builds[0].train?.wheels.length===3);const t=f.doc.builds[0].train,z24=t.wheels.find(w=>w.teeth===24),z40=t.wheels.find(w=>w.teeth===40),z16=t.wheels.find(w=>w.teeth===16);
 // The z24's shaft as a part: set to stand it is an axle, the wheel on it runs loose.
 await p.click(`[data-shaft="${z24.shaft}"]`);await p.waitForSelector('[data-field="Verbindung der Welle"]');await field(p,'Verbindung der Welle','steht');
 f=await settled(p,x=>x.doc.builds[0].train.shafts.find(s=>s.id===z24.shaft).fixed===true);assert.equal(f.doc.builds[0].train.wheels.find(w=>w.id===z24.id).loose,true,'auf der Achse lose');
 await p.waitForSelector('[data-link]');assert.ok(await p.$$eval('[data-link]',x=>x.some(e=>/Achse von LEGO z24 steht fest/.test(e.textContent))),'unter Verbindungen');
 // A wheel can run loose on its own, and back.
 await p.click(`[data-wheel="${z40.id}"]`);await p.waitForSelector('[data-field="Auf der Welle"]');await field(p,'Auf der Welle','lose');await settled(p,x=>x.doc.builds[0].train.wheels.find(w=>w.id===z40.id).loose===true);
 await p.waitForSelector('[data-field="Auf der Welle"]');await field(p,'Auf der Welle','fest');await settled(p,x=>!x.doc.builds[0].train.wheels.find(w=>w.id===z40.id).loose);
 // A part dropped on the z16 is connected to its shaft.
 await p.click('#fit');await wait(600);await drag(p,await card(p,'[data-part="d1-mini"]'),await screen(p,[5,-4,5]));
 f=await settled(p,x=>x.doc.builds[0].items.length===1);assert.equal(f.doc.builds[0].items[0].free.body,`welle:${z16.shaft}`,'auf dem Rad: an seiner Welle');
 // A part sliding along its x, driven: its slider moves it.
 await drag(p,await card(p,'[data-part="rpi4"]'),await screen(p,[0,-90,0]));f=await settled(p,x=>x.doc.builds[0].items.length===2);const pi=f.doc.builds[0].items.find(i=>i.part==='rpi4');assert.equal(pi.free.body,undefined,'am Boden: an der Welt');
 await p.click(`[data-item="${pi.id}"]`);await p.waitForSelector('[data-field="Verbindungsart"]');await field(p,'Verbindungsart','schieben');await settled(p,x=>x.doc.builds[0].items.find(i=>i.id===pi.id).free.joint?.kind==='schieben');
 await p.waitForSelector('[data-field="Eingang"]');await p.click('[data-field="Eingang"]');await settled(p,x=>x.doc.builds[0].items.find(i=>i.id===pi.id).free.joint?.input);
 await p.waitForSelector(`input[data-joint="teil:${pi.id}"]`);const before=await p.evaluate(k=>window.studioPart(k),`teil:${pi.id}`);await p.$eval(`input[data-joint="teil:${pi.id}"]`,e=>{e.value='50';e.dispatchEvent(new Event('input'));});await wait(400);const after=await p.evaluate(k=>window.studioPart(k),`teil:${pi.id}`);
 assert.ok(Math.abs(after[0]-before[0]-50)<1e-6,`schiebt um 50 mm: ${before} → ${after}`);
 const links=await p.$$eval('[data-link]',x=>x.map(e=>e.textContent));assert.ok(links.some(l=>/Raspberry Pi 4 schiebt entlang x an der Welt · Eingang/.test(l)),links.join(' | '));assert.ok(links.some(l=>/fest an Welle von LEGO z16/.test(l)),links.join(' | '));
 assert.deepEqual(errors,[]);console.log(`Studio Verbindungen: Achse steht, Losrad, Teil auf dem Rad an seiner Welle, Schlitten-Teil schiebt 50 mm per Regler, ${links.length} Verbindungen gelistet.`);
}finally{await browser.close();await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});}
