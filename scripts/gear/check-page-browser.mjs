// The gearbox generator's page: reachable from the Studio; an example writes its two shafts into the shaft generator
// and opens a gearbox linked to them: from above the plate of layer 1 with its web, the meshing wheels, two layers, the
// speeds; the shafts are in the shaft generator's list. The belt example has its belt and stock length.
import puppeteer from 'puppeteer';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'getriebe-')),shots=process.argv[2];
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(dir,'profil'),protocolTimeout:30000});
try{const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1500,height:900});
 await p.goto('http://localhost:4001/studio');await p.waitForSelector('a.start-card[href="./getriebe.html"]',{visible:true});await p.click('a.start-card[href="./getriebe.html"]');
 await p.waitForSelector('body[data-ready=true] [data-example="stufe"]',{visible:true});await p.click('[data-example="stufe"]');await p.waitForSelector('#top svg [data-web]');
 const v=await p.evaluate(()=>({webs:document.querySelectorAll('#top [data-web]').length,wheels:document.querySelectorAll('#top [data-wheel]').length,tabs:document.querySelectorAll('[data-layer]').length,drives:document.querySelector('#drives').textContent,issues:document.querySelector('#issues-title').textContent,linked:document.querySelector('#linked').textContent}));
 assert.equal(v.webs,1);assert.equal(v.wheels,2);assert.equal(v.tabs,2);assert.match(v.drives,/z20 m1 auf Antrieb z20 kämmt mit z40 m1 auf Abtrieb z40 \(20 : 40\)/);assert.match(v.linked,/-0,5 U je Umdrehung/);assert.match(v.issues,/alles passt/);
 if(shots)await p.screenshot({path:path.join(shots,'getriebe-stufe.png')});
 await p.click('[data-layer="1"]');await p.waitForFunction(()=>document.querySelector('[data-layer="1"]').getAttribute('aria-pressed')==='true');
 // Its shafts are in the shaft generator.
 const q=await browser.newPage();await q.goto('http://localhost:4001/welle');await q.waitForSelector('body[data-ready=true]');await q.evaluate(()=>document.querySelector('#shaft-close')?.click());await q.waitForSelector('[data-open-shaft]');
 assert.deepEqual((await q.$$eval('[data-open-shaft]',e=>e.map(x=>x.textContent))).sort(),['Abtrieb z40','Antrieb z20']);
 await q.close();await p.bringToFront();await p.click('#gear-close');await p.waitForSelector('[data-example="riemen"]',{visible:true});await p.click('[data-example="riemen"]');await p.waitForSelector('#top svg .belt');assert.match(await p.$eval('#drives',e=>e.textContent),/Riemen 2\d\d,\d+ mm, Normlänge 280 mm/);
 assert.deepEqual(errors,[]);console.log('Getriebe-Seite: vom Studio erreichbar, Beispiel schreibt seine Wellen, Platte mit Steg, Eingriff, zwei Schichten, Drehzahl, Riemen mit Normlänge.');
}finally{await browser.close();}
