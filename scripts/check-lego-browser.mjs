import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';
import {legoParts} from '../src/mechanics/graph/lego.ts';
import {mechanismCAD} from '../src/mechanics/graph/model.ts';
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1440,height:1000});await page.goto('http://localhost:4001/studio');await page.waitForSelector('canvas');await page.click('#tab-catalog');
 assert.equal(await page.$$eval('[data-part-id^="lego-"]',e=>e.length),77);
 for(const id of ['10928','32270','4716','3650a','3743','18938','6542a']){
  await page.click(`[data-edit-part="lego-${id}"]`);await page.waitForSelector('#catalog-preview-status[data-state="ready"]',{timeout:20000});assert.match(await page.$eval('dialog',e=>e.textContent),/LDraw/);assert.equal(await page.$eval('dialog input[name="model"]',e=>e.readOnly),true);if(id==='32270')await page.screenshot({path:path.join(os.tmpdir(),'mechanics-lego-catalog.png')});await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('dialog'));
 }
 await page.click('[data-add-part="lego-3648b"]');await page.click('[data-add-part="lego-3648b"]');await page.click('#save');await page.reload();await page.waitForSelector('canvas');await page.click('#tab-catalog');assert.equal(await page.$eval('#catalog-cart input',e=>e.value),'2');
 const graph=JSON.parse(fs.readFileSync(path.join(os.tmpdir(),'lego-mixed-graph.json'),'utf8'));
 const result=await page.evaluate(source=>new Promise(resolve=>{const worker=new Worker('./mechanics-render-worker.js');const timeout=setTimeout(()=>{worker.terminate();resolve({error:'timeout'});},120000);worker.onmessage=({data})=>{clearTimeout(timeout);worker.terminate();resolve({error:data.error,bytes:data.stl?.length,logs:data.logs?.slice(-4)});};worker.postMessage({source});}),mechanismCAD(graph,undefined,{omitPurchased:true}).source);
 assert.ok(!result.error,JSON.stringify(result));assert.ok(result.bytes>1000);assert.deepEqual(errors,[]);console.log('LEGO catalog representative geometry, fixed purchase parameters, source attribution, cart persistence and custom-part OpenSCAD rendering (purchase meshes separate) passed:',result.bytes,'bytes');
}finally{await browser.close();}
