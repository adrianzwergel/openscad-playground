import {adopted} from './adopted.mjs';
const {mechanism:m,drives}=await adopted(process.argv[2]??'robot');
for(const b of m.bodies)console.log('B',b.id,b.shaft?JSON.stringify(b.shaft):'',b.display?.kind??'');
for(const j of m.joints)console.log('J',j.id,j.joint.kind,j.a.body,'->',j.b.body,JSON.stringify(j.a.local.position.map(n=>+n.toFixed(1))));
for(const e of m.elements)console.log('E',e.id,e.source.kind,e.mounts[0].body,JSON.stringify(e.mounts[0].pose.position.map(n=>+n.toFixed(1))),'r',e.envelope.radius,e.envelope.min,e.envelope.max,e.surfaces[0]?.pitch.kind??'-');
