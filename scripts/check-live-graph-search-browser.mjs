import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import {fixture} from './mixed-space-fixture.mjs';
import {assessConstruction} from '../src/mechanics/graph/construction.ts';
import {resolveMechanism} from '../src/mechanics/graph/model.ts';
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://localhost:4001/mechanics');await page.select('#mechanism-kind','graph');
 const source=fixture(4);await page.$eval('#graph-json',(e,g)=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,JSON.stringify(g));e.dispatchEvent(new Event('input',{bubbles:true}));},source);await page.$eval('#graph-apply',e=>e.click());
 await page.select('#route-min-stages','4');await page.select('#route-stages','4');await page.select('#route-budget','100000');
 await page.$eval('#route-target',e=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'120');e.dispatchEvent(new Event('input',{bubbles:true}));});
 for(const c of await page.$$('[data-route-rule]'))if(!['external-spur','gt2-belt','worm-mesh','bevel-mesh'].includes(await c.evaluate(e=>e.dataset.routeRule)))await c.click();
 await page.evaluate(()=>{window.ticks=0;window.timer=setInterval(()=>window.ticks++,10);});
 await page.click('#route-search');await page.waitForSelector('[data-route-result]',{timeout:120000});
 assert.equal(await page.$eval('#route-search',e=>e.disabled),true,'Results must arrive before completion');assert.ok(await page.evaluate(()=>window.ticks)>20,'Main thread stays responsive');
 const count=await page.$$eval('[data-route-result]',es=>es.length),start=Date.now();await page.click('#route-cancel');await page.waitForFunction(()=>!document.querySelector('#route-search').disabled);assert.ok(Date.now()-start<1500,'Cancel is immediate');
 assert.equal(await page.$$eval('[data-route-result]',es=>es.length),count);assert.match(await page.$eval('#route-status',e=>e.textContent),/Abgebrochen/);
 await new Promise(r=>setTimeout(r,300));assert.equal(await page.$$eval('[data-route-result]',es=>es.length),count);
 await page.select('#route-budget','5000');await page.click('#route-search');await page.waitForSelector('[data-route-result]',{timeout:120000});await page.click('[data-route-result]');
 await page.waitForFunction(()=>!document.querySelector('#route-search').disabled&&document.querySelectorAll('#graph-construction-checks [data-state=fail]').length===0);
 await page.waitForFunction(before=>JSON.parse(document.querySelector('#graph-json').value).bodies.some((b,i)=>b.frame.position.some((v,j)=>Math.abs(v-before[i].frame.position[j])>1e-6)),{},source.bodies);
 const adopted=JSON.parse(await page.$eval('#graph-json',e=>e.value));assert.ok(assessConstruction(adopted,1,false).valid);assert.ok(resolveMechanism(adopted).valid);assert.deepEqual(adopted.environment,source.environment);
 // A new run completes with the selected budget and cannot receive old worker messages.
 await page.click('#route-search');await page.waitForFunction(()=>!document.querySelector('#route-search').disabled,{timeout:120000});assert.ok(await page.$eval('#route-progress',e=>e.value)<=5000);assert.ok(await page.$$eval('[data-route-result]',es=>es.length)>0);
 // Worker loading failure must release the UI, rather than leave it busy forever.
 await page.setRequestInterception(true);page.on('request',r=>r.url().includes('mechanics-graph-search-worker.js')?r.abort():r.continue());await page.click('#route-search');await page.waitForFunction(()=>!document.querySelector('#route-search').disabled&&document.querySelector('#route-status').textContent.includes('fehlgeschlagen'),{timeout:10000});
 await page.evaluate(()=>clearInterval(window.timer));assert.deepEqual(errors,[]);console.log('Live browser search: streaming, responsiveness, immediate cancel, retained results, live adoption, restart, selected budget and worker failure passed.');
}finally{await browser.close();}
