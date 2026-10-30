import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {initialProject,serializeProject} from '../src/mechanics/model.ts';
const directory=await fs.mkdtemp(path.join(os.tmpdir(),'mechanics-project-test-'));
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
try{
 const page=await browser.newPage();await page.setViewport({width:1440,height:1100});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const client=await page.createCDPSession();await client.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:directory});
 await page.goto('http://localhost:4001/mechanics');
 async function field(selector,value){await page.$eval(selector,(el,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));},value);}
 await field('[aria-label="Projektname"]','Gespeicherte Testachse');
 await field('[aria-label="output axis X"]','0');await field('[aria-label="output axis Y"]','60');
 assert.equal(await page.$eval('#render',e=>e.disabled),false);
 await page.click('#save-project');await page.reload();
 assert.equal(await page.$eval('[aria-label="Projektname"]',e=>e.value),'Gespeicherte Testachse');
 assert.equal(await page.$eval('[aria-label="output Y"]',e=>e.value),'60');
 await page.click('#render');await page.waitForFunction(()=>document.querySelector('[role=status]').textContent.match(/Fertig|Error/),{timeout:120000});
 assert.match(await page.$eval('[role=status]',e=>e.textContent),/Fertig/);
 await page.waitForFunction(()=>document.querySelector('model-viewer')?.loaded,{timeout:30000});
 await page.click('#export-project');
 const exported=path.join(directory,'mechanics10-project.json');
 for(let i=0;i<100;i++){try{await fs.access(exported);break;}catch{await new Promise(r=>setTimeout(r,100));}}
 const saved=JSON.parse(await fs.readFile(exported,'utf8'));
 assert.deepEqual(saved.components[1].position,[0,60,0]);assert.equal(saved.version,3);
 await field('[aria-label="output Y"]','61');
 assert.equal(await page.$eval('#render',e=>e.disabled),true);assert.equal(await page.$('a[download]'),null);assert.equal(await page.$('model-viewer'),null);
 await field('[aria-label="output Y"]','60');assert.equal(await page.$eval('#render',e=>e.disabled),false);
 await page.select('[aria-label="output Katalog"]','spur-m3-z40');
 assert.equal(await page.$eval('#render',e=>e.disabled),true);assert.match(await page.$eval('#checks [data-state=fail]',e=>e.textContent),/Modul/);
 await page.click('#new-project');
 await (await page.$('#project-file')).uploadFile(exported);
 await page.waitForFunction(()=>document.querySelector('#storage-status').textContent.includes('Projektdatei geladen'));
 assert.equal(await page.$eval('[aria-label="output Y"]',e=>e.value),'60');
 const bad=path.join(directory,'future.json');await fs.writeFile(bad,JSON.stringify({...saved,version:999}));
 await (await page.$('#project-file')).uploadFile(bad);await page.waitForFunction(()=>document.querySelector('#storage-status').textContent.includes('Import abgelehnt'));
 assert.equal(await page.$eval('[aria-label="Projektname"]',e=>e.value),saved.name);
 // A broken local file must be reported, not crash the application or be silently overwritten.
 await page.evaluate(()=>localStorage.setItem('mechanics10.project.v1','broken'));
 await page.reload();assert.match(await page.$eval('#storage-status',e=>e.textContent),/konnte nicht geladen/);
 assert.equal(await page.evaluate(()=>localStorage.getItem('mechanics10.project.v1')),'broken');
 const fixture=initialProject();fixture.components[1].position=[0,60,0];fixture.axes.output=[0,60,0];fixture.name='Manuelle Anordnung';
 const file=path.join(directory,'manual.json');await fs.writeFile(file,serializeProject(fixture));await (await page.$('#project-file')).uploadFile(file);
 await page.waitForFunction(()=>document.querySelector('#storage-status').textContent.includes('Projektdatei geladen'));await page.click('#render');
 await page.waitForFunction(()=>document.querySelector('model-viewer')?.loaded,{timeout:120000});
 await page.screenshot({path:'dist/mechanics-stage-b.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('Project browser checks passed: manual render, save/reload, real JSON download/import, invalid import, compatibility, stale results, corrupt storage.');
}finally{await browser.close();}
