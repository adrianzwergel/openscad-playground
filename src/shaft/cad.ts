// The shaft as exact solids (OpenCascade through replicad): every section extruded along x in its profile, shafts in
// it cut out from their end, the ends chamfered; adapters and spacers the same way; bought parts as plain stand-ins for
// the preview and the assembly. The same solids go to the preview, to STEP and to STL.
//
// Fits: what is made is nominal except, when printed, `play` per side: bores grow by it, non-round pieces (cross, D,
// hexagon) shrink by it, round seats stay nominal (a bearing wants them tight). At the CNC everything is nominal; the fit
// belongs to the machinist.
import {draw,drawCircle,drawRectangle,drawPolysides,makeCylinder,localGC,exportSTEP} from 'replicad';
import type {Drawing,Shape3D} from 'replicad';
import type {Plan,Sleeve} from './plan.ts';
import type {ShaftDoc} from './model.ts';
import type {Profile} from './profile.ts';
import {LEGO_ACROSS,LEGO_ARM,outer,label} from './profile.ts';

export type CadKind='welle'|'adapter'|'huelse'|'kauf';
export type CadPart={name:string;file:string;kind:CadKind;shape:Shape3D;color:string;/** Made, not bought: gets files. */made:boolean};
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
 return s;}
function sleeveSolid(keep:Keep,doc:ShaftDoc,s:Sleeve){
 return keep(body(keep,doc,s.steps.map(st=>({x0:st.x0,x1:st.x1,profile:st.outer})),Math.min(.3,doc.settings.chamfer)).cut(along(keep,s.inner,s.x0-1,s.x1+1,fitOf(doc,s.inner,false))) as Shape3D);}
/** A bought part as a ring: its outer Ø, its bore. */
const ring=(keep:Keep,x0:number,x1:number,D:number,d:number)=>keep(keep(makeCylinder(D/2,x1-x0,[x0,0,0],[1,0,0])).cut(keep(makeCylinder(Math.max(.1,d/2),x1-x0+2,[x0-1,0,0],[1,0,0]))) as Shape3D);

/** All solids of a plan. `keep` registers what must be freed (localGC); without, one is made here and returned. */
export function buildParts(doc:ShaftDoc,plan:Plan,keep?:Keep):{parts:CadPart[];free:()=>void}{
 let free=()=>{};if(!keep){const [k,gc]=localGC();keep=k as Keep;free=gc;}
 const parts:CadPart[]=[];const safe=(name:string,make:()=>Shape3D)=>{try{return make();}catch(e){throw Error(`${name}: ${e instanceof Error?e.message:e}`);}};
 parts.push({name:'Welle',file:'welle',kind:'welle',shape:safe('Welle',()=>shaftSolid(keep!,doc,plan)),color:'#9aa7b1',made:true});
 plan.sleeves.forEach((s,i)=>parts.push({name:s.label,file:`${s.kind}-${i+1}`,kind:s.kind,shape:safe(s.label,()=>sleeveSolid(keep!,doc,s)),color:s.kind==='adapter'?'#e0a060':'#b98fd6',made:true}));
 for(const t of plan.placed)parts.push({name:t.label,file:t.id,kind:'kauf',shape:ring(keep,t.x0,t.x1,t.part.outer,outer(t.bore)),color:t.part.group==='Lager'?'#6fa4c6':'#6fc6a6',made:false});
 for(const i of plan.inserts){const len=i.part.length??(i.x1-i.x0)+12,x0=i.end==='links'?i.x1-len:i.x0,x1=i.end==='links'?i.x1:i.x0+len;parts.push({name:`${i.label} (${label(i.profile)})`,file:i.id,kind:'kauf',shape:along(keep,i.profile,x0,x1),color:'#e0c56c',made:false});}
 return {parts,free};}

export type MeshData={name:string;kind:CadKind;color:string;vertices:Float32Array;normals:Float32Array;triangles:Uint32Array;edges:Float32Array};
export function meshParts(parts:CadPart[]):MeshData[]{
 return parts.map(p=>{const m=p.shape.mesh({tolerance:.02,angularTolerance:8}),e=p.shape.meshEdges({tolerance:.02,angularTolerance:8});
  return {name:p.name,kind:p.kind,color:p.color,vertices:new Float32Array(m.vertices),normals:new Float32Array(m.normals),triangles:new Uint32Array(m.triangles),edges:new Float32Array(e.lines)};});}
/** STEP and STL of every made part, and the assembly with the bought parts as one STEP. */
export async function exportParts(parts:CadPart[]){
 const files:{name:string;data:ArrayBuffer}[]=[];
 for(const p of parts.filter(x=>x.made)){files.push({name:`${p.file}.step`,data:await p.shape.blobSTEP().arrayBuffer()},{name:`${p.file}.stl`,data:await p.shape.blobSTL({tolerance:.01,angularTolerance:5,binary:true}).arrayBuffer()});}
 files.push({name:'baugruppe.step',data:await exportSTEP(parts.map(p=>({shape:p.shape,name:p.name,color:p.color}))).arrayBuffer()});
 return files;}
