import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import {demoMechanism} from '../src/mechanics/graph/model.ts';
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://localhost:4001/mechanics');await page.select('#mechanism-kind','graph');
 for(const n of [3,4]){
  const g=demoMechanism();g.output.target={position:n===3?[102.4264068712,102.4264068712,60]:[60,144.8528137424,90],rotation:[0,0,0,1]};
  await page.$eval('#graph-json',(e,value)=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));},JSON.stringify(g));
  await page.$eval('#graph-apply',e=>e.click());
  await page.select('#route-min-stages',String(n));await page.select('#route-stages',String(n));
  await page.$eval('#route-target',(e,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,String(value));e.dispatchEvent(new Event('input',{bubbles:true}));},2**n);
  await page.click('#route-search');await page.waitForFunction(()=>!document.querySelector('#route-search').disabled,{timeout:180000});
  console.log(n,await page.$eval('#route-status',e=>e.textContent));assert.ok(await page.$('[data-route-result]'));
  await page.click('[data-route-result]');
  await page.waitForFunction(n=>JSON.parse(document.querySelector('#graph-json').value).relations.length===n,{},n);
  assert.equal(await page.$$eval('#graph-checks [data-state=fail],#graph-construction-checks [data-state=fail]',e=>e.length),0);
  const adopted=JSON.parse(await page.$eval('#graph-json',e=>e.value));assert.equal(adopted.relations.length,n);assert.deepEqual(adopted.output.target,g.output.target);
 }
 await page.click('#save-project');await page.reload();
 await page.waitForSelector('#graph-json');
 assert.equal(JSON.parse(await page.$eval('#graph-json',e=>e.value)).relations.length,4);
 assert.equal(await page.$$eval('#graph-construction-checks [data-state=fail]',e=>e.length),0);
 assert.deepEqual(errors,[]);console.log('Browser: cold three/four stages, adoption, clearance reports and persistence passed.');
}finally{await browser.close();}
