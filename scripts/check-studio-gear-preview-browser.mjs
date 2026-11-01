// Studio drive page: a found train can be previewed in the 3D view without adopting it; the results stay listed
// (also after leaving the page and coming back) until one is adopted; a preview can be ended; adopting takes it in.
import puppeteer from 'puppeteer';import assert from 'node:assert/strict';
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
try{const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1440,height:1000});
 await p.goto('http://localhost:4001/studio');await p.waitForSelector('canvas');await p.evaluate(()=>localStorage.removeItem('mechanics-studio'));await p.reload();await p.waitForSelector('canvas');
 const ready=()=>p.waitForFunction(()=>document.querySelector('#mechanism-preview')?.dataset.state==='ok',{timeout:120000});
 const press=sel=>p.waitForFunction(sel=>{const b=document.querySelector(sel);if(!b||b.disabled)return false;b.click();return true;},{timeout:20000},sel);
 const open=label=>p.waitForFunction(label=>{const b=[...document.querySelectorAll('#tree button')].find(x=>x.textContent.includes(label));if(!b)return false;b.click();return true;},{timeout:20000},label);
 const saved=async()=>{await p.evaluate(()=>document.getElementById('save').click());return p.evaluate(()=>JSON.parse(localStorage.getItem('mechanics-studio')).mechanisms[0].drives.find(d=>d.id==='M3'));};
 await p.click('[data-demo="robot"]');await ready();
 await open('⚡ M3 →');await press('[data-find-gear="M3"]');
 await p.waitForFunction(()=>document.querySelector('#drive-progress')?.dataset.state==='done',{timeout:180000});
 const count=await p.$$eval('[data-adopt]',l=>l.length);assert.ok(count>=2,`mehrere Getriebe gefunden: ${count}`);
 // Preview: shown and solved, nothing adopted, all results still there.
 await press('[data-preview-gear="0"]');await p.waitForFunction(()=>document.querySelector('[data-preview-gear="0"]')?.getAttribute('aria-pressed')==='true',{timeout:60000});await ready();
 assert.match(await p.$eval('#status',e=>e.textContent),/Vorschau M3: .* noch nicht übernommen/);
 assert.equal((await saved()).gear,undefined,'Vorschau übernimmt nichts');assert.equal(await p.$$eval('[data-adopt]',l=>l.length),count,'Ergebnisse bleiben');
 // Away and back: the results are listed again.
 await open('Lager & Wellen');await p.waitForSelector('#bearing-lines,.muted');await open('⚡ M3 →');await p.waitForFunction(n=>document.querySelectorAll('[data-adopt]').length===n,{timeout:20000},count);
 // Another preview, then end it.
 await press('[data-preview-gear="1"]');await p.waitForFunction(()=>document.querySelector('[data-preview-gear="1"]')?.getAttribute('aria-pressed')==='true'&&document.querySelector('[data-preview-gear="0"]')?.getAttribute('aria-pressed')==='false',{timeout:60000});
 await press('[data-preview-gear="1"]');await p.waitForFunction(()=>document.querySelector('[data-preview-gear="1"]')?.getAttribute('aria-pressed')==='false',{timeout:20000});await ready();
 assert.equal((await saved()).gear,undefined,'immer noch nichts übernommen');
 // Adopt: the train is taken in, the list goes.
 await press('[data-adopt="1"]');await p.waitForFunction(()=>['ok','hit','error'].includes(document.querySelector('#drive-check')?.dataset.state),{timeout:180000});
 assert.ok((await saved()).gear,'übernommen');assert.equal(await p.$$eval('[data-adopt]',l=>l.length),0,'Liste nach dem Übernehmen leer');
 assert.deepEqual(errors,[]);console.log(`Studio Getriebe-Vorschau: ${count} Ergebnisse, Vorschau ohne Übernahme, Liste bleibt beim Seitenwechsel, Übernahme leert sie.`);
}finally{await browser.close();}
