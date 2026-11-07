// Studio: parts on a model go into the structures, by the real button. A part dropped on the planetary gearbox's base,
// the structure step through the worker: its holding points are anchors of the base, the panel counts them, the part's
// domes stand in the downloaded STL.
import puppeteer from 'puppeteer';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-parts-structure-'));
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(dir,'profil'),args:['--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const stored=p=>p.evaluate(async()=>{const dir=await (await navigator.storage.getDirectory()).getDirectoryHandle('projekte'),id=await (await (await dir.getFileHandle('geoeffnet.txt')).getFile()).text();return JSON.parse(await (await (await dir.getFileHandle(id+'.json')).getFile()).text());});
try{const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1440,height:1000});await p.goto('http://localhost:4001/studio');await p.waitForSelector('[data-demo="planet16"]');
 await p.click('[data-demo="planet16"]');await p.waitForSelector('[data-part="rpi-pico"]',{timeout:30000});await wait(1500);await p.click('#fit');await wait(500);
 const card='[data-part="arduinonano"]';await p.evaluate(s=>{const r=document.querySelector(s);r.closest('details').open=true;r.scrollIntoView({block:'center'});},card);const r=await p.$eval(card,e=>{const b=e.getBoundingClientRect();return [b.x+b.width/2,b.y+b.height/2];}),[x,y]=await p.evaluate(a=>window.studioScreen(a),[55,-45,6]);await p.mouse.move(...r);await p.mouse.down();await p.mouse.move(r[0]+30,r[1],{steps:3});await p.mouse.move(x,y,{steps:8});await wait(100);await p.mouse.up();await wait(700);
 const f=await stored(p),item=f.doc.builds?.[0]?.items[0];assert.equal(item?.free?.body,'ground',JSON.stringify(item));
 // The part is still selected: the tree must still lead to the structure page.
 await p.evaluate(()=>[...document.querySelectorAll('#tree button')].find(b=>b.textContent.includes('Struktur je Glied')).click());await p.waitForSelector('[data-generate-structures]',{timeout:5000});
 await p.click('[data-generate-structures]');await p.waitForFunction(()=>/Fertig|Fehlern|Fehlgeschlagen/.test(document.getElementById('structure-progress')?.textContent??''),{timeout:170000});
 const text=await p.$eval('#structure-progress',e=>e.textContent);assert.match(text,/4 von 4 Haltepunkten der Teile eingebunden/,text);assert.deepEqual(errors,[]);console.log(`Studio Teile in der Struktur: ${text}`);
}finally{await browser.close();await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});}
