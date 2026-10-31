import numpy as np, pathlib
D=pathlib.Path('public/mechanics-assets/ldraw/meshes')
def mesh(id):
 data=(D/(id+'.stl')).read_bytes();n=int.from_bytes(data[80:84],'little');t=np.ndarray((n,),dtype=np.dtype([('norm','<f4',(3,)),('v','<f4',(3,3)),('a','<u2')]),buffer=data,offset=84)['v'].astype(float)
 return t
ray=np.array([1,.371,.241]);ray/=np.linalg.norm(ray)
def contains(t,pts):
 a=t[:,0];e1=t[:,1]-a;e2=t[:,2]-a;h=np.cross(ray,e2);det=np.einsum('ij,ij->i',e1,h);f=np.divide(1.,det,out=np.zeros_like(det),where=abs(det)>1e-10);results=[]
 for start in range(0,len(pts),24):
  s=pts[start:start+24,None,:]-a;u=np.einsum('pij,ij->pi',s,h)*f;q=np.cross(s,e1);v=np.einsum('pij,j->pi',q,ray)*f;dist=np.einsum('pij,ij->pi',q,e2)*f
  results.extend(np.sum((abs(det)>1e-10)&(u>=0)&(v>=0)&(u+v<=1)&(dist>1e-6),axis=1)%2==1)
 return np.array(results)
def rz(a):
 a=np.deg2rad(a);return np.array([[np.cos(a),-np.sin(a),0],[np.sin(a),np.cos(a),0],[0,0,1]])
rx=np.array([[1,0,0],[0,0,-1],[0,1,0]])
def overlap(a,b,step=.35):
 lo=np.maximum(a.min((0,1)),b.min((0,1)));hi=np.minimum(a.max((0,1)),b.max((0,1)));pts=np.stack(np.meshgrid(*[np.arange(lo[i]+.13,hi[i],step) for i in range(3)],indexing='ij'),-1).reshape(-1,3);inner=pts[contains(a,pts)];return contains(b,inner).sum()*step**3
if __name__=='__main__':
 # Independent surface sampling of the imported purchase meshes. This catches
 # wrong axes, phase signs and gross overlaps; it is not a tooth-fit certificate.
 for first,second,za,zb in [('32270','32270',12,12),('32270','32269',12,20),('32269','32498',20,36),('46372','32498',28,36),('32498','32498',36,36)]:
  volumes=[]
  for angle in [0,180/za,360/za]:
   a=mesh(first)@rz(angle).T;b=mesh(second)@rz(180/zb-angle*za/zb).T@rx.T+[0,za/2+2,zb/2+2];volumes.append(overlap(a,b,.4))
  assert max(volumes)<4,(first,second,volumes)
  print('Bevel nominal mesh residual mm3:',first,second,[round(v,3) for v in volumes])
 a=mesh('32270');wrong=mesh('32270')@rz(15).T@rx.T+[0,6,6];assert overlap(a,wrong) > 15
 ry=np.array([[0,0,-1],[0,1,0],[1,0,0]])
 for id,r,gamma in [('4716',4,45),('32905',4,45),('15457',4,0),('27938',6,180)]:
  volumes=[]
  for angle in [0,90,180,270]:
   a=mesh(id)@rz(angle).T;b=mesh('3648b')@rz((gamma+angle)/24).T@ry.T+[0,-(12+r),0];volumes.append(overlap(a,b,.3))
  assert max(volumes)<.8,(id,volumes)
  print('Worm full-turn mesh residual mm3:',id,[round(v,3) for v in volumes])
 # Reversing the driving sense must fail this independent mesh regression.
 a=mesh('4716')@rz(90).T;wrong=mesh('3648b')@rz((45-90)/24).T@ry.T+[0,-16,0];assert overlap(a,wrong)>10
