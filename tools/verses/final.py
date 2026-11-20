import json,re,sys
sys.path.insert(0,'/tmp/v365')
exec(open('/tmp/v365/build.py').read().split("out=[]")[0])
def clean_en(s):
    s=norm(s); s=re.sub(r'\s+([,;:.?!)])',r'\1',s); return s
out=[]; cats=[]
for g,gn,cs in PICK:
  for cid,cn,refs in cs:
    cats.append(dict(id=cid,name=cn,g=g,gName=gn,n=len(refs.split())))
    for r in refs.split():
      m=re.match(r'([가-힣]+)(\d+):(\d+)$',r); k=(ab[m[1]],int(m[2]),int(m[3])); b=BOOKS[k[0]]
      a=norm(ko[1][k]); assert a==norm(ko[3][k]), r
      e=clean_en(en[0][k])
      if e.upper()==e: e=clean_en(en[1][k])
      out.append(dict(c=cid,r=f'{b[0]} {k[1]}:{k[2]}',t=a,e=e,er=f'{b[3]} {k[1]}:{k[2]}'))
json.dump(dict(cats=cats,verses=out),open('/tmp/v365/final.json','w'),ensure_ascii=False)
print(len(out), sum(c['n'] for c in cats), len(cats))
import collections; print(collections.Counter(c['g'] for c in cats))
print([o for o in out if o['r'].startswith('시편 92')][0])
