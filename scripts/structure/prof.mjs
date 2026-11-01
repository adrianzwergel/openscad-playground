import {generateStructure} from '../../src/structure/generate.ts';
import {surfaceNets} from '../../src/structure/mesh.ts';
import {toward} from '../../src/structure/vec.ts';
const ball=[0,0,60],R=25;let t=performance.now(),last='';
const spec={id:'halter',clearance:p=>Math.hypot(p[0]-ball[0],p[1]-ball[1],p[2]-ball[2])-R,settings:JSON.parse(process.argv[2]??'{}'),anchors:[
 {id:'fuss',role:'support',frame:{position:[0,0,0],rotation:[1,0,0,0]},feature:{kind:'pad',width:60,depth:40,thickness:5,holes:[[-20,0],[20,0]],hole:4.5}},
 {id:'lager1',role:'load',frame:{position:[-40,0,120],rotation:toward([0,1,0])},feature:{kind:'bearing',d:5,D:16,B:5,fit:.15,wall:2.5,open:1}},
 {id:'lager2',role:'load',frame:{position:[40,0,120],rotation:toward([0,1,0])},feature:{kind:'bearing',d:5,D:16,B:5,fit:.15,wall:2.5,open:-1}},
 {id:'motor',role:'load',frame:{position:[70,30,40],rotation:toward([1,0,0])},feature:{kind:'flange',size:42.3,pilot:22,spacing:31,hole:3.4,thickness:5}},
]};
const r=await generateStructure(spec,(s,f)=>{if(s!==last){const n=performance.now();console.log(last,((n-t)/1000).toFixed(2));t=n;last=s;}});
const edges=new Map();const ix=r.mesh.indices;for(let i=0;i<ix.length;i+=3)for(let e=0;e<3;e++){const a=ix[i+e],b=ix[i+(e+1)%3],k=a<b?a+','+b:b+','+a;edges.set(k,(edges.get(k)??0)+1);}
const hist={};for(const c of edges.values())hist[c]=(hist[c]??0)+1;console.log(hist,r.report.struts,r.report.mass.toFixed(0));
import {render} from './render.mjs';import {soup} from '../../src/structure/mesh.ts';
// The keep-out ball as a coarse mesh for orientation.
const ballMesh=[];for(let i=0;i<24;i++)for(let j=0;j<12;j++){const P=(a,b)=>[ball[0]+R*Math.sin(b)*Math.cos(a),ball[1]+R*Math.sin(b)*Math.sin(a),ball[2]+R*Math.cos(b)];const a0=i/24*2*Math.PI,a1=(i+1)/24*2*Math.PI,b0=j/12*Math.PI,b1=(j+1)/12*Math.PI;ballMesh.push(...P(a0,b0),...P(a1,b0),...P(a1,b1),...P(a0,b0),...P(a1,b1),...P(a0,b1));}
render(process.env.PNG,[{positions:soup(r.mesh),color:[110,210,190]},{positions:Float32Array.from(ballMesh),color:[200,90,90]}],[{azimuth:-30,elevation:20},{azimuth:60,elevation:15},{azimuth:0,elevation:85}],420);
