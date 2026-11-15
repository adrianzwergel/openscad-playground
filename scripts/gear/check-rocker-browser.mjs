// Gearbox, example "Rocker-Bogie": it opens without an error, the 3D model is built with the motor's original, and
// the sliders swing rocker and bogie.
import puppeteer from 'puppeteer';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'rocker-')),shots=process.argv[2];
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(dir,'profil'),protocolTimeout:240000});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try{const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1500,height:1000});
 const ready=async()=>{await p.waitForFunction(()=>['ready','error'].includes(document.querySelector('#preview-state')?.dataset.state),{timeout:240000});const st=await p.$eval('#preview-state',e=>({s:e.dataset.state,t:e.textContent}));assert.equal(st.s,'ready',st.t);};
 await p.goto('http://localhost:4001/getriebe');await p.waitForSelector('body[data-ready=true] [data-example="rocker"]',{visible:true});await p.click('[data-example="rocker"]');
 await p.waitForFunction(()=>document.querySelector('#gear-name').textContent.includes('Rocker-Bogie')&&!!document.querySelector('#top [data-shaft="w3"]'));
 assert.equal(await p.$$eval('#issues .fehler,#issues [data-level=fehler]',e=>e.length),0,'keine Fehler');
 await ready();await wait(1500);
 const sum=await p.evaluate(()=>window.preview.summary());assert.ok(sum.some(m=>/nema17-40\.stl/.test(m.original??'')),'Motor als Original');
 assert.equal(await p.$$eval('#pose input[data-pose]',e=>e.length),2,'Regler für Rocker und Bogie');
 if(shots)await p.screenshot({path:path.join(shots,'rocker-1.png')});
 for(const [k,v] of [['g:g1',12],['g:g2',-8]])await p.$eval(`#pose input[data-pose="${k}"]`,(e,v)=>{e.value=v;e.dispatchEvent(new Event('input'));},String(v));await wait(300);await ready();await wait(1200);
 if(shots)await p.screenshot({path:path.join(shots,'rocker-2.png')});
 // Prototype: no ball bearings in the 3D model any more, the parts list keeps them.
 const before=(await p.evaluate(()=>window.preview.summary())).filter(m=>/685/.test(m.name)).length;assert.ok(before>0,'Kugellager im Modell');
 const bom=await p.$eval('#bom',e=>e.textContent);await p.click('#properties [data-proto]');await wait(300);await ready();await wait(800);
 assert.equal((await p.evaluate(()=>window.preview.summary())).filter(m=>/685/.test(m.name)).length,0,'Prototyp ohne Kugellager');assert.equal(await p.$eval('#bom',e=>e.textContent),bom,'Stückliste gleich');
 assert.deepEqual(errors,[]);
 console.log('Rocker-Bogie im Browser: Beispiel ohne Fehler, 3D mit Original-Motor, Rocker und Bogie geschwenkt, als Prototyp ohne Kugellager.');
}finally{await browser.close();await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});}
