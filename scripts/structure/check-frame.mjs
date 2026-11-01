// Space frame: a cantilever matches P·L³/(3EI) in two planes; an L-frame carries a load by bending
// where a pin-jointed truss would be a mechanism.
import assert from 'node:assert/strict';
import {solveFrame,barUtilisation} from '../../src/structure/frame.ts';
import {solveTruss,PLA} from '../../src/structure/truss.ts';
const m={...PLA},r=3,L=100,A=Math.PI*r*r,I=Math.PI*r**4/4,P=10;
for(const [dir,k] of [[[0,0,1],2],[[0,1,0],1]]){
 const nodes=[{p:[0,0,0],fixed:true},{p:[50,0,0],fixed:false},{p:[100,0,0],fixed:false}],struts=[{i:0,j:1,area:A},{i:1,j:2,area:A}];
 const {us,forces}=solveFrame(nodes,struts,[[[0,0,0],[0,0,0],dir.map(x=>x*P)]],m),tip=us[0][2][k],want=P*L**3/(3*m.E*I);
 assert.ok(Math.abs(tip-want)/want<1e-3,`Durchbiegung ${tip} statt ${want}`);
 assert.ok(Math.abs(forces[0][0].M-P*L)<1e-3*P*L,`Einspannmoment ${forces[0][0].M}`);
}
// L-frame with a kink: the truss is singular-ish, the frame is not.
const nodes=[{p:[0,0,0],fixed:true},{p:[0,0,60],fixed:false},{p:[60,0,60],fixed:false}],struts=[{i:0,j:1,area:A},{i:1,j:2,area:A}];
const fr=solveFrame(nodes,struts,[[[0,0,0],[0,0,0],[0,0,-P]]],m);assert.ok(fr&&Math.abs(Math.abs(fr.us[0][2][2])-(P*60**3/(3*m.E*I)+P*60*60/(m.E*I)*60))<.5,'L-Rahmen trägt');
console.log('Rahmen: Kragarm exakt, L-Rahmen trägt über Biegung, Auslastung',barUtilisation(fr.forces[0][0],r,m).toFixed(3));
