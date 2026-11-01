import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import {demoMechanism,resolveMechanism,mechanismCAD} from '../src/mechanics/graph/model.ts';
import {matrix} from '../src/mechanics/graph/frames.ts';
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://localhost:4001/mechanics');await page.select('#mechanism-kind','graph');
 const source=demoMechanism();source.output.target={position:[120,0,0],rotation:[0,0,0,1]};
 await page.$eval('#graph-json',(e,value)=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,JSON.stringify(value));e.dispatchEvent(new Event('input',{bubbles:true}));},source);
 await page.$eval('#graph-apply',e=>e.click());await page.select('#route-min-stages','2');await page.select('#route-stages','2');
 await page.$eval('#route-target',e=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'1');e.dispatchEvent(new Event('input',{bubbles:true}));});
 for(const checkbox of await page.$$('[data-route-rule]')){const rule=await checkbox.evaluate(e=>e.dataset.routeRule);if(rule!=='external-spur')await checkbox.click();}
 await page.click('#route-search');await page.waitForFunction(()=>!document.querySelector('#route-search').disabled,{timeout:180000});
 assert.match(await page.$eval('[data-route-result]',e=>e.parentElement.textContent),/1 freie Zwischenräder/);await page.click('[data-route-result]');
 await page.waitForFunction(()=>JSON.parse(document.querySelector('#graph-json').value).elements.some(e=>e.binding==='free'));
 assert.equal(await page.$$eval('#graph-checks [data-state=fail],#graph-construction-checks [data-state=fail]',es=>es.length),0);
 await page.click('#graph-render');await page.waitForFunction(()=>!document.querySelector('#graph-render').disabled,{timeout:180000});assert.match(await page.$eval('#graph-status',e=>e.textContent),/fertig/);
 await page.click('#save-project');await page.reload();await page.waitForSelector('#graph-json');const g=JSON.parse(await page.$eval('#graph-json',e=>e.value)),a=resolveMechanism(g),idler=g.elements.find(e=>e.binding==='free');assert.ok(a.valid);assert.equal(a.speeds[idler.body],0);assert.notEqual(a.elementSpeeds[idler.id],0);
 await page.click('#animation-toggle');await page.waitForFunction(id=>Math.abs(Number(document.querySelector(`[data-rotor="${id}"]`).dataset.angle))>1,{},idler.id);await page.click('#animation-toggle');
 const parts=mechanismCAD(g).parts;
 for(const phase of [0,63])for(const r of g.relations){
  const shape=id=>{const p=parts.find(p=>p.id===id);return `multmatrix(${JSON.stringify(matrix(p.frame))}) rotate([0,0,${phase*a.elementSpeeds[id]}]) ${p.body}`;};
  const source=`include <BOSL2/std.scad>\ninclude <BOSL2/gears.scad>\n$fn=48;union(){translate([1000,1000,1000])cube(1);intersection(){${r.elements.map(shape).join('')}}}`;
  const off=await page.evaluate(source=>new Promise((resolve,reject)=>{const w=new Worker('./mechanics-render-worker.js'),timer=setTimeout(()=>{w.terminate();reject(Error('timeout'));},180000);w.onmessage=e=>{clearTimeout(timer);w.terminate();e.data.error?reject(Error(e.data.error)):resolve(e.data.off);};w.postMessage({source});}),source);
  assert.equal(Number(off.trim().split('\n')[0].split(/\s+/)[1]),8);
 }
 assert.deepEqual(errors,[]);console.log('Idler browser: cold search, explanation, adoption, CAD, persistence, independent motion and tooth-contact samples passed.');
}finally{await browser.close();}
