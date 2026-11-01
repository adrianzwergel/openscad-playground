import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import {demoMechanism,resolveMechanism} from '../src/mechanics/graph/model.ts';
import {identity} from '../src/mechanics/graph/frames.ts';
import {assessConstruction} from '../src/mechanics/graph/construction.ts';
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://localhost:4001/mechanics');await page.select('#mechanism-kind','graph');
 const source=demoMechanism();source.version=4;source.output.target={...identity(),position:[120,0,90]};source.environment={margin:1,bounds:{id:'space',frame:{...identity(),position:[90,0,45]},size:[320,300,250]},obstacles:[{id:'block',frame:{...identity(),position:[60,0,30]},size:[10,10,180]}]};
 await page.$eval('#graph-json',(e,g)=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,JSON.stringify(g));e.dispatchEvent(new Event('input',{bubbles:true}));},source);await page.$eval('#graph-apply',e=>e.click());
 await page.select('#route-min-stages','3');await page.select('#route-stages','3');await page.$eval('#route-target',e=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'8');e.dispatchEvent(new Event('input',{bubbles:true}));});
 for(const c of await page.$$('[data-route-rule]'))if(await c.evaluate(e=>e.dataset.routeRule)!=='external-spur')await c.click();
 await page.click('#route-search');await page.waitForFunction(()=>!document.querySelector('#route-search').disabled,{timeout:180000});
 assert.match(await page.$eval('#route-status',e=>e.textContent),/[1-9]\d* Umfahrungsstarts/);
 await page.click('[data-route-result]');await page.waitForFunction(()=>JSON.parse(document.querySelector('#graph-json').value).relations.length===3);
 const g=JSON.parse(await page.$eval('#graph-json',e=>e.value));assert.ok(resolveMechanism(g).valid);assert.ok(assessConstruction(g,1,false).valid);assert.deepEqual(g.environment,source.environment);assert.deepEqual(g.output.target,source.output.target);
 await page.click('#save-project');await page.reload();await page.waitForSelector('#graph-json');assert.deepEqual(JSON.parse(await page.$eval('#graph-json',e=>e.value)),g);assert.deepEqual(errors,[]);
 console.log('Browser: cold three-stage detours, progress report, valid adoption and persistence passed.');
}finally{await browser.close();}
