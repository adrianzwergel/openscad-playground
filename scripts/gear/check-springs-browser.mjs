// Springs in the gearbox page: a bolt of the frame clicked, "Zugfeder zu …" a bolt of the rocker; a spring of the
// assortment that fits is hooked in and drawn, its page shows its numbers; measured in the spring catalogue, its rate is
// "gemessen" and stays after a reload; the 3D model has it; removed, it is gone.
import puppeteer from 'puppeteer';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'springs-')),shots=process.argv[2];
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(dir,'profil'),protocolTimeout:240000});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try{const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1500,height:1000});
 const ready=async()=>{await p.waitForFunction(()=>['ready','error'].includes(document.querySelector('#preview-state')?.dataset.state),{timeout:240000});assert.equal(await p.$eval('#preview-state',e=>e.dataset.state),'ready');};
 await p.goto('http://localhost:4001/getriebe');await p.waitForSelector('body[data-ready=true] [data-example="rocker-lego"]',{visible:true});await p.click('[data-example="rocker-lego"]');
 await p.waitForSelector('#top [data-bolt="0"]');await wait(300);
 // The frame's first bolt, then a spring to the rocker's third (bolt 6 of all).
 await p.click('#top [data-bolt="0"] .grip');await p.waitForSelector('#properties select[data-spring-to]');await p.select('#properties select[data-spring-to]','5');
 await p.waitForSelector('#top [data-spring="f1"]');await p.waitForSelector('#properties select[data-spring-part]');
 assert.equal(await p.$eval('#properties select[data-spring-part]',s=>s.value),'zug-5x20,5','die passende Feder aus dem Sortiment');
 assert.match(await p.$eval('#properties',e=>e.textContent),/Rate [\d,]+ N\/mm \(geschätzt\)/);assert.match(await p.$eval('#properties .spring-table',e=>e.textContent),/am längsten/);
 assert.equal(await p.$$eval('#issues [data-level=fehler]',e=>e.length),0,'keine Fehler');
 assert.ok(/Zugfeder 5 × 20,5/.test(await p.$eval('#bom',e=>e.textContent)),'in der Stückliste');
 await ready();await wait(500);assert.ok((await p.evaluate(()=>window.preview.summary())).some(m=>/Zugfeder 5 × 20,5/.test(m.name)),'im 3D-Modell');
 if(shots)await p.screenshot({path:path.join(shots,'springs-1.png')});
 // Measured: two lengths under two masses.
 await p.click('#properties [data-springs-open]');await p.waitForSelector('#springs-dialog:not([hidden]) tr.focus[data-spring="zug-5x20,5"]');
 const put=async(k,v)=>{await p.$eval(`#springs-dialog tr[data-spring="zug-5x20,5"] input[data-measure="${k}"]`,(e,v)=>{e.value=v;e.dispatchEvent(new Event('change'));},v);await wait(150);};
 await put('g1','100');await put('L1','24');await put('g2','300');await put('L2','30');
 assert.match(await p.$eval('#springs-dialog tr[data-spring="zug-5x20,5"]',e=>e.textContent),/0,327 N\/mm/);
 if(shots)await p.screenshot({path:path.join(shots,'springs-2.png')});
 await p.click('#springs-close');await wait(300);await p.click('#top [data-spring="f1"] .hit');await wait(300);
 assert.match(await p.$eval('#properties',e=>e.textContent),/Rate 0,327 N\/mm \(gemessen\)/);
 await wait(800);await p.reload();await p.waitForSelector('#top [data-spring="f1"]');await p.click('#top [data-spring="f1"] .hit');await wait(300);
 assert.match(await p.$eval('#properties',e=>e.textContent),/Rate 0,327 N\/mm \(gemessen\)/,'Messung bleibt');
 // Removed.
 await p.evaluate(()=>[...document.querySelectorAll('#properties button')].find(b=>b.textContent==='Feder entfernen').click());await wait(300);assert.ok(!await p.$('#top [data-spring]'));
 assert.deepEqual(errors,[]);
 console.log('Federn im Getriebe-Editor: vom Bolzen zum Rocker eingehängt (Zugfeder 5 × 20,5 passend gewählt), Werte und Tabelle, Stückliste, 3D; gemessen 0,327 N/mm, bleibt nach Neuladen; entfernt.');
}finally{await browser.close();await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});}
