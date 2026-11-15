// Moving parts in the browser. Shaft generator: the example with an arm shows it on the timeline; its properties have
// length, angle and the view along the axis; the 3D model is made. Gearbox, example "Abtrieb mit Hebel": the fan and the
// arm are drawn, the slider turns the arm, the range typed at the shaft changes the fan, "Endlos drehen" makes it the full
// circle and reports the input shaft, Ctrl+Z brings the range back. Example "Schwinge": the swing arm's way, the pivot,
// the slot along the arc in the frame's upper plate; the slider swings the shaft, the 3D model follows; the swing arm's
// panel opens from its shaft, its range typed further reports what it then hits. A swing arm made by hand in the plain
// example: the frame no longer holds the pivot, which is said; dissolved, all is as before.
import puppeteer from 'puppeteer';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bewegt-')),shots=process.argv[2];
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(dir,'profil'),protocolTimeout:120000});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try{const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1500,height:1100});
 const ready=async()=>{await p.waitForFunction(()=>['ready','error'].includes(document.querySelector('#preview-state')?.dataset.state),{timeout:180000});const st=await p.$eval('#preview-state',e=>({s:e.dataset.state,t:e.textContent}));assert.equal(st.s,'ready',st.t);};
 const shot=async name=>{if(shots)await p.screenshot({path:path.join(shots,name)});};
 const prop=text=>p.evaluateHandle(t=>[...document.querySelectorAll('#properties .prop')].find(l=>l.querySelector('span')?.textContent.startsWith(t))?.querySelector('input,select'),text);
 const type=async(text,value)=>{const h=await prop(text);assert.ok(h.asElement(),`Feld ${text}`);await h.evaluate((e,v)=>{e.value=v;e.dispatchEvent(new Event('change'));},String(value));await wait(200);};
 const press=async text=>{assert.ok(await p.evaluate(t=>{const b=[...document.querySelectorAll('#properties button')].find(x=>x.textContent.startsWith(t));b?.click();return !!b;},text),`Knopf ${text}`);await wait(200);};
 const slide=async(key,value)=>{await p.$eval(`#pose input[data-pose="${key}"]`,(e,v)=>{e.value=v;e.dispatchEvent(new Event('input'));},String(value));await wait(200);};
 const issues=()=>p.$eval('#issues',e=>e.textContent);
 // ---- shaft generator: the arm ----
 await p.goto('http://localhost:4001/welle');await p.waitForSelector('body[data-ready=true] [data-example="hebel"]',{visible:true});await p.click('[data-example="hebel"]');await p.waitForSelector('#timeline .clip.arm');
 assert.ok(await p.$('#timeline .silhouette .arm'),'Hebel im Längsschnitt');await p.click('#timeline .clip.arm');await wait(150);
 assert.ok(await p.$('#properties svg.arm-view'),'Stirnansicht');const before=await p.$eval('#properties svg.arm-view polygon',e=>e.getAttribute('points'));
 await type('Winkel auf der Welle',90);assert.notEqual(await p.$eval('#properties svg.arm-view polygon',e=>e.getAttribute('points')),before,'der Winkel dreht die Ansicht');
 assert.match(await p.$eval('#properties',e=>e.textContent),/wie der Abschnitt \(jetzt D10/);await ready();await shot('welle-hebel.png');
 // ---- gearbox: an arm with a range ----
 await p.goto('http://localhost:4001/getriebe');await p.waitForSelector('body[data-ready=true] [data-example="hebel"]',{visible:true});await p.click('[data-example="hebel"]');await p.waitForSelector('#top svg .fan');
 assert.ok(await p.$('#top [data-arm="b/h"]'),'Hebel in der Draufsicht');assert.match(await p.$eval('#issues-title',e=>e.textContent),/alles passt/);
 const arm=()=>p.$eval('#top [data-arm="b/h"] polygon',e=>e.getAttribute('points')),fan=()=>p.$eval('#top .fan',e=>e.getAttribute('d'));
 const a0=await arm(),f0=await fan();assert.ok(await p.$('#pose input[data-pose="t:b"]'),'Regler für die Stellung');await slide('t:b',45);assert.notEqual(await arm(),a0,'der Regler dreht den Hebel');assert.equal(await fan(),f0,'der Fächer bleibt');await shot('getriebe-hebel.png');
 await p.click('#top [data-shaft="b"] .axle');await wait(150);assert.equal(await (await prop('dreht bis')).evaluate(e=>e.value),'45');assert.equal(await arm(),a0,'ein Griff an die Welle stellt die Grundstellung her');
 await type('dreht bis',20);assert.notEqual(await fan(),f0,'der Bereich ändert den Fächer');assert.equal(await p.$eval('#pose input[data-pose="t:b"]',e=>e.max),'20');
 await press('Endlos drehen');assert.ok(await p.$('#top .fan.endless'),'voller Kreis');assert.match(await issues(),/stößt beim Drehen an Antrieb z20/);assert.equal(await p.$('#pose input'),null);
 await p.keyboard.down('Control');await p.keyboard.press('z');await p.keyboard.up('Control');await wait(200);assert.ok(!(await p.$('#top .fan.endless')),'Strg+Z');
 await ready();
 // ---- gearbox: a swing arm ----
 await p.click('#gear-close');await p.waitForSelector('[data-example="schwinge"]',{visible:true});await p.click('[data-example="schwinge"]');await p.waitForSelector('#top svg .pivot');
 assert.ok(await p.$('#top .pivot'));assert.equal(await p.$$eval('#side [data-band]',e=>e.length),4);assert.ok(await p.$('#side [data-band="2"].tone-1'),'Schicht 3 in der Farbe der Schwinge');
 await p.click('#side [data-band="1"] .handle');await wait(150);assert.ok(await p.$('#top .hole-arc'),'Ausschnitt im Bogen in der oberen Gestellplatte');
 await p.click('#side [data-band="2"] .handle');await wait(150);assert.ok(await p.$('#top .swing-plate'),'Platte der Schwinge');
 const axle=id=>p.$eval(`#top [data-shaft="${id}"] .axle`,e=>[e.getAttribute('cx'),e.getAttribute('cy')].join());const b0=await axle('b'),g0=await axle('g');
 await slide('g:g1',45);assert.notEqual(await axle('b'),b0,'der Regler schwenkt die Welle');assert.equal(await axle('g'),g0,'das Gestell steht');await ready();await wait(500);await shot('getriebe-schwinge.png');
 if(shots){await p.$eval('#preview',e=>e.scrollIntoView());await wait(300);await p.screenshot({path:path.join(shots,'getriebe-schwinge-3d.png'),clip:await (await p.$('#preview')).boundingBox()});await p.$eval('#top',e=>e.scrollIntoView());}
 await p.evaluate(()=>document.querySelector('#pose [data-pose-reset]').click());await wait(200);assert.equal(await axle('b'),b0,'Grundstellung');
 await p.click('#top [data-shaft="b"] .axle');await wait(150);assert.match(await p.$eval('#properties',e=>e.textContent),/Sitzt auf Schwinge und schwenkt mit ihr/);await p.click('#properties [data-open-group="g1"]');await wait(150);
 assert.equal(await p.$eval('#properties h2',e=>e.textContent),'Schwinge');assert.ok(await p.$eval('#properties [data-member="b"]',e=>e.checked));assert.match(await p.$eval('#properties',e=>e.textContent),/Platten: Schicht 3, Schicht 4/);
 await type('schwenkt von',-120);assert.match(await issues(),/stößt beim Schwenken an Stütze/);assert.equal(await p.$eval('#pose input[data-pose="g:g1"]',e=>e.min),'-120');
 await p.keyboard.down('Control');await p.keyboard.press('z');await p.keyboard.up('Control');await wait(200);assert.doesNotMatch(await issues(),/stößt beim Schwenken/);
 assert.match(await p.$eval('#files',e=>e.textContent),/Schicht 4/);
 // After a reload the swing arm is still there.
 await wait(500);await p.reload();await p.waitForSelector('#top svg .pivot');
 // ---- a swing arm made by hand ----
 await p.click('#gear-close');await p.waitForSelector('[data-example="stufe"]',{visible:true});await p.click('[data-example="stufe"]');await p.waitForFunction(()=>/Eine Stufe/.test(document.querySelector('#gear-name').textContent)&&!!document.querySelector('#top [data-shaft="a"]'));const tabs=await p.$$eval('#side [data-band]',e=>e.length);
 await p.click('#top [data-shaft="a"] .axle');await wait(150);await p.click('#properties [data-new-group="frei"]');await wait(200);assert.equal(await p.$eval('#properties h2',e=>e.textContent),'Schwinge 1');assert.match(await issues(),/noch keine Welle darauf/);
 await p.click('#properties [data-member="b"]');await wait(250);assert.ok(await p.$('#top .pivot'),'Drehachse markiert');assert.match(await issues(),/ihre Drehachse Antrieb z20 ist im Gestell nicht gelagert/);
 await press('Schwinge auflösen');assert.equal(await p.$('#top .pivot'),null);assert.equal(await p.$$eval('#side [data-band]',e=>e.length),tabs);assert.doesNotMatch(await issues(),/Schwinge/);
 assert.deepEqual(errors,[]);console.log('Bewegliches im Browser: Hebel im Wellen-Editor (Zeitleiste, Stirnansicht, 3D), im Getriebe mit Fächer, Regler, Drehbereich, endlos und Strg+Z; Schwinge mit Schwenkweg, Drehachse, Ausschnitt im Bogen, Regler und 3D in der Stellung, Bereich und Meldung, Neuladen; von Hand angelegt und aufgelöst.');
}finally{await browser.close();}
