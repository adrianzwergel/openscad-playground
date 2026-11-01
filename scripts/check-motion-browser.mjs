import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {defaultMotion} from '../src/mechanics/motion.ts';
import {motionCAD} from '../src/mechanics/motion-cad.ts';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mechanics-motion-'));
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
 const field=async(selector,value)=>page.$eval(selector,(el,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,String(value));el.dispatchEvent(new Event('input',{bubbles:true}));},value);
 const finish=async()=>{await page.waitForFunction(()=>!document.querySelector('#mechanism-kind').disabled,{timeout:180000});assert.doesNotMatch(await page.$eval('#motion-status',e=>e.textContent),/Error/);};
 // Actual BOSL tooth intersection at four sub-pitch phases and both stroke endpoints.
 const rackDefs=motionCAD(defaultMotion('rack')).parts.find(p=>p.id==='rack').source.replace('translate([0,-46,-19]) rack_part();','');
 for(const q of [0,Math.PI/2,Math.PI,3*Math.PI/2,100]){
  const source=rackDefs+`union(){translate([1000,1000,1000]) cube(1);intersection(){translate([${q},0,0]) rack_part();translate([50,80,19]) rotate([0,0,${9+(q-50)*180/(20*Math.PI)}]) pinion();}}`;
  const result=await page.evaluate(source=>new Promise((resolve,reject)=>{const w=new Worker('./mechanics-render-worker.js');w.onmessage=e=>{w.terminate();e.data.error?reject(Error(e.data.error)):resolve(e.data.off);};w.onerror=e=>{w.terminate();reject(Error(e.message));};w.postMessage({source});}),source);
  const lines=result.trim().split('\n');const header=lines[0].split(/\s+/);assert.equal(Number(header[1]),8,`rack phase ${q}: no solid tooth intersection`);
 }
 for(const kind of ['belt','screw','rack']){
  await page.select('#mechanism-kind',kind);assert.equal(await page.$eval('#motion-render',e=>e.disabled),false);
  await page.click('#motion-render');await finish();await page.waitForFunction(()=>document.querySelector('model-viewer')?.loaded,{timeout:30000});
  await page.$eval('.viewer',e=>e.scrollIntoView({block:'center'}));await page.screenshot({path:`dist/mechanics-${kind}.png`});
  if(kind!=='belt'){
   await field('#motion-position',1);await page.click('#motion-render');await finish();await page.waitForFunction(()=>document.querySelector('model-viewer')?.loaded,{timeout:30000});
   await page.click('#toggle-obstacle');assert.equal(await page.$eval('#motion-render',e=>e.disabled),true);
   await field('#obstacle-y',300);assert.equal(await page.$eval('#motion-render',e=>e.disabled),false);await page.click('#toggle-obstacle');
   await field('#motion-stroke',250);assert.equal(await page.$eval('#motion-render',e=>e.disabled),true);await page.click('#size-guides');assert.equal(await page.$eval('#motion-render',e=>e.disabled),false);
   await field('#motion-stroke',100);await page.click('#size-guides');
  }else{await field('#motion-travel',0);assert.equal(await page.$eval('#motion-render',e=>e.disabled),true);await field('#motion-travel',20);}
  await page.click('#motion-export');await finish();
  const data=await page.$eval('#motion-download',async a=>Array.from(new Uint8Array(await(await fetch(a.href)).arrayBuffer())));const zip=await JSZip.loadAsync(new Uint8Array(data));
  const names=Object.keys(zip.files).filter(n=>n.endsWith('.stl'));assert.ok(names.length>=4);
  for(const name of names){const text=await zip.file(name).async('string');await fs.writeFile(path.join(dir,kind+'-'+name),text);meshCheck(text,kind+'/'+name);}
  assert.equal(JSON.parse(await zip.file('project.json').async('string')).motion.kind,kind);assert.ok(zip.file('MONTAGE.txt'));
  console.log(kind,'render and mesh checks passed:',names.length,'parts');
  await page.click('#save-project');await page.reload();assert.equal(await page.$eval('#mechanism-kind',e=>e.value),kind);
 }
 await page.click('#motion-export');await page.click('#motion-cancel');assert.equal(await page.$eval('#motion-status',e=>e.textContent),'Abgebrochen');assert.equal(await page.$('#motion-download'),null);
 await page.click('[data-motion-part="rack-pinion"]');await finish();assert.equal(await page.$eval('#motion-download',e=>e.download),'rack-pinion.stl');
 await field('#motion-position',0);assert.equal(await page.$('#motion-download'),null);
 await page.select('#mechanism-kind','gears');assert.ok(await page.$('#search'));assert.deepEqual(errors,[]);
 console.log('Motion browser passed: all modes, endpoints, full-hub obstacle, sizing, all STL meshes, ZIP, persistence, cancellation/restart, invalidation and legacy mode. Files:',dir);
}finally{await browser.close();}
