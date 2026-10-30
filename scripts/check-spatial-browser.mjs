import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mechanics-spatial-'));
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
function meshCheck(text,name){
 const vertices=[...text.matchAll(/vertex\s+([-+\de.]+)\s+([-+\de.]+)\s+([-+\de.]+)/gi)].map(m=>m.slice(1).map(Number));assert.ok(vertices.length>30,name);
 assert.ok(Math.min(...vertices.map(v=>v[2]))>=-1e-5,name+' lies on bed');
 const edges=new Map(),adj=new Map();
 for(let i=0;i<vertices.length;i+=3){const ids=vertices.slice(i,i+3).map(v=>v.map(n=>Math.round(n*1e5)).join(','));for(let j=0;j<3;j++){const a=ids[j],b=ids[(j+1)%3],key=[a,b].sort().join('/');edges.set(key,(edges.get(key)||0)+1);if(!adj.has(a))adj.set(a,new Set());adj.get(a).add(b);}}
 assert.ok([...edges.values()].every(n=>n===2),name+' watertight');const seen=new Set(),queue=[adj.keys().next().value];while(queue.length){const n=queue.pop();if(seen.has(n))continue;seen.add(n);queue.push(...adj.get(n));}assert.equal(seen.size,adj.size,name+' connected');
}
try{
 const page=await browser.newPage();await page.setViewport({width:1440,height:1000});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://localhost:4001/mechanics');
 const finish=async()=>{await page.waitForFunction(()=>!document.querySelector('#mechanism-kind').disabled,{timeout:180000});assert.doesNotMatch(await page.$eval('#spatial-status',e=>e.textContent),/Error/);};
 for(const kind of ['internal','bevel','worm']){
  await page.select('#mechanism-kind',kind);await page.click('#spatial-render');await finish();await page.waitForFunction(()=>document.querySelector('model-viewer')?.loaded,{timeout:30000});
  await page.select('#spatial-view','open');await page.click('#spatial-render');await finish();await page.waitForFunction(()=>document.querySelector('model-viewer')?.loaded,{timeout:30000});
  await page.$eval('.viewer',e=>e.scrollIntoView({block:'center'}));await page.screenshot({path:`dist/mechanics-${kind}.png`});
  await page.click('#spatial-export');await finish();
  const data=await page.$eval('#spatial-download',async a=>Array.from(new Uint8Array(await(await fetch(a.href)).arrayBuffer()))),zip=await JSZip.loadAsync(new Uint8Array(data));
  const names=Object.keys(zip.files).filter(n=>n.endsWith('.stl'));assert.equal(names.length,kind==='internal'?12:10);
  for(const name of names){const text=await zip.file(name).async('string');await fs.writeFile(path.join(dir,kind+'-'+name),text);meshCheck(text,kind+'/'+name);}
  const project=JSON.parse(await zip.file('project.json').async('string'));assert.equal(project.spatial.kind,kind);assert.equal(project.version,4);
  assert.ok(zip.file('MONTAGE.txt'));assert.ok(zip.file('checks.json'));console.log(kind,'preview and meshes passed:',names.length);
  await page.click('#save-project');await page.reload();assert.equal(await page.$eval('#mechanism-kind',e=>e.value),kind);
 }
 await page.click('#spatial-export');await page.click('#spatial-cancel');assert.equal(await page.$eval('#spatial-status',e=>e.textContent),'Abgebrochen');
 await page.click('[data-spatial-part="bearing-cap"]');await finish();assert.equal(await page.$eval('#spatial-download',e=>e.download),'bearing-cap.stl');
 await page.select('#spatial-starts','2');assert.equal(await page.$('#spatial-download'),null);await page.click('#spatial-render');await finish();
 await page.select('#mechanism-kind','gears');assert.ok(await page.$('#search'));assert.deepEqual(errors,[]);
 console.log('Spatial browser passed: three templates, open housing, every STL watertight/connected/bed-aligned, ZIP, persistence, invalidation and cancellation/restart. Files:',dir);
}finally{await browser.close();}
