// The slip clutch in the shaft generator: a click in the catalog puts it on a new shaft; its page shows the slip torque;
// a stronger preload raises it; a spring too tight for the shaft is marked in the list; the 3D model has discs and spring.
import puppeteer from 'puppeteer';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'kupplung-')),shots=process.argv[2];
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(dir,'profil'),protocolTimeout:240000});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try{const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1500,height:950});
 await p.goto('http://localhost:4001/welle.html');await p.waitForSelector('body[data-ready=true] #new-shaft',{visible:true});await p.click('#new-shaft');await p.waitForSelector('.tl-lane.auf',{visible:true});
 await p.$eval('[data-add="auf:rutschkupplung"]',e=>e.scrollIntoView({block:'center'}));await p.click('[data-add="auf:rutschkupplung"]');
 await p.waitForSelector('#clutch-info');const torque=async()=>Number((await p.$eval('#clutch-info',e=>e.textContent)).match(/Rutscht ab etwa ([\d,]+) N·cm/)[1].replace(',','.'));
 const t0=await torque();assert.ok(t0>1&&t0<10,`Moment ${t0}`);
 assert.match(await p.$eval('#properties',e=>e.textContent),/✗ Druckfeder 5,5 × 17,5[^✓]*zu eng für die Welle/);
 // More preload: more torque.
 const pre=await p.evaluateHandle(()=>[...document.querySelectorAll('#properties label.prop')].find(l=>l.textContent.startsWith('Vorspannung')).querySelector('input'));
 await pre.evaluate(e=>{e.value='5';e.dispatchEvent(new Event('change'));});await wait(400);const t1=await torque();assert.ok(t1>t0*1.5,`mehr Vorspannung ${t0} → ${t1}`);
 await p.waitForFunction(()=>document.querySelector('#preview-state')?.dataset.state==='ready',{timeout:180000});await wait(800);
 const sum=await p.evaluate(()=>window.preview.summary().map(m=>m.name));assert.ok(sum.filter(n=>/Reibscheibe/.test(n)).length===2&&sum.some(n=>/Federteller/.test(n))&&sum.some(n=>/Druckfeder/.test(n))&&sum.some(n=>/Stirnrad z40/.test(n)),sum.join(', '));
 if(shots)await p.screenshot({path:path.join(shots,'clutch.png')});
 assert.deepEqual(errors,[]);
 console.log(`Rutschkupplung im Wellen-Generator: per Klick auf die Welle, ${t0} N·cm, mit 5 mm Vorspannung ${t1} N·cm, zu enge Feder markiert, 3D mit Scheiben, Teller, Feder und Rad.`);
}finally{await browser.close();await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});}
