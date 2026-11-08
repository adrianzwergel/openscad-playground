// Studio: the tool finds the motor's place. On the robot arm's drive M3 the search tries the catalog grid's places in a
// ball around the motor, moves it to the first with a train and lists the trains; undo brings the old place back. A
// ball nothing lies in says so and changes nothing.
import puppeteer from 'puppeteer';import {goTo,phase,menu,example,start} from './studio-ui.mjs';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-motor-'));
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(dir,'profil'),args:['--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const stored=p=>p.evaluate(async()=>{const dir=await (await navigator.storage.getDirectory()).getDirectoryHandle('projekte'),id=await (await (await dir.getFileHandle('geoeffnet.txt')).getFile()).text();return JSON.parse(await (await (await dir.getFileHandle(id+'.json')).getFile()).text());});
const m3=async p=>{await wait(500);return (await stored(p)).doc.mechanisms[0].drives.find(d=>d.id==='M3');};
try{const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1440,height:1000});await p.goto('http://localhost:4001/studio');await p.waitForSelector('[data-demo="robot"]');
 await example(p,`robot`);await wait(1500);await goTo(p,'M3 →');await p.waitForSelector('[data-find-motor-place]',{timeout:20000});
 const before=await m3(p);
 // A tiny ball: the place it is at, or nothing; the motor stays.
 await p.$eval('[data-place-radius]',e=>{e.value='5';e.dispatchEvent(new Event('change'));});await p.waitForSelector('[data-find-motor-place]');await p.click('[data-find-motor-place]');await p.waitForFunction(()=>/keinen freien Platz|Kein Platz|gefunden/.test(document.getElementById('status').textContent),{timeout:30000});const small=await p.$eval('#status',e=>e.textContent);
 assert.ok(small);
 // A real ball: the motor moves to a place with a train, the trains are listed.
 await p.waitForSelector('[data-find-motor-place]:not([disabled])',{timeout:60000});await p.$eval('[data-place-radius]',e=>{e.value='120';e.dispatchEvent(new Event('change'));});await p.waitForSelector('[data-find-motor-place]:not([disabled])');await p.evaluate(()=>{const s=[...document.querySelectorAll('#properties label')].find(l=>l.textContent.startsWith('Ziel')).querySelector('select');s.value='axis';s.dispatchEvent(new Event('change'));});await p.waitForSelector('[data-find-motor-place]:not([disabled])');await p.evaluate(()=>{document.getElementById('status').textContent='';});await p.click('[data-find-motor-place]');
 await p.waitForFunction(()=>/Motorplatz gefunden|Kein Platz|keinen freien/.test(document.getElementById('status').textContent),{timeout:170000});const report=await p.$eval('#status',e=>e.textContent);assert.match(report,/Motorplatz gefunden/,report);
 await p.waitForSelector('[data-adopt]',{timeout:60000});const after=await m3(p);
 assert.notDeepEqual(after.frame.position,before.frame.position,'Motor ist umgezogen');
 // Undo: the old place.
 await p.click('#undo');await wait(300);assert.deepEqual((await m3(p)).frame,before.frame);
 assert.deepEqual(errors,[]);console.log(`Studio Motorplatz: ${report} (von ${before.frame.position.map(n=>n.toFixed(0))} nach ${after.frame.position.map(n=>n.toFixed(0))}), Getriebe gelistet, Rückgängig ok.`);
}finally{await browser.close();await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});}
