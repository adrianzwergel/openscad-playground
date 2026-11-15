// The shaft as exact solids (OpenCascade through replicad): every section extruded along x in its profile, shafts in
// it cut out from their end, the ends chamfered; adapters and spacers the same way; bought parts as plain stand-ins for
// the preview and the assembly. The same solids go to the preview, to STEP and to STL.
//
// Fits: what is made is nominal except, when printed, `play` per side: bores grow by it, non-round pieces (cross, D,
// hexagon) shrink by it, round seats stay nominal (a bearing wants them tight). At the CNC everything is nominal; the fit
// belongs to the machinist.
import {draw,drawCircle,drawRectangle,drawRoundedRectangle,drawPolysides,makeCylinder,makeBox,localGC,exportSTEP} from 'replicad';
import type {Drawing,Shape3D} from 'replicad';
import type {Plan,Sleeve} from './plan.ts';
import type {ShaftDoc} from './model.ts';
import type {Profile} from './profile.ts';
import {LEGO_ACROSS,LEGO_ARM,outer,label} from './profile.ts';
import {thread} from './din.ts';
import {involuteOutline} from '../mechanics/kinematics/generate/involute.ts';

export type CadKind='welle'|'adapter'|'huelse'|'kauf'|'platte'|'saeule'|'hebel';
/** A 4×4 matrix, column-major (as three.js keeps it). */
export type Mat=number[];
/** The original model of a bought part, for the preview: its mesh file and where it goes in the part's frame. The solid
 * beside it stays the stand-in for STEP and the checks. */
export type Asset={url:string;matrix:Mat};
export type CadPart={name:string;file:string;kind:CadKind;shape:Shape3D;color:string;/** Made, not bought: gets files. */made:boolean;asset?:Asset;/** In a gearbox: the body it moves with (a swing arm's id, '' the frame). */body?:string;/** A ball bearing. */bearing?:boolean;/** A spring between two bodies: it stretches, it moves with neither. */spring?:boolean};
/** b·a: first a, then b. */
export function matMul(b:Mat,a:Mat):Mat{const o=new Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=b[k*4+r]*a[c*4+k];return o;}
export const matMove=(v:[number,number,number]):Mat=>[1,0,0,0,0,1,0,0,0,0,1,0,v[0],v[1],v[2],1];
/** Turned `deg` about the axis through `at` along `dir` (right hand), as replicad's rotate. */
export function matTurn(deg:number,at:[number,number,number],dir:[number,number,number]):Mat{const l=Math.hypot(...dir),[x,y,z]=dir.map(v=>v/l),a=deg*Math.PI/180,c=Math.cos(a),s=Math.sin(a),t=1-c;
 const r:Mat=[t*x*x+c,t*x*y+s*z,t*x*z-s*y,0, t*x*y-s*z,t*y*y+c,t*y*z+s*x,0, t*x*z+s*y,t*y*z-s*x,t*z*z+c,0, 0,0,0,1];return matMul(matMove(at),matMul(r,matMove([-at[0],-at[1],-at[2]])));}
/** Where the original models lie: LDraw gears (mm, axis z, centred), NopSCADlib motors (flange at z 0, body below, shaft up). */
const LDRAW='./mechanics-assets/ldraw/meshes/',MOTORS='./mechanics-assets/parts/';
type Keep=<T extends {delete():void}>(v:T)=>T;

/** The profile in the YZ plane: drawing x is the world y, drawing y the world z; a D's flat looks up (+z). `grow` per side. */
export function profileDrawing(p:Profile,grow=0):Drawing{
 switch(p.kind){
  case 'rund':return drawCircle(p.d/2+grow);
  case 'd':{const r=p.d/2+grow,cut=p.d/2-p.flat+grow;return drawCircle(r).cut(drawRectangle(2*r+4,2*r).translate(0,cut+r));}
  case 'kreuz':{const a=LEGO_ACROSS+2*grow,b=LEGO_ARM+2*grow;return drawRectangle(a,b).fuse(drawRectangle(b,a)).intersect(drawCircle(a/2));}
  case 'sechskant':return drawPolysides((p.sw/2+grow)/Math.cos(Math.PI/6),6);
 }
}
const along=(keep:Keep,p:Profile,x0:number,x1:number,grow=0)=>keep(profileDrawing(p,grow).sketchOnPlane('YZ',x0).extrude(x1-x0) as Shape3D);
/** Play per side for a piece (`male`) or a bore of this profile. */
export function fitOf(doc:ShaftDoc,p:Profile,male:boolean){if(doc.making!=='druck')return 0;return male?(p.kind==='rund'?0:-doc.settings.play):doc.settings.play;}
const union=(keep:Keep,list:Shape3D[])=>list.slice(1).reduce((a,b)=>keep(a.fuse(b) as Shape3D),list[0]);
type Piece={x0:number;x1:number;profile:Profile};
/** A body from pieces along x: neighbours of the same profile become one; runs of round pieces one turned outline
 * (no boolean, chamfers drawn into it), other profiles extruded. OpenCascade's booleans leak a little memory, so as
 * few of them as possible. `chamfer`: at the body's two ends if they are round. */
function body(keep:Keep,doc:ShaftDoc,pieces:Piece[],chamfer=0){
 const runs:Piece[]=[];for(const p of [...pieces].sort((a,b)=>a.x0-b.x0)){const last=runs.at(-1);if(last&&label(last.profile)===label(p.profile)&&Math.abs(last.x1-p.x0)<1e-6)last.x1=p.x1;else runs.push({...p});}
 const start=runs[0].x0,end=runs.at(-1)!.x1,solids:Shape3D[]=[];
 for(let i=0;i<runs.length;){if(runs[i].profile.kind!=='rund'){const r=runs[i];solids.push(along(keep,r.profile,r.x0,r.x1,fitOf(doc,r.profile,true)));i++;continue;}
  const group:Piece[]=[];while(i<runs.length&&runs[i].profile.kind==='rund')group.push(runs[i++]);
  const R=(p:Piece)=>(p.profile as {d:number}).d/2,pts:[number,number][]=[[group[0].x0,0]];
  group.forEach((p,k)=>{const r=R(p),c0=k===0&&Math.abs(p.x0-start)<1e-6&&chamfer>0&&chamfer<Math.min(r/2,(p.x1-p.x0)/2)?chamfer:0,c1=k===group.length-1&&Math.abs(p.x1-end)<1e-6&&chamfer>0&&chamfer<Math.min(r/2,(p.x1-p.x0)/2)?chamfer:0;
   pts.push([p.x0,r-c0]);if(c0)pts.push([p.x0+c0,r]);if(c1)pts.push([p.x1-c1,r]);pts.push([p.x1,r-c1]);});
  pts.push([group.at(-1)!.x1,0]);let pen=draw(pts[0]);for(const q of pts.slice(1))if(Math.hypot(q[0]-pts[0][0],q[1]-pts[0][1])>1e-9)pen=pen.lineTo(q);
  solids.push(keep(pen.close().sketchOnPlane('XY').revolve([1,0,0]) as Shape3D));}
 return union(keep,solids);}

function shaftSolid(keep:Keep,doc:ShaftDoc,plan:Plan){
 let s=body(keep,doc,plan.sections,doc.settings.chamfer);
 for(const i of plan.inserts){const g=fitOf(doc,i.profile,false),x0=i.end==='links'?-1:i.x0,x1=i.end==='links'?i.x1:plan.length+1;s=keep(s.cut(along(keep,i.profile,x0,x1,g)) as Shape3D);}
 for(const t of machiningTools(keep,plan))s=keep(s.cut(t) as Shape3D);
 return s;}
/** What machining takes away, from the plan's numbers (steps the checks refused have none and are left out):
 * - set screw: the tap drill from the axis out, turned `angle` about x (0: up, towards a D shaft's flat);
 * - thread in an end face: the tap drill, `depth` deep;
 * - keyway (DIN 6885 form A): a slot with round ends, b wide, t1 deep from the top;
 * - ring groove (DIN 471): turned down to d2 over m;
 * - flat: cut `depth` from the top. */
export function machiningTools(keep:Keep,plan:Plan):Shape3D[]{
 const L=plan.length,r=(x:number)=>{const c=plan.sections.find(s=>x>=s.x0-1e-6&&x<=s.x1+1e-6);return c?outer(c.profile)/2:0;},out:Shape3D[]=[];
 for(const m of plan.machining){const w=m.work;
  if(w.kind==='madenschraube'&&m.drill){const a=(w.angle??0)*Math.PI/180;out.push(keep(makeCylinder(m.drill/2,r(w.x)+2,[w.x,0,0],[0,-Math.sin(a),Math.cos(a)])));}
  else if(w.kind==='gewinde'&&m.drill){const left=w.end==='links';out.push(keep(makeCylinder(m.drill/2,w.depth+1,[left?-1:L+1,0,0],[left?1:-1,0,0])));}
  else if(w.kind==='nut'&&m.key){const len=w.x1-w.x0,b=m.key.b,R=r((w.x0+w.x1)/2);if(len<=b)continue;out.push(keep(drawRoundedRectangle(len,b,b/2-1e-3).translate((w.x0+w.x1)/2,0).sketchOnPlane('XY',R-m.key.t1).extrude(m.key.t1+2) as Shape3D));}
  else if(w.kind==='ring'&&m.ring){const R=r(w.x)+1,h=m.ring.m/2;out.push(keep(draw([w.x-h,m.ring.d2/2]).lineTo([w.x+h,m.ring.d2/2]).lineTo([w.x+h,R]).lineTo([w.x-h,R]).close().sketchOnPlane('XY').revolve([1,0,0]) as Shape3D));}
  else if(w.kind==='abflachung'){const R=Math.max(r(w.x0),r(w.x1))+1;out.push(keep(makeBox([w.x0,-R,r((w.x0+w.x1)/2)-w.depth],[w.x1,R,R])));}}
 return out;}
function sleeveSolid(keep:Keep,doc:ShaftDoc,s:Sleeve){
 return keep(body(keep,doc,s.steps.map(st=>({x0:st.x0,x1:st.x1,profile:st.outer})),Math.min(.3,doc.settings.chamfer)).cut(along(keep,s.inner,s.x0-1,s.x1+1,fitOf(doc,s.inner,false))) as Shape3D);}
/** A bought part as a ring: its outer Ø, its bore. */
const ring=(keep:Keep,x0:number,x1:number,D:number,d:number)=>keep(keep(makeCylinder(D/2,x1-x0,[x0,0,0],[1,0,0])).cut(keep(makeCylinder(Math.max(.1,d/2),x1-x0+2,[x0-1,0,0],[1,0,0]))) as Shape3D);

/** A part that is bought or made elsewhere, as it looks, each one solid without a 3D boolean: a bearing turned from its
 * section (outer ring, the recess of the cage and balls, inner ring), a gear extruded from its involute teeth with its
 * bore, a belt pulley turned with its flanges and hub; anything else a plain ring. The flanks of the teeth have few points:
 * every face of a solid costs OpenCascade a little memory that never comes back. */
export function partSolid(keep:Keep,t:Plan['placed'][number]):Shape3D{
 const x0=t.x0,x1=t.x1,w=x1-x0,R=t.part.outer/2,r=Math.max(.1,outer(t.bore)/2);
 const turn=(pts:[number,number][])=>{let pen=draw(pts[0]);for(const q of pts.slice(1))pen=pen.lineTo(q);return keep(pen.close().sketchOnPlane('XY').revolve([1,0,0]) as Shape3D);},ring=()=>turn([[x0,r],[x1,r],[x1,R],[x0,R]]);
 if(t.part.group==='Lager'){const a=r+(R-r)*.32,b=r+(R-r)*.68,c=Math.min(w*.2,1.2);return turn([[x0,r],[x1,r],[x1,a],[x1-c,a],[x1-c,b],[x1,b],[x1,R],[x0,R],[x0,b],[x0+c,b],[x0+c,a],[x0,a]]);}
 if(t.part.pulley&&t.part.teeth){const seat=t.part.teeth/Math.PI-.25,f=1,belt=Math.min(w,6.5+2*f),flange=Math.min(R,seat+1.5),hub=Math.min(R,Math.max(r+3,6.5));if(seat<r+.6)return ring();
  return turn(belt<w-.5?[[x0,r],[x1,r],[x1,hub],[x0+belt,hub],[x0+belt,flange],[x0+belt-f,flange],[x0+belt-f,seat],[x0+f,seat],[x0+f,flange],[x0,flange]]:[[x0,r],[x1,r],[x1,flange],[x1-f,flange],[x1-f,seat],[x0+f,seat],[x0+f,flange],[x0,flange]]);}
 if(t.part.teeth){const m=t.part.module??1;if(m*(t.part.teeth/2-1.25)<r+.4)return ring();
  try{const pts=involuteOutline({module:m,teeth:t.part.teeth,samples:t.part.teeth>30?1:2});let pen=draw(pts[0]);for(const q of pts.slice(1))pen=pen.lineTo(q);return keep(pen.close().cut(profileDrawing(t.bore).rotate(t.bore.kind==='rund'?37.3:0)).sketchOnPlane('YZ',x0).extrude(w) as Shape3D);}catch{return ring();}}
 return ring();}
/** An arm in the YZ plane (drawing x: world y, drawing y: world z): hub and end disc with the bar between their outer
 * tangents, the hole at its end; turned `angle` about the axis from +z (as a set screw's angle). */
export function armDrawing(a:{length:number;width:number;angle:number;hole:number;hub:number}):Drawing{
 const r0=a.hub/2,r1=a.width/2,L=a.length;let d:Drawing=drawCircle(r0);
 if(L>Math.abs(r0-r1)+1e-6){const f=Math.acos((r0-r1)/L),on=(cy:number,r:number,s:number):[number,number]=>[s*r*Math.sin(f),cy+r*Math.cos(f)];
  d=d.fuse(drawCircle(r1).rotate(37.3).translate(0,L)).fuse(draw(on(0,r0,1)).lineTo(on(L,r1,1)).lineTo(on(L,r1,-1)).lineTo(on(0,r0,-1)).close());}
 if(a.hole>0)d=d.cut(drawCircle(a.hole/2).translate(0,L));
 return d.rotate(a.angle);}
function armSolid(keep:Keep,doc:ShaftDoc,t:Plan['placed'][number]){const a=t.arm!;
 let s=keep(keep(armDrawing(a).sketchOnPlane('YZ',t.x0).extrude(t.x1-t.x0) as Shape3D).cut(along(keep,t.bore,t.x0-1,t.x1+1,fitOf(doc,t.bore,false))) as Shape3D);
 // A round bore: the tap drill for a set screw M3 through the hub, on the side away from the arm.
 if(a.screw){const r=a.angle*Math.PI/180;s=keep(s.cut(keep(makeCylinder(thread(3)!.drill/2,a.hub/2+1,[(t.x0+t.x1)/2,0,0],[0,Math.sin(r),-Math.cos(r)]))) as Shape3D);}
 return s;}
/** All solids of a plan. `keep` registers what must be freed (localGC); without, one is made here and returned. */
export function buildParts(doc:ShaftDoc,plan:Plan,keep?:Keep):{parts:CadPart[];free:()=>void}{
 let free=()=>{};if(!keep){const [k,gc]=localGC();keep=k as Keep;free=gc;}
 const parts:CadPart[]=[];const safe=(name:string,make:()=>Shape3D)=>{try{return make();}catch(e){throw Error(`${name}: ${e instanceof Error?e.message:e}`);}};
 parts.push({name:'Welle',file:'welle',kind:'welle',shape:safe('Welle',()=>shaftSolid(keep!,doc,plan)),color:'#9aa7b1',made:true});
 plan.sleeves.forEach((s,i)=>parts.push({name:s.label,file:`${s.kind}-${i+1}`,kind:s.kind,shape:safe(s.label,()=>sleeveSolid(keep!,doc,s)),color:s.kind==='adapter'?'#e0a060':'#b98fd6',made:true}));
 for(const t of plan.placed)if(t.arm)parts.push({name:t.label,file:`hebel-${t.id}`,kind:'hebel',shape:safe(t.label,()=>armSolid(keep!,doc,t)),color:'#d98f5c',made:true});else parts.push({...(t.part.group==='Lager'?{bearing:true}:{}),...(t.part.group==='LEGO-Zahnräder'?{asset:{url:`${LDRAW}${t.part.id.replace(/^lego-/,'')}.stl`,matrix:matMul(matMove([(t.x0+t.x1)/2,0,0]),matTurn(90,[0,0,0],[0,1,0]))}}:{}),name:t.label,file:t.id,kind:'kauf',shape:safe(t.label,()=>partSolid(keep!,t)),color:t.part.group==='Lager'?'#aeb9c4':t.part.pulley?'#d9c06a':t.part.group==='LEGO-Zahnräder'?'#c9ced3':t.part.teeth?'#6fc6a6':'#9fb0bd',made:false});
 // A motor: its body with rounded edges and the centring boss on its flange.
 for(const m of plan.motors??[]){const w=m.part.size[0],left=m.end==='links';let shape=keep(drawRoundedRectangle(w,w,Math.min(4,w/8)).sketchOnPlane('YZ',m.x0).extrude(m.x1-m.x0) as Shape3D);
  if(m.part.pilot)try{shape=keep(shape.fuse(keep(makeCylinder(m.part.pilot/2,2,[m.face,0,0],[left?1:-1,0,0]))) as Shape3D);}catch{/* the body alone */}
  // The original: its z (shaft up from the flange) along the shaft, towards it.
  const asset:Asset={url:`${MOTORS}${m.part.id}.stl`,matrix:matMul(matMove([m.face,0,0]),matTurn(left?90:-90,[0,0,0],[0,1,0]))};
  parts.push({name:m.label,file:`motor-${m.id}`,kind:'kauf',shape,color:'#56606b',made:false,asset});}
 // Retaining rings: a flat ring in their groove, from the groove's Ø to the ring's body.
 for(const m of plan.machining){const w=m.work;if(w.kind!=='ring'||!m.ring)continue;const t=Math.max(.3,m.ring.m-.1),a=m.ring.d2/2,b=m.ring.body/2;
  parts.push({name:m.ring.label,file:`ring-${w.id}`,kind:'kauf',shape:keep(draw([w.x-t/2,a]).lineTo([w.x+t/2,a]).lineTo([w.x+t/2,b]).lineTo([w.x-t/2,b]).close().sketchOnPlane('XY').revolve([1,0,0]) as Shape3D),color:'#b8bfc6',made:false});}
 for(const i of plan.inserts){const len=i.part.length??(i.x1-i.x0)+12,x0=i.end==='links'?i.x1-len:i.x0,x1=i.end==='links'?i.x1:i.x0+len;parts.push({name:`${i.label} (${label(i.profile)})`,file:i.id,kind:'kauf',shape:along(keep,i.profile,x0,x1),color:'#e0c56c',made:false});}
 return {parts,free};}

export type MeshData={asset?:Asset;body?:string;spring?:boolean;name:string;kind:CadKind;color:string;vertices:Float32Array;normals:Float32Array;triangles:Uint32Array;edges:Float32Array};
export function meshParts(parts:CadPart[]):MeshData[]{
 return parts.map(p=>{const m=p.shape.mesh({tolerance:.02,angularTolerance:8}),e=p.shape.meshEdges({tolerance:.02,angularTolerance:8});
  return {...(p.asset?{asset:p.asset}:{}),...(p.body!==undefined?{body:p.body}:{}),...(p.spring?{spring:true}:{}),name:p.name,kind:p.kind,color:p.color,vertices:new Float32Array(m.vertices),normals:new Float32Array(m.normals),triangles:new Uint32Array(m.triangles),edges:new Float32Array(e.lines)};});}
/** STEP and STL of every made part, and the assembly with the bought parts as one STEP. */
export async function exportParts(parts:CadPart[]){
 const files:{name:string;data:ArrayBuffer}[]=[];
 // Parts of one file (the columns of a gap) are written once.
 const seen=new Set<string>();for(const p of parts.filter(x=>x.made)){if(seen.has(p.file))continue;seen.add(p.file);files.push({name:`${p.file}.step`,data:await p.shape.blobSTEP().arrayBuffer()},{name:`${p.file}.stl`,data:await p.shape.blobSTL({tolerance:.01,angularTolerance:5,binary:true}).arrayBuffer()});}
 files.push({name:'baugruppe.step',data:await exportSTEP(parts.map(p=>({shape:p.shape,name:p.name,color:p.color}))).arrayBuffer()});
 return files;}
