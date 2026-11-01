import {beltCenter} from '../src/mechanics/motion.ts';
import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mechanics-mixed-'));
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
function meshCheck(text,name){
 const vertices=[...text.matchAll(/vertex\s+([-+\de.]+)\s+([-+\de.]+)\s+([-+\de.]+)/gi)].map(m=>m.slice(1).map(Number));assert.ok(vertices.length>30,name);
 assert.ok(Math.min(...vertices.map(v=>v[2]))>=-1e-5,name+' lies on bed');
 const edges=new Map(),adj=new Map();
 for(let i=0;i<vertices.length;i+=3){const ids=vertices.slice(i,i+3).map(v=>v.map(n=>Math.round(n*1e5)).join(','));for(let j=0;j<3;j++){const a=ids[j],b=ids[(j+1)%3],key=[a,b].sort().join('/');edges.set(key,(edges.get(key)||0)+1);if(!adj.has(a))adj.set(a,new Set());adj.get(a).add(b);}}
 assert.ok([...edges.values()].every(n=>n===2),name+' watertight');const seen=new Set(),queue=[adj.keys().next().value];while(queue.length){const n=queue.pop();if(seen.has(n))continue;seen.add(n);queue.push(...adj.get(n));}assert.equal(seen.size,adj.size,name+' connected');
}
try{
 const page=await browser.newPage();await page.setViewport({width:1440,height:1000});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://localhost:4001/mechanics');const cdp=await page.createCDPSession();await cdp.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:dir});
 const field=async(selector,value)=>page.$eval(selector,(el,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,String(value));el.dispatchEvent(new Event('input',{bubbles:true}));},value);
 const finish=async()=>{await page.waitForFunction(()=>!document.querySelector('#mechanism-kind').disabled,{timeout:180000});assert.doesNotMatch(await page.$eval('#mixed-status',e=>e.textContent),/Error/);};
 for(const kind of ['spur','belt']){
 await page.select('#mechanism-kind','gears');await page.select('#mechanism-kind','mixed');await page.select('#mixed-allow',kind);if(kind==='belt')await field('[aria-label="mixed output X"]',beltCenter(300,20/Math.PI,40/Math.PI));
 const fixed=await page.$$eval('#mixed-panel fieldset input',els=>els.map(e=>e.value));await page.click('#mixed-search');await finish();assert.ok(await page.$('#mixed-solutions tbody button'));await page.click('#mixed-solutions tbody button');assert.deepEqual(await page.$$eval('#mixed-panel fieldset input',els=>els.map(e=>e.value)),fixed);
 await page.click('#mixed-render');await finish();await page.waitForFunction(()=>document.querySelector('model-viewer')?.loaded,{timeout:30000});await (await page.$('#mixed-panel .viewer')).screenshot({path:`dist/mechanics-mixed-${kind}.png`});
 await page.click('#mixed-export');await finish();await page.click('#mixed-download');const target=path.join(dir,`mechanics10-${kind}.zip`);for(let n=0;n<150;n++){try{await fs.access(target);break;}catch{await new Promise(r=>setTimeout(r,100));}}
 const zip=await JSZip.loadAsync(await fs.readFile(target));const stls=Object.keys(zip.files).filter(n=>n.endsWith('.stl'));for(const n of stls)meshCheck(await zip.file(n).async('string'),n);assert.ok(stls.length>=17);const p=JSON.parse(await zip.file('project.json').async('string'));assert.equal(p.version,6);assert.equal(p.mixed.selected.kind,kind);assert.ok(zip.file('MONTAGE.txt'));console.log(kind,stls.length,'parts passed');
 await page.click('#save-project');await page.reload();assert.equal(await page.$eval('#mechanism-kind',e=>e.value),'mixed');assert.ok(await page.$('#mixed-render'));await page.click('#capture-variant');
 await field('[aria-label="mixed output Z"]',0);assert.equal(await page.$('#mixed-render'),null);await page.click('#mixed-search');await finish();assert.match(await page.$eval('#mixed-status',e=>e.textContent),/Keine passende/);
 }
 await field('[aria-label="mixed output Z"]',120);await page.click('#mixed-search');await page.click('#mixed-cancel');await page.waitForFunction(()=>!document.querySelector('#mixed-search').disabled);await page.click('#mixed-search');await finish();await page.click('#mixed-solutions tbody button');await page.click('#mixed-export');await page.click('#mixed-cancel');await page.waitForFunction(()=>!document.querySelector('#mixed-search').disabled);await page.click('[data-mixed-part="bridge-column"]');await finish();assert.match(await page.$eval('#mixed-status',e=>e.textContent),/Export fertig/);
 assert.deepEqual(errors,[]);console.log('Mixed browser passed: real Prolog, both chains, fixed ports, construction, all STL meshes, persistence, invalidation, impossible height, cancel/restart. '+dir);
}finally{await browser.close();}
