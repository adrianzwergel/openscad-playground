// Conjugate pitch curves on fixed axes and the pitch checks.
import assert from 'node:assert/strict';
import {curve,toPolar} from '../../src/mechanics/kinematics/curves.ts';
import {conjugate,pitchChecks} from '../../src/mechanics/kinematics/conjugate.ts';
import {TAU} from '../../src/mechanics/kinematics/math.ts';

const close=(a,b,tol,what)=>assert.ok(Math.abs(a-b)<=tol,`${what}: ${a} vs ${b}`);
const state=(checks,id)=>checks.find(c=>c.id===id)?.state;

// Circle 20 at 1:1 → centre distance 40 and a circle 20; circle 10 with b turning half → centre distance 30, mate 20.
{const c=conjugate(curve({kind:'circle',r:20}),{p:1,q:1});close(c.centerDistance,40,1e-9,'circle 1:1 centre distance');c.mate.samples.forEach(r=>close(r,20,1e-9,'mate radius'));close(c.closureError,0,1e-9,'closure');
 const d=conjugate(curve({kind:'circle',r:10}),{p:1,q:2});close(d.centerDistance,30,1e-9,'circle 1:2 centre distance');d.mate.samples.forEach(r=>close(r,20,1e-9,'mate radius'));
 const e=conjugate(curve({kind:'circle',r:30}),{p:3,q:1});close(e.centerDistance,40,1e-9,'circle 3:1 centre distance');e.mate.samples.forEach(r=>close(r,10,1e-9,'mate radius'));}

// Ellipse about a focus at 1:1 → identical ellipse, centre distance 2a.
{const a=30,e=.3,p=a*(1-e*e),ell=curve({kind:'polar',samples:Array.from({length:360},(_,i)=>p/(1+e*Math.cos(TAU*i/360)))});
 const c=conjugate(ell,{p:1,q:1});close(c.centerDistance,2*a,2e-4,'ellipse centre distance');close(c.closureError,0,1e-3,'ellipse closure');
 // The mate is the same ellipse rotated by π: r_b(ψ) = p/(1 − e cos ψ).
 c.mate.samples.forEach((r,k)=>close(r,p/(1-e*Math.cos(TAU*k/360)),2e-3,'ellipse mate radius '+k));}

// Rounded triangle at 1:1 closes; its mate is star shaped and has three lobes.
{const tri=curve({kind:'polyline',points:[[40,0],[-20,34.641],[-20,-34.641]],closed:true,cornerRadius:14});
 const c=conjugate(tri,{p:1,q:1});assert.ok(c.closureError<1e-3,'triangle closure '+c.closureError);
 const mate=curve(c.mate);close(mate.length,tri.length,tri.length*2e-3,'equal perimeters at 1:1');
 const lobes=c.mate.samples.filter((r,i,a)=>r>a[(i-1+a.length)%a.length]&&r>=a[(i+1)%a.length]).length;assert.equal(lobes,3,'three lobes');
 assert.ok(c.centerDistance>Math.max(...c.mate.samples)&&c.centerDistance>40,'centre distance exceeds both radii');}

// A ratio the shape cannot close reports a closure error instead of silently producing a curve.
{const a=30,e=.3,p=a*(1-e*e),ell=curve({kind:'polar',samples:Array.from({length:360},(_,i)=>p/(1+e*Math.cos(TAU*i/360)))});
 const c=conjugate(ell,{p:2,q:1});assert.ok(c.closureError>1,'two turns per turn needs twofold symmetry: '+c.closureError);}

// Pitch checks: involute on a 20-tooth circle passes; a tight corner fails curvature; the ellipse slope is reported.
{const inv={kind:'involute',module:2,pressureAngle:20,backlash:.15};
 const ok=pitchChecks(curve({kind:'circle',r:20}),inv);assert.equal(state(ok,'pitch/star'),'pass');assert.equal(state(ok,'pitch/curvature'),'pass');assert.equal(state(ok,'pitch/slope'),'pass');
 const tight=pitchChecks(curve({kind:'polyline',points:[[40,0],[-20,34.641],[-20,-34.641]],closed:true,cornerRadius:5}),inv);assert.equal(state(tight,'pitch/curvature'),'fail');
 const roomy=pitchChecks(curve({kind:'polyline',points:[[40,0],[-20,34.641],[-20,-34.641]],closed:true,cornerRadius:9}),inv,{profileShift:true});assert.equal(state(roomy,'pitch/curvature'),'pass');
 const steep=pitchChecks(curve({kind:'polar',samples:Array.from({length:360},(_,i)=>20/(1+.5*Math.cos(TAU*i/360)))}),inv);assert.equal(state(steep,'pitch/slope'),'fail');
 const rack=pitchChecks(curve({kind:'line',length:100}),inv);assert.equal(state(rack,'pitch/curvature'),'pass');assert.equal(state(rack,'pitch/star'),undefined);
 assert.equal(toPolar(curve({kind:'circle',r:5})).samples.length,360);}

console.log('Kinematics conjugate: circles, focal ellipse, rounded triangle, closure error and pitch checks passed.');
