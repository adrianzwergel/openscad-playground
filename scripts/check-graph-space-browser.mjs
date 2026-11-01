import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import {resolveMechanism} from '../src/mechanics/graph/model.ts';
import {assessConstruction} from '../src/mechanics/graph/construction.ts';
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://localhost:4001/mechanics');await page.select('#mechanism-kind','graph');await page.select('#graph-demo','space-route');
 await page.waitForFunction(()=>JSON.parse(document.querySelector('#graph-json').value).version===4);
 const before=JSON.parse(await page.$eval('#graph-json',e=>e.value));assert.equal(await page.$$eval('[data-space-zone]',es=>es.length),2);
 assert.ok(await page.$$eval('#graph-construction-checks [data-state=fail]',es=>es.length)>0);
 await page.select('#route-min-stages','2');await page.select('#route-stages','2');await page.$eval('#route-target',e=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'1');e.dispatchEvent(new Event('input',{bubbles:true}));});
 for(const c of await page.$$('[data-route-rule]'))if(await c.evaluate(e=>e.dataset.routeRule)!=='external-spur')await c.click();
 await page.click('#route-search');await page.waitForFunction(()=>!document.querySelector('#route-search').disabled,{timeout:180000});await page.click('[data-route-result]');
 await page.waitForFunction(()=>document.querySelectorAll('#graph-construction-checks [data-state=fail]').length===0);
 await page.click('#save-project');await page.reload();await page.waitForSelector('#graph-json');const saved=JSON.parse(await page.$eval('#graph-json',e=>e.value));assert.deepEqual(saved.environment,before.environment);assert.ok(resolveMechanism(saved).valid);assert.ok(assessConstruction(saved,1,false).valid);
 await page.click('#environment-add-zone');await page.waitForSelector('[data-obstacle="zone-1"]');
 await page.$eval('[aria-label="zone-1 position X"]',e=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'500');e.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.waitForFunction(()=>JSON.parse(document.querySelector('#graph-json').value).environment.obstacles.some(o=>o.id==='zone-1'&&o.frame.position[0]===500));
 assert.equal(await page.$$eval('[data-space-zone]',es=>es.length),3);assert.deepEqual(errors,[]);
 console.log('Browser: blocked example, route search, adoption, persistence, zone editing and overlay passed.');
}finally{await browser.close();}
