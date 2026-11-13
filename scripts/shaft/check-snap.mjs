// Snapping on the shaft timeline: points and clips land on edges nearby, else on the grid; parts find the nearest free
// place; ticks stay readable at any zoom.
import assert from 'node:assert/strict';
import {snapPoint,snapMove,freeSpot,tickStep,toGrid} from '../../src/shaft/snap.ts';
assert.equal(toGrid(3.26,.5),3.5);assert.equal(toGrid(3.2,0),3.2);
assert.equal(snapPoint(9.7,[0,10,60],.5,.5),10,'an die Kante');assert.equal(snapPoint(8.2,[0,10,60],.5,.5),8,'sonst Raster');assert.equal(snapPoint(8.2,[10],0,0),8.2,'Alt: frei');
assert.equal(snapMove(13.6,6,[20],.5,.5),14,'Ende an die Kante');assert.equal(snapMove(20.3,6,[20],.5,.5),20,'Anfang an die Kante');assert.equal(snapMove(30.2,6,[20],.5,.5),30);
const taken=[{x0:10,x1:16},{x0:16,x1:22}];
assert.equal(freeSpot(taken,12,6,60),4,'vor die Teile');assert.equal(freeSpot(taken,19,6,60),22,'dahinter');assert.equal(freeSpot(taken,30,6,60),30,'frei bleibt');assert.equal(freeSpot([{x0:0,x1:60}],10,6,60),10,'kein Platz: bleibt');
assert.equal(freeSpot(taken,-3,6,60),0,'nicht vor das Ende');
assert.equal(tickStep(8),10);assert.equal(tickStep(40),2);assert.equal(tickStep(.5),200);
console.log('Zeitleiste: Einrasten an Kanten und im Raster, nächster freier Platz, Teilung je Zoom.');
