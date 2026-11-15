// The spring examples open from their start pages without an error: the shaft with the slip clutch, the LEGO rocker with
// its return spring, the swing arm with the printed strut in the Studio.
import puppeteer from 'puppeteer';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {start} from './studio-ui.mjs';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'beispiele-')),shots=process.argv[2];
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(dir,'profil'),protocolTimeout:240000});
const wait=ms=>new Promise(r=>setTimeout(r,ms)),shot=async(p,n)=>{if(shots)await p.screenshot({path:path.join(shots,n)});};
const ready=async p=>{await p.waitForFunction(()=>['ready','error'].includes(document.querySelector('#preview-state')?.dataset.state),{timeout:240000});assert.equal(await p.$eval('#preview-state',e=>e.dataset.state),'ready');};
try{const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1500,height:950});
 // Shaft generator.
 await p.goto('http://localhost:4001/welle.html');await p.waitForSelector('body[data-ready=true] [data-example="kupplung"]',{visible:true});await p.click('[data-example="kupplung"]');
 await p.waitForSelector('[data-clip="item:k"]');assert.equal(await p.$$eval('#issues [data-level=fehler]',e=>e.length),0);await ready(p);await wait(800);await p.click('[data-clip="item:k"]');await p.waitForSelector('#clutch-info');await shot(p,'beispiel-kupplung.png');
 // Gearbox generator.
 await p.goto('http://localhost:4001/getriebe.html');await p.waitForSelector('body[data-ready=true] [data-example="rocker-feder"]',{visible:true});await p.click('[data-example="rocker-feder"]');
 await p.waitForSelector('#top [data-spring="f1"]');assert.equal(await p.$$eval('#issues [data-level=fehler]',e=>e.length),0);await ready(p);await p.click('#top [data-spring="f1"] .hit');await wait(500);await shot(p,'beispiel-rocker-feder.png');
 // Studio.
 await p.goto('http://localhost:4001/studio.html');await start(p,'data-example="federbein"');await p.waitForSelector('[data-linkage="federbein"]');await p.click('[data-linkage="federbein"]');await p.waitForSelector('#strut-info');
 assert.equal(await p.$$eval('#properties .state-fail',e=>e.length),0);await wait(800);await shot(p,'beispiel-federbein.png');
 assert.deepEqual(errors,[]);console.log('Beispiele im Browser: Rutschkupplung, LEGO-Rocker mit Rückholfeder, Schwinge mit Federbein öffnen ohne Fehler.');
}finally{await browser.close();await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});}
