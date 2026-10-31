"""Reproducible subset of the official LDraw library; retain source headers/licenses."""
import pathlib, zipfile, tempfile, json, re, hashlib, urllib.request, sys
root=pathlib.Path(__file__).resolve().parents[1]
archive=pathlib.Path(tempfile.gettempdir())/'mechanics-ldraw-complete.zip'
url='https://library.ldraw.org/library/updates/complete.zip?download=1'
if not archive.exists():
 with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})) as r: archive.write_bytes(r.read())
z=zipfile.ZipFile(archive); files={n.lower():n for n in z.namelist()}; out=root/'public/mechanics-assets/ldraw';out.mkdir(parents=True,exist_ok=True)
previous=json.loads((out/'manifest.json').read_text(encoding='utf-8')) if (out/'manifest.json').exists() else {}
archive_hash=hashlib.sha256(archive.read_bytes()).hexdigest()
if previous.get('archiveSha256') not in [None,archive_hash] and '--update' not in sys.argv:
 raise SystemExit('Archive differs from pinned manifest. Review a library update first, then use --update.')
model_ids={p['id']:p['model'] for p in previous.get('parts',[])}
next_model=max(model_ids.values(),default=0)+1
def read(n): return z.read(files[n.lower()])
def text(n):
 b=read(n)
 try:return b.decode('utf-8-sig')
 except UnicodeDecodeError:return b.decode('cp1252')
selected=[]
for n in sorted(files):
 if not n.startswith('ldraw/parts/') or n.count('/')!=2 or not n.endswith('.dat'):continue
 title=text(n).splitlines()[0][2:]
 # Shape variants included; print/sticker variants and gearbox housings excluded.
 if re.search(r'[pd]\d+\.dat$',n):continue
 if re.match(r'Technic (Gear (?!Box|Block)|Worm Gear|Turntable)',title):selected.append((n,title))
used=set()
def copy(n):
 n=n.lower()
 if n in used:return
 used.add(n);data=read(n);path=out/n.removeprefix('ldraw/');path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
 for line in text(n).splitlines():
  tokens=line.split()
  if tokens and tokens[0]=='1' and len(tokens)>=15:
   ref=' '.join(tokens[14:]).replace('\\','/').lower()
   target=next((x for x in ['ldraw/parts/'+ref,'ldraw/p/'+ref,'ldraw/'+ref] if x in files),None)
   if not target:raise ValueError((n,ref))
   copy(target)
entries=[]
# Conservative automatic search release: cross-bore spur and double-bevel gears, parallel-axis meshing only.
search_ids={'3647','10928','11955','4019','94925','3648a','3648b','3649','69778','69779','32270','32269','32498','18575','46372'}
for i,(n,title) in enumerate(selected):
 copy(n);lines=text(n).splitlines();pid=pathlib.Path(n).stem
 teeth=re.search(r'(\d+) (?:Tooth|Teeth)',title)
 if pid not in model_ids:model_ids[pid]=next_model;next_model+=1
 entries.append({'id':pid,'model':model_ids[pid],'name':title,'teeth':int(teeth[1]) if teeth else 0,'search':pid in search_ids,'mount':'cross' if pid in search_ids or pid in {'4716','32905','15457','27938'} else 'unclassified','source':'https://library.ldraw.org/library/official/parts/'+pid+'.dat','author':next((l[10:] for l in lines if l.startswith('0 Author: ')),''),'license':next((l[11:] for l in lines if l.startswith('0 !LICENSE ')),''),'file':'parts/'+pid+'.dat'})
for name in ['CAreadme.txt','CAlicense.txt','CAlicense4.txt','LDConfig.ldr']:copy('ldraw/'+name)
manifest={'source':url,'archiveSha256':archive_hash,'retrieved':'2026-10-31','scope':'All unpatterned Technic Gear, Worm Gear and Turntable shape entries (excluding gearbox/block housings) in this pinned official archive; not all historical or unofficial LEGO parts.','parts':entries,'dependencies':sorted(n.removeprefix('ldraw/') for n in used)}
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
(out/'README.txt').write_text('Source: '+url+'\nOriginal .dat files unchanged. Authors, histories and licenses remain in each file.\nDerived STL meshes: triangulated by Three.js LDrawLoader, rotated to Z-up, scaled 0.4 mm/LDU, centered on gear axis.\nLDraw community models, not official LEGO manufacturing drawings. No endorsement by LEGO.\nSee manifest.json and CAreadme.txt, CAlicense.txt, CAlicense4.txt.\n',encoding='utf-8')
print(len(entries),'parts,',len(used),'source files,',sum((out/n.removeprefix('ldraw/')).stat().st_size for n in used),'bytes')
