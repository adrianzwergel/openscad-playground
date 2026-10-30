import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
try{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mechanics-workbench-'));
 const page=await browser.newPage();const cdp=await page.createCDPSession();await cdp.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:dir});await page.setViewport({width:1440,height:1100});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://localhost:4001/mechanics');
 const field=async(selector,value)=>page.$eval(selector,(el,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,String(value));el.dispatchEvent(new Event('input',{bubbles:true}));},value);
 await page.select('#port-select','output');await field('[aria-label="Anschluss output X"]',100);assert.equal(await page.$eval('[aria-label="output axis X"]',e=>e.value),'100');await page.click('#capture-variant');
 await page.select('#mechanism-kind','bevel');await page.click('#capture-variant');assert.equal(await page.$$eval('#variant-table tbody tr',e=>e.length),2);
 await page.click('#save-project');const stored=await page.evaluate(()=>localStorage.getItem('mechanics10.project.v1'));await page.click('#animation-toggle');await page.waitForFunction(()=>Number(document.querySelector('#animation-angle').textContent.replace('°',''))>2);await page.click('#animation-toggle');assert.equal(await page.evaluate(()=>localStorage.getItem('mechanics10.project.v1')),stored);
 await field('#animation-phase',90);const angles=await page.$$eval('[data-rotor]',els=>els.map(e=>Number(e.dataset.angle)));assert.deepEqual(angles,[90,-45]);await field('#inspection-explode',40);await page.select('#inspection-view','xz');await page.screenshot({path:'dist/mechanics-workbench.png',fullPage:true});
 await page.select('#spatial-view','exploded');await field('#spatial-explosion',40);await page.click('#spatial-render');await page.waitForFunction(()=>!document.querySelector('#mechanism-kind').disabled,{timeout:120000});assert.match(await page.$eval('#spatial-status',e=>e.textContent),/fertig/);await page.waitForFunction(()=>document.querySelector('model-viewer')?.loaded,{timeout:30000});
 await page.select('#mechanism-kind','screw');await page.click('#capture-variant');await field('#animation-phase',180);assert.match(await page.$eval('#linear-position',e=>e.textContent),/4.00/);await field('#motion-explosion',40);await page.click('#motion-render');await page.waitForFunction(()=>!document.querySelector('#mechanism-kind').disabled,{timeout:120000});assert.match(await page.$eval('#motion-status',e=>e.textContent),/fertig/);
 await page.click('[data-restore-variant="1"]');assert.equal(await page.$eval('#mechanism-kind',e=>e.value),'bevel');await page.reload();assert.equal(await page.$$eval('#variant-table tbody tr',e=>e.length),3);
 await page.click('#export-variants');const exported=path.join(dir,'mechanics10-variants.json');for(let i=0;i<100;i++){try{await fs.access(exported);break;}catch{await new Promise(r=>setTimeout(r,100));}}const bytes=await fs.readFile(exported,'utf8');assert.equal(JSON.parse(bytes).length,3);
 await (await page.$('#variants-file')).uploadFile(exported);await page.waitForFunction(()=>document.querySelector('#variant-status').textContent.includes('lokal gespeichert'));
 const bad=path.join(dir,'bad.json');await fs.writeFile(bad,'[{"version":999}]');await (await page.$('#variants-file')).uploadFile(bad);await page.waitForFunction(()=>document.querySelector('#variant-status').textContent.includes('Import abgelehnt'));assert.equal(await page.$$eval('#variant-table tbody tr',e=>e.length),3);
 await page.click('[data-delete-variant="0"]');assert.equal(await page.$$eval('#variant-table tbody tr',e=>e.length),2);
 for(const kind of ['internal','worm','belt','rack','gears']){await page.select('#mechanism-kind',kind);await field('#animation-phase',45);assert.equal(await page.$$eval('#port-table tbody tr',e=>e.length),2);}
 await page.evaluate(()=>localStorage.setItem('mechanics10.variants.v1','broken'));await page.reload();assert.match(await page.$eval('#variant-status',e=>e.textContent),/nicht geladen/);assert.equal(await page.evaluate(()=>localStorage.getItem('mechanics10.variants.v1')),'broken');assert.deepEqual(errors,[]);
 console.log('Workbench browser passed: ports, snapshots, persistence, restore/delete, all families, animation ratios, linear travel, CAD explosions and corrupt-storage handling.');
}finally{await browser.close();}
