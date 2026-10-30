import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import {defaultSpatial,resolveSpatial} from '../src/mechanics/spatial.ts';
import {spatialCAD,orient} from '../src/mechanics/spatial-cad.ts';
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 const page=await browser.newPage();await page.goto('http://localhost:4001/mechanics');
 const variants=[{...defaultSpatial('internal'),teeth:80,phase:4.5},{...defaultSpatial('bevel'),teeth:20,phase:4.5},...[{teeth:30,starts:2},{teeth:40,starts:1},{teeth:40,starts:2}].map(v=>({...defaultSpatial('worm'),...v,phase:90}))].map(p=>({...p,clearance:1}));
 const samples=[...['internal','bevel','worm'].flatMap(kind=>(kind==='worm'?[0,90,180,270]:[0,4.5,9,13.5]).map(phase=>({...defaultSpatial(kind),phase}))),...variants];
 for(const p of samples){
  const {kind,phase}=p,a=resolveSpatial(p),cad=spatialCAD(p,'housing');
  const place=i=>`translate([${a.shafts[i].origin.join(',')}]) ${orient(a.shafts[i].axis)} rotate([0,0,${i?a.outputGain*phase:phase}])`;
  const source=cad.definitions+`union(){translate([1000,1000,1000]) cube(1);intersection(){${place(0)} input_part();union(){${place(1)} output_part();${kind==='internal'?`rotate([0,0,${a.outputGain*phase}]) driver();`:''}}}}`;
  const r=await page.evaluate(source=>new Promise((resolve,reject)=>{const w=new Worker('./mechanics-render-worker.js'),timer=setTimeout(()=>{w.terminate();reject(Error('timeout'));},120000);w.onmessage=e=>{clearTimeout(timer);w.terminate();e.data.error?reject(Error(e.data.error)):resolve(e.data);};w.onerror=e=>{clearTimeout(timer);w.terminate();reject(Error(e.message));};w.postMessage({source});}),source);
  const count=Number(r.off.trim().split('\n')[0].split(/\s+/)[1]);console.log(kind,phase,'intersection vertices',count);assert.equal(count,8,`${kind}/${phase} tooth collision`);
 }
 for(const p of [...['internal','bevel','worm'].map(defaultSpatial),...variants]){
  const kind=p.kind,cad=spatialCAD(p,'housing');
  const source=cad.definitions+`union(){translate([1000,1000,1000]) cube(1);intersection(){gear_pair();union(){${cad.stationary}}}}`;
  const result=await page.evaluate(source=>new Promise((resolve,reject)=>{const w=new Worker('./mechanics-render-worker.js');w.onmessage=e=>{w.terminate();e.data.error?reject(Error(e.data.error)):resolve(e.data.off);};w.onerror=e=>reject(Error(e.message));w.postMessage({source});}),source);
  const count=Number(result.trim().split('\n')[0].split(/\s+/)[1]);console.log(kind,'housing intersection vertices',count);assert.equal(count,8,kind+' housing collision');
 }
 console.log('Spatial contact and housing probes passed.');
}finally{await browser.close();}
