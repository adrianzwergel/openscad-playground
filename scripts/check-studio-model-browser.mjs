// Target mechanism from a 3D model: import an OBJ robot, form links, detect axes from clicked cylinders,
// move each axis live with its slider.
import puppeteer from 'puppeteer';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import * as THREE from 'three';import {OBJExporter} from 'three/addons/exporters/OBJExporter.js';
// Robot: base, turntable (axis z), shoulder hub (axis x at height 85), upper arm.
const scene=new THREE.Scene(),mesh=(name,g)=>{const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial());m.name=name;scene.add(m);return m;};
mesh('Sockel',new THREE.BoxGeometry(120,120,30)).position.set(0,0,15);
const table=new THREE.CylinderGeometry(40,40,30,64);table.rotateX(Math.PI/2);mesh('Drehteller',table).position.set(0,0,45);
const hub=new THREE.CylinderGeometry(25,25,50,64);hub.rotateZ(Math.PI/2);mesh('Schulter',hub).position.set(0,0,85);
mesh('Oberarm',new THREE.BoxGeometry(30,30,200)).position.set(0,0,210);
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'robot-')),file=path.join(dir,'roboter.obj');scene.updateMatrixWorld(true);await fs.writeFile(file,new OBJExporter().parse(scene));
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
try{const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1440,height:1000});
 await p.goto('http://localhost:4001/studio');await p.waitForSelector('canvas');await p.evaluate(()=>localStorage.removeItem('mechanics-studio'));await p.reload();await p.waitForSelector('canvas');
 const status=()=>p.$eval('#status',e=>e.textContent),text=sel=>p.$eval(sel,e=>e.textContent);
 await(await p.$('#model-file')).uploadFile(file);await p.waitForFunction(()=>/Modell geladen: 4 Teile/.test(document.querySelector('#status').textContent),{timeout:30000});
 await p.waitForFunction(()=>document.querySelectorAll('.part-row').length===4,{timeout:30000});
 // Links: glied1 = turntable + shoulder, glied2 = upper arm.
 const addLink=async n=>{await p.evaluate(()=>document.querySelector('[data-add-link]').click());await p.waitForFunction(n=>document.querySelector('.part-row select')?.options.length===n,{},n);};
 await addLink(2);await addLink(3);
 const assign=async(part,link)=>{await p.evaluate((part,link)=>{const row=[...document.querySelectorAll('.part-row')].find(r=>r.querySelector('.part-name').textContent.endsWith(part));const s=row.querySelector('select');s.value=link;s.dispatchEvent(new Event('change'));},part,link);
  await p.waitForFunction((part,link)=>[...document.querySelectorAll('.part-row')].find(r=>r.querySelector('.part-name').textContent.endsWith(part))?.querySelector('select').value===link,{},part,link);};
 await assign('Drehteller','glied1');await assign('Schulter','glied1');await assign('Oberarm','glied2');
 // Axis 1: ground → glied1 from the turntable cylinder.
 const openTree=label=>p.evaluate(label=>[...document.querySelectorAll('#tree button')].find(b=>b.textContent.includes(label)).click(),label);
 const field=(label,value)=>p.evaluate((label,value)=>{const l=[...document.querySelectorAll('#properties label')].find(x=>x.textContent.startsWith(label));const s=l.querySelector('select');s.value=value;s.dispatchEvent(new Event('change'));},label,value);
 const pick=(part,local)=>p.evaluate((part,local)=>window.dispatchEvent(new CustomEvent('studio-pick',{detail:{part,local}})),part,local);
 await openTree('Achse anlegen');await field('Glied A','ground');await field('Glied B','glied1');
 await p.click('[data-axis-tool="cylinder"]');await pick('Drehteller',[40,0,45]);
 await p.waitForFunction(()=>/achse1 angelegt/.test(document.querySelector('#status').textContent),{timeout:10000});assert.match(await status(),/Zylinder r=40\.0/);
 // Axis 2: glied1 → glied2 from the shoulder hub (axis along x at height 85).
 await openTree('Achse anlegen');await field('Glied A','glied1');await field('Glied B','glied2');
 await p.click('[data-axis-tool="cylinder"]');await pick('Schulter',[5,0,110]);
 await p.waitForFunction(()=>/achse2 angelegt/.test(document.querySelector('#status').textContent),{timeout:10000});assert.match(await status(),/Zylinder r=25\.0/);
 assert.match(await text('#properties'),/Richtung \(-?1\.000, -?0\.000, -?0\.000\)/,'shoulder axis along x');
 // Live sliders: axis 2 tilts the upper arm about x, axis 1 turns the whole arm about z.
 await p.waitForSelector('#axes input[data-axis="achse1"]');assert.equal(await p.$$eval('#axes input[type=range]',r=>r.length),2);
 const slide=(axis,v)=>p.evaluate((axis,v)=>{const r=document.querySelector('#axes-report');if(r)delete r.dataset.state;const s=document.querySelector(`#axes input[data-axis="${axis}"]`);s.value=String(v);s.dispatchEvent(new Event('input'));},axis,v);
 const frames=async()=>{await p.waitForFunction(()=>document.querySelector('#axes-report')?.dataset.state==='ok',{timeout:10000});return JSON.parse(await p.$eval('#axes-report',e=>e.dataset.frames));};
 await slide('achse2',90);let f=await frames();
 assert.ok(Math.abs(Math.abs(f.glied2[1])-85)<.5&&Math.abs(f.glied2[2]-85)<.5,'upper arm tilts about the shoulder: '+JSON.stringify(f.glied2));
 await slide('achse1',90);f=await frames();
 assert.ok(Math.abs(Math.abs(f.glied2[0])-85)<.5&&Math.abs(f.glied2[1])<.5,'turntable carries the arm about z: '+JSON.stringify(f.glied2));
 assert.deepEqual(f.ground,[0,0,0]);
 // Persisted with the project; the model comes back from the browser database.
 await p.click('#save');await p.reload();await p.waitForSelector('canvas');await p.evaluate(()=>document.querySelector('[data-mechanism]').click());
 await p.waitForFunction(()=>document.querySelectorAll('#axes input[type=range]').length===2&&document.querySelectorAll('.part-row').length===4,{timeout:30000});
 assert.deepEqual(errors,[]);console.log('Studio model: OBJ robot imported, links formed, two axes detected from cylinders, sliders move the arm live, persisted.');
}finally{await browser.close();await fs.rm(dir,{recursive:true,force:true});}
