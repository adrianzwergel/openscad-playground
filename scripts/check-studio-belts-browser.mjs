// Studio: belts. Two GT2 pulleys on their own shafts, a belt laid from the first to the second: they turn the same way at
// 1 : 2, the page gives the belt's length and the next stock loop, the connections list the belt; removing a pulley takes it.
import puppeteer from 'puppeteer';import {newProject} from './studio-ui.mjs';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-belts-'));
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(dir,'profil'),args:['--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const stored=p=>p.evaluate(async()=>{const dir=await (await navigator.storage.getDirectory()).getDirectoryHandle('projekte'),id=await (await (await dir.getFileHandle('geoeffnet.txt')).getFile()).text();return JSON.parse(await (await (await dir.getFileHandle(id+'.json')).getFile()).text());});
const settled=async(p,test)=>{for(let i=0;i<80;i++){const f=await stored(p).catch(()=>undefined);try{if(f&&test(f))return f;}catch{/* not yet */}await wait(100);}throw Error('Datei nicht wie erwartet: '+JSON.stringify((await stored(p)).doc.builds?.[0]?.train).slice(0,600));};
const screen=(p,at)=>p.evaluate(a=>window.studioScreen(a),at);
const drag=async(p,from,to)=>{await p.mouse.move(...from);await p.mouse.down();await p.mouse.move(from[0]+20,from[1]+4,{steps:3});await p.mouse.move(...to,{steps:10});await wait(100);await p.mouse.up();await wait(300);};
const card=async(p,sel)=>{await p.evaluate(s=>{const r=document.querySelector(s);const d=r.closest('details');if(d)d.open=true;r.scrollIntoView({block:'center'});},sel);return p.$eval(sel,e=>{const b=e.getBoundingClientRect();return [b.x+b.width/2,b.y+b.height/2];});};
try{const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1440,height:1000});await p.goto('http://localhost:4001/studio');await p.waitForSelector('canvas');
 await newProject(p);await p.waitForSelector('[data-gear="gt2-20"]');
 await drag(p,await card(p,'[data-gear="gt2-20"]'),await screen(p,[0,0,0]));await settled(p,x=>x.doc.builds[0].train?.wheels.length===1);
 await drag(p,await card(p,'[data-gear="gt2-40"]'),await screen(p,[60,0,0]));let f=await settled(p,x=>x.doc.builds[0].train.wheels.length===2);const [a,b]=f.doc.builds[0].train.wheels;assert.ok(a.pulley&&b.pulley);
 await p.click(`[data-wheel="${a.id}"]`);await p.waitForSelector('[data-field="Riemen zu"]');await p.$eval('[data-field="Riemen zu"]',(e,v)=>{e.value=v;e.dispatchEvent(new Event('change'));},b.id);
 f=await settled(p,x=>x.doc.builds[0].train.belts?.length===1);await p.waitForSelector('#belt-length');const len=await p.$eval('#belt-length',e=>e.textContent);assert.match(len,/Standardlänge (280|300|200) mm/,len);
 await p.waitForSelector('input[data-axis="Zahnräder"]');await p.$eval('input[data-axis="Zahnräder"]',e=>{e.value='90';e.dispatchEvent(new Event('input'));});assert.match(await p.$eval('#axes-outputs',e=>e.textContent),/Ausgang GT2 z40: 45°/);
 assert.ok(await p.$$eval('[data-link]',x=>x.some(e=>/Riemen GT2 z20 ↔ GT2 z40/.test(e.textContent))),'unter Verbindungen');
 await p.click(`[data-wheel="${b.id}"]`);await p.waitForSelector('[data-remove]');await p.click('[data-remove]');await settled(p,x=>x.doc.builds[0].train.wheels.length===1&&!x.doc.builds[0].train.belts);
 assert.deepEqual(errors,[]);console.log(`Studio Riemen: GT2 z20 → z40 gleichsinnig 1 : 2, ${len.trim()} Entfernen nimmt den Riemen mit.`);
}finally{await browser.close();await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});}
