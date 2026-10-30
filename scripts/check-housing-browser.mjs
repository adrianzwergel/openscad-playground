import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const directory=await fs.mkdtemp(path.join(os.tmpdir(),'mechanics-housing-'));
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
function meshCheck(text,name){
 const vertices=[...text.matchAll(/vertex\s+([-+\de.]+)\s+([-+\de.]+)\s+([-+\de.]+)/gi)].map(m=>m.slice(1).map(Number));
 assert.ok(vertices.length>30,name);assert.ok(vertices.every(v=>v.every(Number.isFinite)),name);
 assert.ok(Math.min(...vertices.map(v=>v[2]))>=-1e-5,`${name}: on print plane`);
 const edges=new Map(),adj=new Map();
 for(let i=0;i<vertices.length;i+=3){
  const ids=vertices.slice(i,i+3).map(v=>v.map(n=>Math.round(n*1e5)).join(','));
  for(let j=0;j<3;j++){const a=ids[j],b=ids[(j+1)%3],key=[a,b].sort().join('/');edges.set(key,(edges.get(key)||0)+1);if(!adj.has(a))adj.set(a,new Set());adj.get(a).add(b);}
 }
 assert.ok([...edges.values()].every(n=>n===2),`${name}: watertight edge incidence`);
 const seen=new Set(),queue=[adj.keys().next().value];while(queue.length){const id=queue.pop();if(seen.has(id))continue;seen.add(id);queue.push(...adj.get(id));}
 assert.equal(seen.size,adj.size,`${name}: one connected printable solid`);
 return vertices.length/3;
}
try{
 const page=await browser.newPage();await page.setViewport({width:1440,height:1000});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:4001/mechanics');
 await (await page.$('#project-file')).uploadFile(path.resolve('examples/mechanics-compound.json'));
 await page.waitForFunction(()=>document.querySelector('#storage-status').textContent.includes('Projektdatei geladen'));
 assert.match(await page.$eval('#housing-summary',e=>e.textContent),/3 Wellen · 6 Lager/);
 const finish=async()=>{await page.waitForFunction(()=>!document.querySelector('#search').disabled,{timeout:120000});assert.doesNotMatch(await page.$eval('[role=status]',e=>e.textContent),/Error/);};
 await page.click('#view-housing');await finish();await page.waitForFunction(()=>document.querySelector('model-viewer')?.loaded,{timeout:30000});
 assert.equal(await page.$('a[download="mechanics10-assembly.stl"]'),null);
 await page.click('#view-exploded');await finish();await page.waitForFunction(()=>document.querySelector('model-viewer')?.loaded,{timeout:30000});
 await page.$eval('.viewer',el=>el.scrollIntoView({block:'center'}));await page.screenshot({path:'dist/mechanics-housing.png'});
 await page.click('#export-parts');await finish();
 const zipBytes=await page.$eval('#part-downloads a',async a=>Array.from(new Uint8Array(await(await fetch(a.href)).arrayBuffer())));
 const zip=await JSZip.loadAsync(new Uint8Array(zipBytes));
 const names=Object.keys(zip.files).filter(n=>n.endsWith('.stl'));assert.equal(names.length,6);
 const triangles={};for(const name of names){const text=await zip.file(name).async('string');triangles[name]=meshCheck(text,name);await fs.writeFile(path.join(directory,name),text);}
 const manifest=JSON.parse(await zip.file('parts.json').async('string'));assert.equal(manifest.printed.find(p=>p.id==='standoff').quantity,4);assert.equal(manifest.purchased[0].quantity,6);
 assert.match(await zip.file('MONTAGE.txt').async('string'),/physisches Muster wurde nicht geprüft/);
 assert.equal(JSON.parse(await zip.file('project.json').async('string')).components.length,4);
 await page.click('[data-part="plate-top"]');await finish();assert.equal(await page.$eval('#part-downloads a',a=>a.download),'plate-top.stl');
 const single=await page.$eval('#part-downloads a',async a=>(await(await fetch(a.href)).text()));meshCheck(single,'plate-top standalone');
 await page.$eval('#housing-bearingFit',el=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'0.25');el.dispatchEvent(new Event('input',{bubbles:true}));});
 assert.equal(await page.$('#part-downloads a'),null);await page.click('#save-project');await page.reload();assert.equal(await page.$eval('#housing-bearingFit',e=>e.value),'0.25');
 await page.click('#export-parts');await page.click('#cancel');assert.equal(await page.$eval('[role=status]',e=>e.textContent),'Abgebrochen');assert.equal(await page.$('#part-downloads a'),null);
 await page.click('[data-part="standoff"]');await finish();assert.ok(await page.$('#part-downloads a'));
 await page.click('#new-project');await page.$eval('#housing-clearance',el=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'20');el.dispatchEvent(new Event('input',{bubbles:true}));});
 assert.equal(await page.$eval('#export-parts',e=>e.disabled),true);assert.equal(await page.$eval('#view-housing',e=>e.disabled),true);
 assert.deepEqual(errors,[]);console.log('Housing browser passed: assembly/exploded preview, ZIP, every STL watertight/connected/Z>=0, individual download, settings persistence, stale invalidation, cancellation/restart, blocked clearance.',triangles,'Artifacts:',directory);
}finally{await browser.close();}
