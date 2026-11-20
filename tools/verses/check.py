import json,re,sys
sys.path.insert(0,'/tmp/v365')
exec(open('/tmp/v365/build.py').read().split("out=[]")[0])
def loose(s):
    s=norm(s); s=re.sub(r'\s','',s)
    for a,b in [('찌','지'),('쌔','새'),('찐','진'),('짜','자'),('쏘','소')]: s=s.replace(a,b)
    return s
def eloose(s): return re.sub(r'[^a-z]','',norm(s).lower())
def get(r):
    m=re.match(r'([가-힣]+)(\d+):(\d+)$',r); return (ab[m[1]],int(m[2]),int(m[3]))
bad=[]
for g,gn,cats in PICK:
  for cid,cn,refs in cats:
    for r in refs.split():
      k=get(r); A=[ko[0][k],ko[2][k]]; Bf=[ko[1][k],ko[3][k]]
      if norm(Bf[0])!=norm(Bf[1]): bad.append(('B내부',r,Bf))
      if len(set(loose(x) for x in Bf+A))>1:
        # 표제(시편 제목) 차이인지
        if loose(A[0]).endswith(loose(Bf[0])) and loose(A[1]).endswith(loose(Bf[0])): pass
        else: bad.append(('뜻 차이',r,[norm(x) for x in A+Bf]))
      E=[en[0][k],en[1][k]]
      if eloose(E[0])!=eloose(E[1]): bad.append(('KJV',r,E))
for b in bad: print(b)
print(len(bad))
for r in ['행1:8','롬10:18','시4:8','요3:16']:
    k=get(r); print(r, norm(ko[1][k]),'|',norm(ko[0][k]))
