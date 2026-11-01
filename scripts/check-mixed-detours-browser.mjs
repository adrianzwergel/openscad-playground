import assert from 'node:assert/strict';
import {fixture} from './mixed-space-fixture.mjs';
import puppeteer from 'puppeteer';
import {resolveMechanism} from '../src/mechanics/graph/model.ts';
import {assessConstruction} from '../src/mechanics/graph/construction.ts';
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://localhost:4001/mechanics');await page.select('#mechanism-kind','graph');
 const source=fixture(4);
 await page.$eval('#graph-json',(e,g)=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,JSON.stringify(g));e.dispatchEvent(new Event('input',{bubbles:true}));},source);await page.$eval('#graph-apply',e=>e.click());
 await page.select('#route-min-stages','4');await page.select('#route-stages','4');await page.$eval('#route-target',e=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'120');e.dispatchEvent(new Event('input',{bubbles:true}));});
 for(const c of await page.$$('[data-route-rule]'))if(!['external-spur','gt2-belt','worm-mesh','bevel-mesh'].includes(await c.evaluate(e=>e.dataset.routeRule)))await c.click();
 await page.click('#route-search');await page.waitForFunction(()=>!document.querySelector('#route-search').disabled,{timeout:300000});
 assert.match(await page.$eval('#route-status',e=>e.textContent),/[1-9]\d* Umfahrungsstarts/);
 await page.click('[data-route-result]');await page.waitForFunction(()=>document.querySelectorAll('#graph-construction-checks [data-state=fail]').length===0);
 await page.waitForFunction(before=>JSON.parse(document.querySelector('#graph-json').value).bodies.some((b,i)=>b.frame.position.some((v,j)=>Math.abs(v-before[i].frame.position[j])>1e-6)),{},source.bodies);
 const g=JSON.parse(await page.$eval('#graph-json',e=>e.value));assert.ok(resolveMechanism(g).valid);assert.ok(assessConstruction(g,1,false).valid);assert.deepEqual(g.environment,source.environment);assert.deepEqual(g.output.target,source.output.target);
 await page.click('#save-project');await page.reload();await page.waitForSelector('#graph-json');assert.deepEqual(JSON.parse(await page.$eval('#graph-json',e=>e.value)),g);assert.deepEqual(errors,[]);
 console.log('Browser: four-stage mixed obstacle routing, progress report, valid adoption and persistence passed.');
}finally{await browser.close();}
