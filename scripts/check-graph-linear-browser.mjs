import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import {linearExample} from '../src/mechanics/graph/examples.ts';
import {mechanismCAD} from '../src/mechanics/graph/model.ts';
import {reflow} from '../src/mechanics/graph/refine.ts';
import {matrix,axis,add,scale} from '../src/mechanics/graph/frames.ts';
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://localhost:4001/mechanics');await page.select('#mechanism-kind','graph');
 for(const kind of ['belt-screw','spur-rack','worm-belt-screw','free-idler']){
  await page.select('#graph-demo',kind);await page.waitForFunction(()=>JSON.parse(document.querySelector('#graph-json').value).version===2);
  assert.equal(await page.$$eval('#graph-checks [data-state=fail],#graph-construction-checks [data-state=fail]',es=>es.length),0);
  await page.click('#graph-render');await page.waitForFunction(()=>!document.querySelector('#graph-render').disabled,{timeout:180000});assert.match(await page.$eval('#graph-status',e=>e.textContent),/fertig/);
  if(kind!=='free-idler'){
   await page.$eval('#graph-travel',e=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'50');e.dispatchEvent(new Event('input',{bubbles:true}));});
   await page.waitForFunction(()=>document.querySelector('#graph-linear-position').textContent.includes('50.00 / 100'));
   assert.equal(await page.$$eval('[data-motion=translation]',es=>es.length),1);
  }else assert.match(await page.$eval('#graph-bindings',e=>e.textContent),/-0.5000/);
 }
 await page.select('#graph-demo','belt-screw');await page.click('#route-use-ratio');await page.select('#route-min-stages','2');await page.select('#route-stages','2');
 await page.click('#route-search');await page.waitForFunction(()=>!document.querySelector('#route-search').disabled,{timeout:180000});assert.ok(await page.$('[data-route-result]'));await page.click('[data-route-result]');
 await page.click('#save-project');await page.reload();await page.waitForSelector('#graph-json');
 const saved=JSON.parse(await page.$eval('#graph-json',e=>e.value));assert.equal(saved.version,2);assert.equal(saved.output.motion,'translation');assert.equal(saved.output.stroke,100);
 // Real rack/pinion contact samples throughout the travel, including an arbitrary azimuth.
 for(const azimuth of [0,37])for(const q of [0,50,100]){
  let g=linearExample('spur-rack');g.relations.at(-1).params.azimuth=azimuth;g=reflow(g);g.output.target=structuredClone(g.bodies.at(-1).frame);
  const parts=mechanismCAD(g).parts,pinion=parts[2],rack=parts[3];
  pinion.body=`rotate([0,0,${q/20*180/Math.PI}]) ${pinion.body}`;
  rack.frame={...rack.frame,position:add(rack.frame.position,scale(axis(rack.frame),q))};
  const shape=p=>`multmatrix(${JSON.stringify(matrix(p.frame))}) ${p.body}`;
  const source=`include <BOSL2/std.scad>\ninclude <BOSL2/gears.scad>\n$fn=48;union(){translate([1000,1000,1000])cube(1);intersection(){${shape(pinion)}${shape(rack)}}}`;
  const off=await page.evaluate(source=>new Promise((resolve,reject)=>{const w=new Worker('./mechanics-render-worker.js'),timer=setTimeout(()=>{w.terminate();reject(Error('timeout'));},180000);w.onmessage=e=>{clearTimeout(timer);w.terminate();e.data.error?reject(Error(e.data.error)):resolve(e.data.off);};w.postMessage({source});}),source);
  assert.equal(Number(off.trim().split('\n')[0].split(/\s+/)[1]),8,`Rack interference az=${azimuth}, q=${q}`);
 }
 assert.deepEqual(errors,[]);console.log('Linear browser: CAD, translation, free rotor, search/adopt/save and rack contact samples passed.');
}finally{await browser.close();}
