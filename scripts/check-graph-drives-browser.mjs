import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import {driveExample} from '../src/mechanics/graph/examples.ts';
import {mechanismCAD} from '../src/mechanics/graph/model.ts';
import {reflow} from '../src/mechanics/graph/refine.ts';
import {matrix} from '../src/mechanics/graph/frames.ts';
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://localhost:4001/mechanics');await page.select('#mechanism-kind','graph');
 for(const kind of ['worm-spur','worm-belt','spur-belt-worm']){
  await page.select('#graph-demo',kind);await page.waitForFunction(()=>JSON.parse(document.querySelector('#graph-json').value).relations.some(r=>r.rule==='worm-mesh'));await page.click('#route-use-ratio');
  assert.equal(await page.$$eval('#graph-checks [data-state=fail],#graph-construction-checks [data-state=fail]',xs=>xs.length),0);
  await page.click('#graph-render');await page.waitForFunction(()=>!document.querySelector('#graph-render').disabled,{timeout:180000});
  assert.match(await page.$eval('#graph-status',e=>e.textContent),/fertig/);
 }
 await page.click('#save-project');await page.reload();await page.waitForSelector('#graph-json');assert.ok(JSON.parse(await page.$eval('#graph-json',e=>e.value)).relations.some(r=>r.rule==='gt2-belt'));
 // Actual WASM tooth intersections at different azimuths and input phases.
 for(const [azimuth,phase] of [[0,0],[37,0],[37,90]]){
  let g=driveExample('worm-spur');g.relations[0].params.azimuth=azimuth;g.elements[0].phase=phase;g=reflow(g);g.output.target=structuredClone(g.bodies.at(-1).frame);
  const parts=mechanismCAD(g).parts,shape=p=>`multmatrix(${JSON.stringify(matrix(p.frame))}) ${p.body}`;
  const source=`include <BOSL2/std.scad>\ninclude <BOSL2/gears.scad>\n$fn=48;union(){translate([1000,1000,1000])cube(1);intersection(){${shape(parts[0])}${shape(parts[1])}}}`;
  const off=await page.evaluate(source=>new Promise((resolve,reject)=>{const w=new Worker('./mechanics-render-worker.js'),timer=setTimeout(()=>{w.terminate();reject(Error('timeout'));},180000);w.onmessage=e=>{clearTimeout(timer);w.terminate();e.data.error?reject(Error(e.data.error)):resolve(e.data.off);};w.postMessage({source});}),source);
  const count=Number(off.trim().split('\n')[0].split(/\s+/)[1]);assert.equal(count,8,`worm contact az=${azimuth}, phase=${phase}`);
 }
 assert.deepEqual(errors,[]);console.log('Drive browser: three mixed CAD assemblies, persistence and sampled worm tooth intersections passed.');
}finally{await browser.close();}
