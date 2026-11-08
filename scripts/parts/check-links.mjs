// Connections of a build: a part turns about one of its axes through a pivot, a plate slides along one, inside their
// range; what is connected to them goes along, through chains of connections; a part cannot hang on what hangs on it;
// the file keeps the connections and refuses broken ones.
import assert from 'node:assert/strict';
import {partById} from '../../src/mechanics/parts/catalog.ts';
import {newItem,newBuild,newPlateNode,parseBuild,standing} from '../../src/mechanics/parts/build.ts';
import {bodyFrames,itemBody,plateBody,hangsOn,jointMove} from '../../src/mechanics/parts/links.ts';
const near=(a,e,what)=>assert.ok(Math.hypot(...a.map((v,i)=>v-e[i]))<1e-6,`${what}: ${a} statt ${e}`);
const b={...newBuild('l','Verbindungen'),plates:[{...newPlateNode('schlitten'),free:{frame:{position:[0,0,0],rotation:[0,0,0,1]},joint:{kind:'schieben',axis:'x',min:0,max:100,input:{drive:'nema17'}}}}]};
// An arm on the world turning about Z through a pivot 50 mm beside it; a sensor at its tip, a motor on the sledge.
b.items.push({...newItem('arm',partById('rpi4'),[0,0]),free:{frame:{position:[0,200,0],rotation:[0,0,0,1]},joint:{kind:'drehen',axis:'z',at:[-50,200,0],min:-90,max:90}}},
 {...newItem('geber',partById('d1-mini'),[0,0]),free:{frame:{position:[100,0,10],rotation:[0,0,0,1]},body:itemBody('arm')}},
 {...newItem('motor',partById('nema17-40'),[0,0]),free:{frame:{position:[20,0,5],rotation:[0,0,0,1]},body:plateBody('schlitten')}});
let f=bodyFrames(b,{},{});near(f[itemBody('geber')].position,[100,200,10],'Ruhe');
f=bodyFrames(b,{},{[itemBody('arm')]:90,[plateBody('schlitten')]:40});
near(f[itemBody('arm')].position,[-50,250,0],'Arm um seinen Drehpunkt (gegen den Uhrzeigersinn)');near(f[itemBody('geber')].position,[-50,350,10],'Geber fährt mit');near(f[itemBody('motor')].position,[60,0,5],'Motor auf dem Schlitten');
near(standing(b,b.items[1],f).position,[-50,350,10],'Prüfungen sehen dieselbe Lage');
// Inside the range only.
near(bodyFrames(b,{},{[plateBody('schlitten')]:500})[plateBody('schlitten')].position,[100,0,0],'bis zum Ende des Bereichs');near(jointMove(b.items[0].free.joint,-200).position,jointMove(b.items[0].free.joint,-90).position,'Drehen am Anschlag');
// No loops: the arm cannot hang on its sensor.
assert.ok(hangsOn(b,itemBody('arm')).has(itemBody('geber')));assert.ok(!hangsOn(b,itemBody('geber')).has(plateBody('schlitten')));
// The file keeps them; a broken connection is refused.
const back=parseBuild(JSON.parse(JSON.stringify(b)));assert.deepEqual(back.items[0].free.joint,b.items[0].free.joint);assert.equal(back.plates[0].free.joint.input.drive,'nema17');
const bad=JSON.parse(JSON.stringify(b));bad.items[0].free.joint.min=10;bad.items[0].free.joint.max=0;assert.throws(()=>parseBuild(bad),/Verbindung/);
console.log('Verbindungen: Arm dreht um seinen Drehpunkt, Geber fährt mit, Motor auf dem Schlitten, Bereich begrenzt, keine Schleifen, Datei geprüft.');
