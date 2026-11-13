// The shaft generator's page: reachable from the Studio's start page, an example opens as a shaft of its own with its
// section drawing, messages and parts list; a changed length is saved and back after a reload.
import puppeteer from 'puppeteer';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'welle-')),shots=process.argv[2];
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(dir,'profil')});
try{const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1440,height:900});
 await p.goto('http://localhost:4001/studio');await p.waitForSelector('a.start-card[href="./welle.html"]',{visible:true});await p.click('a.start-card[href="./welle.html"]');
 await p.waitForSelector('[data-example="lego-mitte"]',{visible:true});await p.click('[data-example="lego-mitte"]');
 await p.waitForSelector('#drawing svg .sleeve.adapter',{visible:true});
 const text=await p.evaluate(()=>({issues:document.querySelector('#issues').textContent,bom:document.querySelector('#bom').textContent,sections:document.querySelectorAll('#drawing .section').length,list:document.querySelectorAll('[data-open-shaft]').length}));
 assert.match(text.bom,/2 × Rillenkugellager 626/);assert.match(text.bom,/Adapter \(gedruckt\): LEGO-Kreuz → Ø6 mit Bund/);assert.match(text.issues,/Wand nur 0,6 mm/);assert.ok(text.sections>=4);assert.equal(text.list,1);
 if(shots)await p.screenshot({path:path.join(shots,'welle-beispiel.png')});
 // Shorter: the right bearing hangs over the end.
 await p.$eval('#shaft-length',e=>{e.value='55';e.dispatchEvent(new Event('change'));});await p.waitForFunction(()=>/ragt über das Wellenende/.test(document.querySelector('#issues').textContent));
 await new Promise(r=>setTimeout(r,800));await p.reload();await p.waitForSelector('#shaft-length',{visible:true});assert.equal(await p.$eval('#shaft-length',e=>e.value),'55','nach dem Neuladen');
 assert.deepEqual(errors,[]);console.log('Wellen-Seite: vom Studio erreichbar, Beispiel mit Adapter, Meldungen und Stückliste, Länge gespeichert.');
}finally{await browser.close();}
