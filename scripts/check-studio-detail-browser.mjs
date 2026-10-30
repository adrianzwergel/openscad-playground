import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spaceExample,compoundExample} from '../src/mechanics/graph/examples.ts';
import {robustRoute} from '../src/mechanics/graph/robust-search.ts';
import {serializeStudio} from '../src/mechanics/studio-model.ts';
const abort=new AbortController();let spur;await robustRoute(spaceExample(),{target:1,tolerance:0,minStages:2,maxStages:2,budget:10000,beam:120},abort.signal,undefined,g=>{spur=g;abort.abort();});assert.ok(spur);
const project=g=>serializeStudio({version:1,assemblies:[{id:'main',graph:g,adopted:true}],routes:[{id:'r',assembly:'main',source:'input',target:'output'}]});
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-detail-'));
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
try{
 const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1440,height:1000});
 await p.evaluateOnNewDocument(()=>{const Original=Worker;window.renderReplies=[];window.Worker=class extends Original{constructor(url,...args){super(url,...args);if(String(url).includes('render-worker'))this.addEventListener('message',({data})=>window.renderReplies.push({error:data.error,bytes:data.stl?.length}));}};});
 await p.goto('http://localhost:4001/studio');await p.waitForSelector('canvas');
 async function load(graph){const file=path.join(dir,'project.json');await fs.writeFile(file,project(graph));await(await p.$('#import-file')).uploadFile(file);await p.waitForFunction(()=>document.querySelector('#status').textContent.includes('Projekt importiert'));}
 async function ready(){await p.waitForFunction(()=>['ready','error'].includes(document.querySelector('#detail-status').dataset.state),{timeout:125000});assert.equal(await p.$eval('#detail-status',e=>e.dataset.state),'ready',await p.$eval('#detail-status',e=>e.textContent));}
 await load(spur);await p.click('#zone');await new Promise(r=>setTimeout(r,500));assert.equal(await p.$eval('#detail-status',e=>e.dataset.state),'empty');await p.click('#undo');await ready();
 assert.ok(await p.evaluate(()=>window.renderReplies.some(r=>r.bytes>10000&&!r.error)),'Real WASM mesh returned');
 await p.click('[data-region-visibility="workspace"]');
 assert.equal(await p.$eval('[data-region-visibility="workspace"]',e=>e.checked),false);
 assert.equal(await p.$eval('[data-region-visibility="upper-block"]',e=>e.checked),true);
 await p.click('[data-region-visibility="upper-block"]');await p.click('#show-hulls');await p.click('#show-hulls');
 await p.click('[data-object="input"]');assert.equal(await p.$eval('[data-region-visibility="workspace"]',e=>e.checked),false);
 await p.screenshot({path:path.join(os.tmpdir(),'studio-detail-gears.png')});
 await load(compoundExample('gear-belt'));await ready();assert.match(await p.$eval('#detail-status',e=>e.textContent),/GT2/);
 await p.click('#fit');await p.screenshot({path:path.join(os.tmpdir(),'studio-detail-belt.png')});
 // A model edit must clear detailed geometry, including pending worker work.
 await p.click('#detail-retry');await p.click('#zone');assert.equal(await p.$eval('#detail-status',e=>e.dataset.state),'empty');
 await p.click('#undo');await ready();
 // Force a real asset failure for an uncached render, then recover with retry.
 await p.reload();await p.waitForSelector('canvas');await p.setRequestInterception(true);const block=req=>req.url().endsWith('mechanics-render-worker.js')?req.abort():req.continue();p.on('request',block);
 await load(spur);await p.waitForFunction(()=>document.querySelector('#detail-status').dataset.state==='error',{timeout:10000});
 p.off('request',block);await p.setRequestInterception(false);await p.click('#detail-retry');await ready();
 assert.deepEqual(errors,[]);console.log('Detail preview: real WASM spur/shaft and belt meshes, independent regions, hull toggle, edit/undo, worker failure and retry passed.');
}finally{await browser.close();}
