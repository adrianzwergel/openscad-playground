import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import {compoundExample} from '../src/mechanics/graph/examples.ts';
import {demoMechanism,resolveMechanism} from '../src/mechanics/graph/model.ts';
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://localhost:4001/mechanics');await page.select('#mechanism-kind','graph');
 for(const kind of ['double-gear','gear-belt']){
  await page.select('#graph-demo',kind);await page.waitForFunction(()=>JSON.parse(document.querySelector('#graph-json').value).version===3);
  assert.equal(await page.$$eval('#graph-checks [data-state=fail],#graph-construction-checks [data-state=fail]',es=>es.length),0);
  await page.click('#graph-render');await page.waitForFunction(()=>!document.querySelector('#graph-render').disabled,{timeout:180000});assert.match(await page.$eval('#graph-status',e=>e.textContent),/fertig/);
 }
 // Cold search, not a preloaded compound as the answer.
 const source=demoMechanism();source.output.target=compoundExample('gear-belt').output.target;
 await page.$eval('#graph-json',(e,g)=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,JSON.stringify(g));e.dispatchEvent(new Event('input',{bubbles:true}));},source);await page.$eval('#graph-apply',e=>e.click());
 await page.select('#route-min-stages','2');await page.select('#route-stages','2');await page.$eval('#route-target',e=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'4');e.dispatchEvent(new Event('input',{bubbles:true}));});
 for(const c of await page.$$('[data-route-rule]'))if(!['external-spur','gt2-belt'].includes(await c.evaluate(e=>e.dataset.routeRule)))await c.click();
 await page.click('#route-search');await page.waitForFunction(()=>!document.querySelector('#route-search').disabled,{timeout:180000});assert.match(await page.$eval('[data-route-result]',e=>e.parentElement.textContent),/1 freie Verbünde/);await page.click('[data-route-result]');await page.waitForFunction(()=>JSON.parse(document.querySelector('#graph-json').value).version===3);
 await page.click('#save-project');await page.reload();await page.waitForSelector('#graph-json');const g=JSON.parse(await page.$eval('#graph-json',e=>e.value)),a=resolveMechanism(g),members=g.elements.filter(e=>e.rotorGroup);assert.ok(a.valid);assert.equal(a.speeds[members[0].body],0);assert.equal(a.elementSpeeds[members[0].id],a.elementSpeeds[members[1].id]);
 await page.$eval('#animation-phase',e=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'120');e.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.waitForFunction(()=>document.querySelector('#animation-angle').textContent.includes('120'));
 const angles=await page.$$eval('[data-rotor]',es=>Object.fromEntries(es.map(e=>[e.dataset.rotor,Number(e.dataset.angle)])));for(const e of members)assert.ok(Math.abs(angles[e.id]-e.phase-120*a.elementSpeeds[e.id])<1e-6);
 assert.deepEqual(errors,[]);console.log('Compound browser: CAD, cold alternatives, adoption, persistence and rigid co-rotation passed.');
}finally{await browser.close();}
