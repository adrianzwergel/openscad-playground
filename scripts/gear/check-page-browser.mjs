// The gearbox generator in the browser. From the Studio's start page; the example "Eine Stufe" writes its shafts and
// opens. The z40 shaft dragged round its partner snaps into mesh at 45°; dragged far away it no longer meshes; a click on
// the z20 shaft in the library adds it meshing with the z40; the angle round the partner typed exact; the first layer's
// band stretched by drag makes the layers set by hand; a web selected and removed lets the plate fall apart, Ctrl+Z
// brings it back; all of it is there after a reload; the shaft generator opens a shaft by ?open=. The belt example:
// the belt removed and added again from the pulley's properties.
import puppeteer from 'puppeteer';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'getriebe-')),shots=process.argv[2];
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(dir,'profil'),protocolTimeout:60000});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try{const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1500,height:1000});
 await p.goto('http://localhost:4001/studio');await p.waitForSelector('a.start-card[href="./getriebe.html"]',{visible:true});await p.click('a.start-card[href="./getriebe.html"]');
 await p.waitForSelector('body[data-ready=true] [data-example="stufe"]',{visible:true});await p.click('[data-example="stufe"]');await p.waitForSelector('#top svg [data-web]');
 const axle=id=>p.$eval(`#top [data-shaft="${id}"] .axle`,e=>{const b=e.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};});
 const scale=()=>p.$eval('#top svg',e=>Number(e.dataset.scale));
 const drag=async(from,to)=>{await p.mouse.move(from.x,from.y);await p.mouse.down();await p.mouse.move(from.x+5,from.y,{steps:2});await p.mouse.move(to.x,to.y,{steps:10});await p.mouse.up();await wait(150);};
 const meshes=()=>p.$$eval('#top .mesh',e=>e.length);
 assert.equal(await meshes(),1);const s=await scale();
 // Round its partner to about 45° (screen y runs down).
 let a=await axle('a'),b=await axle('b');await drag(b,{x:a.x+30*s*Math.cos(Math.PI/4)+3,y:a.y-30*s*Math.sin(Math.PI/4)+2});
 a=await axle('a');b=await axle('b');let k=await scale();const ang=Math.atan2(a.y-b.y,b.x-a.x)*180/Math.PI;assert.ok(Math.abs(ang-45)<.5&&Math.abs(Math.hypot(b.x-a.x,b.y-a.y)/k-30)<.3,`im Eingriff bei 45°: ${ang.toFixed(2)}°`);assert.equal(await meshes(),1);
 // Far away: no mesh.
 await drag(b,{x:b.x+60*k,y:b.y});assert.equal(await meshes(),0,'weit weg');
 // A click on the z20 shaft in the library adds it meshing with the z40.
 const card=await p.evaluateHandle(()=>[...document.querySelectorAll('[data-add-shaft]')].find(x=>/Antrieb z20/.test(x.textContent)));await card.evaluate(e=>e.scrollIntoView());await card.click();await wait(200);
 assert.equal(await p.$$eval('#top [data-shaft]',e=>e.length),3);assert.equal(await meshes(),1,'neue Welle kämmt mit z40');
 // Exact angle round the partner: the new shaft is selected.
 const angle=await p.evaluateHandle(()=>[...document.querySelectorAll('#properties .prop')].find(l=>/Winkel um/.test(l.textContent)).querySelector('input'));await angle.evaluate(e=>{e.value='';e.focus();});await angle.type('90');await p.keyboard.press('Tab');await wait(150);
 const w1=await axle('w1'),b2=await axle('b');k=await scale();assert.ok(Math.abs(w1.x-b2.x)<1&&Math.abs((b2.y-w1.y)/k-30)<.5,`90° über dem z40: ${JSON.stringify([w1,b2])}`);
 if(shots)await p.screenshot({path:path.join(shots,'getriebe-editor.png')});
 // The first band stretched: layers set by hand.
 const edge=await p.$eval('#side [data-band="0"] [data-edge="r"]',e=>{const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};});await drag(edge,{x:edge.x+40,y:edge.y});
 assert.match(await p.$eval('#properties h2',e=>e.textContent),/Schicht 1/);assert.ok(!(await p.$eval('#side [data-band="0"]',e=>e.classList.contains('auto'))),'von Hand');
 // A web removed, the plate falls apart; Ctrl+Z.
 await p.click('[data-layer="0"]');await wait(100);const web=await p.$('#top [data-web]');assert.ok(web,'Steg da');await web.click();await wait(100);
 await p.evaluate(()=>[...document.querySelectorAll('#properties button')].find(b=>b.textContent==='Steg entfernen').click());await wait(150);assert.match(await p.$eval('#issues',e=>e.textContent),/zerfällt in \d Teile/);
 await p.keyboard.down('Control');await p.keyboard.press('z');await p.keyboard.up('Control');await wait(150);const back=await p.$$eval('#top [data-web]',e=>e.length);assert.ok(back>=1,'Strg+Z');
 // After a reload.
 const before=await p.$eval('#top svg',e=>e.innerHTML);await wait(600);await p.reload();await p.waitForSelector('body[data-ready=true] #top svg [data-shaft]');await wait(100);assert.equal(await p.$eval('#top svg',e=>e.innerHTML),before,'nach dem Neuladen');
 // The shaft generator opens a shaft by ?open=.
 await p.click('#top [data-shaft="a"] .axle');await wait(100);const href=await p.$eval('#properties a.button',e=>e.getAttribute('href'));assert.match(href,/welle\.html#open=/);
 const q=await browser.newPage();await q.goto('http://localhost:4001/'+href.slice(2));await q.waitForSelector('body[data-ready=true]');assert.match(await q.$eval('#shaft-name',e=>e.textContent),/Antrieb z20/);await q.close();await p.bringToFront();
 // The belt example: remove the belt, add it again.
 await p.click('#gear-close');await p.waitForSelector('[data-example="riemen"]',{visible:true});await p.click('[data-example="riemen"]');await p.waitForSelector('#top svg .belt');
 await p.click('#top [data-shaft="a"] .axle');await wait(100);await p.evaluate(()=>[...document.querySelectorAll('#properties button')].find(b=>b.textContent==='entfernen').click());await wait(150);assert.equal(await p.$$eval('#top .belt',e=>e.length),0);
 await p.click('[data-belt]');await wait(150);assert.equal(await p.$$eval('#top .belt',e=>e.length),1);assert.match(await p.$eval('#drives',e=>e.textContent),/Normlänge 200 mm/);
 // The motor: on layer 1 with slots; the belt set to the stock length's centre distance; the shaft raised, moved back by its button.
 assert.match(await p.$eval('#properties',e=>e.textContent),/Flansch an der Unterseite von Schicht 1, Langlöcher ±3 mm in Riemenrichtung/);assert.ok(await p.$('#top [data-motor]'),'Motor in der Draufsicht');
 await p.click('[data-belt-fit]');await wait(150);assert.match(await p.$eval('#issues',e=>e.textContent),/Normriemen 200 mm passt/);
 const z=await p.evaluateHandle(()=>[...document.querySelectorAll('#properties .prop')].find(l=>/Höhe z/.test(l.textContent)).querySelector('input'));await z.evaluate(e=>{e.value='';e.focus();});await z.type('8');await p.keyboard.press('Tab');await wait(150);
 assert.match(await p.$eval('#issues',e=>e.textContent),/liegt bei z 3 mm an keiner Platte/);await p.click('[data-motor-fit]');await wait(150);assert.doesNotMatch(await p.$eval('#issues',e=>e.textContent),/an keiner Platte/);
 // A web in a wheel's way: round it, in the depth, straight again.
 await p.click('#gear-close');await p.waitForSelector('[data-example="umweg"]',{visible:true});await p.click('[data-example="umweg"]');await p.waitForSelector('#top .web.hit');
 assert.match(await p.$eval('#issues',e=>e.textContent),/geht durch z30 m1 auf Rad unten z30/);
 const choose=async label=>{const hit=await p.$('#top [data-web="a/l1|c/l1"]');await hit.click();await wait(100);await p.evaluate(t=>[...document.querySelectorAll('#properties button')].find(b=>b.textContent===t).click(),label);await wait(200);};
 await choose('Außen herum');assert.ok(await p.$('#top g.web.round[data-web="a/l1|c/l1"]'),'außen herum gezeichnet');assert.doesNotMatch(await p.$eval('#issues',e=>e.textContent),/geht durch/);
 await choose('In die Tiefe');assert.ok(await p.$('#top .web.stepped[data-web="a/l1|c/l1"]'),'in der Tiefe');assert.match(await p.$eval('#issues',e=>e.textContent),/in der Tiefe nur 6,5 mm/);
 await choose('Gerade');assert.ok(await p.$('#top .web.hit[data-web="a/l1|c/l1"]'),'wieder gerade');
 // The shaft editor over the page: the shaft made longer there, the gearbox behind follows; a new shaft is in the
 // gearbox when the dialog closes.
 const axleEnd=()=>p.$eval('#side .row',g=>Number(g.querySelector('.axle').getAttribute('x2')));const before2=await axleEnd();
 await p.click('#top [data-shaft="a"] .axle');await wait(100);await p.click('[data-edit-shaft]');await p.waitForSelector('#shaft-dialog:not([hidden])');
 const frame=async()=>{for(let i=0;i<100;i++){const fr=p.frames().find(x=>/welle/.test(x.url()));if(fr&&await fr.$('body[data-ready=true]').catch(()=>null))return fr;await wait(100);}throw Error('Wellen-Fenster lädt nicht');};
 let fr=await frame();assert.match(await fr.$eval('#shaft-name',e=>e.textContent),/Antrieb z20/);assert.equal(await fr.$eval('#shaft-close',e=>getComputedStyle(e).display),'none','eingebettet ohne „Alle Wellen“');
 const len=await fr.evaluateHandle(()=>[...document.querySelectorAll('#properties .prop')].find(l=>/Länge/.test(l.textContent)).querySelector('input'));await len.evaluate(e=>{e.value='80';e.dispatchEvent(new Event('change'));});
 await p.waitForFunction(b=>Number(document.querySelector('#side .row .axle').getAttribute('x2'))>b+1,{timeout:5000},before2);
 await p.click('#shaft-dialog-close');await p.waitForSelector('#shaft-dialog[hidden]',{state:'hidden'}).catch(()=>{});await wait(500);
 const count=await p.$$eval('#top [data-shaft]',e=>e.length);await p.click('#new-shaft');await p.waitForSelector('#shaft-dialog:not([hidden])');
 fr=await frame();await fr.waitForSelector('[data-add="auf:lager-608"]');await fr.click('[data-add="auf:lager-608"]');await wait(600);assert.match(await p.$eval('#shaft-dialog-title',e=>e.textContent),/Neue Welle/);
 await p.click('#shaft-dialog-close');await wait(800);assert.equal(await p.$$eval('#top [data-shaft]',e=>e.length),count+1,'neue Welle im Getriebe');assert.ok((await p.$$eval('[data-add-shaft]',e=>e.map(x=>x.textContent))).some(t=>/Neue Welle/.test(t)));
 assert.deepEqual(errors,[]);console.log('Getriebe-Editor: vom Studio erreichbar, Einrasten im Eingriff bei 45°, weg ohne Eingriff, Klick setzt kämmend, Winkel genau, Schicht-Band von Hand, Steg entfernt und Strg+Z, Neuladen, Welle per #open, Riemen weg und wieder dran, Motor mit Langlöchern, Normriemen-Abstand, Motor an die Platte, Steg außen herum, in der Tiefe und wieder gerade, Welle im Fenster bearbeitet (Getriebe zieht mit), neue Welle aus dem Fenster im Getriebe.');
}finally{await browser.close();}
