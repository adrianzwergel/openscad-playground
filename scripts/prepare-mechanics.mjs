import fs from 'node:fs/promises';
import JSZip from 'jszip';
const wasmUrl = JSON.parse(await fs.readFile('libs-config.json', 'utf8')).wasmBuild.url;
const boslCommit = '9eb555a08f38cabb8a6c9761d18ec7517c36321c';
await fs.mkdir('public/mechanics-assets', {recursive:true});
await fs.mkdir('src/wasm', {recursive:true});
async function archive(url) {
  const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return JSZip.loadAsync(await r.arrayBuffer());
}
const wasm = await archive(wasmUrl);
for (const name of ['openscad.js', 'openscad.wasm']) {
  const entry = Object.values(wasm.files).find(f => !f.dir && f.name.split('/').pop() === name);
  if (!entry) throw new Error(`Missing ${name}`);
  await fs.writeFile(`src/wasm/${name}`, await entry.async('nodebuffer'));
}
const bosl = await archive(`https://codeload.github.com/BelfrySCAD/BOSL2/zip/${boslCommit}`);
const sources = {};
for (const f of Object.values(bosl.files)) {
  const name = f.name.split('/').slice(1).join('/');
  if (!f.dir && (name.endsWith('.scad') || name === 'LICENSE')) sources[name] = await f.async('string');
}
await fs.writeFile('public/mechanics-assets/bosl.json', JSON.stringify(sources));
await fs.cp('node_modules/swipl-wasm/dist/swipl', 'public/mechanics-assets/swipl', {recursive:true});
await fs.copyFile('node_modules/swipl-wasm/LICENSE.txt','public/mechanics-assets/swipl/LICENSE.txt');
console.log('Prepared pinned OpenSCAD, BOSL2 and SWI-Prolog assets.');
