import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage(),errors=[];let renders=0;page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().endsWith('/mechanics-render-worker.js'))renders++;});await page.goto('http://localhost:4001/mechanics');await page.select('#mechanism-kind','graph');await page.select('#graph-demo','space-route');await page.click('#graph-rotate');await page.waitForFunction(()=>JSON.parse(document.querySelector('#graph-json').value).bodies[0].frame.position[0]===15);const original=await page.$eval('#graph-json',e=>e.value);
 await page.click('#graph-render');await page.waitForFunction(()=>document.querySelector('#graph-model')?.loaded,{timeout:180000});
 async function materials(){return page.$eval('#graph-model',async e=>{const b=await (await fetch(e.src)).arrayBuffer(),v=new DataView(b),length=v.getUint32(12,true),json=JSON.parse(new TextDecoder().decode(new Uint8Array(b,20,length)));return json.materials.map(m=>({alpha:m.alphaMode,color:m.pbrMetallicRoughness.baseColorFactor}));});}
 const initial=await materials();assert.ok(initial.some(m=>m.alpha==='BLEND'&&m.color[2]===1));assert.ok(initial.some(m=>m.alpha==='BLEND'&&m.color[0]===1));
 const count=renders;for(const key of ['bounds','obstacles','clearances']){const old=await page.$eval('#graph-model',e=>e.src);await page.click(`[data-space-layer="${key}"]`);await page.waitForFunction(old=>document.querySelector('#graph-model')?.src!==old&&document.querySelector('#graph-model')?.loaded,{},old);}
 assert.ok((await materials()).every(m=>m.alpha!=='BLEND'));assert.equal(renders,count);
 for(const key of ['bounds','obstacles','clearances']){const old=await page.$eval('#graph-model',e=>e.src);await page.click(`[data-space-layer="${key}"]`);await page.waitForFunction(old=>document.querySelector('#graph-model')?.src!==old&&document.querySelector('#graph-model')?.loaded,{},old);const now=await materials();assert.ok(now.some(m=>m.alpha==='BLEND'));}
 assert.equal(await page.$eval('#graph-json',e=>e.value),original);assert.equal(renders,count);
 await page.click('[data-space-fit]');await new Promise(r=>setTimeout(r,500));await page.$eval('[data-space-viewer]',e=>e.scrollIntoView());await (await page.$('[data-space-viewer]')).screenshot({path:process.env.TEMP+'/mechanics-layers.png'});
 assert.deepEqual(errors,[]);console.log('Browser: actual GLB layers, individual toggles, no CAD rerender, rotated graph and unchanged project passed.');
}finally{await browser.close();}
