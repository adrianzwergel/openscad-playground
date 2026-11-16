// Gearbox, example "Rocker-Bogie mit Kette 04C": it opens without an error, the five chains are drawn, the 3D model is
// built with the sprockets; the bogie's axle shows its three chains with their links, one removed and back with Ctrl+Z.
import puppeteer from 'puppeteer';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'kette-')),shots=process.argv[2];
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(dir,'profil'),protocolTimeout:240000});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try{const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1500,height:1000});
 const ready=async()=>{await p.waitForFunction(()=>['ready','error'].includes(document.querySelector('#preview-state')?.dataset.state),{timeout:240000});const st=await p.$eval('#preview-state',e=>({s:e.dataset.state,t:e.textContent}));assert.equal(st.s,'ready',st.t);};
 await p.goto('http://localhost:4001/getriebe');await p.waitForSelector('body[data-ready=true] [data-example="rocker-kette"]',{visible:true});await p.click('[data-example="rocker-kette"]');
 await p.waitForFunction(()=>document.querySelector('#gear-name').textContent.includes('Kette')&&!!document.querySelector('#top [data-shaft="w3"]'));
 assert.equal(await p.$$eval('#issues .fehler,#issues .warnung',e=>e.length),0,'keine Fehler, keine Warnungen');
 assert.equal(await p.$$eval('#top .belt.chain',e=>e.length),5,'fünf Ketten');
 await ready();await wait(1500);
 const sum=await p.evaluate(()=>window.preview.summary());assert.ok(sum.filter(m=>/Kettenrad 04C/.test(m.name)).length>=9,'Kettenräder im 3D-Modell');
 if(shots)await p.screenshot({path:path.join(shots,'kette-1.png')});
 const axle=await p.$eval('#top [data-shaft="b"] .axle',e=>{const b=e.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};});await p.mouse.click(axle.x,axle.y);await wait(200);
 const info=await p.$$eval('#properties [data-chain-info]',e=>e.map(x=>x.textContent));assert.equal(info.length,3,info.join(' | '));assert.ok(info.every(t=>/62 Glieder/.test(t)),info.join(' | '));
 if(shots)await p.screenshot({path:path.join(shots,'kette-2.png')});
 await p.evaluate(()=>[...document.querySelectorAll('#properties .prop-col button')].find(b=>b.textContent==='entfernen').click());await wait(300);
 assert.equal(await p.$$eval('#top .belt.chain',e=>e.length),4,'eine Kette entfernt');
 await p.keyboard.down('Control');await p.keyboard.press('z');await p.keyboard.up('Control');await wait(300);
 assert.equal(await p.$$eval('#top .belt.chain',e=>e.length),5,'zurückgeholt');
 assert.deepEqual(errors,[]);
 console.log('Rocker-Bogie mit Kette im Browser: ohne Fehler und Warnungen, fünf Ketten gezeichnet, Kettenräder im 3D-Modell, drei Ketten an der Bogie-Achse mit 62 Gliedern, entfernt und zurückgeholt.');
}finally{await browser.close();await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});}
