// The Studio's rover example: one rocker-bogie gearbox linked twice (right side mirrored), a deck, and a differential
// bar with two turnbuckles to the rockers. The left rocker's slider turns the right rocker the other way round, the bar
// follows, both turnbuckles keep their length, the loop closes.
import puppeteer from 'puppeteer';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {start} from './studio-ui.mjs';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'rover-')),shots=process.argv[2];
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(dir,'profil'),protocolTimeout:240000});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try{const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1500,height:1000});
 await p.goto('http://localhost:4001/studio.html');await start(p,'data-example="rover"');
 await p.waitForFunction(()=>(window.studioGearbox('links')?.meshes??0)>10&&(window.studioGearbox('rechts')?.meshes??0)>10,{timeout:240000,polling:500});
 assert.equal((await p.evaluate(()=>window.studioGearbox('rechts'))).mirrored,true,'rechts gespiegelt');
 assert.deepEqual(await p.$$eval('[data-gearbox-row]',e=>e.map(x=>x.textContent)),['⚙▣ Seite links','⚙▣ Seite rechts (gespiegelt)']);
 // The right rocker has no slider: it follows the left one.
 await p.waitForSelector('#axes [data-follows="getriebe:rechts/g1"]');assert.ok(!await p.$('#axes input[data-arm="getriebe:rechts/g1"]'),'kein eigener Regler rechts');
 const ends=()=>p.evaluate(()=>['stange-l','stange-r'].map(l=>['balken','rocker'].map(q=>window.studioLinkage.point(l,q))));
 const len=e=>e.map(([a,b])=>Math.hypot(...a.map((v,i)=>v-b[i])));
 const rest=await ends();assert.deepEqual(len(rest).map(v=>+v.toFixed(3)),[30,30]);
 await p.$eval('#axes input[data-arm="getriebe:links/g1"]',e=>{e.value='12';e.dispatchEvent(new Event('input'));});await wait(600);
 const moved=await ends(),up=moved.map((e,i)=>e[1][2]-rest[i][1][2]);
 assert.ok(up[0]>5&&Math.abs(up[0]+up[1])<.01,`die Rocker gehen gegenläufig (${up.map(v=>v.toFixed(2))})`);
 assert.ok(len(moved).every(v=>Math.abs(v-30)<.02),`Stangen behalten ihre Länge (${len(moved).map(v=>v.toFixed(3))})`);
 assert.ok(moved[0][0][2]-rest[0][0][2]>5&&moved[1][0][2]-rest[1][0][2]<-5,'der Balken kippt');
 assert.doesNotMatch(await p.$eval('#axes',e=>e.textContent),/schließt nicht/);
 if(shots)await p.screenshot({path:path.join(shots,'rover.png')});
 // Both sides screwed to the deck: a bracket each on two frame bolts, two holes each in the deck, nothing in the way; the
 // sides hang on the deck, so moving the deck moves them.
 for(const side of ['links','rechts']){const m=await p.evaluate(s=>window.studioMount(s),side);assert.deepEqual(m,{bolts:2,issues:[],solids:4,holes:2},`Winkel ${side}`);}
 assert.match(await p.$eval('#tree',e=>e.textContent),/Seite links fest an Bodenplatte/);
 await p.click('[data-gearbox-row="links"]');await p.waitForSelector('#properties [data-mount-stl]');assert.match(await p.$eval('#mount-state',e=>e.textContent),/✓ Winkel auf 2 Säulenbolzen/);
 const cdp=await p.createCDPSession();await cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:dir});
 await p.click('#properties [data-mount-stl]');let stl;for(let i=0;i<120&&!stl;i++){await wait(500);stl=(await fs.readdir(dir)).find(f=>/^winkel-.*\.stl$/.test(f));}
 assert.ok(stl,'Winkel als STL');const size=(await fs.stat(path.join(dir,stl))).size;assert.ok(size>5000,`STL ${size} Bytes`);
 // The balance is on the right side's page.
 await p.click('[data-gearbox-row="rechts"]');await p.waitForSelector('#properties select[data-balance="getriebe:rechts/g1"]');
 assert.equal(await p.$eval('#properties select[data-balance="getriebe:rechts/g1"]',s=>s.value),'getriebe:links/g1');
 assert.deepEqual(errors,[]);
 console.log(`Rover im Studio: zwei Seiten aus einem Getriebe, rechts gespiegelt, je mit einem Winkel ans Deck geschraubt (STL ${(size/1024).toFixed(0)} kB); Rocker links 12° → Kugelbolzen ${up.map(v=>v.toFixed(1)).join(' / ')} mm, Stangen ${len(moved).map(v=>v.toFixed(2)).join(' / ')} mm, Balken kippt, Gestänge schließt.`);
}finally{await browser.close();await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});}
