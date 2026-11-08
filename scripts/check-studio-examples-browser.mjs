// Studio: the examples built from parts and connections open from the start page as projects of their own, each with a
// slider to move it and, in ③, bearings to plan; nothing fails on the way.
import puppeteer from 'puppeteer';import {start,phase} from './studio-ui.mjs';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-examples-')),shots=process.argv[2];
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(dir,'profil'),args:['--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const keys=['zahnstange','spindel','riemen','planet-steg','drehgeber','schwenkarm'];
try{const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1440,height:900});await p.goto('http://localhost:4001/studio');await p.waitForSelector('canvas');
 for(const k of keys){await start(p,`data-example="${k}"`);await p.waitForFunction(()=>document.body.dataset.view==='project');await p.waitForSelector('input[data-axis]',{timeout:20000});
  const slider=await p.$eval('input[data-axis]',e=>e.dataset.axis);await p.$eval('input[data-axis]',e=>{e.value=String((Number(e.max)+Number(e.min))/2+Number(e.max)*.4);e.dispatchEvent(new Event('input'));});await wait(300);
  if(shots&&['spindel','planet-steg'].includes(k)){await p.click('#fit');await wait(600);await p.screenshot({path:path.join(shots,`ex-${k}.png`)});}
  await phase(p,3);await p.waitForSelector('[data-derived="bearings"]',{timeout:20000});await phase(p,1);console.log(`${k}: Regler „${slider}“, ③ Lager & Wellen`);}
 assert.deepEqual(errors,[]);console.log(`Studio Beispiele: ${keys.length} Projekte aus Bauteilen und Verbindungen, je mit Regler und Lagern in ③.`);
}finally{await browser.close();await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});}
