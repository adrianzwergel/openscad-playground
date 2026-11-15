// The printed strut in the Studio: from the library ("Federbein gedruckt"), its page with the spring of the assortment,
// sizes and no complaint; another spring changes the parts; in ③ tube and rod as STL.
import puppeteer from 'puppeteer';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {newProject,phase} from './studio-ui.mjs';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'strut-')),shots=process.argv[2];
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(dir,'profil'),protocolTimeout:240000});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try{const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1500,height:1000});
 await p.goto('http://localhost:4001/studio.html');await newProject(p);await p.$eval('[data-store-linkage]',e=>{e.open=true;});await p.click('[data-linkage-new="federbein"]');
 await p.waitForSelector('[data-linkage="federbein-1"]');await p.click('[data-linkage="federbein-1"]');await p.waitForSelector('#strut-info');
 assert.equal(await p.$eval('#properties select[data-field="Druckfeder"]',s=>s.value),'druck-9x35');assert.match(await p.$eval('#strut-info',e=>e.textContent),/Stange Ø 6,5 mm/);
 assert.equal(await p.$$eval('#properties .state-fail',e=>e.length),0,'nichts zu beanstanden');
 if(shots)await p.screenshot({path:path.join(shots,'strut-1.png')});
 // A slimmer spring: a slimmer rod; the strut is long enough for it.
 await p.select('#properties select[data-field="Druckfeder"]','druck-6,5x10');await wait(400);assert.match(await p.$eval('#strut-info',e=>e.textContent),/Stange Ø 4,5 mm/);
 // ③: tube and rod as STL.
 const dl=path.join(dir,'dl');await fs.mkdir(dl);const cdp=await p.createCDPSession();await cdp.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:dl});
 await phase(p,3);await p.click('[data-linkage-overview]');await p.waitForSelector('[data-strut-stl="federbein-1/rohr"]');
 for(const part of ['rohr','stange']){await p.click(`[data-strut-stl="federbein-1/${part}"]`);let f;for(let i=0;i<120&&!f;i++){await wait(500);f=(await fs.readdir(dl)).find(x=>x.includes(part)&&x.endsWith('.stl'));}assert.ok(f,`${part} als STL`);assert.ok((await fs.stat(path.join(dl,f))).size>3000);}
 assert.match(await p.$eval('#properties',e=>e.textContent),/Druckfeder 6,5 × 10/,'in der Stückliste');
 assert.deepEqual(errors,[]);
 console.log('Federbein im Studio: aus der Bibliothek, Druckfeder 9 × 35 → Stange Ø 6,5; 6,5 × 10 → Stange Ø 4,5; Rohr und Stange als STL, Feder in der Stückliste.');
}finally{await browser.close();await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});}
